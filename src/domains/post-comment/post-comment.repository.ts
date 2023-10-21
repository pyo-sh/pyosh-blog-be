import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { PostCommentEntity } from "@src/entities/post-comment.entity";

@AutoRepository(PostCommentEntity)
class PostCommentRepository extends Repository<PostCommentEntity> {}

export default PostCommentRepository;
