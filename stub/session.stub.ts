import { faker } from "@faker-js/faker";
import { SessionEntity } from "@src/entities/session.entity";

export default class SessionStub implements SessionEntity {
  id: string;
  data: string;
  expiresAt: number;

  constructor(sessionData?: Partial<SessionEntity>) {
    const { id, data, expiresAt } = sessionData ?? {};

    this.setId(id);
    this.setData(data);
    this.setExpiresAt(expiresAt);
  }

  setId(id?: SessionEntity["id"]) {
    this.id = id ?? faker.string.uuid();

    return this;
  }

  setData(data?: SessionEntity["data"]) {
    this.data = data ?? JSON.stringify({});

    return this;
  }

  setExpiresAt(expiresAt?: SessionEntity["expiresAt"]) {
    this.expiresAt = expiresAt ?? faker.date.recent().getTime();

    return this;
  }
}
