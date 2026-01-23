import { Repository } from "typeorm";
import { HttpError } from "@src/errors/http-error";
import { UserEntity } from "@src/entities/user.entity";

export interface UserCreateArgs {
  name: string;
  githubId?: string | null;
  googleEmail?: string | null;
  imageId?: number | null;
}

export interface UserUpdateArgs {
  id: number;
  name?: string;
  imageId?: number | null;
}

/**
 * User 서비스 (순수 클래스, DI 제거)
 */
export class UserService {
  constructor(private readonly userRepository: Repository<UserEntity>) {}

  async createUser(args: UserCreateArgs): Promise<UserEntity> {
    const userData = this.userRepository.create(args);
    return await this.userRepository.save(userData);
  }

  async getUser(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw HttpError.notFound("유효한 유저 정보가 없습니다.");
    }

    return user;
  }

  async updateUser({ id, name, imageId }: UserUpdateArgs): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw HttpError.notFound("유효한 유저 정보가 없습니다.");
    }

    // 변경사항만 적용
    if (name !== undefined) {
      user.name = name;
    }
    if (imageId !== undefined) {
      user.imageId = imageId;
    }

    return await this.userRepository.save(user);
  }

  async deleteUser(id: number): Promise<void> {
    const { affected } = await this.userRepository.softDelete(id);

    if (!affected || affected === 0) {
      throw HttpError.notFound(
        "유저 정보를 삭제할 수 없거나 없는 정보입니다."
      );
    }
  }
}
