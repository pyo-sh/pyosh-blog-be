import { FastifyRequest } from "fastify";
import { verifyPassword } from "./password";
import { OAuthAccount } from "@src/db/schema/oauth-accounts";
import { HttpError } from "@src/errors/http-error";

/**
 * OAuth 작성자 타입
 */
export interface OAuthAuthor {
  type: "oauth";
  userId: number;
}

/**
 * 게스트 작성자 타입
 */
export interface GuestAuthor {
  type: "guest";
  name: string;
  email: string;
  password: string;
}

/**
 * 작성자 타입 (OAuth 또는 게스트)
 */
export type Author = OAuthAuthor | GuestAuthor;

/**
 * 계층 구조를 가진 아이템 인터페이스
 */
export interface HierarchicalItem {
  id: number;
  parentId: number | null;
  children?: HierarchicalItem[];
}

/**
 * 비밀글 아이템 인터페이스
 */
export interface SecretItem {
  isSecret: boolean;
  body: string;
  authorType: "oauth" | "guest";
  oauthAccountId: number | null;
}

/**
 * 삭제 권한 확인용 아이템 인터페이스
 */
export interface DeletableItem {
  authorType: "oauth" | "guest";
  oauthAccountId: number | null;
  guestPasswordHash: string | null;
}

/**
 * request에서 작성자 정보 추출
 * OAuth 사용자면 userId 반환, 아니면 null
 *
 * @param request FastifyRequest
 * @returns OAuthAuthor 또는 null
 */
export function resolveAuthorFromRequest(
  request: FastifyRequest,
): OAuthAuthor | null {
  if (request.user) {
    return {
      type: "oauth",
      userId: (request.user as OAuthAccount).id,
    };
  }

  return null;
}

/**
 * Flat 리스트를 계층 구조로 변환 (O(n) 알고리즘)
 *
 * @param flatList 평면 리스트
 * @returns 계층 구조 리스트 (최상위 항목만 포함, children에 하위 항목)
 */
export function buildHierarchy<T extends HierarchicalItem>(flatList: T[]): T[] {
  // ID로 빠른 조회를 위한 Map
  const itemMap = new Map<number, T>();
  const rootItems: T[] = [];

  // 1단계: 모든 항목을 Map에 추가하고 children 배열 초기화
  flatList.forEach((item) => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  // 2단계: 각 항목을 부모에 연결하거나 루트 목록에 추가
  flatList.forEach((item) => {
    const currentItem = itemMap.get(item.id)!;

    if (item.parentId === null) {
      // 최상위 항목
      rootItems.push(currentItem);
    } else {
      // 하위 항목 - 부모의 children에 추가
      const parent = itemMap.get(item.parentId);
      if (parent) {
        parent.children!.push(currentItem);
      } else {
        // 부모를 찾을 수 없으면 루트로 처리
        rootItems.push(currentItem);
      }
    }
  });

  return rootItems;
}

/**
 * 비밀글 마스킹 처리
 * 작성자 또는 관리자가 아니면 body를 "비밀 댓글입니다"로 마스킹
 *
 * @param item 마스킹할 항목
 * @param viewerUserId 현재 조회자 ID (OAuth 사용자)
 * @param isAdmin 관리자 여부
 * @returns 마스킹된 항목
 */
export function maskSecretContent<T extends SecretItem>(
  item: T,
  viewerUserId: number | null,
  isAdmin: boolean,
): T {
  // 비밀글이 아니면 그대로 반환
  if (!item.isSecret) {
    return item;
  }

  // 관리자면 볼 수 있음
  if (isAdmin) {
    return item;
  }

  // OAuth 작성자이고, 본인이면 볼 수 있음
  if (
    item.authorType === "oauth" &&
    item.oauthAccountId !== null &&
    item.oauthAccountId === viewerUserId
  ) {
    return item;
  }

  // 권한이 없으면 마스킹
  return {
    ...item,
    body: "This comment is secret.",
  };
}

/**
 * 삭제 권한 확인
 * - OAuth 사용자: 본인만 삭제 가능
 * - 게스트: 비밀번호 검증
 * - 관리자: 모든 항목 삭제 가능
 *
 * @param item 삭제할 항목
 * @param author 작성자 정보
 * @param isAdmin 관리자 여부
 * @throws HttpError.forbidden 권한이 없는 경우
 */
export async function verifyDeletePermission(
  item: DeletableItem,
  author: Author | null,
  isAdmin: boolean,
): Promise<void> {
  // 관리자는 모든 항목 삭제 가능
  if (isAdmin) {
    return;
  }

  // author가 없으면 권한 없음
  if (!author) {
    throw HttpError.forbidden("Insufficient permissions.");
  }

  // OAuth 사용자
  if (author.type === "oauth") {
    // OAuth 항목이고, 본인 항목인지 확인
    if (item.authorType === "oauth" && item.oauthAccountId === author.userId) {
      return;
    }
    throw HttpError.forbidden("You can only delete your own items.");
  }

  // 게스트 사용자
  if (author.type === "guest") {
    // 게스트 항목인지 확인
    if (item.authorType !== "guest" || !item.guestPasswordHash) {
      throw HttpError.forbidden("This item was not written by a guest.");
    }

    // 비밀번호 검증
    const isValid = await verifyPassword(
      item.guestPasswordHash,
      author.password,
    );
    if (!isValid) {
      throw HttpError.forbidden("Incorrect password.");
    }

    return;
  }

  throw HttpError.forbidden("Insufficient permissions.");
}
