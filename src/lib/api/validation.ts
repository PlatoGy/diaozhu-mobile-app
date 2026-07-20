import { z } from "zod";

export const emptyQuerySchema = z.object({}).strict();

export function searchParamsToRecord(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(searchParams.entries());
}
