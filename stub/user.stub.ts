import { faker } from "@faker-js/faker";
import type ImageStub from "@stub/image.stub";
import { User } from "@src/db/schema";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";

interface UserFrame extends Omit<User, "image"> {
  image?: ImageStub;
}

interface UserStubInput
  extends Omit<UserFrame, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  updatedAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class UserStub extends DefaultStub implements UserFrame {
  id: number;
  name: string;
  githubId: string | null;
  googleEmail: string | null;
  writable: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  imageId: number | null;
  image?: ImageStub;

  constructor(userData?: Partial<UserStubInput>) {
    super();

    const {
      id,
      name,
      githubId,
      googleEmail,
      writable,
      createdAt,
      updatedAt,
      deletedAt,
      imageId,
      image,
    } = userData ?? {};

    this.setId(id);
    this.setName(name);
    this.setWritable(writable);
    this.setCreatedAt(createdAt);
    this.setUpdatedAt(updatedAt);

    this.setDeletedAt(deletedAt ?? null);
    this.setGithubId(githubId ?? null);
    this.setGoogleEmail(googleEmail ?? null);

    if (image) {
      this.setImage(image);
    } else {
      this.setImageId(imageId ?? null);
    }
  }

  setName(name?: UserStubInput["name"]) {
    this.name = name ?? faker.person.firstName();

    return this;
  }

  setCreatedAt(createdAt?: UserStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setUpdatedAt(updatedAt?: UserStubInput["updatedAt"]) {
    this.updatedAt = this.selectValidDate(
      updatedAt,
      faker.date.soon({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: UserStubInput["deletedAt"]) {
    if (deletedAt === null) {
      this.deletedAt = null;
    } else {
      this.deletedAt = this.selectValidDate(
        deletedAt,
        faker.date.soon({ refDate: this.updatedAt }),
      );
    }

    return this;
  }

  setGithubId(githubId?: UserStubInput["githubId"]) {
    if (githubId === null) {
      this.githubId = null;
    } else {
      this.githubId = githubId ?? faker.internet.email();
    }

    return this;
  }

  setGoogleEmail(googleEmail?: UserStubInput["googleEmail"]) {
    if (googleEmail === null) {
      this.googleEmail = null;
    } else {
      this.googleEmail = googleEmail ?? faker.internet.email();
    }

    return this;
  }

  setWritable(writable?: UserStubInput["writable"]) {
    this.writable = writable ?? false;

    return this;
  }

  setImageId(imageId: UserStubInput["imageId"]) {
    this.imageId = imageId;

    return this;
  }

  setImage(image: UserStubInput["image"]) {
    this.setImageId(image.id);
    this.image = image;

    return this;
  }
}
