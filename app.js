/* Film da vedere · CAIMEO Production */
(function () {
  'use strict';
  const D = window.FDV_DATA;
  const GENRES = D.GENRES;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fmtDay = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); };
  // "dal 3 ott", ma "dall'8 ott" e "dall'11 ott"
  const dal = (iso, long) => { const d = parseInt(iso.slice(8, 10), 10); const txt = long ? fmtLong(iso) : fmtDay(iso); return (d === 8 || d === 11 ? "dall'" : 'dal ') + txt; };
  const fmtLong = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }); };

  /* ---------- piattaforma ---------- */
  const Cap = window.Capacitor;
  const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  let AppPlugin = null;
  if (native) { try { AppPlugin = Cap.registerPlugin ? Cap.registerPlugin('App') : Cap.Plugins.App; } catch (e) { AppPlugin = Cap.Plugins && Cap.Plugins.App; } }

  /* ---------- dati salvati ---------- */
  const KEY = 'fdv.items.v1', WHO = 'fdv.who';
  function load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((x) => x && x.id && x.t).map((x) => ({ ...x, g: GENRES.includes(x.g) ? x.g : 'Altro' })) : [];
    } catch (e) { return []; }
  }
  let items = load();
  function save() {
    persist();
    if (window.FDV_SYNC) FDV_SYNC.push(items);
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { toast('Non riesco a salvare la lista'); }
  }
  let who = 'Lui';
  try { if (localStorage.getItem(WHO) === 'Lei') who = 'Lei'; } catch (e) { /* predefinito */ }
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* colori della locandina disegnata, stabili per titolo */
  const PALETTE = [['#2b3a8f', '#d0507a'], ['#c47a3a', '#5c2a2a'], ['#2f7a3a', '#b8262e'], ['#d39a2b', '#3b1e10'], ['#6f8fa8', '#1f2b3a'], ['#4d6e48', '#121812'],
    ['#8b4422', '#24120c'], ['#d08a3c', '#5a2c12'], ['#3a4d6e', '#05070c'], ['#a33d8a', '#1c2d6b'], ['#2f7f8a', '#a8462e'], ['#e07a2e', '#5a1a5e'], ['#e2788a', '#4a1e3a'],
    ['#2a5a9a', '#0a0e1a'], ['#8a2a2a', '#100404'], ['#c8a03a', '#3a2a0a'], ['#5a3a5a', '#0e0a10'], ['#3a7ac0', '#1a1a3a'], ['#9ab08a', '#3a2a3a'], ['#e04a2a', '#2a0a2a']];
  function colors(f) {
    let h = 0; const s = norm(f.t);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  const cols = (f) => { const [a, b] = colors(f); return `--c1:${a};--c2:${b}`; };

  /* ---------- stato ---------- */
  let tab = 'todo', genre = 'Tutti', kind = 'tutto', searching = false, current = null, sheetMode = 'list', lastView = '';
  const catalog = new Map();
  let news = { loading: false, error: false, data: D.cached() };
  let search = { q: '', seq: 0, films: null, series: null, loadingF: false, loadingS: false, errF: false, errS: false };

  const PLAY = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0 10 6 0 12Z" fill="currentColor"/></svg>';
  const kindLabel = (f) => (f.k === 'serie' ? 'Serie' : 'Film');
  function sub(f) {
    if (f.k === 'serie') return [f.d, f.y].filter(Boolean).join(' · ');
    return [f.y, f.d].filter(Boolean).join(' · ');
  }

  function poster(f, o = {}) {
    const tags = o.bare ? '' : `<span class="p-tags"><span class="${f.seen ? 'ok' : ''}">${f.seen ? '✓ Visto' : esc(f.by || '')}</span>${f.k === 'serie' ? '<span class="k">SERIE</span>' : ''}</span>`;
    const img = f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
    const tag = o.tag || 'button';
    const g = GENRES.includes(f.g) ? f.g : 'Altro';
    return `<${tag} class="poster g-${g}${f.img ? ' has-img' : ''}${f.seen && !o.bare ? ' seen' : ''}${o.mini ? ' mini' : ''}" style="${cols(f)}" ${o.attrs || ''}${tag === 'button' ? ` aria-label="${esc(f.t)}"` : ''}>
      ${img}${tags}<span class="p-title">${esc(f.t)}</span><span class="p-year">${esc(sub(f))}</span></${tag}>`;
  }
  // locandine: si mostrano quando arrivano, se non arrivano resta quella disegnata
  document.addEventListener('load', (e) => { const t = e.target; if (t && t.tagName === 'IMG') t.classList.add('ok'); }, true);
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.id === 'sc-img') { t.hidden = true; return; }
    const hero = t.closest('.hero');
    if (hero) { hero.classList.remove('has-img'); hero.querySelectorAll('.hero-art img').forEach((i) => i.remove()); return; }
    const p = t.parentElement;
    if (p) p.classList.remove('has-img');
    t.remove();
  }, true);

  const inTab = (f) => (tab === 'seen' ? f.seen : !f.seen) && (kind === 'tutto' || f.k === kind);

  /* ---------- lista ---------- */
  function render() {
    const todo = items.filter((f) => !f.seen);
    $('#n-todo').textContent = todo.length || '';
    $('#n-seen').textContent = (items.length - todo.length) || '';
    const pool = items.filter(inTab);
    if (genre !== 'Tutti' && !pool.some((f) => f.g === genre)) genre = 'Tutti';
    $('#chips').hidden = searching || !pool.length;
    $('#chips').innerHTML = ['Tutti', ...GENRES].map((g) => {
      const n = g === 'Tutti' ? pool.length : pool.filter((f) => f.g === g).length;
      if (g !== 'Tutti' && !n) return '';
      return `<button aria-pressed="${g === genre}" data-g="${g}">${g}<em>${n || ''}</em></button>`;
    }).join('');
    const el = $('#list');
    if (searching) { renderSearch(el); return; }
    const view = `list:${tab}:${kind}:${genre}`;
    const rise = view !== lastView ? ' rise' : '';
    lastView = view;
    let h = '';
    if (genre === 'Tutti') {
      if (tab === 'todo' && pool.length) {
        const f = pool.reduce((a, b) => ((a.added || 0) >= (b.added || 0) ? a : b));
        const art = f.img ? `<img class="bg" src="${esc(f.img)}" alt="" referrerpolicy="no-referrer"><img class="fg" src="${esc(f.img)}" alt="" referrerpolicy="no-referrer">` : '';
        h += `<section class="hero${f.img ? ' has-img' : ''}${rise}" style="${cols(f)}"><div class="hero-art g-${f.g}">${art}</div><span class="shine"></span>
          <div class="hero-tag"><span>Prossimo spettacolo</span><span>${kindLabel(f)}</span></div>
          <div class="hero-body"><h2>${esc(f.t)}</h2><p>${esc([f.g, sub(f), f.by ? 'aggiunto da ' + f.by : ''].filter(Boolean).join(' · '))}</p>
          <div class="hero-actions"><button class="pill gold" data-watch="${esc(f.id)}">${PLAY}Guardiamo questo</button><button class="pill glass" data-id="${esc(f.id)}">Dettagli</button></div></div></section>`;
      }
      let i = 0;
      h += GENRES.map((g) => {
        const fs = pool.filter((f) => f.g === g).sort((a, b) => (b.added || 0) - (a.added || 0));
        if (!fs.length) return '';
        return `<section class="shelf${rise}" style="animation-delay:${(++i) * 60}ms"><div class="shelf-head"><h2>${g}<span>${fs.length}</span></h2>${fs.length > 2 ? `<button class="more" data-genre="${g}">Vedi tutti</button>` : ''}</div>
          <div class="row">${fs.map((f) => poster(f, { attrs: `data-id="${esc(f.id)}"` })).join('')}</div></section>`;
      }).join('');
      if (!pool.length) {
        h = tab === 'seen'
          ? `<div class="empty${rise}"><strong>Ancora niente di visto</strong>Quando finite un film o una serie, lo trovate qui.</div>`
          : `<div class="empty${rise}"><strong>${items.length ? 'Nessun titolo qui' : 'La vostra sala è vuota'}</strong>Cercate un film o una serie, oppure guardate cosa c'è al cinema adesso.<br><button class="pill gold" data-act="news">Novità al cinema e in streaming</button></div>`;
      }
      el.innerHTML = h;
    } else {
      const fs = pool.filter((f) => f.g === genre).sort((a, b) => (b.added || 0) - (a.added || 0));
      el.innerHTML = `<div class="grid${rise}">${fs.map((f) => poster(f, { attrs: `data-id="${esc(f.id)}"` })).join('')}</div>`;
    }
  }

  /* ---------- ricerca e novità ---------- */
  const inList = (c) => items.find((i) => (c.src && i.src === c.src) || (i.k === c.k && norm(i.t) === norm(c.t)));
  function resRow(c, ctx) {
    catalog.set(c.src, c);
    const added = !!inList(c);
    let badge = '', info = '';
    if (c.k === 'film') {
      if (ctx === 'news') {
        const out = c.date && c.date <= todayISO();
        badge = out ? '<span class="badge">In sala</span>' : '<span class="badge soon">In arrivo</span>';
        info = (out ? dal(c.date) : 'esce il ' + fmtDay(c.date)) + ' · ' + c.g;
      } else { badge = '<span class="badge soon">Film</span>'; info = [c.y, c.g, c.dir].filter(Boolean).join(' · '); }
    } else {
      badge = c.d ? `<span class="badge">${esc(c.d)}</span>` : '<span class="badge soon">Serie</span>';
      info = ctx === 'news' ? [c.season > 1 ? 'Stagione ' + c.season : 'Nuova serie', fmtDay(c.date), c.g].filter(Boolean).join(' · ') : [c.y, c.g].filter(Boolean).join(' · ');
    }
    return `<div class="res" data-open="${esc(c.src)}">${poster(c, { bare: true, mini: true, tag: 'span' })}<div class="info"><b>${esc(c.t)}</b><small>${badge}<span>${esc(info)}</span></small></div>
      <button class="add" data-add="${esc(c.src)}" ${added ? 'disabled' : ''}>${added ? 'In lista' : '+ Aggiungi'}</button></div>`;
  }
  const skel = (n) => Array.from({ length: n }, () => '<div class="res skel" aria-hidden="true"><span class="poster mini"></span><div class="info"><i></i><i></i></div><span></span></div>').join('');
  const oops = (msg, act) => `<div class="oops"><span>${msg}</span><button data-act="${act}">Riprova</button></div>`;
  const offlineMsg = () => (navigator.onLine === false ? 'Sei offline: collegati a internet e riprova.' : 'Non riesco a raggiungere l\'archivio online.');

  function renderSearch(el) {
    const q = $('#q').value.trim();
    const view = 'search:' + (q ? 'q' : 'news') + ':' + kind;
    const rise = view !== lastView ? ' rise' : '';
    lastView = view;
    let h = `<div class="results${rise}">`;
    if (!q) {
      const d = news.data;
      const today = todayISO();
      if (kind !== 'serie') {
        const films = d && d.films;
        const now = films ? films.filter((f) => f.date && f.date <= today) : [];
        const soon = films ? films.filter((f) => f.date && f.date > today).sort((a, b) => a.date.localeCompare(b.date)) : [];
        h += '<h3><span class="live"></span>Al cinema adesso</h3>';
        if (films) h += now.length ? now.map((c) => resRow(c, 'news')).join('') : '<p class="note">Nessun film trovato nelle ultime settimane.</p>';
        else if (news.loading) h += skel(4);
        else h += oops(offlineMsg(), 'news');
        if (soon.length) h += '<h3>Prossimamente al cinema</h3>' + soon.map((c) => resRow(c, 'news')).join('');
      }
      if (kind !== 'film') {
        const series = d && d.series;
        h += '<h3><span class="live"></span>Nuove serie in streaming</h3>';
        if (series) h += series.length ? series.map((c) => resRow(c, 'news')).join('') : '<p class="note">Nessuna serie nuova in questi giorni.</p>';
        else if (news.loading) h += skel(3);
        else h += oops(offlineMsg(), 'news');
      }
      h += `<p class="note">Film usciti nelle sale italiane da Wikidata e Wikipedia, serie da TVmaze. Si aggiornano da soli ogni giorno. · Versione ${esc(window.APP_VERSION || '1.0')}</p>`;
    } else {
      const nq = norm(q);
      const mine = items.filter((f) => norm(f.t).includes(nq) && (kind === 'tutto' || f.k === kind));
      if (mine.length) {
        h += '<h3>Già nella vostra lista</h3>' + mine.map((f) => `<div class="res" data-id="${esc(f.id)}">${poster(f, { bare: true, mini: true, tag: 'span' })}<div class="info"><b>${esc(f.t)}</b><small><span>${kindLabel(f)} · ${f.g} · ${f.seen ? 'visto' : 'da vedere'}</span></small></div><span></span></div>`).join('');
      }
      const same = search.q === q;
      if (kind !== 'serie') {
        h += '<h3>Film</h3>';
        if (same && search.films) h += search.films.length ? search.films.map((c) => resRow(c, 'search')).join('') : '<p class="note">Nessun film con questo titolo.</p>';
        else if (same && search.errF) h += oops(offlineMsg(), 'search');
        else h += skel(3);
      }
      if (kind !== 'film') {
        h += '<h3>Serie</h3>';
        if (same && search.series) h += search.series.length ? search.series.map((c) => resRow(c, 'search')).join('') : '<p class="note">Nessuna serie con questo titolo.</p>';
        else if (same && search.errS) h += oops(offlineMsg(), 'search');
        else h += skel(3);
      }
    }
    el.innerHTML = h + '</div>';
  }

  async function loadNews(force) {
    if (news.loading) return;
    if (news.data && news.data.films && news.data.series && !force) return;
    news.loading = true; news.error = false;
    if (searching) render();
    try {
      const d = await D.news(force);
      const old = news.data || {};
      news.data = { ...d, films: d.films || old.films || null, series: d.series || old.series || null };
    } catch (e) { news.error = true; }
    news.loading = false;
    if (searching) render();
  }

  let searchTimer = 0;
  function runSearch() {
    const q = $('#q').value.trim();
    clearTimeout(searchTimer);
    if (!q) { render(); return; }
    if (search.q === q && (search.films || search.loadingF) && (search.series || search.loadingS)) { render(); return; }
    const seq = ++search.seq;
    search = { q, seq, films: null, series: null, loadingF: true, loadingS: true, errF: false, errS: false };
    render();
    D.searchFilms(q).then((r) => { if (search.seq === seq) search.films = r; }, () => { if (search.seq === seq) search.errF = true; })
      .finally(() => { if (search.seq === seq) { search.loadingF = false; if (searching) render(); } });
    D.searchSeries(q).then((r) => { if (search.seq === seq) search.series = r; }, () => { if (search.seq === seq) search.errS = true; })
      .finally(() => { if (search.seq === seq) { search.loadingS = false; if (searching) render(); } });
  }
  function startSearch() {
    if (!searching) { searching = true; $('#cancel').hidden = false; }
    loadNews();
  }
  function stopSearch() {
    searching = false; clearTimeout(searchTimer);
    $('#q').value = ''; $('#cancel').hidden = true; $('#q').blur();
  }

  function addFromCatalog(c) {
    if (!c) return;
    if (inList(c)) { toast('È già nella vostra lista'); return; }
    items.push({ id: newId(), stream: c.src && streamCache.get(c.src), src: c.src, k: c.k, t: c.t, y: c.y || '', g: GENRES.includes(c.g) ? c.g : 'Altro', d: c.d || '', img: c.img || '', p: c.p || '',
      date: c.date || '', dir: c.dir || '', enw: c.enw || '', by: who, seen: false, added: Date.now() });
    save();
    toast(`${c.t} aggiunto in ${c.g}`);
    render();
  }

  /* ---------- controlli ---------- */
  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; genre = b.dataset.g; render(); });
  function setKind(k) {
    kind = k; genre = 'Tutti';
    [...$('#seg').querySelectorAll('button')].forEach((x, i) => { x.setAttribute('aria-pressed', x.dataset.k === k); if (x.dataset.k === k) $('#seg .knob').style.transform = `translateX(${i * 100}%)`; });
    render();
  }
  $('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setKind(b.dataset.k); });
  function setTab(t) {
    tab = t; genre = 'Tutti';
    $('#tab-todo').setAttribute('aria-selected', t === 'todo');
    $('#tab-seen').setAttribute('aria-selected', t === 'seen');
    stopSearch(); $('#scroll').scrollTop = 0; render();
  }
  $('#tab-todo').onclick = () => setTab('todo');
  $('#tab-seen').onclick = () => setTab('seen');
  function setWho(w) {
    who = w;
    try { localStorage.setItem(WHO, w); } catch (e) { /* non importa */ }
    $('#who').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.who === w));
  }
  $('#who').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setWho(b.dataset.who); toast(`Ora aggiunge ${b.dataset.who === 'Lui' ? 'lui' : 'lei'}`); } });
  setWho(who);
  $('#q').addEventListener('focus', () => { if (!searching) { startSearch(); render(); } });
  $('#q').addEventListener('input', () => {
    startSearch();
    clearTimeout(searchTimer);
    render();
    if ($('#q').value.trim().length >= 2) searchTimer = setTimeout(runSearch, 450);
  });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); runSearch(); } });
  $('#cancel').onclick = () => { stopSearch(); render(); };
  $('#list').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'news') { $('#scroll').scrollTop = 0; startSearch(); if (act.closest('.oops')) loadNews(true); render(); }
      if (act.dataset.act === 'search') { search.q = ''; runSearch(); }
      return;
    }
    const m = e.target.closest('[data-genre]');
    if (m) { genre = m.dataset.genre; render(); $('#scroll').scrollTop = 0; return; }
    const a = e.target.closest('[data-add]');
    if (a) { addFromCatalog(catalog.get(a.dataset.add)); return; }
    const w = e.target.closest('[data-watch]');
    if (w) { const f = items.find((x) => x.id === w.dataset.watch); if (f) projection(f); return; }
    const o = e.target.closest('[data-open]');
    if (o) { const c = catalog.get(o.dataset.open); if (c) openSheet(c, 'cat'); return; }
    const p = e.target.closest('[data-id]');
    if (p) { const f = items.find((x) => x.id === p.dataset.id); if (f) openSheet(f, 'list'); }
  });

  function toast(msg, action, fn) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); fn(); };
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('on'), action ? 4000 : 2200);
  }

  /* ---------- scheda ---------- */
  function openSheet(f, mode) {
    current = f; sheetMode = mode;
    $('#sheet').style.cssText = cols(f);
    $('#s-poster').innerHTML = poster(f, { bare: true, tag: 'div' });
    $('#s-title').textContent = f.t;
    const meta = [kindLabel(f), f.g];
    if (f.k === 'film') {
      if (f.y) meta.push(f.y);
      if (f.d) meta.push(f.d);
      if (mode === 'cat' && f.date) meta.push(f.date <= todayISO() ? 'Al cinema ' + dal(f.date, true) : 'Al cinema il ' + fmtLong(f.date));
      if (f.dir) meta.push('Regia di ' + f.dir);
    } else {
      if (f.d) meta.push(f.d);
      if (f.y) meta.push('Dal ' + f.y);
    }
    if (mode === 'list' && f.by) meta.push('Aggiunto da ' + f.by);
    $('#s-meta').innerHTML = meta.map((m) => `<span>${esc(m)}</span>`).join('');
    $('#s-plot').textContent = f.p || '';
    loadWhere(f);
    let h = '';
    if (mode === 'cat') {
      const added = !!inList(f);
      h = `<button class="btn-main" data-s="add" ${added ? 'disabled' : ''}>${added ? 'Già nella vostra lista' : '+ Aggiungi alla lista'}</button>`;
    } else {
      if (!f.seen) h += `<button class="btn-main" data-s="watch">${PLAY}Guardiamo questo</button>`;
      h += `<div class="btn-row"><button class="btn-sub" data-s="seen">${f.seen ? 'Rimetti da vedere' : 'Segna come visto'}</button><button class="btn-sub danger" data-s="remove">Togli dalla lista</button></div>`;
    }
    $('#s-actions').innerHTML = h;
    $('#sheet').scrollTop = 0;
    $('#scrim').classList.add('on'); $('#sheet').classList.add('on');
  }
  const sheetOpen = () => $('#sheet').classList.contains('on');

  /* ---------- dove vederlo in streaming ---------- */
  const STREAM_TTL = 2 * 864e5;
  const streamCache = new Map();
  const EXT = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1h6v6M9 1 1 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const GROUPS = [['FLATRATE', 'Abbonamento'], ['FREE', 'Gratis'], ['RENT', 'Noleggio'], ['BUY', 'Acquisto']];
  function paintWhere(f, c) {
    const el = $('#s-where');
    let h = '<h4>Dove vederlo in Italia</h4>';
    if (!c || c.loading) h += '<div class="wait"><i></i>Cerco sulle piattaforme…</div>';
    else if (c.error) h += `<p>${navigator.onLine === false ? 'Sei offline: non posso controllare adesso.' : 'Non riesco a controllare adesso.'}</p><button class="retry" data-w="retry">Riprova</button>`;
    else if (!c.offers || !c.offers.length) {
      const recent = f.k === 'film' && f.date && (Date.now() - new Date(f.date).getTime()) < 120 * 864e5;
      h += `<p>${recent ? 'Per ora è solo al cinema: non è ancora su nessuna piattaforma.' : 'Al momento non risulta in streaming in Italia.'}</p>`;
    } else {
      for (const [type, label] of GROUPS) {
        const os = c.offers.filter((o) => o.type === type);
        if (!os.length) continue;
        h += `<div class="grp"><span>${label}</span><div>${os.map((o) => `<button class="pf${type === 'FLATRATE' ? ' sub' : ''}" data-url="${esc(o.url)}">${esc(o.name)}${o.url ? EXT : ''}</button>`).join('')}</div></div>`;
      }
    }
    el.innerHTML = h;
  }
  async function loadWhere(f, force) {
    const key = f.src || f.k + ':' + norm(f.t);
    let c = !force && ((f.stream && Date.now() - f.stream.ts < STREAM_TTL && f.stream) || streamCache.get(key));
    if (c && Date.now() - c.ts < STREAM_TTL) { paintWhere(f, c); return; }
    paintWhere(f, { loading: true });
    try {
      const r = await D.streaming(f);
      c = { offers: r.offers, ts: Date.now() };
      streamCache.set(key, c);
      if (items.includes(f)) { f.stream = c; save(); }
    } catch (e) { c = { error: true }; }
    if (current === f && sheetOpen()) paintWhere(f, c);
  }
  function openExternal(url) {
    if (!/^https:\/\//.test(url)) return;
    if (native) location.href = url; else window.open(url, '_blank', 'noopener');
  }
  $('#s-where').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !current) return;
    if (b.dataset.w === 'retry') { loadWhere(current, true); return; }
    if (b.dataset.url) openExternal(b.dataset.url);
  });
  function closeSheet() { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); }
  $('#scrim').onclick = closeSheet;
  $('#s-actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b || !current) return;
    const f = current, s = b.dataset.s;
    if (s === 'add') { addFromCatalog(f); closeSheet(); }
    if (s === 'watch') { closeSheet(); projection(f); }
    if (s === 'seen') { f.seen = !f.seen; save(); toast(f.seen ? 'Spostato in Visti' : 'Di nuovo in programma'); closeSheet(); render(); }
    if (s === 'remove') {
      const idx = items.indexOf(f);
      if (idx < 0) { closeSheet(); return; }
      items.splice(idx, 1); save(); closeSheet(); render();
      toast('Tolto dalla lista', 'Annulla', () => { if (!items.includes(f)) { items.splice(Math.min(idx, items.length), 0, f); save(); render(); } });
    }
  });
  // trascina giù la scheda per chiuderla
  (function () {
    let y0 = null, dy = 0;
    const sh = $('#sheet');
    sh.addEventListener('touchstart', (e) => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    sh.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; }
    }, { passive: true });
    sh.addEventListener('touchend', () => {
      if (y0 == null) return;
      sh.style.transition = ''; sh.style.transform = '';
      if (dy > 90) closeSheet();
      y0 = null;
    });
  })();

  const pickPool = (excl) => items.filter((f) => !f.seen && f !== excl && (kind === 'tutto' || f.k === kind) && (genre === 'Tutti' || f.g === genre));
  $('#pick').onclick = () => {
    if (running) return;
    if (searching) { stopSearch(); render(); }
    const pool = pickPool();
    if (!pool.length) { toast(items.some((f) => !f.seen) ? 'Nessun titolo da vedere in questa sezione' : 'Prima aggiungete qualche titolo'); return; }
    closeSheet();
    projection(pool[Math.floor(Math.random() * pool.length)], pool);
  };

  /* ---------- proiezione: scelta del film ---------- */
  let running = false;
  const showOn = () => $('#show').classList.contains('on');
  async function projection(f, pool, again) {
    if (running) return;
    running = true; current = f;
    const s = $('#show');
    if (!again) s.className = 'show on'; else s.classList.remove('reveal', 'beam-on');
    $('#ticket').classList.remove('stamped');
    const msg = $('#show-msg'); msg.classList.remove('hide');
    $('#show-label').textContent = pool ? 'Estrazione del titolo' : 'Si spengono le luci';
    const roll = $('#show-roll'); roll.textContent = '';
    await wait(again ? 400 : 900);
    if (pool && pool.length > 1 && !reduced) {
      let delay = 60;
      for (let i = 0; i < 13; i++) { roll.textContent = pool[Math.floor(Math.random() * pool.length)].t; await wait(delay); delay *= 1.17; }
      roll.textContent = f.t; await wait(700);
    }
    msg.classList.add('hide');
    s.classList.add('beam-on'); await wait(450);
    s.classList.add('counting');
    for (const n of [3, 2, 1]) { $('#count').textContent = n; await wait(650); }
    s.classList.remove('counting');
    $('#f-poster').innerHTML = poster({ ...f, seen: false }, { bare: true, tag: 'div' });
    $('#f-title').textContent = f.t;
    const now = new Date();
    $('#f-date').textContent = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    $('#f-info').textContent = [f.k === 'serie' ? f.d || 'Serie' : f.d || f.y, 'ore ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ');
    s.classList.add('reveal');
    running = false;
  }
  async function lightsOn() {
    if (running) return;
    running = true;
    const s = $('#show');
    s.classList.remove('reveal', 'beam-on'); await wait(300);
    s.classList.remove('on'); await wait(1100);
    s.className = 'show';
    running = false;
  }
  $('#f-close').onclick = () => lightsOn();
  $('#f-seen').onclick = async () => {
    if (running || !current) return;
    const f = current; f.seen = true; save();
    await lightsOn(); toast(`${f.t} è tra i Visti`); render();
  };
  $('#f-other').onclick = () => {
    if (running) return;
    const pool = pickPool(current);
    if (!pool.length) { toast('Non ci sono altri titoli da vedere'); return; }
    projection(pool[Math.floor(Math.random() * pool.length)], pool, true);
  };
  let finaleOn = false;
  $('#f-now').onclick = async () => {
    if (running || finaleOn || !current) return;
    finaleOn = true;
    $('#ticket').classList.add('stamped');
    current.seen = true; save(); render();
    await wait(650);
    finale(current);
  };

  /* ---------- la sala ---------- */
  function buildSconces() {
    // lampade sulle pareti laterali; a sinistra lasciano libero lo spazio della porta con l'uscita
    const L = [[2.6, 25, 1], [5.4, 26.2, .8], [13.2, 27.5, .45]];
    const R = [[97.4, 25, 1], [94.4, 26.4, .8], [91.2, 27.8, .62], [86.8, 28.4, .45]];
    const all = [...L, ...R];
    $('#sconces').innerHTML = all.map(([x, y, s], i) => `<i class="sconce" style="--x:${x};--y:${y};--s:${s}" data-o="${(i * 3) % all.length}"></i>`).join('');
  }
  function placeExit() {
    // il cartello segue la prospettiva della parete sinistra (che sale verso il fondo della sala)
    const fin = $('#finale'), W = fin.clientWidth || 390, H = fin.clientHeight || 800;
    const slope = (0.10 * H) / (0.14 * W);
    $('#exit').style.setProperty('--skew', Math.atan(slope) + 'rad');
  }
  function buildSeats() {
    const person = (x, y, r, hair, cls = '', st = '') => {
      let hs = '';
      if (hair === 'long') hs = `<path d="M${x - r * 1.05} ${y} Q${x - r * 1.15} ${y + r * 1.9} ${x - r * .6} ${y + r * 2.1} L${x + r * .6} ${y + r * 2.1} Q${x + r * 1.15} ${y + r * 1.9} ${x + r * 1.05} ${y} Z" fill="#120b0c"/>`;
      if (hair === 'bun') hs = `<circle cx="${x + r * .2}" cy="${y - r * 1.05}" r="${r * .45}" fill="#120b0c"/>`;
      if (hair === 'cap') hs = `<path d="M${x - r} ${y - r * .15} A${r} ${r} 0 0 1 ${x + r} ${y - r * .15} L${x + r * 1.6} ${y - r * .05} L${x + r} ${y + r * .08} Z" fill="#1c1416"/>`;
      return `<g class="${cls}" style="${st}">${hair === 'long' ? hs : ''}<ellipse cx="${x}" cy="${y + r * 2}" rx="${r * 1.9}" ry="${r * 1.3}" fill="#0d0809"/><circle cx="${x}" cy="${y}" r="${r}" fill="#0f0a0b"/>${hair !== 'long' ? hs : ''}
        <path class="lit-warm" d="M${x - r * 1.7} ${y + r * 1.55} Q${x} ${y + r * .75} ${x + r * 1.7} ${y + r * 1.55}" stroke="rgba(255,190,120,.35)" stroke-width="${r * .12}" fill="none"/>
        <path class="lit-screen" d="M${x - r * .85} ${y - r * .5} A${r} ${r} 0 0 1 ${x + r * .85} ${y - r * .5}" stroke="var(--rim)" stroke-width="${Math.max(1, r * .09)}" fill="none"/></g>`;
    };
    const seat = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * .24}" fill="url(#seat)"/>
      <path class="lit-warm" d="M${x + w * .15} ${y + 1.5} H${x + w * .85}" stroke="rgba(255,190,120,.45)" stroke-width="1.4" stroke-linecap="round"/>
      <path class="lit-screen" d="M${x + w * .2} ${y + 1.5} H${x + w * .8}" stroke="var(--rim)" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round"/>`;
    const arm = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="40" rx="${w / 2}" fill="#1a0a0e"/>`;
    const bucket = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
      <circle class="pop" style="--px:-4px" cx="6" cy="-2" r="3" fill="#fff4d6"/><circle class="pop" style="--px:5px;animation-delay:.9s" cx="14" cy="-2" r="2.6" fill="#ffe7a8"/>
      <circle cx="4" cy="1" r="4" fill="#fff4d6"/><circle cx="10" cy="-1" r="4.4" fill="#ffeab8"/><circle cx="16" cy="1" r="4" fill="#fff4d6"/>
      <path d="M0 2 H20 L17 26 H3 Z" fill="#c8102e"/><path d="M5 2 L6.5 26 H9.5 L9 2 Z M13 2 L13.5 26 H16 L17 2 Z" fill="#f6efe3"/></g>`;
    const eater = (bx, by, hx, hy, delay) => {
      const dx = hx - bx, dy = hy - by;
      return `<circle class="hand" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s" cx="${bx}" cy="${by}" r="4.4" fill="#2a1a1c"/>
        <circle class="kernel" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s" cx="${bx}" cy="${by - 3}" r="2.5" fill="#fff4d6"/>`;
    };
    const cup = (x, y, hx, hy) => `<g class="sip" style="--dx:${hx - x}px;--dy:${hy - y}px"><path d="M${x} ${y} h10 l-1.6 16 h-6.8 z" fill="#1d5ac8"/><rect x="${x - .5}" y="${y - 2}" width="11" height="3" rx="1" fill="#e8e8f0"/><path d="M${x + 6} ${y - 2} l2 -9" stroke="#ff4a6a" stroke-width="1.6"/></g>`;
    let s = '<defs><linearGradient id="seat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a1628"/><stop offset=".45" stop-color="#2e0811"/><stop offset="1" stop-color="#120306"/></linearGradient></defs>';
    const zw = 24, zg = 3, zn = 15, zx0 = (390 - (zn * zw + (zn - 1) * zg)) / 2, zy = 50;
    ['short', '', 'long', 'short', 'cap', '', 'short', 'long', '', 'bun', 'short', '', 'long', 'short', ''].forEach((h, i) => { if (h) s += person(zx0 + i * (zw + zg) + zw / 2, zy, 5.5, h, 'chew', `animation-delay:${((i * .37) % 2.6).toFixed(2)}s`); });
    for (let i = 0; i < zn; i++) s += seat(zx0 + i * (zw + zg), zy + 9, zw, 120);
    const aw = 32, ag = 4, an = 11, ax0 = (390 - (an * aw + (an - 1) * ag)) / 2, ay = 96;
    ['short', 'long', '', 'cap', 'short', 'bun', 'long', '', 'short', 'long', 'short'].forEach((h, i) => { if (h) s += person(ax0 + i * (aw + ag) + aw / 2, ay, 7.5, h, 'chew', `animation-delay:${((i * .41) % 2.6).toFixed(2)}s`); });
    for (let i = 0; i < an; i++) s += seat(ax0 + i * (aw + ag), ay + 12, aw, 120);
    const bw = 46, bg = 5, bn = 8, bx0 = (390 - (bn * bw + (bn - 1) * bg)) / 2, by = 144;
    const bx = (i) => bx0 + i * (bw + bg) + bw / 2;
    ['long', 'short', '', 'bun', 'short', 'cap', '', 'long'].forEach((h, i) => { if (h) s += person(bx(i), by, 11.5, h, 'chew', `animation-delay:${((i * .53) % 2.6).toFixed(2)}s`); });
    for (let i = 0; i < bn; i++) s += seat(bx0 + i * (bw + bg), by + 16, bw, 140);
    s += bucket(bx(4) + 13, by + 4, .8) + eater(bx(4) + 18, by + 7, bx(4) + 5, by + 3, .5);
    s += cup(bx(1) + 12, by + 6, bx(1) + 4, by - 4);
    const fw = 72, fg = 6, fx0 = (390 - (5 * fw + 4 * fg)) / 2, fy = 210;
    const fx = (i) => fx0 + i * (fw + fg) + fw / 2;
    s += person(fx(0), fy, 18, 'cap', 'chew', 'animation-delay:.3s');
    s += person(fx(2) + 10, fy - 2, 19, 'long', 'chew') + person(fx(3) - 8, fy + 2, 18.5, 'short', 'chew', 'animation-delay:1.3s');
    s += person(fx(4) + 4, fy + 3, 17, 'bun', '');
    for (let i = 0; i < 5; i++) s += seat(fx0 + i * (fw + fg), fy + 26, fw, 130);
    for (let i = 1; i < 5; i++) s += arm(fx0 + i * (fw + fg) - fg / 2 - 4, fy + 40, 8);
    const mid = (fx(2) + fx(3)) / 2 + 1;
    s += bucket(mid - 12, fy + 8, 1.15) + eater(mid - 4, fy + 14, fx(2) + 16, fy + 4, 0) + eater(mid + 9, fy + 14, fx(3) - 14, fy + 6, 1.3);
    $('#seats').innerHTML = s;
  }
  function buildDust() {
    const d = $('#dust'); d.innerHTML = '';
    for (let i = 0; i < 34; i++) {
      const e = document.createElement('i');
      e.style.left = (20 + Math.random() * 60) + '%'; e.style.top = (6 + Math.random() * 26) + '%';
      e.style.animationDuration = (4 + Math.random() * 5) + 's'; e.style.animationDelay = (-Math.random() * 6) + 's';
      d.appendChild(e);
    }
  }
  async function finale(f) {
    const fin = $('#finale');
    fin.style.cssText = cols(f) + ';--rim:' + colors(f)[0];
    $('#screen').className = 'screen g-' + f.g;
    $('#sc-film').textContent = f.t;
    const si = $('#sc-img');
    si.classList.remove('ok');
    if (f.img) { si.hidden = false; si.src = f.img; } else { si.hidden = true; si.removeAttribute('src'); }
    $('#pre').textContent = 'Tra poco in sala · ' + f.t;
    buildSconces(); buildSeats(); buildDust();
    fin.className = 'finale on';
    placeExit();
    await wait(800);
    $('#show').className = 'show';
    await wait(2200);
    // le lampade alle pareti si spengono una alla volta; l'uscita di emergenza resta accesa
    const lamps = [...fin.querySelectorAll('.sconce')].sort((a, b) => a.dataset.o - b.dataset.o);
    for (const l of lamps) { l.classList.add('off'); await wait(320); }
    fin.classList.add('dark'); await wait(900);
    fin.classList.add('lit');
    await wait(5600);
    fin.classList.add('closed');
    await wait(1700);
    if (native && AppPlugin) {
      try { await AppPlugin.exitApp(); } catch (e) { /* se non si chiude, resta il pulsante */ }
      setTimeout(() => fin.classList.add('web'), 1500);
    } else fin.classList.add('web');
  }
  $('#reopen').onclick = () => {
    $('#finale').className = 'finale'; finaleOn = false;
    tab = 'todo'; genre = 'Tutti'; stopSearch(); setTab('todo'); playIntro();
  };

  /* ---------- sipario di velluto ----------
     Il velluto si disegna una volta sola in un'immagine; poi le due metà ondeggiano e si aprono
     solo con trasformazioni CSS, che il telefono gestisce senza ridisegnare nulla (niente sfarfallii). */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let velvetKey = '';
  function paintVelvet() {
    const el = $('#curtain'), r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const key = Math.round(r.width) + 'x' + Math.round(r.height);
    if (key === velvetKey) return;
    velvetKey = key;
    const scale = Math.min(1, 520 / r.width);
    const cw = Math.max(80, Math.round(r.width * scale)), ch = Math.max(160, Math.round(r.height * scale));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(cw, ch), d = img.data;
    const half = cw / 2, N = 6, TAU = Math.PI * 2, t = 2.3;
    for (let y = 0; y < ch; y++) {
      const yy = y / ch;
      const low = .15 + .85 * yy;
      const wave = (Math.sin(t * 1.25 - yy * 4.2) * .38 + Math.sin(t * .7 - yy * 2.3 + 1) * .22) * low;
      const gather = 1 + .35 * Math.pow(1 - yy, 2);
      let vert = .55 + .45 * Math.pow(yy, .8); if (yy < .16) vert *= .4 + .6 * yy / .16;
      const row = y * cw;
      for (let x = 0; x < cw; x++) {
        const left = x < half, xl = left ? x : cw - 1 - x, i = (row + x) * 4;
        const dist = half - xl;
        const u = xl / half;
        const a = u * N * TAU * gather + (left ? 0 : 1.9) + wave * (.3 + u * 1.9) * (left ? 1 : -1);
        const b2 = 2.13 * a + 1.7 + .6 * Math.sin(yy * 3 + t * .4);
        const h = Math.sin(a) + .32 * Math.sin(b2) + .14 * Math.sin(.47 * a + .3);
        const dh = Math.cos(a) + .68 * Math.cos(b2) + .066 * Math.cos(.47 * a + .3);
        const sl = dh * 1.1, nz = 1 / Math.sqrt(1 + sl * sl), nx = sl * nz * (left ? 1 : -1);
        const diff = Math.max(0, nz * .78 + nx * .32);
        const sheen = Math.pow(1 - nz, 1.6);
        const ao = .42 + .58 * (h + 1.46) / 2.92;
        const hem = ch - 3 * scale * 2 - (h + 1.46) * 1.4 * scale * 2;
        if (y > hem) { d[i] = 10; d[i + 1] = 6; d[i + 2] = 7; d[i + 3] = 255; continue; }
        let lum = (.07 + diff * .78 * ao + sheen * .5 * ao) * vert + (Math.random() - .5) * .045;
        if (dist < 5) lum *= .5 + .5 * dist / 5;
        if (xl < cw * .025) lum *= .65;
        let r = 14 + 232 * lum, g = 2 + 48 * lum * lum + sheen * 28 * ao, bl = 8 + 44 * lum + sheen * 30 * ao;
        if (y > hem - 3.2 * scale * 2) { const gl = .55 + .45 * diff; r = 150 * gl + 60; g = 105 * gl + 20; bl = 40 * gl + 10; }
        d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(bl, 0, 255); d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = 'url(' + cv.toDataURL('image/jpeg', .9) + ')';
    // ogni metà è fatta di strisce verticali di velluto: aprendosi scorrono di lato una dopo l'altra e ondeggiano
    el.querySelectorAll('.half').forEach((h) => {
      if (!h.children.length) h.innerHTML = Array.from({ length: STRIPS }, (_, k) => `<i class="s" style="left:${k * 100 / STRIPS}%"></i>`).join('');
      const hl = h.offsetLeft;
      [...h.children].forEach((st) => {
        st.style.backgroundImage = url;
        st.style.backgroundSize = r.width + 'px 100%';
        st.style.backgroundPosition = -(hl + st.offsetLeft) + 'px 0';
      });
    });
  }
  const STRIPS = 8;
  // apertura del sipario: la striscia al centro parte per prima e le altre la seguono, il fondo del tessuto resta indietro e oscilla
  function openCurtain() {
    const anims = [];
    $('#curtain').querySelectorAll('.half').forEach((h) => {
      const left = h.classList.contains('l'), sg = left ? -1 : 1, hw = h.offsetWidth;
      h.getAnimations().forEach((a) => a.cancel());
      [...h.children].forEach((st, k) => {
        const kin = left ? k : STRIPS - 1 - k; // 0 = bordo esterno, STRIPS-1 = bordo centrale
        const fromEdge = left ? st.offsetLeft : hw - st.offsetLeft - st.offsetWidth;
        const D = fromEdge * .86 * sg, f = kin / (STRIPS - 1), amp = 2.2 + 3.2 * f;
        const tr = (p, sk) => `translateX(${(D * p).toFixed(1)}px) skewX(${(sk * sg).toFixed(2)}deg)`;
        anims.push(st.animate([
          { transform: tr(0, 0) },
          { transform: tr(.06, -amp * .5), offset: .12 },
          { transform: tr(.4, amp), offset: .38 },
          { transform: tr(.78, -amp * .7), offset: .62 },
          { transform: tr(.95, amp * .4), offset: .8 },
          { transform: tr(1, -amp * .15), offset: .92 },
          { transform: tr(1, 0) },
        ], { duration: 2500, delay: (1 - f) * 380, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' }));
      });
    });
    return anims;
  }
  addEventListener('resize', () => { if (!$('#intro').hidden && !$('#intro').classList.contains('open')) paintVelvet(); });

  /* ---------- apertura: sei riflettori ---------- */
  // x in %, in basso (b) o appesi sotto la mantovana (t); r0 → r1 è l'oscillazione in gradi; o = intensità; g = gruppo di spegnimento
  const RIGS = [
    { x: 6, at: 'b', r0: 30, r1: 10, dur: 5.5, o: 1, g: 1 },
    { x: 94, at: 'b', r0: -30, r1: -10, dur: 6.2, o: 1, g: 2 },
    { x: 34, at: 'b', r0: -16, r1: 12, dur: 7, o: .75, g: 3 },
    { x: 66, at: 'b', r0: 16, r1: -12, dur: 6.6, o: .75, g: 1 },
    { x: 12, at: 't', r0: 150, r1: 168, dur: 5.8, o: .85, g: 2 },
    { x: 88, at: 't', r0: 210, r1: 192, dur: 6.4, o: .85, g: 3 },
  ];
  // Fasci di luce: una sola tela piccola (un terzo della risoluzione) ingrandita via CSS, ridisegnata in JS a ~30 fps.
  // Prima erano sei livelli enormi ruotati dalla GPU e sui telefoni finivano la memoria grafica: l'insegna spariva a metà.
  let beamSprite = null, beamRaf = 0;
  const rigState = [];
  function makeBeamSprite() {
    // un cono morbido visto dall'alto: origine in basso al centro, semiapertura 12°
    const H = 260, half = 12 * Math.PI / 180, W = Math.ceil(2 * H * Math.tan(half)) + 4;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x + .5 - W / 2, dy = H - y, dist = Math.hypot(dx, dy) / H;
        const u = Math.abs(Math.atan2(dx, dy)) / half;
        if (u >= 1 || dist >= 1) continue;
        const side = Math.pow(Math.cos(u * Math.PI / 2), 2.2);
        const fall = Math.pow(1 - dist, 1.5) * Math.min(1, dist * 14);
        const a = side * fall, core = Math.pow(side, 6) * .5, i = (y * W + x) * 4;
        d[i] = 255; d[i + 1] = 226 + 20 * core; d[i + 2] = 178 + 50 * core; d[i + 3] = Math.round(a * 120);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  const OFF_STEPS = [1, .2, .9, .1, .5, 0];
  function buildRigs() {
    const box = $('#spots');
    box.innerHTML = '<canvas></canvas>' + RIGS.map((r) => {
      // mezzi nascosti: quelli in basso affondano sotto il bordo, quelli in alto spuntano appena dal soffitto
      const top = r.at === 'b' ? 'calc(100% - 3px)' : '3px';
      return `<div class="rig" data-g="${r.g}" style="left:${r.x}%;top:${top}"><i class="lamp"></i></div>`;
    }).join('');
    if (!beamSprite) beamSprite = makeBeamSprite();
    rigState.length = 0;
    box.querySelectorAll('.rig').forEach((el, i) => rigState.push({ el, r: RIGS[i], off: 0, del: i * 1.3 }));
    cancelAnimationFrame(beamRaf);
    let last = 0;
    const t0 = performance.now();
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    const frame = (now) => {
      if ($('#intro').hidden) { beamRaf = 0; return; }
      beamRaf = requestAnimationFrame(frame);
      if (now - last < 32) return;
      last = now;
      const w = box.clientWidth, h = box.clientHeight, k = 1 / 3;
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';
      const len = h * 1.5 * k, sw = beamSprite.width * len / beamSprite.height;
      for (const st of rigState) {
        const r = st.r, tt = (now - t0) / 1000 + st.del;
        // andata e ritorno morbida, come l'animazione "alternate ease-in-out"
        const ph = (tt / r.dur) % 2, lin = ph < 1 ? ph : 2 - ph, e = (1 - Math.cos(lin * Math.PI)) / 2;
        const ang = r.r0 + (r.r1 - r.r0) * e;
        st.el.style.transform = `rotate(${ang.toFixed(2)}deg)`;
        let lum = r.o;
        if (st.off) lum *= OFF_STEPS[Math.min(5, Math.floor((now - st.off) / 100))];
        if (lum <= 0) continue;
        const x = r.x / 100 * w * k, y = (r.at === 'b' ? h - 3 : 3) * k;
        ctx.setTransform(1, 0, 0, 1, x, y);
        ctx.rotate(ang * Math.PI / 180);
        ctx.globalAlpha = lum;
        ctx.drawImage(beamSprite, -sw / 2, -len + 2 * k, sw, len);
      }
    };
    beamRaf = requestAnimationFrame(frame);
  }
  function buildBulbs() {
    const m = $('#marquee'); m.querySelectorAll('.bulb').forEach((b) => b.remove());
    // stesso passo su ogni lato e una lampadina esatta in ogni angolo
    const nx = Math.max(6, Math.round(m.offsetWidth / 21)), ny = Math.max(4, Math.round(m.offsetHeight / 21));
    const pts = [];
    for (let i = 0; i < nx; i++) pts.push([i / nx, 0]);
    for (let j = 0; j < ny; j++) pts.push([1, j / ny]);
    for (let i = 0; i < nx; i++) pts.push([1 - i / nx, 1]);
    for (let j = 0; j < ny; j++) pts.push([0, 1 - j / ny]);
    pts.forEach(([x, y], k) => {
      const b = document.createElement('span'); b.className = 'bulb';
      b.style.left = (x * 100) + '%'; b.style.top = (y * 100) + '%'; b.style.transitionDelay = (k * 22) + 'ms';
      m.appendChild(b);
    });
  }
  let entering = false;
  const introOn = () => !$('#intro').hidden;
  async function playIntro() {
    const i = $('#intro'); i.hidden = false; i.className = 'intro'; $('#hush').textContent = ''; entering = false;
    const d = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    $('#m-now').textContent = 'Sala per due · ' + d;
    buildRigs(); buildBulbs(); paintVelvet();
    await wait(350); i.classList.add('lit');
  }
  async function enter() {
    const i = $('#intro');
    if (entering || i.hidden) return;
    entering = true;
    $('#hush').textContent = 'Spegnete i telefoni, inizia lo spettacolo';
    // i riflettori si spengono a gruppi, poi l'insegna, poi si apre il sipario
    for (const g of [1, 2, 3]) { rigState.forEach((st) => { if (st.r.g === g) { st.off = performance.now(); st.el.classList.add('off'); } }); await wait(330); }
    i.classList.add('dim');
    await wait(500);
    i.classList.add('open'); openCurtain();
    await wait(2900); i.classList.add('gone'); await wait(700);
    i.hidden = true;
  }
  $('#enter').onclick = enter;

  /* ---------- lista condivisa ---------- */
  const SY = window.FDV_SYNC;
  const dlg = $('#dlg');
  const stText = { ok: 'Collegata: le modifiche arrivano subito', offline: 'Senza rete: si aggiorna appena torna', off: '', missing: '' };
  function syncBadge() { $('#sync-btn').dataset.s = SY.loggedIn ? SY.state.state : 'off'; }
  function closeDlg() { dlg.classList.remove('on'); $('#d-scrim').classList.remove('on'); }
  function openDlg() {
    let h;
    if (!SY.available) {
      h = `<h2>Lista condivisa</h2><p>La sincronizzazione non è ancora attiva su questa versione.</p><div class="row"><button class="pill" data-d="close">Chiudi</button></div>`;
    } else if (!SY.loggedIn) {
      h = `<h2>Lista condivisa</h2><p>Accedete con l'account di coppia: la lista sarà uguale su tutti e due i telefoni. I titoli che avete già qui si uniscono a quelli online.</p>
        <form class="row" id="d-form"><input id="d-mail" type="email" placeholder="Email" autocomplete="username" autocapitalize="off" spellcheck="false" aria-label="Email" required>
        <input id="d-pass" type="password" placeholder="Password" autocomplete="current-password" aria-label="Password" required>
        <div class="st" id="d-err" role="alert"></div>
        <button class="pill gold" type="submit">Accedi</button><button class="ghost" type="button" data-d="close">Annulla</button></form>`;
    } else {
      h = `<h2>Lista condivisa</h2><div class="st">${esc(stText[SY.state.state] || '')}</div><p>Collegato come <b>${esc(SY.email)}</b>. Le aggiunte, i “visti” e le cancellazioni arrivano sull'altro telefono.</p>
        <div class="row"><button class="pill" data-d="close">Fatto</button><button class="ghost" data-d="leave">Esci</button></div>`;
    }
    dlg.innerHTML = h; dlg.classList.add('on'); $('#d-scrim').classList.add('on');
  }
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'close') closeDlg();
    if (b.dataset.d === 'leave') { SY.logout(); syncBadge(); closeDlg(); toast('Disconnesso: la lista resta su questo telefono'); }
  });
  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = dlg.querySelector('button[type=submit]'), err = $('#d-err');
    btn.disabled = true; err.textContent = '';
    try {
      await SY.login($('#d-mail').value, $('#d-pass').value);
      syncBadge(); closeDlg(); toast('Collegati: la lista è condivisa');
    } catch (x) {
      btn.disabled = false;
      err.textContent = /INVALID|EMAIL|PASSWORD|CREDENTIAL/.test(x.code || '') ? 'Email o password non corrette' : 'Non riesco a collegarmi, riprovate';
    }
  });
  $('#d-scrim').addEventListener('click', closeDlg);
  $('#sync-btn').onclick = openDlg;
  SY.init({
    get: () => items,
    set: (x) => { items = x; },
    changed: () => { persist(); render(); },
    status: syncBadge,
  });
  syncBadge();

  /* versione web: l'app si apre anche senza rete */
  if (!native && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  /* ---------- tasto indietro di Android ---------- */
  if (native && AppPlugin) {
    try {
      AppPlugin.addListener('backButton', () => {
        if (finaleOn) return;
        if (introOn()) { if (!entering) AppPlugin.exitApp(); return; }
        if (showOn()) { lightsOn(); return; }
        if (sheetOpen()) { closeSheet(); return; }
        if (searching) { stopSearch(); render(); return; }
        if (genre !== 'Tutti') { genre = 'Tutti'; render(); return; }
        if (tab === 'seen') { setTab('todo'); return; }
        AppPlugin.exitApp();
      });
    } catch (e) { /* senza plugin il tasto indietro chiude l'app */ }
  }
  addEventListener('online', () => { if (searching) { if (!news.data || !news.data.films || !news.data.series) loadNews(true); if ($('#q').value.trim()) { search.q = ''; runSearch(); } } });

  render();
  // si scaricano le novità in sottofondo, così la ricerca è già pronta
  setTimeout(() => loadNews(), 1200);
  let started = false;
  const go = () => { if (!started) { started = true; playIntro(); } };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
  setTimeout(go, 1500);
})();
