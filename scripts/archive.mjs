#!/usr/bin/env node
/**
 * npm run archive cutout-studio
 * Saves a snapshot of apps/<slug>/index.html as versions/vN.html (next number) BEFORE you change it.
 * Skips if the current file is identical to the newest snapshot. Updates versions.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
if (!slug) { console.error('Usage: npm run archive <slug>'); process.exit(1); }
const dir = path.join(ROOT, 'apps', slug), cur = path.join(dir, 'index.html'), vdir = path.join(dir, 'versions');
if (!fs.existsSync(cur)) { console.error(`apps/${slug}/index.html not found.`); process.exit(1); }
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const nums = fs.existsSync(vdir) ? fs.readdirSync(vdir).map((f) => /^v(\d+)\.html$/.exec(f)?.[1]).filter(Boolean).map(Number) : [];
const last = nums.length ? Math.max(...nums) : 0;
if (last && sha(path.join(vdir, `v${last}.html`)) === sha(cur)) { console.log(`Already archived: index.html is identical to versions/v${last}.html`); process.exit(0); }
const id = `v${last + 1}`;
fs.mkdirSync(vdir, { recursive: true });
fs.copyFileSync(cur, path.join(vdir, id + '.html'));
const vf = path.join(dir, 'versions.json');
let meta = { versions: [] };
try { meta = JSON.parse(fs.readFileSync(vf, 'utf8')); } catch { /* new file */ }
meta.versions = [...(meta.versions || []), { id, file: 'archived from index.html', size: fs.statSync(cur).size, modified: new Date().toISOString().slice(0, 10) }];
fs.writeFileSync(vf, JSON.stringify(meta, null, 2) + '\n');
console.log(`Archived apps/${slug}/index.html -> versions/${id}.html. Now edit index.html freely.`);
