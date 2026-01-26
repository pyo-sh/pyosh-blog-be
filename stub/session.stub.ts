import { faker } from "@faker-js/faker";
import { Session } from "@src/db/schema";

export default class SessionStub implements Session {
  id: string;
  data: string;
  expiresAt: number;

  constructor(sessionData?: Partial<Session>) {
    const { id, data, expiresAt } = sessionData ?? {};

    this.setId(id);
    this.setData(data);
    this.setExpiresAt(expiresAt);
  }

  setId(id?: Session["id"]) {
    this.id = id ?? faker.string.uuid();

    return this;
  }

  setData(data?: Session["data"]) {
    this.data = data ?? JSON.stringify({});

    return this;
  }

  setExpiresAt(expiresAt?: Session["expiresAt"]) {
    this.expiresAt = expiresAt ?? Math.floor(faker.date.future().getTime() / 1000);

    return this;
  }
}
