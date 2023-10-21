import { faker } from "@faker-js/faker";
import { expect } from "chai";
import supertest from "supertest";
import app from "@src/app";
import UserService from "@src/domains/user/user.service";
import ImageStub from "@stub/image.stub";
import UserStub from "@stub/user.stub";
import { createSandbox } from "@test/utils/createSandbox";
import mockInstance from "@test/utils/mockInstance";
import { responseChanger } from "@test/utils/responseChanger";

describe("User Controller Test", async () => {
  const testServer = supertest(app);
  const sandbox = createSandbox();
  const userService = mockInstance(UserService);

  describe("GET /user/:id", () => {
    it("should return the user with the specified id", async () => {
      const userStub = new UserStub();
      const serviceStub = sandbox
        .stub(userService, "getUser")
        .resolves(userStub);

      const response = await testServer.get(`/api/user/${userStub.id}`);

      expect(serviceStub.calledOnce).to.be.true;
      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.data.user).to.deep.equal(responseChanger(userStub));
    });

    it("should throw exception with invalid user id", async () => {
      const invalidId = faker.string.alpha();
      const serviceStub = sandbox
        .stub(userService, "getUser")
        .throwsException(new Error("should not call getUser function"));

      const response = await testServer.get(`/api/user/${invalidId}`);

      expect(serviceStub.called).to.be.false;
      expect(response.status).to.equal(400);
      expect(response.body.success).to.be.false;
      expect(response.body.message).to.be.string;
    });
  });

  describe("PUT /user/:id", () => {
    it("should update the user with the specified id", async () => {
      const imageStub = new ImageStub();
      const userStub = new UserStub({ image: imageStub });
      const updatedImageStub = new ImageStub();
      const updatedUserStub = new UserStub({
        id: userStub.id,
        image: updatedImageStub,
      });

      const serviceStub = sandbox
        .stub(userService, "updateUser")
        .resolves(updatedUserStub);

      const response = await testServer.put(`/api/user/${userStub.id}`).send({
        name: updatedUserStub.name,
        image: updatedImageStub.url,
      });

      expect(serviceStub.calledOnce).to.be.true;
      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.data.user).to.deep.equal(
        responseChanger(updatedUserStub),
      );
    });
  });

  describe("DELETE /user/:id", () => {
    it("should delete the user with the specified id", async () => {
      const id = faker.number.int();
      const serviceStub = sandbox.stub(userService, "deleteUser").resolves();

      const response = await testServer.delete(`/api/user/${id}`);

      expect(serviceStub.calledOnce).to.be.true;
      expect(response.status).to.equal(204);
    });

    it("should throw exception with invalid user id", async () => {
      const invalidId = faker.string.alpha();
      const serviceStub = sandbox
        .stub(userService, "deleteUser")
        .throwsException(new Error("should not call deleteUser function"));

      const response = await testServer.delete(`/api/user/${invalidId}`);

      expect(serviceStub.called).to.be.false;
      expect(response.status).to.equal(400);
      expect(response.body.success).to.be.false;
      expect(response.body.message).to.be.string;
    });
  });
});
