/* Lista condivisa tra due telefoni.
   Si entra con email e password (Firebase Authentication, via REST, nessuna libreria): le regole del database
   lasciano leggere e scrivere solo i due account della coppia. I titoli stanno sotto lista/items/<id>.
   Regole di unione: vince la modifica più recente (campo upd); chi toglie un titolo lo toglie per tutti. */
(function () {
  'use strict';
  const AUTH = 'fdv.auth', SHADOW = 'fdv.shadow';
  const KEY = String(window.FDV_SYNC_KEY || '');
  const cands = [].concat(window.FDV_SYNC_URL || []).map((u) => String(u).replace(/\/+$/, '')).filter(Boolean);
  let base = cands[0] || '';
  // il database può stare in più regioni (indirizzi diversi): si prova ogni candidato e si ricorda quello che risponde
  let probed = cands.length < 2 ? Promise.resolve() : null;
  function probe() {
    if (probed) return probed;
    let saved = ''; try { saved = localStorage.getItem('fdv.base') || ''; } catch (e) { /* ok */ }
    if (cands.includes(saved)) { base = saved; return (probed = Promise.resolve()); }
    probed = (async () => {
      for (const c of cands) {
        try { const r = await fetch(c + '/lista.json?shallow=true'); if (r.ok || r.status === 401) { base = c; try { localStorage.setItem('fdv.base', c); } catch (e) { /* ok */ } return; } } catch (e) { /* prossimo */ }
      }
      probed = null;
    })();
    return probed;
  }
    let auth = null, es = null, timer = 0, busy = false, again = false, shadow = new Map();
  let getItems, setItems, onChange, onState;
  const S = { state: base && KEY ? 'off' : 'missing' }; // missing | off | ok | offline

  const url = (path) => base + '/lista/' + path + '.json?auth=' + encodeURIComponent(auth.idToken);
  const strip = (it) => { const { upd, ...r } = it; return JSON.stringify(r); };
  function setState(s) { if (S.state !== s) { S.state = s; onState && onState(s); } }
  function saveShadow() { try { localStorage.setItem(SHADOW, JSON.stringify([...shadow])); } catch (e) { /* ok */ } }
  function saveAuth() { try { auth ? localStorage.setItem(AUTH, JSON.stringify({ email: auth.email, refreshToken: auth.refreshToken })) : localStorage.removeItem(AUTH); } catch (e) { /* ok */ } }

  async function post(u, body, form) {
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || 'HTTP ' + r.status); e.code = (j.error && j.error.message) || ''; throw e; }
    return j;
  }
  async function signIn(email, password) {
    const j = await post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, { email, password, returnSecureToken: true });
    auth = { email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (parseInt(j.expiresIn, 10) - 120) * 1000 };
    saveAuth();
  }
  async function token() {
    if (!auth) throw new Error('no auth');
    if (auth.idToken && Date.now() < auth.exp) return;
    const j = await post('https://securetoken.googleapis.com/v1/token?key=' + KEY, { grant_type: 'refresh_token', refresh_token: auth.refreshToken }, true);
    auth.idToken = j.id_token; auth.refreshToken = j.refresh_token || auth.refreshToken;
    auth.exp = Date.now() + (parseInt(j.expires_in, 10) - 120) * 1000;
    saveAuth();
  }

  async function req(method, path, body) {
    await token();
    const r = await fetch(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) { const e = new Error('denied'); e.denied = true; throw e; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return method === 'GET' ? r.json() : null;
  }

  /* un giro completo: scarica, unisce, rimanda ciò che è cambiato qui */
  async function sync() {
    if (!auth || !base) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      await probe();
      const remote = (await req('GET', 'items')) || {};
      const local = getItems();
      const byId = new Map(local.map((x) => [x.id, x]));
      let changed = false;
      const next = [];
      // titoli presenti online
      for (const id of Object.keys(remote)) {
        const r = remote[id];
        if (!r || !r.id || !r.t) continue;
        const l = byId.get(id);
        if (!l) { next.push(r); changed = true; }
        else if ((r.upd || 0) > (l.upd || 0) && strip(r) !== strip(l)) { next.push(r); changed = true; }
        else next.push(l);
        shadow.set(id, strip(r));
        byId.delete(id);
      }
      // titoli solo qui: nuovi (da caricare) oppure tolti dall'altro telefono (da togliere)
      for (const l of byId.values()) {
        if (shadow.has(l.id)) { changed = true; shadow.delete(l.id); } else next.push(l);
      }
      if (changed) { setItems(next); onChange(); }
      await push(next);
      setState('ok');
    } catch (e) {
      // password cambiata o accesso tolto: si torna alla schermata di accesso; altrimenti è solo la rete
      if (e.denied || /INVALID_REFRESH_TOKEN|TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND/.test(e.code || e.message)) { auth = null; saveAuth(); if (es) es.close(); es = null; setState('off'); }
      else setState('offline');
    } finally {
      busy = false;
      if (again) { again = false; sync(); }
    }
  }

  /* manda online ciò che è cambiato (nuovi, modificati, tolti) */
  async function push(items) {
    if (!auth || !base) return;
    const ids = new Set();
    const jobs = [];
    for (const it of items) {
      ids.add(it.id);
      const s = strip(it);
      if (shadow.get(it.id) !== s) {
        it.upd = Date.now();
        jobs.push(req('PUT', 'items/' + it.id, it).then(() => shadow.set(it.id, s)));
      }
    }
    for (const id of [...shadow.keys()]) {
      if (!ids.has(id)) jobs.push(req('DELETE', 'items/' + id).then(() => shadow.delete(id)));
    }
    if (!jobs.length) return;
    const res = await Promise.allSettled(jobs);
    saveShadow();
    if (res.some((r) => r.status === 'rejected')) { setState('offline'); schedule(8000); } else setState('ok');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(sync, ms); }

  /* ascolto: appena l'altro telefono cambia qualcosa arriva un evento e si riscarica la lista */
  async function listen() {
    if (es) { es.close(); es = null; }
    if (!auth || !base || typeof EventSource === 'undefined') return;
    try {
      await token();
      es = new EventSource(url('items'));
      const poke = () => schedule(250);
      es.addEventListener('put', poke);
      es.addEventListener('patch', poke);
      es.onerror = () => setState('offline');
    } catch (e) { /* resta il controllo periodico */ }
  }
  setInterval(() => { if (auth && !document.hidden) sync(); }, 30000);
  setInterval(listen, 45 * 60 * 1000); // il permesso dura un'ora: si riapre l'ascolto col nuovo
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('online', () => { listen(); sync(); });

  window.FDV_SYNC = {
    state: S,
    get email() { return auth ? auth.email : ''; },
    get loggedIn() { return !!auth; },
    get available() { return !!(base && KEY); },
    init(o) {
      getItems = o.get; setItems = o.set; onChange = o.changed; onState = o.status;
      try { shadow = new Map(JSON.parse(localStorage.getItem(SHADOW) || '[]')); } catch (e) { shadow = new Map(); }
      try {
        const a = JSON.parse(localStorage.getItem(AUTH) || 'null');
        if (a && a.refreshToken) { auth = { email: a.email, refreshToken: a.refreshToken, idToken: '', exp: 0 }; probe().then(listen); sync(); }
      } catch (e) { /* ok */ }
    },
    async login(email, password) {
      await signIn(String(email || '').trim(), String(password || ''));
      shadow = new Map(); saveShadow();
      await probe(); listen(); sync();
    },
    logout() {
      if (es) es.close(); es = null; auth = null; saveAuth(); shadow = new Map(); saveShadow();
      setState(base && KEY ? 'off' : 'missing');
    },
    push(items) { if (auth) push(items).catch(() => { setState('offline'); schedule(8000); }); },
  };
})();
