// One-off extractor: pulls dictionaries, badges, seed posts and boards out of the
// v0.8 prototype into JSON so shared/server code uses the exact same copy.
// Usage: node tools/extract-prototype.cjs docs/myna-prototype-v0.8.html > tools/prototype-data.json
const vm = require('vm'), fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const pick = (a, b) => lines.slice(a - 1, b).join('\n');
const src = [pick(623, 742), pick(935, 950), pick(1111, 1123)].join('\n');
const ctx = { navigator: { language: 'en' }, localStorage: { getItem() { return null }, setItem() {} },
  document: { documentElement: {}, getElementById() { return {} } }, window: { matchMedia() { return { matches: false } } } };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const keys = ['STR', 'XT', 'SCALES', 'CAT_SCALES', 'CATS_I18N', 'LOCS', 'CONTENT_LANGS', 'EMPTY_LANG_MSG', 'posts', 'RANK', 'POOLS', 'BADGES'];
const out = {};
for (const k of keys) out[k] = vm.runInContext(k, ctx);
process.stdout.write(JSON.stringify(out, null, 1));
