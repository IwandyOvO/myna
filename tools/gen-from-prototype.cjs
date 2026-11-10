// Generates checked-in data files from tools/prototype-data.json.
// node tools/gen-from-prototype.cjs
const fs = require('fs'), path = require('path');
const d = require('./prototype-data.json');
const root = path.join(__dirname, '..');

// Keys that only made sense in the prototype (demo toasts, fake scan copy, the
// generic scale hints that leak the old 屎 wording, the "24h" blind copy that
// contradicts spec §4.4). They are dropped or redefined in i18n/overrides.ts.
const DROP = /^(toast_|scan_|load[123]$|src_|paste_|menu_|title_ph|desc_ph|scale_hint_|blind_sub$)/;
const dict = {};
for (const lang of Object.keys(d.STR)) {
  dict[lang] = {};
  for (const [k, v] of Object.entries({ ...d.STR[lang], ...d.XT[lang] })) if (!DROP.test(k)) dict[lang][k] = v;
}
fs.writeFileSync(path.join(root, 'packages/shared/src/i18n/base.json'), JSON.stringify(dict, null, 1) + '\n');

const seed = { posts: d.posts, boards: d.RANK, commentPools: d.POOLS, badges: d.BADGES, cities: d.LOCS };
fs.mkdirSync(path.join(root, 'apps/server/src/db'), { recursive: true });
fs.writeFileSync(path.join(root, 'apps/server/src/db/seed-data.json'), JSON.stringify(seed, null, 1) + '\n');
console.log('ok', Object.keys(dict.en).length, 'keys');
