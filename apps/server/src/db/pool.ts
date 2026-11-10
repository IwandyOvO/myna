import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = Db | Tx;

// Return bigint counts as numbers (our counts stay well below 2^53).
pg.types.setTypeParser(20, (v) => Number(v));
// numeric → number (averages).
pg.types.setTypeParser(1700, (v) => Number(v));

export function createPool(url: string, max = 10): Db {
  return new pg.Pool({ connectionString: url, max });
}

export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
