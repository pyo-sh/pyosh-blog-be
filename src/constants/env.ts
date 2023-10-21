import { plainToClass, Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from "class-validator";
import { config } from "dotenv";
import Logger, { prodLog } from "@src/constants/console";
import { NodeEnv } from "@src/constants/node-env";

(function initEnvs() {
  const NODE_ENV = process.env.NODE_ENV;
  const ENV_TARGET = NODE_ENV === "production" ? NODE_ENV : "development";

  config();
  if (NODE_ENV) {
    config({ path: `.env.${ENV_TARGET}.local`, override: true });
  }
})();

class Environment {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsInt()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  SERVER_PORT: number;

  @IsString()
  @IsNotEmpty()
  CLIENT_PROTOCOL: string;

  @IsString()
  @IsNotEmpty()
  CLIENT_HOST: string;

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  CLIENT_PORT: number;

  @IsString()
  @IsOptional()
  CLIENT_URL: string;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsString()
  @IsNotEmpty()
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  DB_PSWD: string;

  @IsString()
  @IsNotEmpty()
  DB_DTBS: string;

  @IsString()
  @IsNotEmpty()
  SESSION_SECRET: string;

  @IsString()
  @IsNotEmpty()
  LOGIN_SUCCESS_PATH: string;

  @IsString()
  @IsNotEmpty()
  LOGIN_FAILURE_PATH: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  GITHUB_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  GITHUB_CLIENT_SECRET: string;
}

const envs = (() => {
  const environments = plainToClass(Environment, process.env);
  const validationErrors = validateSync(environments);

  if (validationErrors.length > 0) {
    prodLog.red("[Environment] Environment validation errors");
    validationErrors.forEach(({ property, value, constraints }) => {
      prodLog.cyan(`  ${property}: ${Logger.RED_BACKGROUND_COLOR}${value}`);
      Object.entries(constraints).forEach(([decoration, reason]) => {
        prodLog.yellow("    ", `${reason} (${decoration})`);
      });
    });
    process.exit(1);
  }

  const clientProtocol = environments.CLIENT_PROTOCOL
    ? `${environments.CLIENT_PROTOCOL}://`
    : "";
  const clientHost = environments.CLIENT_HOST;
  const clientPort = environments.CLIENT_PORT
    ? `:${environments.CLIENT_PORT}`
    : "";
  environments.CLIENT_URL = new URL(
    clientProtocol + clientHost + clientPort,
  ).origin;

  return Object.freeze(environments);
})();

export default envs;
