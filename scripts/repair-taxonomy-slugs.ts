import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { loadEnv, requireDbEnv } from "./db-env";
import { categoryTable } from "../src/db/schema/categories";
import * as schema from "../src/db/schema/index";
import { tagTable } from "../src/db/schema/tags";
import {
  ensureUniqueSlug,
  generateUnicodeSlug,
  isBlankSlug,
  needsLegacySlugRepair,
} from "../src/shared/slug";

type RepairTarget = "categories" | "tags" | "all";

function parseArgs(argv: string[]) {
  const options = {
    dryRun: true,
    target: "all" as RepairTarget,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.dryRun = false;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--target=")) {
      const value = arg.slice("--target=".length) as RepairTarget;
      if (value === "categories" || value === "tags" || value === "all") {
        options.target = value;
        continue;
      }
    }

    throw new Error(
      'Usage: pnpm ts-node ./scripts/repair-taxonomy-slugs.ts [--dry-run] [--apply] [--target=categories|tags|all]',
    );
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  loadEnv();
  const dbEnv = requireDbEnv("repair-taxonomy-slugs");
  const pool = mysql.createPool({
    host: dbEnv.host,
    port: dbEnv.port,
    user: dbEnv.user,
    password: dbEnv.password,
    database: dbEnv.database,
  });
  const db = drizzle(pool, { schema, mode: "default" });

  try {
    const categoryPlans =
      options.target === "tags"
        ? []
        : await buildRepairPlans({
            rows: await db
              .select({
                id: categoryTable.id,
                name: categoryTable.name,
                slug: categoryTable.slug,
              })
              .from(categoryTable),
            resolveSlug: async (id, name) =>
              await resolveCategorySlug(db, id, name, id),
          });

    const tagPlans =
      options.target === "categories"
        ? []
        : await buildRepairPlans({
            rows: await db
              .select({
                id: tagTable.id,
                name: tagTable.name,
                slug: tagTable.slug,
              })
              .from(tagTable),
            resolveSlug: async (id, name) =>
              await resolveTagSlug(db, id, name, id),
          });

    if (categoryPlans.length === 0 && tagPlans.length === 0) {
      console.log("[repair-taxonomy-slugs] No legacy slugs found.");
      return;
    }

    for (const plan of categoryPlans) {
      console.log(
        `[categories] ${plan.id}: "${plan.slug}" -> "${plan.nextSlug}" (${plan.name})`,
      );
    }

    for (const plan of tagPlans) {
      console.log(
        `[tags] ${plan.id}: "${plan.slug}" -> "${plan.nextSlug}" (${plan.name})`,
      );
    }

    if (options.dryRun) {
      console.log("[repair-taxonomy-slugs] Dry run complete. No changes applied.");
      return;
    }

    for (const plan of categoryPlans) {
      await db
        .update(categoryTable)
        .set({ slug: plan.nextSlug })
        .where(eq(categoryTable.id, plan.id));
    }

    for (const plan of tagPlans) {
      await db.update(tagTable).set({ slug: plan.nextSlug }).where(eq(tagTable.id, plan.id));
    }

    console.log(
      `[repair-taxonomy-slugs] Applied ${categoryPlans.length + tagPlans.length} slug repairs.`,
    );
  } finally {
    await pool.end();
  }
}

async function buildRepairPlans(input: {
  rows: Array<{ id: number; name: string; slug: string }>;
  resolveSlug: (id: number, name: string) => Promise<string>;
}) {
  const plans: Array<{ id: number; name: string; slug: string; nextSlug: string }> = [];

  for (const row of input.rows) {
    if (!needsLegacySlugRepair(row.slug)) {
      continue;
    }

    plans.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      nextSlug: await input.resolveSlug(row.id, row.name),
    });
  }

  return plans;
}

async function resolveCategorySlug(
  db: MySql2Database<typeof schema>,
  categoryId: number,
  name: string,
  excludeId?: number,
) {
  const preferredSlug = generateUnicodeSlug(name);

  if (isBlankSlug(preferredSlug)) {
    return await ensureUniqueSlug(String(categoryId), async (checkSlug) => {
      const [existing] = await db
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(eq(categoryTable.slug, checkSlug))
        .limit(1);

      if (!existing) {
        return false;
      }

      return excludeId === undefined || existing.id !== excludeId;
    });
  }

  const [existing] = await db
    .select({ id: categoryTable.id })
    .from(categoryTable)
    .where(eq(categoryTable.slug, preferredSlug))
    .limit(1);

  if (!existing || existing.id === excludeId) {
    return preferredSlug;
  }

  return await ensureUniqueSlug(String(categoryId), async (checkSlug) => {
    const [duplicate] = await db
      .select({ id: categoryTable.id })
      .from(categoryTable)
      .where(eq(categoryTable.slug, checkSlug))
      .limit(1);

    if (!duplicate) {
      return false;
    }

    return excludeId === undefined || duplicate.id !== excludeId;
  });
}

async function resolveTagSlug(
  db: MySql2Database<typeof schema>,
  tagId: number,
  name: string,
  excludeId?: number,
) {
  const preferredSlug = generateUnicodeSlug(name);

  if (isBlankSlug(preferredSlug)) {
    return await ensureUniqueSlug(String(tagId), async (checkSlug) => {
      const [existing] = await db
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(eq(tagTable.slug, checkSlug))
        .limit(1);

      if (!existing) {
        return false;
      }

      return excludeId === undefined || existing.id !== excludeId;
    });
  }

  const [existing] = await db
    .select({ id: tagTable.id })
    .from(tagTable)
    .where(eq(tagTable.slug, preferredSlug))
    .limit(1);

  if (!existing || existing.id === excludeId) {
    return preferredSlug;
  }

  return await ensureUniqueSlug(String(tagId), async (checkSlug) => {
    const [duplicate] = await db
      .select({ id: tagTable.id })
      .from(tagTable)
      .where(eq(tagTable.slug, checkSlug))
      .limit(1);

    if (!duplicate) {
      return false;
    }

    return excludeId === undefined || duplicate.id !== excludeId;
  });
}

void main().catch((error) => {
  console.error("[repair-taxonomy-slugs]", error);
  process.exitCode = 1;
});
