import { faker } from "@faker-js/faker";
import type PostStub from "@stub/post.stub";
import type ProjectStub from "@stub/project.stub";
import type UserStub from "@stub/user.stub";
import { ImageEntity } from "@src/entities/image.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";

interface ImageFrame extends Omit<ImageEntity, "projects" | "users" | "posts"> {
  projects?: ProjectStub[];
  users?: UserStub[];
  posts?: PostStub[];
}

interface ImageStubInput extends Omit<ImageFrame, "createdAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class ImageStub extends DefaultStub implements ImageFrame {
  id: number;
  url: string;
  createdAt: Date;
  deletedAt: Date | null;
  // *: Typeorm Entity
  projects?: ProjectStub[];
  users?: UserStub[];
  posts?: PostStub[];

  constructor(imageData?: Partial<ImageStubInput>) {
    super();

    const { id, url, createdAt, deletedAt, projects, users, posts } =
      imageData ?? {};

    this.setId(id);
    this.setURL(url);
    this.setCreatedAt(createdAt);

    this.setDeletedAt(deletedAt ?? null);

    if (projects) {
      this.setProjects(projects);
    }
    if (users) {
      this.setUsers(users);
    }
    if (posts) {
      this.setPosts(posts);
    }
  }

  setURL(url?: ImageStubInput["url"]) {
    this.url = url ?? faker.image.url();

    return this;
  }

  setCreatedAt(createdAt?: ImageStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setDeletedAt(deletedAt?: ImageStubInput["deletedAt"]) {
    if (deletedAt === null) {
      this.deletedAt = null;
    } else {
      this.deletedAt = this.selectValidDate(
        deletedAt,
        faker.date.soon({ refDate: this.createdAt }),
      );
    }

    return this;
  }

  setProjects(projects: ImageStubInput["projects"]) {
    this.projects = projects;

    return this;
  }

  setUsers(users: ImageStubInput["users"]) {
    this.users = users;

    return this;
  }

  setPosts(posts: ImageStubInput["posts"]) {
    this.posts = posts;

    return this;
  }
}
