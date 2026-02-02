import { z } from "zod";

/**
 * Path Parameter Schemas
 */
export const PostIdParamSchema = z.object({
  postId: z.coerce.number().int().positive(),
});

export const CommentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
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
    .max(2000, "본문은 2000자를 초과할 수 없습니다"),
  parentId: z.number().int().positive().optional(),
  replyToCommentId: z.number().int().positive().optional(),
  isSecret: z.boolean().optional().default(false),
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
      .max(50, "이름은 50자를 초과할 수 없습니다"),
    guestEmail: z
      .string()
      .email("유효한 이메일 주소를 입력하세요")
      .max(100, "이메일은 100자를 초과할 수 없습니다"),
    guestPassword: z
      .string()
      .min(4, "비밀번호는 최소 4자 이상이어야 합니다")
      .max(100, "비밀번호는 100자를 초과할 수 없습니다"),
  },
);

/**
 * 게스트 댓글 삭제 스키마
 */
export const DeleteCommentGuestBodySchema = z.object({
  guestPassword: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다"),
});

/**
 * Response Schemas
 */

/**
 * 댓글 작성자 스키마
 */
export const CommentAuthorSchema = z.object({
  type: z.enum(["oauth", "guest"]),
  id: z.number().optional(), // OAuth 사용자 ID
  name: z.string(),
  email: z.string().optional(), // 게스트 이메일 (선택적)
  avatarUrl: z.string().optional(), // OAuth 사용자 아바타
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
    id: z.number(),
    postId: z.number(),
    parentId: z.number().nullable(),
    depth: z.number(),
    body: z.string(),
    isSecret: z.boolean(),
    status: z.enum(["active", "deleted"]),
    author: CommentAuthorSchema,
    replyToName: z.string().nullable(),
    replies: z.array(CommentDetailSchema),
    createdAt: z.string(), // ISO datetime
    updatedAt: z.string(), // ISO datetime
  }),
);

/**
 * 댓글 목록 응답 스키마
 */
export const CommentsResponseSchema = z.object({
  data: z.array(CommentDetailSchema),
});

/**
 * 단일 댓글 응답 스키마
 */
export const CommentResponseSchema = z.object({
  data: CommentDetailSchema,
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
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;
export type CommentDetail = CommentDetailSchemaType;
