import { createHash, timingSafeEqual } from "node:crypto";

export class AdminAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthConfigurationError";
  }
}

function getAdminSecret(): string {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    throw new AdminAuthConfigurationError("ADMIN_SECRET is required for admin APIs.");
  }

  return adminSecret;
}

function sha256Buffer(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminSecret(candidate: string): boolean {
  const expectedHash = sha256Buffer(getAdminSecret());
  const candidateHash = sha256Buffer(candidate);

  return timingSafeEqual(expectedHash, candidateHash);
}

export function readAdminSecretHeader(request: Request): string | null {
  return request.headers.get("x-admin-secret");
}
