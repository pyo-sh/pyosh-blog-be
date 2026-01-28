import { relations } from "drizzle-orm";
import { commentTable } from "../schema/comments";
import { guestbookEntryTable } from "../schema/guestbook";
import { oauthAccountTable } from "../schema/oauth-accounts";

/**
 * OAuth Account Relations
 */
export const oauthAccountsRelations = relations(
  oauthAccountTable,
  ({ many }) => ({
    comments: many(commentTable),
    guestbookEntries: many(guestbookEntryTable),
  }),
);
