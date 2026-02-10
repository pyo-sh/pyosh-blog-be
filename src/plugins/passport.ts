import fastifyPassport from "@fastify/passport";
import { eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { imageTable, userTable, User } from "@src/db/schema/index";
import { env } from "@src/shared/env";

const passportPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/passport 초기화 (@fastify/session 기반 세션 복원)
  await fastify.register(fastifyPassport.initialize());
  await fastify.register(fastifyPassport.secureSession());

  const { db } = fastify;

  // User serialization (세션에 저장)
  fastifyPassport.registerUserSerializer(async (user: User) => {
    return user.id;
  });

  // User deserialization (세션에서 복원)
  fastifyPassport.registerUserDeserializer(async (id: number) => {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    return user || null;
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

          // 기존 유저 찾기
          const [existingUser] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.googleEmail, googleEmail))
            .limit(1);

          if (existingUser) {
            return done(null, existingUser);
          }

          // 새 유저 생성 (이미지 포함)
          const [image] = await db.insert(imageTable).values({ url: picture });
          const [user] = await db
            .insert(userTable)
            .values({ name, googleEmail, imageId: Number(image.insertId) });

          // 생성된 유저 조회
          const [newUser] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, Number(user.insertId)))
            .limit(1);

          return done(null, newUser);
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
            login: githubId,
            avatar_url: url,
            name,
          } = profile._json as {
            login: string;
            avatar_url: string;
            name: string;
          };

          // 기존 유저 찾기
          const [existingUser] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.githubId, githubId))
            .limit(1);

          if (existingUser) {
            return done(null, existingUser);
          }

          // 새 유저 생성 (이미지 포함)
          const [image] = await db.insert(imageTable).values({ url });
          const [user] = await db
            .insert(userTable)
            .values({ name, githubId, imageId: Number(image.insertId) });

          // 생성된 유저 조회
          const [newUser] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, Number(user.insertId)))
            .limit(1);

          return done(null, newUser);
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
