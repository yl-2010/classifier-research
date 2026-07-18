#!/usr/bin/env python3
"""Generate minimal NoteLMs UI mockups (static, no backend)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SUBJECTS = [
    ("Mathematics", "#2563eb"),
    ("Physics", "#4f46e5"),
    ("Chemistry", "#d97706"),
    ("Biology", "#059669"),
    ("Computer Science", "#0891b2"),
    ("History", "#a16207"),
    ("Literature", "#be123c"),
    ("Economics", "#0d9488"),
    ("Other", "#64748b"),
]

MOCK_NOTE = """Thermodynamics — Lecture 12

First law: ΔU = Q − W
• Internal energy change equals heat added minus work done by the system
• For an ideal gas, U depends only on temperature

Isothermal process (ΔT = 0):
  ΔU = 0 ⇒ Q = W
  Work: W = nRT ln(V₂/V₁)

Adiabatic process (Q = 0):
  ΔU = −W
  TV^{γ−1} = constant

Entropy reminder: dS ≥ đQ/T (equality for reversible)."""

FORMATTED_HTML = """
<h1>Thermodynamics — Lecture 12</h1>
<section>
  <h2>First Law</h2>
  <p><strong>ΔU = Q − W</strong></p>
  <ul>
    <li>Internal energy change equals heat added minus work done by the system</li>
    <li>For an ideal gas, <em>U</em> depends only on temperature</li>
  </ul>
</section>
<section>
  <h2>Isothermal process</h2>
  <p>ΔU = 0 ⇒ Q = W</p>
  <p class="eq">W = nRT ln(V₂/V₁)</p>
</section>
<section>
  <h2>Adiabatic process</h2>
  <p>ΔU = −W</p>
  <p class="eq">TV<sup>γ−1</sup> = constant</p>
</section>
<section>
  <h2>Entropy</h2>
  <p>dS ≥ đQ/T</p>
</section>
"""

FLOW_STEPS = [
    ("input", "1", "Input"),
    ("classify", "2", "Classify"),
    ("confirm", "3", "Confirm"),
    ("result", "4", "Result"),
]

JS = r"""
const MOCK_NOTE = __MOCK_NOTE__;
const FORMATTED_HTML = __FORMATTED_HTML__;
const SUBJECTS = __SUBJECTS__;
const SUBJECT_COLORS = Object.fromEntries(SUBJECTS);
const LIBRARY = {
  Mathematics: [
    { id: 'math-1', title: 'Derivatives cheat sheet' },
    { id: 'math-2', title: 'Integrals workshop' },
    { id: 'math-3', title: 'Linear algebra intro' },
  ],
  Physics: [
    { id: 'phys-1', title: 'Thermodynamics — Lecture 12' },
    { id: 'phys-2', title: 'Newton’s laws review' },
  ],
  Chemistry: [
    { id: 'chem-1', title: 'Stoichiometry drills' },
    { id: 'chem-2', title: 'Acid–base equilibria' },
  ],
  Biology: [
    { id: 'bio-1', title: 'Cell organelles map' },
    { id: 'bio-2', title: 'Mendelian genetics' },
  ],
  'Computer Science': [
    { id: 'cs-1', title: 'Big-O notation' },
    { id: 'cs-2', title: 'Recursion patterns' },
  ],
  History: [{ id: 'hist-1', title: 'Industrial Revolution' }],
  Literature: [
    { id: 'lit-1', title: 'Sonnet structure' },
    { id: 'lit-2', title: 'Theme vs motif' },
  ],
  Economics: [
    { id: 'econ-1', title: 'Supply & demand' },
    { id: 'econ-2', title: 'Elasticity basics' },
  ],
  Other: [{ id: 'other-1', title: 'Study skills' }],
};

const FLOW = ['input','classify','confirm','result'];
let step = 'input';
let ocrOnline = true;
let noteText = '';
let subject = 'Physics';
let customOther = 'Study Skills';
let currentFolder = 'Physics';
let currentNoteId = 'phys-1';

const votes = {
  base: { label: 'Physics', conf: 0.81 },
  ft: { label: 'Physics', conf: 0.94 },
  gpt: { label: 'Physics', conf: 0.88 },
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function label() {
  return subject === 'Other' ? customOther : subject;
}

function go(s) {
  step = s;
  $$('[data-step]').forEach(el => { el.hidden = el.dataset.step !== s; });
  $$('[data-flow]').forEach(el => {
    const i = FLOW.indexOf(el.dataset.flow);
    const cur = FLOW.indexOf(s);
    el.classList.toggle('active', el.dataset.flow === s);
    el.classList.toggle('done', cur > i && i >= 0);
    el.classList.toggle('in-flow', FLOW.includes(s));
  });
  const bar = $('#flowbar');
  if (bar) bar.hidden = !FLOW.includes(s);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (s === 'classify') runClassify();
  if (s === 'confirm') renderConfirm();
  if (s === 'result') renderResult();
  if (s === 'library') renderLibrary();
  if (s === 'folder') renderFolder();
  if (s === 'note') renderNote();
  if (s === 'research') renderResearch();
}

function setOcr(on) {
  ocrOnline = on;
  const btn = $('#upload-btn');
  const toggle = $('#ocr-toggle');
  if (toggle) toggle.checked = on;
  if (btn) {
    btn.disabled = !on;
    btn.classList.toggle('is-disabled', !on);
  }
}

function startClassify() {
  noteText = ($('#note-input')?.value || '').trim() || MOCK_NOTE;
  const ta = $('#note-input');
  if (ta && !ta.value.trim()) ta.value = noteText;
  go('classify');
}

function runClassify() {
  $$('.model').forEach((card, i) => {
    card.classList.remove('ready');
    card.querySelector('[data-out]').textContent = '…';
    card.querySelector('[data-conf]').textContent = '';
    setTimeout(() => {
      const v = votes[card.dataset.model];
      card.classList.add('ready');
      card.querySelector('[data-out]').textContent = v.label;
      card.querySelector('[data-conf]').textContent = Math.round(v.conf * 100) + '%';
    }, 350 + i * 300);
  });
}

function renderConfirm() {
  $('#c-base').textContent = votes.base.label;
  $('#c-ft').textContent = votes.ft.label;
  $('#c-gpt').textContent = votes.gpt.label;
  $('#final').textContent = label();
  $('#final').style.setProperty('--subj', SUBJECT_COLORS[subject] || '#64748b');
  const wrap = $('#other-field');
  if (wrap) wrap.hidden = subject !== 'Other';
}

function pick(sub) {
  subject = sub;
  $$('[data-pick]').forEach(b => b.classList.toggle('on', b.dataset.pick === sub));
  const wrap = $('#other-field');
  if (wrap) wrap.hidden = sub !== 'Other';
  if (sub === 'Other') {
    const inp = $('#other-input');
    if (inp) { customOther = inp.value.trim() || 'Study Skills'; inp.focus(); }
  }
  $('#final').textContent = label();
  $('#final').style.setProperty('--subj', SUBJECT_COLORS[subject] || '#64748b');
}

function renderResult() {
  const shell = $('#result-shell');
  if (!shell) return;
  shell.style.setProperty('--subj', SUBJECT_COLORS[subject] || '#64748b');
  const subEl = $('#result-subject');
  if (subEl) subEl.textContent = label();
  const body = $('#result-body');
  if (!body) return;
  if (subject === 'Physics') {
    body.innerHTML = FORMATTED_HTML;
  } else {
    body.innerHTML = `<h1>${label()}</h1><section><p>${escapeHtml(noteText || MOCK_NOTE).replace(/\n/g,'<br>')}</p></section>`;
  }
}

function escapeHtml(t) {
  return t.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderLibrary() {
  const grid = $('#folders');
  grid.innerHTML = SUBJECTS.map(([name, color]) => {
    const n = (LIBRARY[name] || []).length;
    return `<button type="button" class="folder" style="--subj:${color}" data-folder="${name}">
      <span class="fname">${name}</span>
      <span class="fcount">${n}</span>
    </button>`;
  }).join('');
  $$('[data-folder]', grid).forEach(b => b.addEventListener('click', () => {
    currentFolder = b.dataset.folder;
    go('folder');
  }));
}

function renderFolder() {
  $('#folder-name').textContent = currentFolder;
  $('#folder-name').style.setProperty('--subj', SUBJECT_COLORS[currentFolder] || '#64748b');
  const notes = LIBRARY[currentFolder] || [];
  $('#folder-list').innerHTML = notes.map(n =>
    `<button type="button" class="note-item" data-nid="${n.id}">${n.title}</button>`
  ).join('');
  $$('[data-nid]').forEach(b => b.addEventListener('click', () => {
    currentNoteId = b.dataset.nid;
    go('note');
  }));
}

function renderNote() {
  const notes = LIBRARY[currentFolder] || [];
  const n = notes.find(x => x.id === currentNoteId) || notes[0];
  const color = SUBJECT_COLORS[currentFolder] || '#64748b';
  $('#note-title').textContent = n ? n.title : currentFolder;
  $('#note-shell').style.setProperty('--subj', color);
  $('#note-body').innerHTML = (n && n.id === 'phys-1')
    ? FORMATTED_HTML
    : `<h1>${n ? n.title : currentFolder}</h1><section><p>Sample note.</p></section>`;
}

function renderResearch() {
  const body = $('#research-rows');
  if (!body) return;
  body.innerHTML = `
    <tr><td>now</td><td>${votes.base.label}</td><td>${votes.ft.label}</td><td>${votes.gpt.label}</td><td>${label()}</td></tr>
    <tr><td>2d</td><td>Biology</td><td>Biology</td><td>Biology</td><td>Biology</td></tr>
    <tr><td>1d</td><td>History</td><td>History</td><td>Literature</td><td>History</td></tr>
  `;
}

function onUpload(files) {
  if (!ocrOnline || !files?.length) return;
  noteText = MOCK_NOTE;
  const ta = $('#note-input');
  if (ta) ta.value = noteText;
}

document.addEventListener('DOMContentLoaded', () => {
  $$('[data-go]').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));
  $$('[data-flow]').forEach(el => el.addEventListener('click', () => {
    if (FLOW.includes(el.dataset.flow)) go(el.dataset.flow);
  }));
  $('#ocr-toggle')?.addEventListener('change', e => setOcr(e.target.checked));
  setOcr(true);
  $('#continue-btn')?.addEventListener('click', startClassify);
  $('#to-confirm')?.addEventListener('click', () => go('confirm'));
  $('#to-result')?.addEventListener('click', () => go('result'));
  $$('[data-pick]').forEach(b => b.addEventListener('click', () => pick(b.dataset.pick)));
  $('#other-input')?.addEventListener('input', e => {
    customOther = e.target.value.trim() || 'Study Skills';
    if (subject === 'Other') {
      $('#final').textContent = label();
    }
  });
  const file = $('#file-input');
  $('#upload-btn')?.addEventListener('click', () => { if (ocrOnline) file?.click(); });
  file?.addEventListener('change', () => onUpload(file.files));
  go('input');
});
"""


def js_payload() -> str:
    return (
        JS.replace("__MOCK_NOTE__", json.dumps(MOCK_NOTE))
        .replace("__FORMATTED_HTML__", json.dumps(FORMATTED_HTML.strip()))
        .replace("__SUBJECTS__", json.dumps(SUBJECTS))
    )


BODY = """
<div class="app">
  <header class="top">
    <button type="button" class="brand" data-go="input">NoteLMs</button>
    <nav class="nav">
      <button type="button" data-go="library">Library</button>
      <button type="button" data-go="research">Research</button>
    </nav>
  </header>

  <ol class="flow" id="flowbar">
    <li><button type="button" data-flow="input"><span>1</span>Input</button></li>
    <li><button type="button" data-flow="classify"><span>2</span>Classify</button></li>
    <li><button type="button" data-flow="confirm"><span>3</span>Confirm</button></li>
    <li><button type="button" data-flow="result"><span>4</span>Result</button></li>
  </ol>

  <main>
    <section data-step="input">
      <textarea id="note-input" placeholder="Paste notes…"></textarea>
      <div class="actions">
        <button type="button" class="btn ghost" id="upload-btn">Upload image</button>
        <input type="file" id="file-input" accept="image/*" hidden />
        <button type="button" class="btn" id="continue-btn">Continue</button>
      </div>
      <label class="ocr"><input type="checkbox" id="ocr-toggle" checked /> Image upload available</label>
    </section>

    <section data-step="classify" hidden>
      <div class="models">
        <article class="model" data-model="base">
          <div class="mname">Base BERT</div>
          <div class="mout" data-out>—</div>
          <div class="mconf" data-conf></div>
        </article>
        <article class="model" data-model="ft">
          <div class="mname">Fine-tuned BERT</div>
          <div class="mout" data-out>—</div>
          <div class="mconf" data-conf></div>
        </article>
        <article class="model" data-model="gpt">
          <div class="mname">gpt-oss:20b</div>
          <div class="mout" data-out>—</div>
          <div class="mconf" data-conf></div>
        </article>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="input">Back</button>
        <button type="button" class="btn" id="to-confirm">Continue</button>
      </div>
    </section>

    <section data-step="confirm" hidden>
      <div class="votes">
        <div><span>Base BERT</span><strong id="c-base">—</strong></div>
        <div><span>Fine-tuned</span><strong id="c-ft">—</strong></div>
        <div><span>gpt-oss</span><strong id="c-gpt">—</strong></div>
      </div>
      <div class="picks">
        <button type="button" data-pick="Physics" class="on">Physics</button>
        <button type="button" data-pick="Mathematics">Mathematics</button>
        <button type="button" data-pick="Chemistry">Chemistry</button>
        <button type="button" data-pick="Biology">Biology</button>
        <button type="button" data-pick="Computer Science">Computer Science</button>
        <button type="button" data-pick="History">History</button>
        <button type="button" data-pick="Literature">Literature</button>
        <button type="button" data-pick="Economics">Economics</button>
        <button type="button" data-pick="Other">Other</button>
      </div>
      <div id="other-field" hidden>
        <input id="other-input" type="text" value="Study Skills" placeholder="Subject name" />
      </div>
      <p class="final-line"><span id="final" style="--subj:#4f46e5">Physics</span></p>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="classify">Back</button>
        <button type="button" class="btn" id="to-result">Continue</button>
      </div>
    </section>

    <section data-step="result" hidden>
      <div class="result-head">
        <span id="result-subject">Physics</span>
      </div>
      <div id="result-shell" class="note-shell">
        <div id="result-body"></div>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="confirm">Back</button>
        <button type="button" class="btn" data-go="library">Library</button>
        <button type="button" class="btn ghost" data-go="input">New note</button>
      </div>
    </section>

    <section data-step="library" hidden>
      <div class="folders" id="folders"></div>
      <div class="actions">
        <button type="button" class="btn" data-go="input">New note</button>
      </div>
    </section>

    <section data-step="folder" hidden>
      <h1 id="folder-name" class="page-title">Physics</h1>
      <div class="note-list" id="folder-list"></div>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="library">Back</button>
      </div>
    </section>

    <section data-step="note" hidden>
      <h1 id="note-title" class="page-title">Note</h1>
      <div id="note-shell" class="note-shell">
        <div id="note-body"></div>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="folder">Back</button>
        <button type="button" class="btn ghost" data-go="library">Library</button>
      </div>
    </section>

    <section data-step="research" hidden>
      <table class="research">
        <thead><tr><th>When</th><th>Base</th><th>FT</th><th>gpt-oss</th><th>Judge</th></tr></thead>
        <tbody id="research-rows"></tbody>
      </table>
      <div class="actions">
        <button type="button" class="btn ghost" data-go="input">Back</button>
        <button type="button" class="btn" data-go="library">Library</button>
      </div>
    </section>
  </main>
</div>
"""

# Shared layout CSS (structure) — themes only override tokens + a few flourishes
BASE_CSS = """
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: var(--font);
  color: var(--ink);
  background: var(--bg);
  line-height: 1.45;
}
.app { max-width: 720px; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
.top {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.25rem;
}
.brand {
  border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; font-family: var(--display); font-size: 1.35rem;
  color: var(--ink); letter-spacing: -0.02em;
}
.nav { display: flex; gap: .85rem; }
.nav button {
  border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; color: var(--mute); font-size: .9rem;
}
.nav button:hover { color: var(--ink); }

.flow {
  list-style: none; margin: 0 0 1.75rem; padding: 0;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: .35rem;
}
.flow button {
  width: 100%; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--mute); padding: .55rem .35rem;
  display: flex; flex-direction: column; align-items: center; gap: .25rem;
  font-size: .75rem; border-bottom: 2px solid var(--line);
}
.flow button span {
  width: 1.5rem; height: 1.5rem; border-radius: 999px;
  display: grid; place-items: center; font-size: .75rem; font-weight: 600;
  border: 1px solid var(--line); color: var(--mute);
}
.flow button.active { color: var(--ink); border-bottom-color: var(--accent); }
.flow button.active span {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.flow button.done { color: var(--ink); border-bottom-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.flow button.done span {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent); color: var(--accent);
}

section[hidden] { display: none !important; }
textarea {
  width: 100%; min-height: 280px; resize: vertical;
  border: 1px solid var(--line); background: var(--surface);
  color: var(--ink); padding: 1rem 1.1rem; font: inherit;
  border-radius: var(--radius);
}
textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent); outline-offset: 1px; }
.actions {
  display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1rem;
  align-items: center;
}
.btn {
  border: 0; cursor: pointer; font: inherit; font-weight: 600;
  padding: .7rem 1.15rem; border-radius: var(--radius);
  background: var(--accent); color: var(--on-accent);
}
.btn.ghost {
  background: transparent; color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line);
}
.btn.is-disabled, .btn:disabled {
  opacity: .35; cursor: not-allowed; filter: grayscale(.3);
}
.ocr {
  display: inline-flex; gap: .45rem; align-items: center;
  margin-top: 1rem; color: var(--mute); font-size: .85rem; cursor: pointer;
}

.models { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; }
@media (max-width: 640px) { .models { grid-template-columns: 1fr; } }
.model {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 1rem; opacity: .55;
  transition: opacity .25s;
}
.model.ready { opacity: 1; }
.mname { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); }
.mout { font-family: var(--display); font-size: 1.35rem; margin-top: .4rem; }
.mconf { font-size: .85rem; color: var(--mute); margin-top: .15rem; }

.votes {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem;
  margin-bottom: 1.25rem;
}
@media (max-width: 640px) { .votes { grid-template-columns: 1fr; } }
.votes > div {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: .85rem 1rem;
  display: flex; flex-direction: column; gap: .25rem;
}
.votes span { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); }
.votes strong { font-size: 1.05rem; font-weight: 600; }

.picks { display: flex; flex-wrap: wrap; gap: .45rem; }
.picks button {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  padding: .45rem .7rem; border-radius: var(--radius); font: inherit; cursor: pointer;
}
.picks button.on {
  background: var(--ink); color: var(--bg); border-color: var(--ink);
}
#other-field { margin-top: .75rem; }
#other-field input {
  width: min(280px, 100%); padding: .6rem .75rem; font: inherit;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
}
.final-line { margin: 1.1rem 0 0; font-size: 1.15rem; }
#final, #result-subject, #folder-name {
  color: var(--subj, var(--accent)); font-family: var(--display); font-weight: 500;
}

.result-head { margin-bottom: .75rem; font-size: 1.1rem; }
.note-shell {
  background: var(--surface); border: 1px solid var(--line);
  border-top: 3px solid var(--subj, var(--accent));
  border-radius: var(--radius); padding: 1.25rem 1.35rem;
}
.note-shell h1 { font-family: var(--display); font-size: 1.45rem; margin: 0 0 .75rem; color: var(--subj, var(--ink)); }
.note-shell h2 { font-size: 1rem; margin: 1.1rem 0 .4rem; }
.note-shell .eq {
  font-family: ui-monospace, monospace; padding: .5rem .7rem;
  background: color-mix(in srgb, var(--subj, var(--accent)) 10%, var(--surface));
  border-radius: calc(var(--radius) - 2px);
}
.page-title { font-family: var(--display); font-size: 1.5rem; font-weight: 500; margin: 0 0 1rem; }

.folders {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .65rem;
}
.folder {
  border: 1px solid var(--line); background: var(--surface); text-align: left;
  padding: .9rem; border-radius: var(--radius); cursor: pointer; font: inherit;
  display: flex; justify-content: space-between; align-items: baseline; gap: .5rem;
  border-left: 3px solid var(--subj);
}
.fname { font-weight: 600; font-size: .92rem; }
.fcount { color: var(--mute); font-size: .85rem; }
.note-list { display: grid; gap: .5rem; }
.note-item {
  width: 100%; text-align: left; border: 1px solid var(--line); background: var(--surface);
  padding: .85rem 1rem; border-radius: var(--radius); font: inherit; cursor: pointer;
}
.note-item:hover { border-color: var(--accent); }
.research { width: 100%; border-collapse: collapse; font-size: .9rem; }
.research th, .research td {
  text-align: left; padding: .55rem .4rem; border-bottom: 1px solid var(--line);
}
.research th { color: var(--mute); font-weight: 500; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
"""

THEMES = {
    "v01-atelier": {
        "title": "NoteLMs · Atelier",
        "fonts": "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
        "tokens": """
:root {
  --ink: #0b1f33;
  --mute: #5a7186;
  --line: #d0dbe6;
  --bg: #f4f7fa;
  --surface: #ffffff;
  --accent: #1a6b8a;
  --on-accent: #ffffff;
  --radius: 4px;
  --font: "IBM Plex Sans", system-ui, sans-serif;
  --display: "Fraunces", Georgia, serif;
}
body {
  background:
    radial-gradient(900px 420px at 15% -10%, #dce8f1 0%, transparent 55%),
    var(--bg);
}
.brand span { color: var(--accent); }
""",
        "brand_html": 'Note<span style="color:var(--accent)">LMs</span>',
    },
    "v04-blueprint": {
        "title": "NoteLMs · Blueprint",
        "fonts": "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=Work+Sans:wght@400;500;600&display=swap",
        "tokens": """
:root {
  --ink: #0a2540;
  --mute: #5a738a;
  --line: #b9c9d9;
  --bg: #f3f6fa;
  --surface: #ffffff;
  --accent: #0a2540;
  --on-accent: #ffffff;
  --radius: 2px;
  --font: "Work Sans", system-ui, sans-serif;
  --display: "Source Serif 4", Georgia, serif;
}
body {
  background-image:
    linear-gradient(rgba(27,79,138,.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(27,79,138,.06) 1px, transparent 1px);
  background-size: 28px 28px;
  background-color: var(--bg);
}
.brand { font-family: "IBM Plex Mono", monospace; font-size: .95rem; letter-spacing: .08em; text-transform: uppercase; }
.flow button { font-family: "IBM Plex Mono", monospace; font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; }
.mname, .votes span { font-family: "IBM Plex Mono", monospace; }
.btn { font-family: "IBM Plex Mono", monospace; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.note-shell { border-top-width: 2px; }
""",
        "brand_html": "NoteLMs",
    },
    "v05-orchard": {
        "title": "NoteLMs · Orchard",
        "fonts": "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap",
        "tokens": """
:root {
  --ink: #2c241b;
  --mute: #7a7166;
  --line: #e0d6c8;
  --bg: #f7f3ec;
  --surface: #fffef9;
  --accent: #3d6b4f;
  --on-accent: #ffffff;
  --radius: 6px;
  --font: "Figtree", system-ui, sans-serif;
  --display: "Instrument Serif", Georgia, serif;
}
body {
  background:
    radial-gradient(800px 400px at 0% 0%, #e5efe6 0%, transparent 55%),
    radial-gradient(700px 360px at 100% 0%, #f0e6ea 0%, transparent 50%),
    var(--bg);
}
.brand { font-style: italic; font-size: 1.6rem; font-weight: 400; }
.flow button.active { border-bottom-color: #d4849a; }
.flow button.active span { background: var(--accent); }
.picks button.on { background: #1f3d2c; border-color: #1f3d2c; }
""",
        "brand_html": "NoteLMs",
    },
}


INDEX = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NoteLMs — UI variations</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Fraunces:opsz,wght@9..144,500&display=swap" rel="stylesheet" />
<style>
  body { margin:0; font-family:"DM Sans",system-ui,sans-serif; color:#142033; background:#f6f8fb; padding:2.5rem 1.25rem; }
  .wrap { max-width:640px; margin:0 auto; }
  h1 { font-family:"Fraunces",Georgia,serif; font-weight:500; margin:0 0 1.5rem; }
  a { display:flex; justify-content:space-between; align-items:center; text-decoration:none; color:inherit;
      background:#fff; border:1px solid #d5dde6; padding:1rem 1.1rem; margin-bottom:.65rem; border-radius:8px; }
  a:hover { border-color:#1a6b8a; }
  .muted { color:#5a6b7d; font-size:.9rem; margin-top:1.5rem; }
  .tag { font-size:.75rem; color:#1a6b8a; font-weight:600; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>NoteLMs</h1>
    <a href="v01-atelier/index.html"><span>Atelier</span><span class="tag">Open</span></a>
    <a href="v04-blueprint/index.html"><span>Blueprint</span><span class="tag">Open</span></a>
    <a href="v05-orchard/index.html"><span>Orchard</span><span class="tag">Open</span></a>
    <p class="muted">Minimal UI mocks · no backend</p>
  </div>
</body>
</html>
"""

README = """# NoteLMs UI scratch

Focused variations: **Atelier**, **Blueprint**, **Orchard**.

Flow: **Input → Classify → Confirm → Result**, plus Library / Research.

Static mock only — no backend.
"""


def write_variant(key: str, theme: dict) -> None:
    body = BODY.replace(
        '<button type="button" class="brand" data-go="input">NoteLMs</button>',
        f'<button type="button" class="brand" data-go="input">{theme["brand_html"]}</button>',
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{theme["title"]}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="{theme["fonts"]}" rel="stylesheet" />
<style>
{theme["tokens"]}
{BASE_CSS}
</style>
</head>
<body>
{body}
<script>
{js_payload()}
</script>
</body>
</html>
"""
    path = ROOT / key / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    (ROOT / "index.html").write_text(INDEX, encoding="utf-8")
    (ROOT / "README.md").write_text(README, encoding="utf-8")
    for key, theme in THEMES.items():
        write_variant(key, theme)
    # Keep older explorations but mark them lightly via leaving files;
    # regenerate only the three preferred ones above.
    print("done")


if __name__ == "__main__":
    main()
