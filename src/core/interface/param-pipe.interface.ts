import { RouterParam } from "@src/core/enum/router-param.enum";

export interface ParamPipeMetadata {
  readonly type: RouterParam;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metaType?: any | undefined;
  readonly data?: string | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PipeTransform<T = any, R = any> {
  transform(value: T, metadata: ParamPipeMetadata): R;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PipeValidation<T = any> {
  validObject: T;
}
