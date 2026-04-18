import { z } from "zod";
import { CommentAuthorSchema } from "@src/routes/comments/comment.schema";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Path Parameter Schemas
 */
export const GuestbookIdParamSchema = z.object({
  id: z.coerce.number().int().positive().describe("방명록 엔트리 ID"),
});

/**
 * Query Parameter Schemas
 */
export const GuestbookQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).describe("페이지당 항목 수 (최대 100)"),
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
    .max(2000, "본문은 2000자를 초과할 수 없습니다")
    .describe("방명록 본문 (최대 2000자)"),
  parentId: z.number().int().positive().optional().describe("부모 엔트리 ID (답글인 경우)"),
  isSecret: z.boolean().optional().default(false).describe("비밀 방명록 여부"),
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
      .describe("게스트 비밀번호 (삭제 시 필요, 최소 4자)"),
  });

/**
 * 게스트 방명록 삭제 스키마
 */
export const DeleteGuestbookGuestBodySchema = z.object({
  guestPassword: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").describe("게스트 비밀번호"),
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
    id: z.number().describe("방명록 엔트리 ID"),
    parentId: z.number().nullable().describe("부모 엔트리 ID (루트이면 null)"),
    body: z.string().describe("방명록 본문"),
    isSecret: z.boolean().describe("비밀 방명록 여부"),
    status: z.enum(["active", "deleted"]).describe("방명록 상태"),
    author: CommentAuthorSchema,
    replies: z.array(GuestbookEntryDetailSchema).describe("답글 목록"),
    createdAt: z.string().describe("작성일 (ISO 8601)"),
    updatedAt: z.string().describe("수정일 (ISO 8601)"),
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
  page: z.coerce.number().int().positive().optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).describe("페이지당 항목 수 (최대 100)"),
  status: z.enum(["active", "deleted", "hidden"]).optional().describe("상태 필터"),
  authorType: z.enum(["oauth", "guest"]).optional().describe("작성자 유형 필터"),
  q: z.string().optional().describe("검색어"),
  startDate: z.string().optional().describe("시작일 (ISO 8601)"),
  endDate: z.string().optional().describe("종료일 (ISO 8601)"),
});

/**
 * 관리자 방명록 단건 삭제 쿼리 스키마 (DELETE - 비가역적 액션만)
 * hide는 PATCH /admin/guestbook/:id를 사용
 */
export const AdminGuestbookDeleteQuerySchema = z.object({
  action: z.enum(["soft_delete", "hard_delete"]).describe("삭제 방식 (soft_delete: 복원 가능, hard_delete: 영구 삭제)"),
});

/**
 * 관리자 방명록 단건 상태 변경 쿼리 스키마 (PATCH - 가역적 액션)
 * - hide: status=hidden (공개 목록에서 숨김)
 * - restore: status=active (hidden 상태만 복원, soft_delete는 별도 undelete 필요)
 */
export const AdminGuestbookPatchQuerySchema = z.object({
  action: z.enum(["hide", "restore"]).describe("변경할 상태 (hide: 숨김, restore: 복원)"),
});

/**
 * 관리자 방명록 벌크 삭제 요청 스키마 (DELETE - 비가역적 액션만)
 * - soft_delete: status=deleted, deletedAt 설정
 * - hard_delete: DB에서 완전 삭제
 * hide/restore는 PATCH /admin/guestbook/bulk를 사용
 * 최대 100개까지 처리 가능
 */
export const AdminGuestbookBulkDeleteBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100).describe("대상 방명록 ID 배열 (최대 100개)"),
  action: z.enum(["soft_delete", "hard_delete"]).describe("삭제 방식"),
});

/**
 * 관리자 방명록 벌크 상태 변경 요청 스키마 (PATCH - 가역적 액션)
 * - hide: active 상태 엔트리를 status=hidden으로 변경
 * - restore: hidden 상태 엔트리만 status=active로 복원 (soft_delete 복원은 별도 undelete 필요)
 * 최대 100개까지 처리 가능
 */
export const AdminGuestbookBulkPatchBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100).describe("대상 방명록 ID 배열 (최대 100개)"),
  action: z.enum(["hide", "restore"]).describe("변경할 상태"),
});

/**
 * 관리자 방명록 아이템 스키마 (flat, 비밀글 마스킹 없음)
 */
export const AdminGuestbookItemSchema = z.object({
  id: z.number().describe("방명록 엔트리 ID"),
  parentId: z.number().nullable().describe("부모 엔트리 ID"),
  body: z.string().describe("방명록 본문"),
  isSecret: z.boolean().describe("비밀 방명록 여부"),
  status: z.enum(["active", "deleted", "hidden"]).describe("방명록 상태"),
  author: CommentAuthorSchema,
  createdAt: z.string().describe("작성일 (ISO 8601)"),
  updatedAt: z.string().describe("수정일 (ISO 8601)"),
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
