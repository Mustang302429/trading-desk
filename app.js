// ===== Trading Desk — interfaccia =====
const E = window.ENGINE;
const $ = s => document.querySelector(s);
const fmt = (v, d) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const sg = (v, d = 2) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + fmt(v, d);
const hhmm = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const dday = ts => new Date(ts).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
const INS = E.INS;
const TFS = [['15m', '15m'], ['1h', '1H'], ['4h', '4H'], ['1d', 'D']];
let cur = INS[0], curTf = '1h';
const API = (window.__API__ || '').startsWith('__') ? 'http://localhost:8000' : (window.__API__ || '');
const D = { macro: null, cal: [], news: null, bv: null, brief: null };

// ---------- TradingView ----------
function tv(el, name, cfg) {
  const box = $(el); if (!box) return;
  box.innerHTML = '<div class="tradingview-widget-container" style="height:100%"><div class="tradingview-widget-container__widget" style="height:100%"></div></div>';
  const s = document.createElement('script');
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${name}.js`; s.async = true;
  s.innerHTML = JSON.stringify(Object.assign({ colorTheme: 'dark', isTransparent: true, locale: 'it', width: '100%', height: '100%' }, cfg));
  box.firstChild.appendChild(s);
}

// ---------- dati ----------
async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
const loadData = f => getJSON(`data/${f}?v=${Math.floor(Date.now() / 6e4)}`).catch(() => null);
let cbN = 0, apiOk = null;
function jsonp(inst, iv, lim) {
  return new Promise((res, rej) => {
    const cb = '_dk' + (++cbN), s = document.createElement('script');
    const to = setTimeout(() => { done(); rej(new Error('timeout')); }, 15000);
    function done() { clearTimeout(to); delete window[cb]; s.remove(); }
    window[cb] = d => { done(); Array.isArray(d) && d.length ? res(E.rows(d)) : rej(new Error('vuoto')); };
    s.onerror = () => { done(); rej(new Error('rete')); };
    s.referrerPolicy = 'unsafe-url'; s.src = E.dkUrl(inst, iv, lim, cb); document.head.appendChild(s);
  });
}
async function dk(inst, iv, lim = 500) {
  if (apiOk !== false) {
    try { const j = await getJSON(`${API}/api/candles?sym=${encodeURIComponent(inst)}&iv=${iv}&limit=${lim}`); apiOk = true; return E.rows(j.c); } catch (e) { if (apiOk === null) apiOk = false; }
  }
  return jsonp(inst, iv, lim);
}
const cache = {};
async function raw(inst, tf, lim = 500) {
  const k = inst + tf + lim; if (cache[k] && Date.now() - cache[k].t < 60000) return cache[k].v;
  const v = await dk(inst, E.DK_IV[tf], lim); cache[k] = { t: Date.now(), v }; return v;
}
async function fullTF(inst) {
  const m = await raw(inst, '15m'); const R = { '15m': { c: m } };
  await Promise.all(['1h', '4h', '1d'].map(async tf => R[tf] = { c: E.merge(await raw(inst, tf), m, tf) }));
  for (const tf in R) R[tf].a = E.analyze(R[tf].c);
  return R;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } })); return out; }
let drvP = null;
function drivers() {
  if (drvP) return drvP;
  drvP = (async () => { const o = {}; await pool(E.DRIVERS, 3, async d => { const c = await raw(d.dk, '4h'); o[d.id] = E.analyze(c); o[d.id].chg = (c.at(-1).c / c.at(-7).c - 1) * 100; }); return o; })();
  setTimeout(() => drvP = null, 5 * 6e4); return drvP;
}
const fundOf = () => D.macro ? E.fundScore(D.macro) : null;
async function ccyOf() { if (scanCache?.cd) return scanCache.cd; return E.ccyDrivers(await drivers(), D.macro, fundOf(), null); }
const CCYN = { USD: 'Dollaro USA', EUR: 'Euro', GBP: 'Sterlina', JPY: 'Yen', CHF: 'Franco svizzero', CAD: 'Dollaro canadese', AUD: 'Dollaro australiano', NZD: 'Dollaro neozelandese' };

// ---------- header/sessioni ----------
function sessionsBar() {
  $('#sessions').innerHTML = E.SESS.map(s => {
    const o = E.isOpen(s);
    const rome = h => { const d = new Date(); const local = new Date(d.toLocaleString('en-US', { timeZone: s.tz })); local.setHours(h, 0, 0, 0); const diff = d - new Date(d.toLocaleString('en-US', { timeZone: s.tz })); return hhmm(+local + diff); };
    return `<div class="card sess"><div><div class="n">${s.name}</div><div class="h">${rome(s.a)}–${rome(s.b)} ora italiana</div></div><span class="pill ${o ? 'open' : ''}">${o ? 'Aperta' : 'Chiusa'}</span></div>`;
  }).join('');
  $('#clock').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ---------- OGGI ----------
function sesTable(R, ins) {
  const S = E.sessions(R['15m'].c), last = R['15m'].a.last, d = ins.d;
  if (!S.length) return '<p class="note">Nessuna sessione disponibile.</p>';
  const rel = x => last > x.h ? '<span class="up">sopra il massimo</span>' : last < x.l ? '<span class="dn">sotto il minimo</span>' : '<span class="neu">dentro</span>';
  return `<h3>Sessioni ${ins.name} · prezzo ${fmt(last, d)}</h3>` + S.slice(0, 2).map((g, i) => `<div class="sesday">${i === 0 ? 'Oggi' : 'Giorno precedente'} · ${g.day.split('-').reverse().join('/')}</div>` +
    g.s.map(x => `<div class="kv"><span>${x.name}</span><span>${fmt(x.l, d)} – ${fmt(x.h, d)} <em class="neu">(${fmt(x.h - x.l, d)})</em> ${i === 0 ? '· ' + rel(x) : ''}</span></div>`).join('')).join('');
}
function htfTable(R, ins) {
  const L = E.htfLevels(R['1d'].c), d = ins.d, last = R['15m'].a.last;
  const pct = L.adr ? L.todayRange / L.adr * 100 : 0;
  return `<h3>Livelli giornalieri, settimanali e mensili</h3>
    <div class="kv"><span>Ieri massimo / minimo</span><span>${fmt(L.pdh, d)} / ${fmt(L.pdl, d)}</span></div>
    ${L.w ? `<div class="kv"><span>Settimana in corso</span><span>${fmt(L.w.l, d)} – ${fmt(L.w.h, d)}</span></div>` : ''}
    ${L.pw ? `<div class="kv"><span>Settimana scorsa</span><span>${fmt(L.pw.l, d)} – ${fmt(L.pw.h, d)}</span></div>` : ''}
    ${L.m ? `<div class="kv"><span>Mese in corso</span><span>${fmt(L.m.l, d)} – ${fmt(L.m.h, d)}</span></div>` : ''}
    ${L.pm ? `<div class="kv"><span>Mese scorso</span><span>${fmt(L.pm.l, d)} – ${fmt(L.pm.h, d)}</span></div>` : ''}
    <div class="kv"><span>Escursione media giornaliera (20g)</span><span>${fmt(L.adr, d)}</span></div>
    <div class="kv"><span>Escursione di oggi</span><span>${fmt(L.todayRange, d)} (${fmt(pct, 0)}% della media)</span></div>
    <div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>
    <p class="note">${pct > 90 ? 'Oggi ha già fatto quasi tutta la sua escursione media: estensioni ulteriori meno probabili.' : 'Margine residuo rispetto all\'escursione media: ' + fmt(Math.max(0, L.adr - L.todayRange), d) + '.'}</p>`;
}
async function renderSessions() {
  const ins = INS.find(i => i.id === $('#sesSym').value) || INS[0];
  try { const R = await fullTF(ins.dk); $('#sesBox').innerHTML = sesTable(R, ins); $('#htfBox').innerHTML = htfTable(R, ins); }
  catch (e) { $('#sesBox').innerHTML = '<p class="note">Prezzi non disponibili ora.</p>'; }
}
let drvSel = 'XAU';
async function renderGold() {
  const drv = await drivers(); const G = E.goldDrivers(drv, D.macro);
  const opts = [['XAU', 'Oro'], ...E.CCY.map(c => [c, c])].map(([v, l]) => `<option value="${v}" ${v === drvSel ? 'selected' : ''}>${l}</option>`).join('');
  const head = `<div class="row" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 style="margin:0;white-space:nowrap">Driver di mercato</h3><select id="drvSym" style="width:auto;min-width:110px">${opts}</select></div>`;
  const list = it => it.map(x => `<div class="drv"><span class="${x.v > 0 ? 'up' : x.v < 0 ? 'dn' : 'neu'}">${x.v > 0 ? '▲' : x.v < 0 ? '▼' : '■'}</span><div><b>${x.name}</b><p>${x.txt}</p></div></div>`).join('');
  if (drvSel === 'XAU') {
    const bv = D.bv?.items?.find(x => x.metal === 'GOLD' && x.cur === 'USD');
    $('#goldDrv').innerHTML = `${head}<div class="sub" style="margin:8px 0 4px">Oro</div><div class="verdict-h ${G.verdict[1]}" style="font-size:22px">${G.verdict[0]}</div>${list(G.items)}
    ${drv.DXY ? `<div class="kv"><span>DXY · 24h</span><span>${fmt(drv.DXY.last, 3)} · ${sg(drv.DXY.chg)}%</span></div>` : ''}
    ${drv.UST ? `<div class="kv"><span>T-Bond USA · 24h</span><span>${fmt(drv.UST.last, 3)} · ${sg(drv.UST.chg)}%</span></div>` : ''}
    ${bv ? `<div class="kv"><span>Oro fisico BullionVault</span><span>${fmt(bv.bid, 2)} / ${fmt(bv.ask, 2)}</span></div>` : ''}`;
  } else {
    const cd = await ccyOf(), x = cd[drvSel];
    const rank = Object.entries(cd).sort((a, b) => b[1].score - a[1].score).map(([c, v]) => `<span class="${v.verdict[1]}" style="margin-right:10px">${c} ${sg(v.score * 10)}</span>`).join('');
    $('#goldDrv').innerHTML = `${head}<div class="sub" style="margin:8px 0 4px">${CCYN[drvSel]}</div><div class="verdict-h ${x.verdict[1]}" style="font-size:22px">${x.verdict[0]}</div>${list(x.items)}
    <div class="kv"><span>Classifica valute</span><span class="mono" style="font-size:12px">${rank}</span></div>`;
  }
  $('#drvSym').onchange = e => { drvSel = e.target.value; renderGold(); };
  return G;
}
async function renderBrief() {
  const fund = fundOf(), G = E.goldDrivers(await drivers(), D.macro);
  const rows = await scanAll(fund, G);
  const top = rows.filter(r => r.X.state !== 'Range: nessun setup').slice(0, 4);
  const evs = (D.cal || []).filter(e => e.impact === 'High' && e.ts > Date.now() - 36e5 && e.ts < Date.now() + 24 * 36e5);
  const now = new Date();
  $('#brief').innerHTML = `<h3>Riepilogo · ${now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <p class="lead">Oro: <b class="${G.verdict[1]}">${G.verdict[0].toLowerCase()}</b> dal lato macro. Valute più forti: <b class="up">${ccyRank(scanCache?.cd, 1)}</b>, più deboli: <b class="dn">${ccyRank(scanCache?.cd, -1)}</b>. ${evs.length ? `<b>${evs.length}</b> eventi ad alto impatto nelle prossime 24 ore, il primo alle ${hhmm(evs[0].ts)} (${evs[0].country} ${evs[0].title}).` : 'Nessun evento ad alto impatto nelle prossime 24 ore.'}</p>
    <h3 style="margin-top:16px">Setup migliori ora</h3>
    ${top.map(r => setupRow(r)).join('') || '<p class="note">Nessun setup valido in questo momento.</p>'}
    <button class="ghost" onclick="go('scanner')" style="margin-top:10px">Vedi tutto lo scanner</button>`;
}
const ccyRank = (cd, dir) => { if (!cd) return '—'; const e = Object.entries(cd).sort((a, b) => b[1].score - a[1].score); return (dir > 0 ? e.slice(0, 2) : e.slice(-2).reverse()).map(x => x[0]).join(', '); };
function setupRow(r) {
  const [bt, bc] = E.bTxt(r.V.dir), s = r.X.s, d = r.ins.d;
  return `<div class="setup" data-id="${r.ins.id}"><div class="row"><b>${r.ins.name}</b><span class="bias ${bc}">${bt}</span><span class="st ${stCls(r.X.state)}">${r.X.state}</span><span class="sc">${fmt(r.X.total, 1)}</span></div>
    ${s ? `<div class="sub">Entry ${fmt(s.en, d)} · SL ${fmt(s.sl, d)} · TP1 ${fmt(s.tp[0], d)} · TP2 ${fmt(s.tp[1], d)} · R:R 1:${fmt(s.rr, 1)}</div>` : ''}</div>`;
}
const stCls = s => s.startsWith('In zona') ? 'zone' : s.startsWith('Vicino') ? 'near' : s.startsWith('Blocc') ? 'blk' : '';
function renderTodayEv() {
  const ev = (D.cal || []).filter(e => ['High', 'Medium'].includes(e.impact) && new Date(e.ts).toDateString() === new Date().toDateString());
  $('#calSrc').textContent = D.cal?.length ? 'fonte Forex Factory' : '';
  $('#todayEv').innerHTML = ev.length ? `<div class="tbl"><table><thead><tr><th>Ora</th><th>Valuta</th><th>Evento</th><th>Impatto</th><th>Previsione</th><th>Precedente</th><th>Attesa</th></tr></thead><tbody>${ev.map(evRow).join('')}</tbody></table></div>` : '<p class="note">Nessun evento importante oggi, oppure calendario non ancora aggiornato.</p>';
}
const num = s => { const m = (s || '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
function evRow(e) {
  const f = num(e.forecast), p = num(e.previous); let exp = '';
  if (f != null && p != null && f !== p) exp = f > p ? '<span class="up">in aumento</span>' : '<span class="dn">in calo</span>';
  else if (f != null && p != null) exp = '<span class="neu">stabile</span>';
  const past = e.ts < Date.now();
  return `<tr class="${past ? 'past' : ''}"><td class="mono">${hhmm(e.ts)}</td><td><b>${e.country}</b></td><td>${e.title}</td><td><span class="imp ${e.impact}">${e.impact === 'High' ? 'Alto' : e.impact === 'Medium' ? 'Medio' : 'Basso'}</span></td><td class="mono">${e.forecast || '—'}</td><td class="mono">${e.previous || '—'}</td><td>${exp}</td></tr>`;
}

// ---------- SCANNER ----------
let scanCache = null;
async function scanAll(fund, G, force) {
  if (scanCache && !force && Date.now() - scanCache.t < 120000) return scanCache.rows;
  const rows = (await pool(INS, 3, async ins => {
    const R = await fullTF(ins.dk); const V = E.verdict(R, '1h'); const ev = E.eventRisk(ins, D.cal, 2);
    return { ins, R, V, ev };
  })).filter(Boolean);
  const cd = E.ccyDrivers(await drivers(), D.macro, fund, E.ccyStrength(rows.map(r => ({ ins: r.ins, b4: r.R['4h'].a.bias }))));
  rows.forEach(r => r.X = E.combine(r.ins, r.V, fund, G, r.ev, cd));
  rows.sort((a, b) => b.X.total - a.X.total);
  scanCache = { t: Date.now(), rows, cd }; return rows;
}
async function renderScanner(force) {
  $('#scanTbl').innerHTML = '<div class="sk tall"></div>';
  const fund = fundOf(), G = E.goldDrivers(await drivers(), D.macro);
  const rows = await scanAll(fund, G, force);
  const tfc = b => `<i class="tfd ${E.bTxt(b)[1]}"></i>`;
  $('#scanTbl').innerHTML = `<table><thead><tr><th>Strumento</th><th>Prezzo</th><th>15m 1H 4H D</th><th>Tecnica</th><th>Fondam.</th><th>Punteggio</th><th>Stato</th><th>Entry</th><th>SL</th><th>TP1 / TP2</th><th>R:R</th></tr></thead><tbody>
    ${rows.map(r => { const d = r.ins.d, s = r.X.s, [bt, bc] = E.bTxt(r.V.dir), [ft, fc] = E.bTxt(r.X.fdir);
      return `<tr class="click" data-id="${r.ins.id}"><td><b>${r.ins.name}</b></td><td class="mono">${fmt(r.V.A.last, d)}</td><td>${['15m', '1h', '4h', '1d'].map(t => tfc(r.R[t].a.bias)).join('')}</td>
      <td class="${bc}">${bt} · ${fmt(r.V.cv, 1)}</td><td class="${fc}">${ft}</td><td><span class="sc">${fmt(r.X.total, 1)}</span></td><td><span class="st ${stCls(r.X.state)}">${r.X.state}</span>${r.ev.length ? `<div class="sub">${r.ev[0].country} ${r.ev[0].title} alle ${hhmm(r.ev[0].ts)}</div>` : ''}</td>
      <td class="mono">${s ? fmt(s.en, d) : '—'}</td><td class="mono">${s ? fmt(s.sl, d) : '—'}</td><td class="mono">${s ? fmt(s.tp[0], d) + ' / ' + fmt(s.tp[1], d) : '—'}</td><td class="mono">${s ? '1:' + fmt(s.rr, 1) : '—'}</td></tr>`; }).join('')}</tbody></table>`;
  bindOpen('#scanTbl');
}
function bindOpen(sel) { document.querySelectorAll(sel + ' [data-id]').forEach(el => el.onclick = () => openIns(el.dataset.id)); }
function openIns(id) { cur = INS.find(i => i.id === id); $('#sym').value = id; go('analisi'); drawTf(); mountAnalysisWidgets(); renderAnalysis(); }

// ---------- ANALISI ----------
async function renderAnalysis() {
  const ins = cur, d = ins.d;
  $('#verdict').innerHTML = '<div class="sk tall"></div>'; ['#mtf', '#levels', '#scen', '#aSes', '#aHtf', '#aFund'].forEach(s => $(s).innerHTML = '<div class="sk"></div>'); $('#btOut').innerHTML = '';
  try {
    const R = await fullTF(ins.dk);
    const V = E.verdict(R, curTf), A = V.A, [bt, bc] = E.bTxt(V.dir);
    const fund = fundOf(), G = E.goldDrivers(await drivers(), D.macro), ev = E.eventRisk(ins, D.cal, 2), cd = await ccyOf(), X = E.combine(ins, V, fund, G, ev, cd);
    let q = null; try { q = await getJSON(`${API}/api/quote?sym=${encodeURIComponent(ins.dk)}`); } catch (e) { }
    $('#evWarn').innerHTML = ev.length ? `<div class="warn"><b>Attenzione:</b> ${ev.map(e => `${e.country} ${e.title} alle ${hhmm(e.ts)}`).join(' · ')}. Meglio non aprire nuove posizioni prima del dato.</div>` : '';
    $('#verdict').innerHTML = `<h3>Responso ${ins.name} · ${curTf.toUpperCase()}</h3>
      <div class="verdict-h ${bc}">${bt}</div>
      <div class="score"><b>${fmt(X.total, 1)}</b><span class="neu">/10 punteggio complessivo</span></div>
      <div class="meter"><i style="width:${X.total * 10}%"></i></div>
      <div class="kv" style="margin-top:12px"><span>Convinzione tecnica</span><span>${fmt(V.cv, 1)}/10</span></div>
      <div class="kv"><span>Fondamentale</span><span class="${E.bTxt(X.fdir)[1]}">${E.bTxt(X.fdir)[0]} (${sg(X.fb)})</span></div>
      <div class="kv"><span>Stato</span><span class="st ${stCls(X.state)}">${X.state}</span></div>
      <div class="kv"><span>Prezzo</span><span>${fmt(A.last, d)}</span></div>
      ${q ? `<div class="kv"><span>Live bid / ask</span><span>${fmt(q.bid, d)} / ${fmt(q.ask, d)}</span></div>` : ''}
      <div class="kv"><span>RSI 14 · ATR 14</span><span>${fmt(A.rsi, 1)} · ${fmt(A.atr, d)}</span></div>
      <ul class="reasons">${V.why.map(w => `<li>${w}</li>`).join('')}${X.fdir === V.dir && V.dir ? '<li>Il fondamentale va nella stessa direzione</li>' : X.fdir === -V.dir && V.dir ? '<li>Il fondamentale va in direzione opposta: punteggio ridotto</li>' : ''}</ul>`;
    $('#mtf').innerHTML = `<h3>Trend multi-timeframe</h3>` + ['15m', '1h', '4h', '1d'].map(t => { const a = R[t].a, [x, y] = E.bTxt(a.bias); return `<div class="kv"><span>${t.toUpperCase()}</span><span class="${y}">${x} · RSI ${fmt(a.rsi, 0)}</span></div>`; }).join('') + `<p class="note">Bias da EMA 20/50/200, pendenza EMA 50 e struttura dei pivot fractal.</p>`;
    const fp = E.floorPiv(R['1d'].c);
    $('#levels').innerHTML = `<h3>Livelli chiave</h3>
      <div class="kv"><span>Ultimo swing high / low</span><span>${fmt(A.sh, d)} / ${fmt(A.sl, d)}</span></div>
      <div class="kv"><span>Box 20 candele</span><span>${fmt(A.bl, d)} – ${fmt(A.bh, d)}</span></div>
      ${V.fb.map(f => `<div class="kv"><span>Fibo ${fmt(f.r * 100, 1)}%</span><span>${fmt(f.p, d)}</span></div>`).join('')}
      <div class="kv"><span>Pivot P</span><span>${fmt(fp.P, d)}</span></div>
      <div class="kv"><span>R1 / R2</span><span>${fmt(fp.R1, d)} · ${fmt(fp.R2, d)}</span></div>
      <div class="kv"><span>S1 / S2</span><span>${fmt(fp.S1, d)} · ${fmt(fp.S2, d)}</span></div>`;
    const inv = V.dir > 0 ? `Una chiusura sotto ${fmt(A.sl, d)} rompe la struttura rialzista.` : V.dir < 0 ? `Una chiusura sopra ${fmt(A.sh, d)} rompe la struttura ribassista.` : '';
    $('#scen').innerHTML = `<h3>Scenari operativi</h3>` + (V.sc.length ? V.sc.map(s => `<div class="scn"><h4 class="${s.c}">${s.t}</h4><p>${s.k === 'pull' ? `Attendere il prezzo in zona ${fmt(Math.min(...s.zone), d)}–${fmt(Math.max(...s.zone), d)} (Fibonacci 50–61,8%) e un segnale di rifiuto.` : `Chiusura oltre ${fmt(s.en, d)}, poi retest del livello.`}</p>
      <div class="kv"><span>Entry</span><span>${fmt(s.en, d)}</span></div><div class="kv"><span>Stop loss</span><span>${fmt(s.sl, d)}</span></div><div class="kv"><span>TP1 / TP2</span><span>${fmt(s.tp[0], d)} · ${fmt(s.tp[1], d)}</span></div><div class="kv"><span>R:R TP1</span><span class="${s.rr >= 1.5 ? 'up' : s.rr < 1 ? 'dn' : ''}">1:${fmt(s.rr, 2)}</span></div>
      <button class="ghost sm" onclick="toRisk(${s.en},${s.sl},${s.tp[0]},'${ins.id}')">Calcola lotti</button></div>`).join('') + `<div class="scn"><h4 class="neu">Invalidazione</h4><p>${inv}</p></div>`
      : `<div class="scn"><h4 class="neu">Range: attendere</h4><p>Prezzo nel box ${fmt(A.bl, d)}–${fmt(A.bh, d)}. Operare solo dopo una rottura confermata.</p></div>`);
    $('#aSes').innerHTML = sesTable(R, ins); $('#aHtf').innerHTML = htfTable(R, ins);
    $('#aFund').innerHTML = fundCard(ins, fund, G, cd);
    $('#srcnote').textContent = `Calcolato alle ${new Date().toLocaleTimeString('it-IT')} su prezzi spot ${ins.name} Dukascopy (lato bid, come i CFD). Il tuo broker può differire leggermente per spread e feed.`;
  } catch (e) { console.error(e); $('#verdict').innerHTML = `<h3>Errore</h3><p>Dati non disponibili ora (${e.message}). Riprova con "Aggiorna".</p>`; }
}
function fundCard(ins, fund, G, cd) {
  if (ins.b === 'XAU' || ins.b === 'XAG') return `<h3>Fondamentale</h3><div class="verdict-h ${G.verdict[1]}" style="font-size:20px">${G.verdict[0]}</div>${G.items.map(x => `<p class="note">${x.name}: ${x.txt}</p>`).join('')}`;
  if (!fund) return '<h3>Fondamentale</h3><p class="note">Dati macro non ancora disponibili.</p>';
  const c = D.macro.countries, line = (cc, k, l, u = '%') => { const x = c[E.CUR[cc]]?.[k]; return x ? `${fmt(x.v, 2)}${u}${x.old ? '*' : ''}` : '—'; };
  const rows = [['Tasso ufficiale', 'rate'], ['Inflazione', 'cpi'], ['PIL a/a', 'gdp_yoy'], ['Disoccupazione', 'unemp'], ['Rendimento 10Y', 'y10']];
  const [g1, c1] = E.gradeTxt(fund[ins.b].score), [g2, c2] = E.gradeTxt(fund[ins.q].score);
  const cot = k => D.macro.cot?.[k] ? `${fmt(D.macro.cot[k].idx, 0)}/100` : '—';
  return `<h3>Fondamentale ${ins.b} vs ${ins.q}</h3><table class="mini"><tr><th></th><th>${ins.b}</th><th>${ins.q}</th></tr>
    ${rows.map(([l, k]) => `<tr><td>${l}</td><td>${line(ins.b, k)}</td><td>${line(ins.q, k)}</td></tr>`).join('')}
    <tr><td>COT (indice)</td><td>${cot(ins.b)}</td><td>${cot(ins.q)}</td></tr>
    <tr><td><b>Pagella</b></td><td class="${c1}"><b>${g1}</b></td><td class="${c2}"><b>${g2}</b></td></tr></table>
    <p class="note">${fund[ins.b].score > fund[ins.q].score ? ins.b + ' più solido di ' + ins.q + ': il fondamentale favorisce rialzi della coppia.' : ins.q + ' più solido di ' + ins.b + ': il fondamentale favorisce ribassi della coppia.'} * = dato vecchio, escluso dal calcolo.</p>
    ${cd ? [ins.b, ins.q].map(k => cd[k] ? `<div class="sesday">Driver ${k} · <span class="${cd[k].verdict[1]}">${cd[k].verdict[0]}</span></div>${cd[k].items.map(x => `<p class="note" style="margin:2px 0"><span class="${x.v > 0 ? 'up' : x.v < 0 ? 'dn' : 'neu'}">${x.v > 0 ? '▲' : x.v < 0 ? '▼' : '■'}</span> ${x.name}: ${x.txt}</p>`).join('')}` : '').join('') : ''}`;
}
async function runBacktest() {
  const ins = cur; $('#btOut').innerHTML = '<div class="sk"></div>';
  try {
    const res = [];
    for (const tf of ['4h', '1h']) { const c = await raw(ins.dk, tf, 1000); await new Promise(r => setTimeout(r, 20)); res.push([tf, E.backtest(c)]); }
    $('#btOut').innerHTML = `<div class="grid g2" style="margin-top:12px">${res.map(([tf, b]) => `<div><h3>${tf.toUpperCase()} · ${new Date(b.from).toLocaleDateString('it-IT')} → ${new Date(b.to).toLocaleDateString('it-IT')}</h3>
      <div class="kv"><span>Operazioni simulate</span><span>${b.n}</span></div>
      <div class="kv"><span>Percentuale vincenti</span><span>${fmt(b.win * 100, 0)}%</span></div>
      <div class="kv"><span>Risultato medio per operazione</span><span class="${b.exp > 0 ? 'up' : 'dn'}">${sg(b.exp, 2)} R</span></div>
      <div class="kv"><span>Risultato totale</span><span class="${b.totR > 0 ? 'up' : 'dn'}">${sg(b.totR, 1)} R</span></div>
      <div class="kv"><span>Profit factor</span><span>${b.pf ? fmt(b.pf, 2) : '—'}</span></div>
      <div class="kv"><span>Perdite consecutive max</span><span>${b.maxL}</span></div>
      <div class="kv"><span>Massimo drawdown</span><span>${fmt(b.dd, 1)} R</span></div></div>`).join('')}</div>
      <p class="note">Simulazione: ingresso a limite nella zona Fibonacci 50–61,8% nella direzione del bias, stop oltre lo swing, uscita a TP1. 1 R = rischio di un'operazione. Non include spread, commissioni e filtro news: i risultati reali saranno peggiori. ${res.some(([, b]) => b.n < 20) ? 'Poche operazioni: il campione è troppo piccolo per conclusioni affidabili.' : ''}</p>`;
  } catch (e) { $('#btOut').innerHTML = '<p class="note">Verifica non riuscita: dati non disponibili.</p>'; }
}
function mountAnalysisWidgets() {
  const ivMap = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
  tv('#w-chart', 'advanced-chart', { symbol: cur.tv, interval: ivMap[curTf], timezone: 'Europe/Rome', style: '1', allow_symbol_change: false, studies: ['STD;RSI', 'STD;EMA'], autosize: true });
  tv('#w-ta', 'technical-analysis', { symbol: cur.tv, interval: { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1D' }[curTf], showIntervalTabs: true, displayMode: 'multiple' });
  tv('#w-symnews', 'timeline', { feedMode: 'symbol', symbol: cur.tv, displayMode: 'regular' });
}
function drawTf() {
  $('#tfseg').innerHTML = TFS.map(([v, l]) => `<button data-v="${v}" class="${v === curTf ? 'on' : ''}">${l}</button>`).join('');
  $('#tfseg').querySelectorAll('button').forEach(b => b.onclick = () => { curTf = b.dataset.v; drawTf(); mountAnalysisWidgets(); renderAnalysis(); });
}
window.toRisk = (en, sl, tp, id) => { $('#r-en').value = en.toFixed(5); $('#r-sl').value = sl.toFixed(5); $('#r-tp').value = tp.toFixed(5); $('#r-ins').value = id === 'XAUUSD' ? 'xau' : id === 'XAGUSD' ? 'xag' : id.endsWith('JPY') ? 'jpy' : 'fx'; go('rischio'); risk(); };

// ---------- MACRO ----------
const CN = { USA: 'Stati Uniti', EA20: 'Eurozona', GBR: 'Regno Unito', JPN: 'Giappone', CHE: 'Svizzera', CAN: 'Canada', AUS: 'Australia', NZL: 'Nuova Zelanda' };
function renderMacro() {
  const M = D.macro; if (!M) { $('#grades').innerHTML = '<p class="note">Dati macro non ancora disponibili.</p>'; return; }
  $('#macroUpd').textContent = 'agg. ' + new Date(M.t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const F = E.fundScore(M);
  $('#grades').innerHTML = Object.entries(F).sort((a, b) => b[1].score - a[1].score).map(([c, v]) => { const [g, k] = E.gradeTxt(v.score); const x = M.countries[E.CUR[c]];
    return `<div class="card grade"><div class="row"><b>${c}</b><span class="bias ${k}">${g}</span></div><div class="gbar"><i class="${k}" style="width:${Math.max(4, Math.min(100, 50 + v.score * 40))}%"></i></div>
    <div class="sub">Tasso ${fmt(x?.rate?.v, 2)}% · Inflazione ${fmt(x?.cpi?.v, 1)}%${x?.cpi?.old ? '*' : ''} · PIL ${fmt(x?.gdp_yoy?.v, 1)}%</div></div>`; }).join('');
  const cell = (x, d = 2, inv) => { if (!x) return '<td>—</td>'; const tr = x.prev != null ? (x.v > x.prev ? (inv ? 'dn' : 'up') : x.v < x.prev ? (inv ? 'up' : 'dn') : 'neu') : ''; return `<td class="mono"><span class="${tr}">${fmt(x.v, d)}</span>${x.old ? '*' : ''}<div class="sub">${x.p}</div></td>`; };
  $('#ctyTbl').innerHTML = `<table><thead><tr><th>Paese</th><th>Tasso banca centrale</th><th>Ultima mossa</th><th>Inflazione a/a</th><th>PIL a/a</th><th>PIL t/t</th><th>Disoccupazione</th><th>Rendimento 10Y</th><th>Fiducia consumatori</th><th>Partite correnti % PIL</th></tr></thead><tbody>
    ${Object.entries(M.countries).filter(([c]) => CN[c]).map(([c, x]) => `<tr><td><b>${CN[c] || c}</b></td>${cell(x.rate)}<td class="sub">${x.rate?.lastChange ? `${x.rate.lastChange.to > x.rate.lastChange.from ? '<span class="dn">rialzo</span>' : '<span class="up">taglio</span>'} ${fmt(x.rate.lastChange.from, 2)} → ${fmt(x.rate.lastChange.to, 2)}<br>${x.rate.lastChange.p}` : '—'}</td>${cell(x.cpi, 1, true)}${cell(x.gdp_yoy, 1)}${cell(x.gdp_qoq, 2)}${cell(x.unemp, 1, true)}${cell(x.y10, 2)}${cell(x.cons, 1)}${cell(x.ca, 1)}</tr>`).join('')}</tbody></table>
    <p class="note" style="padding:0 16px 14px">Verde/rosso = miglioramento/peggioramento rispetto al dato precedente. * = dato vecchio, escluso dalla pagella. Fonti: OCSE (indicatori economici), BIS (tassi ufficiali).</p>`;
  const C = M.cot || {}; const fc = Object.values(C)[0];
  $('#cotDate').textContent = fc ? 'report del ' + fc.date.split('-').reverse().join('/') : '';
  const NM = { XAU: 'Oro', XAG: 'Argento', EUR: 'Euro', GBP: 'Sterlina', JPY: 'Yen', CHF: 'Franco svizzero', CAD: 'Dollaro canadese', AUD: 'Dollaro australiano', NZD: 'Dollaro neozelandese', USD: 'Dollar Index' };
  $('#cotTbl').innerHTML = `<table><thead><tr><th>Mercato</th><th>Posizione netta speculatori</th><th>Variazione 1 sett.</th><th>Variazione 4 sett.</th><th>Indice COT 3 anni</th><th>Lettura</th></tr></thead><tbody>
    ${Object.entries(C).map(([k, x]) => `<tr><td><b>${NM[k] || k}</b></td><td class="mono ${x.net > 0 ? 'up' : 'dn'}">${fmt(x.net, 0)}</td><td class="mono ${x.chg > 0 ? 'up' : 'dn'}">${sg(x.chg, 0)}</td><td class="mono ${x.chg4 > 0 ? 'up' : 'dn'}">${sg(x.chg4, 0)}</td>
    <td><div class="gbar sm"><i style="width:${x.idx}%" class="${x.idx > 80 ? 'dn' : x.idx < 20 ? 'up' : 'neu'}"></i></div><span class="mono">${fmt(x.idx, 0)}</span></td><td class="sub">${x.idx > 85 ? 'Estremo lungo: rischio di inversione' : x.idx < 15 ? 'Estremo corto: possibile ricopertura' : x.chg4 > 0 ? 'Accumulo in corso' : 'Distribuzione in corso'}</td></tr>`).join('')}</tbody></table>
    <p class="note" style="padding:0 16px 14px">Indice COT: 0 = posizione più corta degli ultimi 3 anni, 100 = più lunga. Fonte: CFTC, report settimanale (dati del martedì, pubblicati il venerdì).</p>`;
  const bv = D.bv?.items?.filter(x => x.metal === 'GOLD') || [];
  $('#bvBox').innerHTML = bv.length ? `<table class="mini"><tr><th>Caveau</th><th>Valuta</th><th>Denaro</th><th>Lettera</th></tr>${bv.filter(x => ['USD', 'EUR'].includes(x.cur)).map(x => `<tr><td>${{ ZU: 'Zurigo', LN: 'Londra', NY: 'New York', TR: 'Toronto', SG: 'Singapore' }[x.vault] || x.vault}</td><td>${x.cur}</td><td class="mono">${fmt(x.bid, 2)}</td><td class="mono">${fmt(x.ask, 2)}</td></tr>`).join('')}</table><p class="note">Prezzo per oncia sul mercato dell'oro fisico BullionVault. Agg. ${hhmm(D.bv.t)}.</p>` : '<p class="note">Non disponibile.</p>';
  renderCal('High');
}
function renderCal(lvl) {
  const L = lvl === 'High' ? ['High'] : ['High', 'Medium'];
  const ev = (D.cal || []).filter(e => L.includes(e.impact) && e.ts > Date.now() - 864e5);
  let lastDay = '';
  $('#calList').innerHTML = ev.length ? `<div class="tbl"><table><tbody>${ev.map(e => { const dd = dday(e.ts); const h = dd !== lastDay ? `<tr class="dayrow"><td colspan="7">${dd}</td></tr>` : ''; lastDay = dd; return h + evRow(e); }).join('')}</tbody></table></div><p class="note">"Attesa" confronta la previsione con il dato precedente. Fonte: Forex Factory.</p>` : '<p class="note">Calendario non disponibile.</p>';
}
document.querySelectorAll('#calseg button').forEach(b => b.onclick = () => { document.querySelectorAll('#calseg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); renderCal(b.dataset.i); });

// ---------- NEWS ----------
const KW = { gold: /gold|xau|oro|bullion|precious|silver|argento/i, usd: /fed|powell|dollar|dollaro|usd|treasury|yield|cpi|pce|payroll|nfp|fomc|inflation|jobs|warsh/i, fx: /eur|gbp|jpy|chf|aud|cad|nzd|ecb|bce|boe|boj|rba|snb|forex|currenc|yen|sterling|euro/i, it: /bce|lagarde|btp|spread|italia|borsa|euro|ue |europ/i };
let nf = 'all', seenT = 0;
async function loadNews() {
  let items = null;
  try { const j = await getJSON(`${API}/api/news`); items = j.items; } catch (e) { }
  if (!items?.length) { const j = await loadData('news.json'); if (j) { items = j.items; } }
  if (items?.length) { D.news = items; renderNews(); }
  else $('#feed').innerHTML = '<p class="note">Notizie non disponibili ora: usa il flusso TradingView qui accanto.</p>';
}
function ago(ts) { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'ora' : m < 60 ? m + ' min fa' : m < 1440 ? Math.round(m / 60) + ' h fa' : new Date(ts).toLocaleDateString('it-IT'); }
function renderNews() {
  const list = (D.news || []).filter(n => nf === 'all' || KW[nf].test(n.t)).slice(0, 80);
  $('#newsUpd').textContent = D.news?.[0] ? '· ultima ' + ago(D.news[0].ts) : '';
  $('#feed').innerHTML = list.length ? list.map(n => `<a class="feed-i" href="${n.l}" target="_blank" rel="noopener"><div class="t">${n.ts > seenT && Date.now() - n.ts < 2 * 36e5 ? '<span class="new">NUOVO</span>' : ''}${n.t}</div><div class="m">${n.s} · ${ago(n.ts)}</div></a>`).join('') : '<p class="note">Nessuna notizia per questo filtro.</p>';
}
document.querySelectorAll('#newsseg button').forEach(b => b.onclick = () => { document.querySelectorAll('#newsseg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); nf = b.dataset.f; renderNews(); });

// ---------- RISCHIO ----------
function risk() {
  const cap = +$('#r-cap').value, pct = +$('#r-pct').value, en = +$('#r-en').value, sl = +$('#r-sl').value, tp = +$('#r-tp').value, ins = $('#r-ins').value;
  if (!en || !sl || en === sl) { $('#r-out').innerHTML = '<p class="note">Inserisci entry e stop loss, oppure premi "Calcola lotti" su uno scenario.</p>'; return; }
  const rk = cap * pct / 100, dist = Math.abs(en - sl); let lots, unit;
  if (ins === 'xau') { lots = rk / (dist * 100); unit = `${fmt(dist, 2)} $`; }
  else if (ins === 'xag') { lots = rk / (dist * 5000); unit = `${fmt(dist, 3)} $`; }
  else if (ins === 'fx') { lots = rk / (dist * 100000); unit = `${fmt(dist * 10000, 1)} pip`; }
  else { lots = rk / (dist * 100000 / en); unit = `${fmt(dist * 100, 1)} pip`; }
  const rr = tp ? Math.abs(tp - en) / dist : null;
  $('#r-out').innerHTML = `<div class="kv"><span>Rischio monetario</span><span>${fmt(rk, 2)}</span></div><div class="kv"><span>Distanza stop</span><span>${unit}</span></div>
   <div class="kv"><span>Lotti</span><span class="up" style="font-size:20px">${fmt(lots, 2)}</span></div>${rr ? `<div class="kv"><span>Rischio/rendimento</span><span class="${rr >= 1.5 ? 'up' : 'dn'}">1:${fmt(rr, 2)}</span></div><div class="kv"><span>Profitto potenziale</span><span>${fmt(rk * rr, 2)}</span></div>` : ''}`;
}
document.querySelectorAll('#rischio input,#rischio select').forEach(e => e.oninput = risk);

// ---------- navigazione ----------
const mounted = {};
function go(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === t));
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t); window.scrollTo(0, 0);
  if (mounted[t]) return; mounted[t] = 1;
  if (t === 'analisi') { mountAnalysisWidgets(); renderAnalysis(); }
  if (t === 'scanner') renderScanner();
  if (t === 'macro') {
    renderMacro();
    tv('#w-macroq', 'market-quotes', { symbolsGroups: [
      { name: 'Driver oro', symbols: [{ name: 'OANDA:XAUUSD', displayName: 'Oro' }, { name: 'OANDA:XAGUSD', displayName: 'Argento' }, { name: 'TVC:DXY', displayName: 'Dollar Index' }, { name: 'TVC:US10Y', displayName: 'Rendimento USA 10Y' }, { name: 'TVC:US02Y', displayName: 'Rendimento USA 2Y' }] },
      { name: 'Rischio', symbols: [{ name: 'TVC:VIX', displayName: 'VIX' }, { name: 'FOREXCOM:SPXUSD', displayName: 'S&P 500' }, { name: 'TVC:USOIL', displayName: 'WTI' }, { name: 'TVC:UKOIL', displayName: 'Brent' }] },
      { name: 'Europa', symbols: [{ name: 'TVC:DE10Y', displayName: 'Bund 10Y' }, { name: 'TVC:IT10Y', displayName: 'BTP 10Y' }, { name: 'FX:EURUSD', displayName: 'EUR/USD' }, { name: 'FOREXCOM:GRXEUR', displayName: 'DAX' }] }] });
    tv('#w-events', 'events', { importanceFilter: '0,1', countryFilter: 'us,eu,gb,jp,cn,ch,ca,au,it,de' });
    tv('#w-heat', 'forex-heat-map', { currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'] });
  }
  if (t === 'news') tv('#w-news', 'timeline', { feedMode: 'market', market: 'forex', displayMode: 'regular' });
}
window.go = go;
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(b.dataset.t));

// ---------- avvio ----------
async function boot() {
  $('#sym').innerHTML = $('#sesSym').innerHTML = INS.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  $('#sym').onchange = e => { cur = INS.find(i => i.id === e.target.value); drawTf(); mountAnalysisWidgets(); renderAnalysis(); };
  $('#sesSym').onchange = renderSessions;
  $('#reload').onclick = () => { Object.keys(cache).forEach(k => delete cache[k]); renderAnalysis(); };
  $('#scanReload').onclick = () => { Object.keys(cache).forEach(k => delete cache[k]); renderScanner(true); };
  $('#btRun').onclick = runBacktest;
  drawTf(); sessionsBar(); risk();
  tv('#tape', 'ticker-tape', { symbols: [{ proName: 'OANDA:XAUUSD', title: 'Oro' }, { proName: 'OANDA:XAGUSD', title: 'Argento' }, { proName: 'TVC:DXY', title: 'DXY' }, { proName: 'TVC:US10Y', title: 'US10Y' }, { proName: 'FX:EURUSD', title: 'EUR/USD' }, { proName: 'FX:GBPUSD', title: 'GBP/USD' }, { proName: 'FX:USDJPY', title: 'USD/JPY' }, { proName: 'TVC:VIX', title: 'VIX' }, { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' }], showSymbolLogo: true, displayMode: 'adaptive' });
  const [m, c, b] = await Promise.all([loadData('macro.json'), loadData('calendar.json'), loadData('bullion.json')]);
  D.macro = m; D.cal = c?.items || []; D.bv = b;
  renderTodayEv(); renderGold(); renderSessions(); renderBrief(); loadNews();
  go((location.hash || '#panoramica').slice(1));
}
boot();
setInterval(sessionsBar, 30000);
setInterval(() => { seenT = D.news?.[0]?.ts || 0; loadNews(); }, 120000);
setInterval(async () => { const c = await loadData('calendar.json'); if (c) D.cal = c.items; const m = await loadData('macro.json'); if (m) D.macro = m; }, 10 * 6e4);
setInterval(() => { if ($('#panoramica').classList.contains('on')) { renderSessions(); renderBrief(); renderGold(); } if ($('#analisi').classList.contains('on')) renderAnalysis(); }, 3 * 6e4);
