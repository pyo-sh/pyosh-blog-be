import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { ProjectEntity } from "@src/entities/project.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { project } = swaggerExamples;

@ApiModel({
  name: "Project",
  description: "프로젝트 정보",
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SwaggerProjectModel implements ProjectEntity {
  @ApiModelProperty({
    required: true,
    example: project.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: project.content,
  })
  content: string;

  @ApiModelProperty({
    required: true,
    example: project.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    required: true,
    example: project.updatedAt,
  })
  updatedAt: Date;

  @ApiModelProperty({
    example: project.deletedAt,
  })
  deletedAt: Date | null;

  @ApiModelProperty({
    example: project.thumbnailId,
  })
  thumbnailId: number | null;
}
