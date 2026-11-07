import { relations } from "drizzle-orm";
import { apiTokens, categories, comments, media, pages, postTags, posts, revisions, tags, users } from "./schema";

export const postsRelations = relations(posts, ({ one, many }) => ({
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  tags: many(postTags),
  comments: many(comments),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  posts: many(postTags),
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, { fields: [postTags.postId], references: [posts.id] }),
  tag: one(tags, { fields: [postTags.tagId], references: [tags.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  // Exactly one of these resolves; which one is decided by the CHECK on the
  // table rather than by whoever happens to be reading the row.
  page: one(pages, { fields: [comments.pageId], references: [pages.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "commentThread",
  }),
  replies: many(comments, { relationName: "commentThread" }),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  author: one(users, {
    fields: [pages.authorId],
    references: [users.id],
  }),
  comments: many(comments),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  posts: many(posts),
}));

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  pages: many(pages),
  media: many(media),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [media.uploadedById],
    references: [users.id],
  }),
}));

/** A revision was written by someone, so the history can say who. */
export const revisionsRelations = relations(revisions, ({ one }) => ({
  author: one(users, { fields: [revisions.authorId], references: [users.id] }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, { fields: [apiTokens.userId], references: [users.id] }),
}));
