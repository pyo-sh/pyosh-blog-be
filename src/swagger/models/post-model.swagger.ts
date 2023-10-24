import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { PostEntity } from "@src/entities/post.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { post } = swaggerExamples;

@ApiModel({
  name: "Post",
  description: "블로그 글",
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SwaggerPostModel implements PostEntity {
  @ApiModelProperty({
    required: true,
    example: post.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: post.content,
  })
  content: string;

  @ApiModelProperty({
    required: true,
    example: post.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    required: true,
    example: post.updatedAt,
  })
  updatedAt: Date;

  @ApiModelProperty({
    example: post.deletedAt,
  })
  deletedAt: Date | null;

  @ApiModelProperty({
    example: post.thumbnailId,
  })
  thumbnailId: number | null;

  @ApiModelProperty({
    required: true,
    example: post.userId,
  })
  userId: number;
}
