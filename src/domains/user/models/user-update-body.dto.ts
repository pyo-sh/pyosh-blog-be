import { IsOptional, IsString } from "class-validator";

export default class UserUpdateBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  image?: string;
}
