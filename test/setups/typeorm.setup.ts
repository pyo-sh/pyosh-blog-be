import path from "path";
import Sinon from "sinon";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import * as typeormLoader from "@src/loaders/typeorm";

export function initTestTypeorm() {
  const typeormMemory = new DataSource({
    type: "sqlite",
    database: ":memory:",
    entities: [
      path.join(__dirname, "../../src/entities", `./**/*.entity.{js,ts}`),
    ],
    dropSchema: true,
    synchronize: true,
    namingStrategy: new SnakeNamingStrategy(),
  });

  const initializerPromise = typeormMemory.initialize();
  initializerPromise.catch((e) => {
    console.error(e);
    process.exit(1);
  });

  const loadTypeormStub = Sinon.stub(typeormLoader, "loadTypeorm").callsFake(
    async () => {
      await initializerPromise;
    },
  );

  Sinon.replace(typeormLoader, "typeormSource", typeormMemory);
  Sinon.replace(typeormLoader, "loadTypeorm", loadTypeormStub);

  before(async () => {
    await initializerPromise;
  });

  after(async () => {
    await typeormMemory.destroy();
  });
}
