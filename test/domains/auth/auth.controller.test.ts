import { expect } from "chai";
import passport from "passport";
import request from "supertest";
import app from "@src/app";
import envs from "@src/constants/env";
import { createSandbox } from "@test/utils/createSandbox";

describe("Auth Controller", function () {
  const sandbox = createSandbox();

  describe("GET /api/auth/google", () => {
    it("should redirect to Google Auth page", async () => {
      const res = await request(app).get("/api/auth/google");
      expect(res.statusCode).to.equal(302);
      expect(res.header.location).to.contain(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
    });
  });

  describe("GET /api/auth/google/callback", () => {
    it("should call google authentication", async () => {
      const completeMessage = "executed";
      const googleStub = (req, res) => res.send(completeMessage);
      const authenticateStub = sandbox
        .stub(passport, "authenticate")
        .returns(googleStub);

      const result = await request(app).get(`/api/auth/google/callback`);

      expect(authenticateStub.calledOnce).to.be.true;
      expect(
        authenticateStub.calledWith("google", {
          successRedirect: new URL(envs.LOGIN_SUCCESS_PATH, envs.CLIENT_URL)
            .href,
          failureRedirect: new URL(envs.LOGIN_FAILURE_PATH, envs.CLIENT_URL)
            .href,
        }),
      ).to.be.true;
      expect(result.statusCode).to.be.equal(200);
      expect(result.body.data).to.be.equal(completeMessage);
    });
  });

  describe("GET /api/auth/github", () => {
    it("should redirect to Github Auth page", async () => {
      const res = await request(app).get("/api/auth/github");
      expect(res.statusCode).to.equal(302);
      expect(res.header.location).to.contain(
        "https://github.com/login/oauth/authorize",
      );
    });
  });

  describe("GET /api/auth/github/callback", () => {
    it("should call github authentication", async () => {
      const completeMessage = "executed";
      const githubStub = (req, res) => res.send(completeMessage);
      const authenticateStub = sandbox
        .stub(passport, "authenticate")
        .returns(githubStub);

      const result = await request(app).get(`/api/auth/github/callback`);

      expect(authenticateStub.calledOnce).to.be.true;
      expect(
        authenticateStub.calledWith("github" as never, {
          successRedirect: new URL(envs.LOGIN_SUCCESS_PATH, envs.CLIENT_URL)
            .href,
          failureRedirect: new URL(envs.LOGIN_FAILURE_PATH, envs.CLIENT_URL)
            .href,
        }),
      ).to.be.true;
      expect(result.statusCode).to.be.equal(200);
      expect(result.body.data).to.be.equal(completeMessage);
    });
  });
});
