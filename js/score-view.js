/* Inverno-Trainer · score-view.js
 * Renders the solo part with VexFlow, one SVG per system, lazily as systems scroll
 * into view. Below every staff a "Griffspur" (fingering lane) shows string + finger
 * for each note. Supports measure-range selection (click / shift-click / drag),
 * highlighting the current practice note, result colouring and a moving playhead.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  const DUR_W = { '4.': 46, '4': 40, '8': 30, '16': 23, '32': 17.5 };
  const KEY_ALTER = { b: -1, e: -1, a: -1, d: -1 };   // F minor: four flats
  const LEFT = 8, RIGHT = 8;
  const FIRST_EXTRA = 78, TIMESIG_EXTRA = 22;
  const LANE_GAP = 14, LANE_SP = 9, LANE_BOTTOM = 22;
  const STRING_NAMES = ['G', 'D', 'A', 'E'];

  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(SVGNS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function staffLine(step, oct) { return (('cdefgab'.indexOf(step) + 7 * oct) - 30) / 2 + 1; }
  function vfKey(n) { return n.step + (n.alter === -1 ? 'b' : n.alter === 1 ? '#' : n.alter === -2 ? 'bb' : n.alter === 2 ? '##' : '') + '/' + n.oct; }
  function vfDur(ev) { return ev.dur.replace('.', 'd'); }
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  class ScoreView {
    constructor(container, score, opts = {}) {
      this.el = container;
      this.score = score;
      this.opts = Object.assign({ showLane: true }, opts);
      this.fingering = [];
      this.handlers = {};
      this.systems = [];
      this.noteInfo = new Map();
      this.eventX = new Map();
      this.current = new Set();
      this.selection = null;
      this.states = new Map();
      this.playheadTick = null;
      this.width = 0;
      this.scale = 1;
      this._io = null;
      this._dragging = null;
      this.el.classList.add('score-view');
      this._bindPointer();
      this._ro = new ResizeObserver(() => this._maybeRelayout());
      this._ro.observe(this.el);
    }

    on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
    emit(evt, data) { for (const fn of this.handlers[evt] || []) fn(data); }

    setFingering(fg) { this.fingering = fg; this.rerender(); }
    setShowLane(on) { this.opts.showLane = on; this.layout(true); }

    // ------------------------------------------------------------ layout
    _maybeRelayout() {
      const w = Math.floor(this.el.clientWidth);
      if (!w || Math.abs(w - this.width) < 2) return;
      clearTimeout(this._relayoutTimer);
      this._relayoutTimer = setTimeout(() => this.layout(), this.width ? 160 : 0);
    }

    measureWidth(meas) {
      let w = 14;
      const seen = {};
      for (const e of meas.events) {
        w += DUR_W[e.dur] || 26;
        if (!e.rest) {
          const def = KEY_ALTER[e.step] || 0;
          const key = e.step + e.oct;
          const shown = key in seen ? seen[key] : def;
          if (e.alter !== shown || e.acc) { w += 9; seen[key] = e.alter; }
        }
      }
      if (meas.events.some(e => e.tup)) w += 8;
      return w;
    }

    layout(force) {
      const cw = Math.floor(this.el.clientWidth);
      if (!cw) return;
      if (!force && cw === this.width && this.systems.length) return;
      this.width = cw;
      this.scale = cw < 520 ? 0.8 : cw < 760 ? 0.9 : 1;
      const avail = cw / this.scale - LEFT - RIGHT;
      const sc = this.score;
      const minW = sc.measures.map(m => this.measureWidth(m));
      const systems = [];
      let cur = null;
      for (let i = 0; i < sc.measures.length; i++) {
        const extra = (cur ? 0 : FIRST_EXTRA) + (i === 0 ? TIMESIG_EXTRA : 0);
        if (cur && cur.sum + minW[i] > avail - cur.extra) { systems.push(cur); cur = null; }
        if (!cur) cur = { measures: [], sum: 0, extra: FIRST_EXTRA + (i === 0 ? TIMESIG_EXTRA : 0) };
        cur.measures.push(i + 1);
        cur.sum += minW[i];
        void extra;
      }
      if (cur) systems.push(cur);
      // widths + vertical metrics
      for (const s of systems) {
        const room = avail - s.extra;
        let factor = room / s.sum;
        const isLast = s === systems[systems.length - 1];
        if (isLast && factor > 1.35) factor = 1.35;
        s.widths = s.measures.map((m, k) => minW[m - 1] * factor + (k === 0 ? s.extra : 0));
        let lo = 1, hi = 5;
        for (const m of s.measures) for (const n of sc.measures[m - 1].notes) {
          const l = staffLine(n.step, n.oct);
          lo = Math.min(lo, l); hi = Math.max(hi, l);
          if (n.chord) for (const c of n.chord.notes) lo = Math.min(lo, staffLine(c.step, c.oct));
        }
        const hasAbove = s.measures.some(m => sc.measures[m - 1].events.some(e => (e.tx || []).some(t => t.place === 'above')) || sc.marks.some(mk => mk.measure === m));
        s.above = Math.max(4.5, hi - 5 + 3.4) + (hasAbove ? 1.4 : 0);
        s.below = Math.max(3.6, 1 - lo + 3.2);
        s.staffH = (s.above + 4 + s.below) * 10;
        s.laneTop = s.staffH + LANE_GAP;
        s.height = this.opts.showLane ? s.laneTop + 3 * LANE_SP + LANE_BOTTOM : s.staffH + 6;
      }
      this.systems = systems;
      this._buildDom();
    }

    _buildDom() {
      if (this._io) this._io.disconnect();
      this.el.textContent = '';
      this.noteInfo.clear();
      this.eventX.clear();
      const frag = document.createDocumentFragment();
      this.systems.forEach((s, idx) => {
        const box = document.createElement('div');
        box.className = 'sys';
        box.dataset.sys = idx;
        box.style.height = Math.ceil(s.height * this.scale) + 'px';
        const head = s.measures[0];
        box.setAttribute('aria-label', (window.IT && window.IT.i18n ? window.IT.i18n.t : (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m)))('Takte {a}–{b}', { a: head, b: s.measures[s.measures.length - 1] }));
        s.el = box;
        s.rendered = false;
        frag.appendChild(box);
      });
      this.el.appendChild(frag);
      this._io = new IntersectionObserver(entries => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const s = this.systems[+en.target.dataset.sys];
          if (s && !s.rendered) this._renderSystem(s);
        }
      }, { root: this.opts.scrollRoot || null, rootMargin: '900px 0px' });
      for (const s of this.systems) this._io.observe(s.el);
      this.emit('layout', { systems: this.systems.length });
    }

    rerender() {
      for (const s of this.systems) {
        if (s.rendered) this._renderSystem(s);
      }
    }

    // ------------------------------------------------------------ rendering
    _renderSystem(s) {
      const VF = window.Vex && window.Vex.Flow;
      if (!VF) return;
      const sc = this.score;
      const ink = cssVar('--ink', '#142028');
      const soft = cssVar('--staff', '#7d8a94');
      s.el.textContent = '';
      const host = document.createElement('div');
      host.className = 'sys-svg';
      s.el.appendChild(host);
      const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
      const W = this.width, H = Math.ceil(s.height * this.scale);
      renderer.resize(W, H);
      const ctx = renderer.getContext();
      ctx.scale(this.scale, this.scale);
      ctx.setFillStyle(ink);
      ctx.setStrokeStyle(ink);
      const svg = ctx.svg;
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', (window.IT && window.IT.i18n ? window.IT.i18n.t : (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m)))('Notensystem, Takte {a} bis {b}', { a: s.measures[0], b: s.measures[s.measures.length - 1] }));
      const under = svgEl('g', { class: 'under' }, svg);   // selection / cursor layer
      s.under = under;
      s.measureBoxes = [];
      s.items = [];
      s.svg = svg;

      let x = LEFT;
      const slurOpen = [];
      const slurPairs = [];
      for (let k = 0; k < s.measures.length; k++) {
        const mNo = s.measures[k];
        const meas = sc.measures[mNo - 1];
        const w = s.widths[k];
        const stave = new VF.Stave(x, 0, w, {
          fill_style: soft,
          space_above_staff_ln: s.above,
          space_below_staff_ln: s.below,
        });
        if (k === 0) {
          stave.addClef('treble').addKeySignature(sc.raw.key.vex);
          if (mNo === 1) stave.addTimeSignature('3/8');
        } else {
          stave.setBegBarType(VF.Barline.type.NONE);
        }
        if (mNo === sc.measureCount) stave.setEndBarType(VF.Barline.type.END);
        else if (mNo === 100 || mNo === 119) stave.setEndBarType(VF.Barline.type.DOUBLE);
        stave.setContext(ctx).draw();

        const topY = stave.getYForLine(0), botY = stave.getYForLine(4);
        const noteX0 = stave.getNoteStartX();
        const box = svgEl('rect', { class: 'sel-rect', x: k === 0 ? noteX0 - 6 : x, y: topY - 26, width: (x + w) - (k === 0 ? noteX0 - 6 : x), height: (s.height - topY + 18) }, under);
        s.measureBoxes.push({ m: mNo, x0: k === 0 ? noteX0 - 6 : x, x1: x + w, rect: box });

        // measure number (first of system, and every rehearsal letter)
        if (k === 0 && mNo > 1) svgEl('text', { class: 'mnum', x: x + 2, y: topY - 12 }, svg).textContent = mNo;
        const mark = sc.marks.find(mk => mk.measure === mNo);
        if (mark) {
          const mx = k === 0 ? noteX0 - 2 : x + 4, my = topY - (s.above - 1.4) * 10 + 4;
          svgEl('rect', { class: 'rmark-box', x: mx, y: my, width: 20, height: 20, rx: 2 }, svg);
          svgEl('text', { class: 'rmark', x: mx + 10, y: my + 15, 'text-anchor': 'middle' }, svg).textContent = mark.label;
        }
        const tempo = sc.tempi.find(t => t.from === mNo);
        if (tempo) {
          const tx = (k === 0 ? noteX0 : x + 6) + (mark ? 28 : 0);
          svgEl('text', { class: 'tempo', x: tx, y: topY - (s.above - 1.4) * 10 + 18 }, svg).textContent = mNo === 120 ? 'a tempo' : tempo.label;
        }

        // ------------- notes
        const items = meas.events.map(ev => {
          let vn;
          if (ev.rest) {
            vn = new VF.StaveNote({ keys: ['b/4'], duration: vfDur(ev) + 'r' });
          } else {
            const opt = { keys: [vfKey(ev)], duration: vfDur(ev), auto_stem: true };
            if (meas.events.some(e => e.chord)) { delete opt.auto_stem; opt.stem_direction = 1; }
            vn = new VF.StaveNote(opt);
          }
          if (ev.dur.endsWith('.')) VF.Dot.buildAndAttach([vn], { all: true });
          return { ev, vn };
        });
        // tuplets (groups of three triplet sixteenths)
        const tuplets = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].ev.tup && i + 2 < items.length) {
            tuplets.push(new VF.Tuplet(items.slice(i, i + 3).map(it => it.vn), { num_notes: 3, notes_occupied: 2, ratioed: false, bracketed: false }));
            i += 2;
          }
        }
        const voices = [];
        const v1 = new VF.Voice({ num_beats: 3, beat_value: 8 }).setMode(VF.Voice.Mode.SOFT);
        v1.addTickables(items.map(it => it.vn));
        voices.push(v1);
        const chordHost = items.find(it => it.ev.chord);
        let chordNote = null;
        if (chordHost) {
          const ch = chordHost.ev.chord;
          chordNote = new VF.StaveNote({ keys: ch.notes.map(vfKey), duration: ch.dur.replace('.', 'd'), stem_direction: -1 });
          const restTicks = sc.measureTicks - ch.d;
          const ghost = new VF.GhostNote({ duration: restTicks === 480 ? '4' : '8' });
          const v2 = new VF.Voice({ num_beats: 3, beat_value: 8 }).setMode(VF.Voice.Mode.SOFT);
          v2.addTickables([chordNote, ghost]);
          voices.push(v2);
        }
        VF.Accidental.applyAccidentals(voices, sc.raw.key.vex);
        // reminder / cautionary accidentals written in the source (e!, b?)
        for (const it of items) {
          if (it.ev.rest || !it.ev.acc) continue;
          const has = it.vn.getModifiers().some(md => md.getCategory && md.getCategory() === 'Accidental');
          if (has) continue;
          const t = it.ev.alter === -1 ? 'b' : it.ev.alter === 1 ? '#' : 'n';
          const acc = new VF.Accidental(t);
          if (it.ev.acc === '?') acc.setAsCautionary();
          it.vn.addModifier(acc, 0);
        }
        if (chordNote) {
          chordHost.ev.chord.notes.forEach((cn, idx) => {
            if (cn.acc === '?' && !chordNote.getModifiers().some(md => md.getCategory && md.getCategory() === 'Accidental' && md.getIndex() === idx)) {
              chordNote.addModifier(new VF.Accidental(cn.alter === -1 ? 'b' : 'n').setAsCautionary(), idx);
            }
          });
        }
        // beams
        const beams = this._beams(VF, items, sc, !!chordHost);
        // articulations (after beaming: stem direction known)
        for (const it of items) {
          const a = it.ev.art;
          if (!a && !it.ev.ferm) continue;
          const up = it.vn.getStemDirection() === 1;
          const pos = up ? VF.Modifier.Position.BELOW : VF.Modifier.Position.ABOVE;
          for (const name of a || []) {
            const code = name === 'staccato' ? 'a.' : name === 'wedge' ? 'av' : name === 'accent' ? 'a>' : name === 'tenuto' ? 'a-' : null;
            if (code) it.vn.addModifier(new VF.Articulation(code).setPosition(pos), 0);
          }
          if (it.ev.ferm) it.vn.addModifier(new VF.Articulation('a@a').setPosition(VF.Modifier.Position.ABOVE), 0);
        }
        new VF.Formatter().joinVoices(voices).formatToStave(voices, stave);
        for (const v of voices) v.draw(ctx, stave);
        for (const b of beams) b.setContext(ctx).draw();
        for (const t of tuplets) t.setContext(ctx).draw();

        // texts from the source (Solo / Tutti / programme)
        for (const it of items) {
          for (const tx of it.ev.tx || []) {
            const nx = it.vn.getAbsoluteX();
            if (tx.place === 'below') {
              svgEl('text', { class: 'cue', x: nx, y: botY + Math.min(24, (s.below - 0.6) * 10) }, svg).textContent = tx.text.replace(' - ', ' · ');
            } else {
              svgEl('text', { class: 'prog', x: nx + (mark ? 26 : 0) + (tempo ? 60 : 0), y: topY - (s.above - 1.4) * 10 + 15 }, svg).textContent = tx.text;
            }
          }
        }

        // remember positions
        for (const it of items) {
          const ev = it.ev;
          let cx;
          if (ev.rest) cx = it.vn.getAbsoluteX() + 5;
          else cx = (it.vn.getNoteHeadBeginX() + it.vn.getNoteHeadEndX()) / 2;
          this.eventX.set(ev.ei, { sys: s, x: cx, t: ev.t, d: ev.d });
          if (!ev.rest) {
            const ys = it.vn.getYs();
            const info = { sys: s, x: cx, y: ys[0], vn: it.vn, ev, g: it.vn.getSVGElement(), lane: null, label: null };
            this.noteInfo.set(ev.ni, info);
            s.items.push(info);
            if (ev.sl) slurOpen.push(it.vn);
            if (ev.se) slurPairs.push([slurOpen.length ? slurOpen.pop() : null, it.vn]);
          }
        }
        x += w;
      }
      // slurs (those open at the system end continue on the next system)
      for (const from of slurOpen) slurPairs.push([from, null]);
      for (const [from, to] of slurPairs) {
        try {
          const a = from || to, b = to || from;
          const dx = Math.abs(b.getAbsoluteX() - a.getAbsoluteX());
          const h = Math.min(16, 7 + dx * 0.04);
          new VF.Curve(from, to, { cps: [{ x: 0, y: h }, { x: 0, y: h }] }).setContext(ctx).draw();
        } catch (e) { /* a slur that cannot be placed is not essential */ }
      }

      // fingering lane
      if (this.opts.showLane) this._drawLane(s, svg);
      s.cursor = svgEl('rect', { class: 'cur-rect', x: -50, y: 2, width: 18, height: s.height - 6, rx: 4 }, under);
      s.phead = svgEl('line', { class: 'playhead', x1: -10, x2: -10, y1: 4, y2: s.height - 4 }, svg);
      s.rendered = true;
      this._applyAll(s);
    }

    _beams(VF, items, sc, keepStems) {
      const groups = [];
      const explicit = items.some(it => it.ev.bs);
      const beamable = it => !it.ev.rest && ['8', '16', '32'].includes(it.ev.dur);
      if (explicit) {
        let g = null;
        for (const it of items) {
          if (it.ev.bs) g = [];
          if (g) g.push(it);
          if (it.ev.be && g) { groups.push(g); g = null; }
        }
      } else {
        const has32 = items.some(it => it.ev.dur === '32');
        const win = has32 ? sc.ticksPerEighth : sc.measureTicks;
        let g = [], winIdx = null;
        for (const it of items) {
          const w = Math.floor((it.ev.t % sc.measureTicks) / win);
          if (!beamable(it) || (winIdx !== null && w !== winIdx)) {
            if (g.length > 1) groups.push(g);
            g = [];
          }
          if (beamable(it)) { g.push(it); winIdx = w; }
        }
        if (g.length > 1) groups.push(g);
      }
      return groups.filter(g => g.length > 1).map(g => new VF.Beam(g.map(it => it.vn), !keepStems));
    }

    _drawLane(s, svg) {
      const top = s.laneTop;
      const lane = svgEl('g', { class: 'lane' }, svg);
      s.lane = lane;
      const x0 = LEFT, x1 = LEFT + s.widths.reduce((a, b) => a + b, 0);
      for (let i = 0; i < 4; i++) {
        const y = top + i * LANE_SP;               // E on top, G at the bottom (like the board view)
        svgEl('line', { class: 'lane-line', x1: x0 + 16, x2: x1, y1: y, y2: y }, lane);
        svgEl('text', { class: 'lane-name', x: x0 + 4, y: y + 3 }, lane).textContent = STRING_NAMES[3 - i];
      }
      let prevPos = null, prevS = null;
      for (const info of s.items) {
        const fg = this.fingering[info.ev.ni];
        if (!fg) continue;
        const y = top + (3 - fg.s) * LANE_SP;
        const own = this.opts.overrides && this.opts.overrides[info.ev.ni];
        const tch = !own && this.opts.teacher && this.opts.teacher[info.ev.ni];
        const g = svgEl('g', { class: 'fing' + (fg.f === 0 ? ' open' : '') + (own ? ' ovr' : '') + (tch ? ' tch' : ''), 'data-ni': info.ev.ni }, lane);
        svgEl('circle', { cx: info.x, cy: y, r: 5.6 }, g);
        svgEl('text', { x: info.x, y: y + 3.3, 'text-anchor': 'middle' }, g).textContent = fg.f;
        info.lane = g;
        if (fg.f > 0 && fg.p !== prevPos) {
          svgEl('text', { class: 'lane-pos', x: info.x, y: top - 6, 'text-anchor': 'middle' }, lane).textContent = fg.p + '.';
          prevPos = fg.p;
        }
        prevS = fg.s;
      }
      void prevS;
    }

    // ------------------------------------------------------------ state
    _applyAll(s) {
      for (const info of s.items) this._applyNote(info);
      this._applySelection(s);
      this._applyCursor(s);
      if (this.playheadTick != null) this.setPlayhead(this.playheadTick);
    }

    _applyNote(info) {
      const ni = info.ev.ni;
      const st = this.states.get(ni);
      const isCur = this.current.has(ni);
      const cls = (base) => {
        if (!base) return;
        base.classList.toggle('is-cur', isCur);
        for (const c of ['good', 'warn', 'bad', 'miss']) base.classList.toggle('st-' + c, !!st && st.state === c);
      };
      cls(info.g);
      cls(info.lane);
      if (info.label) { info.label.remove(); info.label = null; }
      if (st && st.label && info.sys.rendered) {
        const y = this.opts.showLane ? info.sys.laneTop + 3 * LANE_SP + 15 : info.sys.staffH - 2;
        info.label = svgEl('text', { class: 'res-label st-' + st.state, x: info.x, y, 'text-anchor': 'middle' }, info.sys.svg);
        info.label.textContent = st.label;
      }
    }

    _applySelection(s) {
      for (const mb of s.measureBoxes || []) {
        const on = !!this.selection && mb.m >= this.selection.m1 && mb.m <= this.selection.m2;
        mb.rect.classList.toggle('on', on);
        mb.rect.classList.toggle('first', on && mb.m === this.selection.m1);
        mb.rect.classList.toggle('last', on && mb.m === this.selection.m2);
      }
    }

    _applyCursor(s) {
      if (!s.cursor) return;
      const infos = s.items.filter(i => this.current.has(i.ev.ni));
      if (!infos.length) { s.cursor.setAttribute('x', -50); return; }
      const xa = Math.min(...infos.map(i => i.x)), xb = Math.max(...infos.map(i => i.x));
      s.cursor.setAttribute('x', xa - 9);
      s.cursor.setAttribute('width', xb - xa + 18);
    }

    /** Highlight the notes (array of note indices) of the current practice step. */
    setCurrent(nis, scroll = true) {
      const old = this.current;
      this.current = new Set(nis || []);
      const touched = new Set([...old, ...this.current]);
      const systems = new Set();
      for (const ni of touched) {
        const info = this.noteInfo.get(ni);
        if (info) { this._applyNote(info); systems.add(info.sys); }
      }
      for (const s of systems) this._applyCursor(s);
      if (scroll && nis && nis.length) this.scrollToNote(nis[0]);
    }

    setSelection(sel) {
      this.selection = sel ? { m1: Math.min(sel.m1, sel.m2), m2: Math.max(sel.m1, sel.m2) } : null;
      for (const s of this.systems) if (s.rendered) this._applySelection(s);
    }

    /** states: Map/obj ni -> {state:'good'|'warn'|'bad'|'miss', label} */
    setStates(states) {
      const prev = this.states;
      this.states = states instanceof Map ? states : new Map(Object.entries(states || {}).map(([k, v]) => [+k, v]));
      const touched = new Set([...prev.keys(), ...this.states.keys()]);
      for (const ni of touched) {
        const info = this.noteInfo.get(ni);
        if (info) this._applyNote(info);
      }
    }
    clearStates() { this.setStates(new Map()); }

    systemOfMeasure(m) { return this.systems.find(s => s.measures.includes(m)); }

    scrollToMeasure(m, smooth = true) {
      const s = this.systemOfMeasure(m);
      if (s) this._scrollTo(s.el, smooth);
    }
    scrollToNote(ni, smooth = true) {
      const n = this.score.notes[ni];
      if (!n) return;
      const s = this.systemOfMeasure(n.m);
      if (s) this._scrollTo(s.el, smooth);
    }
    _scrollTo(el, smooth) {
      const root = this.opts.scrollRoot;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (root) {
        const rr = root.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (er.top >= rr.top + 8 && er.bottom <= rr.bottom - 8) return;
        const target = root.scrollTop + (er.top - rr.top) - Math.max(12, (rr.height - er.height) * 0.3);
        root.scrollTo({ top: target, behavior: smooth && !reduce ? 'smooth' : 'auto' });
      } else {
        el.scrollIntoView({ block: 'center', behavior: smooth && !reduce ? 'smooth' : 'auto' });
      }
    }

    /** Moving playhead at a score tick (null hides it). */
    setPlayhead(tick) {
      this.playheadTick = tick;
      for (const s of this.systems) if (s.phead) s.phead.classList.remove('on');
      if (tick == null) return;
      const sc = this.score;
      const m = Math.min(sc.measureCount, Math.floor(tick / sc.measureTicks) + 1);
      const s = this.systemOfMeasure(m);
      if (!s || !s.rendered) return;
      // interpolate between event positions
      const evs = sc.measures[m - 1].events;
      let x = null;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        const p = this.eventX.get(e.ei);
        if (!p) continue;
        if (tick >= e.t && tick < e.t + e.d) {
          const nxt = i + 1 < evs.length ? this.eventX.get(evs[i + 1].ei) : null;
          const k = s.measures.indexOf(m);
          const endX = nxt ? nxt.x : s.measureBoxes[k].x1 - 4;
          x = p.x + (endX - p.x) * ((tick - e.t) / e.d);
          break;
        }
      }
      if (x == null) return;
      s.phead.setAttribute('x1', x);
      s.phead.setAttribute('x2', x);
      s.phead.classList.add('on');
    }

    // ------------------------------------------------------------ pointer
    _hit(evt) {
      const sysEl = evt.target.closest && evt.target.closest('.sys');
      if (!sysEl) return null;
      const s = this.systems[+sysEl.dataset.sys];
      if (!s || !s.rendered) return null;
      const r = sysEl.getBoundingClientRect();
      const x = (evt.clientX - r.left) / this.scale, y = (evt.clientY - r.top) / this.scale;
      const mb = s.measureBoxes.find(b => x >= b.x0 && x < b.x1) || null;
      let note = null, best = 14;
      for (const info of s.items) {
        const d = Math.abs(info.x - x);
        if (d < best) { best = d; note = info; }
      }
      return { s, x, y, m: mb ? mb.m : null, note };
    }

    _bindPointer() {
      this.el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const h = this._hit(e);
        if (!h || h.m == null) return;
        const inLane = this.opts.showLane && h.y > h.s.laneTop - 10;
        this._dragging = { start: h.m, last: h.m, moved: false, shift: e.shiftKey, note: h.note, inLane, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
      });
      this.el.addEventListener('pointermove', e => {
        const d = this._dragging;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
        if (!d.moved) { d.moved = true; try { this.el.setPointerCapture(d.pointerId); } catch (_) { /* ignore */ } }
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const h = target ? this._hit({ target, clientX: e.clientX, clientY: e.clientY }) : null;
        if (h && h.m != null && h.m !== d.last) {
          d.last = h.m;
          this.setSelection({ m1: d.start, m2: h.m });
          this.emit('selecting', this.selection);
        }
        e.preventDefault();
      });
      const end = e => {
        const d = this._dragging;
        this._dragging = null;
        if (!d) return;
        if (d.moved) { this.emit('select', this.selection); return; }
        if (d.inLane && d.note) { this.emit('noteclick', { ni: d.note.ev.ni, lane: true, event: e }); return; }
        if (d.shift && this.selection) {
          const a = Math.min(this.selection.m1, d.start), b = Math.max(this.selection.m2, d.start);
          this.setSelection({ m1: a, m2: b });
          this.emit('select', this.selection);
          return;
        }
        this.emit('measureclick', { m: d.start, note: d.note ? d.note.ev.ni : null, event: e });
      };
      this.el.addEventListener('pointerup', end);
      this.el.addEventListener('pointercancel', () => { this._dragging = null; });
    }

    destroy() {
      if (this._io) this._io.disconnect();
      this._ro.disconnect();
      this.el.textContent = '';
    }
  }

  IT.ScoreView = ScoreView;
})();
