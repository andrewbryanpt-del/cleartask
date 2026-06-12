import { createHash, randomBytes } from "node:crypto";

// Opaque tokens (refresh tokens, invitation tokens) are stored hashed so a
// database leak doesn't expose usable credentials.

export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
