import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { TagEntity } from "@src/entities/tag.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { tag } = swaggerExamples;

@ApiModel({
  name: "Tag",
  description: "블로그 글의 태그",
})
class SwaggerTagModel implements TagEntity {
  @ApiModelProperty({
    required: true,
    example: tag.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: tag.content,
  })
  content: string;

  @ApiModelProperty({
    required: true,
    example: tag.createdAt,
  })
  createdAt: Date;
}

export default SwaggerTagModel;
