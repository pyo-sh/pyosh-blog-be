import { relations } from "drizzle-orm";
import { guestbookEntryTable } from "../schema/guestbook";
import { oauthAccountTable } from "../schema/oauth-accounts";

/**
 * Guestbook Entry Relations
 */
export const guestbookEntriesRelations = relations(
  guestbookEntryTable,
  ({ one, many }) => ({
    parent: one(guestbookEntryTable, {
      fields: [guestbookEntryTable.parentId],
      references: [guestbookEntryTable.id],
      relationName: "guestbookHierarchy",
    }),
    children: many(guestbookEntryTable, {
      relationName: "guestbookHierarchy",
    }),
    user: one(oauthAccountTable, {
      fields: [guestbookEntryTable.oauthAccountId],
      references: [oauthAccountTable.id],
    }),
  }),
);
