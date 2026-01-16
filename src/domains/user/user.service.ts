import UserUpdateArgs from "./models/user-update-args.dto";
import { HttpException, Injectable } from "@src/core";
import UserCreateArgs from "@src/domains/user/models/user-create-args.dto";
import UserRepository from "@src/domains/user/user.repository";
import { UserEntity } from "@src/entities/user.entity";

@Injectable()
class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async createUser(user: UserCreateArgs): Promise<UserEntity> {
    // TODO : Create Image Table and Insert
    const userData = this.userRepository.create({ ...user });

    return await this.userRepository.save(userData);
  }

  async findOrCreateUserByGithubId(
    userData: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const { githubId } = userData;

    let user: UserEntity | null = await this.userRepository.findOneBy({
      githubId,
    });

    if (!user) {
      user = await this.createUser(userData as UserCreateArgs);
    }

    return user;
  }

  async getUser(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new HttpException({
        status: "BAD_REQUEST",
        message: "유효한 유저 정보가 없습니다.",
      });
    }

    return user;
  }

  async updateUser({ id, name, image }: UserUpdateArgs): Promise<UserEntity> {
    const user: UserEntity | null = await this.userRepository.findOneBy({
      id,
    });

    if (!user) {
      throw new HttpException({
        status: "BAD_REQUEST",
        message: "유효한 유저 정보가 없습니다.",
      });
    }

    // TODO : image findOrCreate
    void image;
    const userData = this.userRepository.create({ id, name });

    return await this.userRepository.save(userData);
  }

  async deleteUser(id: number): Promise<void> {
    const { affected } = await this.userRepository.softDelete(id);

    const result = affected > 0;
    if (!result) {
      throw new HttpException({
        status: "BAD_REQUEST",
        message: "유저 정보를 삭제할 수 없거나 없는 정보입니다.",
      });
    }
  }
}

export default UserService;
