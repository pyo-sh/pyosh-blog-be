import passport from "passport";
import type { Strategy as GitHubStrategy } from "passport-github";
import type { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Injectable } from "@src/core";
import ImageRepository from "@src/domains/image/image.repository";
import UserRepository from "@src/domains/user/user.repository";
import { UserEntity } from "@src/entities/user.entity";

type OverloadedFirstParameterType<T> = T extends {
  new (...args: infer A): void;
  new (...args: infer R): void;
  new (...args: infer R): void;
  new (...args: infer R): void;
}
  ? A
  : void;

type OverloadedThirdParameterType<T> = T extends {
  new (...args: infer R): void;
  new (...args: infer R): void;
  new (...args: infer A): void;
  new (...args: infer R): void;
}
  ? A
  : void;

@Injectable()
class AuthPassport {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly imageRepository: ImageRepository,
  ) {}

  serializeUser(...params: Parameters<typeof passport.serializeUser>) {
    const [user, done] = params;

    return done(null, (user as UserEntity)?.id);
  }

  async deserializeUser(
    ...params: Parameters<typeof passport.deserializeUser>
  ) {
    const [id, done] = params;
    const user = await this.userRepository.findOneBy({ id: id as number });

    return done(null, user);
  }

  async googleVerification(
    ...params: Parameters<
      OverloadedThirdParameterType<typeof GoogleStrategy>[1]
    >
  ) {
    const profile = params[3];
    const done = params[4];

    // *: create or find user with email
    const { name, email: googleEmail, picture } = profile._json;
    const user = await this.userRepository.findOneBy({ googleEmail });

    // *: if user exists, return
    if (user) {
      return done(null, user);
    }

    // *: if not, create and return (auto create)
    const imageData = this.imageRepository.create({ url: picture });
    const userData = this.userRepository.create({
      name,
      googleEmail,
      image: imageData,
    });
    const newUser = await this.userRepository.save(userData);

    return done(null, newUser);
  }

  async githubVerification(
    ...params: Parameters<
      OverloadedFirstParameterType<typeof GitHubStrategy>[1]
    >
  ) {
    const profile = params[2];
    const done = params[3];

    const {
      login: githubId,
      avatar_url: url,
      name,
    } = profile._json as {
      login: string;
      avatar_url: string;
      name: string;
    };

    const user = await this.userRepository.findOneBy({ githubId });

    // *: if user exists, return
    if (user) {
      return done(null, user);
    }

    // *: if not, create and return (auto create)
    const imageData = this.imageRepository.create({ url });
    const userData = this.userRepository.create({
      name,
      githubId,
      image: imageData,
    });
    const newUser = await this.userRepository.save(userData);

    return done(null, newUser);
  }
}

export default AuthPassport;
