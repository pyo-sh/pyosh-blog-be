import { z } from "zod";

export const TagWithPostCountSchema = z.object({
  id: z.number().int().positive().describe("태그 ID"),
  name: z.string().describe("태그 이름"),
  slug: z.string().describe("태그 슬러그"),
  postCount: z.number().int().nonnegative().describe("해당 태그를 가진 공개 발행 게시글 수"),
});

export const TagListResponseSchema = z.object({
  tags: z.array(TagWithPostCountSchema).describe("태그 목록"),
});
