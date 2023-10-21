import { IsNumber } from "class-validator";
import UserUpdateBody from "./user-update-body.dto";

export default class UserUpdateArgs extends UserUpdateBody {
  @IsNumber()
  id: number;
}
