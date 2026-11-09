#!/usr/bin/env node
/**
 * npm run validate           errors fail (exit 1); warnings are printed
 * node scripts/validate.mjs --strict   also fails on placeholders in site.json (used by the GitHub Action)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');
const errors = [], warns = [];
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return e; } };
const todo = (s) => !s || /^TODO/i.test(String(s));
const MB = 1048576;

const site = rj(path.join(ROOT, 'site.json'));
if (site instanceof Error) errors.push('site.json: ' + site.message);
else {
  if (/YOUR-NAME/.test(`${site.url} ${site.github}`)) (STRICT ? errors : warns).push('site.json: replace YOUR-NAME in url and github');
  if (site.adsenseClient && !/^ca-pub-\d{10,}$/.test(site.adsenseClient)) errors.push('site.json: adsenseClient should look like ca-pub-1234567890123456');
}
if (!['LICENSE', 'LICENSE.md', 'LICENSE.txt'].some((f) => fs.existsSync(path.join(ROOT, f)))) warns.push('no LICENSE file in the repo root');
if (!['about.md', 'project.md', 'README.md'].some((f) => fs.existsSync(path.join(ROOT, f)))) warns.push('no about.md (the About page will be empty)');

const appsDir = path.join(ROOT, 'apps');
const dirs = fs.existsSync(appsDir) ? fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')) : [];
const names = new Map();
for (const d of dirs) {
  const dir = path.join(appsDir, d.name), idx = path.join(dir, 'index.html'), p = `apps/${d.name}`;
  if (!fs.existsSync(idx)) { errors.push(`${p}: no index.html`); continue; }
  const size = fs.statSync(idx).size;
  if (size > 95 * MB) errors.push(`${p}/index.html is ${(size / MB).toFixed(0)} MB; GitHub rejects files over 100 MB`);
  else if (size > 8 * MB) warns.push(`${p}/index.html is ${(size / MB).toFixed(1)} MB (heavy for a web page)`);
  const html = fs.readFileSync(idx, 'utf8').slice(0, 400000);
  if (!/<html[\s>]/i.test(html)) warns.push(`${p}: does not look like a full HTML page`);
  if (/<(?:script|link)\b[^>]*(?:src|href)=["']http:\/\//i.test(html)) warns.push(`${p}: loads a script or stylesheet over http:// (blocked on https sites)`);
  const meta = rj(path.join(dir, 'app.json'));
  if (!meta) { warns.push(`${p}: no app.json (run npm run init)`); continue; }
  if (meta instanceof Error) { errors.push(`${p}/app.json: ${meta.message}`); continue; }
  if (todo(meta.tagline)) warns.push(`${p}: tagline missing`);
  if (todo(meta.description)) warns.push(`${p}: description missing`);
  if (!Array.isArray(meta.tags) || !meta.tags.length) warns.push(`${p}: no tags`);
  if (meta.order !== undefined && typeof meta.order !== 'number') errors.push(`${p}/app.json: order must be a number`);
  const key = String(meta.name || d.name).toLowerCase();
  if (names.has(key)) warns.push(`${p}: same name as ${names.get(key)} ("${meta.name}")`); else names.set(key, p);
  const vdir = path.join(dir, 'versions');
  if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (!/^v\d+\.html$/.test(f)) warns.push(`${p}/versions/${f}: expected the name v1.html, v2.html ...`);
}
if (!dirs.length) warns.push('apps/ is empty');

if (AS_JSON) { console.log(JSON.stringify({ errors, warns, checked: dirs.length })); process.exit(errors.length ? 1 : 0); }
warns.forEach((w) => console.log('warning: ' + w));
errors.forEach((e) => console.log('ERROR:   ' + e));
console.log(`\n${dirs.length} apps checked: ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
