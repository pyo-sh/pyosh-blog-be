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
    .optional()
    .describe("표시 이름 (최대 100자)"),
  avatarUrl: z
    .string()
    .url("유효한 URL을 입력하세요")
    .max(500, "URL은 500자를 초과할 수 없습니다")
    .nullable()
    .optional()
    .describe("아바타 이미지 URL (null이면 초기화)"),
});

/**
 * 유저 프로필 응답 스키마
 * providerUserId, deletedAt 등은 노출하지 않음
 */
export const UserProfileResponseSchema = z.object({
  id: z.number().describe("OAuth 사용자 ID"),
  provider: z.enum(["github", "google"]).describe("OAuth 제공자"),
  email: z.string().nullable().describe("이메일 주소"),
  displayName: z.string().describe("표시 이름"),
  avatarUrl: z.string().nullable().describe("아바타 이미지 URL"),
  createdAt: z.date().describe("계정 생성일"),
  updatedAt: z.date().describe("계정 수정일"),
});

export type UpdateMyProfileBody = z.infer<typeof UpdateMyProfileBodySchema>;
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
