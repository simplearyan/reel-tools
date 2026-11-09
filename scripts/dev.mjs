#!/usr/bin/env node
/**
 * scripts/dev.mjs   node scripts/dev.mjs [--port 3000] [--open]   (or: npm run dev)
 * Live preview: builds the site, serves dist/ locally and reloads the browser when you save.
 * Editing apps/<slug>/ rebuilds only that app; editing shared/, site.json or about.md rebuilds everything.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { build } from './build.mjs';
import { createAdmin } from './admin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const PORT = +(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const RELOAD = '<script>new EventSource("/__reload").onmessage=function(){location.reload()}</script>';
const clients = new Set();
const TOKEN = crypto.randomBytes(16).toString('hex');
const admin = createAdmin({ ROOT, token: TOKEN, port: PORT });
const PILL = '<a href="/__admin" style="position:fixed;right:16px;bottom:16px;z-index:99999;font:600 13px system-ui;background:#14110D;color:#F4EFE5;padding:10px 16px;border-radius:999px;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.3)">Reel Dev</a>';

try { build(); } catch (e) { console.error('Build failed:', e.message); }

http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/__admin') || u.startsWith('/__api/')) return admin(req, res, u);
  if (u === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 500\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  let f = path.normalize(path.join(DIST, u));
  if (!f.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  let status = 200;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!u.endsWith('/')) { res.writeHead(301, { Location: u + '/' }); return res.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) { f = path.join(DIST, '404.html'); status = 404; }
  const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  if (type.startsWith('text/html')) {
    const html = fs.readFileSync(f, 'utf8');
    const i = html.toLowerCase().lastIndexOf('</body>');
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end((i < 0 ? html + RELOAD : html.slice(0, i) + RELOAD + (u === '/' ? PILL : '') + html.slice(i)));
  }
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\nLive preview:   ${url}\nDev dashboard:  ${url}__admin   (Ctrl+C to stop)`);
  if (argv.includes('--open') || argv.includes('--admin')) exec(`${process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'} ${argv.includes('--admin') ? url + '__admin' : url}`);
});

let timer = null, only = undefined;
const watched = ['apps', 'shared'].map((d) => path.join(ROOT, d));
const rebuild = () => {
  const o = only; only = undefined;
  try { build({ only: o || null }); clients.forEach((c) => c.write('data: reload\n\n')); } catch (e) { console.error('Build failed:', e.message); }
};
const onChange = (rel) => {
  const m = /^apps[\\/]([^\\/]+)[\\/]/.exec(rel);
  only = only === undefined ? (m ? m[1] : null) : (only === (m && m[1]) ? only : null);    // a mix of changes -> full rebuild
  clearTimeout(timer); timer = setTimeout(rebuild, 250);
};
for (const d of watched) if (fs.existsSync(d)) fs.watch(d, { recursive: true }, (_, f) => f && onChange(path.relative(ROOT, path.join(d, f))));
for (const f of ['site.json', 'about.md', 'project.md', 'README.md', 'LICENSE']) if (fs.existsSync(path.join(ROOT, f))) fs.watch(path.join(ROOT, f), () => onChange(f));
