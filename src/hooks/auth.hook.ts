import { FastifyRequest, FastifyReply } from "fastify";
import { HttpError } from "@src/errors/http-error";

/**
 * 세션 기반 인증 확인 preHandler 훅
 * request.user가 없으면 401 Unauthorized 반환
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user) {
    throw HttpError.unauthorized("Authentication required");
  }
}

/**
 * 선택적 인증 확인 (인증되지 않아도 통과)
 * request.user가 있으면 인증된 상태, 없으면 비인증 상태
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  // request.user가 있으면 인증된 상태, 없어도 통과
  request.log.debug(
    request.user ? "Authenticated request" : "Unauthenticated request"
  );
}
