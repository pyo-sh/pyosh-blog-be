import { z } from "zod";
import { CommentAuthorSchema } from "@src/routes/comments/comment.schema";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Path Parameter Schemas
 */
export const GuestbookIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Query Parameter Schemas
 */
export const GuestbookQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/**
 * Request Body Schemas
 */

/**
 * OAuth 사용자 방명록 작성 스키마
 */
export const CreateGuestbookOAuthBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "본문은 필수입니다")
    .max(2000, "본문은 2000자를 초과할 수 없습니다"),
  parentId: z.number().int().positive().optional(),
  isSecret: z.boolean().optional().default(false),
});

/**
 * 게스트 사용자 방명록 작성 스키마
 */
export const CreateGuestbookGuestBodySchema =
  CreateGuestbookOAuthBodySchema.extend({
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
  });

/**
 * 게스트 방명록 삭제 스키마
 */
export const DeleteGuestbookGuestBodySchema = z.object({
  guestPassword: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다"),
});

/**
 * Response Schemas
 */

/**
 * 방명록 엔트리 타입 (재사용 CommentAuthor)
 */
export type GuestbookEntryDetailSchemaType = {
  id: number;
  parentId: number | null;
  body: string;
  isSecret: boolean;
  status: "active" | "deleted";
  author: z.infer<typeof CommentAuthorSchema>;
  replies: GuestbookEntryDetailSchemaType[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};

export const GuestbookEntryDetailSchema = z.lazy(() =>
  z.object({
    id: z.number(),
    parentId: z.number().nullable(),
    body: z.string(),
    isSecret: z.boolean(),
    status: z.enum(["active", "deleted"]),
    author: CommentAuthorSchema,
    replies: z.array(GuestbookEntryDetailSchema),
    createdAt: z.string(), // ISO datetime
    updatedAt: z.string(), // ISO datetime
  }),
);

/**
 * 방명록 목록 응답 스키마
 */
export const GuestbookListResponseSchema = z.object({
  data: z.array(GuestbookEntryDetailSchema),
  meta: PaginationMetaSchema,
});

/**
 * 단일 방명록 응답 스키마
 */
export const GuestbookEntryResponseSchema = z.object({
  data: GuestbookEntryDetailSchema,
});

/**
 * Type exports
 */
export type GuestbookIdParam = z.infer<typeof GuestbookIdParamSchema>;
export type GuestbookQuery = z.infer<typeof GuestbookQuerySchema>;
export type CreateGuestbookOAuthBody = z.infer<
  typeof CreateGuestbookOAuthBodySchema
>;
export type CreateGuestbookGuestBody = z.infer<
  typeof CreateGuestbookGuestBodySchema
>;
export type DeleteGuestbookGuestBody = z.infer<
  typeof DeleteGuestbookGuestBodySchema
>;
export type GuestbookEntryDetail = GuestbookEntryDetailSchemaType;
