import { faker } from "@faker-js/faker";
import { PostEntity } from "@src/entities/post.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";
import type ImageStub from "@stub/image.stub";
import type PostCommentStub from "@stub/post-comment.stub";
import type TagStub from "@stub/tag.stub";
import type UserStub from "@stub/user.stub";

interface PostFrame
  extends Omit<PostEntity, "user" | "tags" | "comments" | "thumbnail"> {
  user?: UserStub;
  tags?: TagStub[];
  comments?: PostCommentStub[];
  thumbnail?: ImageStub;
}

interface PostStubInput
  extends Omit<PostFrame, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  updatedAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class PostStub extends DefaultStub implements PostFrame {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  userId: number;
  thumbnailId: number | null;
  // *: Typeorm Entity
  user?: UserStub;
  thumbnail?: ImageStub;
  tags?: TagStub[];
  comments?: PostCommentStub[];

  constructor(
    postData?: Partial<PostStubInput> & { userId: PostStubInput["userId"] },
  );

  constructor(
    postData?: Partial<PostStubInput> & { user: PostStubInput["user"] },
  );

  constructor(postData) {
    super();

    const {
      id,
      content,
      createdAt,
      updatedAt,
      deletedAt,
      thumbnail,
      thumbnailId,
      user,
      userId,
      tags,
      comments,
    } = postData ?? {};

    this.setId(id);
    this.setContent(content);
    this.setCreatedAt(createdAt);
    this.setUpdatedAt(updatedAt);

    this.setDeletedAt(deletedAt ?? null);

    if (thumbnail) {
      this.setThumbnail(thumbnail);
    } else {
      this.setThumbnailId(thumbnailId ?? null);
    }
    if (user) {
      this.setUser(user);
    } else if (userId) {
      this.setUserId(userId);
    }
    if (tags) {
      this.setTags(tags);
    }
    if (comments) {
      this.setComments(comments);
    }
  }

  setContent(content?: PostStubInput["content"]) {
    this.content = content ?? faker.lorem.paragraph();

    return this;
  }

  setCreatedAt(createdAt?: PostStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setUpdatedAt(updatedAt?: PostStubInput["updatedAt"]) {
    this.updatedAt = this.selectValidDate(
      updatedAt,
      faker.date.recent({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: PostStubInput["deletedAt"]) {
    if (deletedAt === null) {
      this.deletedAt = null;
    } else {
      this.deletedAt = this.selectValidDate(
        deletedAt,
        faker.date.recent({ refDate: this.updatedAt }),
      );
    }

    return this;
  }

  setThumbnailId(thumbnailId: PostStubInput["thumbnailId"]) {
    this.thumbnailId = thumbnailId;

    return this;
  }

  setThumbnail(thumbnail: PostStubInput["thumbnail"]) {
    this.setThumbnailId(thumbnail.id);
    this.thumbnail = thumbnail;

    return this;
  }

  setUserId(userId: PostStubInput["userId"]) {
    this.userId = userId;

    return this;
  }

  setUser(user: PostStubInput["user"]) {
    this.setUserId(user.id);
    this.user = user;

    return this;
  }

  setTags(tags: PostStubInput["tags"]) {
    this.tags = tags;

    return this;
  }

  setComments(comments: PostStubInput["comments"]) {
    this.comments = comments;

    return this;
  }
}
