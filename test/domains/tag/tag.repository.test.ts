import { expect } from "chai";
import TagRepository from "@src/domains/tag/tag.repository";
import TagStub from "@stub/tag.stub";
import mockInstance from "@test/utils/mockInstance";

describe("Tag Repository Test", () => {
  const tagRepository = mockInstance(TagRepository);

  it("Tag content is unique string", async () => {
    const tagStub = new TagStub();

    try {
      await tagRepository.save({ ...tagStub, id: undefined });
      await tagRepository.save({ ...tagStub, id: undefined });
      throw new Error("Tag Repository should throw Error");
    } catch (e) {
      expect(e?.code).to.be.equal("SQLITE_CONSTRAINT");
    }
  });
});
