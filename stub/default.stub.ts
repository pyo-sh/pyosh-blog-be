import { faker } from "@faker-js/faker";
import { omitObject, pickObject } from "@test/utils/object";

const MAX_ID_ITERATOR = 100;
const idSet = new Set<number>();

export type StubDateInputType = ConstructorParameters<typeof Date>[0];

export default class DefaultStub {
  id: number;

  public setId(id?: number) {
    if (!id) {
      for (let i = 0; i <= MAX_ID_ITERATOR; i++) {
        id = faker.number.int();

        if (!idSet.has(id)) {
          break;
        }
      }
    }

    idSet.add(id);
    this.id = id;

    return this;
  }

  public pick<T extends this, K extends keyof T>(keys: K[]) {
    return pickObject(this as T, keys);
  }

  public omit<T extends this, K extends keyof T>(keys: K[]) {
    return omitObject(this as T, keys);
  }

  protected selectValidDate(
    target: ConstructorParameters<typeof Date>[0],
    replaceDate: Date,
  ) {
    const date = new Date(target);

    return !isNaN(Number(date)) ? date : replaceDate;
  }
}
