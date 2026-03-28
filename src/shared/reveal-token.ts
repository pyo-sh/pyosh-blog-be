import { createHash, randomBytes } from "node:crypto";

export function generateRevealToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRevealToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
