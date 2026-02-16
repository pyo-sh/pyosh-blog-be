import { z } from "zod";

/**
 * 프로필 수정 요청 스키마
 * provider, providerUserId 등 민감 필드는 수정 불가
 */
export const UpdateMyProfileBodySchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "이름은 최소 1자 이상이어야 합니다")
    .max(100, "이름은 100자를 초과할 수 없습니다")
    .optional(),
  avatarUrl: z
    .string()
    .url("유효한 URL을 입력하세요")
    .max(500, "URL은 500자를 초과할 수 없습니다")
    .nullable()
    .optional(),
});

/**
 * 유저 프로필 응답 스키마
 * providerUserId, deletedAt 등은 노출하지 않음
 */
export const UserProfileResponseSchema = z.object({
  id: z.number(),
  provider: z.enum(["github", "google"]),
  email: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UpdateMyProfileBody = z.infer<typeof UpdateMyProfileBodySchema>;
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
