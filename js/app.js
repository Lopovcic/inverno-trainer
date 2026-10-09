/* Inverno-Trainer · app.js
 * Controller: settings, selection, live tuner + 3D, the three practice modes
 * ("Ton für Ton", "Passage", "Referenzen"), fingering editor and dialogs.
 */
(function () {
  'use strict';
  const IT = window.IT;
  const M = IT.Music;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const L = (k, p) => IT.i18n.t(k, p);           // translate (German source text is the key)
  const Ln = (w, n, p) => IT.i18n.tn(w, n, p);   // plural-aware

  // ------------------------------------------------------------------ storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem('inverno.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('inverno.' + k, JSON.stringify(v)); } catch (_) { /* private mode etc. */ } },
  };
  const DEFAULTS = {
    a4: 440, tol: 15, holdMs: 300, autoTone: false, merge: true, loop: false,
    names: 'de', theme: 'system', lane: true, view3d: null, guides: true, stage: 'large',
    tempo: 40, countIn: true, metro: false, follow: true, deviceId: '', gate: 6,
    refRate: 100, refLoop: false, activeRef: null,
  };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  // ------------------------------------------------------------------ helpers
  let toastTimer = 0;
  function toast(msg, ms = 3800) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  const fmtCents = c => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(Math.round(c)) + ' ct';
  let lastHint = null;
  /** Tuner hint (written up to ~50×/s while playing, so only touch the DOM on change). */
  function setHint(html) { if (html === lastHint) return; lastHint = html; document.getElementById('hint').innerHTML = html; }
  /** Short status for screen readers (the visual tuner is not announced continuously). */
  function announce(text) { const el = document.getElementById('srStatus'); if (el) el.textContent = text; }
  const fmtTime = s => { if (s == null || !isFinite(s)) return '–'; const m = Math.floor(s / 60); const r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  const parseTime = str => {
    if (str == null) return null;
    const s = String(str).trim().replace(',', '.');
    if (!s) return null;
    const parts = s.split(':').map(Number);
    if (parts.some(x => isNaN(x))) return null;
    return parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  };
  const noteName = n => M.noteName(n, settings.names);
  const SNAME = ['G', 'D', 'A', 'E'];
  const css = (n, fb) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
  const gateRms = () => Math.pow(10, (-30 - settings.gate * 4) / 20);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ core state
  const score = IT.buildScore(IT.SCORE_RAW);
  let overrides = store.get('overrides', {});          // the player's own fingering changes
  let teacherFing = store.get('teacherFing', {});      // fingerings received with a teacher's plan
  const mergedOverrides = () => Object.assign({}, teacherFing, overrides);
  let fingering = IT.Fingering.solve(score.notes, mergedOverrides());
  let sel = store.get('selection', { m1: 1, m2: 24 });
  let mode = 'step';
  let view = null;
  let violin = null;
  let chart = null;

  IT.Audio.a4 = settings.a4;

  // ------------------------------------------------------------------ theme
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    refreshColors();
  }
  function palette() {
    return { accent: css('--accent', '#1F6E94'), good: css('--good', '#2E7D4F'), warn: css('--warn', '#B7791F'), bad: css('--bad', '#C0392B'), ink: css('--ink', '#142028'), bg: css('--surface', '#FBFCFD') };
  }
  // ------------------------------------------------------------------ stage (3D + tuner HUD)
  /** Height of the tuner HUD lying over the 3D canvas (0 when it sits below it). */
  function stageInsets() {
    const tuner = $('#tuner'), viewer = $('#viewer');
    if (!tuner || !viewer || getComputedStyle(tuner).position !== 'absolute') return { top: 0, bottom: 0 };
    return { top: 0, bottom: Math.max(0, viewer.getBoundingClientRect().bottom - tuner.getBoundingClientRect().top) + 4 };
  }
  function syncInsets() {
    if (!violin || !violin.setInsets) return;
    const i = stageInsets();
    violin.setInsets(i.top, i.bottom);
  }
  function syncStage() {
    const compact = settings.stage === 'compact';
    $('#stage').classList.toggle('compact', compact);
    const btn = $('#stageSizeBtn'), label = L(compact ? '3D-Ansicht vergrößern' : '3D-Ansicht verkleinern');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    syncInsets();
  }

  function refreshColors() {
    if (view) view.rerender();
    if (violin && violin.setPalette) violin.setPalette(palette());
    if (chart) chart.draw();
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => { if (settings.theme === 'system') refreshColors(); });
  }

  // ------------------------------------------------------------------ selection
  function clampSel(s) {
    const a = Math.max(1, Math.min(score.measureCount, Math.round(s.m1) || 1));
    const b = Math.max(1, Math.min(score.measureCount, Math.round(s.m2) || a));
    return { m1: Math.min(a, b), m2: Math.max(a, b) };
  }
  function setSelection(s, { scroll = false, keepStep = false } = {}) {
    sel = clampSel(s);
    store.set('selection', sel);
    $('#mFrom').value = sel.m1;
    $('#mTo').value = sel.m2;
    if (view) view.setSelection(sel);
    for (const b of $$('#sectionChips .chip')) {
      const sec = score.sections.find(x => x.label === b.dataset.sec);
      b.setAttribute('aria-pressed', String(sec.from === sel.m1 && sec.to === sel.m2));
    }
    const notes = score.notesInRange(sel.m1, sel.m2);
    const secs = new Set();
    for (let m = sel.m1; m <= sel.m2; m++) secs.add(score.sectionAt(m).label);
    $('#selInfo').textContent = L('T. {m1}–{m2} · {n} Noten · {secs}', { m1: sel.m1, m2: sel.m2, n: notes.length, secs: [...secs].join(', ') });
    if (scroll && view) view.scrollToMeasure(sel.m1);
    if (!keepStep) Step.rebuild();
    Passage.updateInfo();
    Refs.updateButtons();
    updateScene(sel.m1);
    if (IT.Tasks && IT.app) IT.Tasks.bannerFor(sel);
  }
  function buildSectionChips() {
    const box = $('#sectionChips');
    box.textContent = '';
    for (const s of score.sections) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.sec = s.label;
      b.textContent = s.label;
      const line = s.sonnet[0];
      b.title = `${L('T. {m}', { m: s.from })}–${s.to}${line ? ' · ' + line.it + ' (' + sonnetText(line) + ')' : ''}`;
      b.setAttribute('aria-label', L('Abschnitt {l}, Takt {a} bis {b}', { l: s.label, a: s.from, b: s.to }));
      b.addEventListener('click', () => setSelection({ m1: s.from, m2: s.to }, { scroll: true }));
      box.appendChild(b);
    }
  }
  function updateScene(m) {
    const sec = score.sectionAt(m);
    const son = score.sonnetAt(m);
    const role = score.roleAt(m);
    const tp = score.tempoAt(m);
    $('#scene').innerHTML = `<span class="letter">${sec.label}</span><span class="it">${escapeHtml(son.it)}</span><span>${escapeHtml(sonnetText(son))}</span><span class="badge ${role === 'Solo' ? 'solo' : ''}">${role}</span><span class="badge">${tp.label}</span>`;
  }
  /** Paraphrase of a sonnet line in the UI language (Cyrillic derived from the Latin text). */
  function sonnetText(line) {
    const l = IT.i18n.lang;
    if (l === 'de') return line.de;
    return l === 'sr-Cyrl' ? IT.i18n.toCyr(line.sr || line.de) : (line.sr || line.de);
  }

  // ------------------------------------------------------------------ microphone
  const Mic = {
    on: false,
    async start() {
      try {
        const info = await IT.Audio.startMic(settings.deviceId);
        this.on = true;
        $('#micBtn').classList.add('on');
        $('#micBtn').classList.remove('err');
        this.label = info.label ? shortLabel(info.label) : '';
        this.renderLabel();
        return true;
      } catch (e) {
        this.on = false;
        $('#micBtn').classList.add('err');
        const n = e && e.name;
        toast(n === 'NotAllowedError' ? L('Mikrofonzugriff verweigert. Erlaube ihn über das Schloss-Symbol in der Adressleiste und versuche es erneut.')
          : n === 'NotFoundError' ? L('Kein Mikrofon gefunden. Schließe ein Mikrofon oder Headset an.')
          : n === 'NotReadableError' ? L('Das Mikrofon wird gerade von einer anderen Anwendung benutzt.')
          : (e && e.message ? L(e.message) : L('Mikrofon konnte nicht gestartet werden.')), 6500);
        return false;
      }
    },
    renderLabel() {
      $('#micLabel').textContent = this.on ? (this.label || L('Mikrofon an')) : L('Mikrofon starten');
      if (this.on) $('#micBtn').setAttribute('aria-label', L('Mikrofon an – zum Ausschalten klicken'));
      else $('#micBtn').removeAttribute('aria-label');
    },
    stop() {
      IT.Audio.stopMic();
      this.on = false;
      $('#micBtn').classList.remove('on');
      this.renderLabel();
      $('#micMeter').style.width = '0';
      Step.pause();
    },
    async ensure() { if (this.on && IT.Audio.isLive()) return true; return this.start(); },
  };
  function shortLabel(l) { return l.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').slice(0, 26); }

  // ------------------------------------------------------------------ tuner + 3D
  const Tuner = {
    target: null,        // score note (head of the current step)
    hist: [],
    lastVoiced: 0,
    meterRaf: 0,
    setTarget(n, nextN) {
      this.target = n;
      if (!n) {
        $('#targetName').textContent = '–';
        $('#targetMeta').textContent = '';
        if (violin) { violin.setTarget(null); violin.setNext && violin.setNext(null); }
        return;
      }
      const fg = fingering[n.ni];
      $('#targetName').textContent = noteName(n);
      if (mode === 'step') announce(L('Zielton {name}, {s}-Saite, {finger}, Takt {m}.', { name: noteName(n), s: SNAME[fg.s], finger: IT.Fingering.fingerLabel(fg), m: n.m }));
      $('#targetMeta').innerHTML = `<span class="pill str">${L('{s}-Saite', { s: SNAME[fg.s] })}</span><span class="pill">${IT.Fingering.fingerLabel(fg)}</span>${fg.f ? `<span class="pill">${IT.Fingering.positionLabel(fg)}</span>` : ''}<span class="pill">${L('T. {m}', { m: n.m })}</span>`;
      if (violin) {
        violin.setTarget({ string: fg.s, semis: fg.k, finger: fg.f, label: String(fg.f) });
        if (violin.setNext) {
          const nf = nextN ? fingering[nextN.ni] : null;
          violin.setNext(nf ? { string: nf.s, semis: nf.k, finger: nf.f } : null);
        }
      }
      this.updateZone();
    },
    updateZone() {
      const z = $('#cZone');
      const w = Math.min(50, settings.tol) / 100 * 100;
      z.style.left = (50 - w) + '%';
      z.style.width = (2 * w) + '%';
    },
    frame(ev) {
      // level meter (throttled to animation frames)
      if (!this.meterRaf) this.meterRaf = requestAnimationFrame(() => {
        this.meterRaf = 0;
        const db = 20 * Math.log10(Math.max(1e-6, IT.Audio.level));
        $('#micMeter').style.width = Math.max(0, Math.min(100, (db + 60) * 1.9)) + '%';
      });
      if (Passage.showingNote) return;      // a result note is on display
      const voiced = ev.voiced && ev.rms >= gateRms() && ev.conf >= 0.78;
      if (!voiced) {
        if (ev.time - this.lastVoiced > 0.35) this.idle();
        return null;
      }
      this.lastVoiced = ev.time;
      this.hist.push(ev.midi);
      if (this.hist.length > 3) this.hist.shift();
      const midi = this.hist.length === 3 ? this.hist.slice().sort((a, b) => a - b)[1] : ev.midi;
      this.show(midi, ev.freq);
      return midi;
    },
    show(midi, freq) {
      const t = this.target;
      const ref = t ? t.midi : Math.round(midi);
      const cents = (midi - ref) * 100;
      const wrongNote = t && Math.abs(cents) > 70;
      const state = Math.abs(cents) <= settings.tol ? 'good' : Math.abs(cents) <= settings.tol * 2 ? 'warn' : 'bad';
      const lc = $('#liveCents');
      lc.className = 'live-cents state-' + state;
      lc.textContent = wrongNote ? M.midiName(midi, settings.names) : fmtCents(cents);
      $('#liveNote').textContent = wrongNote
        ? L(cents > 0 ? 'zu hoch · Ziel {t}' : 'zu tief · Ziel {t}', { t: noteName(t) })
        : `${M.midiName(midi, settings.names)} · ${freq ? freq.toFixed(1) + ' Hz' : ''}`;
      const nd = $('#needle');
      nd.style.left = (50 + Math.max(-50, Math.min(50, cents))) + '%';
      nd.style.background = css('--' + state, '#888');
      $('#legendPlayed').style.background = css('--' + state, '#888');
      // where the finger is
      let s;
      if (t) s = fingering[t.ni].s;
      s = IT.Fingering.stringForPitch(midi, s);
      const semis = midi - IT.Fingering.OPEN[s];
      if (violin) violin.setPlayed({ string: s, semis, state });
      if (violin && violin.pluck && Math.random() < 0.15) violin.pluck(s, 0.5);
      // hint in millimetres along the string
      let html = '';
      if (t && !wrongNote && state !== 'good') {
        const fg = fingering[t.ni];
        if (fg.s === s && fg.f > 0) {
          const mm = M.fingerMM(semis) - M.fingerMM(fg.k);
          html = L(mm > 0 ? 'Finger ≈ <strong>{mm} mm</strong> Richtung <strong>Schnecke</strong> (du bist zu hoch)' : 'Finger ≈ <strong>{mm} mm</strong> Richtung <strong>Steg</strong> (du bist zu tief)',
            { mm: Math.abs(mm).toFixed(1).replace('.', ',') });
        } else if (fg.f === 0) {
          html = L(cents > 0 ? 'Leere {s}-Saite ist zu hoch gestimmt – Wirbel/Feinstimmer prüfen.' : 'Leere {s}-Saite ist zu tief gestimmt – Wirbel/Feinstimmer prüfen.', { s: SNAME[fg.s] });
        } else html = L(cents > 0 ? 'Zu hoch' : 'Zu tief');
      } else if (t && wrongNote) {
        html = L('Das ist <strong>{played}</strong> – gesucht ist <strong>{target}</strong> ({s}-Saite, {finger}).',
          { played: M.midiName(midi, settings.names), target: noteName(t), s: SNAME[fingering[t.ni].s], finger: IT.Fingering.fingerLabel(fingering[t.ni]) });
      } else if (t) {
        html = L('<strong>Sauber!</strong> Halten …');
      }
      setHint(html);
    },
    idle() {
      this.hist.length = 0;
      const lc = $('#liveCents');
      lc.className = 'live-cents state-idle';
      lc.textContent = '–';
      $('#liveNote').textContent = '';
      $('#needle').style.left = '50%';
      $('#needle').style.background = css('--ink-2', '#888');
      if (violin) violin.setPlayed(null);
    },
  };

  // ------------------------------------------------------------------ mode: Ton für Ton
  const Step = {
    steps: [], idx: 0, running: false, hold: 0, lastT: null, activeAt: null,
    needRelease: false, released: false, peakRms: 0,
    stats: { hit: 0, skip: 0, times: [], per: new Map() }, started: 0, timer: 0,
    rebuild(startNi) {
      this.steps = score.steps(sel.m1, sel.m2, settings.merge);
      let idx = 0;
      if (startNi != null) {
        const k = this.steps.findIndex(st => st.notes.some(n => n.ni === startNi));
        if (k >= 0) idx = k;
      }
      this.finished = false;
      this.setIdx(idx, false);
      this.renderLabels();
    },
    renderLabels() {
      $('#stepTotal').textContent = '/ ' + Ln('Ton', this.steps.length);
      $('#stepStart').textContent = L(this.running ? 'Pause' : this.finished ? 'Nochmal' : this.steps.length && this.idx > 0 ? 'Weiter üben' : 'Üben starten');
      const st = this.steps[this.idx];
      $('#stepWhere').textContent = st ? L('Takt {m}', { m: st.head.m }) : '';
    },
    setIdx(i, scroll = true) {
      this.idx = Math.max(0, Math.min(this.steps.length - 1, i));
      this.hold = 0;
      $('#holdBar').style.width = '0';
      const st = this.steps[this.idx];
      const prev = this.steps[this.idx - 1];
      this.needRelease = !!(prev && prev.midi === (st && st.midi));
      this.released = false;
      this.activeAt = null;
      if (mode === 'step') {
        if (view) view.setCurrent(st ? st.notes.map(n => n.ni) : [], scroll);
        Tuner.setTarget(st ? st.head : null, this.steps[this.idx + 1] ? this.steps[this.idx + 1].head : null);
        if (st) updateScene(st.head.m);
      }
      $('#stepCount').textContent = Math.min(this.idx + 1, this.steps.length);
      $('#stepBar').style.width = (this.steps.length ? (this.idx / this.steps.length) * 100 : 0) + '%';
      $('#stepWhere').textContent = st ? L('Takt {m}', { m: st.head.m }) : '';
      if (this.running && settings.autoTone && st) IT.Audio.playTone(st.midi, 0.8);
    },
    async start() {
      if (!(await Mic.ensure())) return;
      if (!this.steps.length) return;
      this.running = true;
      this.finished = false;
      this.started = this.started || performance.now();
      this.lastT = null;
      this.renderLabels();
      $('#stepStats').hidden = false;
      setHint(L('Spiel den markierten Ton.'));
      clearInterval(this.timer);
      this.timer = setInterval(() => { $('#stepTime').textContent = fmtTime((performance.now() - this.started) / 1000).replace(/\.\d$/, ''); }, 500);
      const st = this.steps[this.idx];
      if (settings.autoTone && st) IT.Audio.playTone(st.midi, 0.8);
    },
    pause() {
      this.running = false;
      clearInterval(this.timer);
      this.renderLabels();
    },
    toggle() { this.running ? this.pause() : this.start(); },
    next(skipped) {
      if (skipped) { this.stats.skip++; this.renderStats(); }
      if (this.idx + 1 >= this.steps.length) return this.finish();
      this.setIdx(this.idx + 1);
    },
    prev() { this.setIdx(this.idx - 1); },
    finish() {
      const n = this.stats.hit;
      const avg = this.stats.times.length ? this.stats.times.reduce((a, b) => a + b, 0) / this.stats.times.length : 0;
      if (!IT.Audio.mode || IT.Audio.mode !== 'sim') {
        const all = store.get('history', {});
        const key = `${sel.m1}-${sel.m2}`;
        (all[key] = all[key] || []).push({ d: Date.now(), kind: 'step', ms: Math.round(avg), hits: n, skips: this.stats.skip, src: 'rec' });
        all[key] = all[key].slice(-60);
        store.set('history', all);
        if (IT.Tasks) IT.Tasks.onHistory();
      }
      if (settings.loop) {
        toast(L('Durchgang geschafft: {n} Töne, Ø {s} s bis zum Treffer. Nächste Runde!', { n, s: (avg / 1000).toFixed(1).replace('.', ',') }));
        this.setIdx(0);
        return;
      }
      this.pause();
      $('#stepBar').style.width = '100%';
      setHint(L('<strong>Geschafft!</strong> Alle {n} Töne der Auswahl getroffen.', { n: this.steps.length }));
      toast(L('Auswahl komplett. Wähle die nächsten Takte oder klicke „Nochmal“.'));
      this.setIdx(0, false);
      this.finished = true;
      this.renderLabels();
    },
    success(ev) {
      const st = this.steps[this.idx];
      const ms = this.activeAt != null ? Math.max(0, (ev.time - this.activeAt) * 1000) : 0;
      this.stats.hit++;
      this.stats.times.push(ms);
      const key = st.head.ni;
      const pr = this.stats.per.get(key) || { ni: key, ms: 0, n: 0 };
      pr.ms += ms; pr.n++;
      this.stats.per.set(key, pr);
      const tuner = $('#tuner');
      tuner.classList.remove('flash-ok'); void tuner.offsetWidth; tuner.classList.add('flash-ok');
      if (violin && violin.pluck) violin.pluck(fingering[st.head.ni].s, 1);
      this.renderStats();
      this.next(false);
    },
    renderStats() {
      $('#sHit').textContent = this.stats.hit;
      $('#sSkip').textContent = this.stats.skip;
      const t = this.stats.times;
      $('#sAvg').textContent = t.length ? (t.reduce((a, b) => a + b, 0) / t.length / 1000).toFixed(1).replace('.', ',') + ' s' : '–';
      const hard = [...this.stats.per.values()].sort((a, b) => b.ms / b.n - a.ms / a.n).slice(0, 5).filter(h => h.ms / h.n > 700);
      const ul = $('#sHard');
      ul.textContent = '';
      for (const h of hard) {
        const n = score.notes[h.ni];
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="linkish">${L('T. {m}', { m: n.m })} · ${escapeHtml(noteName(n))}</button><span class="num">${(h.ms / h.n / 1000).toFixed(1).replace('.', ',')} s</span>`;
        li.querySelector('button').addEventListener('click', () => this.rebuild(h.ni));
        ul.appendChild(li);
      }
      if (!hard.length) ul.innerHTML = `<li><span class="muted">${L('Noch keine Problemstellen.')}</span></li>`;
    },
    onFrame(ev, midi) {
      const st = this.steps[this.idx];
      if (!st || !this.running) return;
      const dt = this.lastT == null ? 0 : Math.max(0, Math.min(0.06, ev.time - this.lastT));
      this.lastT = ev.time;
      if (ev.muted) { this.hold = 0; return; }
      this.peakRms = Math.max(ev.rms, this.peakRms * 0.97);
      if (midi == null) {
        if (this.needRelease) this.released = true;
        this.hold = Math.max(0, this.hold - dt * 2000);
        $('#holdBar').style.width = (this.hold / settings.holdMs * 100) + '%';
        return;
      }
      if (this.activeAt == null) this.activeAt = ev.time;
      if (this.needRelease && !this.released) {
        if (ev.rms < this.peakRms * 0.45) this.released = true;
        else { setHint(L('Gleicher Ton nochmal – neu anstreichen.')); return; }
      }
      const cents = (midi - st.midi) * 100;
      if (Math.abs(cents) <= settings.tol) this.hold += dt * 1000;
      else this.hold = Math.max(0, this.hold - dt * 3000);
      $('#holdBar').style.width = Math.min(100, this.hold / settings.holdMs * 100) + '%';
      if (this.hold >= settings.holdMs) this.success(ev);
    },
  };

  // ------------------------------------------------------------------ mode: Passage
  const Passage = {
    recording: false, metro: null, follow: 0, autoTimer: 0, silenceSince: null, startAt: 0,
    last: null, lastAudio: null, showingNote: false, playing: null,
    purpose: null, tempoOverride: null, range: null,
    beat8() { return 60 / ((this.tempoOverride || settings.tempo) * 3); },          // eighth note at ♩. = tempo
    expectedSec() {
      const evs = score.eventsInRange(sel.m1, sel.m2);
      return evs.reduce((a, e) => a + e.d, 0) / score.ticksPerEighth * this.beat8();
    },
    updateInfo() {
      const n = score.notesInRange(sel.m1, sel.m2).length;
      $('#pasInfo').textContent = L('Auswahl: T. {m1}–{m2} · {n} Noten · ca. {s} s bei ♩. = {bpm}', { m1: sel.m1, m2: sel.m2, n, s: Math.round(this.expectedSec()), bpm: settings.tempo });
      $('#tempoOut').textContent = `♩. = ${settings.tempo}`;
      this.renderHistory();
    },
    async toggleRecord() { this.recording ? this.stop() : this.start(); },
    /**
     * opts.purpose: async (result, audio) => …  — a recording made for something else
     * (e.g. a teacher reference): it is analysed but not shown as the player's own result.
     */
    async start(opts = {}) {
      if (this.playing) this.stopPlayback();
      if (this.recording || Refs.capturing) return false;
      if (!(await Mic.ensure())) return false;
      Step.pause();
      const A = IT.Audio;
      await A.ensureContext();
      this.purpose = opts.purpose || null;
      this.tempoOverride = opts.tempo || null;
      if (!this.purpose) this.clearResult();
      A.startRecording();
      this.recording = true;
      $('#recBtn').classList.add('on');
      $('#recLabel').textContent = L('Stopp');
      const beat = this.beat8();
      let t0 = A.ctx.currentTime + 0.15;
      if (settings.countIn) { t0 = await A.countIn(3, beat); setHint(L('Einzählen …')); }
      this.startAt = t0;
      if (settings.metro) this.metro = A.metronome(t0, beat, 3);
      if (view) view.setCurrent([], false);
      // follow cursor at the chosen tempo
      const ticksPerSec = score.ticksPerEighth / beat;
      const tStart = score.measures[sel.m1 - 1].t, tEnd = score.measures[sel.m2 - 1].t + score.measureTicks;
      const tick = () => {
        if (!this.recording) return;
        const el = A.ctx.currentTime - t0;
        if (el >= 0) {
          if (el < 0.4) { setHint(L('<strong>Aufnahme läuft</strong> – spiel die Passage.')); announce(L('Aufnahme läuft.')); }
          if (settings.follow) {
            const tk = tStart + el * ticksPerSec;
            if (view) view.setPlayhead(tk <= tEnd ? tk : null);
            if (tk <= tEnd && view) { const m = Math.floor(tk / score.measureTicks) + 1; if (m !== this._lastM) { this._lastM = m; view.scrollToMeasure(m); } }
          }
        }
        this.follow = requestAnimationFrame(tick);
      };
      this.follow = requestAnimationFrame(tick);
      // auto stop: well after the expected end, or after a long silence
      const exp = this.expectedSec();
      this.silenceSince = null;
      clearTimeout(this.autoTimer);
      this.autoTimer = setTimeout(() => this.recording && this.stop(), (exp * 2 + 8) * 1000);
      this._stopSilence = A.onFrame(ev => {
        if (!this.recording) return;
        const el = ev.time - t0;
        const voiced = ev.voiced && ev.rms >= gateRms();
        if (voiced) this.silenceSince = null;
        else if (this.silenceSince == null) this.silenceSince = ev.time;
        if (el > exp * 0.6 && this.silenceSince != null && ev.time - this.silenceSince > 2.6) this.stop();
      });
      return true;
    },
    async stop() {
      if (!this.recording) return;
      this.recording = false;
      cancelAnimationFrame(this.follow);
      clearTimeout(this.autoTimer);
      if (this._stopSilence) this._stopSilence();
      if (this.metro) { this.metro.stop(); this.metro = null; }
      if (view) view.setPlayhead(null);
      $('#recBtn').classList.remove('on');
      $('#recLabel').textContent = L('Aufnehmen');
      const rec = IT.Audio.stopRecording();
      if (!rec || rec.samples.length < rec.sampleRate * 0.5) {
        toast(L('Die Aufnahme war zu kurz.'));
        const p = this.purpose; this.purpose = null; this.tempoOverride = null;
        if (p && this._purposeDone) this._purposeDone(false);
        return;
      }
      await this.analyze(rec.samples, rec.sampleRate, 'Aufnahme');
    },
    async analyze(samples, sr, source) {
      const purpose = this.purpose;
      this.purpose = null;
      this.tempoOverride = null;
      const bar = $('#anaBar');
      bar.hidden = false;
      bar.firstElementChild.style.width = '0';
      setHint(L('Analysiere …'));
      let r;
      try {
        r = await IT.Analysis.analyzePassage(samples, sr, {
          score, m1: sel.m1, m2: sel.m2, a4: settings.a4, fingering, tolerance: settings.tol,
          onProgress: f => { bar.firstElementChild.style.width = (f * 100) + '%'; },
        });
      } catch (e) {
        bar.hidden = true;
        toast(e.message ? L(e.message) : L('Analyse fehlgeschlagen.'));
        return;
      }
      bar.hidden = true;
      if (!r.ok) {
        toast(L(r.reason), 6000); setHint(escapeHtml(L(r.reason)));
        if (purpose && this._purposeDone) this._purposeDone(false);
        return;
      }
      r.source = source;
      if (purpose) {
        try { await purpose(r, { samples, sr }); if (this._purposeDone) this._purposeDone(true); }
        catch (e) { console.error(e); toast(L('Speichern fehlgeschlagen.')); if (this._purposeDone) this._purposeDone(false); }
        return;
      }
      this.last = r;
      this.lastAudio = { samples, sr };
      this.showResult(r);
      this.pushHistory(r);
      if (source !== 'Demo') this.saveTake(r, samples, sr);
    },
    async saveTake(r, samples, sr) {
      try {
        const audio = await IT.Reference.compactWav(samples, sr);
        await IT.Reference.Takes.add({
          id: 'take-' + Date.now().toString(36), range: `${r.m1}-${r.m2}`, date: Date.now(), audio,
          summary: { overall: r.summary.overall, intonation: r.summary.intonation, hitRate: r.summary.hitRate, rhythm: r.summary.rhythm, tempoBpm: r.summary.tempoBpm,
            worst: r.summary.worst.map(n => ({ ni: n.ni, state: n.state, cents: n.cents == null ? null : Math.round(n.cents) })) },
        });
      } catch (e) { /* storage full or unavailable: the result is still shown */ }
    },
    clearResult() {
      this.last = null;
      this.showingNote = false;
      $('#result').hidden = true;
      $('#analysisBand').hidden = true;
      if (view) view.clearStates();
      if (chart) chart.setData(null);
    },
    showResult(r) {
      const s = r.summary;
      // score colouring
      const states = new Map();
      for (const n of r.notes) {
        const st = n.state === 'wrong' ? 'bad' : n.state;
        const label = n.state === 'miss' ? '–' : n.state === 'wrong' ? '✕' : (n.cents > 0 ? '+' : '') + Math.round(n.cents);
        states.set(n.ni, { state: st, label });
      }
      if (view) { view.setStates(states); view.setCurrent([], false); }
      // chart
      $('#analysisBand').hidden = false;
      const srcLabel = r.source === 'Aufnahme' || r.source === 'Demo' ? L(r.source) : r.source;
      $('#analysisTitle').textContent = L('Tonhöhenverlauf · T. {m1}–{m2} ({src})', { m1: r.m1, m2: r.m2, src: srcLabel });
      chart.setData(r, score, settings.names);
      // summary card
      const ref = Refs.active();
      const refNotes = ref && ref.notes ? ref.notes : null;
      const circ = 2 * Math.PI * 34;
      const col = s.overall >= 82 ? 'var(--good)' : s.overall >= 60 ? 'var(--warn)' : 'var(--bad)';
      const verdict = L(s.verdict).trim();
      const tendTxt = Math.abs(s.meanSigned) < 4 ? L('Keine klare Tendenz nach oben oder unten.')
        : L(s.meanSigned > 0 ? 'Im Schnitt <strong>{c}</strong> – du intonierst eher zu hoch.' : 'Im Schnitt <strong>{c}</strong> – du intonierst eher zu tief.', { c: fmtCents(s.meanSigned) });
      const tendList = s.tendencies.map(tn => `<li><span>${escapeHtml(L('{f}. Finger auf der {s}-Saite', { f: tn.finger, s: SNAME[tn.string] }))} <span class="muted">${L('({n} Noten)', { n: tn.n })}</span></span><span class="cents ${tn.mean > 0 ? 'pos' : 'neg'}">${fmtCents(tn.mean)}</span></li>`).join('');
      const shift = s.shiftInfo && s.shiftInfo.base != null && s.shiftInfo.meanAbs > s.shiftInfo.base + 6
        ? `<p class="muted">${L('Nach Lagenwechseln liegst du im Schnitt {a} ct daneben (sonst {b} ct) – Lagenwechsel gezielt langsam üben.', { a: Math.round(s.shiftInfo.meanAbs), b: Math.round(s.shiftInfo.base) })}</p>` : '';
      const worst = s.worst.map(n => {
        const ev = score.notes[n.ni];
        const what = n.state === 'miss' ? L('nicht erkannt') : n.state === 'wrong' ? L('falsch ({n})', { n: M.midiName(n.played, settings.names) }) : fmtCents(n.cents);
        const rc = refNotes && refNotes[n.ni] != null ? ` <span class="muted">${L('Ref. {c}', { c: fmtCents(refNotes[n.ni]) })}</span>` : '';
        return `<li><button type="button" class="linkish" data-ni="${n.ni}">${L('T. {m}', { m: ev.m })} · ${escapeHtml(noteName(ev))}</button><span><span class="cents ${n.cents > 0 ? 'pos' : 'neg'}">${what}</span>${rc}</span></li>`;
      }).join('');
      const el = $('#result');
      el.innerHTML = `
        <div class="result-head">
          <svg class="ring" viewBox="0 0 80 80" role="img" aria-label="${escapeHtml(L('Gesamtwertung {n} von 100', { n: s.overall }))}">
            <circle class="bg" cx="40" cy="40" r="34"></circle>
            <circle class="fg" cx="40" cy="40" r="34" style="stroke:${col}" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle>
            <text x="40" y="48" text-anchor="middle">${s.overall}</text>
          </svg>
          <div>
            <div class="verdict">${escapeHtml(verdict)}</div>
            <div class="muted">${L('{count} Noten · {good} sauber · {wrong} falsch · {missed} nicht erkannt', { count: s.count, good: s.good, wrong: s.wrong, missed: s.missed })}${s.tempoBpm ? ` · ♩. ≈ ${Math.round(s.tempoBpm)}` : ''}</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${s.intonation}</b><span>${L('Intonation')}</span></div>
          <div class="stat"><b>${s.hitRate} %</b><span>${L('Treffer ±{tol} ct', { tol: settings.tol })}</span></div>
          <div class="stat"><b>${s.rhythm == null ? '–' : s.rhythm}</b><span>${L('Rhythmus')}${s.rhythmMs ? ` (±${Math.round(s.rhythmMs)} ms)` : ''}</span></div>
        </div>
        <p>${tendTxt} ${L('Mittlere Abweichung: {c} ct.', { c: `<span class="num">${Math.round(s.meanAbs)}</span>` })}</p>
        ${tendList ? `<p class="label">${L('Tendenzen pro Finger')}</p><ul class="list tend">${tendList}</ul>` : ''}
        ${shift}
        ${worst ? `<p class="label">${L('Genauer anschauen')}</p><ul class="list" id="worstList">${worst}</ul>` : ''}
        <div class="row">
          <button class="btn small" type="button" id="toStepBtn">${L('Schwierigste Stelle Ton für Ton')}</button>
          <button class="btn small" type="button" id="saveRefBtn">${L('Als Referenz speichern')}</button>
        </div>`;
      el.hidden = false;
      announce(L('Auswertung: {o} von 100 Punkten, {v}. Intonation {i}, Treffer {h} Prozent.', { o: s.overall, v: verdict, i: s.intonation, h: s.hitRate }));
      requestAnimationFrame(() => { const fg = el.querySelector('.ring .fg'); if (fg) fg.style.strokeDashoffset = String(circ * (1 - s.overall / 100)); });
      el.querySelectorAll('#worstList button').forEach(b => b.addEventListener('click', () => this.showNote(+b.dataset.ni)));
      $('#toStepBtn').addEventListener('click', () => {
        const w = s.worst[0];
        const m = w ? score.notes[w.ni].m : sel.m1;
        setMode('step');
        setSelection({ m1: m, m2: Math.min(score.measureCount, m + 1) }, { scroll: true });
        if (w) Step.rebuild(w.ni);
      });
      $('#saveRefBtn').addEventListener('click', () => this.saveAsReference());
      setHint(L('Klicke eine Note in den Noten oder im Verlauf, um zu sehen, wo dein Finger lag.'));
    },
    showNote(ni) {
      const r = this.last;
      if (!r) return;
      const n = r.notes.find(q => q.ni === ni);
      if (!n) return;
      const ev = score.notes[ni];
      const fg = fingering[ni];
      this.showingNote = true;
      chart.select(ni);
      if (view) { view.setCurrent([ni]); }
      Tuner.setTarget(ev, null);
      $('#targetLabel').textContent = L('Note T. {m}', { m: ev.m });
      const lc = $('#liveCents');
      const ref = Refs.active();
      const refC = ref && ref.notes && ref.notes[ni] != null ? ref.notes[ni] : null;
      if (n.cents != null && n.state !== 'wrong') {
        const state = n.state;
        lc.className = 'live-cents state-' + state;
        lc.textContent = fmtCents(n.cents);
        $('#liveNote').textContent = refC != null ? L('Referenz: {c}', { c: fmtCents(refC) }) : L('gemessen (Median)');
        $('#needle').style.left = (50 + Math.max(-50, Math.min(50, n.cents))) + '%';
        $('#needle').style.background = css('--' + state, '#888');
        const semis = fg.k + n.cents / 100;
        if (violin) violin.setPlayed({ string: fg.s, semis, state });
        const mm = M.fingerMM(semis) - M.fingerMM(fg.k);
        const mmTxt = Math.abs(mm).toFixed(1).replace('.', ',');
        setHint(fg.f === 0 ? L('Leere Saite: {c} – Stimmung prüfen.', { c: fmtCents(n.cents) })
          : Math.abs(n.cents) <= settings.tol ? L('<strong>Sauber.</strong> Dein Finger lag praktisch richtig ({mm} mm).', { mm: mmTxt })
          : L(mm > 0 ? 'Dein Finger lag ≈ <strong>{mm} mm</strong> zu weit Richtung Steg (zu hoch). Gespielt auf der {s}-Saite angenommen.'
            : 'Dein Finger lag ≈ <strong>{mm} mm</strong> zu weit Richtung Schnecke (zu tief). Gespielt auf der {s}-Saite angenommen.', { mm: mmTxt, s: SNAME[fg.s] }));
      } else if (n.state === 'wrong') {
        lc.className = 'live-cents state-bad';
        lc.textContent = M.midiName(n.played, settings.names);
        $('#liveNote').textContent = L('falscher Ton');
        const s = IT.Fingering.stringForPitch(n.played, fg.s);
        if (violin) violin.setPlayed({ string: s, semis: n.played - IT.Fingering.OPEN[s], state: 'bad' });
        setHint(L('Gespielt wurde <strong>{p}</strong> statt <strong>{t}</strong>.', { p: M.midiName(n.played, settings.names), t: noteName(ev) }));
      } else {
        lc.className = 'live-cents state-idle';
        lc.textContent = '–';
        $('#liveNote').textContent = L('nicht erkannt');
        if (violin) violin.setPlayed(null);
        setHint(L('Diese Note war in der Aufnahme nicht zu hören (zu kurz, zu leise oder ausgelassen).'));
      }
      clearTimeout(this._noteTimer);
      this._noteTimer = setTimeout(() => { this.showingNote = false; $('#targetLabel').textContent = L('Zielton'); }, 12000);
    },
    async playRecording() {
      if (!this.lastAudio || !this.last) return;
      if (this.playing) { this.stopPlayback(); return; }
      const r = this.last;
      const first = r.notes.find(n => n.start != null);
      const from = Math.max(0, (first ? first.start : 0) - 0.3);
      $('#playRecBtn').textContent = L('■ Stopp');
      this.playing = await IT.Audio.playBuffer(this.lastAudio.samples, this.lastAudio.sr, from, null, {
        onTime: t => {
          chart.setCursor(t);
          const n = r.notes.find(q => q.start != null && t >= q.start && t < q.end);
          if (n && view) view.setPlayhead(n.t + (t - n.start) / (n.end - n.start) * n.d);
        },
        onEnd: () => this.stopPlayback(),
      });
    },
    stopPlayback() {
      IT.Audio.stopBuffer();
      this.playing = null;
      $('#playRecBtn').textContent = L('▶ Aufnahme anhören');
      if (chart) chart.setCursor(null);
      if (view) view.setPlayhead(null);
    },
    async preview() {
      const A = IT.Audio;
      if (A._seq) { A.stopSequence(); if (view) view.setPlayhead(null); $('#previewBtn').textContent = L('♪ Vorspielen'); return; }
      const beat = this.beat8();
      const evs = score.eventsInRange(sel.m1, sel.m2);
      const t0tick = evs[0].t;
      const items = evs.map(e => ({ midi: e.rest ? null : e.midi, start: (e.t - t0tick) / score.ticksPerEighth * beat, dur: e.d / score.ticksPerEighth * beat, ni: e.ni }));
      $('#previewBtn').textContent = L('■ Stopp');
      const seq = await A.playSequence(items, {
        countIn: 0,
        onEnd: () => { if (view) view.setPlayhead(null); $('#previewBtn').textContent = L('♪ Vorspielen'); },
      });
      seq.onTime = t => { if (view && t >= 0) view.setPlayhead(t0tick + t / beat * score.ticksPerEighth); };
    },
    /** Synthesised performance with small, realistic errors (no violin needed). */
    async demo() {
      await IT.Audio.ensureContext();
      const sr = IT.Audio.ctx.sampleRate;
      const beat = this.beat8();
      const evs = score.eventsInRange(sel.m1, sel.m2);
      const lead = 0.5;
      const total = evs.reduce((a, e) => a + e.d, 0) / score.ticksPerEighth * beat + lead + 1;
      const x = new Float32Array(Math.ceil(total * sr));
      let t = lead, phase = 0, drift = 0;
      for (const e of evs) {
        const dur = e.d / score.ticksPerEighth * beat * (1 + (Math.random() - 0.5) * 0.12);
        if (!e.rest) {
          drift = drift * 0.6 + (Math.random() - 0.5) * 14;
          const fg = fingering[e.ni];
          const bias = fg && fg.f === 3 ? 9 : fg && fg.f === 1 ? -5 : 0;    // a typical "high 3rd finger"
          let c = drift + bias + (Math.random() < 0.06 ? (Math.random() < 0.5 ? -1 : 1) * 30 : 0);
          const f = settings.a4 * Math.pow(2, (e.midi - 69 + c / 100) / 12);
          const i0 = Math.floor(t * sr), i1 = Math.floor((t + dur) * sr);
          for (let i = i0; i < i1 && i < x.length; i++) {
            const tt = (i - i0) / sr, rem = (i1 - i) / sr;
            const env = Math.min(1, tt / 0.02) * Math.min(1, rem / 0.015);
            phase += 2 * Math.PI * f * (1 + 0.0035 * Math.sin(2 * Math.PI * 5.6 * tt) * Math.min(1, tt / 0.3)) / sr;
            let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(h * phase) / h * (h === 2 ? 0.8 : 1);
            x[i] += 0.12 * env * v;
          }
        }
        t += dur;
      }
      for (let i = 0; i < x.length; i++) x[i] += (Math.random() * 2 - 1) * 0.003;
      await this.analyze(x, sr, 'Demo');
    },
    async analyzeFile(file) {
      try {
        const buf = await file.arrayBuffer();
        const dec = await IT.Audio.decode(buf);
        await this.analyze(dec.samples, dec.sampleRate, file.name);
      } catch (e) {
        toast(L('Datei konnte nicht gelesen werden (Format nicht unterstützt?).'));
      }
    },
    async saveAsReference() {
      if (!this.lastAudio || !this.last) return;
      const r = this.last;
      const { samples, sr } = this.lastAudio;
      const ref = {
        id: IT.Reference.newId(), name: L('Eigene Aufnahme T. {m1}–{m2}', { m1: r.m1, m2: r.m2 }), kind: 'audio', createdAt: Date.now(),
        audio: await IT.Reference.compactWav(samples, sr), duration: samples.length / sr, a4: settings.a4, transpose: 0,
        partial: { m1: r.m1, m2: r.m2 }, onsets: fillOnsets(onsetsFromResult(r), r.m1, r.m2), anchors: [], url: '',
        notes: Object.fromEntries(r.notes.filter(n => n.cents != null && n.state !== 'wrong').map(n => [n.ni, Math.round(n.cents * 10) / 10])),
      };
      await IT.Reference.Store.put(ref);
      await Refs.load();
      toast(L('Als Referenz gespeichert.'));
    },
    pushHistory(r) {
      const key = `${r.m1}-${r.m2}`;
      const all = store.get('history', {});
      const arr = all[key] || [];
      arr.push({ d: Date.now(), o: r.summary.overall, i: r.summary.intonation, h: r.summary.hitRate, r: r.summary.rhythm, t: r.summary.tempoBpm ? Math.round(r.summary.tempoBpm) : null, src: r.source === 'Demo' ? 'demo' : 'rec' });
      all[key] = arr.slice(-60);
      store.set('history', all);
      this.renderHistory();
      if (IT.Tasks) IT.Tasks.onHistory();
    },
    renderHistory() {
      const all = store.get('history', {});
      const arr = (all[`${sel.m1}-${sel.m2}`] || []).filter(h => h.src !== 'demo' && h.kind !== 'step');
      const box = $('#history');
      if (arr.length < 1) { box.hidden = true; return; }
      box.hidden = false;
      const svg = $('#spark');
      const W = 300, H = 36;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const xs = i => arr.length === 1 ? W / 2 : 6 + i * (W - 12) / (arr.length - 1);
      const ys = v => H - 4 - (v / 100) * (H - 8);
      const pts = arr.map((h, i) => `${xs(i).toFixed(1)},${ys(h.o).toFixed(1)}`).join(' ');
      svg.innerHTML = `<line x1="0" x2="${W}" y1="${ys(80)}" y2="${ys(80)}" stroke="var(--line)" stroke-dasharray="3 3"/>
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
        ${arr.map((h, i) => `<circle cx="${xs(i)}" cy="${ys(h.o)}" r="${i === arr.length - 1 ? 3.2 : 2}" fill="${i === arr.length - 1 ? 'var(--varnish)' : 'var(--accent)'}"/>`).join('')}`;
      const best = Math.max(...arr.map(h => h.o));
      const last = arr[arr.length - 1];
      $('#histInfo').textContent = L('Versuche: {n} · zuletzt {last} · bester {best}', { n: arr.length, last: last.o, best }) + (last.t ? L(' · Tempo zuletzt ♩. ≈ {t}', { t: last.t }) : '');
    },
  };
  /** Per-event onset times (s) of an analysed passage; null where unknown. */
  function onsetsFromResult(r) {
    const byNi = new Map(r.notes.filter(n => n.start != null).map(n => [n.ni, n.start]));
    return score.events.map(e => (e.rest ? null : byNi.has(e.ni) ? byNi.get(e.ni) : null));
  }
  function fillOnsets(onsets, m1, m2) {
    const out = onsets.slice();
    for (let i = 0; i < out.length; i++) {
      const e = score.events[i];
      if (e.m < m1 || e.m > m2) { out[i] = null; continue; }
      if (out[i] == null) {
        let a = i - 1; while (a >= 0 && out[a] == null) a--;
        let b = i + 1; while (b < out.length && out[b] == null && score.events[b].m <= m2) b++;
        if (a >= 0 && b < out.length && out[b] != null) out[i] = out[a] + (out[b] - out[a]) * (e.t - score.events[a].t) / (score.events[b].t - score.events[a].t);
        else if (a >= 0) out[i] = out[a] + (e.t - score.events[a].t) * score.events[a].secPerTick;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ mode: Referenzen
  const Refs = {
    list: [], capturing: false, delArm: null,
    active() { return this.list.find(r => r.id === settings.activeRef) || null; },
    async load() {
      this.list = await IT.Reference.Store.all();
      if (!store.get('seededLink', false)) {
        const seed = { id: 'ref-example-link', kind: 'link', name: 'Play-Along (Violin Learning Made Easy)', url: 'https://www.youtube.com/watch?v=rMExLLrosGQ', anchors: [], createdAt: Date.now() };
        try { await IT.Reference.Store.put(seed); this.list.push(seed); } catch (_) { this.list.push(seed); }
        store.set('seededLink', true);
      }
      if (!this.active() && this.list.length) { settings.activeRef = this.list[0].id; saveSettings(); }
      this.render();
      this.updateButtons();
      if (IT.Tasks && IT.app && mode === 'tasks') IT.Tasks.render();
    },
    playable(ref) { return ref && ref.kind === 'audio' && ref.audio && (ref.onsets || (ref.anchors || []).length); },
    range(ref, rg = sel) {
      if (ref.partial && (rg.m1 < ref.partial.m1 || rg.m2 > ref.partial.m2)) return null;
      const a = IT.Reference.measureTime(ref, score, rg.m1);
      const b = IT.Reference.measureEnd(ref, score, rg.m2);
      return a == null || b == null || !isFinite(a) || !isFinite(b) ? null : [a, b];
    },
    updateButtons() {
      const ref = this.active();
      const btn = $('#refPlayBtn');
      const ok = ref && this.playable(ref) && this.range(ref);
      btn.hidden = !ok;
      $('#refRateWrap').hidden = !this.list.some(r => r.kind === 'audio');
      if (ok) {
        const [a, b] = this.range(ref);
        const ticks = score.eventsInRange(sel.m1, sel.m2).reduce((s, e) => s + e.d, 0);
        const bpm = 60 / ((b - a) / (ticks / score.ticksPerEighth) * 3);
        btn.title = L('Referenz „{n}“ abspielen (♩. ≈ {b})', { n: ref.name, b: Math.round(bpm) });
      }
    },
    render() {
      const box = $('#refList');
      box.textContent = '';
      if (!this.list.length) { box.innerHTML = `<p class="muted">${L('Noch keine Referenz. Lade eine Aufnahme oder füge einen Link hinzu.')}</p>`; return; }
      for (const ref of this.list) box.appendChild(this.card(ref));
    },
    card(ref) {
      const el = document.createElement('div');
      el.className = 'refcard' + (ref.id === settings.activeRef ? ' active' : '');
      const yt = IT.Reference.youtubeId(ref.url);
      const meta = [];
      if (ref.kind === 'audio') {
        meta.push(fmtTime(ref.duration).replace(/\.\d$/, ''));
        if (ref.a4) meta.push(`a′ = ${ref.a4.toFixed(1).replace('.', ',')} Hz`);
        if (ref.partial) meta.push(`${L('T. {m}', { m: ref.partial.m1 })}–${ref.partial.m2}`);
        else if (ref.onsets) meta.push(L('alle Takte gefunden'));
        const nc = ref.notes ? Object.keys(ref.notes).length : 0;
        if (nc) meta.push(L('{n} Noten mit Intonation', { n: nc }));
      } else {
        meta.push(L('YouTube-Link'));
        const a1 = (ref.anchors || []).find(a => a.time != null);
        meta.push(a1 ? L('T. {m} bei {t}', { m: a1.m, t: fmtTime(a1.time).replace(/\.\d$/, '') }) : L('Startzeit fehlt'));
      }
      const range = this.range(ref);
      const ytLink = yt ? IT.Reference.youtubeLink(ref, range ? range[0] : IT.Reference.measureTime(ref, score, sel.m1) || 0) : null;
      el.innerHTML = `
        <div class="row split">
          <h3>${escapeHtml(ref.name)}</h3>
          <label class="toggle"><input type="radio" name="activeRef" ${ref.id === settings.activeRef ? 'checked' : ''}> ${L('aktiv')}</label>
        </div>
        <div class="refmeta">${meta.map(escapeHtml).map(x => `<span>${x}</span>`).join('')}</div>
        <div class="row">
          ${this.playable(ref) ? `<button class="btn small" type="button" data-act="play">${range ? `▶ ${L('T. {m}', { m: sel.m1 })}–${sel.m2}` : L('Auswahl nicht enthalten')}</button>` : ''}
          ${ytLink ? `<a class="btn small" href="${ytLink}" target="_blank" rel="noopener">${L('YouTube ab T. {m} ↗', { m: sel.m1 })}</a>` : ''}
          <button class="btn small" type="button" data-act="anchors">${L('Takt-Zeiten')}</button>
          <button class="btn small ghost" type="button" data-act="del">${L(this.delArm === ref.id ? 'Wirklich löschen?' : 'Löschen')}</button>
        </div>
        <div class="anchors" data-anchors hidden></div>`;
      el.querySelector('input[type=radio]').addEventListener('change', () => { settings.activeRef = ref.id; saveSettings(); this.render(); this.updateButtons(); });
      const play = el.querySelector('[data-act=play]');
      if (play) play.addEventListener('click', () => this.play(ref, play));
      el.querySelector('[data-act=anchors]').addEventListener('click', () => {
        const box = el.querySelector('[data-anchors]');
        box.hidden = !box.hidden;
        if (!box.hidden) this.anchorEditor(ref, box);
      });
      el.querySelector('[data-act=del]').addEventListener('click', async () => {
        if (this.delArm !== ref.id) { this.delArm = ref.id; this.render(); setTimeout(() => { if (this.delArm === ref.id) { this.delArm = null; this.render(); } }, 4000); return; }
        this.delArm = null;
        await IT.Reference.Store.remove(ref.id);
        if (settings.activeRef === ref.id) settings.activeRef = null;
        await this.load();
      });
      return el;
    },
    anchorEditor(ref, box) {
      const rows = (ref.anchors && ref.anchors.length ? ref.anchors : [{ m: 1, time: null }]).map(a => ({ ...a }));
      const draw = () => {
        box.innerHTML = `<p class="muted">${L(ref.kind === 'audio'
          ? 'Die Takte wurden automatisch gefunden. Liegt eine Stelle daneben, trage die richtige Zeit ein (in der Aufnahme).'
          : 'Trage ein, bei welcher Video-Zeit ein Takt beginnt. Ein Eintrag genügt, zwei oder mehr machen es genauer.')}</p>
          ${rows.map((a, i) => `<div class="anchor-row"><span>${L('Takt')}</span><input type="number" min="1" max="${score.measureCount}" value="${a.m}" data-i="${i}" data-k="m" aria-label="${L('Takt')}"><span>${L('bei')}</span><input type="text" inputmode="decimal" placeholder="m:ss" value="${a.time != null ? fmtTime(a.time) : ''}" data-i="${i}" data-k="time" aria-label="${L('Zeit')}"><button class="btn small ghost" type="button" data-rm="${i}" aria-label="${L('Zeile entfernen')}">✕</button></div>`).join('')}
          ${ref.kind === 'audio' && ref.url !== undefined ? `<div class="field"><label>${L('YouTube-Link (optional)')}</label><input class="textin" type="url" data-k="url" value="${escapeHtml(ref.url || '')}" placeholder="https://www.youtube.com/watch?v=…"><label>${L('Aufnahme beginnt bei Video-Zeit')}</label><input class="textin" type="text" data-k="yt" value="${ref.ytOffset ? fmtTime(ref.ytOffset) : '0:00'}"></div>` : ''}
          <div class="row"><button class="btn small" type="button" data-add>${L('+ Zeile')}</button><button class="btn small primary" type="button" data-save>${L('Speichern')}</button></div>`;
        box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { rows.splice(+b.dataset.rm, 1); draw(); }));
        box.querySelector('[data-add]').addEventListener('click', () => { rows.push({ m: sel.m1, time: null }); draw(); });
        box.querySelector('[data-save]').addEventListener('click', async () => {
          box.querySelectorAll('input[data-i]').forEach(inp => {
            const r = rows[+inp.dataset.i];
            if (inp.dataset.k === 'm') r.m = Math.max(1, Math.min(score.measureCount, +inp.value || 1));
            else r.time = parseTime(inp.value);
          });
          ref.anchors = rows.filter(r => r.time != null);
          const u = box.querySelector('input[data-k=url]');
          if (u) ref.url = u.value.trim();
          const y = box.querySelector('input[data-k=yt]');
          if (y) ref.ytOffset = parseTime(y.value) || 0;
          await IT.Reference.Store.put(ref);
          toast(L('Takt-Zeiten gespeichert.'));
          this.render();
          this.updateButtons();
        });
      };
      draw();
    },
    async play(ref, btn, rg = sel) {
      const P = IT.Reference.Player;
      if (P.playing()) { P.stop(); return; }
      const range = this.range(ref, rg);
      if (!range) { toast(L('Diese Referenz enthält die gewählten Takte nicht.')); return; }
      if (Passage.playing) Passage.stopPlayback();
      const [a, b] = range;
      const lbl = btn ? btn.textContent : '';
      if (btn) btn.textContent = L('■ Stopp');
      const prB = $('#refPlayBtn'); const prLbl = prB.textContent; prB.textContent = L('■ Stopp');
      const ticks0 = score.measures[rg.m1 - 1].t, ticks1 = score.measures[rg.m2 - 1].t + score.measureTicks;
      try {
        await P.play(ref, Math.max(0, a - 0.15), b + 0.1, {
          rate: settings.refRate / 100, loop: settings.refLoop,
          onTime: t => { if (view && ref.onsets) view.setPlayhead(this.tickAt(ref, t, ticks0, ticks1)); },
          onEnd: () => { if (btn) btn.textContent = lbl; prB.textContent = prLbl; if (view) view.setPlayhead(null); },
        });
      } catch (e) {
        if (btn) btn.textContent = lbl; prB.textContent = prLbl;
        toast(L('Wiedergabe nicht möglich: {e}', { e: e.message || e }));
      }
    },
    tickAt(ref, t, t0, t1) {
      const evs = score.events;
      let k = -1;
      for (let i = 0; i < evs.length; i++) {
        const on = ref.onsets[i];
        if (on == null || evs[i].t < t0 || evs[i].t >= t1) continue;
        if (on <= t) k = i; else break;
      }
      if (k < 0) return null;
      const e = evs[k];
      let next = null;
      for (let i = k + 1; i < evs.length; i++) if (ref.onsets[i] != null) { next = i; break; }
      const on = ref.onsets[k], off = next != null ? ref.onsets[next] : on + e.d * e.secPerTick;
      return e.t + Math.min(1, (t - on) / Math.max(0.01, off - on)) * e.d;
    },
    async addFile(file) {
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const dec = await IT.Audio.decode(buf.slice(0));
        await this.ingestOrAsk(dec, file, file.name.replace(/\.[a-z0-9]+$/i, ''));
      } catch (e) {
        console.error(e);
        toast(L('Die Datei konnte nicht gelesen werden. Unterstützt werden gängige Formate wie MP3, M4A, WAV, OGG, WebM oder MP4.'));
      }
    },
    /** Whole movement → align directly; shorter recordings → ask which measures they contain. */
    async ingestOrAsk(dec, blob, name) {
      const full = IT.Reference.nominalDuration(score);
      if (dec.duration >= full * 0.55) return this.ingest(dec, blob, name, null);
      const box = $('#refList');
      const card = document.createElement('div');
      card.className = 'import-card';
      card.innerHTML = `<p class="label">${L('Teil-Aufnahme')}</p>
        <h3>${escapeHtml(name)}</h3>
        <p class="muted">${L('Die Aufnahme dauert {d} – kürzer als der ganze Satz. Welche Takte enthält sie?', { d: fmtTime(dec.duration).replace(/\.\d$/, '') })}</p>
        <div class="row nowrap"><span>${L('Takt')}</span><input class="mini" type="number" min="1" max="${score.measureCount}" value="${sel.m1}" data-k="m1" aria-label="${L('von Takt')}"><span>${L('bis')}</span><input class="mini" type="number" min="1" max="${score.measureCount}" value="${sel.m2}" data-k="m2" aria-label="${L('bis Takt')}"></div>
        <div class="row"><button class="btn small primary" type="button" data-go>${L('Ausrichten')}</button><button class="btn small" type="button" data-cancel>${L('Abbrechen')}</button></div>`;
      box.prepend(card);
      card.querySelector('input').focus();
      return new Promise(resolve => {
        card.querySelector('[data-cancel]').addEventListener('click', () => { card.remove(); resolve(null); });
        card.querySelector('[data-go]').addEventListener('click', async () => {
          const r = clampSel({ m1: +card.querySelector('[data-k=m1]').value, m2: +card.querySelector('[data-k=m2]').value });
          card.remove();
          resolve(await this.ingest(dec, blob, name, r));
        });
      });
    },
    async ingest(dec, blob, name, range) {
      const bar = $('#refBar');
      bar.hidden = false; bar.firstElementChild.style.width = '0';
      toast(L(range ? 'Richte Aufnahme aus …' : 'Analysiere Aufnahme – das kann bei einem ganzen Satz 10–30 Sekunden dauern …'), 8000);
      let res;
      try {
        res = await IT.Reference.alignRecording(dec.samples, dec.sampleRate, score, f => { bar.firstElementChild.style.width = (f * 100) + '%'; }, range);
      } finally { bar.hidden = true; }
      const ref = {
        id: IT.Reference.newId(), name, kind: 'audio', createdAt: Date.now(), audio: blob, duration: dec.duration,
        a4: res.a4, transpose: res.transpose, onsets: res.onsets, notes: res.notes, cost: res.cost, anchors: [], url: '', ytOffset: 0,
        partial: res.partial,
      };
      await IT.Reference.Store.put(ref);
      settings.activeRef = ref.id; saveSettings();
      await this.load();
      const quality = res.cost < 0.42 ? '' : L(' Die Zuordnung ist unsicher – prüfe die Takt-Zeiten.');
      const trans = res.transpose ? L(res.transpose < 0 ? ' (einen Halbton tiefer)' : ' (einen Halbton höher)') : '';
      toast(L('„{name}“ ausgerichtet: a′ ≈ {hz} Hz{trans}.{quality}', { name, hz: res.a4.toFixed(1).replace('.', ','), trans, quality }), 7000);
    },
    async toggleCapture() {
      const btn = $('#refRecBtn');
      if (!this.capturing) {
        if (!(await Mic.ensure())) return;
        if (Passage.recording) return;
        IT.Audio.startRecording();
        this.capturing = true;
        this._capStart = performance.now();
        const capLabel = () => L('■ Mitschnitt beenden ({t})', { t: fmtTime((performance.now() - this._capStart) / 1000).replace(/\.\d$/, '') });
        btn.textContent = capLabel();
        this._capTimer = setInterval(() => { btn.textContent = capLabel(); }, 500);
        toast(L('Mitschnitt läuft – spiele jetzt die Referenz (z. B. das YouTube-Video) über Lautsprecher ab.'), 6000);
        return;
      }
      clearInterval(this._capTimer);
      this.capturing = false;
      btn.textContent = L('● Über Mikrofon mitschneiden');
      const rec = IT.Audio.stopRecording();
      if (!rec || rec.samples.length < rec.sampleRate * 3) { toast(L('Mitschnitt zu kurz.')); return; }
      try {
        const blob = await IT.Reference.compactWav(rec.samples, rec.sampleRate);
        const d = new Date();
        await this.ingestOrAsk({ samples: rec.samples, sampleRate: rec.sampleRate, duration: rec.samples.length / rec.sampleRate }, blob,
          L('Mitschnitt {d}', { d: `${d.toLocaleDateString(IT.i18n.locale)} ${d.toLocaleTimeString(IT.i18n.locale, { hour: '2-digit', minute: '2-digit' })}` }));
      } catch (e) {
        console.error(e);
        toast(L('Der Mitschnitt konnte nicht ausgerichtet werden.'));
      }
    },
    async addLink() {
      const url = $('#ytUrl').value.trim();
      if (!IT.Reference.youtubeId(url)) { toast(L('Das sieht nicht nach einem YouTube-Link aus.')); return; }
      const ref = { id: IT.Reference.newId(), kind: 'link', name: $('#ytName').value.trim() || 'YouTube', url, anchors: [], createdAt: Date.now() };
      await IT.Reference.Store.put(ref);
      settings.activeRef = ref.id; saveSettings();
      await this.load();
      toast(L('Link hinzugefügt. Trage unter „Takt-Zeiten“ ein, wann Takt 1 im Video beginnt.'));
    },
  };

  // ------------------------------------------------------------------ fingering popover
  const Finger = {
    ni: null,
    open(ni, x, y) {
      this.ni = ni;
      const pop = $('#fingerPop');
      this.render();
      pop.hidden = false;
      const w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, x - w / 2)) + 'px';
      pop.style.top = (y + h + 16 > window.innerHeight ? Math.max(12, y - h - 12) : y + 12) + 'px';
      const first = pop.querySelector('button[aria-pressed="true"]') || pop.querySelector('button');
      if (first) first.focus();
    },
    close() { $('#fingerPop').hidden = true; this.ni = null; },
    render() {
      const ni = this.ni, n = score.notes[ni], fg = fingering[ni];
      const strings = IT.Fingering.playableStrings(n);
      const fingers = IT.Fingering.fingersOn(n, fg.s);
      const ov = overrides[ni];
      const tf = teacherFing[ni];
      $('#fingerPop').innerHTML = `
        <h3>${L('T. {m}', { m: n.m })} · ${escapeHtml(noteName(n))}</h3>
        <div class="field"><span class="lbl">${L('Saite')}</span><div class="seg" data-g="s">${[0, 1, 2, 3].map(s => `<button type="button" data-v="${s}" aria-pressed="${fg.s === s}" ${strings.includes(s) ? '' : 'disabled'}>${SNAME[s]}</button>`).join('')}</div></div>
        <div class="field"><span class="lbl">${L('Finger')}</span><div class="seg" data-g="f">${[0, 1, 2, 3, 4].map(f => `<button type="button" data-v="${f}" aria-pressed="${fg.f === f}" ${fingers.includes(f) ? '' : 'disabled'}>${f === 0 ? '0' : f}</button>`).join('')}</div></div>
        <p class="muted">${IT.Fingering.positionLabel(fg)} · ${L(ov ? 'eigener Fingersatz' : tf ? 'Fingersatz vom Lehrer' : 'Vorschlag des Trainers')}</p>
        <div class="row split"><button type="button" class="btn small" data-reset ${ov ? '' : 'disabled'}>${L(tf ? 'Lehrer-Fingersatz wiederherstellen' : 'Vorschlag wiederherstellen')}</button><button type="button" class="btn small primary" data-close>${L('Fertig')}</button></div>`;
      const pop = $('#fingerPop');
      pop.querySelectorAll('.seg[data-g=s] button').forEach(b => b.addEventListener('click', () => {
        const s = +b.dataset.v;
        const fs = IT.Fingering.fingersOn(n, s);
        const f = fs.includes(fingering[ni].f) ? fingering[ni].f : fs[0];
        this.set({ s, f });
      }));
      pop.querySelectorAll('.seg[data-g=f] button').forEach(b => b.addEventListener('click', () => this.set({ s: fingering[ni].s, f: +b.dataset.v })));
      pop.querySelector('[data-reset]').addEventListener('click', () => { delete overrides[ni]; this.apply(); });
      pop.querySelector('[data-close]').addEventListener('click', () => this.close());
    },
    set(o) { overrides[this.ni] = o; this.apply(); },
    apply() {
      store.set('overrides', overrides);
      fingering = IT.Fingering.solve(score.notes, mergedOverrides());
      if (view) { view.opts.overrides = overrides; view.opts.teacher = teacherFing; view.setFingering(fingering); }
      const st = Step.steps[Step.idx];
      if (st && mode === 'step') Tuner.setTarget(st.head, Step.steps[Step.idx + 1] ? Step.steps[Step.idx + 1].head : null);
      if (this.ni != null) this.render();
    },
  };

  // ------------------------------------------------------------------ modes
  const MODES = ['step', 'passage', 'refs', 'tasks'];
  function setMode(m) {
    if (!MODES.includes(m)) m = 'step';
    mode = m;
    for (const t of MODES) {
      $('#tab-' + t).setAttribute('aria-selected', String(t === m));
      $('#panel-' + t).hidden = t !== m;
    }
    Passage.showingNote = false;
    $('#targetLabel').textContent = L('Zielton');
    if (m === 'step') {
      Step.setIdx(Step.idx, false);
      if (Passage.last && view) view.clearStates();
    } else {
      Step.pause();
      if (view) view.setCurrent([], false);
      const first = score.notesInRange(sel.m1, sel.m2)[0];
      Tuner.setTarget(first || null, null);
      if (m === 'passage' && Passage.last) Passage.showResult(Passage.last);
    }
    if (m === 'refs') Refs.render();
    if (m === 'tasks' && IT.Tasks) IT.Tasks.render();
    store.set('mode', m);
  }

  /** Re-read slider/toggle values after settings were changed from elsewhere (tasks). */
  function syncControls() {
    $('#tolRange').value = settings.tol; $('#tolOut').textContent = `±${settings.tol} ct`;
    $('#holdRange').value = settings.holdMs; $('#holdOut').textContent = `${settings.holdMs} ms`;
    $('#tempoRange').value = settings.tempo;
    Tuner.updateZone();
    Passage.updateInfo();
  }

  // ------------------------------------------------------------------ settings dialog
  function openSettings() {
    const dlg = $('#settingsDlg');
    const a4 = settings.a4;
    $('#a4Sel').value = [415, 430, 440, 442, 443].includes(a4) ? String(a4) : 'custom';
    $('#a4Custom').value = a4;
    $('#namesSel').value = settings.names;
    $('#themeSel').value = settings.theme;
    $('#gateRange').value = settings.gate;
    $('#gateOut').textContent = Math.round(20 * Math.log10(gateRms())) + ' dB';
    $('#guidesOn').checked = settings.guides;
    IT.Audio.listInputs().then(devs => {
      const s = $('#devSel');
      s.innerHTML = `<option value="">${L('Standard')}</option>` + devs.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || L('Mikrofon {i}', { i: i + 1 }))}</option>`).join('');
      s.value = settings.deviceId || '';
    }).catch(() => { /* no list */ });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function setA4(v) {
    v = Math.max(400, Math.min(470, +v || 440));
    settings.a4 = v; IT.Audio.a4 = v; saveSettings();
  }

  // ------------------------------------------------------------------ init
  /** Re-render everything that holds translated text after a language switch. */
  function applyLanguage() {
    IT.i18n.apply();
    for (const sel2 of [$('#langSel'), $('#langSel2')]) if (sel2) sel2.value = IT.i18n.lang;
    buildSectionChips();
    Mic.renderLabel();
    $('#recLabel').textContent = L(Passage.recording ? 'Stopp' : 'Aufnehmen');
    $('#previewBtn').textContent = L(IT.Audio._seq ? '■ Stopp' : '♪ Vorspielen');
    $('#playRecBtn').textContent = L(Passage.playing ? '■ Stopp' : '▶ Aufnahme anhören');
    if (!Refs.capturing) $('#refRecBtn').textContent = L('● Über Mikrofon mitschneiden');
    if (!IT.Reference.Player.playing()) $('#refPlayBtn').textContent = L('▶ Referenz');
    if (!Passage.last) $('#analysisTitle').textContent = L('Tonhöhenverlauf');
    setSelection(sel, { keepStep: true });
    Step.renderLabels();
    Step.renderStats();
    if (!Step.running) setHint(L('Wähle Takte in den Noten und starte das Mikrofon.'));
    setMode(mode);
    if (view) view.rerender();
    if (chart) chart.draw();
    if (IT.Tasks && IT.app) IT.Tasks.render();
    syncStage();
  }

  function init() {
    IT.i18n.apply();
    for (const ls of [$('#langSel'), $('#langSel2')]) {
      if (!ls) continue;
      ls.value = IT.i18n.lang;
      ls.addEventListener('change', e => IT.i18n.setLang(e.target.value));
    }
    IT.i18n.onChange(applyLanguage);
    $('#recLabel').textContent = L('Aufnehmen');
    $('#previewBtn').textContent = L('♪ Vorspielen');
    $('#playRecBtn').textContent = L('▶ Aufnahme anhören');
    $('#refRecBtn').textContent = L('● Über Mikrofon mitschneiden');
    $('#analysisTitle').textContent = L('Tonhöhenverlauf');
    $('#targetLabel').textContent = L('Zielton');
    setHint(L('Wähle Takte in den Noten und starte das Mikrofon.'));
    Mic.renderLabel();
    buildSectionChips();
    // score view
    const scoreEl = $('#score');
    if (window.Vex && window.Vex.Flow) {
      view = new IT.ScoreView(scoreEl, score, { scrollRoot: window.matchMedia('(max-width: 860px)').matches ? null : $('#sheet'), showLane: settings.lane, overrides, teacher: teacherFing });
      view.fingering = fingering;
      view.on('select', s => setSelection(s, { keepStep: false }));
      view.on('measureclick', ({ m, note }) => {
        if (mode === 'step') {
          if (m < sel.m1 || m > sel.m2) {
            const sec = score.sectionAt(m);
            setSelection({ m1: sec.from, m2: sec.to });
          }
          if (note != null) Step.rebuild(note);
        } else if (mode === 'passage' && Passage.last && note != null && Passage.last.notes.some(q => q.ni === note) ) {
          Passage.showNote(note);
        } else {
          setSelection({ m1: m, m2: m });
        }
      });
      view.on('noteclick', ({ ni, event }) => Finger.open(ni, event.clientX, event.clientY));
      view.on('layout', () => { view.setSelection(sel); });
    } else {
      scoreEl.innerHTML = `<p class="score-loading">${L('Die Notensatz-Bibliothek konnte nicht geladen werden. Bitte mit Internetverbindung neu laden.')}</p>`;
    }
    // chart
    chart = new IT.PitchChart($('#chart'), $('#chartTip'));
    chart.onSelect = ni => Passage.showNote(ni);
    // 3D violin on the stage
    syncStage();
    try {
      if (IT.Violin3D && window.THREE) {
        violin = new IT.Violin3D($('#viewer'), {
          palette: palette(), view: settings.view3d || undefined, intro: true, insets: stageInsets(),
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        if (violin.setGuides) violin.setGuides(settings.guides);
      } else {
        $('#viewer').innerHTML = `<div class="viewer-fallback">${L('Die 3D-Ansicht konnte nicht geladen werden (offline?). Saite und Finger stehen im Stimmgerät darunter.')}</div>`;
      }
    } catch (e) {
      console.error(e);
      violin = null;
      $('#viewer').innerHTML = `<div class="viewer-fallback">${L('3D-Ansicht nicht verfügbar.')}</div>`;
    }
    const markView = v => $$('.views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    $$('.views button').forEach(b => b.addEventListener('click', () => {
      if (violin) violin.setView(b.dataset.view);
      settings.view3d = b.dataset.view; saveSettings(); markView(b.dataset.view);
    }));
    markView(settings.view3d || (violin && violin.view) || '');
    $('#stageSizeBtn').addEventListener('click', () => {
      settings.stage = settings.stage === 'compact' ? 'large' : 'compact';
      saveSettings(); syncStage();
    });
    // the HUD changes height with the layout (window width, language, wrapped hints)
    if (window.ResizeObserver) new ResizeObserver(syncInsets).observe($('#tuner'));

    // controls
    $$('.tab').forEach(t => t.addEventListener('click', () => setMode(t.id.replace('tab-', ''))));
    $('.tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = MODES.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : -1);
      const m = MODES[(i + MODES.length) % MODES.length];
      setMode(m); $('#tab-' + m).focus();
    });
    $('#micBtn').addEventListener('click', () => (Mic.on ? Mic.stop() : Mic.start()));
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#helpBtn').addEventListener('click', () => { const d = $('#helpDlg'); d.showModal ? d.showModal() : d.setAttribute('open', ''); });
    const rangeChange = () => setSelection({ m1: +$('#mFrom').value, m2: +$('#mTo').value }, { scroll: true });
    $('#mFrom').addEventListener('change', rangeChange);
    $('#mTo').addEventListener('change', rangeChange);
    $('#wholeBtn').addEventListener('click', () => setSelection({ m1: 1, m2: score.measureCount }, { scroll: true }));
    $('#laneToggle').checked = settings.lane;
    $('#laneToggle').addEventListener('change', e => { settings.lane = e.target.checked; saveSettings(); if (view) view.setShowLane(settings.lane); });

    // step controls
    $('#stepStart').addEventListener('click', () => Step.toggle());
    $('#stepNext').addEventListener('click', () => Step.next(true));
    $('#stepPrev').addEventListener('click', () => Step.prev());
    $('#stepTone').addEventListener('click', () => { const st = Step.steps[Step.idx]; if (st) IT.Audio.playTone(st.midi, 1.1); });
    const tol = $('#tolRange'), hold = $('#holdRange');
    tol.value = settings.tol; $('#tolOut').textContent = `±${settings.tol} ct`;
    hold.value = settings.holdMs; $('#holdOut').textContent = `${settings.holdMs} ms`;
    tol.addEventListener('input', () => { settings.tol = +tol.value; $('#tolOut').textContent = `±${settings.tol} ct`; Tuner.updateZone(); saveSettings(); });
    hold.addEventListener('input', () => { settings.holdMs = +hold.value; $('#holdOut').textContent = `${settings.holdMs} ms`; saveSettings(); });
    const bindToggle = (id, key, after) => { const el = $(id); el.checked = settings[key]; el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); if (after) after(); }); };
    bindToggle('#autoTone', 'autoTone');
    bindToggle('#mergeRep', 'merge', () => Step.rebuild(Step.steps[Step.idx] && Step.steps[Step.idx].head.ni));
    bindToggle('#loopStep', 'loop');
    // passage controls
    const tr = $('#tempoRange');
    tr.value = settings.tempo;
    tr.addEventListener('input', () => { settings.tempo = +tr.value; saveSettings(); Passage.updateInfo(); });
    bindToggle('#countIn', 'countIn');
    bindToggle('#metroOn', 'metro');
    bindToggle('#followOn', 'follow');
    $('#recBtn').addEventListener('click', () => Passage.toggleRecord());
    $('#previewBtn').addEventListener('click', () => Passage.preview());
    $('#refPlayBtn').addEventListener('click', () => { const r = Refs.active(); if (r) Refs.play(r, null); });
    $('#demoBtn').addEventListener('click', () => Passage.demo());
    $('#analyzeFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) Passage.analyzeFile(f); });
    $('#playRecBtn').addEventListener('click', () => Passage.playRecording());
    $('#closeAnalysisBtn').addEventListener('click', () => { $('#analysisBand').hidden = true; });
    // references
    $('#refFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; Refs.addFile(f); });
    $('#refRecBtn').addEventListener('click', () => Refs.toggleCapture());
    $('#ytAdd').addEventListener('click', () => Refs.addLink());
    const drop = $('#refDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) Refs.addFile(f); });
    const rr = $('#refRate');
    rr.value = settings.refRate; $('#refRateOut').textContent = settings.refRate + ' %';
    rr.addEventListener('input', () => { settings.refRate = +rr.value; $('#refRateOut').textContent = settings.refRate + ' %'; saveSettings(); const el = IT.Reference.Player.el; if (el) el.playbackRate = settings.refRate / 100; });
    bindToggle('#refLoop', 'refLoop');

    // settings dialog
    $('#a4Sel').addEventListener('change', e => { if (e.target.value !== 'custom') { setA4(+e.target.value); $('#a4Custom').value = settings.a4; } });
    $('#a4Custom').addEventListener('change', e => { setA4(e.target.value); $('#a4Sel').value = [415, 430, 440, 442, 443].includes(settings.a4) ? String(settings.a4) : 'custom'; });
    $('#namesSel').addEventListener('change', e => { settings.names = e.target.value; saveSettings(); setMode(mode); });
    $('#themeSel').addEventListener('change', e => { settings.theme = e.target.value; saveSettings(); applyTheme(); });
    $('#gateRange').addEventListener('input', e => { settings.gate = +e.target.value; saveSettings(); $('#gateOut').textContent = Math.round(20 * Math.log10(gateRms())) + ' dB'; });
    $('#devSel').addEventListener('change', async e => { settings.deviceId = e.target.value; saveSettings(); if (Mic.on) await Mic.start(); });
    $('#guidesOn').addEventListener('change', e => { settings.guides = e.target.checked; saveSettings(); if (violin && violin.setGuides) violin.setGuides(settings.guides); });
    $('#resetFing').addEventListener('click', () => { overrides = {}; Finger.apply(); toast(L('Fingersätze auf Vorschläge zurückgesetzt.')); });
    $('#resetHist').addEventListener('click', () => { store.set('history', {}); Passage.renderHistory(); toast(L('Übungsverlauf gelöscht.')); });

    // live frames
    IT.Audio.onFrame(ev => {
      const midi = Tuner.frame(ev);
      if (mode === 'step') Step.onFrame(ev, midi);
    });

    // keyboard
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, select, textarea, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !e.target.closest('button, a')) {
        e.preventDefault();
        if (mode === 'step') Step.toggle();
        else if (mode === 'passage') Passage.toggleRecord();
      } else if (e.key === 'ArrowRight' && mode === 'step') { Step.next(true); }
      else if (e.key === 'ArrowLeft' && mode === 'step') { Step.prev(); }
      else if (e.key === 'r' || e.key === 'R') { const st = Step.steps[Step.idx]; const t = mode === 'step' ? st && st.midi : Tuner.target && Tuner.target.midi; if (t) IT.Audio.playTone(t, 1.1); }
      else if (e.key === 'Escape') {
        if (!$('#fingerPop').hidden) Finger.close();
        Step.pause();
        if (Passage.recording) Passage.stop();
        IT.Audio.stopSequence(); IT.Reference.Player.stop(); Passage.stopPlayback();
      }
    });
    document.addEventListener('pointerdown', e => { if (!$('#fingerPop').hidden && !e.target.closest('#fingerPop') && !e.target.closest('.fing')) Finger.close(); });

    // API for the tasks module (teacher ↔ student)
    IT.app = {
      score, settings, saveSettings, store, toast, fmtTime, fmtCents, parseTime, escapeHtml, noteName,
      get sel() { return sel; }, setSelection, setMode, get mode() { return mode; }, syncControls,
      get fingering() { return fingering; },
      getOverrides: () => overrides,
      getTeacherFing: () => teacherFing,
      setTeacherFing(map) { teacherFing = map || {}; store.set('teacherFing', teacherFing); Finger.apply(); },
      setA4,
      Passage, Refs, Step, Mic,
      fillOnsets, onsetsFromResult,
      recordFor(range, tempo, purpose) {
        return new Promise(resolve => {
          setSelection(range, { scroll: true });
          Passage._purposeDone = ok => { Passage._purposeDone = null; resolve(ok); };
          Passage.start({ purpose, tempo }).then(started => { if (!started) { Passage._purposeDone = null; resolve(false); } });
        });
      },
      stopRecording() { if (Passage.recording) Passage.stop(); },
      isRecording() { return Passage.recording || Refs.capturing; },
    };

    applyTheme();
    if (IT.Tasks) IT.Tasks.init();
    setSelection(sel, { scroll: false });
    setMode(store.get('mode', 'step'));
    Refs.load();
    if (!store.get('helpSeen', false)) {
      store.set('helpSeen', true);
      setTimeout(() => { const d = $('#helpDlg'); if (d.showModal) d.showModal(); }, 400);
    }
    if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      toast(L('Hinweis: Das Mikrofon funktioniert nur über https:// oder lokal geöffnet.'), 8000);
    }
  }

  // developer / test hooks (used for automated checks; harmless for users)
  IT.dev = {
    get state() { return { mode, sel, step: Step.idx, steps: Step.steps.length, running: Step.running, last: Passage.last && Passage.last.summary }; },
    /** Feed a synthetic tone into the live input: returns {set(midi, cents), stop()} */
    async tone(midi, cents = 0) {
      let osc, g;
      await IT.Audio.startSimulatedInput(ctx => {
        osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        g = ctx.createGain(); g.gain.value = 0.2;
        osc.connect(g);
        osc.start();
        return g;
      });
      Mic.on = true;
      const set = (m, c = 0) => {
        const now = IT.Audio.ctx.currentTime;
        g.gain.setValueAtTime(m == null ? 0 : 0.2, now);
        if (m != null) osc.frequency.setValueAtTime(settings.a4 * Math.pow(2, (m - 69 + c / 100) / 12), now);
      };
      set(midi, cents);
      return { set, osc, gain: g, stop: () => { IT.Audio.stopMic(); Mic.on = false; } };
    },
    Step, Passage, Refs, get view() { return view; }, get violin() { return violin; }, score, get fingering() { return fingering; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
