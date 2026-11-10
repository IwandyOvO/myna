#!/usr/bin/env node
/**
 * `npm run dev` — starts the API and the Expo app from one terminal.
 * - API (apps/server, auto-restarts on code changes): only "listening" and errors are shown,
 *   prefixed with [api]; the full log goes to apps/server/dev.log.
 * - Expo keeps the terminal (QR code, press w / r / ?), so it behaves exactly like `npx expo start`.
 * Extra args go to Expo, e.g. `npm run dev -- -c` to clear the bundler cache.
 * Ctrl+C stops both.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const npx = win ? 'npx.cmd' : 'npx';
const say = (msg) => process.stdout.write(`\x1b[36m[api]\x1b[0m ${msg}\n`);

const log = createWriteStream(join(root, 'apps/server/dev.log'), { flags: 'w' });
const api = spawn(npm, ['run', 'dev', '-w', '@myna/server'], { cwd: root, shell: win, stdio: ['ignore', 'pipe', 'pipe'] });

let ready = false;
let buffer = '';
function onApiOutput(chunk) {
  log.write(chunk);
  buffer += chunk.toString();
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry = null;
    try {
      entry = JSON.parse(line);
    } catch {}
    if (entry) {
      if (/listening/i.test(entry.msg ?? '')) {
        if (!ready) say(`ready on port 4000 ✓  (full log: apps/server/dev.log)`);
        ready = true;
      } else if ((entry.level ?? 0) >= 40) say(`\x1b[31m${entry.msg ?? line}\x1b[0m ${entry.err?.message ?? ''}`);
    } else if (!/^>|^\s*$|restarting|Restarting/.test(line)) {
      say(`\x1b[31m${line}\x1b[0m`); // stack traces, missing modules, DB connection errors…
    }
  }
  if (/ECONNREFUSED.*5432|5432.*ECONNREFUSED/.test(chunk.toString())) say('\x1b[33mCannot reach PostgreSQL on port 5432 — is the PostgreSQL service running?\x1b[0m');
  if (/ERR_MODULE_NOT_FOUND|Cannot find package/.test(chunk.toString())) say('\x1b[33mA dependency is missing — run `npm install` in the myna folder, then `npm run dev` again.\x1b[0m');
}
api.stdout.on('data', onApiOutput);
api.stderr.on('data', onApiOutput);

const expo = spawn(npx, ['expo', 'start', ...process.argv.slice(2)], { cwd: join(root, 'apps/mobile'), shell: win, stdio: 'inherit' });

function kill(child) {
  if (!child || child.exitCode !== null) return;
  if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  kill(api);
  kill(expo);
  log.end();
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
expo.on('exit', (code) => stop(code ?? 0));
api.on('exit', (code) => {
  if (!stopping) say(`\x1b[31mAPI stopped (exit ${code}). See the messages above or apps/server/dev.log. The app will show errors until it is restarted.\x1b[0m`);
});
