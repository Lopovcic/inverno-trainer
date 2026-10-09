/* Inverno-Trainer · fingering.js
 * Suggests string / finger / position for every note with a Viterbi search over
 * playable candidates. Positions follow the diatonic convention violinists use:
 * in position p, finger f stops the (p-1+f)-th diatonic step above the open string.
 * User overrides (string and/or finger per note) constrain the search; neighbouring
 * notes re-adapt around them.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  const OPEN = [55, 62, 69, 76];                 // G3 D4 A4 E5
  const OPEN_DIA = [4 + 7 * 3, 1 + 7 * 4, 5 + 7 * 4, 2 + 7 * 5];
  const MAX_SEMIS = [14, 15, 17, 21];
  const LETTER = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
  const MAX_POS = 12;

  function candidates(note) {
    const out = [];
    const dia = LETTER[note.step] + 7 * note.oct;
    for (let s = 0; s < 4; s++) {
      const k = note.midi - OPEN[s];
      if (k < 0 || k > MAX_SEMIS[s]) continue;
      const n = dia - OPEN_DIA[s];
      if (k === 0) {
        if (n === 0) for (let p = 1; p <= 7; p++) out.push({ s, f: 0, p, k, ext: 0 });
        continue;
      }
      for (let f = 1; f <= 4; f++) {
        const p = n - f + 1;
        if (p >= 1 && p <= MAX_POS) out.push({ s, f, p, k, ext: 0 });
      }
      if (n - 4 >= 1 && n - 4 <= MAX_POS) out.push({ s, f: 4, p: n - 4, k, ext: 1 });   // stretched 4th
      if (n >= 0 && n + 1 <= MAX_POS) out.push({ s, f: 1, p: n + 1, k, ext: 1 });       // 1st stretched back
    }
    return out;
  }

  function nodeCost(c, note) {
    const sec = note.d * note.secPerTick;
    if (c.f === 0) return sec > 0.3 ? 0.7 : 0.12;   // open string: fine when quick, no vibrato when long
    let cost = 0.11 * (c.p - 1);
    if (c.p % 2 === 0) cost += 0.25;                // 2nd/4th/6th position less idiomatic
    if (c.f === 4) cost += 0.18;
    if (c.ext) cost += 1.3;
    if (c.s === 0 && c.p >= 4) cost += 0.45 * (c.p - 3);
    if (c.s === 1 && c.p >= 6) cost += 0.25 * (c.p - 5);
    if (c.s === 2 && c.p >= 8) cost += 0.2 * (c.p - 7);
    return cost;
  }

  function transCost(a, b, na, nb) {
    let cost = 0;
    const secA = na.d * na.secPerTick;
    const fast = secA < 0.12 ? 1.7 : secA < 0.22 ? 1.3 : 1;
    const shift = Math.abs(b.p - a.p);
    if (shift) {
      let sc = (1.7 + 0.75 * shift) * fast;
      if (a.f === 0 || b.f === 0) sc *= 0.45;       // the hand moves freely during an open string
      if (nb.restBefore) sc *= 0.35;
      if (na.midi === nb.midi) sc *= 0.5;           // shifting on a repeated note is easy
      cost += sc;
    }
    const ds = Math.abs(b.s - a.s);
    if (ds === 1) cost += 0.12;
    else if (ds === 2) cost += 0.9 * fast;
    else if (ds === 3) cost += 1.9 * fast;
    if (a.f > 0 && a.f === b.f && na.midi !== nb.midi) {
      if (a.s === b.s) cost += a.p === b.p ? 2.4 : 0.35;   // chromatic slide vs. guide-finger shift
      else if (ds === 1) cost += 0.3 * fast;               // fifth across strings
      else cost += 1.6;
    }
    // prefer the same string inside a slur unless crossing is needed
    if (na.sl && !na.se && ds > 0) cost += 0.05;
    return cost;
  }

  /**
   * @param {Array} notes score notes (with midi, step, oct, d, secPerTick, restBefore)
   * @param {Object} overrides map note index -> {s?, f?}
   * @returns {Array<{s,f,p,k,ext}>}
   */
  function solve(notes, overrides = {}) {
    const N = notes.length;
    if (!N) return [];
    const cands = new Array(N);
    for (let i = 0; i < N; i++) {
      let c = candidates(notes[i]);
      const ov = overrides[notes[i].ni];
      if (ov) {
        const f = c.filter(x => (ov.s == null || x.s === ov.s) && (ov.f == null || x.f === ov.f));
        if (f.length) c = f;
      }
      if (!c.length) c = [{ s: 3, f: 4, p: MAX_POS, k: notes[i].midi - OPEN[3], ext: 2 }];
      cands[i] = c;
    }
    let prevCost = cands[0].map(c => nodeCost(c, notes[0]) + (c.p - 1) * 0.15);
    const back = [new Int16Array(cands[0].length).fill(-1)];
    for (let i = 1; i < N; i++) {
      const cur = cands[i], prv = cands[i - 1];
      const costs = new Float64Array(cur.length);
      const bp = new Int16Array(cur.length);
      for (let j = 0; j < cur.length; j++) {
        let best = Infinity, arg = 0;
        for (let q = 0; q < prv.length; q++) {
          const v = prevCost[q] + transCost(prv[q], cur[j], notes[i - 1], notes[i]);
          if (v < best) { best = v; arg = q; }
        }
        costs[j] = best + nodeCost(cur[j], notes[i]);
        bp[j] = arg;
      }
      prevCost = costs;
      back.push(bp);
    }
    let j = 0;
    for (let q = 1; q < prevCost.length; q++) if (prevCost[q] < prevCost[j]) j = q;
    const out = new Array(N);
    for (let i = N - 1; i >= 0; i--) {
      out[i] = cands[i][j];
      j = back[i][j];
    }
    return out.map(c => ({ s: c.s, f: c.f, p: c.p, k: c.k, ext: c.ext }));
  }

  const tr = (k, p) => (window.IT && window.IT.i18n ? window.IT.i18n.t : (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m)))(k, p);

  IT.Fingering = {
    candidates,
    solve,
    OPEN,
    /** Which strings can play this note at all (for the override picker). */
    playableStrings(note) { return [0, 1, 2, 3].filter(s => note.midi - OPEN[s] >= 0 && note.midi - OPEN[s] <= MAX_SEMIS[s]); },
    fingersOn(note, s) { return [...new Set(candidates(note).filter(c => c.s === s).map(c => c.f))].sort(); },
    positionLabel(fg) { return fg.f === 0 ? tr('leere Saite') : tr('{p}. Lage', { p: fg.p }); },
    fingerLabel(fg) { return fg.f === 0 ? tr('leer') : tr('{f}. Finger', { f: fg.f }); },
    /** Best string for an arbitrary (detected) pitch, preferring the target string. */
    stringForPitch(midiFloat, preferred) {
      const k = midiFloat - OPEN[preferred];
      if (preferred != null && k > -0.6 && k < MAX_SEMIS[preferred] + 1) return preferred;
      for (let s = 3; s >= 0; s--) {
        const kk = midiFloat - OPEN[s];
        if (kk > -0.6 && kk < 8) return s;
      }
      return midiFloat < OPEN[0] ? 0 : 3;
    },
  };
})();
