import { NextResponse } from "next/server";

import { type ApiError, apiErrorResponse } from "@/src/lib/api/errors";
import { emptyQuerySchema, searchParamsToRecord } from "@/src/lib/api/validation";
import { DatabaseConfigurationError, getSql } from "@/src/lib/db";

export const dynamic = "force-dynamic";

type HealthResponse = {
  ok: true;
  database: "ok";
};

export async function GET(
  request: Request,
): Promise<NextResponse<HealthResponse | ApiError>> {
  const url = new URL(request.url);
  const query = emptyQuerySchema.safeParse(searchParamsToRecord(url.searchParams));

  if (!query.success) {
    return apiErrorResponse(
      "INVALID_QUERY",
      "Health check does not accept query parameters.",
      400,
    );
  }

  try {
    const sql = getSql();

    await sql`select 1`;

    return NextResponse.json({
      ok: true,
      database: "ok",
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return apiErrorResponse(
        "DATABASE_NOT_CONFIGURED",
        "Database connection is not configured.",
        503,
      );
    }

    return apiErrorResponse(
      "DATABASE_UNAVAILABLE",
      "Database health check failed.",
      503,
    );
  }
}
