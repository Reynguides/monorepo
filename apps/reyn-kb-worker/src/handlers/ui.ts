import type { Handler } from "hono";
import type { Env } from "../types/env.ts";

/**
 * A single self-contained HTML page for internal demos: browse sources/pages and
 * inspect each page's chunks + embedding status, all over the open read APIs. No
 * build step, no framework, no external assets — the client script uses plain DOM
 * APIs (textContent, so it is also XSS-safe). Intentionally minimal: this exists to
 * prove the KB is filled in correctly, not to be a product surface.
 *
 * Note: this string is a template literal, so the embedded script avoids backticks
 * and `${`, and any backslash is doubled (e.g. `\\n`) to survive into the output.
 */
const BROWSE_UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reyn Knowledge Base — browse</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  header { padding: 10px 16px; border-bottom: 1px solid #8884; display: flex;
           flex-wrap: wrap; gap: 4px 16px; align-items: baseline; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .stats { color: #888; font-size: 12px; }
  .badge { font-size: 12px; padding: 1px 8px; border-radius: 10px;
           border: 1px solid #8884; cursor: help; white-space: pre; }
  .badge.ok { background: #2e7d3233; }
  .badge.bad { background: #c6282833; }
  main { display: grid; grid-template-columns: 340px 1fr; height: calc(100vh - 50px); }
  aside { border-right: 1px solid #8884; overflow: auto; padding: 10px; }
  section.detail { overflow: auto; padding: 16px; }
  label { font-size: 12px; color: #888; }
  select, input { width: 100%; padding: 6px; margin: 4px 0 10px; font: inherit; }
  ul { list-style: none; margin: 0; padding: 0; }
  li.page { padding: 6px 8px; border-radius: 6px; cursor: pointer; }
  li.page:hover { background: #8882; }
  li.page small { color: #888; display: block; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #8884; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { font-size: 12px; color: #888; }
  td.text { white-space: pre-wrap; max-width: 640px; }
  td.center { text-align: center; }
  .no { color: #c62828; font-weight: 700; }
  .yes { color: #2e7d32; }
  pre.md { white-space: pre-wrap; background: #8881; padding: 10px; border-radius: 6px; }
  .muted { color: #888; }
  .meta span { margin-right: 14px; }
</style>
</head>
<body>
<header>
  <h1>Reyn Knowledge Base</h1>
  <span class="stats" id="stats">loading…</span>
  <span class="badge" id="verify" title="">integrity…</span>
</header>
<main>
  <aside>
    <label for="source">Source</label>
    <select id="source"></select>
    <label for="q">Keyword search (across all sources)</label>
    <input id="q" placeholder="search chunks, then press Enter" />
    <ul id="list"></ul>
    <button id="more" style="display: none">Load more</button>
  </aside>
  <section class="detail" id="detail">
    <p class="muted">Pick a page to inspect its chunks and embedding status.</p>
  </section>
</main>
<script>
(function () {
  var listEl = document.getElementById('list');
  var detailEl = document.getElementById('detail');
  var sourceEl = document.getElementById('source');
  var qEl = document.getElementById('q');
  var moreEl = document.getElementById('more');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  async function getJSON(url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }
  async function postJSON(url, body) {
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await r.json();
  }

  async function loadStats() {
    var s = document.getElementById('stats');
    try {
      var d = await getJSON('/v1/kb/stats');
      s.textContent = d.sources + ' sources · ' + d.pages + ' pages · ' + d.chunks +
        ' chunks · ' + d.embeddings + ' embeddings · ' + d.edges + ' edges · ' +
        d.entities + ' entities';
    } catch (e) { s.textContent = 'stats unavailable'; }
  }

  async function loadVerify() {
    var b = document.getElementById('verify');
    try {
      var v = await getJSON('/v1/kb/verify');
      b.textContent = v.ok ? 'integrity: OK' : 'integrity: issues';
      b.className = 'badge ' + (v.ok ? 'ok' : 'bad');
      var lines = [];
      for (var k in v.checks) {
        var val = v.checks[k];
        lines.push(k + ': ' + (Array.isArray(val) ? val.length : val));
      }
      b.title = lines.join('\\n');
    } catch (e) { b.textContent = 'integrity: ?'; }
  }

  function appendPageItems(items) {
    items.forEach(function (p) {
      var li = el('li', 'page');
      li.appendChild(el('div', null, p.title || p.url));
      li.appendChild(el('small', null, (p.headingPath ? p.headingPath + ' · ' : '') +
        (p.pageType || '') + (p.lifecycle ? ' · ' + p.lifecycle : '')));
      li.onclick = function () { loadDetail(p.pageId || p.id); };
      listEl.appendChild(li);
    });
  }

  // Browse paging state. curCursor is the opaque nextCursor returned by the last
  // page fetch; null once the source is exhausted (or while in search mode).
  var curSource = null;
  var curCursor = null;

  async function loadFirstPage(sourceId) {
    curSource = sourceId;
    curCursor = null;
    listEl.replaceChildren();
    await loadMore();
    if (!listEl.childNodes.length) listEl.appendChild(el('li', 'muted', 'no pages'));
  }

  async function loadMore() {
    if (curSource == null) return;
    var url = '/v1/kb/pages?source=' + encodeURIComponent(curSource) + '&limit=500';
    if (curCursor) url += '&cursor=' + encodeURIComponent(curCursor);
    var d = await getJSON(url);
    appendPageItems(d.items);
    curCursor = d.nextCursor;
    moreEl.style.display = curCursor ? '' : 'none';
  }

  async function loadDetail(id) {
    detailEl.replaceChildren();
    detailEl.appendChild(el('p', 'muted', 'loading…'));
    var page = await getJSON('/v1/kb/pages/' + encodeURIComponent(id));
    var data = await getJSON('/v1/kb/pages/' + encodeURIComponent(id) + '/chunks');
    detailEl.replaceChildren();

    detailEl.appendChild(el('h2', null, page.title || page.url));
    var meta = el('div', 'meta');
    meta.appendChild(el('span', null, 'type: ' + page.pageType));
    meta.appendChild(el('span', null, 'lifecycle: ' + page.lifecycle));
    meta.appendChild(el('span', null, 'version: ' + page.version));
    meta.appendChild(el('span', null, 'chunks: ' + data.chunks.length));
    var a = el('a', null, page.url); a.href = page.url; a.target = '_blank';
    meta.appendChild(a);
    detailEl.appendChild(meta);

    detailEl.appendChild(el('h3', null, 'Chunks'));
    if (!data.chunks.length) {
      detailEl.appendChild(el('p', 'muted', 'No chunks — this page was stored but never indexed.'));
    } else {
      var table = el('table');
      var head = el('tr');
      ['#', 'heading path', 'tokens', 'embedded', 'text'].forEach(function (h) {
        head.appendChild(el('th', null, h));
      });
      table.appendChild(head);
      data.chunks.forEach(function (c) {
        var tr = el('tr');
        tr.appendChild(el('td', 'center', String(c.ord)));
        tr.appendChild(el('td', null, c.headingPath || '—'));
        tr.appendChild(el('td', 'center', String(c.tokenCount)));
        tr.appendChild(el('td', 'center ' + (c.hasEmbedding ? 'yes' : 'no'),
          c.hasEmbedding ? 'yes' : 'NO'));
        tr.appendChild(el('td', 'text', c.text));
        table.appendChild(tr);
      });
      detailEl.appendChild(table);
    }

    detailEl.appendChild(el('h3', null, 'Cleaned markdown'));
    detailEl.appendChild(el('pre', 'md', page.markdown || page.html || '(none stored)'));
  }

  async function search() {
    var q = qEl.value.trim();
    if (!q) { loadFirstPage(sourceEl.value); return; }
    // Search returns a fixed top-K set (no cursor), so paging is disabled here.
    curSource = null;
    curCursor = null;
    moreEl.style.display = 'none';
    var d = await postJSON('/v1/kb/search', { query: q, mode: 'keyword', topK: 50 });
    listEl.replaceChildren();
    var items = d.results.map(function (r) {
      return { id: r.pageId, pageId: r.pageId, title: r.title, url: r.url,
               pageType: r.pageType, headingPath: r.headingPath };
    });
    appendPageItems(items);
    if (!items.length) listEl.appendChild(el('li', 'muted', 'no matches'));
  }

  sourceEl.onchange = function () { qEl.value = ''; loadFirstPage(sourceEl.value); };
  qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
  moreEl.onclick = function () { loadMore(); };

  async function init() {
    await loadStats();
    await loadVerify();
    var d = await getJSON('/v1/kb/sources');
    sourceEl.replaceChildren();
    d.sources.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name + ' (tier ' + s.tier + ')';
      sourceEl.appendChild(o);
    });
    if (d.sources.length) loadFirstPage(d.sources[0].id);
    else listEl.appendChild(el('li', 'muted', 'no sources registered'));
  }
  init();
})();
</script>
</body>
</html>
`;

/** GET / (open) — the minimal browse/verify UI. */
export const browseUiHandler: Handler<{ Bindings: Env }> = (c) => c.html(BROWSE_UI_HTML);
