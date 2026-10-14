import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const origin = 'https://forgetopia.github.io';
const dist = resolve(process.argv[2] ?? 'source/dist');
const files = new Set();
const referenced = new Set();
let inlineModules = 0;

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.add(relative(dist, path).split(sep).join('/'));
    else throw new Error(`Unsupported artifact entry: ${path}`);
  }
}

function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (entity.toLowerCase() in named) return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[2].toLowerCase() === 'x'
      ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10));
  });
}

function attributes(tag) {
  const values = new Map();
  for (const match of tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    values.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return values;
}

function checkReference(value, from) {
  value = value.trim();
  if (!value || value.startsWith('#')) return;
  const url = new URL(value, `${origin}/${from}`);
  if (['data:', 'blob:', 'mailto:', 'tel:'].includes(url.protocol)) return;
  assert.ok(['https:', 'http:'].includes(url.protocol), `${from}: unsupported reference ${value}`);
  if (url.origin !== origin) return;
  assert.ok(!url.pathname.includes('/forge-portfolio/'), `${from}: repository base path ${value}`);

  // Resolve the original path so URL normalization cannot hide an escape from dist.
  const rawPath = value.replace(/^(?:https?:)?\/\/[^/]+/i, '').split(/[?#]/)[0];
  const path = decodeURIComponent(rawPath);
  assert.ok(!/[\u0000\\]/.test(path), `${from}: unsafe local path ${value}`);
  assert.ok(!path.includes('/forge-portfolio/'), `${from}: repository base path ${value}`);
  const target = path.startsWith('/')
    ? resolve(dist, `.${path}`)
    : resolve(dist, dirname(from), path || from.split('/').at(-1));
  assert.ok(target === dist || target.startsWith(`${dist}${sep}`), `${from}: path escapes artifact ${value}`);
  const local = relative(dist, target).split(sep).join('/');
  const file = files.has(local) ? local : `${local ? `${local}/` : ''}index.html`;
  assert.ok(files.has(file), `${from}: missing local reference ${value}`);
  referenced.add(file);
}

await collect(dist);
for (const route of ['', 'work/', 'about/', 'contact/']) {
  assert.ok(files.has(`${route}index.html`), `Missing required page: /${route}`);
}

const routes = new Set();
for (const file of [...files].filter((path) => path.endsWith('.html'))) {
  const html = await readFile(resolve(dist, file), 'utf8');
  assert.ok(!html.includes('/forge-portfolio/'), `${file}: repository base path found`);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs.get('type') === 'module' && !attrs.has('src') && match[2].trim()) inlineModules += 1;
  }
  const canonicals = [];
  for (const match of html.matchAll(/<(a|link|script|img|video|source|track|iframe|audio)\b([^<>]*)>/gi)) {
    const attrs = attributes(match[2]);
    if (match[1].toLowerCase() === 'link' && attrs.get('rel')?.split(/\s+/).includes('canonical')) {
      canonicals.push(attrs.get('href'));
    }
    for (const name of ['href', 'src', 'poster']) {
      if (attrs.has(name)) checkReference(attrs.get(name), file);
    }
  }
  if (file === 'index.html' || file.endsWith('/index.html')) {
    const route = file === 'index.html' ? '/' : `/${file.slice(0, -'index.html'.length)}`;
    routes.add(route);
    assert.deepEqual(canonicals, [`${origin}${route}`], `${file}: canonical must use the GitHub Pages root`);
  }
}

assert.ok([...routes].some((route) => /^\/work\/[^/]+\/$/.test(route)), 'No project detail routes were built');
for (const file of [...files].filter((path) => path.endsWith('.css'))) {
  const css = await readFile(resolve(dist, file), 'utf8');
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)) {
    checkReference(match[1] ?? match[2] ?? match[3], file);
  }
  for (const match of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    checkReference(match[1] ?? match[2], file);
  }
}

const sitemap = await readFile(resolve(dist, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/g)].map((match) => decodeEntities(match[1].trim()));
assert.equal(locations.length, routes.size, 'Sitemap must list each public route exactly once');
assert.deepEqual(new Set(locations), new Set([...routes].map((route) => `${origin}${route}`)), 'Sitemap must use GitHub Pages canonical URLs');

const counts = {};
for (const extension of ['css', 'woff2']) {
  const assets = [...files].filter((path) => path.startsWith('_astro/') && path.endsWith(`.${extension}`));
  assert.ok(assets.length > 0, `No generated ${extension} assets in _astro/`);
  assert.ok(assets.some((path) => referenced.has(path)), `No generated ${extension} assets referenced by HTML/CSS`);
  counts[extension] = assets.length;
}
const scripts = [...referenced].filter((path) => /\.(?:m?js)$/.test(path));
assert.ok(scripts.length > 0 || inlineModules > 0, 'No external JavaScript or inline module scripts in the artifact');
console.log(`Validated ${routes.size} routes, ${referenced.size} local references, and ${files.size} files (${counts.css} CSS, ${scripts.length} external scripts, ${inlineModules} inline modules, ${counts.woff2} fonts).`);
