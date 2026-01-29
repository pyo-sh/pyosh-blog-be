import { PaginationMeta } from "@src/schemas/common";

/**
 * 페이지네이션 offset 계산
 * @param page 페이지 번호 (1부터 시작)
 * @param limit 페이지당 항목 수
 * @returns offset 값
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * 전체 페이지 수 계산
 * @param total 전체 항목 수
 * @param limit 페이지당 항목 수
 * @returns 전체 페이지 수
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * 페이지네이션 응답 메타 생성
 * @param page 현재 페이지
 * @param limit 페이지당 항목 수
 * @param total 전체 항목 수
 * @returns 페이지네이션 메타 정보
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: calculateTotalPages(total, limit),
  };
}

/**
 * 페이지네이션 응답 생성
 * @param data 데이터 배열
 * @param page 현재 페이지
 * @param limit 페이지당 항목 수
 * @param total 전체 항목 수
 * @returns 페이지네이션 응답 객체
 */
export function buildPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
) {
  return {
    data,
    meta: buildPaginationMeta(page, limit, total),
  };
}
