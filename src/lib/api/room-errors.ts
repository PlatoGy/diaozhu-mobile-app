import { ZodError } from "zod";

import { AdminAuthConfigurationError } from "@/src/lib/auth/admin";
import { apiErrorResponse } from "@/src/lib/api/errors";
import { DatabaseConfigurationError } from "@/src/lib/db";

export function configurationErrorResponse(error: unknown) {
  if (error instanceof AdminAuthConfigurationError) {
    return apiErrorResponse(
      "ADMIN_AUTH_NOT_CONFIGURED",
      "Admin authentication is not configured.",
      503,
    );
  }

  if (error instanceof DatabaseConfigurationError) {
    return apiErrorResponse(
      "DATABASE_NOT_CONFIGURED",
      "Database connection is not configured.",
      503,
    );
  }

  return null;
}

export function validationErrorMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Request validation failed.";
}
