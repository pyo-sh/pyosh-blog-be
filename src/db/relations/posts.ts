import { relations } from "drizzle-orm";
import { categoryTable } from "../schema/categories";
import { postTagTable } from "../schema/post-tags";
import { postTable } from "../schema/posts";
import { tagTable } from "../schema/tags";

/**
 * Post Relations
 */
export const postsRelations = relations(postTable, ({ one, many }) => ({
  category: one(categoryTable, {
    fields: [postTable.categoryId],
    references: [categoryTable.id],
  }),
  postTags: many(postTagTable),
}));

/**
 * Category Relations (계층 구조)
 */
export const categoriesRelations = relations(
  categoryTable,
  ({ one, many }) => ({
    posts: many(postTable),
    parent: one(categoryTable, {
      fields: [categoryTable.parentId],
      references: [categoryTable.id],
      relationName: "categoryHierarchy",
    }),
    children: many(categoryTable, {
      relationName: "categoryHierarchy",
    }),
  }),
);

/**
 * PostTag Relations
 */
export const postTagsRelations = relations(postTagTable, ({ one }) => ({
  post: one(postTable, {
    fields: [postTagTable.postId],
    references: [postTable.id],
  }),
  tag: one(tagTable, {
    fields: [postTagTable.tagId],
    references: [tagTable.id],
  }),
}));

/**
 * Tag Relations
 */
export const tagsRelations = relations(tagTable, ({ many }) => ({
  postTags: many(postTagTable),
}));
