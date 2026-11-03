// Motore di analisi condiviso (browser + Node per GitHub Actions)
(function (root) {
  const E = {};
  E.INS = [
    { id: 'XAUUSD', name: 'XAU/USD', tv: 'OANDA:XAUUSD', dk: 'XAU/USD', d: 2, b: 'XAU', q: 'USD' },
    { id: 'XAGUSD', name: 'XAG/USD', tv: 'OANDA:XAGUSD', dk: 'XAG/USD', d: 3, b: 'XAG', q: 'USD' },
    { id: 'EURUSD', name: 'EUR/USD', tv: 'FX:EURUSD', dk: 'EUR/USD', d: 5, b: 'EUR', q: 'USD' },
    { id: 'GBPUSD', name: 'GBP/USD', tv: 'FX:GBPUSD', dk: 'GBP/USD', d: 5, b: 'GBP', q: 'USD' },
    { id: 'USDJPY', name: 'USD/JPY', tv: 'FX:USDJPY', dk: 'USD/JPY', d: 3, b: 'USD', q: 'JPY' },
    { id: 'USDCHF', name: 'USD/CHF', tv: 'FX:USDCHF', dk: 'USD/CHF', d: 5, b: 'USD', q: 'CHF' },
    { id: 'AUDUSD', name: 'AUD/USD', tv: 'FX:AUDUSD', dk: 'AUD/USD', d: 5, b: 'AUD', q: 'USD' },
    { id: 'NZDUSD', name: 'NZD/USD', tv: 'FX:NZDUSD', dk: 'NZD/USD', d: 5, b: 'NZD', q: 'USD' },
    { id: 'USDCAD', name: 'USD/CAD', tv: 'FX:USDCAD', dk: 'USD/CAD', d: 5, b: 'USD', q: 'CAD' },
    { id: 'GBPJPY', name: 'GBP/JPY', tv: 'FX:GBPJPY', dk: 'GBP/JPY', d: 3, b: 'GBP', q: 'JPY' },
    { id: 'EURJPY', name: 'EUR/JPY', tv: 'FX:EURJPY', dk: 'EUR/JPY', d: 3, b: 'EUR', q: 'JPY' },
    { id: 'EURGBP', name: 'EUR/GBP', tv: 'FX:EURGBP', dk: 'EUR/GBP', d: 5, b: 'EUR', q: 'GBP' },
  ];
  E.DRIVERS = [
    { id: 'DXY', name: 'Dollar Index', dk: 'DOLLAR.IDX/USD', d: 3 },
    { id: 'UST', name: 'T-Bond USA (prezzo)', dk: 'USTBOND.TR/USD', d: 3 },
    { id: 'VIX', name: 'VIX', dk: 'VOL.IDX/USD', d: 2 },
    { id: 'SPX', name: 'S&P 500', dk: 'USA500.IDX/USD', d: 1 },
    { id: 'BRENT', name: 'Brent', dk: 'BRENT.CMD/USD', d: 2 },
  ];
  E.DK_IV = { '15m': '15MIN', '1h': '1HOUR', '4h': '4HOUR', '1d': '1DAY' };
  E.PER = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
  E.dkUrl = (inst, iv, lim, cb) => `https://freeserv.dukascopy.com/2.0/?path=chart/json3&instrument=${encodeURIComponent(inst)}&offer_side=B&interval=${iv}&splits=true&stocks=true&limit=${lim}&time_direction=P&timestamp=${Date.now()}&jsonp=${cb}`;
  E.rows = d => d.map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] })).sort((a, b) => a.t - b.t);
  // completa TF superiore con candele 15m
  E.merge = (c, m, iv) => {
    if (!m || !m.length || iv === '15m') return c;
    const out = c.slice(), P = E.PER[iv];
    for (const x of m) {
      const L = out.at(-1); if (x.t < L.t) continue;
      if (x.t < L.t + P) out[out.length - 1] = { ...L, h: Math.max(L.h, x.h), l: Math.min(L.l, x.l), c: x.c };
      else out.push({ t: L.t + Math.floor((x.t - L.t) / P) * P, o: x.o, h: x.h, l: x.l, c: x.c });
    }
    return out;
  };

  // ---- indicatori ----
  E.ema = (a, n) => { const k = 2 / (n + 1); let e = a[0]; return a.map(v => e = v * k + e * (1 - k)); };
  E.rsi = (a, n = 14) => { if (a.length <= n) return 50; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d > 0 ? g += d : l -= d; } g /= n; l /= n; for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
  E.atr = (c, n = 14) => { const tr = c.slice(1).map((x, i) => Math.max(x.h - x.l, Math.abs(x.h - c[i].c), Math.abs(x.l - c[i].c))); let a = tr.slice(0, n).reduce((s, v) => s + v, 0) / n; for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n; return a; };
  E.fractals = (c, w = 3) => { const H = [], L = []; for (let i = w; i < c.length - w; i++) { let hi = true, lo = true; for (let j = i - w; j <= i + w; j++) { if (c[j].h > c[i].h) hi = false; if (c[j].l < c[i].l) lo = false; } if (hi) H.push({ i, p: c[i].h }); if (lo) L.push({ i, p: c[i].l }); } return { H, L }; };

  E.analyze = c => {
    const cl = c.map(x => x.c), last = cl.at(-1);
    const e20 = E.ema(cl, 20), e50 = E.ema(cl, 50), e200 = E.ema(cl, 200);
    const r = E.rsi(cl), a = E.atr(c);
    const { H, L } = E.fractals(c);
    const h2 = H.slice(-2), l2 = L.slice(-2);
    const hh = h2.length === 2 && h2[1].p > h2[0].p, hl = l2.length === 2 && l2[1].p > l2[0].p;
    const lh = h2.length === 2 && h2[1].p < h2[0].p, ll = l2.length === 2 && l2[1].p < l2[0].p;
    let s = 0;
    s += last > e50.at(-1) ? 1 : -1; s += e20.at(-1) > e50.at(-1) ? 1 : -1; s += last > e200.at(-1) ? 1 : -1;
    s += e50.at(-1) > e50.at(-6) ? 1 : -1; s += (hh && hl) ? 1.5 : (lh && ll) ? -1.5 : 0;
    const bias = s >= 2 ? 1 : s <= -2 ? -1 : 0;
    const box = c.slice(-20); let bh = -Infinity, bl = Infinity; for (const x of box) { if (x.h > bh) bh = x.h; if (x.l < bl) bl = x.l; }
    const pos = (last - bl) / (bh - bl || 1);
    const sh = H.at(-1)?.p ?? bh, sl = L.at(-1)?.p ?? bl;
    return { last, e20: e20.at(-1), e50: e50.at(-1), e200: e200.at(-1), rsi: r, atr: a, bias, s, hh, hl, lh, ll, bh, bl, pos, sh, sl };
  };
  E.floorPiv = d => { const p = d.at(-2); const P = (p.h + p.l + p.c) / 3; return { P, R1: 2 * P - p.l, S1: 2 * P - p.h, R2: P + (p.h - p.l), S2: P - (p.h - p.l) }; };
  E.fib = (lo, hi, up) => [0.236, 0.382, 0.5, 0.618, 0.786].map(x => ({ r: x, p: up ? hi - (hi - lo) * x : lo + (hi - lo) * x }));
  E.bTxt = b => b > 0 ? ['Rialzista', 'up'] : b < 0 ? ['Ribassista', 'dn'] : ['Laterale', 'neu'];

  // scenari tecnici
  E.scenarios = (A, dir) => {
    const lo = Math.min(A.sl, A.sh), hi = Math.max(A.sl, A.sh);
    const fb = E.fib(lo, hi, dir >= 0);
    const z = fb[2].p, z2 = fb[3].p, sc = [];
    if (dir > 0) {
      sc.push({ k: 'pull', t: 'Long su ritracciamento', c: 'up', side: 1, zone: [z2, z], en: (z + z2) / 2, sl: Math.min(z2, A.sl) - A.atr * 0.5, tp: [A.sh, A.sh + A.atr * 2] });
      sc.push({ k: 'brk', t: 'Long su breakout & retest', c: 'up', side: 1, en: A.bh, sl: A.bh - A.atr * 1.5, tp: [A.bh + A.atr * 2, A.bh + A.atr * 3.5] });
    } else if (dir < 0) {
      sc.push({ k: 'pull', t: 'Short su ritracciamento', c: 'dn', side: -1, zone: [z, z2], en: (z + z2) / 2, sl: Math.max(z2, A.sh) + A.atr * 0.5, tp: [A.sl, A.sl - A.atr * 2] });
      sc.push({ k: 'brk', t: 'Short su breakdown & retest', c: 'dn', side: -1, en: A.bl, sl: A.bl + A.atr * 1.5, tp: [A.bl - A.atr * 2, A.bl - A.atr * 3.5] });
    }
    sc.forEach(s => s.rr = Math.abs(s.tp[0] - s.en) / Math.abs(s.en - s.sl));
    return { fb, sc };
  };

  // ---- sessioni (orari locali delle piazze, gestisce ora legale) ----
  const hourIn = (t, tz) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)); const g = k => p.find(x => x.type === k).value; return { h: +g('hour') % 24 + +g('minute') / 60, day: `${g('year')}-${g('month')}-${g('day')}` }; };
  E.SESS = [
    { id: 'asia', name: 'Asia (Tokyo)', tz: 'Asia/Tokyo', a: 9, b: 18 },
    { id: 'lon', name: 'Londra', tz: 'Europe/London', a: 8, b: 17 },
    { id: 'ny', name: 'New York', tz: 'America/New_York', a: 8, b: 17 },
  ];
  E.sessions = c15 => {
    // raggruppa per giorno di Roma
    const out = {};
    for (const x of c15) {
      const rd = hourIn(x.t, 'Europe/Rome').day;
      for (const s of E.SESS) {
        const { h } = hourIn(x.t, s.tz);
        if (h >= s.a && h < s.b) {
          const k = rd + '|' + s.id; const o = out[k] || (out[k] = { day: rd, id: s.id, name: s.name, h: -Infinity, l: Infinity, o: x.o, c: x.c, n: 0, t0: x.t, t1: x.t });
          o.h = Math.max(o.h, x.h); o.l = Math.min(o.l, x.l); o.c = x.c; o.n++; o.t1 = x.t;
        }
      }
    }
    const days = [...new Set(Object.values(out).map(x => x.day))].sort().slice(-3).reverse();
    return days.map(d => ({ day: d, s: E.SESS.map(s => out[d + '|' + s.id]).filter(Boolean) }));
  };
  E.isOpen = (s, t = Date.now()) => { const { h } = hourIn(t, s.tz); const wd = new Intl.DateTimeFormat('en-US', { timeZone: s.tz, weekday: 'short' }).format(new Date(t)); return h >= s.a && h < s.b && !['Sat', 'Sun'].includes(wd); };

  // livelli giornalieri/settimanali/mensili + ADR
  E.htfLevels = d => {
    const pd = d.at(-2), now = new Date(d.at(-1).t);
    const wk = x => { const dt = new Date(x.t); const day = (dt.getUTCDay() + 6) % 7; return Math.floor((x.t - day * 864e5) / 864e5); };
    const curW = wk(d.at(-1)); const mk = x => new Date(x.t).getUTCFullYear() * 12 + new Date(x.t).getUTCMonth(); const curM = mk(d.at(-1));
    const agg = a => a.length ? { h: Math.max(...a.map(x => x.h)), l: Math.min(...a.map(x => x.l)) } : null;
    const rng = d.slice(-21, -1).map(x => x.h - x.l); const adr = rng.reduce((s, v) => s + v, 0) / (rng.length || 1);
    const today = d.at(-1);
    return {
      pdh: pd.h, pdl: pd.l, adr, todayRange: today.h - today.l,
      w: agg(d.filter(x => wk(x) === curW)), pw: agg(d.filter(x => wk(x) === curW - 7)),
      m: agg(d.filter(x => mk(x) === curM)), pm: agg(d.filter(x => mk(x) === curM - 1)),
    };
  };

  // ---- fondamentale ----
  E.CUR = { USD: 'USA', EUR: 'EA20', GBP: 'GBR', JPY: 'JPN', CHF: 'CHE', CAD: 'CAN', AUD: 'AUS', NZD: 'NZL' };
  E.fundScore = macro => {
    // z-score su: tasso reale, tasso ufficiale, crescita PIL, trend inflazione vs tasso, disoccupazione (inversa), COT
    const cs = Object.keys(E.CUR);
    const get = (c, k) => { const x = macro?.countries?.[E.CUR[c]]?.[k]; return x && !x.old ? x.v : null; };
    const feats = {
      rate: c => get(c, 'rate'),
      real: c => get(c, 'rate') != null && get(c, 'cpi') != null ? get(c, 'rate') - get(c, 'cpi') : null,
      gdp: c => get(c, 'gdp_yoy'),
      unemp: c => get(c, 'unemp') != null ? -get(c, 'unemp') : null,
      cot: c => macro?.cot?.[c]?.idx != null ? (macro.cot[c].idx - 50) / 25 : null,
    };
    const W = { rate: 1, real: 1.2, gdp: 1, unemp: 0.6, cot: 0.8 };
    const z = {};
    for (const [k, f] of Object.entries(feats)) {
      const vals = cs.map(f).filter(v => v != null && !isNaN(v)); if (vals.length < 3) continue;
      const m = vals.reduce((s, v) => s + v, 0) / vals.length, sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length) || 1;
      cs.forEach(c => { const v = f(c); (z[c] = z[c] || {})[k] = v == null || isNaN(v) ? null : (k === 'cot' ? v : (v - m) / sd); });
    }
    const res = {};
    cs.forEach(c => { let s = 0, w = 0; for (const k in W) { const v = z[c]?.[k]; if (v != null) { s += v * W[k]; w += W[k]; } } res[c] = { score: w ? s / w : 0, parts: z[c] || {} }; });
    return res;
  };
  E.gradeTxt = s => s > 0.6 ? ['Forte', 'up'] : s > 0.2 ? ['Solida', 'up'] : s < -0.6 ? ['Debole', 'dn'] : s < -0.2 ? ['Fragile', 'dn'] : ['Neutra', 'neu'];
  // driver oro: trend DXY (inverso), bond USA (prezzo su = rendimenti giù = positivo), VIX alto = positivo, COT
  E.goldDrivers = (drv, macro) => {
    const items = []; let s = 0, n = 0;
    const add = (name, v, txt) => { items.push({ name, v, txt }); s += v; n++; };
    if (drv.DXY) add('Dollaro (DXY)', -drv.DXY.bias, drv.DXY.bias > 0 ? 'Dollaro in rafforzamento: vento contrario' : drv.DXY.bias < 0 ? 'Dollaro in indebolimento: vento a favore' : 'Dollaro laterale');
    if (drv.UST) add('Rendimenti USA', drv.UST.bias, drv.UST.bias > 0 ? 'Bond in salita, rendimenti in calo: a favore' : drv.UST.bias < 0 ? 'Rendimenti in salita: contro' : 'Rendimenti stabili');
    if (drv.VIX) { const v = drv.VIX.last; add('Paura (VIX)', v > 22 ? 1 : v < 15 ? -0.5 : 0, `VIX a ${v.toFixed(1).replace('.', ',')}: ${v > 22 ? 'tensione alta, domanda di rifugi' : v < 15 ? 'mercato tranquillo, meno domanda di rifugi' : 'livello normale'}`); }
    const cot = macro?.cot?.XAU; if (cot) add('Posizionamento (COT)', cot.idx > 85 ? -0.5 : cot.idx < 15 ? 0.5 : cot.chg > 0 ? 0.5 : -0.5, `Speculatori netti ${cot.net > 0 ? 'lunghi' : 'corti'} (indice ${cot.idx.toFixed(0)}/100${cot.idx > 85 ? ', affollato' : cot.idx < 15 ? ', estremo basso' : ''}), ${cot.chg > 0 ? 'in aumento' : 'in calo'} nell'ultima settimana`);
    const tot = n ? s / n : 0;
    return { items, score: tot, verdict: tot > 0.25 ? ['Vento a favore', 'up'] : tot < -0.25 ? ['Vento contrario', 'dn'] : ['Driver misti', 'neu'] };
  };

  // driver per valuta: macro (pagella), COT, mercati collegati, forza del prezzo
  E.CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  E.ccyStrength = rows => { // rows: [{ins, b4}] bias 4H di ogni coppia
    const o = {}; E.CCY.forEach(c => { const v = []; rows.forEach(r => { if (r.ins.b === c) v.push(r.b4); else if (r.ins.q === c) v.push(-r.b4); }); o[c] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }); return o;
  };
  E.ccyDrivers = (drv, macro, fund, str) => {
    const out = {}; const vix = drv.VIX?.last;
    const dxy = drv.DXY?.bias, ust = drv.UST?.bias, spx = drv.SPX?.bias, oil = drv.BRENT?.bias;
    const t = (b, up, dn, fl) => b > 0 ? up : b < 0 ? dn : fl;
    E.CCY.forEach(c => {
      const items = []; let s = 0, n = 0; const add = (name, v, txt, w = 1) => { items.push({ name, v, txt }); s += v * w; n += w; };
      const f = fund?.[c]; if (f) { const [g] = E.gradeTxt(f.score); const x = macro?.countries?.[E.CUR[c]]; add('Macro (pagella)', Math.max(-1, Math.min(1, f.score)), `${g}${x?.rate ? ` · tasso ${x.rate.v.toFixed(2).replace('.', ',')}%` : ''}${x?.cpi ? ` · inflazione ${x.cpi.v.toFixed(1).replace('.', ',')}%` : ''}`, 1.2); }
      const cot = macro?.cot?.[c]; if (cot) add('Posizionamento (COT)', cot.idx > 85 ? -0.5 : cot.idx < 15 ? 0.5 : cot.chg > 0 ? 0.5 : -0.5, `Speculatori netti ${cot.net > 0 ? 'lunghi' : 'corti'} (indice ${cot.idx.toFixed(0)}/100${cot.idx > 85 ? ', affollato' : cot.idx < 15 ? ', estremo basso' : ''}), ${cot.chg > 0 ? 'in aumento' : 'in calo'}`, 0.8);
      if (c === 'USD') {
        if (dxy != null) add('Dollar Index', dxy, t(dxy, 'DXY in rialzo', 'DXY in calo', 'DXY laterale'));
        if (ust != null) add('Rendimenti USA', -ust, t(ust, 'Rendimenti in calo: frena il dollaro', 'Rendimenti in salita: sostiene il dollaro', 'Rendimenti stabili'));
        if (vix != null && vix > 22) add('Paura (VIX)', 0.5, `VIX a ${vix.toFixed(1).replace('.', ',')}: domanda di dollari come rifugio`);
      }
      if (c === 'EUR' && dxy != null) add('Dollar Index (inverso)', -dxy, t(dxy, 'Dollaro forte: pesa sull\'euro', 'Dollaro debole: aiuta l\'euro', 'Dollaro laterale'));
      if (c === 'GBP') { if (dxy != null) add('Dollar Index (inverso)', -dxy * 0.7, t(dxy, 'Dollaro forte: pesa sulla sterlina', 'Dollaro debole: aiuta la sterlina', 'Dollaro laterale')); if (spx != null) add('Propensione al rischio', spx * 0.5, t(spx, 'Borse in salita: lieve supporto', 'Borse in calo: lieve pressione', 'Borse laterali')); }
      if (c === 'CHF' || c === 'JPY') {
        if (vix != null) add('Paura (VIX)', vix > 22 ? 1 : vix < 15 ? -0.5 : 0, `VIX a ${vix.toFixed(1).replace('.', ',')}: ${vix > 22 ? 'domanda di rifugi, a favore' : vix < 15 ? 'mercato tranquillo, rifugi meno richiesti' : 'livello normale'}`);
        if (spx != null) add('Borse (inverso)', -spx * 0.5, t(spx, 'Borse in salita: risk-on, contro i rifugi', 'Borse in calo: risk-off, a favore', 'Borse laterali'));
        if (c === 'JPY' && ust != null) add('Rendimenti USA', ust, t(ust, 'Rendimenti USA in calo: differenziale a favore dello yen', 'Rendimenti USA in salita: contro lo yen', 'Rendimenti stabili'));
      }
      if (c === 'CAD') { if (oil != null) add('Petrolio (Brent)', oil, t(oil, 'Petrolio in salita: a favore del CAD', 'Petrolio in calo: contro il CAD', 'Petrolio laterale')); }
      if (c === 'AUD' || c === 'NZD') {
        if (spx != null) add('Propensione al rischio', spx, t(spx, 'Borse in salita: risk-on, a favore', 'Borse in calo: risk-off, contro', 'Borse laterali'));
        if (vix != null && vix > 22) add('Paura (VIX)', -1, `VIX a ${vix.toFixed(1).replace('.', ',')}: fuga dalle valute rischiose`);
        if (c === 'AUD' && oil != null) add('Materie prime', oil * 0.4, t(oil, 'Materie prime in salita: lieve supporto', 'Materie prime in calo: lieve pressione', 'Materie prime laterali'));
      }
      if (str?.[c] != null) add('Forza del prezzo (4H)', Math.max(-1, Math.min(1, str[c])), str[c] > 0.3 ? 'In rafforzamento contro le altre valute' : str[c] < -0.3 ? 'In indebolimento contro le altre valute' : 'Andamento misto contro le altre valute', 0.8);
      const score = n ? s / n : 0;
      out[c] = { items, score, verdict: score > 0.25 ? ['Vento a favore', 'up'] : score < -0.25 ? ['Vento contrario', 'dn'] : ['Driver misti', 'neu'] };
    });
    return out;
  };

  // eventi ad alto impatto entro X ore per le valute della coppia
  E.eventRisk = (ins, cal, hours = 2, now = Date.now()) => {
    if (!cal) return [];
    const cur = [ins.b, ins.q].map(c => c === 'XAU' || c === 'XAG' ? 'USD' : c);
    return cal.filter(e => e.impact === 'High' && cur.includes(e.country) && e.ts > now - 15 * 6e4 && e.ts < now + hours * 36e5);
  };

  // verdetto tecnico per un TF
  E.verdict = (R, tf) => {
    const A = R[tf].a; const higher = tf === '1d' || tf === '4h' ? R['1d'].a : R['4h'].a;
    const ks = Object.values(R).map(x => x.a.bias);
    const dir = A.bias !== 0 ? A.bias : Math.sign(ks.reduce((s, v) => s + v, 0));
    const agree = ks.filter(v => v === dir && dir !== 0).length;
    let cv = 2 + agree * (8 / ks.length) * 0.7; const why = [];
    if (dir > 0 && A.rsi > 80) { cv -= 2; why.push(`RSI ${A.rsi.toFixed(0)} in ipercomprato: rischio di inseguire`); }
    if (dir < 0 && A.rsi < 20) { cv -= 2; why.push(`RSI ${A.rsi.toFixed(0)} in ipervenduto: rischio di vendere sui minimi`); }
    if (dir === higher.bias && dir !== 0) { cv += 1.5; why.push('Il timeframe superiore conferma la direzione'); } else if (dir !== 0) why.push('Il timeframe superiore non conferma: cautela');
    if (A.hh && A.hl) why.push('Struttura a massimi e minimi crescenti');
    if (A.lh && A.ll) why.push('Struttura a massimi e minimi decrescenti');
    if (A.pos > 0.85) why.push('Prezzo nella parte alta del box delle ultime 20 candele');
    else if (A.pos < 0.15) why.push('Prezzo nella parte bassa del box delle ultime 20 candele');
    else why.push(`Prezzo dentro il box (${(A.pos * 100).toFixed(0)}%): meglio attendere un livello`);
    why.push(A.last > A.e200 ? 'Sopra la EMA 200: contesto di fondo positivo' : 'Sotto la EMA 200: contesto di fondo negativo');
    if (dir === 0) cv = Math.min(cv, 3);
    cv = Math.max(0, Math.min(10, cv));
    return { A, dir, cv, why, ...E.scenarios(A, dir) };
  };

  // punteggio combinato per lo scanner
  E.combine = (ins, V, fund, gold, evts, cd) => {
    let fb = 0;
    if (ins.b === 'XAU' || ins.b === 'XAG') fb = gold ? gold.score * 2 : 0;
    else if (cd && cd[ins.b] && cd[ins.q]) fb = (cd[ins.b].score - cd[ins.q].score) * 1.5;
    else if (fund) fb = (fund[ins.b]?.score ?? 0) - (fund[ins.q]?.score ?? 0);
    const fdir = fb > 0.25 ? 1 : fb < -0.25 ? -1 : 0;
    let total = V.cv;
    if (V.dir !== 0 && fdir === V.dir) total += 1.5; else if (V.dir !== 0 && fdir === -V.dir) total -= 2;
    const blocked = evts.length > 0; if (blocked) total -= 1;
    total = Math.max(0, Math.min(10, total));
    const s = V.sc[0];
    const dist = s ? Math.abs(V.A.last - s.en) / V.A.atr : null;
    const inZone = s && s.zone ? (V.A.last >= Math.min(...s.zone) - 0.3 * V.A.atr && V.A.last <= Math.max(...s.zone) + 0.3 * V.A.atr) : false;
    let state = 'Attendere';
    if (V.dir === 0) state = 'Range: nessun setup';
    else if (blocked) state = 'Bloccato: news in arrivo';
    else if (inZone && total >= 6) state = 'In zona di ingresso';
    else if (dist != null && dist < 1.2 && total >= 6) state = 'Vicino alla zona';
    return { fb, fdir, total, blocked, inZone, dist, state, s };
  };

  // ---- verifica sullo storico (scenario "ritracciamento") ----
  E.backtest = (c, opt = {}) => {
    const start = opt.start || 210, wait = opt.wait || 12, trades = [];
    let i = start;
    while (i < c.length - 2) {
      const A = E.analyze(c.slice(Math.max(0, i - 400), i + 1));
      if (A.bias === 0 || (A.bias > 0 && A.rsi > 80) || (A.bias < 0 && A.rsi < 20)) { i++; continue; }
      const { sc } = E.scenarios(A, A.bias); const s = sc[0];
      if (!s || !(s.rr > 0.8) || Math.abs(s.en - s.sl) < A.atr * 0.3) { i++; continue; }
      let fill = -1;
      for (let j = i + 1; j < Math.min(c.length, i + 1 + wait); j++) { if (s.side > 0 ? c[j].l <= s.en : c[j].h >= s.en) { fill = j; break; } if (s.side > 0 ? c[j].h >= s.tp[0] : c[j].l <= s.tp[0]) break; }
      if (fill < 0) { i++; continue; }
      let res = null, k = fill;
      for (; k < c.length; k++) {
        const hitSL = s.side > 0 ? c[k].l <= s.sl : c[k].h >= s.sl, hitTP = s.side > 0 ? c[k].h >= s.tp[0] : c[k].l <= s.tp[0];
        if (hitSL) { res = -1; break; } if (hitTP) { res = s.rr; break; }
      }
      if (res == null) break;
      trades.push({ t: c[fill].t, side: s.side, r: res }); i = k + 1;
    }
    const n = trades.length, w = trades.filter(x => x.r > 0).length;
    const sumW = trades.filter(x => x.r > 0).reduce((s, x) => s + x.r, 0), sumL = trades.filter(x => x.r < 0).length;
    let streak = 0, maxL = 0; trades.forEach(x => { streak = x.r < 0 ? streak + 1 : 0; maxL = Math.max(maxL, streak); });
    let eq = 0, peak = 0, dd = 0; trades.forEach(x => { eq += x.r; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); });
    return { n, win: n ? w / n : 0, exp: n ? (sumW - sumL) / n : 0, pf: sumL ? sumW / sumL : null, maxL, dd, totR: eq, from: c[start]?.t, to: c.at(-1).t, trades };
  };

  if (typeof module !== 'undefined') module.exports = E; else root.ENGINE = E;
})(typeof window !== 'undefined' ? window : globalThis);
