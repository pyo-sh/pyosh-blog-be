import type { Express } from "express";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prodLog } from "@src/constants/console";
import envs from "@src/constants/env";
import RouteContainer from "@src/core/RouteContainer";
import AuthPassport from "@src/domains/auth/auth.passport";

export function loadPassport(app: Express) {
  RouteContainer.registerInstance(AuthPassport);

  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser(async (...args) => {
    const authPassport = RouteContainer.getInstance(AuthPassport);
    await authPassport.serializeUser(...args);
  });
  passport.deserializeUser(async (...args) => {
    const authPassport = RouteContainer.getInstance(AuthPassport);
    await authPassport.deserializeUser(...args);
  });

  // *: Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: envs.GOOGLE_CLIENT_ID,
        clientSecret: envs.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
        passReqToCallback: true,
      },
      (...args) => {
        const authPassport = RouteContainer.getInstance(AuthPassport);
        authPassport.googleVerification(...args);
      },
    ),
  );

  passport.use(
    new GitHubStrategy(
      {
        clientID: envs.GITHUB_CLIENT_ID,
        clientSecret: envs.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/auth/github/callback",
      },
      (...args) => {
        const authPassport = RouteContainer.getInstance(AuthPassport);
        authPassport.githubVerification(...args);
      },
    ),
  );

  prodLog.cyan("[Passport] Initialized!");
}
