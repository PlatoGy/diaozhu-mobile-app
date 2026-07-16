import { afterEach, describe, expect, it } from "vitest";

import { AdminAuthConfigurationError, verifyAdminSecret } from "./admin";

const originalAdminSecret = process.env.ADMIN_SECRET;

afterEach(() => {
  process.env.ADMIN_SECRET = originalAdminSecret;
});

describe("verifyAdminSecret", () => {
  it("accepts the configured admin secret", () => {
    process.env.ADMIN_SECRET = "correct horse battery staple";

    expect(verifyAdminSecret("correct horse battery staple")).toBe(true);
  });

  it("rejects other values", () => {
    process.env.ADMIN_SECRET = "correct horse battery staple";

    expect(verifyAdminSecret("wrong")).toBe(false);
  });

  it("fails closed when ADMIN_SECRET is missing", () => {
    delete process.env.ADMIN_SECRET;

    expect(() => verifyAdminSecret("anything")).toThrow(AdminAuthConfigurationError);
  });
});
