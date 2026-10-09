/* Inverno-Trainer · chart.js
 * Pitch-over-time chart for an analysed passage: expected notes as bands at their
 * aligned positions, the played pitch as a line, measured intonation as dots.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  function css(name, fb) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; }

  class PitchChart {
    constructor(canvas, tip) {
      this.c = canvas;
      this.tip = tip;
      this.data = null;
      this.cursor = null;
      this.selected = null;
      this.onSelect = null;
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);
      canvas.addEventListener('pointermove', e => this._hover(e));
      canvas.addEventListener('pointerleave', () => { this.tip.hidden = true; });
      canvas.addEventListener('click', e => {
        const n = this._noteAt(e);
        if (n && this.onSelect) this.onSelect(n.ni);
      });
    }

    setData(result, score, names) {
      this.data = result ? { r: result, score, names } : null;
      this.selected = null;
      this.cursor = null;
      this.draw();
    }
    setCursor(t) { this.cursor = t; this.draw(); }
    select(ni) { this.selected = ni; this.draw(); }

    _geom() {
      const { r } = this.data;
      const notes = r.notes.filter(n => n.start != null);
      let t0 = notes.length ? notes[0].start : 0, t1 = notes.length ? notes[notes.length - 1].end : r.duration;
      t0 = Math.max(0, t0 - 0.25); t1 = Math.min(r.duration, t1 + 0.25);
      let lo = Infinity, hi = -Infinity;
      for (const n of r.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
      lo -= 1.6; hi += 1.6;
      const W = this.c.clientWidth, H = this.c.clientHeight;
      const padL = 34, padR = 8, padT = 8, padB = 18;
      const x = t => padL + (t - t0) / (t1 - t0 || 1) * (W - padL - padR);
      const y = m => padT + (hi - m) / (hi - lo) * (H - padT - padB);
      return { t0, t1, lo, hi, W, H, x, y, padL, padR, padT, padB };
    }

    draw() {
      const c = this.c, dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!this.data) return;
      const { r, score, names } = this.data;
      const G = this._geom();
      const ink = css('--ink', '#142028'), ink2 = css('--ink-2', '#4B5B67'), line = css('--line', '#CDD6DD');
      const accent = css('--accent', '#1F6E94');
      const col = { good: css('--good', '#2E7D4F'), warn: css('--warn', '#B7791F'), bad: css('--bad', '#C0392B'), wrong: css('--bad', '#C0392B'), miss: css('--miss', '#8A96A0') };
      g.font = '10px ' + css('--font-mono', 'monospace');
      // horizontal guides at every C and the extremes
      g.strokeStyle = line; g.fillStyle = ink2; g.lineWidth = 1;
      for (let m = Math.ceil(G.lo); m <= G.hi; m++) {
        if (m % 12 !== 0 && m % 12 !== 7) continue;
        const yy = Math.round(G.y(m)) + 0.5;
        g.beginPath(); g.moveTo(G.padL, yy); g.lineTo(G.W - G.padR, yy); g.stroke();
        g.fillText(IT.Music.midiName(m, names), 2, yy + 3);
      }
      // time axis ticks every second
      g.fillStyle = ink2;
      for (let t = Math.ceil(G.t0); t <= G.t1; t++) {
        const xx = G.x(t);
        g.fillRect(xx, G.H - G.padB, 1, 4);
        g.fillText(t + 's', xx + 2, G.H - 5);
      }
      // expected notes
      for (const n of r.notes) {
        if (n.start == null) continue;
        const xa = G.x(n.start), xb = G.x(n.end), yc = G.y(n.midi);
        const band = Math.abs(G.y(n.midi + 0.5) - G.y(n.midi));
        g.fillStyle = accent; g.globalAlpha = n.ni === this.selected ? 0.32 : 0.14;
        g.fillRect(xa, yc - band, Math.max(1.5, xb - xa - 1), band * 2);
        g.globalAlpha = 0.55; g.fillRect(xa, yc - 0.5, Math.max(1.5, xb - xa - 1), 1);
        g.globalAlpha = 1;
      }
      // played pitch curve
      const tr = r.track, p = r.series;
      g.strokeStyle = ink; g.lineWidth = 1.4; g.beginPath();
      let pen = false;
      for (let i = 0; i < p.length; i++) {
        const t = tr.t[i];
        if (t < G.t0 || t > G.t1 || p[i] !== p[i] || p[i] < G.lo || p[i] > G.hi) { pen = false; continue; }
        const xx = G.x(t), yy = G.y(p[i]);
        if (!pen) { g.moveTo(xx, yy); pen = true; } else g.lineTo(xx, yy);
      }
      g.stroke();
      // measured note dots
      for (const n of r.notes) {
        if (n.start == null) continue;
        const xm = G.x((n.start + n.end) / 2);
        const ym = n.played != null ? G.y(n.played) : G.y(n.midi);
        g.fillStyle = col[n.state] || ink2;
        g.beginPath(); g.arc(xm, ym, n.ni === this.selected ? 4.5 : 3, 0, Math.PI * 2); g.fill();
        if (n.state === 'miss') { g.strokeStyle = col.miss; g.beginPath(); g.arc(xm, ym, 4.5, 0, Math.PI * 2); g.stroke(); }
      }
      // cursor
      if (this.cursor != null && this.cursor >= G.t0 && this.cursor <= G.t1) {
        g.fillStyle = css('--varnish', '#9C4F1C');
        g.fillRect(G.x(this.cursor) - 1, G.padT, 2, G.H - G.padT - G.padB);
      }
      void score;
    }

    _noteAt(e) {
      if (!this.data) return null;
      const G = this._geom();
      const rect = this.c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let best = null, bd = 12;
      for (const n of this.data.r.notes) {
        if (n.start == null) continue;
        const xa = G.x(n.start), xb = G.x(n.end);
        const d = x < xa ? xa - x : x > xb ? x - xb : 0;
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    }

    _hover(e) {
      const n = this._noteAt(e);
      if (!n) { this.tip.hidden = true; return; }
      const { score, names } = this.data;
      const ev = score.notes[n.ni];
      const rect = this.c.getBoundingClientRect();
      const tr = (window.IT && window.IT.i18n ? window.IT.i18n.t : (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m)));
      const txt = n.state === 'miss' ? tr('nicht erkannt')
        : n.state === 'wrong' ? tr('falscher Ton: {n}', { n: IT.Music.midiName(n.played, names) })
        : `${n.cents > 0 ? '+' : ''}${Math.round(n.cents)} ct`;
      this.tip.textContent = `${tr('T. {m}', { m: ev.m })} · ${IT.Music.noteName(ev, names)} · ${txt}`;
      this.tip.style.left = (e.clientX - rect.left) + 'px';
      this.tip.style.top = (e.clientY - rect.top) + 'px';
      this.tip.hidden = false;
    }
  }

  IT.PitchChart = PitchChart;
})();
