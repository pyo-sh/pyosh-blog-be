import { faker } from "@faker-js/faker";
import type UserStub from "@stub/user.stub";
import { GuestbookEntity } from "@src/entities/guestbook.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";

interface GuestbookFrame extends Omit<GuestbookEntity, "user"> {
  user?: UserStub;
}

interface GuestbookStubInput
  extends Omit<GuestbookFrame, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  updatedAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class GuestbookStub
  extends DefaultStub
  implements GuestbookFrame
{
  id: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  userId: number;
  // *: Typeorm Entity
  user?: UserStub;

  constructor(
    guestbookData?: Partial<GuestbookStubInput> & {
      userId: GuestbookStubInput["userId"];
    },
  );

  constructor(
    guestbookData?: Partial<GuestbookStubInput> & {
      user: GuestbookStubInput["user"];
    },
  );

  constructor(guestbookData?: Partial<GuestbookStubInput>) {
    super();

    const { id, comment, createdAt, updatedAt, deletedAt, user, userId } =
      guestbookData ?? {};

    this.setId(id);
    this.setComment(comment);
    this.setCreatedAt(createdAt);
    this.setUpdatedAt(updatedAt);

    this.setDeletedAt(deletedAt ?? null);

    if (user) {
      this.setUser(user);
    } else {
      this.setUserId(userId);
    }
  }

  setComment(comment: GuestbookStubInput["comment"]) {
    this.comment = comment ?? faker.lorem.sentence();

    return this;
  }

  setCreatedAt(createdAt?: GuestbookStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setUpdatedAt(updatedAt?: GuestbookStubInput["updatedAt"]) {
    this.updatedAt = this.selectValidDate(
      updatedAt,
      faker.date.soon({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: GuestbookStubInput["deletedAt"]) {
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

  setUserId(userId: GuestbookStubInput["userId"]) {
    this.userId = userId;

    return this;
  }

  setUser(user: GuestbookStubInput["user"]) {
    this.setUserId(user.id);
    this.user = user;

    return this;
  }
}
