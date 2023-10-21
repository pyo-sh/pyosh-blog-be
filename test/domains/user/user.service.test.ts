import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { UpdateResult } from "typeorm";
import { HttpException } from "@src/core";
import UserRepository from "@src/domains/user/user.repository";
import UserService from "@src/domains/user/user.service";
import ImageStub from "@stub/image.stub";
import UserStub from "@stub/user.stub";
import { createSandbox } from "@test/utils/createSandbox";
import mockInstance from "@test/utils/mockInstance";

describe("User Service Test", () => {
  const sandbox = createSandbox();
  const userService = mockInstance(UserService);
  const userRepository = mockInstance(UserRepository);

  describe("createUser", () => {
    it("should return a user with a created githubId User", async () => {
      const userStub = new UserStub().setGithubId();
      const repositoryCreateStub = sandbox
        .stub(userRepository, "create")
        .returns(userStub);
      const repositorySaveStub = sandbox
        .stub(userRepository, "save")
        .resolves(userStub);

      const result = await userService.createUser(userStub);

      expect(repositoryCreateStub.calledOnce).to.be.true;
      expect(repositorySaveStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(userStub);
    });

    it("should return a user with a created googleEmail User", async () => {
      const userStub = new UserStub().setGoogleEmail();
      const repositoryCreateStub = sandbox
        .stub(userRepository, "create")
        .returns(userStub);
      const repositorySaveStub = sandbox
        .stub(userRepository, "save")
        .resolves(userStub);

      const result = await userService.createUser(userStub);

      expect(repositoryCreateStub.calledOnce).to.be.true;
      expect(repositorySaveStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(userStub);
    });

    it("should return a user with a created Image & User", async () => {
      const imageStub = new ImageStub();
      const userStub = new UserStub({ image: imageStub });
      const repositoryCreateStub = sandbox
        .stub(userRepository, "create")
        .returns(userStub);
      const repositorySaveStub = sandbox
        .stub(userRepository, "save")
        .resolves(userStub);

      const result = await userService.createUser(userStub);

      expect(repositoryCreateStub.calledOnce).to.be.true;
      expect(repositorySaveStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(userStub);
    });
  });

  describe("getUser", () => {
    it("should return a user with a matching ID", async () => {
      const userStub = new UserStub();
      const repositoryStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(userStub);

      const result = await userService.getUser(userStub.id);

      expect(repositoryStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(userStub);
    });

    it("should throw Exception if user is not found", async () => {
      const repositoryStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(null);

      try {
        const user = await userService.getUser(faker.number.int());
        expect(user).to.be.null;
        throw new Error("UserService did not throw Exception");
      } catch (error) {
        expect(repositoryStub.calledOnce).to.be.true;
        expect(error instanceof HttpException).to.be.true;
        expect(error.message).to.be.string;
      }
    });
  });

  describe("updateUser", () => {
    it("should update the user", async () => {
      const imageStub = new ImageStub();
      const userStub = new UserStub({ image: imageStub });
      const updatedImageStub = new ImageStub();
      const updatedUserStub = new UserStub({
        id: userStub.id,
        image: updatedImageStub,
      });
      const repositoryFindOneByStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(userStub);
      const repositoryCreateStub = sandbox
        .stub(userRepository, "create")
        .returns(updatedUserStub);
      const repositorySaveStub = sandbox
        .stub(userRepository, "save")
        .resolves(updatedUserStub);

      const result = await userService.updateUser({
        id: updatedUserStub.id,
        name: updatedUserStub.name,
        image: updatedImageStub.url,
      });

      expect(repositoryFindOneByStub.calledOnce).to.be.true;
      expect(repositoryCreateStub.calledOnce).to.be.true;
      expect(repositorySaveStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(updatedUserStub);

      return;
    });

    it("should throw Exception if user is not found", async () => {
      const userStub = new UserStub();
      const updatedUserStub = new UserStub({ id: userStub.id });
      const repositoryFindOneByStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(null);
      const repositorySaveStub = sandbox
        .stub(userRepository, "save")
        .throwsException(new Error("Typeorm should not do it"));

      try {
        await userService.updateUser({
          id: updatedUserStub.id,
          name: updatedUserStub.name,
        });
      } catch (error) {
        expect(repositoryFindOneByStub.calledOnce).to.be.true;
        expect(repositorySaveStub.calledOnce).to.be.false;
        expect(error instanceof HttpException).to.be.true;
        expect(error.message).to.be.string;
      }
    });
  });

  describe("deleteUser", () => {
    it("should delete the user", async () => {
      const repositoryStub = sandbox
        .stub(userRepository, "softDelete")
        .resolves({ affected: 1 } as UpdateResult);

      const result = await userService.deleteUser(faker.number.int());

      expect(repositoryStub.calledOnce).to.be.true;
      expect(result).to.be.undefined;
    });

    it("should throw Exception if user is not found", async () => {
      const repositoryStub = sandbox
        .stub(userRepository, "softDelete")
        .resolves({ affected: 0 } as UpdateResult);

      try {
        await userService.deleteUser(faker.number.int());
      } catch (error) {
        expect(repositoryStub.calledOnce).to.be.true;
        expect(error instanceof HttpException).to.be.true;
        expect(error.message).to.be.string;
      }
    });
  });
});
