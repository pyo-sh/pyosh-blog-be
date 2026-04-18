import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { commentTable } from "@src/db/schema/comments";
import * as schema from "@src/db/schema/index";
import { postTable } from "@src/db/schema/posts";
import { statsDailyTable } from "@src/db/schema/stats";
import { HttpError } from "@src/errors/http-error";

export interface PopularPostStat {
  postId: number;
  slug: string;
  title: string;
  pageviews: number;
  uniques: number;
}

export interface DashboardStats {
  todayPageviews: number;
  weekPageviews: number;
  monthPageviews: number;
  totalPosts: number;
  totalComments: number;
  postsByStatus: { draft: number; published: number; archived: number };
}

/**
 * 페이지뷰 집계 서비스
 */
export class StatsService {
  private readonly dedupeWindowMs = 5 * 60 * 1000;
  private readonly recentViews = new Map<string, number>();

  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 페이지뷰 증가 (동일 IP 5분 이내 중복 방지, KST 기준 날짜)
   * postId가 없으면 사이트 전체 조회수로 기록
   * @returns 중복 차단 여부
   */
  async incrementPageView(
    postId: number | undefined,
    ip: string,
  ): Promise<boolean> {
    const normalizedIp = ip.trim();
    if (!normalizedIp) {
      throw HttpError.badRequest("유효한 IP가 필요합니다");
    }

    if (postId !== undefined) {
      const [post] = await this.db
        .select({ id: postTable.id })
        .from(postTable)
        .where(
          and(
            eq(postTable.id, postId),
            eq(postTable.status, "published"),
            eq(postTable.visibility, "public"),
            isNull(postTable.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw HttpError.notFound("게시글을 찾을 수 없습니다");
      }
    }

    const now = Date.now();
    this.pruneExpiredViews(now);

    const targetKey = postId !== undefined ? String(postId) : "site";
    const key = `${targetKey}:${normalizedIp}`;
    const lastViewedAt = this.recentViews.get(key);

    if (lastViewedAt && now - lastViewedAt < this.dedupeWindowMs) {
      return true;
    }

    // KST(UTC+9) 기준 날짜 사용. postId=0은 사이트 전체 조회수 센티넬 값
    // (NULL은 MySQL unique index에서 NULL≠NULL 처리되어 중복키 업데이트가 동작하지 않음)
    await this.db
      .insert(statsDailyTable)
      .values({
        postId: postId ?? 0,
        date: sql`DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'))`,
        pageviews: 1,
        uniques: 1,
      })
      .onDuplicateKeyUpdate({
        set: {
          pageviews: sql`${statsDailyTable.pageviews} + 1`,
          uniques: sql`${statsDailyTable.uniques} + 1`,
        },
      });

    this.recentViews.set(key, now);

    return false;
  }

  /**
   * 특정 게시글 누적 조회수/고유 방문수
   */
  async getPostStats(
    postId: number,
  ): Promise<{ pageviews: number; uniques: number }> {
    const [result] = await this.db
      .select({
        pageviews: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
        uniques: sql<number>`coalesce(sum(${statsDailyTable.uniques}), 0)`,
      })
      .from(statsDailyTable)
      .where(eq(statsDailyTable.postId, postId));

    return {
      pageviews: Number(result?.pageviews ?? 0),
      uniques: Number(result?.uniques ?? 0),
    };
  }

  /**
   * 사이트 전체 누적 조회수 (postId=0 센티넬 행의 합산)
   */
  async getTotalViews(): Promise<number> {
    const [result] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
      })
      .from(statsDailyTable)
      .where(eq(statsDailyTable.postId, 0));

    return Number(result?.total ?? 0);
  }

  /**
   * 최근 N일간 인기 게시글
   */
  async getPopularPosts(limit = 10, days = 7): Promise<PopularPostStat[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeDays = Math.min(Math.max(days, 1), 365);
    const fromDate = this.startOfDay(
      this.subtractDays(new Date(), safeDays - 1),
    );

    const rows = await this.db
      .select({
        postId: postTable.id,
        slug: postTable.slug,
        title: postTable.title,
        pageviews: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
        uniques: sql<number>`coalesce(sum(${statsDailyTable.uniques}), 0)`,
      })
      .from(statsDailyTable)
      .innerJoin(postTable, eq(postTable.id, statsDailyTable.postId))
      .where(
        and(
          gte(statsDailyTable.date, fromDate),
          eq(postTable.status, "published"),
          eq(postTable.visibility, "public"),
          isNull(postTable.deletedAt),
        ),
      )
      .groupBy(postTable.id, postTable.slug, postTable.title)
      .orderBy(desc(sql`sum(${statsDailyTable.pageviews})`), desc(postTable.id))
      .limit(safeLimit);

    return rows.map((row) => ({
      postId: row.postId,
      slug: row.slug,
      title: row.title,
      pageviews: Number(row.pageviews ?? 0),
      uniques: Number(row.uniques ?? 0),
    }));
  }

  /**
   * 관리자 대시보드 통계
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    const todayDate = this.startOfDay(today);
    const weekDate = this.startOfDay(this.subtractDays(today, 6));
    const monthDate = this.startOfDay(this.subtractDays(today, 29));

    const [
      todayView,
      weekView,
      monthView,
      postCount,
      commentCount,
      postsByStatus,
    ] = await Promise.all([
      this.db
        .select({
          value: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
        })
        .from(statsDailyTable)
        .where(eq(statsDailyTable.date, todayDate)),
      this.db
        .select({
          value: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
        })
        .from(statsDailyTable)
        .where(gte(statsDailyTable.date, weekDate)),
      this.db
        .select({
          value: sql<number>`coalesce(sum(${statsDailyTable.pageviews}), 0)`,
        })
        .from(statsDailyTable)
        .where(gte(statsDailyTable.date, monthDate)),
      this.db
        .select({ value: sql<number>`count(*)` })
        .from(postTable)
        .where(isNull(postTable.deletedAt)),
      this.db
        .select({ value: sql<number>`count(*)` })
        .from(commentTable)
        .where(
          and(
            eq(commentTable.status, "active"),
            isNull(commentTable.deletedAt),
          ),
        ),
      this.db
        .select({
          status: postTable.status,
          count: sql<number>`count(*)`,
        })
        .from(postTable)
        .where(isNull(postTable.deletedAt))
        .groupBy(postTable.status),
    ]);

    const statusCounts = { draft: 0, published: 0, archived: 0 };
    for (const row of postsByStatus) {
      statusCounts[row.status] = Number(row.count);
    }

    return {
      todayPageviews: Number(todayView[0]?.value ?? 0),
      weekPageviews: Number(weekView[0]?.value ?? 0),
      monthPageviews: Number(monthView[0]?.value ?? 0),
      totalPosts: Number(postCount[0]?.value ?? 0),
      totalComments: Number(commentCount[0]?.value ?? 0),
      postsByStatus: statusCounts,
    };
  }

  private pruneExpiredViews(now: number): void {
    for (const [key, timestamp] of this.recentViews.entries()) {
      if (now - timestamp >= this.dedupeWindowMs) {
        this.recentViews.delete(key);
      }
    }
  }

  private subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);

    return result;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);

    return result;
  }
}
