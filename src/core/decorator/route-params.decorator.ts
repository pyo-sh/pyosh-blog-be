import { METADATA_KEY } from "@src/constants/metadata-key";
import { RouterParam } from "@src/core/enum/router-param.enum";
import { RouterMethodMetadata } from "@src/core/interface";

type ParamDataType = RouterMethodMetadata["params"][number]["data"];
type ParamPipeType = RouterMethodMetadata["params"][number]["pipes"][number];

const generateRouteParams = (type: RouterParam) => {
  return function (
    data?: ParamDataType | ParamPipeType,
    ...pipes: ParamPipeType[]
  ): ParameterDecorator {
    return function (target, key, index) {
      const args =
        Reflect.getMetadata(METADATA_KEY.routerArgs, target.constructor, key) ||
        {};
      const isExistParamData = data !== null && data !== undefined;
      const hasParamData =
        isExistParamData &&
        (typeof data === "string" || typeof data === "number");
      const paramData = hasParamData ? data : undefined;
      const paramPipes = hasParamData ? pipes : [data, ...pipes];

      Reflect.defineMetadata(
        METADATA_KEY.routerArgs,
        {
          ...args,
          [index]: {
            type,
            data: paramData,
            pipes: paramPipes,
          },
        },
        target.constructor,
        key,
      );
    };
  };
};

export const Req: () => ParameterDecorator = generateRouteParams(
  RouterParam.REQUEST,
);

export const Res: () => ParameterDecorator = generateRouteParams(
  RouterParam.RESPONSE,
);

export const Next: () => ParameterDecorator = generateRouteParams(
  RouterParam.NEXT,
);

export function Body(): ParameterDecorator;
export function Body(...pipes: ParamPipeType[]): ParameterDecorator;
export function Body(
  property: string,
  ...pipes: ParamPipeType[]
): ParameterDecorator;
export function Body(
  property?: string | ParamPipeType,
  ...pipes: ParamPipeType[]
): ParameterDecorator {
  return generateRouteParams(RouterParam.BODY)(property, ...pipes);
}

export function Query(): ParameterDecorator;
export function Query(...pipes: ParamPipeType[]): ParameterDecorator;
export function Query(
  property: string,
  ...pipes: ParamPipeType[]
): ParameterDecorator;
export function Query(
  property?: string | ParamPipeType,
  ...pipes: ParamPipeType[]
): ParameterDecorator {
  return generateRouteParams(RouterParam.QUERY)(property, ...pipes);
}

export function Param(): ParameterDecorator;
export function Param(...pipes: ParamPipeType[]): ParameterDecorator;
export function Param(
  property: string,
  ...pipes: ParamPipeType[]
): ParameterDecorator;
export function Param(
  property?: string | ParamPipeType,
  ...pipes: ParamPipeType[]
): ParameterDecorator {
  return generateRouteParams(RouterParam.PARAMETERS)(property, ...pipes);
}

export const Headers: (property?: string) => ParameterDecorator =
  generateRouteParams(RouterParam.HEADERS);

export const Session: () => ParameterDecorator = generateRouteParams(
  RouterParam.SESSION,
);

export function UploadedFile(): ParameterDecorator;
export function UploadedFile(...pipes: ParamPipeType[]): ParameterDecorator;
export function UploadedFile(
  fileKey: string,
  ...pipes: ParamPipeType[]
): ParameterDecorator;
export function UploadedFile(
  fileKey?: string | ParamPipeType,
  ...pipes: ParamPipeType[]
): ParameterDecorator {
  return generateRouteParams(RouterParam.FILE)(fileKey, ...pipes);
}

export function UploadedFiles(): ParameterDecorator;
export function UploadedFiles(...pipes: ParamPipeType[]): ParameterDecorator;
export function UploadedFiles(...pipes: ParamPipeType[]): ParameterDecorator {
  return generateRouteParams(RouterParam.FILES)(...pipes);
}

export function HostParam(): ParameterDecorator;
export function HostParam(property: string): ParameterDecorator;
export function HostParam(property?: string): ParameterDecorator {
  return generateRouteParams(RouterParam.HOST)(property);
}

export const Ip: () => ParameterDecorator = generateRouteParams(RouterParam.IP);

export const User: () => ParameterDecorator = generateRouteParams(
  RouterParam.USER,
);
