import { neon, Pool, type NeonQueryFunction, type PoolClient } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null = null;
let cachedPool: Pool | null = null;

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is required for server-side database access.",
    );
  }

  return databaseUrl;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!cachedSql) {
    cachedSql = neon(getDatabaseUrl());
  }

  return cachedSql;
}

export function getPool(): Pool {
  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }

  return cachedPool;
}

export async function withDatabaseTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
