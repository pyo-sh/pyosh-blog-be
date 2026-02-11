import { eq, and, isNull, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { GuestbookEntryDetail, GuestbookQuery } from "./guestbook.schema";
import type { CommentAuthor } from "@src/routes/comments/comment.schema";
import {
  GuestbookEntry,
  guestbookEntryTable,
  NewGuestbookEntry,
} from "@src/db/schema/guestbook";
import * as schema from "@src/db/schema/index";
import { userTable } from "@src/db/schema/users";
import { HttpError } from "@src/errors/http-error";
import {
  Author,
  buildHierarchy,
  maskSecretContent,
  verifyDeletePermission,
  HierarchicalItem,
  SecretItem,
} from "@src/shared/interaction";
import {
  buildPaginatedResponse,
  calculateOffset,
  PaginatedResponse,
} from "@src/shared/pagination";
import { hashPassword } from "@src/shared/password";

/**
 * 방명록 작성 입력 데이터
 */
export interface CreateGuestbookEntryInput {
  body: string;
  parentId?: number;
  isSecret?: boolean;
}

/**
 * 방명록 조회 옵션
 */
export interface GetGuestbookEntriesOptions extends GuestbookQuery {
  viewerUserId?: number | null;
  viewerIsAdmin?: boolean;
}

/**
 * 내부 방명록 타입 (계층 구조 + 비밀글 속성)
 */
interface GuestbookEntryWithAuthor
  extends GuestbookEntry, HierarchicalItem, SecretItem {
  author: CommentAuthor;
  children?: GuestbookEntryWithAuthor[];
}

/**
 * Guestbook Service
 */
export class GuestbookService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 방명록 작성 (트랜잭션)
   *
   * @param input 방명록 입력 데이터
   * @param author 작성자 정보 (OAuth 또는 Guest)
   * @returns 생성된 방명록 상세 정보
   */
  async createEntry(
    input: CreateGuestbookEntryInput,
    author: Author,
  ): Promise<GuestbookEntryDetail> {
    return await this.db.transaction(async (tx) => {
      // 1. parentId가 있으면 부모 엔트리 검증
      if (input.parentId) {
        const [parent] = await tx
          .select()
          .from(guestbookEntryTable)
          .where(eq(guestbookEntryTable.id, input.parentId))
          .limit(1);

        if (!parent) {
          throw HttpError.notFound("부모 엔트리를 찾을 수 없습니다");
        }
      }

      // 2. author 분기하여 방명록 데이터 생성
      let newEntry: NewGuestbookEntry;

      if (author.type === "oauth") {
        newEntry = {
          parentId: input.parentId ?? null,
          authorType: "oauth",
          oauthAccountId: author.userId,
          guestName: null,
          guestEmail: null,
          guestPasswordHash: null,
          body: input.body,
          isSecret: input.isSecret ?? false,
          status: "active",
        };
      } else {
        // Guest
        const passwordHash = await hashPassword(author.password);

        newEntry = {
          parentId: input.parentId ?? null,
          authorType: "guest",
          oauthAccountId: null,
          guestName: author.name,
          guestEmail: author.email,
          guestPasswordHash: passwordHash,
          body: input.body,
          isSecret: input.isSecret ?? false,
          status: "active",
        };
      }

      // 3. 방명록 삽입
      const [result] = await tx.insert(guestbookEntryTable).values(newEntry);
      const entryId = result.insertId;

      // 4. 생성된 방명록 조회 및 작성자 정보 보강
      const [entry] = await tx
        .select()
        .from(guestbookEntryTable)
        .where(eq(guestbookEntryTable.id, entryId))
        .limit(1);

      if (!entry) {
        throw HttpError.internal("방명록 생성 후 조회 실패");
      }

      // GuestbookEntryDetail 타입으로 직접 변환
      const enrichedEntry = await this.enrichEntryWithAuthor(entry, tx);

      return this.mapToGuestbookEntryDetail(enrichedEntry);
    });
  }

  /**
   * 방명록 목록 조회 (페이지네이션 + 계층 구조)
   *
   * @param options 조회 옵션 (page, limit, viewerUserId, viewerIsAdmin)
   * @returns 페이지네이션된 방명록 목록
   */
  async getEntries(
    options?: GetGuestbookEntriesOptions,
  ): Promise<PaginatedResponse<GuestbookEntryDetail>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = calculateOffset(page, limit);

    // 1. 방명록 조회 (active 상태만, 삭제되지 않은 것)
    const [entries, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(guestbookEntryTable)
        .where(
          and(
            eq(guestbookEntryTable.status, "active"),
            isNull(guestbookEntryTable.deletedAt),
          ),
        )
        .orderBy(guestbookEntryTable.createdAt)
        .limit(limit)
        .offset(offset),

      this.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(guestbookEntryTable)
        .where(
          and(
            eq(guestbookEntryTable.status, "active"),
            isNull(guestbookEntryTable.deletedAt),
          ),
        ),
    ]);

    // 2. 각 방명록에 작성자 정보 보강
    const entriesWithAuthor: GuestbookEntryWithAuthor[] = await Promise.all(
      entries.map((entry) => this.enrichEntryWithAuthor(entry)),
    );

    // 3. 비밀글 마스킹
    const viewerUserId = options?.viewerUserId ?? null;
    const isAdmin = options?.viewerIsAdmin ?? false;

    const maskedEntries = entriesWithAuthor.map((entry) =>
      maskSecretContent(entry, viewerUserId, isAdmin),
    );

    // 4. 계층 구조 변환
    const hierarchicalEntries = buildHierarchy(maskedEntries);

    // 5. GuestbookEntryDetail 타입으로 변환
    const data = hierarchicalEntries.map((entry) =>
      this.mapToGuestbookEntryDetail(entry),
    );

    // 6. 페이지네이션 응답 생성
    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * 방명록 삭제 (Soft delete)
   *
   * @param entryId 방명록 ID
   * @param author 작성자 정보
   * @param isAdmin 관리자 여부
   */
  async deleteEntry(
    entryId: number,
    author: Author | null,
    isAdmin: boolean,
  ): Promise<void> {
    // 1. 방명록 존재 확인
    const [entry] = await this.db
      .select()
      .from(guestbookEntryTable)
      .where(eq(guestbookEntryTable.id, entryId))
      .limit(1);

    if (!entry) {
      throw HttpError.notFound("방명록 엔트리를 찾을 수 없습니다");
    }

    // 2. 삭제 권한 확인
    await verifyDeletePermission(entry, author, isAdmin);

    // 3. Soft delete (status='deleted', deletedAt 설정)
    await this.db
      .update(guestbookEntryTable)
      .set({
        status: "deleted",
        deletedAt: new Date(),
      })
      .where(eq(guestbookEntryTable.id, entryId));
  }

  /**
   * 방명록에 작성자 정보 보강 (private)
   *
   * @param entry 방명록
   * @param tx 트랜잭션 (선택)
   * @returns 작성자 정보가 포함된 방명록
   */
  private async enrichEntryWithAuthor(
    entry: GuestbookEntry,
    tx?: MySql2Database<typeof schema>,
  ): Promise<GuestbookEntryWithAuthor> {
    const db = tx ?? this.db;

    let author: CommentAuthor;

    if (entry.authorType === "oauth" && entry.oauthAccountId) {
      // OAuth 사용자: userTable JOIN
      const [user] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, entry.oauthAccountId))
        .limit(1);

      if (user) {
        author = {
          type: "oauth",
          id: user.id,
          name: user.name,
          avatarUrl: undefined, // imageId 기반 아바타 URL 조회는 미구현
        };
      } else {
        // 사용자를 찾을 수 없으면 기본값
        author = {
          type: "oauth",
          name: "알 수 없음",
        };
      }
    } else {
      // Guest 사용자: 방명록 필드 직접 사용
      author = {
        type: "guest",
        name: entry.guestName ?? "익명",
        email: entry.guestEmail ?? undefined,
      };
    }

    return {
      ...entry,
      author,
      children: [],
    };
  }

  /**
   * GuestbookEntryWithAuthor를 GuestbookEntryDetail로 변환 (private)
   *
   * @param entry 작성자 정보가 포함된 방명록
   * @returns GuestbookEntryDetail
   */
  private mapToGuestbookEntryDetail(
    entry: GuestbookEntryWithAuthor,
  ): GuestbookEntryDetail {
    return {
      id: entry.id,
      parentId: entry.parentId,
      body: entry.body,
      isSecret: entry.isSecret,
      status: entry.status as "active" | "deleted",
      author: entry.author,
      replies: (entry.children ?? []).map((child) =>
        this.mapToGuestbookEntryDetail(child),
      ),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
