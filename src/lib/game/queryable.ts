import { getSql } from "../db";

export type GameQueryable = {
  query: (queryText: string, params: unknown[]) => Promise<unknown[]>;
};

export function getGameQueryable(): GameQueryable {
  const sql = getSql();

  return {
    query: (queryText, params) => sql.query(queryText, params) as Promise<unknown[]>,
  };
}
