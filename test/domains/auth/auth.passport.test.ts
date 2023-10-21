import { Request } from "express";
import { expect } from "chai";
import type { Profile as GoogleProfile } from "passport-google-oauth20";
import AuthPassport from "@src/domains/auth/auth.passport";
import UserRepository from "@src/domains/user/user.repository";
import ImageStub from "@stub/image.stub";
import UserStub from "@stub/user.stub";
import { createSandbox } from "@test/utils/createSandbox";
import mockInstance from "@test/utils/mockInstance";

describe("Auth Passport", () => {
  const sandbox = createSandbox();
  const authPassport = mockInstance(AuthPassport);
  const userRepository = mockInstance(UserRepository);

  describe("google verification", () => {
    it("if user does not exists, should create a new user", async () => {
      const imageStub = new ImageStub();
      const userStub = new UserStub({ image: imageStub }).setGoogleEmail();
      const findOneByStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(null);
      const saveStub = sandbox.stub(userRepository, "save").resolves(userStub);
      const googleProfile = {
        _json: {
          name: userStub.name,
          email: userStub.googleEmail,
          picture: imageStub.url,
        },
      } as unknown as GoogleProfile;
      const doneStub = sandbox.stub().returns(null);

      await authPassport.googleVerification(
        {} as Request,
        "",
        "",
        googleProfile,
        doneStub,
      );

      expect(findOneByStub.calledOnce).to.be.true;
      expect(findOneByStub.calledWith({ googleEmail: userStub.googleEmail })).to
        .be.true;
      expect(saveStub.calledOnce).to.be.true;
      expect(doneStub.calledOnce).to.be.true;
      expect(doneStub.calledWith(null, userStub));
    });

    it("if user exists, just return", async () => {
      const imageStub = new ImageStub();
      const userStub = new UserStub({ image: imageStub }).setGoogleEmail();
      const findOneByStub = sandbox
        .stub(userRepository, "findOneBy")
        .resolves(userStub);
      const saveStub = sandbox.stub(userRepository, "save").resolves(null);
      const googleProfile = {
        _json: {
          name: userStub.name,
          email: userStub.googleEmail,
          picture: imageStub.url,
        },
      } as unknown as GoogleProfile;
      const doneStub = sandbox.stub().returns(null);

      await authPassport.googleVerification(
        {} as Request,
        "",
        "",
        googleProfile,
        doneStub,
      );

      expect(findOneByStub.calledOnce).to.be.true;
      expect(findOneByStub.calledWith({ googleEmail: userStub.googleEmail })).to
        .be.true;
      expect(saveStub.calledOnce).to.be.false;
      expect(doneStub.calledOnce).to.be.true;
      expect(doneStub.calledWith(null, userStub));
    });
  });
});
