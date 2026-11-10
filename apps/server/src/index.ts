import { buildApp } from './app';
import { loadConfig } from './config';
import { migrate } from './db/migrate';
import { createPool } from './db/pool';

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);
const app = buildApp({ db, config });
await app.listen({ port: config.port, host: '0.0.0.0' });
