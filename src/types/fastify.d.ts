import "fastify";
import { User } from "@src/db/schema/users";
import { AdminResponse } from "@src/services/admin.service";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Admin 사용자 정보 (requireAdmin 훅에서 설정)
     */
    admin?: AdminResponse;

    /**
     * OAuth 로그인 사용자 정보 (Passport에서 설정)
     */
    user?: User;
  }
}
