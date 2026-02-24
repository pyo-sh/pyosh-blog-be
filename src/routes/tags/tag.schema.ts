import { z } from "zod";

export const TagWithPostCountSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  postCount: z.number().int().nonnegative(),
});

export const TagListResponseSchema = z.object({
  tags: z.array(TagWithPostCountSchema),
});
