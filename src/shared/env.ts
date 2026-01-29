import { config } from "dotenv";
import { z } from "zod";

// 환경변수 로드 (서버 시작 시 즉시 실행)
(function initEnvs() {
  const NODE_ENV = process.env.NODE_ENV;
  const ENV_TARGET = NODE_ENV === "production" ? NODE_ENV : "development";

  config();
  if (NODE_ENV) {
    config({ path: `.env.${ENV_TARGET}.local`, override: true });
  }
})();

// Zod 스키마 정의
const envSchema = z
  .object({
    // Node 환경
    NODE_ENV: z
      .enum(["development", "production", "test"] as const)
      .default("development"),

    // 서버 설정
    SERVER_PORT: z.coerce.number().int().positive(),

    // 클라이언트 설정
    CLIENT_PROTOCOL: z.string().min(1),
    CLIENT_HOST: z.string().min(1),
    CLIENT_PORT: z.coerce.number().int().nonnegative().default(0),

    // 데이터베이스 설정
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_USER: z.string().min(1),
    DB_PSWD: z.string().min(1),
    DB_DTBS: z.string().min(1),

    // 세션 설정
    SESSION_SECRET: z.string().min(1),

    // OAuth 리다이렉트 경로
    LOGIN_SUCCESS_PATH: z.string().min(1),
    LOGIN_FAILURE_PATH: z.string().min(1),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // GitHub OAuth
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
  })
  .transform((data) => {
    // CLIENT_URL 자동 생성
    const protocol = data.CLIENT_PROTOCOL ? `${data.CLIENT_PROTOCOL}://` : "";
    const host = data.CLIENT_HOST;
    const port = data.CLIENT_PORT ? `:${data.CLIENT_PORT}` : "";
    const CLIENT_URL = new URL(protocol + host + port).origin;

    return {
      ...data,
      CLIENT_URL,
    };
  });

// 환경변수 타입 추론
type Env = z.infer<typeof envSchema>;

// 환경변수 검증 및 export
function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      console.error(
        error.errors
          .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
          .join("\n"),
      );
    } else {
      console.error(
        "❌ Unexpected error during environment validation:",
        error,
      );
    }
    process.exit(1);
  }
}

export const env = validateEnv();

// 기존 코드와의 호환성을 위한 별칭 export
export default env;
