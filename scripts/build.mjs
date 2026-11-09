#!/usr/bin/env node
/**
 * scripts/build.mjs   node scripts/build.mjs   (or: npm run build)
 * Turns apps/<slug>/ folders into the finished site in dist/.
 *
 *  - every app keeps being ONE independent html file; shared SEO, favicon, AdSense and analytics
 *    are injected at build time from shared/head.html + shared/seo.mjs + site.json
 *  - dist/index.html            home page (cards come from each app.json)
 *  - dist/<slug>/               the latest version (apps/<slug>/index.html)
 *  - dist/<slug>/v1/ ...        older versions (noindex, no ads) + dist/<slug>/versions/ list
 *  - sitemap.xml, robots.txt, ads.txt (when AdSense is set), 404.html, .nojekyll, CNAME
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seoTags, sitemap } from '../shared/seo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const rd = (p, d = '') => { try { return fs.readFileSync(p, 'utf8'); } catch { return d; } };
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (s) => s.split('-').map((w) => (w[0] || '').toUpperCase() + w.slice(1)).join(' ');
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const put = (rel, data) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const cp = (from, rel) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(from, f); };
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

// {{key}} and {{#key}}...{{/key}} templating (used by shared/head.html and the home template)
const tpl = (str, v) => str
  .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (v[k] ? inner : ''))
  .replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '');

const QUOTED = `(?:[^>"']|"[^"]*"|'[^']*')*`;                      // tag body that respects quoted attributes
const headRe = { meta: new RegExp(`<meta\\b${QUOTED}>\\s*`, 'gi'), link: new RegExp(`<link\\b${QUOTED}>\\s*`, 'gi'), script: new RegExp(`<script\\b${QUOTED}>\\s*</script>\\s*`, 'gi') };

/** Put the shared block at the end of <head>, after removing the app's own duplicate SEO/ad tags. */
function inject(html, block) {
  const hm = /<head\b[^>]*>/i.exec(html), he = /<\/head>/i.exec(html);
  if (!hm || !he || he.index < hm.index) return `<!doctype html><html><head><meta charset="utf-8">${block}</head><body>${html}</body></html>`;
  let head = html.slice(hm.index + hm[0].length, he.index)
    .replace(/<title\b[\s\S]*?<\/title>\s*/gi, '')
    .replace(headRe.meta, (m) => (/\b(?:name|property)\s*=\s*["'](?:description|og:|twitter:|robots|theme-color|google-adsense-account)/i.test(m) ? '' : m))
    .replace(headRe.link, (m) => (/\brel\s*=\s*["']canonical["']/i.test(m) ? '' : m))
    .replace(headRe.script, (m) => (/adsbygoogle|googletagmanager/i.test(m) ? '' : m));
  if (!/<meta\b[^>]*charset/i.test(head)) head = '<meta charset="utf-8">\n' + head;
  return html.slice(0, hm.index + hm[0].length) + head + '\n' + block + '\n' + html.slice(he.index);
}

function headBlock(site, page, { ads = true, hasIcon = false } = {}) {
  const shared = tpl(rd(path.join(ROOT, 'shared', 'head.html')).replace(/<!--[\s\S]*?-->\s*/g, ''), {
    themeColor: site.themeColor, icon: !hasIcon, adsenseClient: ads ? site.adsenseClient : '', gaId: ads ? site.gaId : '',
  });
  return seoTags({ site, ...page, noindex: page.noindex || site.noindex }) + '\n' + shared;
}

function loadApp(slug, i, warns, site) {
  const dir = path.join(ROOT, 'apps', slug);
  const entry = path.join(dir, 'index.html');
  if (!fs.existsSync(entry)) { warns.push(`${slug}: no index.html, skipped`); return null; }
  const meta = rj(path.join(dir, 'app.json')) || {};
  const html = rd(entry);
  const head = html.slice(0, 300000);
  const sniffTitle = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]);
  const sniffDesc = clean(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(head)?.[1]);
  const todo = (s) => (!s || /^TODO/i.test(s) ? '' : s);
  const name = todo(meta.name) || sniffTitle.split(/\s+[—–|-]\s+/)[0] || words(slug);
  const tagline = todo(meta.tagline) || sniffDesc;
  const description = todo(meta.description) || sniffDesc || tagline;
  const vj = rj(path.join(dir, 'versions.json'));
  const vdir = path.join(dir, 'versions');
  const older = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^v\d+\.html$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map((f) => f.slice(0, -5)) : [];
  if (!tagline) warns.push(`${slug}: no tagline (add one to app.json)`);
  const pub = site.maxVersions > 0 ? older.slice(-site.maxVersions) : older;     // older versions that get published
  return {
    slug, dir, name, tagline, description, html, pub, title: meta.title || '',
    fullName: name.toLowerCase().includes(String(meta.brand ?? 'reel').toLowerCase()) ? name : `Reel ${name}`,
    tags: (meta.tags || []).map((t) => t[0].toUpperCase() + t.slice(1)),
    status: String(meta.status || 'stable').replace(/^./, (c) => c.toUpperCase()),
    order: meta.order ?? 1000, listed: meta.listed !== false, ads: meta.ads !== false, image: meta.image || '',
    older, vj, t: 't' + ((i % 5) + 1),
    version: 'v' + (older.length + 1),
    versionLabels: pub.slice().reverse(),
  };
}

function buildApp(site, a) {
  const hasIcon = /<link\b[^>]*\brel\s*=\s*["'](?:shortcut )?icon["']/i.test(a.html.slice(0, 300000));
  const title = a.title || clip(a.fullName + (a.tagline ? ' — ' + a.tagline : ''), 70);
  const block = headBlock(site, { title, description: a.description || site.description, path: a.slug + '/', image: a.image, app: a }, { ads: a.ads, hasIcon });
  put(`${a.slug}/index.html`, inject(a.html, block));
  for (const f of fs.readdirSync(a.dir, { withFileTypes: true })) {                 // other assets next to the app
    if (f.isFile() && !['index.html', 'app.json', 'versions.json'].includes(f.name)) cp(path.join(a.dir, f.name), `${a.slug}/${f.name}`);
  }
  if (!site.publishVersions || !a.pub.length) return 0;
  for (const v of a.pub) {
    const vh = rd(path.join(a.dir, 'versions', v + '.html'));
    const vb = headBlock(site, { title: `${a.fullName} ${v}`, description: `Older version (${v}) of ${a.fullName}.`, path: `${a.slug}/${v}/`, noindex: true }, { ads: false, hasIcon: /\brel\s*=\s*["'](?:shortcut )?icon["']/i.test(vh.slice(0, 300000)) });
    put(`${a.slug}/${v}/index.html`, inject(vh, vb));
  }
  const rows = a.pub.slice().reverse().map((v) => {
    const m = a.vj?.versions?.find((x) => x.id === v);
    return `<li><a href="../${v}/">${v}</a> <small>${m ? `${esc(m.modified)} · ${kb(m.size)}` : ''}</small></li>`;
  }).join('');
  put(`${a.slug}/versions/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${seoTags({ site, title: `${a.fullName} — older versions`, description: `Older versions of ${a.fullName}.`, path: `${a.slug}/versions/`, noindex: true })}\n<style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px}a{color:#0a7a5c}li{margin:8px 0}small{opacity:.7}</style></head><body><p><a href="../">← ${esc(a.fullName)}</a></p><h1>Older versions</h1><ul>${rows}</ul></body></html>`);
  return a.pub.length;
}

export function build({ only = null, quiet = false } = {}) {
  const t0 = Date.now();
  const site = {
    name: 'Reel', url: 'http://localhost:3000', tagline: 'Free tools for animation, video and sound', description: '', github: '', kofi: '',
    adsenseClient: '', gaId: '', ogImage: '', twitter: '', cname: '', themeColor: '#14121B', heroId: 'hero-v1', publishVersions: true, adsOnHome: true, maxVersions: 0, noindex: false,
    ...rj(path.join(ROOT, 'site.json')),
  };
  const warns = [];
  if (/YOUR-NAME/.test(site.url + site.github)) warns.push('site.json still has YOUR-NAME in url/github; update it before deploying');
  if (!only) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const appsDir = path.join(ROOT, 'apps');
  const slugs = fs.existsSync(appsDir) ? fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort() : [];
  const apps = slugs.map((s, i) => loadApp(s, i, warns, site)).filter(Boolean).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  let nv = 0, built = 0;
  for (const a of apps) if (!only || only === a.slug) { nv += buildApp(site, a); built++; }

  // home page
  const listed = apps.filter((a) => a.listed);
  const data = listed.map((a) => ({ slug: a.slug, name: a.name.replace(/^reel\s+/i, ''), tagline: a.tagline, tags: a.tags.length ? a.tags : ['Other'], status: a.status, version: a.version, versions: a.versionLabels, t: a.t }));
  const about = ['about.md', 'project.md', 'README.md'].map((f) => rd(path.join(ROOT, f))).find(Boolean) || '# About\nAdd an about.md file to the repo root.';
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => rd(path.join(ROOT, f))).find(Boolean) || 'No LICENSE file found yet.\n\nAdd one at the repo root.';
  const noscript = `<noscript><ul>${listed.map((a) => `<li><a href="./${a.slug}/">${esc(a.fullName)}</a> — ${esc(a.tagline)}</li>`).join('')}</ul></noscript>`;
  let home = rd(path.join(ROOT, 'shared', 'home.template.html'));
  home = home.replace('<!--@head-->', () => headBlock(site, { title: `${site.name} — ${site.tagline}`, description: site.description, path: '' }, { ads: site.adsOnHome !== false }))
    .replace('<!--@noscript-->', () => noscript)
    .replace('/*@APPS*/[]', () => json(data)).replace('/*@ABOUT*/""', () => json(about)).replace('/*@LICENSE*/""', () => json(license));
  home = tpl(home, { GITHUB: site.github || '#', KOFI: site.kofi || '#', HERO_ID: site.heroId });
  put('index.html', home);

  put('404.html', `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found — ${esc(site.name)}</title><style>body{font:18px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center}a{color:#0a7a5c}</style><div><h1>Page not found</h1><p><a href="/">Back to ${esc(site.name)}</a></p></div>`);
  put('sitemap.xml', sitemap(site, ['', ...listed.map((a) => a.slug + '/')]));
  put('robots.txt', site.noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${site.url.replace(/\/+$/, '')}/sitemap.xml\n`);
  if (site.adsenseClient) put('ads.txt', `google.com, ${site.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  if (site.cname) put('CNAME', site.cname + '\n');
  put('.nojekyll', '');

  if (!quiet) {
    warns.forEach((w) => console.warn('warning: ' + w));
    console.log(`Built ${built}${only ? ' (only ' + only + ')' : ''} of ${apps.length} apps, ${nv} older version pages, home + about + license in ${Date.now() - t0} ms -> dist/`);
  }
  return { apps, warns };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
