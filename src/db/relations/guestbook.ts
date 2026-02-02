import { relations } from "drizzle-orm";
import { guestbookEntryTable } from "../schema/guestbook";
import { userTable } from "../schema/users";

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
    user: one(userTable, {
      fields: [guestbookEntryTable.oauthAccountId],
      references: [userTable.id],
    }),
  }),
);
