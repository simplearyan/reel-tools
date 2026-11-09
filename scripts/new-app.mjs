#!/usr/bin/env node
/**
 * npm run new my-app            creates apps/my-app/ with a starter index.html and app.json
 * npm run new my-app "My App"   same, with a display name
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [raw, ...rest] = process.argv.slice(2);
if (!raw) { console.error('Usage: npm run new <slug> ["Display name"]'); process.exit(1); }
const slug = raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const name = rest.join(' ').trim() || slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const dir = path.join(ROOT, 'apps', slug);
if (fs.existsSync(dir)) { console.error(`apps/${slug} already exists.`); process.exit(1); }

const orders = fs.readdirSync(path.join(ROOT, 'apps'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => { try { return +JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', d.name, 'app.json'), 'utf8')).order || 0; } catch { return 0; } });
const order = Math.max(0, ...orders) + 10;

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;800&display=swap">
<style>
/* Reel tokens: light by default, dark follows the system */
:root{--bg:#F6ECE2;--card:#FBF6EE;--ink:#14110D;--mut:#5F584D;--line:rgba(20,17,13,.14);--mint:#00E0A4;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#14121B;--card:#241F2E;--ink:#F4EFE5;--mut:#B6AFC0;--line:rgba(244,239,229,.16)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font:400 16px/1.5 'Hanken Grotesk',system-ui,sans-serif}
header{display:flex;align-items:center;gap:10px;padding:20px 24px;font-size:22px}
header b{font-weight:800}
main{padding:24px;max-width:960px;margin:0 auto}
.panel{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:32px;color:var(--mut)}
</style>
</head>
<body>
<!-- Title, description, favicon, AdSense and analytics are added at build time. Do not add them here. -->
<header><b>Reel</b> ${name}</header>
<main>
  <div class="panel">Start building ${name} here. This whole app lives in this one file.</div>
</main>
<script>
/* ===== APP ===== */
</script>
</body>
</html>
`);
fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ name, slug, tagline: 'TODO: one-line summary', description: 'TODO: two or three sentences for search results', icon: 'icon.svg', tags: [], status: 'beta', order, license: 'MIT' }, null, 2) + '\n');
console.log(`Created apps/${slug}/\n  edit apps/${slug}/index.html and apps/${slug}/app.json (tagline, description, tags)\n  npm run dev   to preview`);
