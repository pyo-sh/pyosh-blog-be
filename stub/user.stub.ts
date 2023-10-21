import { faker } from "@faker-js/faker";
import { UserEntity } from "@src/entities/user.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";
import type GuestbookStub from "@stub/guestbook.stub";
import type ImageStub from "@stub/image.stub";
import type PostStub from "@stub/post.stub";

interface UserFrame extends Omit<UserEntity, "guestbooks" | "image" | "posts"> {
  image?: ImageStub;
  guestbooks?: GuestbookStub[];
  posts?: PostStub[];
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
  // *: Typeorm Entity
  image?: ImageStub;
  guestbooks?: GuestbookStub[];
  posts?: PostStub[];

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
      guestbooks,
      posts,
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
    if (guestbooks) {
      this.setGuestBooks(guestbooks);
    }
    if (posts) {
      this.setPosts(posts);
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
      faker.date.recent({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: UserStubInput["deletedAt"]) {
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

  setGuestBooks(guestbooks: UserStubInput["guestbooks"]) {
    this.guestbooks = guestbooks;

    return this;
  }

  setPosts(posts: UserStubInput["posts"]) {
    this.posts = posts;

    return this;
  }
}
