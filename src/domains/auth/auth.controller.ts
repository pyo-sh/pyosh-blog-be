import { NextFunction, Request, Response } from "express";
import passport from "passport";
import envs from "@src/constants/env";
import { Controller, Get, Next, Req, Res } from "@src/core";

@Controller("/auth")
class AuthController {
  @Get("/google")
  googlePassport(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    return passport
      .authenticate("google", { scope: ["email", "profile"] })
      ?.call(this, req, res, next);
  }

  @Get("/google/callback")
  googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    return passport
      .authenticate("google", {
        successRedirect: new URL(envs.LOGIN_SUCCESS_PATH, envs.CLIENT_URL).href,
        failureRedirect: new URL(envs.LOGIN_FAILURE_PATH, envs.CLIENT_URL).href,
      })
      ?.call(this, req, res, next);
  }

  @Get("/github")
  githubPassport(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    return passport
      .authenticate("github", { scope: ["email", "profile"] })
      ?.call(this, req, res, next);
  }

  @Get("/github/callback")
  githubCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    return passport
      .authenticate("github", {
        successRedirect: new URL(envs.LOGIN_SUCCESS_PATH, envs.CLIENT_URL).href,
        failureRedirect: new URL(envs.LOGIN_FAILURE_PATH, envs.CLIENT_URL).href,
      })
      ?.call(this, req, res, next);
  }
}

export default AuthController;
