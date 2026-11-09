#!/usr/bin/env node
/**
 * layout.mjs  - puts every Reel repo file in the right folder, then prints the correct folder tree.
 * Works from anywhere: it treats the CURRENT folder as the repo root.
 *
 *   node layout.mjs                  tidy the repo you are standing in
 *   node layout.mjs --from <folder>  also take new files from that folder (e.g. an unzipped update)
 *   node layout.mjs --dry            show what would happen, change nothing
 *   node layout.mjs --force          take the files from the source even if the installed copy is newer
 *   npm run layout                   same as the first line, once the repo is set up
 *
 * Rules
 *  - Code files (scripts, shared, the workflow) are replaced by the newest copy it can find; the old copy
 *    is saved in _backup/<time>/ first.
 *  - Your own files (site.json, about.md, LICENSE, apps/, organize.config.json) are NEVER overwritten.
 *  - package.json keeps your fields; only its "scripts" are updated.
 *  - Loose copies found in the repo root are moved into place. Copies found inside other folders
 *    (such as an unzipped "files" folder) are copied, and the folder is left for you to delete.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const DRY = argv.includes('--dry'), FORCE = argv.includes('--force');
const ROOT = path.resolve(opt('--root') || process.cwd());
const FROM = opt('--from') ? path.resolve(opt('--from')) : null;
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

// ---------- the correct structure ----------
const CODE = {
  'scripts/admin.mjs': 'dashboard backend (used by dev.mjs)',
  'scripts/archive.mjs': 'npm run archive <app>: save the current file as an older version',
  'scripts/build.mjs': 'npm run build: apps/ -> dist/ with shared SEO, ads, home page',
  'scripts/dev.mjs': 'npm run dev: live preview + dashboard',
  'scripts/doctor.mjs': 'npm run doctor: checks the setup',
  'scripts/init-apps.mjs': 'npm run init: fills each app.json',
  'scripts/layout.mjs': 'npm run layout: this script',
  'scripts/list.mjs': 'npm run list: table of all apps',
  'scripts/new-app.mjs': 'npm run new <app>: starter app',
  'scripts/organize.mjs': 'npm run organize <folder>: sort a messy folder into apps/',
  'scripts/ship.mjs': 'npm run ship "msg": validate, build, commit, push',
  'scripts/validate.mjs': 'npm run validate: checks apps and site settings',
  'shared/admin.html': 'the Reel Dev dashboard page',
  'shared/head.html': 'shared <head> block: favicon, AdSense, analytics',
  'shared/home.template.html': 'home page template (cards, About, License)',
  'shared/seo.mjs': 'shared SEO tags, sitemap',
  '.github/workflows/deploy.yml': 'GitHub Action: build and deploy to GitHub Pages',
};
const OWN = {
  'site.json': 'your site settings (URL, GitHub, Ko-fi, AdSense ...)',
  'about.md': 'text of the About page',
  'LICENSE': 'text of the License page (add one)',
};
const WANT_IGNORE = ['dist/', 'node_modules/', '_trash/', '_backup/', '_unsorted/'];
const KNOWN = { ...Object.fromEntries(Object.keys(CODE).map((t) => [path.basename(t), t])), 'package.json': 'package.json', 'site.json': 'site.json', 'about.md': 'about.md' };
const SKIP_DIRS = new Set(['apps', 'docs', 'scripts', 'shared', '.github', '_unsorted', '_trash', '_backup', 'dist', 'node_modules', '.git']);

// ---------- helpers ----------
const abs = (rel) => path.join(ROOT, ...rel.split('/'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/') || '.';
const WOULD = { installed: 'install', replaced: 'replace', merged: 'merge', kept: 'keep', updated: 'update', moved: 'move' };
const log = (tag, msg) => console.log(`  ${DRY && WOULD[tag] ? 'would ' + WOULD[tag] : tag}`.padEnd(18) + msg);
const mkdir = (d) => { if (!DRY) fs.mkdirSync(d, { recursive: true }); };

function walk(dir, depth, out = []) {
  if (depth < 0 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth - 1, out); else out.push(f);
  }
  return out;
}

// ---------- 1. find candidate sources ----------
const scanDirs = [];
if (FROM) scanDirs.push(FROM);
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) if (e.isDirectory() && !SKIP_DIRS.has(e.name)) scanDirs.push(path.join(ROOT, e.name));
const cands = new Map();                                    // basename -> [{file, mtime, loose}]
const add = (f, loose) => { const n = path.basename(f); if (KNOWN[n] || n === 'layout.mjs') (cands.get(n) || cands.set(n, []).get(n)).push({ file: f, mtime: fs.statSync(f).mtimeMs, loose }); };
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) if (e.isFile()) add(path.join(ROOT, e.name), true);   // loose files in the root
for (const d of scanDirs) for (const f of walk(d, 4)) add(f, false);
// files directly inside scripts/ or shared/ that belong elsewhere (e.g. head.html dropped into scripts/)
for (const d of ['scripts', 'shared']) for (const f of walk(abs(d), 0)) { const n = path.basename(f); const t = KNOWN[n]; if (t && t !== rel(f) && CODE[t]) add(f, true); }

console.log(`\nRepo root: ${ROOT}${DRY ? '   (dry run: nothing is changed)' : ''}\n`);
const summary = { installed: 0, replaced: 0, kept: 0, moved: 0 };
const toDelete = [];

function backup(target) {
  if (!fs.existsSync(target) || DRY) return;
  const b = path.join(ROOT, '_backup', STAMP, rel(target));
  fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(target, b);
}

// ---------- 2. place code files ----------
for (const [targetRel, why] of Object.entries(CODE)) {
  const name = path.basename(targetRel), target = abs(targetRel);
  const list = (cands.get(name) || []).filter((c) => path.resolve(c.file) !== target);
  if (!list.length) continue;
  const best = list.sort((a, b) => b.mtime - a.mtime)[0];
  const have = fs.existsSync(target);
  const same = have && sha(target) === sha(best.file);
  let placed = true;
  if (same) { log('ok', `${targetRel} already up to date`); }
  else if (have && !FORCE && fs.statSync(target).mtimeMs > best.mtime) { log('kept', `${targetRel} (installed copy is newer than ${rel(best.file)}; use --force to replace)`); summary.kept++; placed = false; }
  else {
    backup(target); mkdir(path.dirname(target));
    if (!DRY) fs.copyFileSync(best.file, target);
    log(have ? 'replaced' : 'installed', `${targetRel}  <-  ${rel(best.file)}`); summary[have ? 'replaced' : 'installed']++;
  }
  if (placed) for (const c of list) if (c.loose) toDelete.push(c.file);                           // loose copies are moved, not duplicated
}

// ---------- 3. package.json: keep yours, update scripts ----------
{
  const target = abs('package.json');
  const srcs = (cands.get('package.json') || []).filter((c) => path.resolve(c.file) !== target).sort((a, b) => b.mtime - a.mtime);
  if (srcs.length) {
    let cur = {}; try { cur = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { /* new file */ }
    const nu = JSON.parse(fs.readFileSync(srcs[0].file, 'utf8'));
    const merged = { name: 'reel', private: true, type: 'module', engines: { node: '>=18' }, ...cur, scripts: { ...(cur.scripts || {}), ...(nu.scripts || {}) } };
    if (JSON.stringify(merged) !== JSON.stringify(cur)) { backup(target); if (!DRY) fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n'); log(fs.existsSync(target) ? 'merged' : 'installed', `package.json scripts updated (${Object.keys(nu.scripts || {}).length} commands)`); summary.replaced++; }
    else log('ok', 'package.json already up to date');
    if (srcs[0].loose) toDelete.push(srcs[0].file);
  }
}

// ---------- 4. your own files: only create when missing ----------
for (const name of ['site.json', 'about.md']) {
  const target = abs(name), src = (cands.get(name) || []).filter((c) => path.resolve(c.file) !== target).sort((a, b) => b.mtime - a.mtime)[0];
  if (!fs.existsSync(target) && src) { mkdir(ROOT); if (!DRY) fs.copyFileSync(src.file, target); log('installed', `${name} (you had none)`); summary.installed++; }
  else if (src) log('kept', `${name} is yours; the copy in ${rel(src.file)} was not used`);
  if (src?.loose && fs.existsSync(target)) { /* leave your loose duplicates alone */ }
}

// ---------- 5. .gitignore ----------
{
  const f = abs('.gitignore'), cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  const missing = WANT_IGNORE.filter((l) => !new RegExp(`^${l.replace(/[/.]/g, '\\$&')}$`, 'm').test(cur));
  if (missing.length) { if (!DRY) fs.writeFileSync(f, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n'); log('updated', `.gitignore (+ ${missing.join(' ')})`); }
}

// ---------- 6. clean up moved loose files (after everything is in place) ----------
for (const f of new Set(toDelete)) { if (!DRY) { try { fs.unlinkSync(f); } catch { /* in use */ } } log('moved', `removed loose copy ${rel(f)}`); summary.moved++; }

// ---------- 7. print the correct tree and write docs/STRUCTURE.md ----------
const line = (indent, name, status, note = '') => `${'  '.repeat(indent)}${name.padEnd(30 - indent * 2)} ${status.padEnd(8)} ${note}`;
const apps = fs.existsSync(abs('apps')) ? fs.readdirSync(abs('apps'), { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
const tree = [`${path.basename(ROOT)}/`];
tree.push(line(1, 'apps/', fs.existsSync(abs('apps')) ? 'ok' : 'MISSING', `${apps} apps: apps/<name>/index.html + app.json + versions/vN.html`));
tree.push(line(1, 'docs/', fs.existsSync(abs('docs')) ? 'ok' : '-', 'notes (STRUCTURE.md is written here)'));
for (const dir of ['scripts', 'shared', '.github/workflows']) {
  tree.push(line(1, dir + '/', fs.existsSync(abs(dir)) ? 'ok' : 'MISSING'));
  for (const [t, why] of Object.entries(CODE)) if (t.startsWith(dir + '/')) tree.push(line(2, path.basename(t), fs.existsSync(abs(t)) ? 'ok' : 'MISSING', why));
  if (fs.existsSync(abs(dir))) for (const f of fs.readdirSync(abs(dir), { withFileTypes: true })) if (f.isFile() && !CODE[`${dir}/${f.name}`]) tree.push(line(2, f.name, 'extra', 'not part of the standard repo'));
}
for (const [n, why] of Object.entries({ 'package.json': 'npm commands', ...OWN, 'organize.config.json': 'rename/merge rules for npm run organize', '.gitignore': 'keeps dist/, _trash/ ... out of git' })) tree.push(line(1, n, fs.existsSync(abs(n)) ? 'ok' : (n === 'LICENSE' || n === 'organize.config.json' ? 'optional' : 'MISSING'), why));
const extraRoot = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile() && !['package.json', ...Object.keys(OWN), 'organize.config.json', 'organize-report.md', '.gitignore', 'package-lock.json', 'README.md', 'LICENSE.md', 'LICENSE.txt'].includes(e.name));
for (const e of extraRoot) tree.push(line(1, e.name, 'extra', 'loose file in the root, safe to delete or move'));
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) if (e.isDirectory() && !SKIP_DIRS.has(e.name)) tree.push(line(1, e.name + '/', 'extra', 'leftover folder; delete it once you have what you need'));
console.log('\nCorrect folder structure (ok = present, MISSING = needs a file, extra = not part of the standard repo):\n');
console.log(tree.join('\n'));
const miss = tree.filter((l) => / MISSING /.test(l)).length;
console.log(`\n${summary.installed} installed, ${summary.replaced} replaced, ${summary.kept} kept, ${summary.moved} loose copies moved.${miss ? `\n${miss} file(s) still MISSING: run again with --from <folder with the unzipped update>.` : '\nAll files are in place. Next: npm run doctor, then npm run dev.'}`);
if (!DRY) { mkdir(abs('docs')); fs.writeFileSync(abs('docs/STRUCTURE.md'), '# Repo structure\n\nGenerated by `npm run layout`.\n\n```\n' + tree.join('\n') + '\n```\n'); }
