/**
 * Make a user a moderator:   npm run admin:grant -- <handle>
 * Remove it:                 npm run admin:grant -- <handle> --revoke
 */
import { loadConfig, loadDotEnv } from '../config';
import { createPool } from './pool';

loadDotEnv();
const [handle, flag] = process.argv.slice(2);
if (!handle) {
  console.error('usage: npm run admin:grant -- <handle> [--revoke]');
  process.exit(1);
}
const db = createPool(loadConfig().databaseUrl);
const role = flag === '--revoke' ? 'user' : 'admin';
const r = await db.query('UPDATE users SET role = $2 WHERE handle = $1 AND deleted_at IS NULL RETURNING nickname', [handle.replace(/^@/, ''), role]);
console.log(r.rowCount ? `@${handle} (${r.rows[0].nickname}) is now ${role}` : `no user with handle @${handle}`);
await db.end();
process.exit(r.rowCount ? 0 : 1);
