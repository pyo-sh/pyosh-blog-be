import fastifyPassport from "@fastify/passport";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import envs from "@src/constants/env";
import { ImageEntity } from "@src/entities/image.entity";
import { UserEntity } from "@src/entities/user.entity";

const passportPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/passport 초기화 (secureSession 제거 - @fastify/session 사용)
  await fastify.register(fastifyPassport.initialize());

  // Repository 가져오기
  const userRepository = fastify.typeorm.getRepository(UserEntity);
  const imageRepository = fastify.typeorm.getRepository(ImageEntity);

  // User serialization (세션에 저장)
  fastifyPassport.registerUserSerializer(async (user: UserEntity) => {
    return user.id;
  });

  // User deserialization (세션에서 복원)
  fastifyPassport.registerUserDeserializer(async (id: number) => {
    const user = await userRepository.findOneBy({ id });

    return user || null;
  });

  // Google OAuth Strategy
  fastifyPassport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: envs.GOOGLE_CLIENT_ID,
        clientSecret: envs.GOOGLE_CLIENT_SECRET,
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
          let user = await userRepository.findOneBy({ googleEmail });

          if (!user) {
            // 새 유저 생성
            const imageData = imageRepository.create({ url: picture });
            const userData = userRepository.create({
              name,
              googleEmail,
              image: imageData,
            });
            user = await userRepository.save(userData);
          }

          return done(null, user);
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
        clientID: envs.GITHUB_CLIENT_ID,
        clientSecret: envs.GITHUB_CLIENT_SECRET,
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
          let user = await userRepository.findOneBy({ githubId });

          if (!user) {
            // 새 유저 생성
            const imageData = imageRepository.create({ url });
            const userData = userRepository.create({
              name,
              githubId,
              image: imageData,
            });
            user = await userRepository.save(userData);
          }

          return done(null, user);
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
  dependencies: ["typeorm-plugin", "session-plugin"],
});
