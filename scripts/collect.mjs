// Raccolta dati per Trading Desk — gira su GitHub Actions ogni 15 minuti (Node 20, nessuna dipendenza)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(ROOT, 'engine.js'));
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept': '*/*', 'Accept-Language': 'en' };
const ONLY = process.argv[2]; // es. "news" per aggiornare solo le notizie
const log = (...a) => console.log(new Date().toISOString(), ...a);
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return null; } };
const wr = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o));
async function get(url, opt = {}, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 20000) }); if (r.ok) return await r.text(); } catch (e) { }
  }
  throw new Error('fetch ' + url.slice(0, 80));
}
const state = rd('state.json') || { sent: {}, brief: '' };

// ---------- prezzi Dukascopy ----------
async function dk(inst, iv, lim = 500) {
  const t = await get(E.dkUrl(inst, iv, lim, '_cb'), { headers: { Referer: 'https://freeserv.dukascopy.com/' } });
  return E.rows(JSON.parse(t.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')));
}
async function fullTF(inst) {
  const R = {}; const m = await dk(inst, '15MIN');
  R['15m'] = { c: m };
  for (const tf of ['1h', '4h', '1d']) R[tf] = { c: E.merge(await dk(inst, E.DK_IV[tf]), m, tf) };
  for (const tf in R) R[tf].a = E.analyze(R[tf].c);
  return R;
}

// ---------- calendario Forex Factory ----------
async function calendar() {
  const out = [];
  for (const w of ['thisweek', 'nextweek']) {
    try { const j = JSON.parse(await get(`https://nfs.faireconomy.media/ff_calendar_${w}.json`)); j.forEach(e => out.push({ ...e, ts: +new Date(e.date) })); } catch (e) { log('cal', w, e.message); }
  }
  if (out.length) wr('calendar.json', { t: Date.now(), src: 'Forex Factory', items: out.sort((a, b) => a.ts - b.ts) });
  return out.length ? out : rd('calendar.json')?.items || [];
}

// ---------- macro OCSE + tassi BIS ----------
const OECD_C = ['USA', 'EA20', 'GBR', 'JPN', 'CHE', 'CAN', 'AUS', 'NZL'];
const parseCSV = t => { const L = t.trim().split(/\r?\n/), h = L[0].split(','); return L.slice(1).map(l => { const v = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '')); return Object.fromEntries(h.map((k, i) => [k, v[i]])); }); };
async function macro() {
  const prev = rd('macro.json') || { countries: {} };
  const C = {}; OECD_C.forEach(c => C[c] = { ...(prev.countries[c] || {}) });
  const ageDays = p => { const q = p.match(/^(\d{4})-Q(\d)$/); const d = q ? new Date(Date.UTC(+q[1], +q[2] * 3, 0)) : new Date(p.length === 7 ? p + '-28' : p); return (Date.now() - d) / 864e5; };
  const put = (c, k, rows) => { rows.sort((a, b) => a.TIME_PERIOD.localeCompare(b.TIME_PERIOD)); const last = rows.at(-1); if (!last) return; C[c][k] = { v: +(+last.OBS_VALUE).toFixed(2), p: last.TIME_PERIOD, old: ageDays(last.TIME_PERIOD) > 300, prev: rows.length > 1 ? +(+rows.at(-2).OBS_VALUE).toFixed(2) : null, hist: rows.slice(-8).map(r => +(+r.OBS_VALUE).toFixed(2)) }; };
  try {
    const t = await get(`https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_KEI@DF_KEI,4.0/${OECD_C.join('+')}.M.CP+UNEMP+IRLT+IR3TIB+CCICP+BCICP+LI.....?lastNObservations=8&dimensionAtObservation=AllDimensions&format=csv`, { timeout: 60000 }, 3);
    const rows = parseCSV(t);
    const pick = (c, m, tr) => rows.filter(r => r.REF_AREA === c && r.MEASURE === m && (tr ? r.TRANSFORMATION === tr : true));
    OECD_C.forEach(c => { put(c, 'cpi', pick(c, 'CP', 'GY')); put(c, 'unemp', pick(c, 'UNEMP')); put(c, 'y10', pick(c, 'IRLT')); put(c, 'r3m', pick(c, 'IR3TIB')); put(c, 'cons', pick(c, 'CCICP')); put(c, 'biz', pick(c, 'BCICP')); put(c, 'lead', pick(c, 'LI')); });
  } catch (e) { log('oecd M', e.message); }
  try {
    const t = await get(`https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_KEI@DF_KEI,4.0/${OECD_C.join('+')}.Q.B1GQ_Q+CA_GDP.....?lastNObservations=8&dimensionAtObservation=AllDimensions&format=csv`, { timeout: 60000 }, 3);
    const rows = parseCSV(t);
    OECD_C.forEach(c => { put(c, 'gdp_yoy', rows.filter(r => r.REF_AREA === c && r.MEASURE === 'B1GQ_Q' && r.TRANSFORMATION === 'GY')); put(c, 'gdp_qoq', rows.filter(r => r.REF_AREA === c && r.MEASURE === 'B1GQ_Q' && r.TRANSFORMATION === 'G1')); put(c, 'ca', rows.filter(r => r.REF_AREA === c && r.MEASURE === 'CA_GDP')); });
  } catch (e) { log('oecd Q', e.message); }
  try {
    const BIS = { US: 'USA', XM: 'EA20', GB: 'GBR', JP: 'JPN', CH: 'CHE', CA: 'CAN', AU: 'AUS', NZ: 'NZL' };
    const t = await get(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.${Object.keys(BIS).join('+')}?lastNObservations=400&format=csv`, { timeout: 60000 }, 3);
    const rows = parseCSV(t);
    for (const [b, c] of Object.entries(BIS)) {
      const r = rows.filter(x => x.REF_AREA === b && x.OBS_VALUE !== '' && x.OBS_VALUE !== 'NaN').sort((a, b) => a.TIME_PERIOD.localeCompare(b.TIME_PERIOD));
      if (!r.length) continue;
      const v = +r.at(-1).OBS_VALUE; const yearAgo = r.find(x => x.TIME_PERIOD >= new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
      let lastChange = null; for (let i = r.length - 1; i > 0; i--) if (+r[i].OBS_VALUE !== +r[i - 1].OBS_VALUE) { lastChange = { p: r[i].TIME_PERIOD, from: +r[i - 1].OBS_VALUE, to: +r[i].OBS_VALUE }; break; }
      C[c].rate = { v, p: r.at(-1).TIME_PERIOD, prev: yearAgo ? +yearAgo.OBS_VALUE : null, lastChange };
    }
  } catch (e) { log('bis', e.message); }
  return { countries: C };
}

// ---------- COT CFTC ----------
const COT = { XAU: '088691', XAG: '084691', EUR: '099741', GBP: '096742', JPY: '097741', CHF: '092741', CAD: '090741', AUD: '232741', NZD: '112741', USD: '098662' };
async function cot() {
  const out = {};
  await Promise.all(Object.entries(COT).map(async ([k, code]) => {
    try {
      const j = JSON.parse(await get(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=156&$order=report_date_as_yyyy_mm_dd%20DESC&cftc_contract_market_code=${code}`));
      const net = j.map(x => +x.noncomm_positions_long_all - +x.noncomm_positions_short_all).reverse();
      const mn = Math.min(...net), mx = Math.max(...net), last = net.at(-1);
      out[k] = { net: last, chg: last - net.at(-2), chg4: last - net.at(-5), idx: mx > mn ? (last - mn) / (mx - mn) * 100 : 50, date: j[0].report_date_as_yyyy_mm_dd.slice(0, 10), oi: +j[0].open_interest_all, hist: net.slice(-26) };
    } catch (e) { log('cot', k, e.message); }
  }));
  return out;
}

// ---------- BullionVault ----------
async function bullion() {
  try {
    const t = await get('https://www.bullionvault.com/view_market_xml.do');
    const out = [];
    for (const m of t.matchAll(/<pitch\s+securityClassNarrative="(\w+)"\s+securityId="(\w+)"\s+considerationCurrency="(\w+)"\s*>([\s\S]*?)<\/pitch>/g)) {
      const [, metal, id, cur, body] = m;
      const px = tag => [...(body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || '').matchAll(/limit="(\d+)"/g)].map(x => +x[1]);
      const bid = px('buyPrices')[0], ask = px('sellPrices')[0];
      out.push({ metal, vault: id.slice(-2), cur, bid: bid ? bid / 32.1507466 : null, ask: ask ? ask / 32.1507466 : null });
    }
    if (out.length) wr('bullion.json', { t: Date.now(), src: 'BullionVault', items: out });
  } catch (e) { log('bullion', e.message); }
}

// ---------- News ----------
const FEEDS = [
  ['ForexLive', 'https://www.forexlive.com/feed/news', 1], ['FXStreet', 'https://www.fxstreet.com/rss/news', 1], ['Kitco', 'https://www.kitco.com/rss/KitcoNews.xml', 1],
  ['Investing Forex', 'https://www.investing.com/rss/news_1.rss', 1], ['Investing Materie prime', 'https://www.investing.com/rss/news_11.rss', 1],
  ['Investing Economia', 'https://www.investing.com/rss/news_14.rss', 1], ['Investing Indicatori', 'https://www.investing.com/rss/news_95.rss', 1],
  ['Investing Italia', 'https://it.investing.com/rss/news.rss', 0], ['CNBC Economia', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 0],
  ['Il Sole 24 Ore', 'https://www.ilsole24ore.com/rss/finanza.xml', 0],
  ['Google News Oro', 'https://news.google.com/rss/search?q=gold+price+OR+XAUUSD+when:1d&hl=en-US&gl=US&ceid=US:en', 1],
  ['Google News Fed', 'https://news.google.com/rss/search?q=Federal+Reserve+OR+Powell+OR+Treasury+yields+when:1d&hl=en-US&gl=US&ceid=US:en', 1],
  ['Google News BCE', 'https://news.google.com/rss/search?q=BCE+OR+Lagarde+OR+euro+dollaro+when:1d&hl=it&gl=IT&ceid=IT:it', 1],
];
const MKT = /gold|oro|xau|silver|argento|fed|powell|bce|ecb|lagarde|boe|boj|dollar|dollaro|euro|yen|sterlin|treasur|yield|rendiment|btp|spread|inflation|inflazion|cpi|pce|pil|gdp|payroll|jobs|lavoro|tassi|rates|forex|valut|currenc|oil|petrolio|tariff|dazi|recession|economi/i;
const dec = s => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
async function news() {
  const all = [];
  await Promise.all(FEEDS.map(async ([src, url, spec]) => {
    let t = null;
    try { t = await get(url, { timeout: 15000 }, 1); } catch { }
    if (!t || !t.includes('<item')) { try { t = await get('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { timeout: 20000 }, 1); } catch { } }
    if (!t) return;
    for (const m of t.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
      const it = m[0], g = k => dec(it.match(new RegExp(`<${k}[^>]*>([\\s\\S]*?)</${k}>`))?.[1]);
      let title = g('title'), link = g('link'), ts = +new Date(g('pubDate')) || 0, s = src;
      if (src.startsWith('Google')) { s = g('source') || src; title = title.replace(/\s+-\s+[^-]+$/, ''); }
      if (!spec && !MKT.test(title)) continue;
      if (title && link) all.push({ t: title, l: link, ts, s });
    }
  }));
  const seen = new Set(), items = [];
  all.sort((a, b) => b.ts - a.ts).forEach(x => { const k = x.t.toLowerCase().slice(0, 70); if (!seen.has(k)) { seen.add(k); items.push(x); } });
  if (items.length) wr('news.json', { t: Date.now(), items: items.slice(0, 200) });
  return items;
}

// ---------- Telegram ----------
const TG = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
async function tg(text) {
  if (!TG || !CHAT) return;
  try { await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }) }); } catch (e) { log('tg', e.message); }
}
const romeNow = () => { const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(new Date()); const g = k => p.find(x => x.type === k).value; return { day: `${g('year')}-${g('month')}-${g('day')}`, h: +g('hour'), m: +g('minute') }; };
const f = (v, d) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const hhmm = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

// ---------- MAIN ----------
(async () => {
  if (ONLY === 'news') { await news(); return; }
  const [cal, M, C] = await Promise.all([calendar(), macro(), cot(), bullion()]);
  M.cot = C; M.t = Date.now(); wr('macro.json', M);
  const items = await news();
  const fund = E.fundScore(M);

  // analisi completa per riepilogo e scanner
  const drv = {};
  for (const d of E.DRIVERS) { try { drv[d.id] = E.analyze(E.merge(await dk(d.dk, '4HOUR'), null, '4h')); drv[d.id].dk = d.dk; } catch (e) { log('drv', d.id, e.message); } }
  const gold = E.goldDrivers(drv, M);
  const scan = [];
  for (const ins of E.INS) {
    try {
      const R = await fullTF(ins.dk);
      const V = E.verdict(R, '1h'); const ev = E.eventRisk(ins, cal, 2);
      const X = E.combine(ins, V, fund, gold, ev);
      const ses = E.sessions(R['15m'].c)[0]; const lv = E.htfLevels(R['1d'].c);
      scan.push({ id: ins.id, name: ins.name, d: ins.d, last: V.A.last, dir: V.dir, cv: V.cv, total: X.total, state: X.state, fb: X.fb, s: X.s, atr: V.A.atr, ses, lv, mtf: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.a.bias])), _r: { ins, V, ev } });
    } catch (e) { log('scan', ins.id, e.message); }
  }
  // driver valute (con forza del prezzo 4H) e ricalcolo punteggi FX
  const cd = E.ccyDrivers(drv, M, fund, E.ccyStrength(scan.map(s => ({ ins: E.INS.find(i => i.id === s.id), b4: s.mtf['4h'] }))));
  for (const s of scan) { const x = s._r; const X = E.combine(x.ins, x.V, fund, gold, x.ev, cd); Object.assign(s, { total: X.total, state: X.state, fb: X.fb, s: X.s }); delete s._r; }
  scan.sort((a, b) => b.total - a.total);
  const now = Date.now(), rn = romeNow();
  const today = cal.filter(e => ['High', 'Medium'].includes(e.impact) && e.ts > now - 3600e3 && e.ts < now + 24 * 3600e3);
  const brief = { t: now, day: rn.day, gold: { verdict: gold.verdict, items: gold.items }, ccy: cd, scan, events: today, fund };
  wr('brief.json', brief);

  // ---- riepilogo delle 7:30 ----
  const minutes = rn.h * 60 + rn.m;
  if (state.brief !== rn.day && minutes >= 7 * 60 + 30 && minutes < 10 * 60) {
    const top = scan.slice(0, 5).map(s => { const [bt] = E.bTxt(s.dir); return `<b>${s.name}</b> ${f(s.last, s.d)} · ${bt} · ${f(s.total, 1)}/10 · ${s.state}${s.s ? `\n   Entry ${f(s.s.en, s.d)} · SL ${f(s.s.sl, s.d)} · TP ${f(s.s.tp[0], s.d)}` : ''}`; }).join('\n');
    const xau = scan.find(s => s.id === 'XAUUSD');
    const ses = xau?.ses?.s?.map(x => `${x.name}: ${f(x.l, 2)} – ${f(x.h, 2)}`).join('\n') || '';
    const ev = today.filter(e => e.impact === 'High').slice(0, 8).map(e => `${hhmm(e.ts)} ${e.country} ${e.title}${e.forecast ? ` (prev. ${e.forecast}, prec. ${e.previous})` : ''}`).join('\n') || 'Nessun evento ad alto impatto';
    const MAJ = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
    const fx = MAJ.map(id => scan.find(s => s.id === id)).filter(Boolean).map(s => { const a = s.ses?.s?.find(x => x.id === 'asia') || s.ses?.s?.[0]; const pip = s.d >= 4 ? 1e4 : 100; return `${s.name} ${f(s.last, s.d)} · ieri ${f(s.lv.pdl, s.d)}–${f(s.lv.pdh, s.d)}${a ? ` · Asia ${f(a.l, s.d)}–${f(a.h, s.d)}` : ''} · ADR ${Math.round(s.lv.adr * pip)} pip`; }).join('\n');
    const cv = Object.entries(cd).sort((a, b) => b[1].score - a[1].score).map(([c, v]) => `${c} ${v.verdict[1] === 'up' ? '▲' : v.verdict[1] === 'dn' ? '▼' : '■'}`).join(' · ');
    const head = items.slice(0, 4).map(n => `• ${n.t} (${n.s})`).join('\n');
    await tg(`<b>Trading Desk · riepilogo ${rn.day.split('-').reverse().join('/')}</b>\n\n<b>Oro – driver macro:</b> ${gold.verdict[0]}\n${xau ? `XAU/USD ${f(xau.last, 2)} · ieri ${f(xau.lv.pdl, 2)} – ${f(xau.lv.pdh, 2)} · ADR ${f(xau.lv.adr, 1)}\n` : ''}${ses ? `<b>Sessioni oro (oggi):</b>\n${ses}\n` : ''}\n<b>Valute – driver (dalla più forte):</b>\n${cv}\n\n<b>Valute principali:</b>\n${fx}\n\n<b>Migliori setup:</b>\n${top}\n\n<b>Eventi ad alto impatto oggi:</b>\n${ev}\n\n<b>Notizie:</b>\n${head}\n\n<i>Ipotesi condizionate, non consulenza.</i>`);
    state.brief = rn.day;
  }
  // ---- avvisi eventi (entro 30 min) ----
  for (const e of cal.filter(e => e.impact === 'High' && e.ts - now > 0 && e.ts - now <= 30 * 6e4)) {
    const k = 'ev' + e.ts + e.title; if (state.sent[k]) continue;
    await tg(`<b>EVENTO tra ${Math.round((e.ts - now) / 6e4)} min</b> · ${e.country} ${e.title}${e.forecast ? `\nPrevisione ${e.forecast} · precedente ${e.previous}` : ''}\nEvita nuovi ingressi sulle coppie in ${e.country}.`); state.sent[k] = now;
  }
  // ---- avvisi prezzo in zona ----
  for (const s of scan.filter(s => s.state === 'In zona di ingresso')) {
    const k = 'z' + s.id + rn.day + (s.s?.en || 0).toFixed(s.d); if (state.sent[k]) continue;
    await tg(`<b>SETUP · ${s.name} in zona di ingresso</b> (${f(s.total, 1)}/10)\n${s.s.t}\nEntry ${f(s.s.en, s.d)} · SL ${f(s.s.sl, s.d)} · TP1 ${f(s.s.tp[0], s.d)} · TP2 ${f(s.s.tp[1], s.d)}\nAttendi conferma sul grafico.`); state.sent[k] = now;
  }
  // ---- notizie rilevanti ----
  const HOT = /breaking|urgent|fed |fomc|powell|cpi|nfp|payrolls|rate (hike|cut)|ecb|lagarde|boj|gold (surges|plunges|hits|record)|oro (record|crolla|vola)|tariff|dazi/i;
  let nN = 0;
  for (const n of items.filter(n => now - n.ts < 30 * 6e4 && HOT.test(n.t))) {
    const k = 'n' + n.t.slice(0, 60); if (state.sent[k] || nN >= 3) continue;
    await tg(`<b>NEWS</b> ${n.t}\n<i>${n.s} · ${hhmm(n.ts)}</i>\n${n.l}`); state.sent[k] = now; nN++;
  }
  for (const k in state.sent) if (now - state.sent[k] > 3 * 864e5) delete state.sent[k];
  wr('state.json', state);
  log('ok', scan.length, 'strumenti', items.length, 'news');
})();
