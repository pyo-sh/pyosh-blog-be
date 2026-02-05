import { and, desc, eq, isNull } from "drizzle-orm";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { categoryTable } from "@src/db/schema/categories";
import { postTable } from "@src/db/schema/posts";
import { env } from "@src/shared/env";

const SITEMAP_CACHE_CONTROL = "public, max-age=3600";
const RSS_CACHE_CONTROL = "public, max-age=3600";
const RSS_LIMIT = 20;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function normalizeBaseUrl(raw: string): string {
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function createSeoRoute(): FastifyPluginAsync {
  const seoRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
    const baseUrl = normalizeBaseUrl(env.BASE_URL);

    // GET /sitemap.xml
    typedFastify.get(
      "/sitemap.xml",
      {
        schema: {
          tags: ["seo"],
          summary: "Sitemap XML",
          description: "공개 페이지 및 게시글의 sitemap.xml을 생성합니다.",
        },
      },
      async (_request, reply) => {
        const posts = await fastify.db
          .select({
            slug: postTable.slug,
            updatedAt: postTable.updatedAt,
          })
          .from(postTable)
          .where(
            and(
              eq(postTable.status, "published"),
              eq(postTable.visibility, "public"),
              isNull(postTable.deletedAt),
            ),
          )
          .orderBy(desc(postTable.updatedAt));

        const categories = await fastify.db
          .select({
            slug: categoryTable.slug,
            updatedAt: categoryTable.updatedAt,
          })
          .from(categoryTable)
          .where(eq(categoryTable.isVisible, true))
          .orderBy(desc(categoryTable.updatedAt));

        const staticUrls = ["/", "/portfolio", "/guestbook"];
        const categoryUrls = categories.map((category) => ({
          loc: `${baseUrl}/categories/${category.slug}`,
          lastmod: category.updatedAt.toISOString(),
        }));
        const postUrls = posts.map((post) => ({
          loc: `${baseUrl}/posts/${post.slug}`,
          lastmod: post.updatedAt.toISOString(),
        }));

        const allUrls = [
          ...staticUrls.map((path) => ({
            loc: `${baseUrl}${path}`,
            lastmod: new Date().toISOString(),
          })),
          ...categoryUrls,
          ...postUrls,
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls
          .map(
            (url) =>
              `  <url><loc>${escapeXml(url.loc)}</loc><lastmod>${url.lastmod}</lastmod></url>`,
          )
          .join("\n")}\n</urlset>`;

        return reply
          .status(200)
          .header("Content-Type", "application/xml; charset=utf-8")
          .header("Cache-Control", SITEMAP_CACHE_CONTROL)
          .send(xml);
      },
    );

    // GET /rss.xml
    typedFastify.get(
      "/rss.xml",
      {
        schema: {
          tags: ["seo"],
          summary: "RSS XML",
          description: "최신 게시글 기반 RSS 2.0 피드를 생성합니다.",
        },
      },
      async (_request, reply) => {
        const posts = await fastify.db
          .select({
            slug: postTable.slug,
            title: postTable.title,
            contentMd: postTable.contentMd,
            publishedAt: postTable.publishedAt,
            updatedAt: postTable.updatedAt,
            categoryName: categoryTable.name,
          })
          .from(postTable)
          .innerJoin(categoryTable, eq(postTable.categoryId, categoryTable.id))
          .where(
            and(
              eq(postTable.status, "published"),
              eq(postTable.visibility, "public"),
              isNull(postTable.deletedAt),
            ),
          )
          .orderBy(desc(postTable.publishedAt), desc(postTable.updatedAt))
          .limit(RSS_LIMIT);

        const channelTitle = env.BLOG_TITLE;
        const channelDescription = env.BLOG_DESCRIPTION;

        const itemsXml = posts
          .map((post) => {
            const postUrl = `${baseUrl}/posts/${post.slug}`;
            const description = truncateText(
              stripMarkdown(post.contentMd),
              220,
            );
            const pubDate = (post.publishedAt ?? post.updatedAt).toUTCString();

            return [
              "    <item>",
              `      <title>${escapeXml(post.title)}</title>`,
              `      <link>${escapeXml(postUrl)}</link>`,
              `      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
              `      <description>${escapeXml(description)}</description>`,
              `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
              `      <category>${escapeXml(post.categoryName)}</category>`,
              "    </item>",
            ].join("\n");
          })
          .join("\n");

        const rssXml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
          "  <channel>",
          `    <title>${escapeXml(channelTitle)}</title>`,
          `    <link>${escapeXml(baseUrl)}</link>`,
          `    <description>${escapeXml(channelDescription)}</description>`,
          `    <atom:link href="${escapeXml(`${baseUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
          ...((itemsXml ? [itemsXml] : []) as string[]),
          "  </channel>",
          "</rss>",
        ].join("\n");

        return reply
          .status(200)
          .header("Content-Type", "application/rss+xml; charset=utf-8")
          .header("Cache-Control", RSS_CACHE_CONTROL)
          .send(rssXml);
      },
    );

    fastify.log.info("[SEO Routes] Registered");
  };

  return seoRoute;
}
