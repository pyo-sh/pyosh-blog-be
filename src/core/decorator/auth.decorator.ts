import { METADATA_KEY } from "@src/constants/metadata-key";
import { RouterData } from "@src/core/RouteContainer";

export const AuthGuard = (
  options?: RouterData["options"]["authGuard"],
): MethodDecorator => {
  return function (target, key) {
    Reflect.defineMetadata(
      METADATA_KEY.routerAuth,
      options ?? { admin: false },
      target.constructor,
      key,
    );
  };
};
