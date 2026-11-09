#!/usr/bin/env node
/**
 * scripts/inspect.mjs - looks inside apps and folders. Used by the dashboard, the tests and the command line.
 *
 *   npm run inspect cutout-studio     report for one app (size breakdown, scripts, hosts, versions, files)
 *   npm run inspect -- --repo         folder sizes, biggest files, git status
 *   npm run smoke                     automatic health tests for every app (exit 1 if any FAIL)
 *
 * Nothing is executed: scripts are only compiled to catch syntax errors, never run.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIDE = new Set(['.git', 'node_modules']);
const TEXT = new Set(['.json', '.md', '.mjs', '.js', '.html', '.htm', '.css', '.txt', '.yml', '.yaml', '.svg', '.xml', '.gitignore', '']);
const MB = 1048576;
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return e; } };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ---------- HTML analysis (cached by path, size and modified time) ----------
const DATA_URI = /data:[a-z0-9.+\-/]+;base64,[A-Za-z0-9+/=%]+/gi;
const FEATURES = [['localStorage', /\blocalStorage\b/], ['IndexedDB', /\bindexedDB\b/], ['MediaRecorder', /\bMediaRecorder\b/], ['WebGL', /getContext\(\s*['"](?:webgl2?|experimental-webgl)['"]/], ['WebGPU', /navigator\.gpu\b/], ['Web Audio', /\b(?:AudioContext|webkitAudioContext)\b/], ['WebCodecs', /\b(?:VideoEncoder|VideoDecoder|AudioEncoder)\b/], ['Web Workers', /new\s+Worker\(/], ['WebAssembly', /\bWebAssembly\b/], ['Service worker', /serviceWorker\.register/], ['File picker', /showOpenFilePicker|showSaveFilePicker/], ['eval', /\beval\(|new\s+Function\(/]];
const cache = new Map();

export function analyzeHtml(html) {
  let dataBytes = 0;
  const clean = html.replace(DATA_URI, (m) => { dataBytes += m.length; return 'data:'; });
  const syntax = [], ext = [];
  let inline = 0, inlineBytes = 0, skipped = 0, m;
  const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  while ((m = reScript.exec(clean))) {
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1];
    if (src) { ext.push(src); continue; }
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1] || '').toLowerCase();
    inline++; inlineBytes += m[2].length;
    if (type && !/^(?:text|application)\/(?:javascript|ecmascript)$/.test(type)) { skipped++; continue; }   // json, modules, templates
    try { new vm.Script(m[2], { filename: `script${inline}` }); } catch (e) { syntax.push({ n: inline, message: e.message, line: +(new RegExp(`script${inline}:(\\d+)`).exec(e.stack)?.[1] || 0) }); }
  }
  let styleBytes = 0; for (const s of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styleBytes += s[1].length;
  const hosts = new Map();
  for (const u of clean.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!/(?:^|\.)(?:w3\.org|schema\.org)$/i.test(u[1])) hosts.set(u[1].toLowerCase(), (hosts.get(u[1].toLowerCase()) || 0) + 1);
  const insecure = [...clean.matchAll(/\b(?:src|href)\s*=\s*["'](http:\/\/(?!www\.w3\.org)[^"']+)/gi)].map((x) => x[1]);
  const total = html.length;
  return {
    chars: total, title: (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1] || '').replace(/\s+/g, ' ').trim(),
    description: (/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(clean)?.[1] || '').trim(),
    h1: (clean.match(/<h1\b/gi) || []).length, viewport: /<meta[^>]+name=["']viewport/i.test(clean), lang: /<html[^>]+\blang=/i.test(clean),
    hasHtml: /<html[\s>]/i.test(clean), closed: /<\/html>\s*$/i.test(clean.trimEnd()) || /<\/html>/i.test(clean),
    scripts: { inline, skipped, external: ext, inlineBytes }, styleBytes, dataBytes, otherBytes: Math.max(0, total - inlineBytes - styleBytes - dataBytes),
    syntax, insecure, hosts: [...hosts].sort((a, b) => b[1] - a[1]).slice(0, 12),
    features: FEATURES.filter(([, re]) => re.test(clean)).map(([n]) => n), todo: (clean.match(/\b(?:TODO|FIXME)\b/g) || []).length,
  };
}
export function analyzeFile(file) {
  const st = fs.statSync(file), key = `${file}|${st.size}|${st.mtimeMs}`;
  if (!cache.has(key)) { if (cache.size > 300) cache.clear(); cache.set(key, { bytes: st.size, ...analyzeHtml(fs.readFileSync(file, 'utf8')) }); }
  return cache.get(key);
}

// ---------- per-app health tests ----------
const miss = (x) => !x || /^TODO/i.test(String(x));
export function smokeTests(root, slug) {
  const dir = path.join(root, 'apps', slug), idx = path.join(dir, 'index.html'), T = [];
  const t = (id, label, status, detail = '') => T.push({ id, label, status, detail });
  if (!fs.existsSync(idx)) { t('index', 'Has index.html', 'fail', 'apps/' + slug + '/index.html is missing'); return T; }
  const a = analyzeFile(idx), size = a.bytes;
  t('index', 'Has index.html', 'pass');
  t('html', 'Complete HTML page', a.hasHtml && a.closed ? 'pass' : 'warn', a.hasHtml ? (a.closed ? '' : 'no closing </html> (file may be cut off)') : 'no <html> tag');
  t('scripts', 'Inline scripts compile', a.syntax.length ? 'fail' : 'pass', a.syntax.map((s) => `script #${s.n}${s.line ? ' line ' + s.line : ''}: ${s.message}`).join('; '));
  t('https', 'No insecure http:// resources', a.insecure.length ? 'fail' : 'pass', a.insecure.slice(0, 3).join(', '));
  t('viewport', 'Responsive meta viewport', a.viewport ? 'pass' : 'warn', a.viewport ? '' : 'add <meta name="viewport" content="width=device-width, initial-scale=1">');
  t('title', 'Has a <title>', a.title ? 'pass' : 'warn');
  t('size', 'Reasonable file size', size > 95 * MB ? 'fail' : size > 8 * MB ? 'warn' : 'pass', `${(size / MB).toFixed(size > MB ? 1 : 2)} MB${a.dataBytes > size * 0.5 ? ' (mostly embedded data)' : ''}`);
  const meta = rj(path.join(dir, 'app.json'));
  t('appjson', 'app.json is valid', meta instanceof Error ? 'fail' : meta ? 'pass' : 'warn', meta instanceof Error ? meta.message : meta ? '' : 'missing; run npm run init');
  const m = meta && !(meta instanceof Error) ? meta : {};
  t('meta', 'Tagline, description and tags set', miss(m.tagline) || miss(m.description) || !(m.tags || []).length ? 'warn' : 'pass', [miss(m.tagline) && 'tagline', miss(m.description) && 'description', !(m.tags || []).length && 'tags'].filter(Boolean).map((x) => 'missing ' + x).join(', '));
  const vdir = path.join(dir, 'versions'), vs = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^v\d+\.html$/.test(f)).map((f) => +f.slice(1, -5)).sort((x, y) => x - y) : [];
  const gaps = vs.some((n, i) => n !== i + 1), empty = vs.filter((n) => fs.statSync(path.join(vdir, `v${n}.html`)).size < 100);
  t('versions', 'Versions are numbered v1, v2 ... without gaps', gaps || empty.length ? 'warn' : 'pass', gaps ? 'numbers skip: ' + vs.join(', ') : empty.length ? 'empty file: v' + empty.join(', v') : vs.length ? `${vs.length} older versions` : 'no older versions');
  return T;
}
export const smokeAll = (root = HERE) => {
  const apps = fs.existsSync(path.join(root, 'apps')) ? fs.readdirSync(path.join(root, 'apps'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort() : [];
  const out = apps.map((slug) => ({ slug, tests: smokeTests(root, slug) }));
  const sum = { pass: 0, warn: 0, fail: 0 }; out.forEach((a) => a.tests.forEach((x) => sum[x.status]++));
  return { apps: out, summary: sum };
};

// ---------- one app in detail ----------
function walk(dir, base, out = [], depth = 3) {
  if (!fs.existsSync(dir) || depth < 0) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const f = path.join(dir, e.name), st = fs.statSync(f);
    out.push({ path: path.relative(base, f).split(path.sep).join('/'), type: e.isDirectory() ? 'dir' : 'file', size: e.isDirectory() ? 0 : st.size, mtime: st.mtime.toISOString().slice(0, 10) });
    if (e.isDirectory()) walk(f, base, out, depth - 1);
  }
  return out;
}
export function inspectApp(root, slug) {
  const dir = path.join(root, 'apps', slug);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !fs.existsSync(dir)) throw new Error('unknown app');
  const idx = path.join(dir, 'index.html'), vdir = path.join(dir, 'versions'), meta = rj(path.join(dir, 'app.json'));
  const latestHash = fs.existsSync(idx) ? sha(idx) : '';
  let prev = fs.existsSync(idx) ? null : null;
  const versions = (fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^v\d+\.html$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))) : []).map((f) => {
    const p = path.join(vdir, f), st = fs.statSync(p), row = { id: f.slice(0, -5), size: st.size, modified: st.mtime.toISOString().slice(0, 10), delta: prev === null ? null : st.size - prev, sameAsLatest: sha(p) === latestHash };
    prev = st.size; return row;
  });
  const latest = fs.existsSync(idx) ? { size: fs.statSync(idx).size, delta: versions.length ? fs.statSync(idx).size - versions[versions.length - 1].size : null } : null;
  return { slug, meta: meta instanceof Error ? { error: meta.message } : meta || {}, analysis: fs.existsSync(idx) ? analyzeFile(idx) : null, tests: smokeTests(root, slug), versions, latest, files: walk(dir, dir) };
}

// ---------- folders ----------
function dirSize(dir, state, top) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) n += HIDE.has(e.name) ? 0 : dirSize(f, state, top);
    else { const s = fs.statSync(f).size; n += s; state.files++; top.push([path.relative(state.root, f).split(path.sep).join('/'), s]); }
  }
  return n;
}
const git = (root, ...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
export function repoOverview(root = HERE) {
  const state = { root, files: 0 }, top = [], folders = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    folders.push({ name: e.name, locked: HIDE.has(e.name), size: HIDE.has(e.name) ? null : dirSize(path.join(root, e.name), state, top) });
  }
  let rootFiles = 0; for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isFile()) { const s = fs.statSync(path.join(root, e.name)).size; rootFiles += s; top.push([e.name, s]); }
  folders.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));
  const isGit = fs.existsSync(path.join(root, '.git'));
  return {
    root, folders, rootFiles, files: state.files, total: folders.reduce((n, f) => n + (f.size || 0), 0) + rootFiles,
    biggest: top.sort((a, b) => b[1] - a[1]).slice(0, 12).map(([file, size]) => ({ file, size })),
    git: isGit ? { branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), remote: git(root, 'remote', 'get-url', 'origin'), changed: git(root, 'status', '--porcelain').split('\n').filter(Boolean).length, last: git(root, 'log', '-1', '--format=%s (%cr)') } : null,
  };
}
const safe = (root, rel) => {
  const parts = String(rel || '').split(/[\\/]+/).filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..' || HIDE.has(p))) throw new Error('not allowed');
  const abs = path.resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('not allowed');
  return { abs, rel: parts.join('/') };
};
export function browse(root, rel) {
  const { abs, rel: r } = safe(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error('not a folder');
  const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => { const st = fs.statSync(path.join(abs, e.name)); return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: e.isDirectory() ? fs.readdirSync(path.join(abs, e.name)).length : st.size, mtime: st.mtime.toISOString().slice(0, 10), locked: HIDE.has(e.name) }; })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  return { path: r, entries };
}
export function readText(root, rel, limit = 150000) {
  const { abs, rel: r } = safe(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error('not a file');
  const size = fs.statSync(abs).size, ext = path.extname(abs).toLowerCase();
  if (!TEXT.has(ext)) return { path: r, size, binary: true };
  const fd = fs.openSync(abs, 'r'), buf = Buffer.alloc(Math.min(size, limit)); fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  return { path: r, size, text: buf.toString('utf8'), truncated: size > limit };
}

// ---------- command line ----------
const kb = (b) => (b >= MB ? (b / MB).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const icon = { pass: 'ok  ', warn: 'warn', fail: 'FAIL' };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), root = HERE;
  if (args.includes('--smoke')) {
    const r = smokeAll(root);
    for (const a of r.apps) for (const x of a.tests) if (x.status !== 'pass') console.log(`${icon[x.status]}  ${a.slug.padEnd(22)} ${x.label}${x.detail ? ': ' + x.detail : ''}`);
    console.log(`\n${r.apps.length} apps: ${r.summary.pass} passed, ${r.summary.warn} warnings, ${r.summary.fail} failed`);
    process.exit(r.summary.fail ? 1 : 0);
  } else if (args.includes('--repo')) {
    const o = repoOverview(root);
    console.log(`Total ${kb(o.total)} in ${o.files} files\n`); o.folders.forEach((f) => console.log(`  ${f.name.padEnd(18)} ${f.size === null ? '(not scanned)' : kb(f.size)}`));
    console.log('\nBiggest files:'); o.biggest.forEach((f) => console.log(`  ${kb(f.size).padStart(9)}  ${f.file}`));
    if (o.git) console.log(`\ngit: ${o.git.branch}, ${o.git.changed} changed files, last: ${o.git.last}\nremote: ${o.git.remote || 'none'}`);
  } else if (args[0]) {
    const r = inspectApp(root, args[0]), a = r.analysis;
    console.log(`${r.meta.name || r.slug}  (${r.slug})\n`);
    if (a) {
      console.log(`Size ${kb(r.latest.size)}: scripts ${kb(a.scripts.inlineBytes)}, styles ${kb(a.styleBytes)}, embedded data ${kb(a.dataBytes)}, other ${kb(a.otherBytes)}`);
      console.log(`Title: ${a.title || '-'}\nFeatures: ${a.features.join(', ') || '-'}\nExternal hosts: ${a.hosts.map(([h, n]) => `${h} (${n})`).join(', ') || 'none (fully offline)'}\n`);
    }
    r.tests.forEach((x) => console.log(`${icon[x.status]}  ${x.label}${x.detail ? ': ' + x.detail : ''}`));
    if (r.versions.length) { console.log('\nVersions:'); r.versions.forEach((v) => console.log(`  ${v.id.padEnd(5)} ${kb(v.size).padStart(9)}  ${v.modified}${v.delta === null ? '' : '  ' + (v.delta >= 0 ? '+' : '-') + kb(Math.abs(v.delta))}${v.sameAsLatest ? '  (same as current)' : ''}`)); }
  } else console.log('Usage: npm run inspect <app>  |  npm run inspect -- --repo  |  npm run smoke');
}
