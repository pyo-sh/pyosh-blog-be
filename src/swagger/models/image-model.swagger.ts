import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { ImageEntity } from "@src/entities/image.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { image } = swaggerExamples;

@ApiModel({
  name: "Image",
  description: "이미지 URL",
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SwaggerImageModel implements ImageEntity {
  @ApiModelProperty({
    required: true,
    example: image.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: image.url,
  })
  url: string;

  @ApiModelProperty({
    required: true,
    example: image.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    example: image.deletedAt,
  })
  deletedAt: Date | null;
}
