import { buildApp } from './app';
import { loadConfig, loadDotEnv } from './config';
import { migrate } from './db/migrate';
import { createPool } from './db/pool';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);
const app = buildApp({ db, config });
await app.listen({ port: config.port, host: '0.0.0.0' });

// §6: settle last month's boards once the month is over (checks hourly; idempotent across instances).
const settle = () => app.runSeasonJob().catch((e) => app.log.error({ err: e }, 'season job failed'));
void settle();
const timer = setInterval(settle, 60 * 60_000);
timer.unref();
