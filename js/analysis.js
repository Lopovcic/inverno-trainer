/* Inverno-Trainer · analysis.js
 * Evaluates a recorded passage against the score:
 *   1. pitch track (YIN, 8 ms hop)
 *   2. alignment of the recording to the expected notes with a left-to-right
 *      Viterbi over template frames (tempo-free: slower is free, up to 2× faster,
 *      whole notes may be skipped with a penalty)
 *   3. per-note intonation (median pitch of the stable middle part), wrong/missed
 *      notes, onset regularity, tendencies per string/finger and after shifts.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  function median(arr) {
    if (!arr.length) return NaN;
    const a = Float64Array.from(arr).sort();
    const h = a.length >> 1;
    return a.length % 2 ? a[h] : 0.5 * (a[h - 1] + a[h]);
  }
  function percentile(arr, q) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
  }

  /** Pitch track → MIDI-float series with adaptive voicing. */
  function toMidiSeries(tr, a4) {
    const n = tr.f.length;
    const loud = percentile(Array.from(tr.rms), 0.95);
    const gate = Math.max(0.0025, loud * 0.07);
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      raw[i] = tr.f[i] > 0 && tr.conf[i] >= 0.72 && tr.rms[i] >= gate ? 69 + 12 * Math.log2(tr.f[i] / a4) : NaN;
    }
    // 3-point median against single-frame glitches (octave jumps etc.)
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = raw[i - 1], b = raw[i], c = raw[i + 1];
      if (isNaN(b)) { p[i] = NaN; continue; }
      const v = [a, b, c].filter(x => x === x);
      p[i] = v.length === 3 ? v.sort((x, y) => x - y)[1] : b;
    }
    return { p, gate };
  }

  function emissionNote(p, m) {
    if (p !== p) return 0.75;                 // unvoiced inside a note: mild
    let d = Math.abs(p - m);
    const oct = Math.abs(d - 12) + 0.8;
    if (oct < d) d = oct;
    return d < 1 ? d * d : Math.min(1 + (d - 1) * 0.9, 3.2);
  }
  function emissionRest(p) { return p !== p ? 0.04 : 1.3; }

  /**
   * Align frames to expected events.
   * @param {Float32Array} p midi series (NaN = unvoiced)
   * @param {Array} evs expected events {midi|rest, d (ticks)}
   * @param {number} hopSec
   * @returns {{ranges: Array<[number,number]|null>, secPerTick:number, start:number, end:number}}
   */
  function align(p, evs, hopSec) {
    const I = p.length;
    // active region from the first to the last sustained voiced frames
    let first = -1, last = -1;
    for (let i = 0; i + 2 < I; i++) if (p[i] === p[i] && p[i + 1] === p[i + 1] && p[i + 2] === p[i + 2]) { first = i; break; }
    for (let i = I - 1; i >= 2; i--) if (p[i] === p[i] && p[i - 1] === p[i - 1] && p[i - 2] === p[i - 2]) { last = i; break; }
    if (first < 0 || last <= first) return null;
    // trailing rests are not part of the timing estimate
    let k1 = evs.length - 1;
    while (k1 > 0 && evs[k1].rest) k1--;
    let k0 = 0;
    while (k0 < k1 && evs[k0].rest) k0++;
    const spanTicks = evs.slice(k0, k1 + 1).reduce((a, e) => a + e.d, 0);
    const activeSec = (last - first + 1) * hopSec;
    const secPerTick = activeSec / spanTicks;

    // template frames
    const tplEv = [];
    const evFirst = new Int32Array(evs.length), evLast = new Int32Array(evs.length);
    evs.forEach((e, k) => {
      const n = Math.max(1, Math.round(e.d * secPerTick / hopSec * 0.85));
      evFirst[k] = tplEv.length;
      for (let q = 0; q < n; q++) tplEv.push(k);
      evLast[k] = tplEv.length - 1;
    });
    const J = tplEv.length;
    const E = evs.length;
    // states: 0 = pre-silence, 1..J template frames, J+1 = post-silence
    const S = J + 2;
    const INF = 1e12;
    let prev = new Float64Array(S).fill(INF), cur = new Float64Array(S);
    const back = new Uint8Array(I * S);        // 0 stay, 1 from j-1, 2 from j-2, 3 event skip, 4 skip first event
    const skipArg = new Int32Array(I * (E + 1)).fill(-1);
    const emit = (j, i) => {
      if (j === 0 || j === S - 1) return p[i] === p[i] ? 1.6 : 0.0;
      const e = evs[tplEv[j - 1]];
      return e.rest ? emissionRest(p[i]) : emissionNote(p[i], e.midi);
    };
    prev[0] = emit(0, 0);
    prev[1] = emit(1, 0);
    const SKIP_PEN = 5.5, JUMP_PEN = 0.08;
    // per event: min of the previous column over the event's frames (for event skips)
    const evMin = new Float64Array(E), evArg = new Int32Array(E);
    for (let i = 1; i < I; i++) {
      for (let k = 0; k < E; k++) {
        let best = INF, arg = -1;
        for (let j = evFirst[k] + 1; j <= evLast[k] + 1; j++) if (prev[j] < best) { best = prev[j]; arg = j; }
        evMin[k] = best; evArg[k] = arg;
      }
      const rowS = i * S, rowE = i * (E + 1);
      for (let j = 0; j < S; j++) {
        let best = prev[j], bp = 0;
        if (j >= 1 && prev[j - 1] < best) { best = prev[j - 1]; bp = 1; }
        if (j >= 2 && j <= J && prev[j - 2] + JUMP_PEN < best) { best = prev[j - 2] + JUMP_PEN; bp = 2; }
        if (j >= 1 && j <= J) {
          const k = tplEv[j - 1];
          if (j - 1 === evFirst[k]) {
            // skip a whole event: from any frame of event k-2 into the first frame of event k
            if (k >= 2 && evMin[k - 2] + SKIP_PEN < best) { best = evMin[k - 2] + SKIP_PEN; bp = 3; skipArg[rowE + k] = evArg[k - 2]; }
            if (k === 1 && prev[0] + SKIP_PEN < best) { best = prev[0] + SKIP_PEN; bp = 4; }
          }
        } else if (j === S - 1 && E >= 2 && evMin[E - 2] + SKIP_PEN < best) {
          best = evMin[E - 2] + SKIP_PEN; bp = 3; skipArg[rowE + E] = evArg[E - 2];   // skip the last event
        }
        cur[j] = best + emit(j, i);
        back[rowS + j] = bp;
      }
      const t = prev; prev = cur; cur = t;
    }
    // end in post-silence or in the last template frame
    let j = prev[S - 1] <= prev[J] ? S - 1 : J;
    const stateOf = new Int32Array(I);
    for (let i = I - 1; i >= 0; i--) {
      stateOf[i] = j;
      if (i === 0) break;
      const bp = back[i * S + j];
      if (bp === 1) j -= 1;
      else if (bp === 2) j -= 2;
      else if (bp === 3) { const k = j === S - 1 ? E : tplEv[j - 1]; j = skipArg[i * (E + 1) + k]; }
      else if (bp === 4) j = 0;
      if (j < 0) j = 0;
    }

    const ranges = evs.map(() => null);
    for (let i = 0; i < I; i++) {
      const st = stateOf[i];
      if (st < 1 || st > J) continue;
      const k = tplEv[st - 1];
      if (!ranges[k]) ranges[k] = [i, i];
      else ranges[k][1] = i;
    }
    return { ranges, secPerTick, first, last };
  }

  /**
   * Full passage analysis.
   * @param {Float32Array} samples
   * @param {number} sr
   * @param {object} o { score, m1, m2, a4, fingering, tolerance, onProgress }
   */
  async function analyzePassage(samples, sr, o) {
    const { score, m1, m2, a4 = 440, fingering = [], tolerance = 15 } = o;
    const tr = await IT.Pitch.track(samples, sr, { hopSec: 0.008, onProgress: o.onProgress ? f => o.onProgress(f * 0.85) : null });
    const { p } = toMidiSeries(tr, a4);
    const evs = score.eventsInRange(m1, m2);
    if (!evs.length) throw new Error('Keine Noten im gewählten Bereich.');
    // strip leading/trailing rests from the expectation
    let a = 0, b = evs.length - 1;
    while (a < b && evs[a].rest) a++;
    while (b > a && evs[b].rest) b--;
    const exp = evs.slice(a, b + 1);
    // alignment frames: downsample if the problem gets large
    let step = 1;
    while ((p.length / step) * (p.length / step) > 9e6) step++;
    const pa = step === 1 ? p : downsample(p, step);
    await new Promise(r => setTimeout(r, 0));
    const al = align(pa, exp, tr.hopSec * step);
    if (o.onProgress) o.onProgress(0.95);
    if (!al) {
      return { ok: false, reason: 'Kein Spiel erkannt. Prüfe Mikrofon und Eingangspegel und spiele etwas lauter.', track: tr, series: p };
    }
    const hop = tr.hopSec;
    const notes = [];
    for (let k = 0; k < exp.length; k++) {
      const e = exp[k];
      if (e.rest) continue;
      const r = al.ranges[k];
      const fg = fingering[e.ni] || null;
      const res = { ni: e.ni, m: e.m, midi: e.midi, d: e.d, t: e.t, fg, state: 'miss', cents: null, played: null, start: null, end: null, spread: null };
      if (r) {
        const i0 = r[0] * step, i1 = Math.min(p.length - 1, (r[1] + 1) * step - 1);
        res.start = tr.t[i0] - hop / 2;
        res.end = tr.t[i1] + hop / 2;
        const len = i1 - i0 + 1;
        const cut0 = len >= 6 ? Math.round(len * 0.2) : len >= 3 ? 1 : 0;
        const cut1 = len >= 6 ? Math.round(len * 0.12) : 0;
        const vals = [];
        for (let i = i0 + cut0; i <= i1 - cut1; i++) if (p[i] === p[i]) vals.push(p[i]);
        if (vals.length < 2) for (let i = i0; i <= i1; i++) if (p[i] === p[i]) vals.push(p[i]);
        if (vals.length >= 2) {
          let med = median(vals);
          const dev = med - e.midi;
          // ignore octave errors of the tracker (rare): fold to the closest octave
          if (Math.abs(dev - 12) < 0.6 || Math.abs(dev + 12) < 0.6) med -= 12 * Math.round(dev / 12);
          const c = (med - e.midi) * 100;
          res.played = med;
          res.cents = c;
          res.spread = (percentile(vals, 0.8) - percentile(vals, 0.2)) * 100;
          if (Math.abs(c) > 60) res.state = 'wrong';
          else res.state = Math.abs(c) <= tolerance ? 'good' : Math.abs(c) <= tolerance * 2 ? 'warn' : 'bad';
        }
      }
      notes.push(res);
    }
    const summary = summarize(notes, score, tolerance, al);
    if (o.onProgress) o.onProgress(1);
    return { ok: true, notes, summary, track: tr, series: p, align: al, m1, m2, a4, tolerance, sr, duration: samples.length / sr };
  }

  function downsample(p, step) {
    const out = new Float32Array(Math.ceil(p.length / step));
    for (let i = 0; i < out.length; i++) {
      const v = [];
      for (let q = i * step; q < Math.min(p.length, (i + 1) * step); q++) if (p[q] === p[q]) v.push(p[q]);
      out[i] = v.length ? median(v) : NaN;
    }
    return out;
  }

  function noteScore(n, tol) {
    if (n.state === 'miss' || n.state === 'wrong') return 0;
    const c = Math.abs(n.cents);
    return 100 * Math.max(0, Math.min(1, 1 - (c - Math.min(5, tol / 3)) / 40));
  }

  function summarize(notes, score, tol, al) {
    const played = notes.filter(n => n.state !== 'miss' && n.state !== 'wrong');
    let wsum = 0, ssum = 0;
    for (const n of notes) {
      const w = Math.sqrt(Math.min(n.d, 480) / 120);
      wsum += w; ssum += w * noteScore(n, tol);
    }
    const intonation = wsum ? ssum / wsum : 0;
    const good = notes.filter(n => n.state === 'good').length;
    const hitRate = notes.length ? (100 * good) / notes.length : 0;
    const missed = notes.filter(n => n.state === 'miss').length;
    const wrong = notes.filter(n => n.state === 'wrong').length;
    const meanSigned = played.length ? played.reduce((a, n) => a + n.cents, 0) / played.length : 0;
    const meanAbs = played.length ? played.reduce((a, n) => a + Math.abs(n.cents), 0) / played.length : 0;

    // rhythm: onsets at pitch changes vs. expected positions (linear fit)
    const pts = [];
    for (const n of notes) {
      if (n.start == null || n.state === 'miss') continue;
      const ev = score.notes[n.ni];
      if (ev.prev && ev.prev.midi === ev.midi && !ev.restBefore) continue;
      pts.push([n.t, n.start]);
    }
    let rhythm = null, tempoBpm = null, rhythmMs = null;
    if (pts.length >= 4) {
      const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      let sxy = 0, sxx = 0;
      for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
      const slope = sxx > 0 ? sxy / sxx : al.secPerTick;
      const icpt = my - slope * mx;
      const res = pts.map(([x, y]) => y - (icpt + slope * x));
      const rms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
      const sixteenth = slope * score.ticksPerEighth / 2;
      rhythmMs = rms * 1000;
      rhythm = 100 * Math.max(0, Math.min(1, 1 - rms / (0.45 * sixteenth)));
      tempoBpm = slope > 0 ? 60 / (slope * score.ticksPerEighth * 3) : null;   // dotted quarter per minute
    }
    const overall = Math.round(0.6 * intonation + 0.25 * hitRate + 0.15 * (rhythm == null ? intonation : rhythm));

    // tendencies per string + finger
    const groups = new Map();
    const add = (key, label, n) => {
      if (!groups.has(key)) groups.set(key, { key, label, vals: [] });
      groups.get(key).vals.push(n.cents);
    };
    const SN = ['G', 'D', 'A', 'E'];
    let afterShift = [], afterCross = [], steady = [];
    for (const n of played) {
      if (n.fg && n.fg.f > 0) add(`${n.fg.s}-${n.fg.f}`, { finger: n.fg.f, string: n.fg.s }, n);
      const ev = score.notes[n.ni];
      const pf = ev.prev ? notes.find(q => q.ni === ev.prev.ni) : null;
      if (pf && pf.fg && n.fg && n.fg.f > 0 && pf.fg.f > 0 && pf.fg.p !== n.fg.p) afterShift.push(Math.abs(n.cents));
      else if (pf && pf.fg && n.fg && pf.fg.s !== n.fg.s) afterCross.push(Math.abs(n.cents));
      else steady.push(Math.abs(n.cents));
    }
    const tendencies = [...groups.values()]
      .filter(g => g.vals.length >= 3)
      .map(g => ({ finger: g.label.finger, string: g.label.string, label: `${g.label.finger}. Finger auf der ${SN[g.label.string]}-Saite`, key: g.key, n: g.vals.length, mean: g.vals.reduce((a, b) => a + b, 0) / g.vals.length }))
      .filter(g => Math.abs(g.mean) >= 7)
      .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
      .slice(0, 4);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const shiftInfo = afterShift.length >= 2 ? { n: afterShift.length, meanAbs: avg(afterShift), base: avg(steady) } : null;

    const worst = notes
      .filter(n => n.state !== 'good')
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 6);
    function rank(n) { return n.state === 'wrong' ? 999 : n.state === 'miss' ? 900 : Math.abs(n.cents); }

    return {
      overall, intonation: Math.round(intonation), hitRate: Math.round(hitRate),
      rhythm: rhythm == null ? null : Math.round(rhythm), rhythmMs, tempoBpm,
      count: notes.length, good, missed, wrong, meanSigned, meanAbs,
      tendencies, shiftInfo, worst, verdict: verdict(overall),
    };
  }

  function verdict(s) {
    if (s >= 92) return 'Ausgezeichnet';
    if (s >= 82) return 'Sehr gut';
    if (s >= 70) return 'Gut';
    if (s >= 55) return 'Ordentlich – da geht noch was';
    return 'Weiter üben ';
  }

  IT.Analysis = { analyzePassage, toMidiSeries, align, median, percentile, noteScore };
})();
