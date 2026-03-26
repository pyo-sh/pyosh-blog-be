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
 * 관리자 방명록 목록 쿼리 스키마
 */
export const AdminGuestbookListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(["active", "deleted", "hidden"]).optional(),
  authorType: z.enum(["oauth", "guest"]).optional(),
  q: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * 관리자 방명록 단건 삭제 쿼리 스키마 (DELETE - 비가역적 액션만)
 * hide는 PATCH /api/admin/guestbook/:id를 사용
 */
export const AdminGuestbookDeleteQuerySchema = z.object({
  action: z.enum(["soft_delete", "hard_delete"]),
});

/**
 * 관리자 방명록 단건 상태 변경 쿼리 스키마 (PATCH - 가역적 액션)
 */
export const AdminGuestbookPatchQuerySchema = z.object({
  action: z.enum(["hide"]),
});

/**
 * 관리자 방명록 벌크 삭제 요청 스키마 (DELETE - 비가역적 액션만)
 * - soft_delete: status=deleted, deletedAt 설정
 * - hard_delete: DB에서 완전 삭제
 * hide/restore는 PATCH /api/admin/guestbook/bulk를 사용
 * 최대 100개까지 처리 가능
 */
export const AdminGuestbookBulkDeleteBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["soft_delete", "hard_delete"]),
});

/**
 * 관리자 방명록 벌크 상태 변경 요청 스키마 (PATCH - 가역적 액션)
 * - hide: status=hidden (공개 목록에서만 숨김)
 * - restore: 모든 상태(hidden, deleted)에서 status=active, deletedAt=null로 복원
 * 최대 100개까지 처리 가능
 */
export const AdminGuestbookBulkPatchBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["hide", "restore"]),
});

/**
 * 관리자 방명록 아이템 스키마 (flat, 비밀글 마스킹 없음)
 */
export const AdminGuestbookItemSchema = z.object({
  id: z.number(),
  parentId: z.number().nullable(),
  body: z.string(),
  isSecret: z.boolean(),
  status: z.enum(["active", "deleted", "hidden"]),
  author: CommentAuthorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * 관리자 방명록 목록 응답 스키마
 */
export const AdminGuestbookListResponseSchema = z.object({
  data: z.array(AdminGuestbookItemSchema),
  meta: PaginationMetaSchema,
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
export type AdminGuestbookListQuery = z.infer<
  typeof AdminGuestbookListQuerySchema
>;
export type AdminGuestbookDeleteQuery = z.infer<
  typeof AdminGuestbookDeleteQuerySchema
>;
export type AdminGuestbookPatchQuery = z.infer<
  typeof AdminGuestbookPatchQuerySchema
>;
export type AdminGuestbookBulkDeleteBody = z.infer<
  typeof AdminGuestbookBulkDeleteBodySchema
>;
export type AdminGuestbookBulkPatchBody = z.infer<
  typeof AdminGuestbookBulkPatchBodySchema
>;
export type AdminGuestbookItem = z.infer<typeof AdminGuestbookItemSchema>;
