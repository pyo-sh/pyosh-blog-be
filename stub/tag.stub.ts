import { faker } from "@faker-js/faker";
import type PostStub from "@stub/post.stub";
import { TagEntity } from "@src/entities/tag.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";

interface TagFrame extends Omit<TagEntity, "posts"> {
  posts?: PostStub[];
}

interface TagStubInput extends Omit<TagFrame, "createdAt"> {
  createdAt: StubDateInputType;
}

export default class TagStub extends DefaultStub implements TagFrame {
  id: number;
  content: string;
  createdAt: Date;
  // *: Typeorm Entity
  posts?: PostStub[];

  constructor(tagData?: Partial<TagStubInput>) {
    super();

    const { id, content, createdAt, posts } = tagData ?? {};

    this.setId(id);
    this.setContent(content);
    this.setCreatedAt(createdAt);

    if (posts) {
      this.setPosts(posts);
    }
  }

  setContent(content?: TagStubInput["content"]) {
    this.content = content ?? faker.lorem.word(5);

    return this;
  }

  setCreatedAt(createdAt?: TagStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setPosts(posts: TagStubInput["posts"]) {
    this.posts = posts;

    return this;
  }
}
