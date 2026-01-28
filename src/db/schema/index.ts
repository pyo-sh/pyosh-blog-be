/**
 * Schema Index - Re-export hub for all tables and relations
 */

// Tables
export * from "./sessions";
export * from "./users"; // Legacy - Phase 2에서 제거 예정
export * from "./images"; // Legacy - Phase 2에서 제거 예정
export * from "./admins";
export * from "./oauth-accounts";
export * from "./categories";
export * from "./tags";
export * from "./assets";
export * from "./posts";
export * from "./post-tags";
export * from "./comments";
export * from "./guestbook";
export * from "./stats";

// Relations
export * from "../relations/index";

// Types (각 테이블에서 export됨)
