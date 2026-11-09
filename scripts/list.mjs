#!/usr/bin/env node
/**
 * npm run list                table of every app
 * npm run list -- --sort size   sort by size (or: name, versions)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sort = argv.includes('--sort') ? argv[argv.indexOf('--sort') + 1] : 'order';
const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const appsDir = path.join(ROOT, 'apps');
const rows = (fs.existsSync(appsDir) ? fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')) : []).map((d) => {
  const dir = path.join(appsDir, d.name);
  let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8')); } catch { /* none */ }
  const idx = path.join(dir, 'index.html'), vdir = path.join(dir, 'versions');
  const versions = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^v\d+\.html$/.test(f)).length : 0;
  const size = fs.existsSync(idx) ? fs.statSync(idx).size : 0;
  const flags = [m.listed === false && 'hidden', m.ads === false && 'no-ads', !fs.existsSync(idx) && 'NO INDEX', (!m.tagline || /^TODO/.test(m.tagline)) && 'no tagline'].filter(Boolean).join(', ');
  return { slug: d.name, name: m.name || '-', status: m.status || '-', versions, size, tags: (m.tags || []).join(' '), order: m.order ?? 1000, flags };
});
rows.sort(sort === 'size' ? (a, b) => b.size - a.size : sort === 'versions' ? (a, b) => b.versions - a.versions : sort === 'name' ? (a, b) => a.slug.localeCompare(b.slug) : (a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
const W = (k, min) => Math.max(min, ...rows.map((r) => String(r[k]).length));
const w = { slug: W('slug', 4), name: W('name', 4), status: 6 };
console.log(`${'slug'.padEnd(w.slug)}  ${'name'.padEnd(w.name)}  ${'status'.padEnd(w.status)}  vers  ${'size'.padStart(8)}  tags / flags`);
for (const r of rows) console.log(`${r.slug.padEnd(w.slug)}  ${r.name.padEnd(w.name)}  ${r.status.padEnd(w.status)}  ${String(r.versions).padStart(4)}  ${kb(r.size).padStart(8)}  ${r.tags}${r.flags ? '  [' + r.flags + ']' : ''}`);
console.log(`\n${rows.length} apps, ${rows.reduce((n, r) => n + r.versions, 0)} older versions, ${kb(rows.reduce((n, r) => n + r.size, 0))} in latest files`);
