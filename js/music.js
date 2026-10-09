/* Inverno-Trainer · music.js
 * Pitch helpers, note naming (German Helmholtz or English) and the score model
 * built from the generated raw data (js/score-data.js).
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  const STEP_INDEX = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
  const DE_NAT = { c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', a: 'a', b: 'h' };
  const DE_FLAT = { c: 'ces', d: 'des', e: 'es', f: 'fes', g: 'ges', a: 'as', b: 'b' };
  const DE_SHARP = { c: 'cis', d: 'dis', e: 'eis', f: 'fis', g: 'gis', a: 'ais', b: 'his' };
  const PC_DE = ['c', 'cis', 'd', 'es', 'e', 'f', 'fis', 'g', 'as', 'a', 'b', 'h'];
  const PC_EN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  // Violin strings, low to high. Index 0 = G … 3 = E.
  const STRINGS = [
    { id: 0, name: 'G', midi: 55, roman: 'IV' },
    { id: 1, name: 'D', midi: 62, roman: 'III' },
    { id: 2, name: 'A', midi: 69, roman: 'II' },
    { id: 3, name: 'E', midi: 76, roman: 'I' },
  ];

  const Music = {
    STRINGS,
    STEP_INDEX,

    midiToFreq(m, a4 = 440) { return a4 * Math.pow(2, (m - 69) / 12); },
    freqToMidi(f, a4 = 440) { return 69 + 12 * Math.log2(f / a4); },

    /** German name with Helmholtz octave marks, e.g. as′′ for A♭5. */
    nameDe(step, alter, oct) {
      let base = alter === 0 ? DE_NAT[step] : alter < 0 ? DE_FLAT[step] : DE_SHARP[step];
      if (alter === -2) base = step === 'b' ? 'heses' : DE_FLAT[step] + 'es';
      if (alter === 2) base = DE_SHARP[step] + 'is';
      if (oct <= 2) return base[0].toUpperCase() + base.slice(1) + (oct < 2 ? '͵'.repeat(2 - oct) : '');
      return base + '′'.repeat(oct - 3);
    },
    nameEn(step, alter, oct) {
      const acc = alter === -1 ? '♭' : alter === 1 ? '♯' : alter === -2 ? '𝄫' : alter === 2 ? '𝄪' : '';
      return step.toUpperCase() + acc + oct;
    },
    noteName(n, style = 'de') {
      return style === 'en' ? Music.nameEn(n.step, n.alter, n.oct) : Music.nameDe(n.step, n.alter, n.oct);
    },
    /** Name of the nearest equal-tempered pitch for a (float) MIDI value. */
    midiName(m, style = 'de') {
      const r = Math.round(m), pc = ((r % 12) + 12) % 12, oct = Math.floor(r / 12) - 1;
      if (style === 'en') return PC_EN[pc] + oct;
      const b = PC_DE[pc];
      if (oct <= 2) return b[0].toUpperCase() + b.slice(1);
      return b + '′'.repeat(oct - 3);
    },
    /** Finger position along the string from the nut, in mm (4/4 violin, 328 mm). */
    fingerMM(semis) { return 328 * (1 - Math.pow(2, -semis / 12)); },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  };
  IT.Music = Music;

  // ------------------------------------------------------------------ score model
  // Sonnet lines (Mutopia winter-sonnet.ly) with a German paraphrase.
  const SONNET = [
    { m: 1, it: "Caminar sopra 'l giaccio,", de: 'Über das Eis gehen,', sr: 'Hodati po ledu,' },
    { m: 25, it: 'e à passo lento, per timor di cader, gersene intenti;', de: 'mit langsamen Schritten, aus Angst zu fallen, ganz vorsichtig;', sr: 'polaganim korakom, iz straha od pada, sasvim oprezno;' },
    { m: 40, it: 'Gir forte sdruzziolar, cader à terra,', de: 'heftig ausrutschen, zu Boden fallen,', sr: 'naglo se okliznuti, pasti na zemlju,' },
    { m: 51, it: "Di nuovo ir sopra 'l giaccio e correr forte", de: 'wieder aufs Eis gehen und schnell laufen,', sr: 'ponovo krenuti po ledu i brzo trčati,' },
    { m: 89, it: "Sin ch'il giaccio si rompe, e si disserra;", de: 'bis das Eis bricht und aufreißt;', sr: 'dok led ne pukne i ne otvori se;' },
    { m: 101, it: 'Sentir uscir dalle ferrate porte', de: 'hören, wie aus den eisernen Toren', sr: 'čuti kako iz okovanih vrata izlaze' },
    { m: 120, it: 'Sirocco, Borea, e tutti i venti in guerra', de: 'Schirokko, Bora und alle Winde im Kampf hervorbrechen –', sr: 'široko, bura i svi vetrovi u ratu –' },
    { m: 150, it: "Quest'è 'l verno, mà tal, che gioja apporte.", de: 'das ist der Winter, doch einer, der Freude bringt.', sr: 'to je zima, ali takva da donosi radost.' },
  ];
  // Tempo sections. Default practice tempi are given in eighth notes per minute.
  const TEMPI = [
    { from: 1, to: 100, label: 'Allegro', eighthBpm: 180 },
    { from: 101, to: 119, label: 'Lento', eighthBpm: 66 },
    { from: 120, to: 153, label: 'Allegro', eighthBpm: 180 },
  ];

  function buildScore(raw) {
    const TW = raw.ticksPerWhole, MT = raw.measureTicks;
    const T8 = TW / 8;
    const events = raw.events.map((e, i) => Object.assign({ ei: i }, e));
    const notes = [];
    for (const e of events) {
      if (e.rest) continue;
      e.ni = notes.length;
      notes.push(e);
    }
    // previous / next note links, rests in between
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      n.prev = i > 0 ? notes[i - 1] : null;
      n.next = i < notes.length - 1 ? notes[i + 1] : null;
      n.restBefore = !!(n.prev && n.prev.t + n.prev.d < n.t);
    }
    // measures
    const measures = [];
    for (let m = 1; m <= raw.measures; m++) {
      measures.push({ n: m, t: (m - 1) * MT, events: [], notes: [] });
    }
    for (const e of events) {
      measures[e.m - 1].events.push(e);
      if (!e.rest) measures[e.m - 1].notes.push(e);
    }
    // solo / tutti segments and other text cues
    let role = 'Solo';
    const roleAt = [];
    for (const m of measures) {
      for (const e of m.events) for (const tx of e.tx || []) {
        if (/tutti/i.test(tx.text)) role = 'Tutti';
        else if (/solo/i.test(tx.text)) role = 'Solo';
      }
      roleAt[m.n] = role;
      m.role = role;
    }
    // sections by rehearsal letter
    const marks = raw.marks.slice().sort((a, b) => a.measure - b.measure);
    const sections = marks.map((mk, i) => ({
      label: mk.label,
      from: mk.measure,
      to: i < marks.length - 1 ? marks[i + 1].measure - 1 : raw.measures,
    }));
    for (const s of sections) {
      const lines = SONNET.filter(l => l.m >= s.from && l.m <= s.to);
      s.sonnet = lines;
    }
    const tempoAt = m => TEMPI.find(t => m >= t.from && m <= t.to) || TEMPI[0];
    // seconds per tick at nominal tempo (used by fingering & synth)
    for (const e of events) {
      const tp = tempoAt(e.m);
      e.secPerTick = 60 / tp.eighthBpm / T8;
    }

    const score = {
      raw, events, notes, measures, sections, marks,
      sonnet: SONNET, tempi: TEMPI,
      ticksPerWhole: TW, measureTicks: MT, ticksPerEighth: T8,
      measureCount: raw.measures,
      tempoAt,
      sectionAt(m) { return sections.find(s => m >= s.from && m <= s.to) || sections[0]; },
      sonnetAt(m) { let cur = SONNET[0]; for (const l of SONNET) if (l.m <= m) cur = l; return cur; },
      roleAt(m) { return roleAt[m] || 'Solo'; },
      notesInRange(m1, m2) { return notes.filter(n => n.m >= m1 && n.m <= m2); },
      eventsInRange(m1, m2) { return events.filter(e => e.m >= m1 && e.m <= m2); },
      /**
       * Practice steps for "Ton für Ton": consecutive notes of equal pitch are merged
       * into one step when `merge` is set (repeated notes need no new pitch target).
       */
      steps(m1, m2, merge = true) {
        const out = [];
        for (const n of this.notesInRange(m1, m2)) {
          const last = out[out.length - 1];
          if (merge && last && last.midi === n.midi && last.notes[last.notes.length - 1].ni === n.ni - 1) {
            last.notes.push(n);
          } else {
            out.push({ midi: n.midi, notes: [n], head: n });
          }
        }
        return out;
      },
      /** Duration in seconds of a tick span at a tempo factor. */
      seconds(e, factor = 1) { return e.d * e.secPerTick / factor; },
    };
    return score;
  }

  IT.buildScore = buildScore;
})();
