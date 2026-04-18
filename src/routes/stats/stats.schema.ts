import { z } from "zod";

export const StatsViewBodySchema = z.object({
  postId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("조회수를 기록할 게시글 ID (없으면 사이트 전체 조회수로 집계)"),
});

export const PopularPostsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe("반환할 인기 게시글 수 (최대 100)"),
  days: z.coerce
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .default(7)
    .describe("집계 기간 (일, 최대 365)"),
});

export const StatsViewResponseSchema = z.object({
  success: z.literal(true).describe("기록 성공 여부"),
  deduplicated: z
    .boolean()
    .describe(
      "중복 요청으로 집계에서 제외되었는지 여부 (5분 이내 동일 IP 재요청)",
    ),
});

export const PostStatsSchema = z.object({
  postId: z.number().describe("게시글 ID"),
  slug: z.string().describe("게시글 슬러그"),
  title: z.string().describe("게시글 제목"),
  pageviews: z.number().describe("페이지뷰 수"),
  uniques: z.number().describe("순 방문자 수"),
});

export const PopularPostsResponseSchema = z.object({
  data: z.array(PostStatsSchema).describe("인기 게시글 목록"),
});

export const TotalViewsResponseSchema = z.object({
  totalPageviews: z.number().describe("사이트 전체 누적 페이지뷰 수"),
});

export const DashboardStatsResponseSchema = z.object({
  todayPageviews: z.number().describe("오늘 페이지뷰 수"),
  weekPageviews: z.number().describe("최근 7일 페이지뷰 수"),
  monthPageviews: z.number().describe("최근 30일 페이지뷰 수"),
  totalPosts: z.number().describe("전체 게시글 수"),
  totalComments: z.number().describe("전체 댓글 수"),
  postsByStatus: z
    .object({
      draft: z.number().describe("임시저장 게시글 수"),
      published: z.number().describe("발행된 게시글 수"),
      archived: z.number().describe("보관된 게시글 수"),
    })
    .describe("상태별 게시글 수"),
});

export type StatsViewBody = z.infer<typeof StatsViewBodySchema>;
export type PopularPostsQuery = z.infer<typeof PopularPostsQuerySchema>;
