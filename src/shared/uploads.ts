import * as path from "path";

export const UPLOADS_URL_PREFIX = "/uploads/";

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export function toUploadUrl(storageKey: string): string {
  return `${UPLOADS_URL_PREFIX}${storageKey.replace(/\\/g, "/")}`;
}
