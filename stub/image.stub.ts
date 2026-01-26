import { faker } from "@faker-js/faker";
import type UserStub from "@stub/user.stub";
import { Image } from "@src/db/schema";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";

interface ImageFrame extends Omit<Image, "users"> {
  users?: UserStub[];
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
  users?: UserStub[];

  constructor(imageData?: Partial<ImageStubInput>) {
    super();

    const { id, url, createdAt, deletedAt, users } = imageData ?? {};

    this.setId(id);
    this.setURL(url);
    this.setCreatedAt(createdAt);

    this.setDeletedAt(deletedAt ?? null);

    if (users) {
      this.setUsers(users);
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

  setUsers(users: ImageStubInput["users"]) {
    this.users = users;

    return this;
  }
}
