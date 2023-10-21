import { Transform } from "class-transformer";
import { IsNumber } from "class-validator";

export default class UserIdParam {
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  id: number;
}
