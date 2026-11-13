(() => {
  'use strict';

  const CLIENT_ID = (window.QC_CONFIG || {}).CLIENT_ID || '';
  const SCOPE = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events';
  const TASKS = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
  const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const $ = id => document.getElementById(id);

  // ---------- small helpers ----------
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  let toastTimer;
  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2500);
  }

  const pad = n => String(n).padStart(2, '0');
  const toLocalInput = d =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmt = d => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Google Tasks only keeps the DATE of "due", so use the local date at 00:00 UTC.
  const dueDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`;

  // ---------- Google sign-in (token kept in memory only) ----------
  let token = null, tokenExp = 0, tokClient = null;

  function initAuth() {
    tokClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, callback: () => {}
    });
  }
  (function waitForGoogle() {
    if (window.google && google.accounts && google.accounts.oauth2) initAuth();
    else setTimeout(waitForGoogle, 200);
  })();

  // Must be started from a tap so the Google popup is allowed.
  function getToken() {
    return new Promise((resolve, reject) => {
      if (token && Date.now() < tokenExp - 60000) return resolve(token);
      if (!tokClient) return reject(new Error('Google sign-in is still loading. Try again in a moment.'));
      tokClient.callback = r => {
        if (r.error) return reject(new Error('Sign-in failed'));
        token = r.access_token;
        tokenExp = Date.now() + Number(r.expires_in) * 1000;
        lsSet('qc_signed', '1');
        setSignedIn(true);
        resolve(token);
      };
      tokClient.error_callback = e =>
        reject(new Error(e && e.type === 'popup_closed' ? 'Sign-in cancelled' : 'Sign-in failed'));
      tokClient.requestAccessToken({ prompt: lsGet('qc_signed') ? '' : 'consent' });
    });
  }

  function setSignedIn(on) {
    $('status').textContent = on ? 'Signed in' : 'Not signed in';
    $('signin').hidden = on;
    $('signout').hidden = !on;
  }

  async function api(url, method = 'GET', body) {
    const t = await getToken();
    const r = await fetch(url, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + t }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 204) return null;
    if (r.status === 401) { token = null; setSignedIn(false); throw new Error('Session expired. Tap again.'); }
    if (!r.ok) throw new Error('Google returned an error (' + r.status + ')');
    return r.json();
  }

  // ---------- Tasks + Calendar ----------
  const reminderBody = (title, when) => ({
    summary: '📌 ' + title,
    start: { dateTime: when.toISOString(), timeZone: TZ },
    end: { dateTime: new Date(when.getTime() + 15 * 60000).toISOString(), timeZone: TZ },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
  });
  const notesFor = (base, evId, when) =>
    ((base ? base + '\n' : '') + 'QC_EVENT:' + evId + '\nQC_WHEN:' + when.toISOString()).trim();
  const stripMeta = n => (n || '').replace(/QC_EVENT:\S+\n?|QC_WHEN:\S+\n?/g, '').trim();
  function meta(t) {
    const n = t.notes || '';
    const e = /QC_EVENT:(\S+)/.exec(n), w = /QC_WHEN:(\S+)/.exec(n);
    return { ev: e ? e[1] : null, when: w ? new Date(w[1]) : (t.due ? new Date(t.due) : null), hasTime: !!w };
  }

  async function addItem(title, when) {
    // Calendar event gives the exact-time alert; the task is the list you review at night.
    const ev = await api(CAL, 'POST', reminderBody(title, when));
    await api(TASKS, 'POST', { title, due: dueDate(when), notes: notesFor('', ev.id, when) });
  }

  async function removeEvent(evId) {
    if (!evId) return;
    try { await api(CAL + '/' + encodeURIComponent(evId), 'DELETE'); } catch (e) { /* already gone */ }
  }

  async function markDone(t) {
    await api(TASKS + '/' + t.id, 'PATCH', { status: 'completed' });
    await removeEvent(meta(t).ev);
  }
  async function deleteItem(t) {
    await api(TASKS + '/' + t.id, 'DELETE');
    await removeEvent(meta(t).ev);
  }
  async function moveItem(t, when) {
    let evId = meta(t).ev;
    if (evId) {
      try { await api(CAL + '/' + encodeURIComponent(evId), 'PATCH', reminderBody(t.title, when)); }
      catch (e) { evId = null; }
    }
    if (!evId) evId = (await api(CAL, 'POST', reminderBody(t.title, when))).id;
    await api(TASKS + '/' + t.id, 'PATCH', { due: dueDate(when), notes: notesFor(stripMeta(t.notes), evId, when) });
  }

  // ---------- time presets and picker ----------
  function presets() {
    const now = new Date();
    const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
    const list = [['In 1 hour', new Date(now.getTime() + 3600e3)]];
    const tonight = at(now, 20);
    if (tonight.getTime() > now.getTime() + 20 * 60000) list.push(['Tonight 8pm', tonight]);
    list.push(['Tomorrow 8am', at(new Date(now.getTime() + 864e5), 8)]);
    const add = ((6 - now.getDay() + 7) % 7) || 7;
    list.push(['Weekend', at(new Date(now.getTime() + add * 864e5), 10)]);
    return list;
  }

  function pickTime() {
    return new Promise(resolve => {
      const sheet = $('sheet'), box = $('sheetPresets'), inp = $('sheetInput');
      const finish = v => { sheet.hidden = true; resolve(v); };
      box.textContent = '';
      presets().forEach(([label, d]) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = 'ghost';
        b.onclick = () => finish(d);
        box.appendChild(b);
      });
      inp.value = toLocalInput(new Date(Date.now() + 3600e3));
      $('sheetOk').onclick = () => { if (inp.value) finish(new Date(inp.value)); };
      $('sheetCancel').onclick = () => finish(null);
      sheet.hidden = false;
    });
  }

  // ---------- capture screen ----------
  function renderQuick() {
    const box = $('quick');
    box.textContent = '';
    presets().forEach(([label, d]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => capture(d);
      box.appendChild(b);
    });
  }

  let busy = false;
  function setBusy(on) {
    busy = on;
    document.querySelectorAll('#quick button, #pick').forEach(b => { b.disabled = on; });
  }

  async function capture(when) {
    if (busy) return;
    const title = $('note').value.trim();
    if (!title) return toast('Type or speak something first', true);
    setBusy(true);
    try {
      await addItem(title, when);
      $('note').value = '';
      lsSet('qc_draft', null);
      toast('Saved. Reminder: ' + fmt(when));
    } catch (e) {
      toast(e.message, true); // the text stays in the box, nothing is lost
    } finally {
      setBusy(false);
    }
  }

  $('pick').onclick = async () => {
    if (!$('note').value.trim()) return toast('Type or speak something first', true);
    const d = await pickTime();
    if (d) capture(d);
  };

  $('note').addEventListener('input', () => lsSet('qc_draft', $('note').value));

  // ---------- voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  $('lang').value = lsGet('qc_lang') || 'en-US';
  $('lang').onchange = () => lsSet('qc_lang', $('lang').value);
  if (!SR) $('mic').hidden = true;
  $('mic').onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = $('lang').value;
    rec.interimResults = false;
    rec.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
      const n = $('note');
      n.value = (n.value ? n.value + ' ' : '') + text;
      lsSet('qc_draft', n.value);
    };
    rec.onerror = () => toast('Voice not available. Use the microphone on your keyboard.', true);
    rec.onend = () => { rec = null; $('mic').classList.remove('on'); $('mic').textContent = '🎤 Speak'; };
    $('mic').classList.add('on');
    $('mic').textContent = '⏹ Stop';
    try { rec.start(); } catch (e) { rec = null; }
  };

  // ---------- review screen ----------
  async function loadList() {
    const box = $('list');
    if (!token && !lsGet('qc_signed')) { box.innerHTML = ''; return emptyMsg('Sign in to see your open items.'); }
    box.textContent = 'Loading…';
    try {
      const d = await api(TASKS + '?showCompleted=false&showHidden=false&maxResults=100');
      const items = (d.items || []).filter(t => t.title && t.status === 'needsAction');
      items.sort((a, b) => ((meta(a).when || 0) - (meta(b).when || 0)));
      box.textContent = '';
      if (!items.length) return emptyMsg('Nothing open. Your head can rest. 🌙');
      items.forEach(t => box.appendChild(renderItem(t)));
    } catch (e) {
      box.textContent = '';
      emptyMsg(e.message);
    }
  }
  function emptyMsg(text) {
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = text;
    $('list').appendChild(p);
  }

  function renderItem(t) {
    const m = meta(t);
    const card = document.createElement('div');
    card.className = 'item' + (m.when && m.hasTime && m.when < new Date() ? ' late' : '');
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = t.title;
    const when = document.createElement('div');
    when.className = 'w';
    when.textContent = m.when ? (m.hasTime ? fmt(m.when) : m.when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })) : 'No time set';
    const btns = document.createElement('div');
    btns.className = 'btns';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = async () => {
        btns.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try { await fn(); await loadList(); }
        catch (e) { toast(e.message, true); btns.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
      };
      btns.appendChild(b);
    };
    mk('Done', 'done', () => markDone(t));
    mk('Move', 'ghost', async () => { const d = await pickTime(); if (!d) throw new Error('Cancelled'); await moveItem(t, d); });
    mk('Delete', 'del', () => deleteItem(t));
    card.append(title, when, btns);
    return card;
  }

  $('refresh').onclick = loadList;

  $('nightly').onclick = async () => {
    if (lsGet('qc_nightly') && !confirm('A nightly reminder was already created. Create another one?')) return;
    const [h, m] = ($('revTime').value || '22:00').split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    if (start <= new Date()) start.setDate(start.getDate() + 1);
    try {
      await api(CAL, 'POST', {
        summary: '🌙 Evening review (Quick Capture)',
        description: 'Open Quick Capture and clear your list: ' + location.origin + location.pathname,
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: new Date(start.getTime() + 10 * 60000).toISOString(), timeZone: TZ },
        recurrence: ['RRULE:FREQ=DAILY'],
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
      });
      lsSet('qc_nightly', '1');
      toast('Nightly reminder set for ' + pad(h) + ':' + pad(m));
    } catch (e) { toast(e.message, true); }
  };

  // ---------- tabs and sign in/out ----------
  function show(which) {
    const cap = which === 'capture';
    $('viewCapture').hidden = !cap;
    $('viewReview').hidden = cap;
    $('tabCapture').classList.toggle('on', cap);
    $('tabReview').classList.toggle('on', !cap);
    if (cap) renderQuick(); else loadList();
  }
  $('tabCapture').onclick = () => show('capture');
  $('tabReview').onclick = () => show('review');

  $('signin').onclick = () => getToken().catch(e => toast(e.message, true));
  $('signout').onclick = () => {
    const t = token;
    token = null; tokenExp = 0;
    lsSet('qc_signed', null);
    setSignedIn(false);
    if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, () => {});
    toast('Signed out and access revoked');
    $('list').textContent = '';
  };

  // ---------- startup ----------
  if (!CLIENT_ID || CLIENT_ID.indexOf('PASTE_YOUR') === 0) $('setupWarning').hidden = false;

  // Text shared from WhatsApp (or any app) arrives as ?title=&text=&url=
  const q = new URLSearchParams(location.search);
  const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
  if (shared) {
    $('note').value = 'Reply: ' + shared;
    lsSet('qc_draft', $('note').value);
    history.replaceState(null, '', location.pathname);
  } else {
    $('note').value = lsGet('qc_draft') || '';
  }

  renderQuick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderQuick(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
