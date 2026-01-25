import { config } from "dotenv";
import { NodeEnv } from "@src/constants/node-env";

// 환경변수 로드
(function initEnvs() {
  const NODE_ENV = process.env.NODE_ENV;
  const ENV_TARGET = NODE_ENV === "production" ? NODE_ENV : "development";

  config();
  if (NODE_ENV) {
    config({ path: `.env.${ENV_TARGET}.local`, override: true });
  }
})();

// 환경변수 검증 및 export
interface Environment {
  NODE_ENV: NodeEnv;
  SERVER_PORT: number;
  CLIENT_PROTOCOL: string;
  CLIENT_HOST: string;
  CLIENT_PORT: number;
  CLIENT_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PSWD: string;
  DB_DTBS: string;
  SESSION_SECRET: string;
  LOGIN_SUCCESS_PATH: string;
  LOGIN_FAILURE_PATH: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function getEnvNumber(key: string): number {
  const value = getEnv(key);
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }

  return num;
}

function getEnvOptional(key: string, defaultValue = ""): string {
  return process.env[key] || defaultValue;
}

const envs: Environment = (() => {
  const NODE_ENV = getEnv("NODE_ENV") as NodeEnv;
  const SERVER_PORT = getEnvNumber("SERVER_PORT");
  const CLIENT_PROTOCOL = getEnv("CLIENT_PROTOCOL");
  const CLIENT_HOST = getEnv("CLIENT_HOST");
  const CLIENT_PORT = parseInt(getEnvOptional("CLIENT_PORT", "0"), 10);

  // CLIENT_URL 생성
  const clientProtocol = CLIENT_PROTOCOL ? `${CLIENT_PROTOCOL}://` : "";
  const clientHost = CLIENT_HOST;
  const clientPort = CLIENT_PORT ? `:${CLIENT_PORT}` : "";
  const CLIENT_URL = new URL(clientProtocol + clientHost + clientPort).origin;

  return Object.freeze({
    NODE_ENV,
    SERVER_PORT,
    CLIENT_PROTOCOL,
    CLIENT_HOST,
    CLIENT_PORT,
    CLIENT_URL,
    DB_HOST: getEnv("DB_HOST"),
    DB_PORT: getEnvNumber("DB_PORT"),
    DB_USER: getEnv("DB_USER"),
    DB_PSWD: getEnv("DB_PSWD"),
    DB_DTBS: getEnv("DB_DTBS"),
    SESSION_SECRET: getEnv("SESSION_SECRET"),
    LOGIN_SUCCESS_PATH: getEnv("LOGIN_SUCCESS_PATH"),
    LOGIN_FAILURE_PATH: getEnv("LOGIN_FAILURE_PATH"),
    GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: getEnv("GOOGLE_CLIENT_SECRET"),
    GITHUB_CLIENT_ID: getEnv("GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: getEnv("GITHUB_CLIENT_SECRET"),
  });
})();

export default envs;
