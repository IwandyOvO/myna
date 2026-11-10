import { buildApp } from './app';
import { loadConfig, loadDotEnv } from './config';
import { migrate } from './db/migrate';
import { createPool } from './db/pool';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.databaseUrl, config.dbPoolMax);
await migrate(db);
const app = buildApp({ db, config });
await app.listen({ port: config.port, host: '0.0.0.0' });

// §6: settle last month's boards once the month is over (checks hourly; idempotent across instances).
const settle = () => app.runSeasonJob().catch((e) => app.log.error({ err: e }, 'season job failed'));
void settle();
const timer = setInterval(settle, 60 * 60_000);
timer.unref();

// Graceful shutdown: stop accepting requests, finish in-flight ones, close the pool.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, async () => {
    app.log.info({ sig }, 'shutting down');
    clearInterval(timer);
    await app.close();
    await db.end();
    process.exit(0);
  });
}
