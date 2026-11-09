#!/usr/bin/env node
/**
 * scripts/init-apps.mjs
 * Creates a missing apps/<slug>/app.json by reading the app's own HTML.
 * Zero dependencies. Needs Node 18+.
 *
 *   node scripts/init-apps.mjs              create missing app.json, fill missing keys
 *   node scripts/init-apps.mjs --dry        show what would be written, change nothing
 *   node scripts/init-apps.mjs --move       first move loose apps/foo.html into apps/foo/index.html
 *   node scripts/init-apps.mjs --force      regenerate app.json from scratch (overwrites)
 *   node scripts/init-apps.mjs --app cutout only this app
 *
 * Existing values are never overwritten unless you pass --force.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = path.join(ROOT, 'apps');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.includes('--app') ? args[args.indexOf('--app') + 1] : null;
const DRY = has('--dry'), FORCE = has('--force'), MOVE = has('--move');

const slugify = (s) =>
  s.toLowerCase().replace(/\.html?$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const titleCase = (s) => s.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

if (!fs.existsSync(APPS)) { console.error('No apps/ folder found at ' + APPS); process.exit(1); }

// 1. optionally move loose files into their own folders
if (MOVE) {
  for (const f of fs.readdirSync(APPS)) {
    if (!/\.html?$/i.test(f)) continue;
    const dir = path.join(APPS, slugify(f));
    if (fs.existsSync(path.join(dir, 'index.html'))) { console.warn(`skip move: ${f} (apps/${slugify(f)}/index.html exists)`); continue; }
    console.log(`${DRY ? '[dry] ' : ''}move apps/${f} -> apps/${slugify(f)}/index.html`);
    if (!DRY) { fs.mkdirSync(dir, { recursive: true }); fs.renameSync(path.join(APPS, f), path.join(dir, 'index.html')); }
  }
}

// 2. pick the entry file the same way the build does
function entryOf(dir, meta) {
  const files = fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f));
  if (files.includes('index.html')) return 'index.html';
  if (meta?.current && files.includes(meta.current + '.html')) return meta.current + '.html';
  if (meta?.current && files.includes(meta.current)) return meta.current;
  const ver = files.map((f) => [f, +(/^v(\d+)/i.exec(f)?.[1] ?? -1)]).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1]);
  if (ver.length) return ver[0][0];
  return files.length === 1 ? files[0] : null;
}

// 3. read facts out of the html
function sniff(html, slug) {
  const head = html.slice(0, 400000);
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '');
  const desc = clean(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(head)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(head)?.[1] ??
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(head)?.[1] ?? ''
  );
  const parts = title.split(/\s+[—–|·-]\s+|:\s+/);
  const name = parts[0] || titleCase(slug);
  const rest = parts.slice(1).join(' · ');
  const emoji = /rel=["']icon["'][\s\S]{0,400}?(?:%3Ctext|<text)[^>%]*(?:>|%3E)([^<%\s]{1,4})/i.exec(head)?.[1]?.trim() || null;
  const low = head.toLowerCase();
  const tags = [];
  if (/animat|timeline|keyframe/.test(low)) tags.push('animation');
  if (/\bvideo\b|mp4|webm|mediarecorder/.test(low)) tags.push('video');
  if (/audiocontext|waveform|web audio|\baudio\b/.test(low)) tags.push('audio');
  if (/<svg|<canvas|cutout|paper/.test(low)) tags.push('design');
  return { name, tagline: clip(desc || rest || '', 120), description: desc || rest || '', emoji, tags };
}

// 4. build or fill app.json
const dirs = fs.readdirSync(APPS, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!only || d.name === only));
const existing = dirs.map((d) => readJSON(path.join(APPS, d.name, 'app.json'))).filter(Boolean);
let nextOrder = Math.max(0, ...existing.map((m) => +m.order || 0)) + 10;
const report = [];

for (const d of dirs) {
  const dir = path.join(APPS, d.name), jf = path.join(dir, 'app.json');
  const old = FORCE ? null : readJSON(jf);
  const entry = entryOf(dir, old);
  if (!entry) { report.push([d.name, 'skipped', 'no .html entry file']); continue; }
  const s = sniff(fs.readFileSync(path.join(dir, entry), 'utf8'), d.name);
  const generated = {
    name: s.name,
    slug: d.name,
    tagline: s.tagline || 'TODO: one-line summary',
    description: s.description || 'TODO: two or three sentences for search results',
    icon: s.emoji || 'icon.svg',
    tags: s.tags,
    status: 'stable',
    order: nextOrder,
    license: 'MIT',
    ...(entry !== 'index.html' ? { current: entry.replace(/\.html?$/i, '') } : {}),
  };
  const merged = { ...generated, ...(old || {}) };           // existing values always win
  const added = Object.keys(merged).filter((k) => !old || !(k in old));
  if (old && !added.length) { report.push([d.name, 'ok', 'already complete']); continue; }
  if (!old) nextOrder += 10;
  const todo = Object.entries(merged).filter(([, v]) => typeof v === 'string' && v.startsWith('TODO')).map(([k]) => k);
  if (!DRY) fs.writeFileSync(jf, JSON.stringify(merged, null, 2) + '\n');
  report.push([d.name, old ? 'filled' : 'created', (DRY ? '[dry] ' : '') + (old ? 'added ' + added.join(', ') : entry) + (todo.length ? `  ⚠ review: ${todo.join(', ')}` : '')]);
}

// 5. summary
const w = Math.max(4, ...report.map((r) => r[0].length));
for (const [n, st, note] of report) console.log(`${n.padEnd(w)}  ${st.padEnd(8)}  ${note}`);
if (!report.length) console.log('No app folders found in apps/. Try --move if your apps are loose .html files.');
