import type { RouterData } from "@src/core/RouteContainer";
import { RouterMethod, RouterParam } from "@src/core/enum";
import {
  PipeTransform,
  PipeValidation,
} from "@src/core/interface/param-pipe.interface";

type ParamData = object | string | number;
type ParamPipes = Partial<PipeTransform> & Partial<PipeValidation>;

export interface RouterMethodMetadata {
  key: string;
  method: (typeof RouterMethod)[keyof typeof RouterMethod];
  path: string;
  params: {
    [index: number]: {
      type: (typeof RouterParam)[keyof typeof RouterParam];
      data: ParamData;
      pipes: ParamPipes[];
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramTypes: any[];
  options?: {
    authGuard?: RouterData["options"]["authGuard"];
  };
}
