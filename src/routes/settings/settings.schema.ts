import { z } from "zod";

/**
 * 방명록 설정 응답 스키마
 */
export const GuestbookSettingsResponseSchema = z.object({
  enabled: z.boolean(),
});

/**
 * 방명록 설정 변경 요청 스키마
 */
export const UpdateGuestbookSettingsBodySchema = z.object({
  enabled: z.boolean(),
});

export type GuestbookSettingsResponse = z.infer<
  typeof GuestbookSettingsResponseSchema
>;
export type UpdateGuestbookSettingsBody = z.infer<
  typeof UpdateGuestbookSettingsBodySchema
>;
