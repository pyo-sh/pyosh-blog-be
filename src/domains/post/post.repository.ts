import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { PostEntity } from "@src/entities/post.entity";

@AutoRepository(PostEntity)
class PostRepository extends Repository<PostEntity> {}

export default PostRepository;
