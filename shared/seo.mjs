// shared/seo.mjs  - the ONE place that writes every page's title, description, canonical URL,
// social cards and structured data. Apps never need their own SEO tags.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const base = (site) => site.url.replace(/\/+$/, '');

export function seoTags({ site, title, description = '', path = '', image = '', type = 'website', noindex = false, app = null }) {
  const url = base(site) + '/' + path.replace(/^\/+/, '');
  const img = image || site.ogImage;
  const imgUrl = img ? (/^https?:/.test(img) ? img : base(site) + '/' + img.replace(/^\/+/, '')) : '';
  const t = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
  ];
  if (noindex) t.push('<meta name="robots" content="noindex,follow">');
  t.push(
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    ...(imgUrl ? [`<meta property="og:image" content="${esc(imgUrl)}">`] : []),
    `<meta name="twitter:card" content="${imgUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    ...(site.twitter ? [`<meta name="twitter:site" content="${esc(site.twitter)}">`] : []),
  );
  const ld = app
    ? { '@context': 'https://schema.org', '@type': 'WebApplication', name: app.fullName, description, url, applicationCategory: 'MultimediaApplication', operatingSystem: 'Any (runs in the browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
    : { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url, description };
  t.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return t.join('\n');
}

export function sitemap(site, paths) {
  const today = new Date().toISOString().slice(0, 10);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map((p) => `  <url><loc>${esc(base(site) + '/' + p)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n';
}
