import { NextFunction, Request, Response, Router } from "express";
import { EntityTarget, ObjectLiteral } from "typeorm";
import Logger, { devLog } from "@src/constants/console";
import { HttpException, RouterMethodMetadata, RouterParam } from "@src/core";
import Validator from "@src/core/Validator";
import { UserEntity } from "@src/entities/user.entity";
import { typeormSource } from "@src/loaders/typeorm";

export type Constructable<T> = new (...args: unknown[]) => T;
type AbstractConstructable<T> = NewableFunction & { prototype: T };
type InstanceIdentifierType<T = unknown> =
  | Constructable<T>
  | AbstractConstructable<T>
  | CallableFunction
  | string;

export interface RouterData {
  type: InstanceIdentifierType;
  prefix: string;
  methods: RouterMethodMetadata[];
  router?: Router | null;
  options?: {
    authGuard?: { admin: boolean };
  };
  instance?: unknown | null;
}

interface InjectableData<T = unknown> {
  id?: string;
  type: InstanceIdentifierType;
  instance?: InstanceType<Constructable<T>> | null;
  entity?: ObjectLiteral | null;
}

class RouteContainer {
  private static routerMap: Map<InstanceIdentifierType, RouterData> = new Map();
  private static injectableMap: Map<InstanceIdentifierType, InjectableData> =
    new Map();

  // *: set injectable classes data first without instance
  public static set(data: InjectableData) {
    const mutableData = { instance: null, entity: null, ...data };

    if (data?.id) {
      this.injectableMap.set(data.id, mutableData);
    }

    this.injectableMap.set(data.type, mutableData);
  }

  // *: set Controller classes data first without router
  public static setRouter(data: RouterData) {
    this.routerMap.set(data.type, { router: null, instance: null, ...data });
  }

  public static setInstance(instance: { constructor: InstanceIdentifierType }) {
    const data = this.injectableMap.get(instance?.constructor);
    if (data) {
      data.instance = instance;

      return true;
    }

    return false;
  }

  public static getInstance<T extends Constructable<unknown>>(target: T) {
    return this.injectableMap.get(target)?.instance as InstanceType<T>;
  }

  // *: if there's no instance, create and register instance
  public static registerInstance<T = unknown>(TargetClass: Constructable<T>) {
    const injectableMap = this.injectableMap;
    const data: InjectableData<T> =
      (injectableMap.get(TargetClass) as InjectableData<T>) ??
      ({} as InjectableData<T>);

    // *: if instance existed, just returns
    if (data?.instance) {
      return data.instance;
    }

    // *: if not, create instance with dependency injection and register it
    const instance = this.createInstance(TargetClass);
    data.instance = instance;

    return instance;
  }

  // *: just create instance with dependency injection
  public static createInstance<T = unknown>(
    TargetClass: Constructable<T>,
  ): InstanceType<Constructable<T>> {
    const injectableMap = this.injectableMap;
    const data: InjectableData<T> =
      (injectableMap.get(TargetClass) as InjectableData<T>) ??
      ({} as InjectableData<T>);

    // *: if TargetClass is typeorm repository
    if (data?.entity) {
      const instance = this.createTypeormInstance(
        TargetClass,
        data.entity as EntityTarget<typeof data.entity>,
      );

      return instance;
    }

    // *: if TargetClass is general class
    /// *: (need dependency injection)
    const paramtypes = Reflect.getMetadata("design:paramtypes", TargetClass);
    const params =
      paramtypes?.map((type) => {
        const hasConstructor = Boolean(type?.prototype?.constructor);

        return hasConstructor ? this.registerInstance(type) : undefined;
      }) ?? [];

    /// *: create with instance for constructor works
    const instance = new TargetClass(...params);

    /**
     * *: getter for injected instances
     * *: if Container changes instance, instance will too
     * *: it could be useful in testing
     * !: could causes instance dependencies in multiple modules
     */
    const properties = Object.getOwnPropertyNames(instance);
    for (const key of properties) {
      const injectableClass = instance?.[key]?.constructor;
      const hasInjection = injectableMap.has(injectableClass);

      if (hasInjection && injectableClass) {
        Object.defineProperty(instance, key, {
          get() {
            return injectableMap.get(injectableClass)!.instance;
          },
          configurable: false,
          enumerable: false,
        });
      }
    }

    return instance;
  }

  // *: create Router with middleware information
  public static createRouter<T = unknown>(TargetClass: Constructable<T>) {
    const data = this.routerMap.get(TargetClass);

    if (!data) {
      throw Error(
        `${Logger.RED_COLOR}Router Container: data not found while creating router`,
      );
    }
    const router = Router();
    const { prefix, methods, options: routerOptions } = data;
    const instance = this.registerInstance(TargetClass);

    for (const { key, method, path, params, paramTypes, options } of methods) {
      router[method](path, async (req, res, next) => {
        try {
          // *: make Params array for api middleware
          const args = await this.createRouterArguments(
            params,
            paramTypes,
            req,
            res,
            next,
          );

          if (routerOptions && options) {
            // *: Auth Guard check (if no authenticated, pass)
            if (routerOptions?.authGuard || options?.authGuard) {
              if (!req?.user) {
                throw new HttpException({
                  status: "UNAUTHORIZED",
                  message: "Unauthorized, not logged in status",
                });
              }

              const { admin: routerAdmin } = routerOptions?.authGuard ?? {};
              const { admin: methodAdmin } = options?.authGuard ?? {};

              const isAdmin = routerAdmin || methodAdmin;
              if (isAdmin && !(req?.user as UserEntity)?.writable) {
                throw new HttpException({
                  status: "FORBIDDEN",
                  message: "Forbidden, NO PERMISSION",
                });
              }
            }
          }

          // *: router handler can use res, also return values
          const data = await instance[key].call(instance, ...args);

          // *: if handler already sended, don't send
          // *: if there's no data, don't send (if wants send, return null)
          if (res.writableEnded || data === undefined) {
            return undefined;
          }

          // *: if there's data to send, just send
          return res.status(200).send(data);
        } catch (e) {
          next(e);
        }
      });
      devLog.blue(`[Router] ${method}(${prefix}${path}) applied`);
    }

    return router;
  }

  private static async createRouterArguments(
    params: RouterMethodMetadata["params"],
    paramTypes: RouterMethodMetadata["paramTypes"],
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const args = [];

    for (const [index, paramData] of Object.entries(params)) {
      switch (paramData?.type) {
        case RouterParam.REQUEST: {
          args[index] = req;
          break;
        }
        case RouterParam.RESPONSE: {
          args[index] = res;
          break;
        }
        case RouterParam.NEXT: {
          args[index] = next;
          break;
        }
        case RouterParam.BODY: {
          args[index] = await this.validateRouterArguments(
            req.body,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.QUERY: {
          args[index] = await this.validateRouterArguments(
            req.query,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.PARAMETERS: {
          args[index] = await this.validateRouterArguments(
            req.params,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.HEADERS: {
          args[index] = await this.validateRouterArguments(
            req.headers,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.SESSION: {
          args[index] = req.session;
          break;
        }
        case RouterParam.FILE: {
          args[index] = await this.validateRouterArguments(
            (req as { file: Express.Multer.File })?.file,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.FILES: {
          args[index] = await this.validateRouterArguments(
            (req as { files: Express.Multer.File[] })?.files,
            paramData,
            paramTypes[index],
          );
          break;
        }
        case RouterParam.HOST: {
          args[index] = req.hostname;
          break;
        }
        case RouterParam.IP: {
          args[index] = req.ip;
          break;
        }
        case RouterParam.USER: {
          args[index] = req.user;
          break;
        }
        default: {
          break;
        }
      }
    }

    return args;
  }

  private static async validateRouterArguments<T extends object>(
    target: T,
    paramData: RouterMethodMetadata["params"][number],
    paramType: RouterMethodMetadata["paramTypes"][number],
  ) {
    const { type, data, pipes } = paramData;
    const isDataString = typeof data === "string";
    target = isDataString ? target?.[data] : target;

    for (const pipe of pipes) {
      const { validObject, transform } = pipe ?? {};

      if (transform) {
        target = transform(target, {
          type,
          metaType: paramType,
          data: isDataString ? data : undefined,
        });
      }

      if (validObject && isDataString) {
        const validated = await Validator.validate(
          { [data]: target },
          validObject,
        );
        target = validated?.[data];
      } else if (validObject) {
        target = await Validator.validate(target, validObject);
      }
    }

    return target;
  }

  public static getRouterPrefix<T = unknown>(TargetClass: Constructable<T>) {
    const data = this.routerMap.get(TargetClass);

    if (!(data && data?.prefix)) {
      throw Error(
        `${Logger.RED_COLOR}Router Container: data not found while getting controller prefix`,
      );
    }

    return data.prefix;
  }

  private static createTypeormInstance<E extends ObjectLiteral, T = unknown>(
    TargetRepository: Constructable<T>,
    TargetEntity: EntityTarget<E>,
  ) {
    if (!TargetEntity) {
      throw new Error(
        "Typeorm Repository : invalid Entity while creating Repository",
      );
    }

    const baseRepository = typeormSource.getRepository(TargetEntity);

    const instance = new TargetRepository(
      baseRepository.target,
      baseRepository.manager,
      baseRepository.queryRunner,
    );

    return instance as InstanceType<Constructable<T>>;
  }
}

export default RouteContainer;
