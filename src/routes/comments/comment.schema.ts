import { z } from "zod";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Path Parameter Schemas
 */
export const PostIdParamSchema = z.object({
  postId: z.coerce.number().int().positive().describe("게시글 ID"),
});

export const CommentIdParamSchema = z.object({
  id: z.coerce.number().int().positive().describe("댓글 ID"),
});

/**
 * Request Body Schemas
 */

/**
 * OAuth 사용자 댓글 작성 스키마
 */
export const CreateCommentOAuthBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "본문은 필수입니다")
    .max(2000, "본문은 2000자를 초과할 수 없습니다")
    .describe("댓글 본문 (최대 2000자)"),
  parentId: z.number().int().positive().optional().describe("부모 댓글 ID (답글인 경우)"),
  replyToCommentId: z.number().int().positive().optional().describe("답글 대상 댓글 ID"),
  isSecret: z.boolean().optional().default(false).describe("비밀 댓글 여부"),
});

/**
 * 게스트 사용자 댓글 작성 스키마
 */
export const CreateCommentGuestBodySchema = CreateCommentOAuthBodySchema.extend(
  {
    guestName: z
      .string()
      .trim()
      .min(1, "이름은 필수입니다")
      .max(50, "이름은 50자를 초과할 수 없습니다")
      .describe("게스트 이름 (최대 50자)"),
    guestEmail: z
      .string()
      .email("유효한 이메일 주소를 입력하세요")
      .max(100, "이메일은 100자를 초과할 수 없습니다")
      .describe("게스트 이메일"),
    guestPassword: z
      .string()
      .min(4, "비밀번호는 최소 4자 이상이어야 합니다")
      .max(100, "비밀번호는 100자를 초과할 수 없습니다")
      .describe("게스트 비밀번호 (댓글 삭제 시 필요, 최소 4자)"),
  },
);

/**
 * 게스트 댓글 삭제 스키마
 */
export const DeleteCommentGuestBodySchema = z.object({
  guestPassword: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").describe("게스트 비밀번호"),
});

/**
 * Public 댓글 목록 쿼리 스키마
 */
export const CommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10).describe("페이지당 루트 댓글 수 (최대 50)"),
});

/**
 * Response Schemas
 */

/**
 * 댓글 작성자 스키마
 */
export const CommentAuthorSchema = z.object({
  type: z.enum(["oauth", "guest"]).describe("작성자 유형"),
  id: z.number().optional().describe("OAuth 사용자 ID"),
  name: z.string().describe("작성자 이름"),
  email: z.string().optional().describe("게스트 이메일"),
  avatarUrl: z.string().optional().describe("OAuth 사용자 아바타 URL"),
});

/**
 * 댓글 상세 스키마 (재귀적 구조)
 */
export type CommentDetailSchemaType = {
  id: number;
  postId: number;
  parentId: number | null;
  depth: number;
  body: string;
  isSecret: boolean;
  status: "active" | "deleted";
  author: z.infer<typeof CommentAuthorSchema>;
  replyToName: string | null;
  replies: CommentDetailSchemaType[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};

export const CommentDetailSchema = z.lazy(() =>
  z.object({
    id: z.number().describe("댓글 ID"),
    postId: z.number().describe("게시글 ID"),
    parentId: z.number().nullable().describe("부모 댓글 ID (루트 댓글이면 null)"),
    depth: z.number().describe("댓글 깊이 (0 = 루트)"),
    body: z.string().describe("댓글 본문"),
    isSecret: z.boolean().describe("비밀 댓글 여부"),
    status: z.enum(["active", "deleted"]).describe("댓글 상태"),
    author: CommentAuthorSchema,
    replyToName: z.string().nullable().describe("답글 대상 작성자 이름"),
    replies: z.array(CommentDetailSchema).describe("답글 목록"),
    createdAt: z.string().describe("작성일 (ISO 8601)"),
    updatedAt: z.string().describe("수정일 (ISO 8601)"),
  }),
);

/**
 * Public 댓글 목록 페이지네이션 메타 스키마
 */
export const CommentsPaginationMetaSchema = z.object({
  page: z.number().describe("현재 페이지 번호"),
  limit: z.number().describe("페이지당 루트 댓글 수"),
  totalCount: z.number().describe("전체 댓글 수 (답글 포함)"),
  totalRootComments: z.number().describe("전체 루트 댓글 수"),
  totalPages: z.number().describe("전체 페이지 수"),
});

/**
 * 댓글 목록 응답 스키마 (페이지네이션 포함)
 */
export const CommentsResponseSchema = z.object({
  data: z.array(CommentDetailSchema),
  meta: CommentsPaginationMetaSchema,
});

/**
 * 단일 댓글 응답 스키마
 */
export const CommentResponseSchema = z.object({
  data: CommentDetailSchema,
});

/**
 * 관리자 댓글 목록 쿼리 스키마
 */
export const AdminCommentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).describe("페이지당 항목 수 (최대 100)"),
  postId: z.coerce.number().int().positive().optional().describe("게시글 ID로 필터"),
  status: z.enum(["active", "deleted", "hidden"]).optional().describe("댓글 상태 필터"),
  authorType: z.enum(["oauth", "guest"]).optional().describe("작성자 유형 필터"),
  startDate: z.string().optional().describe("시작일 (ISO 8601)"),
  endDate: z.string().optional().describe("종료일 (ISO 8601)"),
  sort: z.enum(["created_at"]).optional().default("created_at").describe("정렬 기준"),
  order: z.enum(["asc", "desc"]).optional().default("desc").describe("정렬 방향"),
});

/**
 * 관리자 댓글 아이템 스키마 (flat, 비밀글 마스킹 없음, post.title 포함)
 */
export const AdminCommentItemSchema = z.object({
  id: z.number().describe("댓글 ID"),
  postId: z.number().describe("게시글 ID"),
  parentId: z.number().nullable().describe("부모 댓글 ID"),
  depth: z.number().describe("댓글 깊이"),
  body: z.string().describe("댓글 본문"),
  isSecret: z.boolean().describe("비밀 댓글 여부"),
  status: z.enum(["active", "deleted", "hidden"]).describe("댓글 상태"),
  author: CommentAuthorSchema,
  replyToName: z.string().nullable().describe("답글 대상 작성자 이름"),
  post: z.object({ id: z.number().describe("게시글 ID"), title: z.string().describe("게시글 제목") }).describe("댓글이 속한 게시글"),
  createdAt: z.string().describe("작성일 (ISO 8601)"),
  updatedAt: z.string().describe("수정일 (ISO 8601)"),
});

/**
 * 관리자 댓글 목록 응답 스키마
 */
export const AdminCommentListResponseSchema = z.object({
  data: z.array(AdminCommentItemSchema),
  meta: PaginationMetaSchema,
});

/**
 * 관리자 댓글 스레드 응답 스키마 (부모 + 답글)
 */
export const AdminCommentThreadResponseSchema = z.object({
  parent: AdminCommentItemSchema,
  replies: z.array(AdminCommentItemSchema).describe("답글 목록"),
});

/**
 * 관리자 댓글 삭제 쿼리 스키마
 */
export const AdminCommentDeleteQuerySchema = z.object({
  action: z.enum(["soft_delete", "hard_delete"]).default("soft_delete").describe("삭제 방식 (soft_delete: 복원 가능, hard_delete: 영구 삭제)"),
});

/**
 * 관리자 댓글 복원 응답 스키마
 */
export const AdminCommentRestoreResponseSchema = z.object({
  success: z.literal(true).describe("복원 성공 여부"),
});

/**
 * 관리자 벌크 삭제/복원 요청 바디 스키마
 */
export const AdminCommentBulkBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100).describe("대상 댓글 ID 배열 (최대 100개)"),
  action: z.enum(["restore", "soft_delete", "hard_delete"]).describe("수행할 작업"),
});

/**
 * Type exports
 */
export type PostIdParam = z.infer<typeof PostIdParamSchema>;
export type CommentIdParam = z.infer<typeof CommentIdParamSchema>;
export type CreateCommentOAuthBody = z.infer<
  typeof CreateCommentOAuthBodySchema
>;
export type CreateCommentGuestBody = z.infer<
  typeof CreateCommentGuestBodySchema
>;
export type DeleteCommentGuestBody = z.infer<
  typeof DeleteCommentGuestBodySchema
>;
export type CommentsQuery = z.infer<typeof CommentsQuerySchema>;
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;
export type CommentDetail = CommentDetailSchemaType;
export type AdminCommentListQuery = z.infer<typeof AdminCommentListQuerySchema>;
export type AdminCommentItem = z.infer<typeof AdminCommentItemSchema>;
export type AdminCommentDeleteQuery = z.infer<
  typeof AdminCommentDeleteQuerySchema
>;
export type AdminCommentBulkBody = z.infer<typeof AdminCommentBulkBodySchema>;
