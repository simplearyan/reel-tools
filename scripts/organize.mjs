#!/usr/bin/env node
/**
 * scripts/organize.mjs
 * Sorts a messy folder of saved .html apps into the repo skeleton.
 * Zero dependencies. Node 18+. Safe by default: it only prints a plan.
 *
 *   node scripts/organize.mjs "D:/studios/REEL-Studio"                 dry run, prints the plan
 *   node scripts/organize.mjs "D:/studios/REEL-Studio" --apply         copy files into the repo
 *   node scripts/organize.mjs "D:/studios/REEL-Studio" --apply --move  move instead of copy
 *
 * Options
 *   --out <dir>        repo root to build (default: current folder)
 *   --config <file>    rename/merge rules (default: organize.config.json, created if missing)
 *   --min-kb <n>       files smaller than this go to _unsorted/small (default 5)
 *
 * How a file is understood
 *   "Cutout Studio (27).html"  ->  app "Cutout Studio", copy number 27
 *   "Keyer – remove video backgrounds (5).html" -> app "Keyer" (text after a spaced dash is dropped)
 *   Browsers number repeat saves: no number = oldest, (2), (3)... = newer.
 *
 * Order inside one app (oldest -> newest): copy number, then file size, then modified time.
 * Newest  -> apps/<slug>/index.html
 * Older   -> apps/<slug>/versions/v1.html, v2.html ... (v1 = oldest)
 * Identical copies (same SHA-256) are kept once and listed in the report.
 * Nothing is ever deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const SRC = argv.find((a) => !a.startsWith('--') && a !== opt('--out') && a !== opt('--config') && a !== opt('--min-kb'));
if (!SRC || !fs.existsSync(SRC)) { console.error('Usage: node scripts/organize.mjs <source-folder> [--apply] [--move] [--out dir]'); process.exit(1); }
const OUT = path.resolve(opt('--out', '.'));
const APPLY = flag('--apply'), MOVE = flag('--move');
const MIN_KB = +opt('--min-kb', 5);
const CFG_FILE = path.resolve(opt('--config', path.join(OUT, 'organize.config.json')));

// ---------- config (rename and merge rules) ----------
const DEFAULT_CFG = {
  _help: 'aliases: detected slug (short name, or full title slug) -> the app slug you want; merges names into one app. names: display name per app slug. pages: slugs that are website pages, not apps (go to _unsorted/pages). ignore: slugs to leave in _unsorted/small.',
  aliases: { reel: 'reel-studio' },
  names: {},
  pages: [],
  ignore: [],
};
let cfg = DEFAULT_CFG;
if (fs.existsSync(CFG_FILE)) cfg = { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) };
else if (APPLY) { fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(DEFAULT_CFG, null, 2) + '\n'); }

// ---------- helpers ----------
const slugify = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const kb = (b) => (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const date = (t) => new Date(t).toISOString().slice(0, 10);

function parse(file) {
  let base = file.replace(/\.html?$/i, '').trim();
  const m = /\s*\((\d+)\)\s*$/.exec(base);                        // browser copy number
  const num = m ? +m[1] : 0;
  if (m) base = base.slice(0, m.index).trim();
  const name = base.split(/\s+[—–-]\s+/)[0].replace(/[…]+$/, '').trim() || base;   // drop " — tagline"
  return { name, num, title: base };
}

// ---------- scan ----------
const files = fs.readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.html?$/i.test(d.name))
  .map((d) => {
    const full = path.join(SRC, d.name), st = fs.statSync(full), p = parse(d.name);
    return { file: d.name, full, size: st.size, mtime: st.mtimeMs, ...p, slug: slugify(p.name), tslug: slugify(p.title) };
  });
if (!files.length) { console.log('No .html files found in ' + SRC); process.exit(0); }

const small = files.filter((f) => f.size < MIN_KB * 1024), pageFiles = [];
const groups = new Map();
for (const f of files.filter((f) => f.size >= MIN_KB * 1024)) {
  const slug = cfg.aliases[f.tslug] || cfg.aliases[f.slug] || f.slug;
  if (cfg.pages.includes(slug) || cfg.pages.includes(f.slug)) { pageFiles.push(f); continue; }
  if (cfg.ignore.includes(slug) || cfg.ignore.includes(f.slug)) { small.push(f); continue; }
  if (!groups.has(slug)) groups.set(slug, { slug, name: cfg.names[slug] || f.name, items: [] });
  groups.get(slug).items.push(f);
}

// ---------- order versions and flag doubtful ones ----------
const plan = [], warnings = [];
for (const g of [...groups.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  // Copy numbers only compare inside one exact title; across different titles each title has its own counter, so use the date there.
  const mixed = new Set(g.items.map((i) => i.tslug)).size > 1;
  g.items.sort(mixed ? (a, b) => Math.round(a.mtime / 60000) - Math.round(b.mtime / 60000) || a.num - b.num || a.size - b.size : (a, b) => a.num - b.num || a.size - b.size || a.mtime - b.mtime);
  if (mixed) warnings.push(`${g.slug}: merged ${new Set(g.items.map((i) => i.tslug)).size} different titles, ordered by modified date (copy numbers are not comparable across titles)`);
  const seen = new Map(), keep = [], dupes = [];
  for (const it of g.items) {
    const h = sha(it.full);
    if (seen.has(h)) dupes.push([it, seen.get(h)]); else { seen.set(h, it); keep.push(it); }
  }
  for (let i = 1; i < keep.length; i++) {
    const a = keep[i - 1], b = keep[i];
    if (a.tslug !== b.tslug) continue;
    if (b.mtime + 60000 < a.mtime) warnings.push(`${g.slug}: "${b.file}" has a higher number but an older date than "${a.file}"`);
    if (b.size < a.size * 0.7) warnings.push(`${g.slug}: "${b.file}" is ${Math.round((1 - b.size / a.size) * 100)}% smaller than the previous copy "${a.file}"; check it is really the newest`);
  }
  plan.push({ ...g, name: cfg.names[g.slug] || keep[keep.length - 1].name, keep, dupes, latest: keep[keep.length - 1], older: keep.slice(0, -1) });
}

// ---------- print the plan ----------
const out = [];
out.push(`# Organise plan\n\nSource: ${path.resolve(SRC)}\nTarget: ${OUT}\nMode: ${APPLY ? (MOVE ? 'apply (move)' : 'apply (copy)') : 'dry run'}\n`);
for (const g of plan) {
  out.push(`## apps/${g.slug}  (${g.name})`);
  out.push(`- index.html  <-  ${g.latest.file}  [${kb(g.latest.size)}, ${date(g.latest.mtime)}]  LATEST`);
  g.older.forEach((o, i) => out.push(`- versions/v${i + 1}.html  <-  ${o.file}  [${kb(o.size)}, ${date(o.mtime)}]`));
  g.dupes.forEach(([d, k]) => out.push(`- skipped duplicate  ${d.file}  (identical to ${k.file})`));
  out.push('');
}
if (pageFiles.length) { out.push('## _unsorted/pages (website pages, not apps)'); pageFiles.forEach((f) => out.push(`- ${f.file}  [${kb(f.size)}]`)); out.push(''); }
if (small.length) { out.push('## _unsorted/small'); small.forEach((f) => out.push(`- ${f.file}  [${kb(f.size)}]`)); out.push(''); }
if (warnings.length) { out.push('## Check these'); warnings.forEach((w) => out.push('- ' + w)); out.push(''); }
out.push(`Totals: ${plan.length} apps, ${plan.reduce((n, g) => n + g.keep.length, 0)} files kept, ${plan.reduce((n, g) => n + g.dupes.length, 0)} duplicates skipped, ${small.length} small files, ${pageFiles.length} page files.`);
console.log(out.join('\n'));

if (!APPLY) { console.log('\nDry run only. Edit organize.config.json if names are wrong, then add --apply.'); process.exit(0); }

// ---------- apply ----------
const put = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (MOVE) { try { fs.renameSync(from, to); } catch { fs.copyFileSync(from, to); fs.unlinkSync(from); } } else fs.copyFileSync(from, to);
};
for (const d of ['apps', 'shared', 'scripts', 'docs', '.github/workflows', '_unsorted']) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const k = path.join(OUT, d, '.gitkeep');
  if (!fs.readdirSync(path.join(OUT, d)).filter((x) => x !== '.gitkeep').length) fs.writeFileSync(k, '');
}
const gi = path.join(OUT, '.gitignore');
if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'dist/\nnode_modules/\n.DS_Store\n_unsorted/\n');
const pj = path.join(OUT, 'package.json');
if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: 'reel', private: true, type: 'module', scripts: { organize: 'node scripts/organize.mjs', init: 'node scripts/init-apps.mjs' } }, null, 2) + '\n');

for (const g of plan) {
  const dir = path.join(OUT, 'apps', g.slug);
  put(g.latest.full, path.join(dir, 'index.html'));
  g.older.forEach((o, i) => put(o.full, path.join(dir, 'versions', `v${i + 1}.html`)));
  const meta = path.join(dir, 'app.json');
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ name: g.name, slug: g.slug, status: 'stable' }, null, 2) + '\n');
  const map = { latest: { file: g.latest.file, size: g.latest.size, modified: date(g.latest.mtime) }, versions: g.older.map((o, i) => ({ id: `v${i + 1}`, file: o.file, size: o.size, modified: date(o.mtime) })), duplicates: g.dupes.map(([d]) => d.file) };
  fs.writeFileSync(path.join(dir, 'versions.json'), JSON.stringify(map, null, 2) + '\n');
}
for (const f of small) put(f.full, path.join(OUT, '_unsorted', 'small', f.file));
for (const f of pageFiles) put(f.full, path.join(OUT, '_unsorted', 'pages', f.file));
fs.writeFileSync(path.join(OUT, 'organize-report.md'), out.join('\n') + '\n');
console.log(`\nDone. Report: ${path.join(OUT, 'organize-report.md')}\nNext: node scripts/init-apps.mjs  (fills the rest of each app.json)`);
