/* Inverno-Trainer · tasks.js
 * "Aufgaben": teacher ↔ student workflow without a server.
 *  - Teacher mode (optionally PIN-locked): build a practice plan from measure
 *    selections with notes, target tempo, tolerance, goal and due date; attach a
 *    reference per task (record it, upload a file, link an existing recording or a
 *    YouTube time); include the teacher's fingerings and pitch standard.
 *  - Sharing: a plan file (with recordings) via share sheet / download, or a link
 *    (without recordings, plan packed into the URL fragment).
 *  - Student mode: the tasks with one-click practice, teacher reference playback,
 *    progress, and a progress report (optionally with the latest takes) back to the
 *    teacher, who can open it in teacher mode.
 * Everything imported is treated as untrusted data and validated.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});
  const $ = (s, r = document) => r.querySelector(s);
  const L = (k, p) => IT.i18n.t(k, p);
  const Ln = (w, n, p) => IT.i18n.tn(w, n, p);

  const PIECE = 'vivaldi-rv297-3';
  const MAX_FILE = 80 * 1024 * 1024;
  const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac', 'video/mp4', 'video/webm', 'video/quicktime'];

  let app;                     // IT.app, set in init()
  let plan = null;             // the plan on this device
  let pending = null;          // a plan waiting for "Übernehmen"
  let report = null;           // a student report opened by the teacher (memory only)
  let role = 'student';
  let unlocked = false;
  let recordingFor = null;     // task id while the teacher records a reference
  let delArm = null;
  let saveTimer = 0;

  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clampN = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
  const fmtDate = d => { try { return new Date(d).toLocaleDateString(IT.i18n.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (_) { return ''; } };

  function emptyPlan() {
    return { id: uid('plan'), title: L('Übungsplan'), teacher: '', student: '', message: '', a4: null, createdAt: Date.now(), updatedAt: Date.now(), tasks: [], fingerings: null };
  }
  function load() { plan = app.store.get('plan', null); }
  function save() {
    if (!plan) return;
    plan.updatedAt = Date.now();
    app.store.set('plan', plan);
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 350); }

  function sectionLabel(m) { return app.score.sectionAt(m).label; }
  function rangeKey(t) { return `${t.m1}-${t.m2}`; }
  function taskFor(sel) { return plan && plan.tasks.find(t => t.m1 === sel.m1 && t.m2 === sel.m2) || null; }

  // ------------------------------------------------------------------ role & PIN
  async function hash(s) {
    try {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('inverno:' + s));
      return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { return 'plain:' + s; }
  }
  function setRole(r) {
    role = r;
    for (const b of document.querySelectorAll('#roleSeg button')) b.setAttribute('aria-pressed', String(b.dataset.role === r));
    if (!app.store.get('pin', null)) app.store.set('role', r);
    render();
  }

  // ------------------------------------------------------------------ rendering
  function render() {
    const body = $('#tasksBody');
    if (!body) return;
    const parts = [];
    if (pending) parts.push(renderPending());
    if (role === 'teacher' && app.store.get('pin', null) && !unlocked) parts.push(renderPinGate());
    else if (role === 'teacher') parts.push(renderTeacher());
    else parts.push(renderStudent());
    body.innerHTML = parts.join('');
    bind(body);
    updateBadge();
  }

  function renderPending() {
    const p = pending.plan;
    const nRef = pending.refs.length;
    const parts = [];
    if (p.teacher) parts.push(L('von {t}', { t: esc(p.teacher) }));
    parts.push(Ln('Aufgabe', p.tasks.length));
    if (nRef) parts.push(Ln('Aufnahme', nRef));
    return `<div class="import-card">
      <p class="label">${L('Übungsplan empfangen')}</p>
      <h3>${esc(p.title || L('Übungsplan'))}</h3>
      <p class="muted">${parts.join(' · ')}${p.fingerings ? L(' · mit Fingersätzen') : ''}${p.a4 ? ` · a′ = ${String(p.a4).replace('.', ',')} Hz` : ''}</p>
      ${plan && plan.tasks.length ? `<p class="muted">${L('Dein bisheriger Plan wird ersetzt. Dein Übungsverlauf bleibt erhalten.')}</p>` : ''}
      <div class="row"><button class="btn primary small" type="button" data-act="accept">${L('Übernehmen')}</button><button class="btn small" type="button" data-act="reject">${L('Verwerfen')}</button></div>
    </div>`;
  }

  function renderPinGate() {
    return `<div class="field">
      <label for="pinIn">${L('Lehrer-PIN')}</label>
      <div class="row"><input id="pinIn" class="textin" type="password" inputmode="numeric" autocomplete="off" style="max-width:10rem"><button class="btn small primary" type="button" data-act="unlock">${L('Entsperren')}</button></div>
      <p class="muted">${L('Der Lehrer-Bereich ist mit einer PIN geschützt.')}</p>
    </div>`;
  }

  function progressFor(t) {
    const hist = (app.store.get('history', {})[rangeKey(t)] || []).filter(h => h.src !== 'demo');
    const recs = hist.filter(h => h.kind !== 'step');
    const steps = hist.filter(h => h.kind === 'step');
    const best = recs.length ? Math.max(...recs.map(h => h.o)) : null;
    const last = recs.length ? recs[recs.length - 1].o : null;
    return { recs, steps, best, last, done: best != null && best >= (t.goal || 80) };
  }

  function spark(vals, goal) {
    if (!vals.length) return '';
    const W = 120, H = 26;
    const xs = i => vals.length === 1 ? W / 2 : 3 + i * (W - 6) / (vals.length - 1);
    const ys = v => H - 3 - (v / 100) * (H - 6);
    return `<svg class="spark mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${goal ? `<line x1="0" x2="${W}" y1="${ys(goal)}" y2="${ys(goal)}" stroke="var(--line)" stroke-dasharray="3 3"/>` : ''}
      <polyline points="${vals.map((v, i) => xs(i) + ',' + ys(v)).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <circle cx="${xs(vals.length - 1)}" cy="${ys(vals[vals.length - 1])}" r="2.6" fill="var(--varnish)"/></svg>`;
  }

  function refLabel(t) {
    const ref = t.refId && app.Refs.list.find(r => r.id === t.refId);
    if (!ref) return null;
    return ref;
  }
  function ytHref(t) {
    if (t.yt && t.yt.id) return `https://www.youtube.com/watch?v=${t.yt.id}&t=${Math.max(0, Math.floor(t.yt.t || 0))}s`;
    const ref = refLabel(t);
    if (ref && IT.Reference.youtubeId(ref.url)) {
      const time = IT.Reference.measureTime(ref, app.score, t.m1);
      if (time != null) return IT.Reference.youtubeLink(ref, time);
    }
    return null;
  }
  const mRange = (a, b) => `${L('T. {m}', { m: a })}–${b}`;

  function renderStudent() {
    if (!plan || !plan.tasks.length) {
      return `<div class="empty">
        <p>${L('<strong>Noch keine Aufgaben.</strong> Deine Lehrerin oder dein Lehrer kann dir einen Übungsplan schicken – als Datei oder als Link. Öffne den Link einfach, oder lade die Datei hier:')}</p>
        <div class="row"><label class="btn small primary" for="planFile">${L('Übungsplan öffnen …')}</label></div>
        <p class="muted">${L('Du unterrichtest? Schalte oben auf „Lehrer“, um Aufgaben zu erstellen.')}</p>
      </div>`;
    }
    const cards = plan.tasks.map((t, i) => {
      const pr = progressFor(t);
      const ref = refLabel(t);
      const yt = ytHref(t);
      const due = t.due ? `<span class="due ${new Date(t.due) < new Date(new Date().toDateString()) && !pr.done ? 'late' : ''}">${L('bis {d}', { d: fmtDate(t.due) })}</span>` : '';
      const status = pr.done ? `<span class="badge ok">${L('Ziel erreicht')}</span>` : '';
      const meta = [mRange(t.m1, t.m2), t.tempo ? `♩. = ${t.tempo}` : null, L('±{t} ct', { t: t.tol }), L('Ziel {g}', { g: t.goal })].filter(Boolean).join(' · ');
      const progBits = [];
      if (pr.recs.length) progBits.push(L('bester {b} · zuletzt {l}', { b: pr.best, l: pr.last }), Ln('Aufnahme', pr.recs.length));
      if (pr.steps.length) progBits.push(L('Ton für Ton {n}× geschafft', { n: pr.steps.length }));
      const progress = progBits.length
        ? `<div class="task-progress">${spark(pr.recs.map(h => h.o), t.goal)}<span class="muted">${progBits.join(' · ')}</span></div>`
        : `<p class="muted">${L('Noch nicht geübt.')}</p>`;
      const doStep = t.mode !== 'passage', doRec = t.mode !== 'step';
      return `<article class="task" data-i="${i}">
        <div class="task-head"><span class="letter">${esc(sectionLabel(t.m1))}</span><h3>${esc(t.title)}</h3>${status}${due}</div>
        <p class="task-meta num">${esc(meta)}</p>
        ${t.note ? `<p class="task-note">${esc(t.note)}</p>` : ''}
        ${progress}
        <div class="row">
          ${doStep ? `<button class="btn small" type="button" data-act="step">${L('Ton für Ton')}</button>` : ''}
          ${doRec ? `<button class="btn small rec" type="button" data-act="rec"><span class="recdot" aria-hidden="true"></span>${L('Aufnehmen')}</button>` : ''}
          ${ref && ref.kind === 'audio' ? `<button class="btn small" type="button" data-act="ref">${L('▶ Referenz')}</button>` : ''}
          ${yt ? `<a class="btn small" href="${esc(yt)}" target="_blank" rel="noopener">YouTube ↗</a>` : ''}
        </div>
      </article>`;
    }).join('');
    const who = [plan.teacher ? L('von {t}', { t: esc(plan.teacher) }) : '', plan.student ? L('für {s}', { s: esc(plan.student) }) : ''].filter(Boolean).join(' ');
    return `<div class="plan-head">
        <h3 class="plan-title">${esc(plan.title)}</h3>
        <p class="muted">${who}${plan.createdAt ? (who ? ' · ' : '') + fmtDate(plan.createdAt) : ''}</p>
        ${plan.message ? `<blockquote class="plan-msg">${esc(plan.message)}</blockquote>` : ''}
      </div>
      <div class="tasks">${cards}</div>
      <div class="send">
        <p class="label">${L('Fortschritt an Lehrer senden')}</p>
        <label class="toggle"><input type="checkbox" id="repAudio" checked> ${L('mit meiner letzten Aufnahme je Aufgabe')}</label>
        <div class="row"><button class="btn small primary" type="button" data-act="report">${L('Fortschritt teilen …')}</button><label class="btn small" for="planFile">${L('Anderen Plan öffnen …')}</label></div>
      </div>`;
  }

  function renderTeacher() {
    if (!plan) plan = emptyPlan();
    const sel = app.sel;
    const ownCount = Object.keys(app.getOverrides()).length;
    const refs = app.Refs.list;
    const cards = plan.tasks.map((t, i) => {
      const ref = refLabel(t);
      const recNow = recordingFor === t.id;
      const refTxt = ref ? `${ref.role === 'teacher' ? L('Eigene Einspielung') : esc(ref.name)}${ref.kind === 'audio' && ref.duration ? ' · ' + app.fmtTime(ref.duration).replace(/\.\d$/, '') : ''}${ref.kind === 'link' ? ' ' + L('(Link)') : ''}` : L('keine');
      return `<article class="task edit" data-i="${i}">
        <div class="row">
          <input class="textin grow" type="text" data-f="title" value="${esc(t.title)}" aria-label="${L('Titel der Aufgabe')}" maxlength="120">
          <button class="btn small" type="button" data-act="up" aria-label="${L('Nach oben')}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn small" type="button" data-act="down" aria-label="${L('Nach unten')}" ${i === plan.tasks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn small ghost" type="button" data-act="del">${L(delArm === t.id ? 'Wirklich löschen?' : 'Löschen')}</button>
        </div>
        <div class="grid3">
          <div class="field"><label>${L('Takte')}</label><div class="row nowrap"><input class="mini" type="number" min="1" max="${app.score.measureCount}" data-f="m1" value="${t.m1}" aria-label="${L('von Takt')}">–<input class="mini" type="number" min="1" max="${app.score.measureCount}" data-f="m2" value="${t.m2}" aria-label="${L('bis Takt')}"></div></div>
          <div class="field"><label>${L('Tempo ♩.')}</label><input class="mini" type="number" min="10" max="120" data-f="tempo" value="${t.tempo || ''}" placeholder="${L('frei')}"></div>
          <div class="field"><label>${L('Toleranz ±ct')}</label><input class="mini" type="number" min="3" max="60" data-f="tol" value="${t.tol}"></div>
          <div class="field"><label>${L('Ziel (Punkte)')}</label><input class="mini" type="number" min="0" max="100" data-f="goal" value="${t.goal}"></div>
          <div class="field"><label>${L('Fällig')}</label><input class="mini wide" type="date" data-f="due" value="${t.due || ''}"></div>
          <div class="field"><label>${L('Üben als')}</label><select class="mini wide" data-f="mode"><option value="both" ${t.mode === 'both' ? 'selected' : ''}>${L('beides')}</option><option value="step" ${t.mode === 'step' ? 'selected' : ''}>${L('Ton für Ton ').trim()}</option><option value="passage" ${t.mode === 'passage' ? 'selected' : ''}>${L('Aufnahme ').trim()}</option></select></div>
        </div>
        <div class="row"><button class="btn small" type="button" data-act="takesel">${L('Aktuelle Auswahl (T. {m1}–{m2}) übernehmen', { m1: sel.m1, m2: sel.m2 })}</button><button class="btn small ghost" type="button" data-act="show">${L('In Noten zeigen')}</button></div>
        <textarea class="textin" rows="2" data-f="note" maxlength="1000" placeholder="${esc(L('Hinweis an den Schüler, z. B. „Lagenwechsel T. 44 langsam üben, 3. Finger tiefer.“'))}">${esc(t.note)}</textarea>
        <div class="refbox">
          <p class="muted">${L('Referenz: <strong>{x}</strong>', { x: refTxt })}</p>
          <div class="row">
            <button class="btn small ${recNow ? 'rec on' : 'rec'}" type="button" data-act="recref"><span class="recdot" aria-hidden="true"></span>${L(recNow ? 'Stopp' : 'Selbst einspielen')}</button>
            <label class="btn small" for="taskRefFile" data-act="pickfile">${L('Datei …')}</label>
            ${ref && ref.kind === 'audio' ? '<button class="btn small" type="button" data-act="playref">▶</button>' : ''}
            <select class="mini wide" data-f="refId" aria-label="${L('Vorhandene Referenz verknüpfen')}">
              <option value="">${L('– vorhandene Referenz –')}</option>
              ${refs.map(r => `<option value="${esc(r.id)}" ${r.id === t.refId ? 'selected' : ''}>${esc(r.name)}${r.kind === 'link' ? ' ' + L('(Link)') : ''}</option>`).join('')}
            </select>
          </div>
          <div class="row nowrap"><input class="textin" type="url" data-f="ytUrl" value="${t.yt ? esc('https://www.youtube.com/watch?v=' + t.yt.id) : ''}" placeholder="${L('YouTube-Link (optional)')}" aria-label="${L('YouTube-Link')}"><input class="mini" type="text" data-f="ytT" value="${t.yt ? esc(app.fmtTime(t.yt.t).replace(/\.0$/, '')) : ''}" placeholder="${L('ab m:ss')}" aria-label="${L('Startzeit im Video')}"></div>
        </div>
      </article>`;
    }).join('');
    const rep = report ? renderReport() : '';
    const hasPin = !!app.store.get('pin', null);
    return `<div class="plan-edit">
        <div class="grid2">
          <div class="field"><label for="pTitle">${L('Titel')}</label><input id="pTitle" class="textin" type="text" data-p="title" value="${esc(plan.title)}" maxlength="120"></div>
          <div class="field"><label for="pTeacher">${L('Lehrer/in')}</label><input id="pTeacher" class="textin" type="text" data-p="teacher" value="${esc(plan.teacher)}" maxlength="80"></div>
          <div class="field"><label for="pStudent">${L('Schüler/in')}</label><input id="pStudent" class="textin" type="text" data-p="student" value="${esc(plan.student)}" maxlength="80"></div>
          <div class="field"><label for="pA4">${L('Kammerton vorgeben')}</label><select id="pA4" class="textin" data-p="a4"><option value="">${L('nicht vorgeben')}</option>${[415, 430, 440, 442, 443].map(v => `<option value="${v}" ${plan.a4 === v ? 'selected' : ''}>${v} Hz</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="pMsg">${L('Nachricht')}</label><textarea id="pMsg" class="textin" rows="2" data-p="message" maxlength="2000" placeholder="${esc(L('z. B. „Diese Woche: Abschnitt H sauber, dann Tempo steigern.“'))}">${esc(plan.message)}</textarea></div>
      </div>
      <button class="btn primary" type="button" data-act="add">${L('+ Aufgabe aus Auswahl T. {m1}–{m2}', { m1: sel.m1, m2: sel.m2 })}</button>
      <div class="tasks">${cards || `<p class="muted">${L('Wähle Takte in den Noten (ziehen oder Buchstaben F–N) und füge sie als Aufgabe hinzu.')}</p>`}</div>
      <div class="send">
        <label class="toggle"><input type="checkbox" id="sendFing" ${plan.sendFingerings !== false ? 'checked' : ''}> ${L('Meine Fingersätze mitschicken ({n} geändert – per Klick auf die Griffspur)', { n: ownCount })}</label>
        <div class="row">
          <button class="btn small primary" type="button" data-act="export">${L('Plan teilen / speichern …')}</button>
          <button class="btn small" type="button" data-act="link">${L('Link kopieren (ohne Aufnahmen)')}</button>
        </div>
        <p class="muted">${L('Die Datei enthält alle eingespielten Referenzen. Der Link passt in jede Nachricht, enthält aber nur Takte, Hinweise, Fingersätze und YouTube-Stellen.')}</p>
      </div>
      <div class="send">
        <p class="label">${L('Rückmeldung von Schülern')}</p>
        <div class="row"><label class="btn small" for="reportFile">${L('Fortschritt eines Schülers öffnen …')}</label><button class="btn small ghost" type="button" data-act="pin">${L(hasPin ? 'PIN ändern' : 'Lehrer-PIN festlegen')}</button><button class="btn small ghost" type="button" data-act="newplan">${L('Neuer Plan')}</button></div>
        <div id="pinSet" hidden class="row"><input class="textin" id="pinNew" type="password" inputmode="numeric" placeholder="${L('neue PIN (leer = keine)')}" style="max-width:12rem" autocomplete="new-password"><button class="btn small" type="button" data-act="savepin">${L('PIN speichern')}</button></div>
      </div>
      ${rep}`;
  }

  function renderReport() {
    const r = report;
    const rows = r.tasks.map((t, i) => {
      const vals = t.attempts.map(a => a.o);
      const best = vals.length ? Math.max(...vals) : null;
      const s = t.take && t.take.summary;
      const line = (vals.length ? `${Ln('Aufnahme', vals.length)} · ${L('bester {b} · zuletzt {l}', { b: best, l: vals[vals.length - 1] })}` : L('keine Aufnahme'))
        + (t.steps ? L(' · Ton für Ton {n}×', { n: t.steps }) : '')
        + (s ? L(' · letzte: Intonation {i}, Treffer {h} %', { i: s.intonation, h: s.hitRate }) : '');
      const worst = s && s.worst && s.worst.length
        ? s.worst.slice(0, 4).map(w => { const n = app.score.notes[w.ni]; return n ? `${L('T. {m}', { m: n.m })} ${esc(app.noteName(n))} ${w.state === 'miss' ? L('(fehlt)') : w.state === 'wrong' ? L('(falsch)') : app.fmtCents(w.cents)}` : ''; }).join(', ')
        : '';
      return `<li class="rep-row">
        <div><strong>${esc(t.title)}</strong> <span class="muted">${mRange(t.m1, t.m2)}</span>
          <div class="muted">${line}</div>
          ${worst ? `<div class="muted">${L('Unsauber: {x}', { x: worst })}</div>` : ''}
        </div>
        <div class="row nowrap">${spark(vals, t.goal)}${t.take && t.take.audio ? `<button class="btn small" type="button" data-act="reptake" data-ri="${i}">▶</button>` : ''}</div>
      </li>`;
    }).join('');
    return `<div class="report">
      <p class="label">${r.student ? L('Fortschritt von {s} · Stand {d}', { s: esc(r.student), d: fmtDate(r.createdAt) }) : L('Fortschritt · Stand {d}', { d: fmtDate(r.createdAt) })}</p>
      <ul class="list rep">${rows || `<li>${L('Keine Aufgaben im Bericht.')}</li>`}</ul>
      <button class="btn small ghost" type="button" data-act="closerep">${L('Bericht schließen')}</button>
    </div>`;
  }

  function updateBadge() {
    const tab = $('#tab-tasks');
    if (!tab) return;
    const n = plan ? plan.tasks.filter(t => !progressFor(t).done).length : 0;
    tab.dataset.count = n ? String(n) : '';
  }

  // ------------------------------------------------------------------ events
  function bind(body) {
    body.onclick = async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const card = b.closest('[data-i]');
      const t = card && plan ? plan.tasks[+card.dataset.i] : null;
      const act = b.dataset.act;
      if (act === 'pickfile') { fileTask = t; return; }
      switch (act) {
        case 'accept': acceptPending(); break;
        case 'reject': pending = null; render(); break;
        case 'unlock': {
          const ok = (await hash($('#pinIn').value)) === app.store.get('pin', null);
          if (ok) { unlocked = true; render(); } else app.toast(L('PIN stimmt nicht.'));
          break;
        }
        case 'step': practice(t, 'step'); break;
        case 'rec': practice(t, 'passage'); break;
        case 'ref': playRef(t, b); break;
        case 'report': exportReport(); break;
        case 'add': addFromSelection(); break;
        case 'up': case 'down': move(+card.dataset.i, act === 'up' ? -1 : 1); break;
        case 'del':
          if (delArm !== t.id) { delArm = t.id; render(); setTimeout(() => { if (delArm === t.id) { delArm = null; render(); } }, 4000); }
          else { plan.tasks.splice(+card.dataset.i, 1); delArm = null; save(); render(); }
          break;
        case 'takesel': { const s = app.sel; t.m1 = s.m1; t.m2 = s.m2; save(); render(); break; }
        case 'show': app.setSelection({ m1: t.m1, m2: t.m2 }, { scroll: true }); break;
        case 'recref': teacherRecord(t); break;
        case 'playref': playRef(t, b); break;
        case 'export': exportPlan(); break;
        case 'link': copyLink(); break;
        case 'pin': $('#pinSet').hidden = !$('#pinSet').hidden; break;
        case 'savepin': {
          const v = $('#pinNew').value.trim();
          if (v) { app.store.set('pin', await hash(v)); unlocked = true; app.toast(L('PIN gespeichert. Beim nächsten Öffnen startet der Trainer im Schüler-Modus.')); }
          else { app.store.set('pin', null); app.toast(L('PIN entfernt.')); }
          render();
          break;
        }
        case 'newplan':
          if (b.dataset.armed) { plan = emptyPlan(); save(); render(); }
          else { b.dataset.armed = '1'; b.textContent = L('Wirklich neuen Plan beginnen?'); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = L('Neuer Plan'); } }, 4000); }
          break;
        case 'closerep': report = null; render(); break;
        case 'reptake': playReportTake(+b.dataset.ri, b); break;
      }
    };
    body.oninput = e => {
      const el = e.target;
      if (!plan) return;
      if (el.dataset.p) {
        const k = el.dataset.p;
        if (k === 'a4') plan.a4 = el.value ? +el.value : null;
        else plan[k] = str(el.value, k === 'message' ? 2000 : 120);
        saveSoon();
        return;
      }
      const card = el.closest('[data-i]');
      if (!card || !el.dataset.f) return;
      const t = plan.tasks[+card.dataset.i];
      const f = el.dataset.f, v = el.value;
      const M = app.score.measureCount;
      if (f === 'title') t.title = str(v, 120);
      else if (f === 'note') t.note = str(v, 1000);
      else if (f === 'm1') t.m1 = clampN(v, 1, M, t.m1);
      else if (f === 'm2') t.m2 = clampN(v, 1, M, t.m2);
      else if (f === 'tempo') t.tempo = v ? clampN(v, 10, 120, null) : null;
      else if (f === 'tol') t.tol = clampN(v, 3, 60, 15);
      else if (f === 'goal') t.goal = clampN(v, 0, 100, 80);
      else if (f === 'due') t.due = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      else if (f === 'mode') t.mode = ['both', 'step', 'passage'].includes(v) ? v : 'both';
      else if (f === 'refId') { t.refId = v || null; save(); render(); return; }
      else if (f === 'ytUrl' || f === 'ytT') {
        const urlEl = card.querySelector('[data-f=ytUrl]'), tEl = card.querySelector('[data-f=ytT]');
        const id = IT.Reference.youtubeId(urlEl.value);
        t.yt = id ? { id, t: app.parseTime(tEl.value) || 0 } : null;
      }
      if (t.m1 > t.m2) { const x = t.m1; t.m1 = t.m2; t.m2 = x; }
      saveSoon();
    };
    body.onchange = e => {
      if (e.target.id === 'sendFing' && plan) { plan.sendFingerings = e.target.checked; save(); }
    };
  }
  let fileTask = null;

  function addFromSelection() {
    const s = app.sel;
    const sec = app.score.sectionAt(s.m1);
    const sonnet = app.score.sonnetAt(s.m1);
    const t = {
      id: uid('task'),
      title: L('Abschnitt {l}: T. {m1}–{m2}', { l: sec.label, m1: s.m1, m2: s.m2 }),
      m1: s.m1, m2: s.m2,
      tempo: app.settings.tempo, tol: app.settings.tol, goal: 80, due: null, mode: 'both',
      note: '', refId: null, yt: null,
    };
    void sonnet;
    plan.tasks.push(t);
    save();
    render();
    const cards = document.querySelectorAll('#tasksBody .task.edit');
    const last = cards[cards.length - 1];
    if (last) { last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const inp = last.querySelector('[data-f=title]'); if (inp) inp.focus(); }
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= plan.tasks.length) return;
    const [x] = plan.tasks.splice(i, 1);
    plan.tasks.splice(j, 0, x);
    save(); render();
  }

  function practice(t, mode) {
    app.setMode(mode);
    app.setSelection({ m1: t.m1, m2: t.m2 }, { scroll: true });
    const changes = [];
    if (t.tol && t.tol !== app.settings.tol) { app.settings.tol = t.tol; changes.push(L('Toleranz ±{x} ct', { x: t.tol })); }
    if (mode === 'passage' && t.tempo && t.tempo !== app.settings.tempo) { app.settings.tempo = t.tempo; changes.push(L('Tempo ♩. = {x}', { x: t.tempo })); }
    app.saveSettings();
    app.syncControls();
    app.toast(L('Aufgabe „{t}“', { t: t.title }) + (changes.length ? ' · ' + changes.join(' · ') + L(' (Vorgabe)') : ''));
  }

  async function playRef(t, btn) {
    const ref = refLabel(t);
    if (!ref || ref.kind !== 'audio') return;
    await app.Refs.play(ref, btn, { m1: t.m1, m2: t.m2 });
  }

  // ------------------------------------------------------------------ teacher references
  async function teacherRecord(t) {
    if (recordingFor) {
      app.stopRecording();
      return;
    }
    if (app.isRecording()) { app.toast(L('Es läuft bereits eine Aufnahme.')); return; }
    recordingFor = t.id;
    render();
    app.setSelection({ m1: t.m1, m2: t.m2 }, { scroll: true });
    const ok = await app.recordFor({ m1: t.m1, m2: t.m2 }, t.tempo || app.settings.tempo, async (res, audio) => {
      const blob = await IT.Reference.compactWav(audio.samples, audio.sr);
      const ref = {
        id: IT.Reference.newId(), name: L('Referenz {t} · T. {m1}–{m2}', { t: plan.teacher || L('Lehrer'), m1: t.m1, m2: t.m2 }), kind: 'audio', role: 'teacher',
        createdAt: Date.now(), audio: blob, duration: audio.samples.length / audio.sr, a4: app.settings.a4, transpose: 0,
        partial: { m1: t.m1, m2: t.m2 }, onsets: app.fillOnsets(app.onsetsFromResult(res), t.m1, t.m2), anchors: [], url: '',
        notes: Object.fromEntries(res.notes.filter(n => n.cents != null && n.state !== 'wrong').map(n => [n.ni, Math.round(n.cents * 10) / 10])),
      };
      await IT.Reference.Store.put(ref);
      await app.Refs.load();
      t.refId = ref.id;
      save();
      app.toast(L('Referenz gespeichert (deine Intonation: {i}, Treffer {h} %).', { i: res.summary.intonation, h: res.summary.hitRate }));
    });
    recordingFor = null;
    if (!ok) app.toast(L('Aufnahme abgebrochen.'));
    render();
  }

  async function attachFile(t, file) {
    if (!t || !file) return;
    if (file.size > MAX_FILE) { app.toast(L('Die Datei ist zu groß (max. 80 MB).')); return; }
    app.toast(L('Analysiere Referenz …'), 6000);
    try {
      const dec = await IT.Audio.decode(await file.arrayBuffer());
      const fullSec = app.score.events.reduce((a, e) => a + e.d * e.secPerTick, 0);
      let ref;
      if (dec.duration > fullSec * 0.55) {
        const res = await IT.Reference.alignRecording(dec.samples, dec.sampleRate, app.score);
        ref = { id: IT.Reference.newId(), name: file.name.replace(/\.[a-z0-9]+$/i, ''), kind: 'audio', role: 'teacher', createdAt: Date.now(), audio: file, duration: dec.duration, a4: res.a4, transpose: res.transpose, onsets: res.onsets, notes: res.notes, anchors: [], url: '' };
      } else {
        const res = await IT.Analysis.analyzePassage(dec.samples, dec.sampleRate, { score: app.score, m1: t.m1, m2: t.m2, a4: app.settings.a4, fingering: app.fingering, tolerance: t.tol });
        if (!res.ok) { app.toast(L(res.reason)); return; }
        ref = { id: IT.Reference.newId(), name: file.name.replace(/\.[a-z0-9]+$/i, ''), kind: 'audio', role: 'teacher', createdAt: Date.now(), audio: file, duration: dec.duration, a4: app.settings.a4, transpose: 0, partial: { m1: t.m1, m2: t.m2 }, onsets: app.fillOnsets(app.onsetsFromResult(res), t.m1, t.m2), notes: Object.fromEntries(res.notes.filter(n => n.cents != null && n.state !== 'wrong').map(n => [n.ni, Math.round(n.cents * 10) / 10])), anchors: [], url: '' };
      }
      await IT.Reference.Store.put(ref);
      await app.Refs.load();
      t.refId = ref.id;
      save();
      render();
      app.toast(L('Referenz hinterlegt.'));
    } catch (e) {
      console.error(e);
      app.toast(L('Die Datei konnte nicht gelesen werden.'));
    }
  }

  // ------------------------------------------------------------------ export / share
  async function deliver(blob, filename, title) {
    const file = new File([blob], filename, { type: blob.type || 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text: title });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  }
  const slug = s => (s || '').normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const today = () => new Date().toISOString().slice(0, 10);

  function planCore(withFing) {
    const fing = withFing ? Object.assign({}, app.getTeacherFing(), app.getOverrides()) : null;
    return {
      format: 'inverno-plan', version: 1, piece: PIECE,
      id: plan.id, title: plan.title, teacher: plan.teacher, student: plan.student, message: plan.message,
      a4: plan.a4 || null, createdAt: Date.now(),
      fingerings: fing && Object.keys(fing).length ? fing : null,
      tasks: plan.tasks.map(t => ({ id: t.id, title: t.title, m1: t.m1, m2: t.m2, tempo: t.tempo, tol: t.tol, goal: t.goal, due: t.due, mode: t.mode, note: t.note, refId: t.refId || null, yt: t.yt || null })),
    };
  }

  async function exportPlan() {
    if (!plan || !plan.tasks.length) { app.toast(L('Füge zuerst mindestens eine Aufgabe hinzu.')); return; }
    save();
    const core = await buildPlanFile();
    const blob = new Blob([JSON.stringify(core)], { type: 'application/json' });
    const name = `Uebungsplan_${slug(plan.student || plan.title) || 'Inverno'}_${today()}.inverno.json`;
    const how = await deliver(blob, name, L('Übungsplan: {t}', { t: plan.title }));
    if (how === 'downloaded') app.toast(L('Gespeichert als „{name}“. Schick die Datei z. B. per Mail oder Messenger.', { name }), 6000);
  }

  /** The full plan object incl. recordings (base64), as written into the plan file. */
  async function buildPlanFile() {
    const core = planCore(plan.sendFingerings !== false);
    const ids = [...new Set(plan.tasks.map(t => t.refId).filter(Boolean))];
    core.refs = [];
    for (const id of ids) {
      const ref = app.Refs.list.find(r => r.id === id) || await IT.Reference.Store.get(id);
      if (!ref) continue;
      const out = { id: ref.id, name: ref.name, kind: ref.kind, role: 'teacher', url: ref.url || '', ytOffset: ref.ytOffset || 0, anchors: ref.anchors || [], duration: ref.duration || null, a4: ref.a4 || null, transpose: ref.transpose || 0, partial: ref.partial || null, onsets: ref.onsets || null, notes: ref.notes || null };
      if (ref.kind === 'audio' && ref.audio) {
        out.mime = ref.audio.type || 'audio/wav';
        out.audioBase64 = await IT.Reference.blobToBase64(ref.audio);
      }
      core.refs.push(out);
    }
    return core;
  }

  async function packLink(obj) {
    const json = JSON.stringify(obj);
    if (window.CompressionStream) {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      let s = ''; for (const b of buf) s += String.fromCharCode(b);
      return 'z.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return 'j.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function unpackLink(s) {
    const kind = s.slice(0, 2), data = s.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(data + '==='.slice((data.length + 3) % 4));
    if (kind === 'z.') {
      const u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
      const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(ds).text());
    }
    return JSON.parse(decodeURIComponent(escape(bin)));
  }

  /** The plan as a link (no recordings). */
  async function buildLink() {
    const core = planCore(plan.sendFingerings !== false);
    core.tasks.forEach(t => { t.refId = null; });
    core.refs = [];
    const packed = await packLink(core);
    return `${location.href.split('#')[0]}#plan=${packed}`;
  }

  async function copyLink() {
    if (!plan || !plan.tasks.length) { app.toast(L('Füge zuerst mindestens eine Aufgabe hinzu.')); return; }
    save();
    const url = await buildLink();
    if (url.length > 60000) { app.toast(L('Der Plan ist zu groß für einen Link – nutze „Plan teilen / speichern“.')); return; }
    if (location.protocol === 'file:') app.toast(L('Hinweis: Der Link zeigt auf eine Datei auf diesem Rechner. Für Schüler die App online stellen (siehe README).'), 7000);
    try {
      await navigator.clipboard.writeText(url);
      app.toast(L('Link kopiert ({kb} kB). Aufnahmen sind nur in der Datei enthalten.', { kb: String(Math.round(url.length / 100) / 10).replace('.', ',') }), 5000);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); app.toast(L('Link kopiert.')); } catch (e) { app.toast(L('Kopieren nicht möglich.')); }
      ta.remove();
    }
  }

  // ------------------------------------------------------------------ import (untrusted)
  function validPlan(o) {
    if (!o || typeof o !== 'object' || o.format !== 'inverno-plan' || o.piece !== PIECE) throw new Error(L('Das ist kein Übungsplan für dieses Stück.'));
    const M = app.score.measureCount, N = app.score.notes.length;
    const tasks = (Array.isArray(o.tasks) ? o.tasks : []).slice(0, 60).map(t => {
      let m1 = clampN(t.m1, 1, M, 1), m2 = clampN(t.m2, 1, M, m1);
      if (m1 > m2) { const x = m1; m1 = m2; m2 = x; }
      const ytId = t.yt && typeof t.yt.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(t.yt.id) ? t.yt.id : null;
      return {
        id: /^[\w-]{1,64}$/.test(t.id) ? t.id : uid('task'),
        title: str(t.title, 120) || `T. ${m1}–${m2}`, m1, m2,
        tempo: t.tempo == null ? null : clampN(t.tempo, 10, 120, null), tol: clampN(t.tol, 3, 60, 15), goal: clampN(t.goal, 0, 100, 80),
        due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
        mode: ['both', 'step', 'passage'].includes(t.mode) ? t.mode : 'both',
        note: str(t.note, 1000), refId: typeof t.refId === 'string' && /^[\w-]{1,64}$/.test(t.refId) ? t.refId : null,
        yt: ytId ? { id: ytId, t: clampN(t.yt.t, 0, 36000, 0) } : null,
      };
    });
    let fingerings = null;
    if (o.fingerings && typeof o.fingerings === 'object') {
      fingerings = {};
      for (const [k, v] of Object.entries(o.fingerings).slice(0, N)) {
        const ni = Number(k);
        if (!Number.isInteger(ni) || ni < 0 || ni >= N || !v) continue;
        const s = Number(v.s), f = Number(v.f);
        if (!(s >= 0 && s <= 3) || !(f >= 0 && f <= 4)) continue;
        fingerings[ni] = { s, f };
      }
      if (!Object.keys(fingerings).length) fingerings = null;
    }
    const E = app.score.events.length;
    const refs = (Array.isArray(o.refs) ? o.refs : []).slice(0, 30).filter(r => r && /^[\w-]{1,64}$/.test(r.id)).map(r => {
      const onsets = Array.isArray(r.onsets) && r.onsets.length === E ? r.onsets.map(x => (x == null || !Number.isFinite(+x) ? null : +x)) : null;
      const notes = {};
      if (r.notes && typeof r.notes === 'object') for (const [k, v] of Object.entries(r.notes)) { const ni = +k; if (Number.isInteger(ni) && ni >= 0 && ni < N && Number.isFinite(+v)) notes[ni] = Math.max(-100, Math.min(100, +v)); }
      const out = {
        id: r.id, name: str(r.name, 120) || 'Referenz', kind: r.kind === 'audio' ? 'audio' : 'link', role: 'teacher', createdAt: Date.now(),
        url: IT.Reference.youtubeId(r.url) ? 'https://www.youtube.com/watch?v=' + IT.Reference.youtubeId(r.url) : '',
        ytOffset: clampN(r.ytOffset, -36000, 36000, 0),
        anchors: (Array.isArray(r.anchors) ? r.anchors : []).slice(0, 50).map(a => ({ m: clampN(a.m, 1, M, 1), time: Number.isFinite(+a.time) ? +a.time : null })).filter(a => a.time != null),
        duration: Number.isFinite(+r.duration) ? +r.duration : null, a4: r.a4 == null ? null : clampN(r.a4, 380, 480, 440), transpose: clampN(r.transpose, -3, 3, 0),
        partial: r.partial ? { m1: clampN(r.partial.m1, 1, M, 1), m2: clampN(r.partial.m2, 1, M, M) } : null,
        onsets, notes,
      };
      if (out.kind === 'audio') {
        if (typeof r.audioBase64 !== 'string' || !AUDIO_TYPES.includes(String(r.mime).split(';')[0])) return null;
        out.audio = IT.Reference.base64ToBlob(r.audioBase64, String(r.mime).split(';')[0]);
        if (!onsets) return null;
      }
      return out;
    }).filter(Boolean);
    const p = {
      id: /^[\w-]{1,64}$/.test(o.id) ? o.id : uid('plan'),
      title: str(o.title, 120) || L('Übungsplan'), teacher: str(o.teacher, 80), student: str(o.student, 80), message: str(o.message, 2000),
      a4: [415, 430, 440, 442, 443].includes(Number(o.a4)) ? Number(o.a4) : null,
      createdAt: Number.isFinite(+o.createdAt) ? +o.createdAt : Date.now(), updatedAt: Date.now(),
      tasks, fingerings,
    };
    for (const t of p.tasks) if (t.refId && !refs.some(r => r.id === t.refId)) t.refId = null;
    return { plan: p, refs };
  }

  async function acceptPending() {
    const { plan: p, refs } = pending;
    pending = null;
    for (const r of refs) await IT.Reference.Store.put(r);
    await app.Refs.load();
    plan = p;
    save();
    if (p.fingerings) app.setTeacherFing(p.fingerings);
    if (p.a4 && p.a4 !== app.settings.a4) { app.setA4(p.a4); app.toast(L('Plan übernommen · Kammerton auf {hz} Hz gesetzt (Vorgabe).', { hz: String(p.a4).replace('.', ',') })); }
    else app.toast(L('Übungsplan übernommen.'));
    role = 'student';
    setRole('student');
    if (p.tasks[0]) app.setSelection({ m1: p.tasks[0].m1, m2: p.tasks[0].m2 }, { scroll: true });
  }

  async function openFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { app.toast(L('Die Datei ist zu groß.')); return; }
    try {
      const o = JSON.parse(await file.text());
      if (o && o.format === 'inverno-report') { openReport(o); return; }
      pending = validPlan(o);
      app.setMode('tasks');
      render();
    } catch (e) {
      app.toast(e.message && e.message === L('Das ist kein Übungsplan für dieses Stück.') ? e.message : L('Die Datei konnte nicht gelesen werden.'));
    }
  }

  async function importFromHash(h) {
    try {
      const o = await unpackLink(h);
      pending = validPlan(o);
      history.replaceState(null, '', location.pathname + location.search);
      app.setMode('tasks');
      render();
    } catch (e) {
      app.toast(L('Der Link enthält keinen gültigen Übungsplan.'));
    }
  }

  // ------------------------------------------------------------------ progress report
  async function exportReport() {
    if (!plan || !plan.tasks.length) return;
    const withAudio = $('#repAudio') ? $('#repAudio').checked : true;
    const out = await buildReport(withAudio);
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const name = `Fortschritt_${slug(plan.student) || 'Schueler'}_${today()}.inverno-report.json`;
    const how = await deliver(blob, name, L('Fortschritt: {t}', { t: plan.title }));
    if (how === 'downloaded') app.toast(L('Gespeichert als „{name}“. Schick die Datei deiner Lehrerin / deinem Lehrer.', { name }), 6000);
  }

  /** Progress report object (optionally with the latest take per task as base64 WAV). */
  async function buildReport(withAudio) {
    const hist = app.store.get('history', {});
    const out = { format: 'inverno-report', version: 1, piece: PIECE, planId: plan.id, planTitle: plan.title, student: plan.student || '', createdAt: Date.now(), tasks: [] };
    for (const t of plan.tasks) {
      const h = (hist[rangeKey(t)] || []).filter(x => x.src !== 'demo');
      const entry = {
        id: t.id, title: t.title, m1: t.m1, m2: t.m2, goal: t.goal,
        attempts: h.filter(x => x.kind !== 'step').map(x => ({ d: x.d, o: x.o, i: x.i, h: x.h, r: x.r, t: x.t })),
        steps: h.filter(x => x.kind === 'step').length,
      };
      if (withAudio) {
        const takes = await IT.Reference.Takes.forRange(rangeKey(t));
        const last = takes[takes.length - 1];
        if (last && last.audio) entry.take = { date: last.date, summary: last.summary, mime: last.audio.type || 'audio/wav', audio: await IT.Reference.blobToBase64(last.audio) };
      }
      out.tasks.push(entry);
    }
    return out;
  }

  function openReport(o) {
    if (o.piece !== PIECE) { app.toast(L('Der Bericht gehört zu einem anderen Stück.')); return; }
    const M = app.score.measureCount;
    report = {
      student: str(o.student, 80), createdAt: Number.isFinite(+o.createdAt) ? +o.createdAt : Date.now(),
      tasks: (Array.isArray(o.tasks) ? o.tasks : []).slice(0, 60).map(t => ({
        title: str(t.title, 120), m1: clampN(t.m1, 1, M, 1), m2: clampN(t.m2, 1, M, 1), goal: clampN(t.goal, 0, 100, 80),
        attempts: (Array.isArray(t.attempts) ? t.attempts : []).slice(-60).map(a => ({ o: clampN(a.o, 0, 100, 0) })),
        steps: clampN(t.steps, 0, 9999, 0),
        take: t.take && typeof t.take.audio === 'string' && AUDIO_TYPES.includes(String(t.take.mime).split(';')[0])
          ? { audio: t.take.audio, mime: String(t.take.mime).split(';')[0], summary: sanitizeSummary(t.take.summary) } : null,
      })),
    };
    role = 'teacher';
    for (const b of document.querySelectorAll('#roleSeg button')) b.setAttribute('aria-pressed', String(b.dataset.role === 'teacher'));
    app.setMode('tasks');
    render();
  }
  function sanitizeSummary(s) {
    if (!s || typeof s !== 'object') return null;
    const N = app.score.notes.length;
    return {
      overall: clampN(s.overall, 0, 100, 0), intonation: clampN(s.intonation, 0, 100, 0), hitRate: clampN(s.hitRate, 0, 100, 0),
      worst: (Array.isArray(s.worst) ? s.worst : []).slice(0, 8).filter(w => Number.isInteger(w.ni) && w.ni >= 0 && w.ni < N)
        .map(w => ({ ni: w.ni, state: ['miss', 'wrong', 'bad', 'warn', 'good'].includes(w.state) ? w.state : 'bad', cents: Number.isFinite(+w.cents) ? +w.cents : 0 })),
    };
  }
  let repAudioEl = null;
  function playReportTake(i, btn) {
    const t = report && report.tasks[i];
    if (!t || !t.take) return;
    if (repAudioEl && !repAudioEl.paused) { repAudioEl.pause(); btn.textContent = '▶'; return; }
    const blob = IT.Reference.base64ToBlob(t.take.audio, t.take.mime);
    if (repAudioEl && repAudioEl.src) URL.revokeObjectURL(repAudioEl.src);
    repAudioEl = new Audio(URL.createObjectURL(blob));
    repAudioEl.onended = () => { btn.textContent = '▶'; };
    repAudioEl.play().then(() => { btn.textContent = '■'; }).catch(() => app.toast(L('Wiedergabe nicht möglich.')));
  }

  // ------------------------------------------------------------------ banner while practising
  function bannerFor(sel) {
    // keep the selection-dependent button labels of the teacher view current
    document.querySelectorAll('#tasksBody [data-act="add"]').forEach(b => { b.textContent = L('+ Aufgabe aus Auswahl T. {m1}–{m2}', { m1: sel.m1, m2: sel.m2 }); });
    document.querySelectorAll('#tasksBody [data-act="takesel"]').forEach(b => { b.textContent = L('Aktuelle Auswahl (T. {m1}–{m2}) übernehmen', { m1: sel.m1, m2: sel.m2 }); });
    const el = $('#taskBanner');
    if (!el) return;
    const t = taskFor(sel);
    if (!t) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="label">${plan.teacher ? L('Aufgabe von {t}', { t: esc(plan.teacher) }) : L('Aufgabe')}</span> <strong>${esc(t.title)}</strong>${t.tempo ? ` · ♩. = ${t.tempo}` : ''} · ${L('±{t} ct', { t: t.tol })} · ${L('Ziel {g}', { g: t.goal })}${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}`;
  }

  // ------------------------------------------------------------------ public
  IT.Tasks = {
    init() {
      app = IT.app;
      load();
      const pinSet = !!app.store.get('pin', null);
      role = pinSet ? 'student' : app.store.get('role', 'student');
      for (const b of document.querySelectorAll('#roleSeg button')) {
        b.setAttribute('aria-pressed', String(b.dataset.role === role));
        b.addEventListener('click', () => setRole(b.dataset.role));
      }
      const pf = $('#planFile');
      if (pf) pf.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); });
      const rf = $('#reportFile');
      if (rf) rf.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); });
      const tf = $('#taskRefFile');
      if (tf) tf.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; attachFile(fileTask, f); });
      if (location.hash.startsWith('#plan=')) importFromHash(location.hash.slice(6));
      render();
      bannerFor(app.sel);
    },
    render, bannerFor, openFile, buildLink, buildPlanFile, buildReport, openReport,
    /** Load a plan/report object as if it came from a file (used by tests). */
    importObject(o) { if (o && o.format === 'inverno-report') openReport(o); else { pending = validPlan(o); app.setMode('tasks'); render(); } },
    onHistory() { updateBadge(); if (app.mode === 'tasks') render(); },
    get plan() { return plan; },
  };
})();
