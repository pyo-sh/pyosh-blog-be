import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { UserEntity } from "@src/entities/user.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { user } = swaggerExamples;

@ApiModel({
  name: "User",
  description: "사용자",
})
class SwaggerUserModel implements UserEntity {
  @ApiModelProperty({
    required: true,
    example: user.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: user.id,
  })
  name: string;

  @ApiModelProperty({
    example: user.githubId,
  })
  githubId: string | null;

  @ApiModelProperty({
    example: user.googleEmail,
  })
  googleEmail: string | null;

  @ApiModelProperty({
    required: true,
    example: user.writable,
  })
  writable: boolean;

  @ApiModelProperty({
    required: true,
    example: user.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    required: true,
    example: user.updatedAt,
  })
  updatedAt: Date;

  @ApiModelProperty({
    example: user.deletedAt,
  })
  deletedAt: Date | null;

  @ApiModelProperty({
    example: user.imageId,
  })
  imageId: number | null;
}

export default SwaggerUserModel;
