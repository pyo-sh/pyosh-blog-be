import fastifyPassport from "@fastify/passport";
import { and, eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { oauthAccountTable, OAuthAccount } from "@src/db/schema/index";
import { env } from "@src/shared/env";

const passportPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/passport 초기화 (@fastify/session 기반 세션 복원)
  await fastify.register(fastifyPassport.initialize());
  await fastify.register(fastifyPassport.secureSession());

  const { db } = fastify;

  // OAuthAccount serialization (세션에 저장)
  fastifyPassport.registerUserSerializer(async (account: OAuthAccount) => {
    return account.id;
  });

  // OAuthAccount deserialization (세션에서 복원)
  fastifyPassport.registerUserDeserializer(async (id: number) => {
    const [account] = await db
      .select()
      .from(oauthAccountTable)
      .where(eq(oauthAccountTable.id, id))
      .limit(1);

    return account || null;
  });

  // Google OAuth Strategy
  fastifyPassport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const {
            name,
            email: googleEmail,
            picture,
          } = profile._json as {
            name: string;
            email: string;
            picture: string;
          };

          const googleId = profile.id;

          // 기존 계정 찾기
          const [existingAccount] = await db
            .select()
            .from(oauthAccountTable)
            .where(
              and(
                eq(oauthAccountTable.provider, "google"),
                eq(oauthAccountTable.providerUserId, googleId),
              ),
            )
            .limit(1);

          if (existingAccount) {
            return done(null, existingAccount);
          }

          // 새 계정 생성
          const [result] = await db.insert(oauthAccountTable).values({
            provider: "google",
            providerUserId: googleId,
            email: googleEmail,
            displayName: name,
            avatarUrl: picture,
          });

          const [newAccount] = await db
            .select()
            .from(oauthAccountTable)
            .where(eq(oauthAccountTable.id, Number(result.insertId)))
            .limit(1);

          return done(null, newAccount);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  // GitHub OAuth Strategy
  fastifyPassport.use(
    "github",
    new GitHubStrategy(
      {
        clientID: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/auth/github/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const {
            avatar_url: url,
            name,
            login,
          } = profile._json as {
            login: string;
            avatar_url: string;
            name: string;
          };

          const githubId = profile.id;

          // 기존 계정 찾기
          const [existingAccount] = await db
            .select()
            .from(oauthAccountTable)
            .where(
              and(
                eq(oauthAccountTable.provider, "github"),
                eq(oauthAccountTable.providerUserId, githubId),
              ),
            )
            .limit(1);

          if (existingAccount) {
            return done(null, existingAccount);
          }

          // 새 계정 생성
          const [result] = await db.insert(oauthAccountTable).values({
            provider: "github",
            providerUserId: githubId,
            email: null,
            displayName: name ?? login,
            avatarUrl: url,
          });

          const [newAccount] = await db
            .select()
            .from(oauthAccountTable)
            .where(eq(oauthAccountTable.id, Number(result.insertId)))
            .limit(1);

          return done(null, newAccount);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  fastify.log.info("[Passport] Plugin registered");
};

export default fp(passportPlugin, {
  name: "passport-plugin",
  dependencies: ["drizzle-plugin", "session-plugin"],
});
