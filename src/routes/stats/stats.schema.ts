import { z } from "zod";

export const StatsViewBodySchema = z.object({
  postId: z.coerce.number().int().positive(),
});

export const PopularPostsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  days: z.coerce.number().int().positive().max(365).optional().default(7),
});

export const StatsViewResponseSchema = z.object({
  success: z.literal(true),
  deduplicated: z.boolean(),
});

export const PostStatsSchema = z.object({
  postId: z.number(),
  slug: z.string(),
  title: z.string(),
  pageviews: z.number(),
  uniques: z.number(),
});

export const PopularPostsResponseSchema = z.object({
  data: z.array(PostStatsSchema),
});

export const DashboardStatsResponseSchema = z.object({
  todayPageviews: z.number(),
  weekPageviews: z.number(),
  monthPageviews: z.number(),
  totalPosts: z.number(),
  totalComments: z.number(),
});

export type StatsViewBody = z.infer<typeof StatsViewBodySchema>;
export type PopularPostsQuery = z.infer<typeof PopularPostsQuerySchema>;
