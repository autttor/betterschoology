#!/usr/bin/env tsx
/**
 * Local Schoology fixture server.
 *
 *   npm run schoology:dev     ->  http://localhost:4173
 *
 * A faithful client-side reconstruction of captured Schoology surfaces, for
 * Better Schoology development. It is NOT a Schoology emulator -- see the
 * limitations section in dev/schoology/README.md.
 *
 * It exists because the extension's developer does not have persistent
 * authenticated access to a live Schoology instance, so this is the primary
 * development target. Serving over HTTP rather than `file://` is deliberate:
 * routes, relative asset resolution, same-origin fetch and extension host
 * permissions all behave differently under `file://`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AssetResolver } from './assets';
import { INDEX_LINKS, resolveFixture } from './routes';
import { SCENARIOS, applyScenario, isScenario, type ScenarioName } from './scenarios';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PAGES_DIR = join(ROOT, 'tests', 'fixtures', 'schoology', 'pages');
const API_DIR = join(ROOT, 'tests', 'fixtures', 'schoology', 'api');
const DEV_ASSETS = join(ROOT, 'dev', 'schoology', 'assets');
const LOCAL_CAPTURE = join(ROOT, '.local-schoology');

const PORT = Number(process.env.SCHOOLOGY_FIXTURE_PORT ?? 4173);
const HOST = process.env.SCHOOLOGY_FIXTURE_HOST ?? '127.0.0.1';

const assets = new AssetResolver(LOCAL_CAPTURE);

/**
 * Mocked Home fragment endpoints.
 *
 * Paths and the `{ html }` envelope come from the reference pack
 * (`machine/endpoints.json`, confidence: observed source). No endpoint is
 * invented here; anything not documented returns 404 so the extension's
 * fallback path gets exercised rather than papered over.
 */
const API_ROUTES: Record<string, string> = {
  '/home/overdue_submissions_ajax': 'overdue-submissions',
  '/home/upcoming_submissions_ajax': 'upcoming-submissions',
  '/home/upcoming_ajax': 'upcoming-events',
  '/home/recently_completed_ajax': 'recently-completed',
};

function send(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Banner linking every fixture route and scenario, injected into each page. */
function fixtureBanner(pathname: string, scenario: ScenarioName): string {
  const routeLinks = INDEX_LINKS.map((link) => {
    const url = new URL(link.href, 'http://x');
    if (scenario !== 'default') url.searchParams.set('fixture', scenario);
    return `<a href="${url.pathname}${url.search}">${link.label}</a>`;
  }).join('');

  const scenarioLinks = SCENARIOS.map((item) => {
    const url = new URL(pathname, 'http://x');
    if (item.name !== 'default') url.searchParams.set('fixture', item.name);
    const active = item.name === scenario ? ' style="font-weight:700;color:#fff"' : '';
    return `<a href="${url.pathname}${url.search}"${active} title="${item.description}">${item.name}</a>`;
  }).join('');

  const off = new URL(pathname, 'http://x');
  off.searchParams.set('betterSchoology', 'off');
  if (scenario !== 'default') off.searchParams.set('fixture', scenario);

  return (
    '<div id="bs-fixture-banner">' +
    `<span class="bs-fixture-banner__group"><strong>Fixture</strong>${routeLinks}</span>` +
    `<span class="bs-fixture-banner__group"><strong>Scenario</strong>${scenarioLinks}</span>` +
    `<span class="bs-fixture-banner__group"><a href="${off.pathname}${off.search}">Better Schoology off</a></span>` +
    '</div>'
  );
}

function servePage(res: ServerResponse, pathname: string, search: URLSearchParams): void {
  const route = resolveFixture(pathname, search);

  if (!route) {
    // A route Schoology has but we did not capture. Serving an honest 404 keeps
    // the extension's "unknown page" path exercised.
    send(
      res,
      404,
      'text/html; charset=utf-8',
      indexPage(`No fixture for <code>${escapeHtml(pathname)}</code>.`),
    );
    return;
  }

  const file = join(PAGES_DIR, `${route.fixture}.html`);
  if (!existsSync(file)) {
    send(
      res,
      500,
      'text/html; charset=utf-8',
      indexPage(
        `Fixture <code>${route.fixture}.html</code> is missing. ` +
          'Run <code>npm run schoology:import</code> with a capture in <code>.local-schoology/raw/</code>.',
      ),
    );
    return;
  }

  const requested = search.get('fixture');
  const scenario: ScenarioName = isScenario(requested) ? requested : 'default';

  let html = readFileSync(file, 'utf8');
  html = applyScenario(html, scenario);
  html = html.replace(/<body([^>]*)>/i, (_match, attrs) => `<body${attrs}>${fixtureBanner(pathname, scenario)}`);

  send(res, 200, 'text/html; charset=utf-8', html);
}

function serveApi(res: ServerResponse, pathname: string, search: URLSearchParams): void {
  const base = API_ROUTES[pathname];
  if (!base) {
    send(res, 404, 'application/json', JSON.stringify({ error: 'not found' }));
    return;
  }

  const scenario = search.get('fixture');

  // A hand-authored `<base>.<scenario>.json` wins outright; otherwise the
  // default payload is transformed to produce the scenario.
  const specific = scenario ? join(API_DIR, `${base}.${scenario}.json`) : null;
  if (specific && existsSync(specific)) {
    send(res, 200, 'application/json; charset=utf-8', readFileSync(specific, 'utf8'));
    return;
  }

  const file = join(API_DIR, `${base}.json`);
  if (!existsSync(file)) {
    send(res, 200, 'application/json', JSON.stringify({ html: '' }));
    return;
  }

  let payload = readFileSync(file, 'utf8');

  if (scenario && isScenario(scenario) && scenario !== 'default') {
    try {
      const parsed = JSON.parse(payload) as { html?: string };
      if (typeof parsed.html === 'string') {
        parsed.html = applyScenario(parsed.html, scenario, true);
        payload = JSON.stringify(parsed);
      }
    } catch {
      // Malformed fixture: return it untouched rather than failing the request.
    }
  }

  send(res, 200, 'application/json; charset=utf-8', payload);
}

function serveDevAsset(res: ServerResponse, name: string): void {
  const file = join(DEV_ASSETS, name);
  // Contain path traversal: only files directly inside the dev asset directory.
  if (!file.startsWith(DEV_ASSETS) || !existsSync(file)) {
    send(res, 404, 'text/plain', 'not found');
    return;
  }

  const contentType = name.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : name.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';

  send(res, 200, contentType, readFileSync(file));
}

function serveCapturedAsset(res: ServerResponse, name: string): void {
  // `captured.css` is the optional real-stylesheet layer: present only for
  // developers who have a capture, absent (and harmless) for everyone else.
  const resolved = assets.resolve(name);
  send(res, 200, resolved.contentType, resolved.body);
}

function indexPage(message?: string): string {
  const links = INDEX_LINKS.map(
    (link) => `<li><a href="${link.href}"><code>${link.href}</code> — ${link.label}</a></li>`,
  ).join('');

  const scenarios = SCENARIOS.map(
    (item) => `<li><code>?fixture=${item.name}</code> — ${item.description}</li>`,
  ).join('');

  return `<!doctype html>
<meta charset="utf-8">
<title>Better Schoology fixture server</title>
<style>
  body { font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         margin: 0 auto; max-width: 780px; padding: 40px 24px; line-height: 1.55; }
  code { background: #f1f3f5; border-radius: 3px; padding: 1px 5px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 28px; }
  ul { padding-left: 20px; } li { margin: 5px 0; }
  .note { background: #f7f9fa; border-left: 3px solid #0677ba; padding: 10px 14px; }
</style>
<h1>Better Schoology — local Schoology fixture server</h1>
${message ? `<p class="note">${message}</p>` : ''}
<p>A faithful client-side reconstruction of captured Schoology surfaces, for extension development.
   Not a Schoology emulator.</p>
<h2>Routes</h2>
<ul>${links}</ul>
<h2>Scenarios</h2>
<p>Append to any route, e.g. <code>/home?fixture=overdue</code>.</p>
<ul>${scenarios}</ul>
<h2>Compare native vs enhanced</h2>
<p>Append <code>?betterSchoology=off</code> to any route to disable Better Schoology
   for that page (development builds only).</p>
<h2>Captured assets</h2>
<p>${
    assets.hasCapturedAssets()
      ? `${assets.capturedCount()} captured asset(s) found in <code>.local-schoology/</code> and being served.`
      : 'No local capture found. Pages use the bundled Schoology-like stylesheet; images degrade to placeholders.'
  }</p>`;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname, searchParams } = url;

  if (pathname === '/__fixtures' || pathname === '/__fixtures/') {
    send(res, 200, 'text/html; charset=utf-8', indexPage());
    return;
  }

  if (pathname.startsWith('/__bs_fixture/')) {
    serveDevAsset(res, pathname.slice('/__bs_fixture/'.length));
    return;
  }

  if (pathname.startsWith('/__schoology_assets/')) {
    serveCapturedAsset(res, pathname.slice('/__schoology_assets/'.length));
    return;
  }

  if (pathname in API_ROUTES) {
    serveApi(res, pathname, searchParams);
    return;
  }

  servePage(res, pathname, searchParams);
});

server.listen(PORT, HOST, () => {
  const missing = !existsSync(join(PAGES_DIR, 'home.html'));

  console.log('');
  console.log(`  Schoology fixtures  http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}/home`);
  console.log(`  Fixture index       http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}/__fixtures`);
  console.log(
    `  Captured assets     ${
      assets.hasCapturedAssets() ? `${assets.capturedCount()} file(s) from .local-schoology/` : 'none (using bundled shell CSS)'
    }`,
  );
  if (missing) {
    console.log('');
    console.log('  ! No page fixtures found. Run: npm run schoology:import');
  }
  console.log('');
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;',
  );
}
