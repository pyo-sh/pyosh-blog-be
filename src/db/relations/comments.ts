import { relations } from "drizzle-orm";
import { commentTable } from "../schema/comments";
import { postTable } from "../schema/posts";
import { oauthAccountTable } from "../schema/oauth-accounts";

/**
 * Comment Relations
 */
export const commentsRelations = relations(commentTable, ({ one, many }) => ({
  post: one(postTable, {
    fields: [commentTable.postId],
    references: [postTable.id],
  }),
  parent: one(commentTable, {
    fields: [commentTable.parentId],
    references: [commentTable.id],
    relationName: "commentHierarchy",
  }),
  children: many(commentTable, {
    relationName: "commentHierarchy",
  }),
  replyTo: one(commentTable, {
    fields: [commentTable.replyToCommentId],
    references: [commentTable.id],
    relationName: "commentReply",
  }),
  user: one(oauthAccountTable, {
    fields: [commentTable.oauthAccountId],
    references: [oauthAccountTable.id],
  }),
}));
