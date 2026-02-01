import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PostSlugParamSchema,
  PostIdParamSchema,
  PostListQuerySchema,
  CreatePostBodySchema,
  UpdatePostBodySchema,
  PostListResponseSchema,
  PostDetailResponseSchema,
  PostDetailWithNavigationResponseSchema,
} from "./post.schema";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/services/admin.service";
import { PostService } from "@src/services/post.service";

/**
 * Post 라우트 플러그인 (Public)
 */
export function createPostRoute(postService: PostService): FastifyPluginAsync {
  const postRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/posts - 게시글 목록 조회 (Public)
    typedFastify.get(
      "/",
      {
        schema: {
          tags: ["posts"],
          summary: "Get published posts (Public)",
          description:
            "공개된 게시글 목록을 조회합니다. status=published, visibility=public, deleted_at IS NULL만 반환됩니다.",
          querystring: PostListQuerySchema,
          response: {
            200: PostListResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const query = request.query;

        // Public API: status=published, visibility=public만 조회
        const result = await postService.getPostList({
          ...query,
          status: "published",
          visibility: "public",
          includeDeleted: false,
        });

        // Date 객체를 ISO 문자열로 변환
        const data = result.data.map((post) => ({
          ...post,
          publishedAt: post.publishedAt?.toISOString() ?? null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          deletedAt: post.deletedAt?.toISOString() ?? null,
        }));

        return reply.status(200).send({
          data,
          meta: result.meta,
        });
      },
    );

    // GET /api/posts/:slug - 게시글 상세 조회 (Public)
    typedFastify.get(
      "/:slug",
      {
        schema: {
          tags: ["posts"],
          summary: "Get post by slug (Public)",
          description:
            "slug로 게시글을 조회합니다. 이전/다음 글 정보도 함께 반환됩니다. status=published, visibility=public만 조회됩니다.",
          params: PostSlugParamSchema,
          response: {
            200: PostDetailWithNavigationResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { slug } = request.params;

        const result = await postService.getPostBySlug(slug);

        return reply.status(200).send({
          post: {
            ...result.post,
            publishedAt: result.post.publishedAt?.toISOString() ?? null,
            createdAt: result.post.createdAt.toISOString(),
            updatedAt: result.post.updatedAt.toISOString(),
            deletedAt: result.post.deletedAt?.toISOString() ?? null,
          },
          prevPost: result.prevPost,
          nextPost: result.nextPost,
        });
      },
    );

    fastify.log.info("[Post Public Routes] Registered");
  };

  return postRoute;
}

/**
 * Post 라우트 플러그인 (Admin)
 */
export function createAdminPostRoute(
  postService: PostService,
  adminService: AdminService,
): FastifyPluginAsync {
  const adminPostRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/admin/posts - 게시글 목록 조회 (Admin)
    typedFastify.get(
      "/",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Get all posts (Admin)",
          description:
            "모든 게시글 목록을 조회합니다. status, visibility, deleted 상태와 무관하게 조회 가능합니다.",
          querystring: PostListQuerySchema,
          response: {
            200: PostListResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const query = request.query;

        const result = await postService.getPostList(query);

        // Date 객체를 ISO 문자열로 변환
        const data = result.data.map((post) => ({
          ...post,
          publishedAt: post.publishedAt?.toISOString() ?? null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          deletedAt: post.deletedAt?.toISOString() ?? null,
        }));

        return reply.status(200).send({
          data,
          meta: result.meta,
        });
      },
    );

    // GET /api/admin/posts/:id - 게시글 상세 조회 (Admin)
    typedFastify.get(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Get post by ID (Admin)",
          description:
            "ID로 게시글을 조회합니다. 모든 상태의 게시글을 조회할 수 있습니다.",
          params: PostIdParamSchema,
          response: {
            200: PostDetailResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        const post = await postService.getPostById(id);

        return reply.status(200).send({
          post: {
            ...post,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            deletedAt: post.deletedAt?.toISOString() ?? null,
          },
        });
      },
    );

    // POST /api/admin/posts - 게시글 생성 (Admin)
    typedFastify.post(
      "/",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Create post (Admin)",
          description:
            "새 게시글을 생성합니다. 태그는 자동으로 생성/연결됩니다.",
          body: CreatePostBodySchema,
          response: {
            201: PostDetailResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const body = request.body;

        // publishedAt이 문자열로 전달된 경우 Date로 변환
        const post = await postService.createPost({
          title: body.title,
          contentMd: body.contentMd,
          categoryId: body.categoryId,
          thumbnailAssetId: body.thumbnailAssetId,
          visibility: body.visibility,
          status: body.status,
          tags: body.tags,
          publishedAt: body.publishedAt
            ? new Date(body.publishedAt)
            : undefined,
        });

        return reply.status(201).send({
          post: {
            ...post,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            deletedAt: post.deletedAt?.toISOString() ?? null,
          },
        });
      },
    );

    // PATCH /api/admin/posts/:id - 게시글 수정 (Admin)
    typedFastify.patch(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Update post (Admin)",
          description:
            "게시글을 수정합니다. 수정할 필드만 전달하면 됩니다. tags를 전달하면 기존 태그를 덮어씁니다.",
          params: PostIdParamSchema,
          body: UpdatePostBodySchema,
          response: {
            200: PostDetailResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const body = request.body;

        // publishedAt이 문자열로 전달된 경우 Date로 변환
        const input = {
          ...body,
          publishedAt: body.publishedAt
            ? new Date(body.publishedAt)
            : undefined,
        };

        const post = await postService.updatePost(id, input);

        return reply.status(200).send({
          post: {
            ...post,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            deletedAt: post.deletedAt?.toISOString() ?? null,
          },
        });
      },
    );

    // DELETE /api/admin/posts/:id - 게시글 Soft Delete (Admin)
    typedFastify.delete(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Delete post (Soft Delete) (Admin)",
          description:
            "게시글을 Soft Delete합니다. deletedAt 타임스탬프가 설정됩니다.",
          params: PostIdParamSchema,
          response: {
            204: z.void(),
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        await postService.deletePost(id);

        return reply.status(204).send();
      },
    );

    // PUT /api/admin/posts/:id/restore - 게시글 복원 (Admin)
    typedFastify.put(
      "/:id/restore",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Restore deleted post (Admin)",
          description: "Soft Delete된 게시글을 복원합니다.",
          params: PostIdParamSchema,
          response: {
            200: PostDetailResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        const post = await postService.restorePost(id);

        return reply.status(200).send({
          post: {
            ...post,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            deletedAt: post.deletedAt?.toISOString() ?? null,
          },
        });
      },
    );

    // DELETE /api/admin/posts/:id/hard - 게시글 Hard Delete (Admin)
    typedFastify.delete(
      "/:id/hard",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["posts", "admin"],
          summary: "Hard delete post (Admin)",
          description:
            "게시글을 완전히 삭제합니다. 복구할 수 없습니다. 연결된 태그 관계도 삭제됩니다.",
          params: PostIdParamSchema,
          response: {
            204: z.void(),
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        await postService.hardDeletePost(id);

        return reply.status(204).send();
      },
    );

    fastify.log.info("[Post Admin Routes] Registered");
  };

  return adminPostRoute;
}
