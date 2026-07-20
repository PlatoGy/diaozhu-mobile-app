import { NextResponse } from "next/server";

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export function apiErrorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}
