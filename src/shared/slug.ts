/**
 * 텍스트를 URL-safe한 slug로 변환
 * @param text 원본 텍스트
 * @returns slug 문자열
 *
 * @example
 * generateSlug("Hello World!") // "hello-world"
 * generateSlug("My Blog Post 2024") // "my-blog-post-2024"
 */
export function generateSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      // 특수문자를 하이픈으로 변환
      .replace(/[^\w\s-]/g, "")
      // 공백을 하이픈으로 변환
      .replace(/\s+/g, "-")
      // 연속된 하이픈을 하나로
      .replace(/-+/g, "-")
      // 앞뒤 하이픈 제거
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * 중복되지 않는 고유한 slug 생성
 * @param baseSlug 기본 slug
 * @param checkFn slug 존재 여부 확인 함수 (존재하면 true)
 * @returns 고유한 slug
 *
 * @example
 * await ensureUniqueSlug("my-post", async (slug) => {
 *   const post = await db.select().from(posts).where(eq(posts.slug, slug));
 *   return post.length > 0;
 * });
 * // "my-post" 또는 "my-post-2", "my-post-3" 등
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  checkFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;

  // slug가 이미 존재하는지 확인
  while (await checkFn(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * 한글을 포함한 텍스트를 slug로 변환
 * 한글은 로마자로 변환하거나 제거할 수 있습니다.
 * 현재는 한글을 제거하는 방식으로 구현되어 있습니다.
 *
 * @param text 원본 텍스트 (한글 포함 가능)
 * @returns slug 문자열
 *
 * @example
 * generateSlugWithKorean("안녕하세요 Hello World") // "hello-world"
 *
 * TODO: 한글 → 로마자 변환 라이브러리 추가 고려
 * - 예: "안녕하세요" → "annyeonghaseyo"
 * - 추천 라이브러리: korean-romanization, hangul-romanization 등
 */
export function generateSlugWithKorean(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      // 한글 제거 (필요시 로마자 변환 로직으로 교체)
      .replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, "")
      // 특수문자를 하이픈으로 변환
      .replace(/[^\w\s-]/g, "")
      // 공백을 하이픈으로 변환
      .replace(/\s+/g, "-")
      // 연속된 하이픈을 하나로
      .replace(/-+/g, "-")
      // 앞뒤 하이픈 제거
      .replace(/^-+|-+$/g, "")
  );
}
