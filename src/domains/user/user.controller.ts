import { Response } from "express";
import { Body, Controller, Delete, Get, Param, Put, Res } from "@src/core";
import UserIdParam from "@src/domains/user/models/user-id-param.dto";
import UserUpdateBody from "@src/domains/user/models/user-update-body.dto";
import UserService from "@src/domains/user/user.service";

@Controller("/user")
class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/:id")
  async getUser(
    @Param("id", { validObject: UserIdParam }) id: number,
    @Res() res: Response,
  ) {
    const user = await this.userService.getUser(id);

    return res.status(200).send({ user });
  }

  @Put("/:id")
  async updateUser(
    @Param("id", { validObject: UserIdParam }) id: number,
    @Body({ validObject: UserUpdateBody }) userData: UserUpdateBody,
    @Res() res: Response,
  ) {
    const user = await this.userService.updateUser({ ...userData, id });

    return res.status(200).send({ user });
  }

  @Delete("/:id")
  async deleteUser(
    @Param("id", { validObject: UserIdParam }) id: number,
    @Res() res: Response,
  ) {
    await this.userService.deleteUser(id);

    return res.status(204).end();
  }
}

export default UserController;
