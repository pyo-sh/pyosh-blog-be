import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { NodeEnv } from "@src/constants/node-env";
import { env } from "@src/shared/env";

/**
 * 환경별 로그 레벨
 * - development: debug (모든 로그 출력)
 * - production: info (운영 필요 정보만)
 * - test: warn (테스트 중 경고/오류만 출력)
 */
export function getLogLevel(): string {
  switch (env.NODE_ENV) {
    case NodeEnv.PROD:
      return "info";
    case NodeEnv.TEST:
      return "warn";
    default:
      return "debug";
  }
}

/**
 * pino 로거 옵션 빌더
 * - 민감 정보 redact (Authorization, Cookie, Set-Cookie)
 * - 개발: pino-pretty (human-readable)
 * - 프로덕션: JSON 포맷
 */
export function buildLoggerOptions() {
  const level = getLogLevel();
  const isDev = env.NODE_ENV === NodeEnv.DEV;

  return {
    level,
    // 민감 정보 마스킹
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['set-cookie']",
        "res.headers['set-cookie']",
      ],
      censor: "[REDACTED]",
    },
    // 개발 환경: pino-pretty
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          colorize: true,
        },
      },
    }),
  };
}

async function loggerPlugin(_fastify: FastifyInstance) {
  // 5xx 로그는 app.ts 에러 핸들러에서 err 객체와 함께 기록하므로 여기서 중복 로깅하지 않음
}

export default fp(loggerPlugin, {
  name: "logger-plugin",
});
