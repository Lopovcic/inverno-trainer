/* Inverno-Trainer · reference.js
 * Reference recordings: stored in IndexedDB, aligned to the score automatically
 * (tuning + transposition estimate, chroma features, subsequence DTW), played back
 * for any selected passage (time-stretched without pitch change), linked to YouTube
 * timestamps, and analysed for per-note intonation where the soloist is audible.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  // ------------------------------------------------------------------ IndexedDB
  const DB_NAME = 'inverno-trainer', STORE = 'refs', TAKES = 'takes';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Kein IndexedDB verfügbar')); return; }
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(TAKES)) d.createObjectStore(TAKES, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const st = t.objectStore(store);
      let out;
      Promise.resolve(fn(st)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const Store = {
    async all() { try { return await tx(STORE, 'readonly', st => reqP(st.getAll())); } catch (e) { return []; } },
    async get(id) { try { return await tx(STORE, 'readonly', st => reqP(st.get(id))); } catch (e) { return null; } },
    async put(ref) { return tx(STORE, 'readwrite', st => reqP(st.put(ref))); },
    async remove(id) { return tx(STORE, 'readwrite', st => reqP(st.delete(id))); },
  };
  /** Student takes (recordings of a passage), at most KEEP per measure range. */
  const Takes = {
    KEEP: 3,
    async forRange(key) {
      try {
        const all = await tx(TAKES, 'readonly', st => reqP(st.getAll()));
        return all.filter(t => t.range === key).sort((a, b) => a.date - b.date);
      } catch (e) { return []; }
    },
    async add(take) {
      const list = await this.forRange(take.range);
      await tx(TAKES, 'readwrite', st => {
        for (const old of list.slice(0, Math.max(0, list.length - this.KEEP + 1))) st.delete(old.id);
        return reqP(st.put(take));
      });
    },
    async clear() { try { await tx(TAKES, 'readwrite', st => reqP(st.clear())); } catch (e) { /* ignore */ } },
  };

  /** Resample mono samples (OfflineAudioContext does proper filtering). */
  async function resample(samples, sr, target) {
    if (sr === target) return samples;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return samples;
    const len = Math.ceil(samples.length * target / sr);
    const oc = new OAC(1, len, target);
    const buf = oc.createBuffer(1, samples.length, sr);
    buf.getChannelData(0).set(samples);
    const src = oc.createBufferSource();
    src.buffer = buf;
    src.connect(oc.destination);
    src.start();
    const out = await oc.startRendering();
    return out.getChannelData(0);
  }
  /** Compact WAV (22.05 kHz, 16 bit) for storing and sharing recordings. */
  async function compactWav(samples, sr) {
    const target = 22050;
    const s = await resample(samples, sr, target);
    return wavBlob(s, s === samples ? sr : target);
  }
  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, type) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: type || 'application/octet-stream' });
  }

  // ------------------------------------------------------------------ FFT
  function makeFFT(n) {
    const levels = Math.log2(n) | 0;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < levels; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    return function fft(re, im) {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const tre = re[l] * cos[k] + im[l] * sin[k];
            const tim = -re[l] * sin[k] + im[l] * cos[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim;
            re[j] += tre; im[j] += tim;
          }
        }
      }
    };
  }

  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  // ------------------------------------------------------------------ features
  /**
   * STFT → tuning histogram + 12-bin chroma per frame.
   * Returns { hopSec, frames, chroma: Float32Array(frames*12), energy, tuneCents }
   */
  async function features(samples, sr, onProgress) {
    const N = 4096, hop = 2048;
    const fft = makeFFT(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const frames = Math.max(1, Math.floor((samples.length - N) / hop) + 1);
    const re = new Float64Array(N), im = new Float64Array(N);
    const kLo = Math.floor(150 * N / sr), kHi = Math.min(N / 2 - 2, Math.ceil(4200 * N / sr));
    const mags = new Float32Array(frames * (kHi - kLo + 1));
    const energy = new Float32Array(frames);
    const hist = new Float64Array(100);
    let last = performance.now();
    for (let f = 0; f < frames; f++) {
      const o = f * hop;
      for (let i = 0; i < N; i++) { re[i] = (samples[o + i] || 0) * win[i]; im[i] = 0; }
      fft(re, im);
      let e = 0, mx = 0;
      const base = f * (kHi - kLo + 1);
      for (let k = kLo; k <= kHi; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        mags[base + k - kLo] = m;
        e += m * m;
        if (m > mx) mx = m;
      }
      energy[f] = Math.sqrt(e);
      // tuning histogram from clear spectral peaks
      if (mx > 0) {
        for (let k = Math.max(kLo + 1, Math.floor(180 * N / sr)); k < Math.min(kHi, Math.ceil(2600 * N / sr)); k++) {
          const a = mags[base + k - kLo - 1], b = mags[base + k - kLo], c = mags[base + k - kLo + 1];
          if (b < mx * 0.15 || b <= a || b < c) continue;
          const la = Math.log(a + 1e-9), lb = Math.log(b), lc = Math.log(c + 1e-9);
          const den = la - 2 * lb + lc;
          const d = den < 0 ? 0.5 * (la - lc) / den : 0;
          const freq = (k + d) * sr / N;
          let cents = 1200 * Math.log2(freq / 440);
          cents = ((cents % 100) + 150) % 100;          // 0..100, 50 = on the grid
          hist[Math.floor(cents) % 100] += Math.log(1 + b / (mx * 0.15));
        }
      }
      if (onProgress && performance.now() - last > 40) { onProgress(f / frames * 0.6); await yieldUI(); last = performance.now(); }
    }
    // circular smoothing of the histogram, find the peak
    let best = 0, bi = 50;
    for (let i = 0; i < 100; i++) {
      let s = 0;
      for (let d = -6; d <= 6; d++) s += hist[(i + d + 100) % 100] * (7 - Math.abs(d));
      if (s > best) { best = s; bi = i; }
    }
    const tuneCents = bi - 50;                       // offset from A=440 grid, -50..49
    return { N, hop, sr, hopSec: hop / sr, frames, kLo, kHi, mags, energy, tuneCents };
  }

  function chromaFrom(F, transpose) {
    const { frames, kLo, kHi, mags, sr, N, tuneCents } = F;
    const width = kHi - kLo + 1;
    const pcOf = new Int8Array(width), wOf = new Float32Array(width);
    for (let k = kLo; k <= kHi; k++) {
      const f = k * sr / N;
      const p = 69 + 12 * Math.log2(f / 440) - tuneCents / 100 - transpose;
      const r = Math.round(p);
      pcOf[k - kLo] = ((r % 12) + 12) % 12;
      wOf[k - kLo] = Math.max(0, 1 - 2 * Math.abs(p - r));
    }
    const out = new Float32Array(frames * 12);
    for (let f = 0; f < frames; f++) {
      const base = f * width;
      let mx = 0;
      for (let q = 0; q < width; q++) if (mags[base + q] > mx) mx = mags[base + q];
      if (mx <= 0) continue;
      const v = out.subarray(f * 12, f * 12 + 12);
      for (let q = 0; q < width; q++) {
        const m = mags[base + q];
        if (m < mx * 0.02) continue;
        v[pcOf[q]] += Math.log(1 + 40 * m / mx) * wOf[q];
      }
      let n2 = 0; for (let c = 0; c < 12; c++) n2 += v[c] * v[c];
      n2 = Math.sqrt(n2) || 1;
      for (let c = 0; c < 12; c++) v[c] /= n2;
    }
    return out;
  }

  function scoreTemplate(score, hopSec, range) {
    // nominal timeline (default tempi), optionally only measures m1..m2
    const evs = range ? score.events.filter(e => e.m >= range.m1 && e.m <= range.m2) : score.events;
    let t = 0;
    const starts = new Float64Array(evs.length);
    evs.forEach((e, i) => { starts[i] = t; t += e.d * e.secPerTick; });
    const total = t;
    const J = Math.max(1, Math.round(total / hopSec));
    const chroma = new Float32Array(J * 12);
    const evAt = new Int32Array(J);
    let k = 0;
    for (let j = 0; j < J; j++) {
      const time = (j + 0.5) * hopSec;
      while (k + 1 < evs.length && starts[k + 1] <= time) k++;
      evAt[j] = k;
      const e = evs[k];
      const v = chroma.subarray(j * 12, j * 12 + 12);
      if (e.rest) { for (let c = 0; c < 12; c++) v[c] = 0.28; }
      else {
        const pc = e.midi % 12;
        v[pc] = 1; v[(pc + 7) % 12] += 0.3; v[(pc + 4) % 12] += 0.14;
        if (e.chord) for (const cn of e.chord.notes) v[cn.midi % 12] += 0.5;
      }
      let n2 = 0; for (let c = 0; c < 12; c++) n2 += v[c] * v[c];
      n2 = Math.sqrt(n2);
      for (let c = 0; c < 12; c++) v[c] /= n2;
    }
    return { J, chroma, evAt, starts, total, evs };
  }

  /** Global key correlation to decide the transposition (A=415 → −1 etc.). */
  function bestTranspose(F, tpl) {
    const prof = new Float64Array(12);
    const c0 = chromaFrom(F, 0);
    for (let f = 0; f < F.frames; f++) for (let c = 0; c < 12; c++) prof[c] += c0[f * 12 + c] * F.energy[f];
    const sp = new Float64Array(12);
    for (let j = 0; j < tpl.J; j++) for (let c = 0; c < 12; c++) sp[c] += tpl.chroma[j * 12 + c];
    let best = -Infinity, bt = 0;
    for (const t of [0, -1, 1, -2]) {
      let s = 0;
      for (let c = 0; c < 12; c++) s += prof[(c + t + 12) % 12] * sp[c];
      if (s > best) { best = s; bt = t; }
    }
    return bt;
  }

  /** Subsequence DTW: template (score) must be fully matched, audio start/end free. */
  async function dtw(A, I, T, J, onProgress) {
    const STEP_PEN = 0.12;
    const back = new Uint8Array(I * J);
    let prev = new Float64Array(J).fill(Infinity), cur = new Float64Array(J);
    let last = performance.now();
    let bestEnd = Infinity, endI = -1;
    for (let i = 0; i < I; i++) {
      const ai = i * 12;
      for (let j = 0; j < J; j++) {
        let dot = 0;
        const tj = j * 12;
        for (let c = 0; c < 12; c++) dot += A[ai + c] * T[tj + c];
        const cost = 1 - dot;
        let best, bp;
        if (j === 0) { best = 0; bp = 3; }                     // free start in audio
        else {
          best = i > 0 ? prev[j - 1] : Infinity; bp = 0;     // diagonal
          if (i > 0 && prev[j] + STEP_PEN < best) { best = prev[j] + STEP_PEN; bp = 1; }   // audio advances, score waits
          if (cur[j - 1] + STEP_PEN < best) { best = cur[j - 1] + STEP_PEN; bp = 2; }      // score advances, audio waits
        }
        cur[j] = best + cost;
        back[i * J + j] = bp;
      }
      if (cur[J - 1] < bestEnd) { bestEnd = cur[J - 1]; endI = i; }
      const t = prev; prev = cur; cur = t;
      if (onProgress && performance.now() - last > 40) { onProgress(i / I); await yieldUI(); last = performance.now(); }
    }
    // backtrack
    const firstI = new Int32Array(J).fill(-1);
    let i = endI, j = J - 1;
    while (j >= 0 && i >= 0) {
      firstI[j] = i;
      const bp = back[i * J + j];
      if (bp === 3) break;
      if (bp === 0) { i--; j--; }
      else if (bp === 1) i--;
      else j--;
    }
    for (let q = 1; q < J; q++) if (firstI[q] < 0) firstI[q] = firstI[q - 1];
    return { firstI, cost: bestEnd / J };
  }

  /** Restricted YIN around an expected f0: returns cents offset or null. */
  function pitchNear(samples, sr, t0, t1, f0) {
    const a = Math.floor(t0 * sr), b = Math.floor(t1 * sr);
    const P = sr / f0;
    const tauHi = Math.ceil(P * Math.pow(2, 60 / 1200)) + 1;
    const W = Math.min(2048, b - a - tauHi - 2);
    if (W < 256) return null;
    const res = [];
    for (let o = a; o + W + tauHi < b; o += Math.max(256, W >> 1)) {
      let run = 0, bestV = Infinity, bestT = -1;
      const d = new Float64Array(tauHi + 2), dn = new Float64Array(tauHi + 2);
      for (let t = 1; t <= tauHi + 1; t++) {
        let s = 0;
        for (let q = 0; q < W; q++) { const v = samples[o + q] - samples[o + q + t]; s += v * v; }
        d[t] = s; run += s; dn[t] = run > 0 ? s * t / run : 1;
      }
      const lo = Math.floor(P * Math.pow(2, -60 / 1200));
      for (let t = Math.max(2, lo); t <= tauHi; t++) if (dn[t] < bestV) { bestV = dn[t]; bestT = t; }
      if (bestT < 2 || bestV > 0.45) continue;
      const den = d[bestT - 1] - 2 * d[bestT] + d[bestT + 1];
      const sh = den > 0 ? 0.5 * (d[bestT - 1] - d[bestT + 1]) / den : 0;
      const f = sr / (bestT + Math.max(-1, Math.min(1, sh)));
      res.push(1200 * Math.log2(f / f0));
    }
    if (!res.length) return null;
    res.sort((x, y) => x - y);
    return res[res.length >> 1];
  }

  /**
   * Align a decoded recording to the whole movement.
   * @returns {Promise<{a4, transpose, tuneCents, onsets: Float32Array (per event, s), cost, notes: Map ni->cents}>}
   */
  async function alignRecording(samples, sr, score, onProgress = () => {}, range = null) {
    const F = await features(samples, sr, p => onProgress(p * 0.45));
    const tpl = scoreTemplate(score, F.hopSec, range);
    const transpose = bestTranspose(F, tpl);
    const A = chromaFrom(F, transpose);
    onProgress(0.48);
    await yieldUI();
    const { firstI, cost } = await dtw(A, F.frames, tpl.chroma, tpl.J, p => onProgress(0.48 + p * 0.42));
    const a4 = 440 * Math.pow(2, (F.tuneCents + 100 * transpose) / 1200);
    // event onsets in seconds (null outside the aligned range)
    const onsets = new Array(score.events.length).fill(null);
    tpl.evs.forEach((e, k) => {
      const j = Math.min(tpl.J - 1, Math.max(0, Math.round(tpl.starts[k] / F.hopSec)));
      onsets[e.ei] = firstI[j] * F.hopSec + F.N / 2 / sr - F.hopSec / 2;
    });
    // per-note intonation where the soloist is clear (notes long enough)
    const notes = {};
    let last = performance.now();
    for (let k = 0; k < score.events.length; k++) {
      const e = score.events[k];
      if (e.rest || onsets[k] == null) continue;
      const t0 = onsets[k], t1 = k + 1 < onsets.length && onsets[k + 1] != null ? onsets[k + 1] : t0 + e.d * e.secPerTick;
      const dur = t1 - t0;
      if (dur < 0.12) continue;
      const f0 = a4 * Math.pow(2, (e.midi - 69) / 12);
      const c = pitchNear(samples, sr, t0 + dur * 0.25, t1 - dur * 0.2, f0);
      if (c != null && Math.abs(c) < 45) notes[e.ni] = Math.round(c * 10) / 10;
      if (performance.now() - last > 40) { onProgress(0.9 + 0.1 * k / score.events.length); await yieldUI(); last = performance.now(); }
    }
    onProgress(1);
    return { a4, transpose, tuneCents: F.tuneCents, onsets, cost, notes, partial: range ? { m1: range.m1, m2: range.m2 } : null };
  }

  /** Nominal duration (s) of measures m1..m2 at the default tempi. */
  function nominalDuration(score, m1 = 1, m2 = score.measureCount) {
    let t = 0;
    for (let m = m1; m <= m2; m++) for (const e of score.measures[m - 1].events) t += e.d * e.secPerTick;
    return t;
  }

  // ------------------------------------------------------------------ timing helpers
  /** Start time (s, in the reference's own timeline) of a measure. */
  function measureTime(ref, score, m) {
    if (ref.onsets && ref.onsets.length) {
      const e = score.measures[Math.min(score.measureCount, Math.max(1, m)) - 1].events[0];
      return applyAnchors(ref, score, m, ref.onsets[e.ei]);
    }
    return anchorOnly(ref, score, m);
  }
  function measureEnd(ref, score, m) {
    if (m < score.measureCount) {
      const nx = measureTime(ref, score, m + 1);
      if (nx != null && isFinite(nx)) return nx;
    }
    // last measure of the recording (end of a partial reference or of the movement):
    // last known onset + its nominal length, scaled by the local tempo of the recording
    if (!ref.onsets) {
      const st = anchorOnly(ref, score, m);
      return st == null ? null : st + score.measures[m - 1].events.reduce((a, x) => a + x.d * x.secPerTick, 0) * (ref.tempoRatio || 1);
    }
    const evs = score.measures[m - 1].events;
    let first = null, last = null;
    for (const e of evs) if (ref.onsets[e.ei] != null) { if (first == null) first = e; last = e; }
    if (!last) return null;
    let ratio = ref.tempoRatio || 1;
    if (first !== last) {
      const nominal = (last.t - first.t) * last.secPerTick;
      const real = ref.onsets[last.ei] - ref.onsets[first.ei];
      if (nominal > 0 && real > 0) ratio = real / nominal;
    }
    return applyAnchors(ref, score, m, ref.onsets[last.ei]) + last.d * last.secPerTick * ratio + 0.2;
  }
  function applyAnchors(ref, score, m, t) {
    if (t == null) return null;
    const an = (ref.anchors || []).filter(a => a.time != null && ref.onsets[score.measures[a.m - 1].events[0].ei] != null).sort((a, b) => a.m - b.m);
    if (!an.length) return t;
    // shift by the correction of the nearest anchors (linear between them)
    const corr = an.map(a => ({ m: a.m, d: a.time - ref.onsets[score.measures[a.m - 1].events[0].ei] }));
    if (m <= corr[0].m) return t + corr[0].d;
    if (m >= corr[corr.length - 1].m) return t + corr[corr.length - 1].d;
    for (let i = 0; i + 1 < corr.length; i++) {
      if (m >= corr[i].m && m <= corr[i + 1].m) {
        const f = (m - corr[i].m) / (corr[i + 1].m - corr[i].m);
        return t + corr[i].d + f * (corr[i + 1].d - corr[i].d);
      }
    }
    return t;
  }
  function nominalStart(score, m) {
    let t = 0;
    for (let q = 1; q < m; q++) for (const e of score.measures[q - 1].events) t += e.d * e.secPerTick;
    return t;
  }
  /** Link-only references: interpolate between user anchors (m → seconds). */
  function anchorOnly(ref, score, m) {
    const an = (ref.anchors || []).filter(a => a.time != null).sort((a, b) => a.m - b.m);
    if (!an.length) return null;
    const ratio = ref.tempoRatio || 1;
    if (an.length === 1) return an[0].time + (nominalStart(score, m) - nominalStart(score, an[0].m)) * ratio;
    let i = 0;
    while (i + 2 < an.length && m > an[i + 1].m) i++;
    const a = an[i], b = an[i + 1];
    const na = nominalStart(score, a.m), nb = nominalStart(score, b.m);
    const r = nb > na ? (b.time - a.time) / (nb - na) : ratio;
    return a.time + (nominalStart(score, m) - na) * r;
  }

  function youtubeId(url) {
    if (!url) return null;
    const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function youtubeLink(ref, seconds) {
    const id = youtubeId(ref.url);
    if (!id) return null;
    const t = Math.max(0, Math.floor((seconds || 0) + (ref.kind === 'audio' ? (ref.ytOffset || 0) : 0)));
    return `https://www.youtube.com/watch?v=${id}&t=${t}s`;
  }

  /** Encode mono float samples as a 16-bit WAV blob. */
  function wavBlob(samples, sr) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ------------------------------------------------------------------ player
  const Player = {
    el: null, url: null, refId: null, stopAt: null, raf: 0, onTime: null, onEnd: null, loop: null,
    load(ref) {
      if (this.refId === ref.id && this.el) return this.el;
      this.stop();
      if (this.url) URL.revokeObjectURL(this.url);
      this.el = this.el || new Audio();
      this.el.preload = 'auto';
      this.url = URL.createObjectURL(ref.audio);
      this.el.src = this.url;
      this.refId = ref.id;
      return this.el;
    },
    async play(ref, from, to, { rate = 1, loop = false, onTime, onEnd } = {}) {
      const el = this.load(ref);
      this.stop(true);
      el.playbackRate = rate;
      if ('preservesPitch' in el) el.preservesPitch = true;
      else if ('mozPreservesPitch' in el) el.mozPreservesPitch = true;
      else if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
      this.stopAt = to; this.onTime = onTime; this.onEnd = onEnd; this.loop = loop ? { from, to } : null;
      el.currentTime = Math.max(0, from);
      await el.play();
      if (IT.Audio) IT.Audio.muteUntil = Infinity;
      const tick = () => {
        if (!this.el || this.el.paused) return;
        const t = this.el.currentTime;
        if (this.onTime) this.onTime(t);
        if (this.stopAt != null && t >= this.stopAt) {
          if (this.loop) { this.el.currentTime = this.loop.from; }
          else { this.stop(); return; }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    },
    stop(silent) {
      cancelAnimationFrame(this.raf);
      if (this.el && !this.el.paused) this.el.pause();
      if (IT.Audio) IT.Audio.muteUntil = 0;
      const cb = this.onEnd; this.onEnd = null;
      if (!silent && cb) cb();
    },
    playing() { return !!(this.el && !this.el.paused); },
  };

  IT.Reference = {
    Store, Takes, Player,
    alignRecording, features, measureTime, measureEnd, nominalStart, nominalDuration,
    youtubeId, youtubeLink, wavBlob, compactWav, resample, blobToBase64, base64ToBlob, pitchNear,
    newId() { return 'ref-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  };
})();
