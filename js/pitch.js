/* Inverno-Trainer · pitch.js
 * YIN fundamental-frequency estimator tuned for the violin (≈ 150 Hz … 3.4 kHz).
 * The cumulative-mean-normalised difference function is computed upward from
 * small lags and stops right after the first dip below the threshold, so high
 * notes are cheap and low notes cost at most one pass. Parabolic interpolation on
 * the raw difference function gives sub-sample precision (≈ 1–3 cents).
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  /**
   * @param {number} sampleRate
   * @param {object} [opts] { frameSize=2048, minFreq=150, maxFreq=3400, threshold=0.12 }
   */
  function createDetector(sampleRate, opts = {}) {
    const N = opts.frameSize || 2048;
    const minFreq = opts.minFreq || 150;
    const maxFreq = opts.maxFreq || 3400;
    const thr = opts.threshold || 0.12;

    const tauMax = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(N / 2) - 2);
    const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    const W = N - tauMax - 2;                          // integration window
    const d = new Float64Array(tauMax + 2);
    const dn = new Float64Array(tauMax + 2);
    const result = { freq: 0, conf: 0, rms: 0, voiced: false };

    function diffAt(x, o, tau) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[o + j] - x[o + j + tau]; s += v * v; }
      return s;
    }

    /** Analyse one frame starting at `offset` (frameSize samples). */
    function detect(x, offset = 0) {
      let e = 0;
      for (let i = 0; i < N; i++) { const v = x[offset + i]; e += v * v; }
      const rms = Math.sqrt(e / N);
      result.rms = rms; result.freq = 0; result.conf = 0; result.voiced = false;
      if (rms < 1e-5) return result;

      let running = 0, tau = -1, bestT = -1, bestV = Infinity;
      dn[0] = 1;
      for (let t = 1; t <= tauMax + 1; t++) {
        const s = diffAt(x, offset, t);
        d[t] = s;
        running += s;
        dn[t] = running > 0 ? s * t / running : 1;
        if (t < tauMin + 1 || t > tauMax) continue;
        if (dn[t] < bestV) { bestV = dn[t]; bestT = t; }
        // first dip under the threshold: walk to its local minimum, then stop
        if (tau < 0 && dn[t - 1] < thr && dn[t] >= dn[t - 1] && t - 1 >= tauMin) { tau = t - 1; break; }
      }
      if (tau < 0) {
        if (bestT < 0 || bestV > 0.38) return result;   // nothing periodic enough
        tau = bestT;
        if (tau + 1 > tauMax + 1) return result;
        if (d[tau + 1] === undefined) d[tau + 1] = diffAt(x, offset, tau + 1);
      }
      const conf = 1 - dn[tau];
      // parabolic interpolation on the raw difference function
      const a = d[tau - 1], b = d[tau], c = d[tau + 1] || diffAt(x, offset, tau + 1);
      const den = a - 2 * b + c;
      let shift = den > 0 ? 0.5 * (a - c) / den : 0;
      if (shift > 1) shift = 1; else if (shift < -1) shift = -1;
      const f = sampleRate / (tau + shift);
      if (f < minFreq * 0.97 || f > maxFreq * 1.03) return result;
      result.freq = f; result.conf = conf; result.voiced = true;
      return result;
    }

    return { detect, frameSize: N, sampleRate };
  }

  /**
   * Offline pitch track of a whole buffer (yields to the UI every ~30 ms).
   * @returns {Promise<{hop, hopSec, sr, t:Float32Array, f:Float32Array, conf:Float32Array, rms:Float32Array}>}
   */
  async function track(samples, sampleRate, opts = {}) {
    const hopSec = opts.hopSec || 0.008;
    const hop = Math.max(32, Math.round(sampleRate * hopSec));
    const det = createDetector(sampleRate, opts);
    const N = det.frameSize;
    const count = Math.max(0, Math.floor((samples.length - N) / hop) + 1);
    const t = new Float32Array(count), f = new Float32Array(count), conf = new Float32Array(count), rms = new Float32Array(count);
    const onProgress = opts.onProgress;
    let lastYield = (typeof performance !== 'undefined' ? performance : Date).now();
    for (let i = 0; i < count; i++) {
      const r = det.detect(samples, i * hop);
      t[i] = (i * hop + N / 2) / sampleRate;   // frame centre
      f[i] = r.voiced ? r.freq : 0;
      conf[i] = r.conf;
      rms[i] = r.rms;
      const now = performance.now();
      if (now - lastYield > 30) {
        if (onProgress) onProgress(i / count);
        await new Promise(res => setTimeout(res, 0));
        lastYield = performance.now();
      }
    }
    if (onProgress) onProgress(1);
    return { hop, sr: sampleRate, hopSec: hop / sampleRate, t, f, conf, rms };
  }

  IT.Pitch = { createDetector, track };
})();
