import { z } from "zod";

// Path Parameter 스키마
export const UserIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Request Body 스키마
export const UserUpdateBodySchema = z.object({
  name: z.string().min(1).max(20).optional(),
  imageId: z.number().int().positive().nullable().optional(),
});

// Response 스키마 (JSON 직렬화된 형태)
export const UserResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  githubId: z.string().nullable(),
  googleEmail: z.string().nullable(),
  writable: z.boolean(),
  imageId: z.number().nullable(),
  createdAt: z.string(), // ISO datetime string
  updatedAt: z.string(), // ISO datetime string
  deletedAt: z.string().nullable(), // ISO datetime string
});

export const UserGetResponseSchema = z.object({
  user: UserResponseSchema,
});

export const UserUpdateResponseSchema = z.object({
  user: UserResponseSchema,
});

// Type exports
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
export type UserUpdateBody = z.infer<typeof UserUpdateBodySchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
