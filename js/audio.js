/* Inverno-Trainer · audio.js
 * Microphone capture (AudioWorklet, ScriptProcessor fallback), live pitch frames,
 * raw recording, a violin-like reference synth, metronome clicks and playback.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  const WORKLET_SRC = `
class ITCapture extends AudioWorkletProcessor {
  constructor() { super(); this.size = 1024; this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let i = 0;
      while (i < ch.length) {
        const take = Math.min(ch.length - i, this.size - this.n);
        this.buf.set(ch.subarray(i, i + take), this.n);
        this.n += take; i += take;
        if (this.n === this.size) {
          this.port.postMessage({ frame: currentFrame, data: this.buf }, [this.buf.buffer]);
          this.buf = new Float32Array(this.size); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('it-capture', ITCapture);`;

  const HOP = 512;           // live analysis hop (samples)
  const FRAME = 2048;

  const A = {
    ctx: null,
    master: null,
    stream: null,
    source: null,
    node: null,
    mode: null,               // 'worklet' | 'script' | 'sim'
    detector: null,
    ring: new Float32Array(FRAME + 2048),
    ringFill: 0,
    sinceHop: 0,
    listeners: new Set(),
    recording: null,
    level: 0,
    deviceLabel: '',
    a4: 440,
    muteUntil: 0,            // ignore live input while our own synth sounds

    async ensureContext() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('Dieser Browser unterstützt kein Web Audio.');
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -10; comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    },

    micSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },

    async listInputs() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter(d => d.kind === 'audioinput');
    },

    /** Start the microphone. Resolves with {label, sampleRate}. */
    async startMic(deviceId) {
      await this.ensureContext();
      this.stopMic();
      if (!this.micSupported()) {
        throw new Error(window.isSecureContext === false
          ? 'Mikrofon nur über https:// oder lokal (file://, localhost) verfügbar.'
          : 'Dieser Browser erlaubt keinen Mikrofonzugriff.');
      }
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
      if (deviceId) audio.deviceId = { exact: deviceId };
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (e) {
        if (deviceId && e && e.name === 'OverconstrainedError') {
          delete audio.deviceId;
          this.stream = await navigator.mediaDevices.getUserMedia({ audio });
        } else throw e;
      }
      const track = this.stream.getAudioTracks()[0];
      this.deviceLabel = track ? track.label : '';
      this.source = this.ctx.createMediaStreamSource(this.stream);
      await this._attachCapture(this.source);
      return { label: this.deviceLabel, sampleRate: this.ctx.sampleRate };
    },

    async _attachCapture(src) {
      const ctx = this.ctx;
      this.detector = IT.Pitch.createDetector(ctx.sampleRate, { frameSize: FRAME });
      this.ringFill = 0; this.sinceHop = 0;
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      if (ctx.audioWorklet && window.AudioWorkletNode) {
        try {
          if (!this._workletLoaded) {
            const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
            await ctx.audioWorklet.addModule(url);
            this._workletLoaded = true;
          }
          const node = new AudioWorkletNode(ctx, 'it-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
          node.port.onmessage = ev => this._onChunk(ev.data.data, ev.data.frame / ctx.sampleRate);
          src.connect(node);
          node.connect(sink);
          this.node = node; this.mode = 'worklet';
          return;
        } catch (e) {
          console.warn('AudioWorklet nicht verfügbar, nutze ScriptProcessor', e);
        }
      }
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = ev => {
        const d = ev.inputBuffer.getChannelData(0);
        this._onChunk(new Float32Array(d), ctx.currentTime);
      };
      src.connect(sp);
      sp.connect(sink);
      this.node = sp; this.mode = 'script';
    },

    stopMic() {
      if (this.node) { try { this.node.disconnect(); } catch (_) { /* */ } this.node.port && (this.node.port.onmessage = null); }
      if (this.source) { try { this.source.disconnect(); } catch (_) { /* */ } }
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this._sim) { this._sim.stop(); this._sim = null; }
      this.node = this.source = this.stream = null;
      this.mode = null;
    },

    isLive() { return !!this.node; },

    /** Feed an arbitrary AudioNode instead of the microphone (tests / demo). */
    async startSimulatedInput(nodeFactory) {
      await this.ensureContext();
      this.stopMic();
      const node = nodeFactory(this.ctx);
      this.source = node;
      await this._attachCapture(node);
      this.mode = 'sim';
      this.deviceLabel = 'Simulation';
      return { label: 'Simulation', sampleRate: this.ctx.sampleRate };
    },

    _onChunk(data, endTime) {
      // recording
      if (this.recording) this.recording.chunks.push(data.slice ? data.slice() : new Float32Array(data));
      // ring buffer: newest samples at the end, capacity FRAME + one chunk
      const ring = this.ring, cap = ring.length;
      if (data.length >= cap) {
        ring.set(data.subarray(data.length - cap), 0);
        this.ringFill = cap;
      } else {
        const keep = Math.min(this.ringFill, cap - data.length);
        ring.copyWithin(0, this.ringFill - keep, this.ringFill);
        ring.set(data, keep);
        this.ringFill = keep + data.length;
      }
      this.sinceHop += data.length;
      if (this.ringFill < FRAME) return;
      // one or more analysis frames per chunk
      while (this.sinceHop >= HOP) {
        this.sinceHop -= HOP;
        const lag = this.sinceHop;           // samples after this frame's end
        const start = this.ringFill - FRAME - lag;
        if (start < 0) continue;
        const r = this.detector.detect(ring, start);
        const t = endTime - lag / this.ctx.sampleRate;
        this.level = this.level * 0.7 + r.rms * 0.3;
        const muted = t < this.muteUntil;
        const ev = {
          time: t, rms: r.rms, voiced: r.voiced && !muted, freq: r.freq, conf: r.conf,
          midi: r.voiced ? 69 + 12 * Math.log2(r.freq / this.a4) : NaN, muted,
        };
        for (const fn of this.listeners) fn(ev);
      }
    },

    onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

    startRecording() {
      if (!this.node) throw new Error('Mikrofon ist nicht aktiv.');
      this.recording = { chunks: [], startTime: this.ctx.currentTime, sr: this.ctx.sampleRate };
    },
    stopRecording() {
      const rec = this.recording;
      this.recording = null;
      if (!rec) return null;
      const len = rec.chunks.reduce((a, c) => a + c.length, 0);
      const out = new Float32Array(len);
      let o = 0;
      for (const c of rec.chunks) { out.set(c, o); o += c.length; }
      return { samples: out, sampleRate: rec.sr, startTime: rec.startTime };
    },
    isRecording() { return !!this.recording; },

    // ---------------------------------------------------------------- synth
    _voice(midi, when, dur, opts = {}) {
      const ctx = this.ctx;
      const f = this.a4 * Math.pow(2, (midi - 69) / 12);
      const out = ctx.createGain();
      out.gain.value = 0;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'sawtooth';
      o1.frequency.value = f; o2.frequency.value = f;
      o2.detune.value = 3;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 5.4;
      lfoG.gain.value = 0;
      lfo.connect(lfoG); lfoG.connect(o1.detune); lfoG.connect(o2.detune);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = Math.min(9500, 1800 + f * 4.5); lp.Q.value = 0.6;
      const body1 = ctx.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 290; body1.Q.value = 2.2; body1.gain.value = 5;
      const body2 = ctx.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 2900; body2.Q.value = 1.3; body2.gain.value = 4;
      const mix = ctx.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix);
      mix.connect(lp).connect(body1).connect(body2).connect(out).connect(this.master);
      const peak = (opts.gain ?? 0.22) * (midi > 84 ? 0.75 : 1);
      const atk = Math.min(0.06, dur * 0.3), rel = Math.min(0.12, dur * 0.4);
      out.gain.setValueAtTime(0, when);
      out.gain.linearRampToValueAtTime(peak, when + atk);
      out.gain.setValueAtTime(peak * 0.85, when + Math.max(atk, dur - rel));
      out.gain.linearRampToValueAtTime(0, when + dur);
      if (opts.vibrato !== false && dur > 0.35) {
        lfoG.gain.setValueAtTime(0, when + 0.2);
        lfoG.gain.linearRampToValueAtTime(11, when + 0.5);
      }
      const end = when + dur + 0.05;
      for (const o of [o1, o2, lfo]) { o.start(when); o.stop(end); }
      return { stop: (t = ctx.currentTime) => { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.04); for (const o of [o1, o2, lfo]) { try { o.stop(t + 0.06); } catch (_) { /* */ } } } };
    },

    /** Play one reference tone; returns a handle with stop(). Mutes live detection meanwhile. */
    async playTone(midi, dur = 0.9, opts = {}) {
      await this.ensureContext();
      if (this._tone) this._tone.stop();
      const when = this.ctx.currentTime + 0.02;
      this._tone = this._voice(midi, when, dur, opts);
      this.muteUntil = when + dur + 0.25;
      return this._tone;
    },

    /**
     * Schedule a note sequence. items: [{midi|null, start (s), dur (s), ni}]
     * onNote(item) fires (approximately) at each note start.
     */
    async playSequence(items, { onNote, onEnd, countIn = 0, beatSec = 0.5, clicks = false } = {}) {
      await this.ensureContext();
      this.stopSequence();
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.1 + countIn * beatSec;
      for (let b = 0; b < countIn; b++) this.click(ctx.currentTime + 0.1 + b * beatSec, b === 0);
      const voices = [];
      for (const it of items) if (it.midi != null) voices.push(this._voice(it.midi, t0 + it.start, Math.max(0.05, it.dur * 0.98), { gain: 0.2 }));
      const endT = t0 + Math.max(...items.map(i => i.start + i.dur)) + 0.1;
      if (clicks) for (let t = t0; t < endT - 0.05; t += beatSec) this.click(t, false);
      let idx = 0, raf = 0;
      const tick = () => {
        const now = ctx.currentTime;
        while (idx < items.length && t0 + items[idx].start <= now + 0.01) { if (onNote) onNote(items[idx], now - t0); idx++; }
        if (this._seq && this._seq.onTime) this._seq.onTime(now - t0);
        if (now < endT) raf = requestAnimationFrame(tick);
        else { this._seq = null; if (onEnd) onEnd(); }
      };
      raf = requestAnimationFrame(tick);
      this.muteUntil = endT + 0.3;
      this._seq = { voices, stop: () => { cancelAnimationFrame(raf); voices.forEach(v => v.stop()); this.muteUntil = 0; } , t0 };
      return this._seq;
    },
    stopSequence() { if (this._seq) { this._seq.stop(); this._seq = null; } },

    /** Unpitched click (filtered noise burst) so the pitch tracker never mistakes it for a note. */
    click(when, accent) {
      const ctx = this.ctx;
      if (!this._noise) {
        const len = Math.floor(ctx.sampleRate * 0.04);
        this._noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this._noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = accent ? 3200 : 2200; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = accent ? 1.1 : 0.7;
      src.connect(bp).connect(g).connect(this.master);
      src.start(when);
    },

    /** Count-in clicks; resolves with the AudioContext time of the first downbeat. */
    async countIn(beats, beatSec) {
      await this.ensureContext();
      const t0 = this.ctx.currentTime + 0.12;
      for (let b = 0; b < beats; b++) this.click(t0 + b * beatSec, b === 0);
      return t0 + beats * beatSec;
    },

    /** Metronome running until stop(); returns handle. */
    metronome(startAt, beatSec, accentEvery = 0) {
      const ctx = this.ctx;
      let next = startAt, n = 0, timer = 0, stopped = false;
      const pump = () => {
        if (stopped) return;
        while (next < ctx.currentTime + 0.25) { this.click(next, accentEvery && n % accentEvery === 0); next += beatSec; n++; }
        timer = setTimeout(pump, 80);
      };
      pump();
      return { stop: () => { stopped = true; clearTimeout(timer); } };
    },

    // ---------------------------------------------------------------- buffers
    async decode(arrayBuffer) {
      await this.ensureContext();
      const buf = await new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(arrayBuffer, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      const n = buf.length, ch = buf.numberOfChannels;
      const mono = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
      return { samples: mono, sampleRate: buf.sampleRate, duration: buf.duration };
    },

    /** Play part of a mono buffer; returns handle {stop, startedAt, from}. */
    async playBuffer(samples, sr, from = 0, to = null, { onTime, onEnd } = {}) {
      await this.ensureContext();
      this.stopBuffer();
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, samples.length, sr);
      buf.copyToChannel ? buf.copyToChannel(samples, 0) : buf.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master);
      const start = ctx.currentTime + 0.03;
      const dur = (to == null ? samples.length / sr : to) - from;
      src.start(start, Math.max(0, from), Math.max(0.05, dur));
      this.muteUntil = start + dur + 0.3;
      let raf = 0;
      const tick = () => {
        const pos = from + (ctx.currentTime - start);
        if (onTime) onTime(pos);
        if (ctx.currentTime < start + dur) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      src.onended = () => { cancelAnimationFrame(raf); if (this._buf === h) this._buf = null; if (onEnd) onEnd(); };
      const h = { stop: () => { cancelAnimationFrame(raf); try { src.stop(); } catch (_) { /* */ } this.muteUntil = 0; }, from, start };
      this._buf = h;
      return h;
    },
    stopBuffer() { if (this._buf) { this._buf.stop(); this._buf = null; } },
  };

  IT.Audio = A;
})();
