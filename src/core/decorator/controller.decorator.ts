import Logger from "@src/constants/console";
import { METADATA_KEY } from "@src/constants/metadata-key";
import RouteContainer, { RouterData } from "@src/core/RouteContainer";

export const Controller = (
  prefix: string,
  options?: {
    authGuard?: RouterData["options"]["authGuard"] | boolean;
  },
): ClassDecorator => {
  if (!prefix) {
    throw Error("Controller prefix: enter valid path");
  }

  if (prefix[0] !== "/") {
    throw Error("Controller prefix: need to be started with '/'");
  }

  return function (TargetClass) {
    const classPrototype = TargetClass?.prototype;
    if (!classPrototype) {
      throw Error(`${Logger.RED_COLOR}Controller Decorator: invalid prototype`);
    }

    const methods = [];
    const properties = Object.getOwnPropertyNames(classPrototype);

    for (const key of properties) {
      // *: if property has method, it has path too
      const method = Reflect.getMetadata(
        METADATA_KEY.routerMethod,
        TargetClass,
        key,
      );

      const path = Reflect.getMetadata(
        METADATA_KEY.routerPath,
        TargetClass,
        key,
      );

      const authGuard = Reflect.getMetadata(
        METADATA_KEY.routerAuth,
        TargetClass,
        key,
      );

      // *: if router use params, set it
      const params =
        Reflect.getMetadata(METADATA_KEY.routerArgs, TargetClass, key) || {};

      const paramTypes =
        Reflect.getMetadata("design:paramtypes", TargetClass, key) || [];

      const methodOptions = {};
      if (authGuard) {
        methodOptions["authGuard"] = authGuard;
      }

      if (path && method) {
        methods.push({
          key,
          method,
          path,
          params,
          paramTypes,
          options: methodOptions,
        });
      }
    }

    const routerOptions = {};
    if (options?.authGuard === true) {
      routerOptions["authGuard"] = { admin: false };
    } else if (options?.authGuard) {
      routerOptions["authGuard"] = options.authGuard;
    }

    RouteContainer.setRouter({
      type: TargetClass,
      prefix,
      methods,
      options: routerOptions ?? {},
    });
  };
};
