import { relations } from "drizzle-orm";
import { postTable } from "../schema/posts";
import { statsDailyTable } from "../schema/stats";

/**
 * Stats Daily Relations
 */
export const statsDailyRelations = relations(statsDailyTable, ({ one }) => ({
  post: one(postTable, {
    fields: [statsDailyTable.postId],
    references: [postTable.id],
  }),
}));
