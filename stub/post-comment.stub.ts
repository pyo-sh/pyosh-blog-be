import { faker } from "@faker-js/faker";
import { PostCommentEntity } from "@src/entities/post-comment.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";
import type PostStub from "@stub/post.stub";

interface PostCommentFrame extends Omit<PostCommentEntity, "post"> {
  post?: PostStub;
}
interface PostCommentStubInput
  extends Omit<PostCommentFrame, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  updatedAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class PostCommentStub
  extends DefaultStub
  implements PostCommentFrame
{
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  postId: number;
  // *: Typeorm Entity
  post?: PostStub;

  constructor(
    postCommentData?: Partial<PostCommentStubInput> & {
      post: PostCommentStubInput["post"];
    },
  );

  constructor(
    postCommentData?: Partial<PostCommentStubInput> & {
      postId: PostCommentStubInput["postId"];
    },
  );

  constructor(postCommentData) {
    super();

    const { id, content, createdAt, updatedAt, deletedAt, post, postId } =
      postCommentData ?? {};

    this.setId(id);
    this.setContent(content);
    this.setCreatedAt(createdAt);
    this.setUpdatedAt(updatedAt);

    this.setDeletedAt(deletedAt ?? null);

    if (post) {
      this.setPost(post);
    } else {
      this.setPostId(postId);
    }
  }

  setContent(content?: PostCommentStubInput["content"]) {
    this.content = content ?? faker.lorem.sentence();

    return this;
  }

  setCreatedAt(createdAt?: PostCommentStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setUpdatedAt(updatedAt?: PostCommentStubInput["updatedAt"]) {
    this.updatedAt = this.selectValidDate(
      updatedAt,
      faker.date.recent({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: PostCommentStubInput["deletedAt"]) {
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

  setPostId(postId: PostCommentStubInput["postId"]) {
    this.postId = postId;

    return this;
  }

  setPost(post: PostCommentStubInput["post"]) {
    this.setPostId(post.id);
    this.post = post;

    return this;
  }
}
