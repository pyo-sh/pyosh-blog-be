import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { UserEntity } from "@src/entities/user.entity";

@AutoRepository(UserEntity)
class UserRepository extends Repository<UserEntity> {}

export default UserRepository;
