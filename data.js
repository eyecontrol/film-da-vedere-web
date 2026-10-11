/* Fonti online, tutte gratuite e senza chiave:
   - Wikidata: film usciti (o in uscita) nelle sale italiane e ricerca dei film
   - Wikipedia: locandine e trame
   - TVmaze: ricerca delle serie e nuove serie sulle piattaforme */
(function () {
  'use strict';
  const UA = 'FilmDaVedere/1.0 (app Android personale di CAIMEO Production)';
  const GENRES = ['Romantico', 'Commedia', 'Drammatico', 'Thriller', 'Horror', 'Azione', 'Fantascienza', 'Animazione', 'Altro'];
  // l'ordine conta: un film d'animazione drammatico va in Animazione, una commedia romantica in Commedia
  const RULES = [
    [/anim|cartoon|anime/i, 'Animazione'],
    [/horror|orrore|splatter|supernatural|sopranna/i, 'Horror'],
    [/fantascien|science.?fiction|sci-?fi|fantasy|fantastic|distopi|supereroi|superhero|space/i, 'Fantascienza'],
    [/thriller|giallo|crime|criminal|poliziesc|noir|mystery|mister|spionaggio|espionage|legal|giudiziari|suspense/i, 'Thriller'],
    [/azione|action|avventur|adventure|guerra|\bwar\b|western|arti marziali|martial|catastrof|disaster/i, 'Azione'],
    [/commedia|comedy|comic|parodi|satir|sitcom/i, 'Commedia'],
    [/sentimental|romantic|romance|amore/i, 'Romantico'],
    [/dramm|drama|biograf|biopic|storic|history|musical|music|sport|family|famiglia|period/i, 'Drammatico'],
  ];
  function mapGenre(list) {
    const all = (Array.isArray(list) ? list : [list]).filter(Boolean).join(' | ');
    for (const [re, g] of RULES) if (re.test(all)) return g;
    return 'Altro';
  }

  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  async function getJSON(url, headers = {}, ms = 20000) {
    const res = await Promise.race([fetch(url, { headers }), timeout(ms)]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  const qs = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const val = (b, k) => (b[k] ? b[k].value : '');
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const wikiTitle = (url) => { try { return decodeURIComponent(url.split('/wiki/')[1] || '').replace(/_/g, ' '); } catch (e) { return ''; } };
  const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
  // trame brevi: le prime frasi, senza superare ~320 caratteri
  function short(s) {
    s = clean(s).replace(/\s*\([^()]*\)/g, '');
    if (s.length <= 320) return s;
    const cut = s.slice(0, 320);
    const dot = cut.lastIndexOf('. ');
    return (dot > 120 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…');
  }

  async function sparql(query) {
    const url = 'https://query.wikidata.org/sparql?' + qs({ format: 'json', query });
    const data = await getJSON(url, { Accept: 'application/sparql-results+json', 'Api-User-Agent': UA });
    return data.results.bindings;
  }

  const FILM_TYPES = 'VALUES ?type { wd:Q11424 wd:Q202866 wd:Q29168811 wd:Q24869 }';
  const FILM_FIELDS = `
    OPTIONAL { ?f rdfs:label ?l FILTER(lang(?l) = "it") }
    OPTIONAL { ?f rdfs:label ?el FILTER(lang(?el) = "en") }
    OPTIONAL { ?f wdt:P136 ?gen. ?gen rdfs:label ?gl FILTER(lang(?gl) = "it") }
    OPTIONAL { ?en schema:about ?f; schema:isPartOf <https://en.wikipedia.org/> }
    OPTIONAL { ?it schema:about ?f; schema:isPartOf <https://it.wikipedia.org/> }
    OPTIONAL { ?f wdt:P2047 ?dur }
    OPTIONAL { ?f wdt:P57 ?di. ?di rdfs:label ?dl FILTER(lang(?dl) = "it" || lang(?dl) = "en") }`;
  const FILM_SELECT = `?f (SAMPLE(?l) AS ?t) (SAMPLE(?el) AS ?te) (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?g)
    (SAMPLE(?en) AS ?enw) (SAMPLE(?it) AS ?itw) (SAMPLE(?dur) AS ?min) (SAMPLE(?dl) AS ?dir)`;

  function filmFrom(b) {
    const id = val(b, 'f').split('/').pop();
    const t = val(b, 't') || val(b, 'te');
    if (!id || !t || /^Q\d+$/.test(t)) return null;
    const min = Math.round(parseFloat(val(b, 'min')));
    const date = val(b, 'date').slice(0, 10);
    const y = parseInt(val(b, 'y') || date.slice(0, 4), 10) || '';
    return {
      src: 'wd:' + id, k: 'film', t, y, g: mapGenre(val(b, 'g').split('|')),
      d: min > 20 && min < 400 ? min + ' min' : '', date, dir: val(b, 'dir'),
      enw: wikiTitle(val(b, 'enw')), itw: wikiTitle(val(b, 'itw')), img: '', p: '',
    };
  }

  // Locandine (Wikipedia inglese, che le ospita) e trame (prima in italiano)
  async function wikiBatch(lang, titles) {
    const out = new Map();
    const list = [...new Set(titles.filter(Boolean))];
    const chunks = [];
    for (let i = 0; i < list.length; i += 20) chunks.push(list.slice(i, i + 20));
    await Promise.all(chunks.map(async (chunk) => {
      const url = `https://${lang}.wikipedia.org/w/api.php?` + qs({
        action: 'query', format: 'json', formatversion: 2, prop: 'pageimages|extracts', exintro: 1, explaintext: 1,
        exlimit: 20, piprop: 'thumbnail', pithumbsize: 500, pilimit: 20, redirects: 1, origin: '*', titles: chunk.join('|'),
      });
      try {
        const q = (await getJSON(url, { 'Api-User-Agent': UA })).query || {};
        const alias = new Map();
        for (const n of [...(q.normalized || []), ...(q.redirects || [])]) alias.set(n.to, n.from);
        for (const p of q.pages || []) {
          if (p.missing) continue;
          let key = p.title;
          const seen = new Set();
          while (alias.has(key) && !seen.has(key)) { seen.add(key); key = alias.get(key); }
          const info = { img: p.thumbnail ? p.thumbnail.source : '', p: short(p.extract) };
          out.set(key, info);
          out.set(p.title, info);
        }
      } catch (e) { /* senza locandina si usa quella disegnata */ }
    }));
    return out;
  }
  async function enrich(films) {
    const [en, it] = await Promise.all([wikiBatch('en', films.map((f) => f.enw)), wikiBatch('it', films.map((f) => f.itw))]);
    for (const f of films) {
      const e = en.get(f.enw) || {}, i = it.get(f.itw) || {};
      f.img = e.img || i.img || '';
      f.p = i.p || e.p || '';
    }
    return films;
  }

  async function nowAndSoon() {
    const from = iso(addDays(-50)), to = iso(addDays(28));
    const rows = await sparql(`SELECT ${FILM_SELECT} (MIN(?d) AS ?date) WHERE {
      ${FILM_TYPES}
      ?f wdt:P31 ?type; p:P577 ?s. ?s ps:P577 ?d; pq:P291 wd:Q38.
      FILTER(?d >= "${from}T00:00:00Z"^^xsd:dateTime && ?d <= "${to}T00:00:00Z"^^xsd:dateTime)
      ${FILM_FIELDS}
    } GROUP BY ?f LIMIT 150`);
    const films = rows.map(filmFrom).filter(Boolean);
    films.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return enrich(films);
  }

  async function searchFilms(q) {
    const term = q.replace(/["\\]/g, ' ').trim();
    if (!term) return [];
    const rows = await sparql(`SELECT ${FILM_SELECT} (MIN(YEAR(?pd)) AS ?y) (MIN(?ord) AS ?o) WHERE {
      SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
        mwapi:search "${term}"; mwapi:language "it"; mwapi:limit "40". ?f wikibase:apiOutputItem mwapi:item. ?ord wikibase:apiOrdinal true. }
      ${FILM_TYPES}
      ?f wdt:P31 ?type.
      OPTIONAL { ?f wdt:P577 ?pd }
      ${FILM_FIELDS}
    } GROUP BY ?f ORDER BY ?o LIMIT 15`);
    return enrich(rows.map(filmFrom).filter(Boolean));
  }

  const PLATFORMS = /^(Netflix|Prime Video|Amazon Prime Video|Disney\+|Apple TV\+?|HBO Max|Max|Paramount\+|Hulu|Peacock|RaiPlay|NOW|Now|Sky Go|Mediaset Infinity|Crunchyroll)$/;
  function showFrom(s, extra = {}) {
    const net = (s.webChannel && s.webChannel.name) || (s.network && s.network.name) || '';
    const img = s.image ? (s.image.medium || s.image.original || '') : '';
    return {
      src: 'tvm:' + s.id, k: 'serie', t: s.name, y: parseInt((s.premiered || '').slice(0, 4), 10) || '',
      g: mapGenre(s.genres || []), d: net, img: img.replace(/^http:/, 'https:'), p: short(s.summary), date: s.premiered || '', ...extra,
    };
  }
  async function searchSeries(q) {
    const data = await getJSON('https://api.tvmaze.com/search/shows?' + qs({ q }));
    return data.slice(0, 15).map((r) => showFrom(r.show));
  }
  async function newSeries() {
    const days = Array.from({ length: 12 }, (_, i) => iso(addDays(-i)));
    const res = await Promise.allSettled(days.map((d) => getJSON('https://api.tvmaze.com/schedule/web?date=' + d)));
    const seen = new Set(), out = [];
    res.forEach((r) => {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
      for (const e of r.value) {
        const s = e._embedded && e._embedded.show;
        if (!s || e.number !== 1 || seen.has(s.id)) continue;
        const ch = (s.webChannel && s.webChannel.name) || '';
        if (!PLATFORMS.test(ch) || !['English', 'Italian'].includes(s.language)) continue;
        if ((s.genres || []).some((g) => /Food|Reality|Talk Show|Game Show/i.test(g)) || /Reality|Talk Show|Game Show|News/i.test(s.type || '')) continue;
        seen.add(s.id);
        out.push(showFrom(s, { date: e.airdate, season: e.season }));
      }
    });
    if (!out.length && res.every((r) => r.status === 'rejected')) throw res[0].reason;
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }

  // Dove vederlo in Italia: catalogo di JustWatch (abbonamento, gratis, noleggio, acquisto)
  const JW_QUERY = `query S($q: String!) { popularTitles(country: IT, first: 6, filter: { searchQuery: $q }) { edges { node {
    objectType content(country: IT, language: "it") { title originalTitle originalReleaseYear }
    offers(country: IT, platform: WEB) { monetizationType standardWebURL package { clearName technicalName } } } } } }`;
  const KIND_ORDER = { FLATRATE: 0, FREE: 1, ADS: 1, RENT: 2, BUY: 3 };
  async function jwSearch(q) {
    const res = await Promise.race([fetch('https://apis.justwatch.com/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: JW_QUERY, variables: { q } }),
    }), timeout(15000)]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let data = await res.json();
    if (typeof data === 'string') data = JSON.parse(data);
    return ((data.data && data.data.popularTitles && data.data.popularTitles.edges) || []).map((e) => e.node);
  }
  const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  async function streaming(item) {
    const type = item.k === 'serie' ? 'SHOW' : 'MOVIE';
    const titles = [item.t, item.enw && item.enw.replace(/\s*\([^)]*\)\s*$/, '')].filter(Boolean);
    let best = null;
    for (const q of [...new Set(titles)]) {
      const nodes = (await jwSearch(q)).filter((n) => n.objectType === type && n.content);
      const yr = parseInt(item.y, 10);
      const score = (n) => {
        const c = n.content; let s = 0;
        if ([c.title, c.originalTitle].some((x) => plain(x) === plain(q) || plain(x) === plain(item.t))) s += 3;
        if (yr && c.originalReleaseYear) s += Math.abs(c.originalReleaseYear - yr) <= 1 ? 2 : -3;
        return s;
      };
      nodes.sort((a, b) => score(b) - score(a));
      if (nodes[0] && score(nodes[0]) >= 2) { best = nodes[0]; break; }
    }
    if (!best) return { found: false, offers: [] };
    const seen = new Map();
    for (const o of best.offers || []) {
      if (!o.package || !(o.monetizationType in KIND_ORDER)) continue;
      const name = o.package.clearName.replace(/ with Ads$/i, '');
      const key = name + '|' + (KIND_ORDER[o.monetizationType]);
      if (!seen.has(key)) seen.set(key, { name, type: o.monetizationType === 'ADS' ? 'FREE' : o.monetizationType, url: o.standardWebURL || '' });
    }
    const offers = [...seen.values()].sort((a, b) => KIND_ORDER[a.type] - KIND_ORDER[b.type] || a.name.localeCompare(b.name));
    return { found: true, offers };
  }

  const CACHE = 'fdv.news.v1', TTL = 6 * 3600 * 1000;
  function cached() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.ts < TTL && c.day === iso(addDays(0))) return c;
    } catch (e) { /* cache illeggibile: si riscarica */ }
    return null;
  }
  async function news(force) {
    const c = !force && cached();
    if (c) return c;
    const [f, s] = await Promise.allSettled([nowAndSoon(), newSeries()]);
    const out = {
      ts: Date.now(), day: iso(addDays(0)),
      films: f.status === 'fulfilled' ? f.value : null,
      series: s.status === 'fulfilled' ? s.value : null,
    };
    if (out.films && out.series) { try { localStorage.setItem(CACHE, JSON.stringify(out)); } catch (e) { /* spazio pieno */ } }
    return out;
  }

  window.FDV_DATA = { GENRES, mapGenre, news, cached, searchFilms, searchSeries, streaming };
})();
