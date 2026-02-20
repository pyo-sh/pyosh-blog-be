import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  DashboardStatsResponseSchema,
  PopularPostsQuerySchema,
  PopularPostsResponseSchema,
  StatsViewBodySchema,
  StatsViewResponseSchema,
} from "./stats.schema";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { StatsService } from "@src/services/stats.service";

/**
 * Stats 라우트 플러그인 (Public)
 */
export function createStatsRoute(
  statsService: StatsService,
): FastifyPluginAsync {
  const statsRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // POST /api/stats/view - 페이지 조회수 기록
    typedFastify.post(
      "/view",
      {
        config: {
          rateLimit: {
            max: 30,
            timeWindow: "1 minute",
          },
        },
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["stats"],
          summary: "조회수 기록",
          description:
            "게시글 조회수를 기록합니다. 동일 IP의 5분 이내 중복 요청은 집계에서 제외됩니다.",
          body: StatsViewBodySchema,
          response: {
            200: StatsViewResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { postId } = request.body;

        const deduplicated = await statsService.incrementPageView(
          postId,
          request.ip,
        );

        return reply.status(200).send({
          success: true,
          deduplicated,
        });
      },
    );

    // GET /api/stats/popular - 인기 게시글 조회
    typedFastify.get(
      "/popular",
      {
        schema: {
          tags: ["stats"],
          summary: "인기 게시글 조회",
          description: "최근 N일간 조회수 기준 인기 게시글 목록을 반환합니다.",
          querystring: PopularPostsQuerySchema,
          response: {
            200: PopularPostsResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { limit, days } = request.query;

        const data = await statsService.getPopularPosts(limit, days);

        return reply.status(200).send({ data });
      },
    );

    fastify.log.info("[Stats Routes] Registered");
  };

  return statsRoute;
}

/**
 * Stats 관리자 라우트 플러그인 (Admin)
 */
export function createAdminStatsRoute(
  statsService: StatsService,
  adminService: AdminService,
): FastifyPluginAsync {
  const adminStatsRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/admin/stats/dashboard - 통계 대시보드
    typedFastify.get(
      "/dashboard",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["admin", "stats"],
          summary: "대시보드 통계",
          description:
            "오늘/최근 7일/최근 30일 조회수와 총 게시글/댓글 수를 반환합니다.",
          response: {
            200: DashboardStatsResponseSchema,
            403: z.object({
              statusCode: z.number(),
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (_request, reply) => {
        const data = await statsService.getDashboardStats();

        return reply.status(200).send(data);
      },
    );
  };

  return adminStatsRoute;
}
