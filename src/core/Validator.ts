import { NextFunction, Request, Response } from "express";
import { plainToInstance } from "class-transformer";
import {
  validateOrReject,
  ValidationError,
  ValidatorOptions,
} from "class-validator";
import { HttpException, HttpStatus } from "@src/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Class<T = any> = new (...args: unknown[]) => T;

type TValidatorOptions = {
  status?: keyof typeof HttpStatus | typeof HttpStatus;
  message?: string;
} & ValidatorOptions;

class Validator {
  static async validate<C extends Class>(
    target: object,
    ValidateClass: C,
    { status, message, ...validatorOptions }: TValidatorOptions = {},
  ) {
    try {
      const instance = new ValidateClass();

      Object.entries(target ?? {}).forEach(
        ([key, value]) => (instance[key] = value),
      );

      // ?: transform first? or validate first?
      const transformedInstance = plainToInstance(ValidateClass, instance);
      await validateOrReject(transformedInstance, validatorOptions);

      return transformedInstance;
    } catch (errors) {
      if (message === undefined) {
        const validationErrors: ValidationError[] = errors;
        message = validationErrors
          .map(({ constraints }) =>
            Object.values(constraints ?? {})
              .map((message) => message)
              .join("\n"),
          )
          .join("\n");
      }

      throw new HttpException({ status: status ?? "BAD_REQUEST", message });
    }
  }

  static body<C extends Class>(ValidateClass: C, options?: TValidatorOptions) {
    return async (
      req: Request<never, never, InstanceType<C>, never, never>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: Response<any>,
      next: NextFunction,
    ) => {
      req.body = await this.validate(req.body, ValidateClass, options);
      next();
    };
  }

  static params<C extends Class>(
    ValidateClass: C,
    options?: TValidatorOptions,
  ) {
    return async (
      req: Request<InstanceType<C>, never, never, never, never>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: Response<any>,
      next: NextFunction,
    ) => {
      req.params = await this.validate(req.params, ValidateClass, options);
      next();
    };
  }
}

export default Validator;
