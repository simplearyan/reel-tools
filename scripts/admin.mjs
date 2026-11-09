/**
 * scripts/admin.mjs  - backend for the local "Reel Dev" dashboard (served by dev.mjs at /__admin).
 * Local only: dev.mjs listens on 127.0.0.1 and every request needs a random per-run token.
 * Deleting an app MOVES it to _trash/ so it can always be restored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_KEYS = { name: 's', tagline: 's', description: 's', status: 's', title: 's', icon: 's', image: 's', license: 's', brand: 's', tags: 'a', listed: 'b', ads: 'b', order: 'n' };
const SITE_KEYS = ['name', 'url', 'tagline', 'description', 'github', 'kofi', 'adsenseClient', 'gaId', 'ogImage', 'twitter', 'cname', 'themeColor', 'heroId'];
const slugOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);

export function createAdmin({ ROOT, token, port }) {
  const APPS = path.join(ROOT, 'apps'), TRASH = path.join(ROOT, '_trash'), SITE = path.join(ROOT, 'site.json');
  const rj = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
  const wj = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
  const script = (name, ...args) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', name), ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const peek = (f, n) => { try { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(n), r = fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b.toString('utf8', 0, r); } catch { return ''; } };
  const fail = (m) => Object.assign(new Error(m), { status: 400 });

  function state() {
    const apps = fs.existsSync(APPS) ? fs.readdirSync(APPS, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => {
      const dir = path.join(APPS, d.name), idx = path.join(dir, 'index.html'), vdir = path.join(dir, 'versions');
      const m = rj(path.join(dir, 'app.json'), {});
      return { slug: d.name, meta: m, hasIndex: fs.existsSync(idx), size: fs.existsSync(idx) ? fs.statSync(idx).size : 0, versions: fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^v\d+\.html$/.test(f)).length : 0 };
    }) : [];
    apps.sort((a, b) => (a.meta.order ?? 1000) - (b.meta.order ?? 1000) || a.slug.localeCompare(b.slug));
    const trash = fs.existsSync(TRASH) ? fs.readdirSync(TRASH, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ id: d.name, slug: d.name.split('__')[0], when: d.name.split('__')[1] || '' })).sort((a, b) => b.when.localeCompare(a.when)) : [];
    return { site: rj(SITE, {}), apps, trash };
  }

  const actions = {
    'GET state': () => state(),
    'POST app': ({ slug, patch }) => {
      if (!slugOk(slug) || !fs.existsSync(path.join(APPS, slug))) throw fail('unknown app');
      const f = path.join(APPS, slug, 'app.json'), m = rj(f, { slug });
      for (const [k, t] of Object.entries(APP_KEYS)) {
        if (!(k in patch)) continue;
        const v = patch[k];
        m[k] = t === 'a' ? (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean) : t === 'b' ? !!v : t === 'n' ? Number(v) || 0 : String(v ?? '').trim();
      }
      wj(f, m); return { ok: true };
    },
    'POST reorder': ({ slugs }) => {
      if (!Array.isArray(slugs)) throw fail('slugs required');
      slugs.filter(slugOk).forEach((s, i) => { const f = path.join(APPS, s, 'app.json'); if (fs.existsSync(path.join(APPS, s))) wj(f, { ...rj(f, { slug: s }), order: (i + 1) * 10 }); });
      return { ok: true };
    },
    'POST delete': ({ slug }) => {
      if (!slugOk(slug) || !fs.existsSync(path.join(APPS, slug))) throw fail('unknown app');
      fs.mkdirSync(TRASH, { recursive: true });
      const gi = path.join(ROOT, '.gitignore'), g = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
      if (!/^_trash\/?$/m.test(g)) fs.appendFileSync(gi, (g && !g.endsWith('\n') ? '\n' : '') + '_trash/\n');
      const id = `${slug}__${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
      fs.renameSync(path.join(APPS, slug), path.join(TRASH, id)); return { ok: true, id };
    },
    'POST restore': ({ id }) => {
      const slug = String(id).split('__')[0];
      if (!slugOk(slug) || !fs.existsSync(path.join(TRASH, id))) throw fail('not in trash');
      if (fs.existsSync(path.join(APPS, slug))) throw fail(`apps/${slug} already exists`);
      fs.renameSync(path.join(TRASH, id), path.join(APPS, slug)); return { ok: true };
    },
    'POST purge': ({ id }) => {
      if (!/^[a-z0-9-]+__\d+$/.test(String(id)) || !fs.existsSync(path.join(TRASH, id))) throw fail('not in trash');
      fs.rmSync(path.join(TRASH, id), { recursive: true, force: true }); return { ok: true };
    },
    'POST archive': ({ slug }) => { if (!slugOk(slug)) throw fail('bad slug'); return { ok: true, message: script('archive.mjs', slug).trim() }; },
    'POST new': ({ slug, name }) => { if (!slugOk(slug)) throw fail('use lowercase letters, numbers and dashes'); return { ok: true, message: script('new-app.mjs', slug, name || slug).trim() }; },
    'POST init': () => ({ ok: true, message: script('init-apps.mjs').trim() }),
    'POST check': () => {
      let raw = ''; try { raw = script('validate.mjs', '--json'); } catch (e) { raw = String(e.stdout || ''); }
      let v = { errors: [], warns: [], checked: 0 }; try { v = JSON.parse(raw); } catch { v.errors.push('validate.mjs did not return a result'); }
      const miss = (x) => !x || /^TODO/i.test(x), hints = {};
      for (const a of state().apps) {
        const m = a.meta; if (!a.hasIndex || !(miss(m.tagline) || miss(m.description) || !(m.tags || []).length)) continue;
        const h = peek(path.join(APPS, a.slug, 'index.html'), 300000);
        hints[a.slug] = { title: (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] || '').replace(/\s+/g, ' ').trim(), description: (/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(h)?.[1] || '').trim(), h1: (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
      }
      return { ok: true, ...v, hints };
    },
    'POST validate': () => { try { return { ok: true, output: script('validate.mjs') }; } catch (e) { return { ok: true, output: String(e.stdout || e.message) }; } },
    'POST site': ({ patch }) => {
      const s = rj(SITE, {});
      for (const k of SITE_KEYS) if (k in patch) s[k] = String(patch[k] ?? '').trim();
      for (const k of ['publishVersions', 'adsOnHome', 'noindex']) if (k in patch) s[k] = !!patch[k];
      if ('maxVersions' in patch) s.maxVersions = Math.max(0, parseInt(patch.maxVersions, 10) || 0);
      wj(SITE, s); return { ok: true };
    },
  };

  const hostOk = (req) => [`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host);
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

  return async (req, res, u) => {
    if (!hostOk(req)) return send(res, 403, { error: 'forbidden' });
    if (u === '/__admin' || u === '/__admin/') {
      const html = fs.readFileSync(path.join(ROOT, 'shared', 'admin.html'), 'utf8').replace('{{TOKEN}}', token);
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (req.headers['x-reel-token'] !== token) return send(res, 403, { error: 'bad token' });
    const fn = actions[`${req.method} ${u.replace('/__api/', '')}`];
    if (!fn) return send(res, 404, { error: 'unknown action' });
    let body = {};
    if (req.method === 'POST') {
      const chunks = []; let n = 0;
      for await (const c of req) { n += c.length; if (n > 1e6) return send(res, 413, { error: 'too large' }); chunks.push(c); }
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
    }
    try { send(res, 200, await fn(body)); } catch (e) { send(res, e.status || 500, { error: String(e.stderr || e.message).trim().split('\n').pop() }); }
  };
}
