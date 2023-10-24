import { ApiModel, ApiModelProperty } from "swagger-express-ts";
import { GuestbookEntity } from "@src/entities/guestbook.entity";
import { swaggerExamples } from "@src/swagger/examples";

const { guestbook } = swaggerExamples;

@ApiModel({
  name: "Guestbook",
  description: "유저가 남긴 방문록",
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SwaggerGuestbookModel implements GuestbookEntity {
  @ApiModelProperty({
    required: true,
    example: guestbook.id,
  })
  id: number;

  @ApiModelProperty({
    required: true,
    example: guestbook.comment,
  })
  comment: string;

  @ApiModelProperty({
    example: guestbook.createdAt,
  })
  createdAt: Date;

  @ApiModelProperty({
    example: guestbook.updatedAt,
  })
  updatedAt: Date;

  @ApiModelProperty({
    example: guestbook.deletedAt,
  })
  deletedAt: Date | null;

  @ApiModelProperty({
    required: true,
    example: guestbook.userId,
  })
  userId: number;
}
