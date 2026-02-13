import { FastifyRequest } from "fastify";
import { HttpError } from "@src/errors/http-error";
import { AdminService } from "@src/routes/auth/admin.service";

/**
 * OAuth 세션 기반 인증 확인 preHandler 훅
 * request.user가 없으면 401 Unauthorized 반환
 */
export async function requireAuth(request: FastifyRequest) {
  if (!request.user) {
    throw HttpError.unauthorized("Authentication required");
  }
}

/**
 * 선택적 인증 확인 (인증되지 않아도 통과)
 * request.user가 있으면 인증된 상태, 없으면 비인증 상태
 */
export async function optionalAuth(request: FastifyRequest) {
  // request.user가 있으면 인증된 상태, 없어도 통과
  request.log.debug(
    request.user ? "Authenticated request" : "Unauthenticated request",
  );
}

/**
 * 관리자 인증 확인 preHandler 훅 (Factory)
 * 세션에서 adminId를 확인하고, admin 정보를 request.admin에 설정
 * @param adminService AdminService 인스턴스
 * @returns preHandler 훅 함수
 */
export function requireAdmin(adminService: AdminService) {
  return async (request: FastifyRequest) => {
    const adminId = request.session.get("adminId") as number | undefined;

    if (!adminId) {
      throw HttpError.forbidden("Admin privileges required.");
    }

    // Admin 정보 조회
    const admin = await adminService.getAdminById(adminId);

    // request.admin에 어태치
    request.admin = admin;
  };
}
