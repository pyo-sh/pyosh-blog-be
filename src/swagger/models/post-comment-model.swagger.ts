import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { PostCommentEntity } from "@src/entities/post-comment.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { postComment } = swaggerExamples;

@ApiModel({
  name: "PostComment",
  description: "블로그 글의 댓글",
})
class SwaggerPostCommentModel implements PostCommentEntity {
  @ApiModelProperty({
    required: true,
    example: postComment.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: postComment.content,
  })
  content: string;

  @ApiModelProperty({
    required: true,
    example: postComment.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    required: true,
    example: postComment.updatedAt,
  })
  updatedAt: Date;

  @ApiModelProperty({
    example: postComment.deletedAt,
  })
  deletedAt: Date | null;

  @ApiModelProperty({
    required: true,
    example: postComment.postId,
  })
  postId: number;

  @ApiModelProperty({
    required: true,
    example: postComment.userId,
  })
  userId: number;
}

export default SwaggerPostCommentModel;
