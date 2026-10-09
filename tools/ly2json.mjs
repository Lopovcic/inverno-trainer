// LilyPond (\relative, Dutch note names) -> Inverno-Trainer score data.
// Covers exactly the constructs used in Mutopia's winter3.ly (Vivaldi, L'inverno, III):
// notes, rests, spacers, chords, \times tuplets, << >> voices, slurs, beams,
// articulations, text scripts, \mark, fermata, bar checks.
//
// Usage:
//   curl -s https://www.mutopiaproject.org/ftp/VivaldiA/O8/winter/winter-lys/winter3.ly \
//     | node tools/ly2json.mjs > js/score-data.js
import fs from 'node:fs';

const src = fs.readFileSync(0, 'utf8');
const TICKS_WHOLE = 1920;            // 1/32 = 60, 16th-triplet = 80
const MEASURE_TICKS = TICKS_WHOLE * 3 / 8;
const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = 'cdefgab';

// ---------------------------------------------------------------- scanner
const start = src.indexOf('\\relative');
if (start < 0) throw new Error('no \\relative block');
let pos = start;
const s = src;

function err(msg) {
  const line = s.slice(0, pos).split('\n').length;
  throw new Error(`${msg} (line ${line}): …${s.slice(pos, pos + 40)}…`);
}
function skipWs() {
  for (;;) {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    if (s[pos] === '%') { while (pos < s.length && s[pos] !== '\n') pos++; continue; }
    break;
  }
}
function peek(str) { skipWs(); return s.startsWith(str, pos); }
function eat(str) { if (!peek(str)) err(`expected ${str}`); pos += str.length; }
function readString() { // at '"'
  pos++; let out = '';
  while (s[pos] !== '"') { out += s[pos]; pos++; }
  pos++; return out;
}
function skipBalanced(open, close) { // at open
  let depth = 0;
  do {
    if (s[pos] === '"') { readString(); continue; }
    if (s[pos] === open) depth++;
    else if (s[pos] === close) depth--;
    pos++;
  } while (depth > 0 && pos < s.length);
}
function readMarkup() { // after \markup ; returns concatenated quoted strings
  skipWs();
  if (s[pos] === '"') return readString();
  const from = pos; skipBalanced('{', '}');
  const body = s.slice(from, pos);
  return [...body.matchAll(/"([^"]*)"/g)].map(m => m[1]).join(' ');
}
function readCommand() { // at '\'
  pos++; const m = /^[a-zA-Z]+/.exec(s.slice(pos)); pos += m[0].length; return m[0];
}
function readScheme() { // at '#'
  pos++;
  if (s[pos] === "'") pos++;
  if (s[pos] === '(') skipBalanced('(', ')');
  else { while (pos < s.length && !/\s/.test(s[pos])) pos++; }
}

// ---------------------------------------------------------------- pitch helpers
function parsePitchToken() {
  // letter + accidental suffix + octave marks + !/?
  const letter = s[pos];
  const step = LETTERS.indexOf(letter);
  pos++;
  let alter = 0;
  const rest = s.slice(pos, pos + 4);
  const sufs = [['isis', 2], ['eses', -2], ['ases', -2], ['is', 1], ['es', -1]];
  let matched = false;
  for (const [suf, a] of sufs) {
    if (rest.startsWith(suf)) { alter = a; pos += suf.length; matched = true; break; }
  }
  if (!matched && (letter === 'a' || letter === 'e') && s[pos] === 's') { alter = -1; pos++; }
  let oct = 0;
  while (s[pos] === "'" || s[pos] === ',') { oct += s[pos] === "'" ? 1 : -1; pos++; }
  let reminder = null;
  if (s[pos] === '!') { reminder = '!'; pos++; } else if (s[pos] === '?') { reminder = '?'; pos++; }
  return { step, alter, oct, reminder };
}
function relativize(prevD, step, octMarks) {
  let d = Math.floor(prevD / 7) * 7 + step;
  while (d - prevD > 3) d -= 7;
  while (prevD - d > 3) d += 7;
  return d + 7 * octMarks;
}
function absPitch(d, alter) {
  const octave = Math.floor(d / 7), step = ((d % 7) + 7) % 7;
  return { step: LETTERS[step], alter, octave, midi: 12 * (octave + 1) + STEP_SEMI[step] + alter };
}

// ---------------------------------------------------------------- parser state
let lastDur = { base: 4, dots: 0 };
function readDuration() {
  const m = /^(64|32|16|8|4|2|1)(\.*)/.exec(s.slice(pos));
  if (m) { pos += m[0].length; lastDur = { base: +m[1], dots: m[2].length }; }
  return { ...lastDur };
}
function durTicks(d, tuplet) {
  let t = TICKS_WHOLE / d.base, add = t;
  for (let i = 0; i < d.dots; i++) { add /= 2; t += add; }
  if (tuplet) t = t * tuplet[0] / tuplet[1];
  if (!Number.isInteger(t)) err('non-integer ticks');
  return t;
}

// postfix events after a note/chord/rest
function readPostfix(ev) {
  for (;;) {
    skipWs();
    const c = s[pos];
    if (c === '(') { ev.slurStart = true; pos++; continue; }
    if (c === ')') { ev.slurEnd = true; pos++; continue; }
    if (c === '[') { ev.beamStart = true; pos++; continue; }
    if (c === ']') { ev.beamEnd = true; pos++; continue; }
    if (c === '~') { ev.tie = true; pos++; continue; }
    if (c === '-' || c === '_' || c === '^') {
      const dir = c; pos++;
      const n = s[pos];
      if (n === '"') { addText(ev, dir, readString()); continue; }
      if (n === '\\') {
        const cmd = readCommand();
        if (cmd === 'markup') { addText(ev, dir, readMarkup()); continue; }
        if (cmd === 'fermata') { ev.fermata = true; continue; }
        (ev.artic ||= []).push(cmd); continue;
      }
      if (n === '.') { (ev.artic ||= []).push('staccato'); pos++; continue; }
      if (n === '|') { (ev.artic ||= []).push('wedge'); pos++; continue; }
      if (n === '>') { (ev.artic ||= []).push('accent'); pos++; continue; }
      if (n === '-') { (ev.artic ||= []).push('tenuto'); pos++; continue; }
      if (n === '^') { (ev.artic ||= []).push('marcato'); pos++; continue; }
      err('unknown postfix');
    }
    break;
  }
}
function addText(ev, dir, text) {
  (ev.texts ||= []).push({ place: dir === '^' ? 'above' : 'below', text: text.trim() });
}

// ---------------------------------------------------------------- music
let relD;            // diatonic index of last pitch (relative reference)
let time = 0;        // ticks
const voices = { main: [], second: [] };
const marks = [];
let pendingMark = null;

function parseSequential(ctx) {
  // ctx: { voice, tuplet }
  eat('{');
  for (;;) {
    skipWs();
    if (s[pos] === '}') { pos++; return; }
    parseElement(ctx);
  }
}

function parseElement(ctx) {
  skipWs();
  const c = s[pos];
  if (c === '|') { // bar check
    pos++;
    if (time % MEASURE_TICKS !== 0) err(`bar check failed at tick ${time} (measure ${time / MEASURE_TICKS + 1})`);
    return;
  }
  if (c === '#') { readScheme(); return; }
  if (c === '\\') {
    const cmd = readCommand();
    switch (cmd) {
      case 'mark': skipWs(); pendingMark = readString(); marks.push({ measure: Math.floor(time / MEASURE_TICKS) + 1, label: pendingMark }); return;
      case 'set': { // \set prop = value
        skipWs(); while (!/[\s=]/.test(s[pos])) pos++; eat('='); skipWs();
        if (s[pos] === '#') readScheme(); else while (!/\s/.test(s[pos])) pos++;
        return;
      }
      case 'times': {
        skipWs(); const m = /^(\d+)\/(\d+)/.exec(s.slice(pos)); pos += m[0].length;
        parseSequential({ ...ctx, tuplet: [+m[1], +m[2]] });
        return;
      }
      case 'bar': skipWs(); readString(); return;
      case 'newSpacingSection': case 'voiceOne': case 'voiceTwo': case 'oneVoice': return;
      case 'context': { // \context Voice = NAME { ... }  (only inside << >>)
        skipWs(); while (!/\s/.test(s[pos])) pos++; eat('='); skipWs(); while (!/[\s{]/.test(s[pos])) pos++;
        parseSequential(ctx);
        return;
      }
      default: err(`unknown command \\${cmd}`);
    }
  }
  if (s.startsWith('<<', pos)) { parseSimultaneous(ctx); return; }
  if (c === '<') { parseChord(ctx); return; }
  if (c === '{') { parseSequential(ctx); return; }
  if (c === 'r' || c === 's') {
    pos++;
    const dur = readDuration();
    const ev = { kind: c === 'r' ? 'rest' : 'spacer', t: time, dur, ticks: durTicks(dur, ctx.tuplet), tuplet: ctx.tuplet || null };
    readPostfix(ev);
    if (ev.kind === 'rest') voices[ctx.voice].push(ev);
    time += ev.ticks;
    return;
  }
  if (LETTERS.includes(c)) {
    const p = parsePitchToken();
    relD = relativize(relD, p.step, p.oct);
    const pitch = absPitch(relD, p.alter);
    const dur = readDuration();
    const ev = { kind: 'note', t: time, pitch, reminder: p.reminder, dur, ticks: durTicks(dur, ctx.tuplet), tuplet: ctx.tuplet || null };
    readPostfix(ev);
    voices[ctx.voice].push(ev);
    time += ev.ticks;
    return;
  }
  err('unexpected token');
}

function parseChord(ctx) {
  eat('<');
  const pitches = [];
  let firstD = null;
  for (;;) {
    skipWs();
    if (s[pos] === '>') { pos++; break; }
    const p = parsePitchToken();
    relD = relativize(relD, p.step, p.oct);
    if (firstD === null) firstD = relD;
    pitches.push({ ...absPitch(relD, p.alter), reminder: p.reminder });
  }
  relD = firstD; // LilyPond: next note is relative to the chord's first pitch
  const dur = readDuration();
  const ev = { kind: 'chord', t: time, pitches, dur, ticks: durTicks(dur, ctx.tuplet), tuplet: ctx.tuplet || null };
  readPostfix(ev);
  voices[ctx.voice].push(ev);
  time += ev.ticks;
}

function parseSimultaneous(ctx) {
  eat('<<');
  const t0 = time;
  let tEnd = t0;
  let idx = 0;
  for (;;) {
    skipWs();
    if (s.startsWith('>>', pos)) { pos += 2; break; }
    time = t0;
    // first voice expression -> second voice (VB, lower), second -> main (VA, upper).
    // Relative pitch is chained through the voices in input order (LilyPond 2.12).
    parseElement({ ...ctx, voice: idx === 0 ? 'second' : 'main' });
    tEnd = Math.max(tEnd, time);
    idx++;
  }
  time = tEnd;
}

// ---------------------------------------------------------------- run
// a \mark written before \relative belongs to measure 1
{
  const pre = /\\mark\s+"([^"]+)"/.exec(src.slice(src.lastIndexOf('{', start), start));
  if (pre) marks.push({ measure: 1, label: pre[1] });
}
pos = start + '\\relative'.length;
skipWs();
{ const p = parsePitchToken(); relD = p.step + 7 * (3 + p.oct); } // f'' -> F5 (c = C3)
parseSequential({ voice: 'main', tuplet: null });

const totalMeasures = time / MEASURE_TICKS;
if (!Number.isInteger(totalMeasures)) throw new Error('total length not whole measures');

// ---------------------------------------------------------------- output shaping
const out = [];
for (const ev of voices.main) {
  const m = Math.floor(ev.t / MEASURE_TICKS) + 1;
  const o = {
    m, t: ev.t, d: ev.ticks,
    dur: ev.dur.base + '.'.repeat(ev.dur.dots),
  };
  if (ev.kind === 'rest') o.rest = true;
  else {
    o.step = ev.pitch.step; o.alter = ev.pitch.alter; o.oct = ev.pitch.octave; o.midi = ev.pitch.midi;
    if (ev.reminder) o.acc = ev.reminder;
  }
  if (ev.tuplet) o.tup = ev.tuplet;
  if (ev.slurStart) o.sl = 1;
  if (ev.slurEnd) o.se = 1;
  if (ev.beamStart) o.bs = 1;
  if (ev.beamEnd) o.be = 1;
  if (ev.artic) o.art = ev.artic;
  if (ev.fermata) o.ferm = 1;
  if (ev.texts) o.tx = ev.texts;
  out.push(o);
}
// attach the lower-voice chord of m. 85 to the simultaneous main-voice note
for (const ev of voices.second) {
  if (ev.kind !== 'chord') continue;
  const host = out.find(o => o.t === ev.t && !o.rest);
  host.chord = { d: ev.ticks, dur: ev.dur.base + '.'.repeat(ev.dur.dots),
    notes: ev.pitches.map(p => ({ step: p.step, alter: p.alter, oct: p.octave, midi: p.midi, acc: p.reminder || undefined })) };
  if (ev.texts) host.tx = [...(host.tx || []), ...ev.texts];
}

// per-measure validation
const perMeasure = new Map();
for (const o of out) perMeasure.set(o.m, (perMeasure.get(o.m) || 0) + o.d);
for (let m = 1; m <= totalMeasures; m++) {
  if (perMeasure.get(m) !== MEASURE_TICKS) throw new Error(`measure ${m} has ${perMeasure.get(m)} ticks`);
}

const notes = out.filter(o => !o.rest);
const midis = notes.map(n => n.midi);
const stats = {
  measures: totalMeasures, events: out.length, notes: notes.length,
  lowest: Math.min(...midis), highest: Math.max(...midis),
};
process.stderr.write(JSON.stringify(stats) + '\n');

const data = {
  id: 'vivaldi-rv297-3',
  title: "L'inverno · III. Allegro",
  composer: 'Antonio Vivaldi',
  work: 'Concerto f-Moll op. 8 Nr. 4, RV 297 „Der Winter“',
  part: 'Violino principale',
  key: { fifths: -4, mode: 'minor', vex: 'Fm' },
  time: [3, 8],
  ticksPerWhole: TICKS_WHOLE,
  measureTicks: MEASURE_TICKS,
  measures: totalMeasures,
  marks,
  source: {
    text: 'Notentext: Mutopia Project (Mutopia-2010/02/08-351), nach dem Faksimile der Erstausgabe Amsterdam 1725. Lizenz CC BY-SA 3.0.',
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=351',
    license: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  events: out,
};
process.stdout.write('// Generated by tools/ly2json.mjs from Mutopia winter3.ly — do not edit by hand.\n');
process.stdout.write('// Source: Mutopia Project, Mutopia-2010/02/08-351, CC BY-SA 3.0.\n');
process.stdout.write('window.IT = window.IT || {};\nwindow.IT.SCORE_RAW = ' + JSON.stringify(data) + ';\n');
