import { METADATA_KEY } from "@src/constants/metadata-key";
import { RouterMethod } from "@src/core/enum/router-method.enum";

const generateRouteMethod = (method) => {
  return function (path: string): MethodDecorator {
    return function (target, key) {
      Reflect.defineMetadata(
        METADATA_KEY.routerMethod,
        method,
        target.constructor,
        key,
      );
      Reflect.defineMetadata(
        METADATA_KEY.routerPath,
        path,
        target.constructor,
        key,
      );
    };
  };
};

export function Get(path: string) {
  return generateRouteMethod(RouterMethod.GET)(path);
}

export function Patch(path: string) {
  return generateRouteMethod(RouterMethod.PATCH)(path);
}

export function Post(path: string) {
  return generateRouteMethod(RouterMethod.POST)(path);
}

export function Put(path: string) {
  return generateRouteMethod(RouterMethod.PUT)(path);
}

export function Delete(path: string) {
  return generateRouteMethod(RouterMethod.DELETE)(path);
}
