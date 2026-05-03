import { and, eq, isNull, SQL } from "drizzle-orm";
import { postTable } from "@src/db/schema/posts";

function compactConditions(
  conditions: Array<SQL<unknown> | undefined>,
): Array<SQL<unknown>> {
  return conditions.filter(
    (condition): condition is SQL<unknown> => condition !== undefined,
  );
}

export function buildPublicReadablePostWhere(
  ...conditions: Array<SQL<unknown> | undefined>
): SQL<unknown> {
  return and(
    ...compactConditions(conditions),
    eq(postTable.status, "published"),
    eq(postTable.visibility, "public"),
    isNull(postTable.deletedAt),
  )!;
}

export function buildSearchIndexablePostWhere(
  ...conditions: Array<SQL<unknown> | undefined>
): SQL<unknown> {
  return and(
    buildPublicReadablePostWhere(...conditions),
    eq(postTable.searchIndexable, true),
  )!;
}
