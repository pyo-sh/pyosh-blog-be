import pino from "pino";
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

// 민감 정보 마스킹 경로 (헤더)
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "res.headers['set-cookie']",
];

// req serializer: body 제외 (password, guestPassword, guestEmail 등 민감 필드 보호)
const REQ_SERIALIZER = {
  req(request: { method: string; url: string; ip: string }) {
    return {
      method: request.method,
      url: request.url,
      ip: request.ip,
    };
  },
};

/**
 * pino 로거 옵션 빌더 (dev/test 용)
 * - 민감 정보 redact (Authorization, Cookie, Set-Cookie)
 * - 개발: pino-pretty (human-readable)
 * - 테스트: JSON, warn 레벨
 */
export function buildLoggerOptions() {
  const level = getLogLevel();
  const isDev = env.NODE_ENV === NodeEnv.DEV;

  return {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    serializers: REQ_SERIALIZER,
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

/**
 * 프로덕션 pino 인스턴스 빌더
 * - stdout: info 레벨 이상 (JSON)
 * - logs/error.log: error 레벨만 파일 기록
 */
export function buildProdLoggerInstance(): pino.Logger {
  const streams: pino.StreamEntry[] = [
    { level: "info", stream: process.stdout },
    { level: "error", stream: pino.destination("logs/error.log") },
  ];

  return pino(
    {
      level: "info",
      redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
      },
      serializers: REQ_SERIALIZER,
    },
    pino.multistream(streams),
  );
}

/**
 * Fastify 생성자에 전달할 로거 설정 반환
 * - production: loggerInstance (multistream)
 * - development: logger options + pino-pretty
 * - test: logger options + disableRequestLogging
 */
export function buildFastifyLoggerConfig(): {
  logger?: ReturnType<typeof buildLoggerOptions>;
  loggerInstance?: pino.Logger;
  disableRequestLogging?: boolean;
} {
  const isProd = env.NODE_ENV === NodeEnv.PROD;
  const isTest = env.NODE_ENV === NodeEnv.TEST;

  if (isProd) {
    return { loggerInstance: buildProdLoggerInstance() };
  }

  return {
    logger: buildLoggerOptions(),
    ...(isTest && { disableRequestLogging: true }),
  };
}

async function loggerPlugin(_fastify: FastifyInstance) {
  // 5xx 로그는 app.ts 에러 핸들러에서 err 객체와 함께 기록하므로 여기서 중복 로깅하지 않음
}

export default fp(loggerPlugin, {
  name: "logger-plugin",
});
