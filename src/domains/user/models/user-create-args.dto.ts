import { IsOptional, IsString } from "class-validator";

export default class UserCreateArgs {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  githubEmail?: string | null;

  @IsOptional()
  @IsString()
  googleEmail?: string | null;

  @IsOptional()
  @IsString()
  imageURL?: string | null;
}
