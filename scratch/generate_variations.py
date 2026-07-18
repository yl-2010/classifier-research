#!/usr/bin/env python3
"""Generate 5 distinct NoteLMs UI mockups (static, no backend)."""

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
  <h2>Isothermal process <span>(ΔT = 0)</span></h2>
  <p>ΔU = 0 ⇒ Q = W</p>
  <p class="eq">W = nRT ln(V₂/V₁)</p>
</section>
<section>
  <h2>Adiabatic process <span>(Q = 0)</span></h2>
  <p>ΔU = −W</p>
  <p class="eq">TV<sup>γ−1</sup> = constant</p>
</section>
<section>
  <h2>Entropy</h2>
  <p>dS ≥ đQ/T <em>(equality for reversible processes)</em></p>
</section>
"""

SHARED_JS = r"""
const MOCK_NOTE = `""" + MOCK_NOTE.replace("\\", "\\\\").replace("`", "\\`") + r"""`;
const FORMATTED_HTML = `""" + FORMATTED_HTML.strip().replace("\\", "\\\\").replace("`", "\\`") + r"""`;
const SUBJECTS = """ + __import__("json").dumps(SUBJECTS) + r""";
const SUBJECT_COLORS = Object.fromEntries(SUBJECTS);

const LIBRARY = {
  Mathematics: [
    { id: 'math-1', title: 'Derivatives cheat sheet', blurb: 'Power rule, product rule, chain rule.' },
    { id: 'math-2', title: 'Integrals workshop', blurb: 'u-sub and definite integrals.' },
    { id: 'math-3', title: 'Linear algebra intro', blurb: 'Matrices, determinants, eigenvalues.' },
  ],
  Physics: [
    { id: 'phys-1', title: 'Thermodynamics — Lecture 12', blurb: 'First law, isothermal & adiabatic.' },
    { id: 'phys-2', title: 'Newton’s laws review', blurb: 'Free-body diagrams and friction.' },
  ],
  Chemistry: [
    { id: 'chem-1', title: 'Stoichiometry drills', blurb: 'Mole ratios and limiting reagents.' },
    { id: 'chem-2', title: 'Acid–base equilibria', blurb: 'pH, Ka, and buffers.' },
  ],
  Biology: [
    { id: 'bio-1', title: 'Cell organelles map', blurb: 'Mitochondria, ER, Golgi.' },
    { id: 'bio-2', title: 'Mendelian genetics', blurb: 'Punnett squares and alleles.' },
  ],
  'Computer Science': [
    { id: 'cs-1', title: 'Big-O notation', blurb: 'Common complexities and examples.' },
    { id: 'cs-2', title: 'Recursion patterns', blurb: 'Base cases and call stacks.' },
  ],
  History: [
    { id: 'hist-1', title: 'Industrial Revolution', blurb: 'Causes, tech, social impact.' },
  ],
  Literature: [
    { id: 'lit-1', title: 'Sonnet structure', blurb: 'Shakespearean rhyme and volta.' },
    { id: 'lit-2', title: 'Theme vs motif', blurb: 'Close-reading notes.' },
  ],
  Economics: [
    { id: 'econ-1', title: 'Supply & demand', blurb: 'Shifts vs movements.' },
    { id: 'econ-2', title: 'Elasticity basics', blurb: 'Price elasticity of demand.' },
  ],
  Other: [
    { id: 'other-1', title: 'Study skills — spaced repetition', blurb: 'Custom subject example.' },
  ],
};

const RESEARCH_SEED = [
  { when: '2d ago', base: 'Biology', ft: 'Biology', gpt: 'Biology', judge: 'Biology' },
  { when: '1d ago', base: 'History', ft: 'History', gpt: 'Literature', judge: 'History' },
  { when: '5h ago', base: 'Mathematics', ft: 'Mathematics', gpt: 'Mathematics', judge: 'Mathematics' },
];

let step = 'home';
let ocrOnline = true;
let noteText = MOCK_NOTE;
let subject = 'Physics';
let customOther = 'Study Skills';
let currentFolder = 'Physics';
let currentNoteId = 'phys-1';
let loggedToResearch = false;

const mockVotes = {
  base: { label: 'Physics', conf: 0.81 },
  ft: { label: 'Physics', conf: 0.94 },
  gpt: { label: 'Physics', conf: 0.88 },
};

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function displaySubject(){
  return subject === 'Other' && customOther ? `Other · ${customOther}` : subject;
}

function noteHtml(title, blurb){
  return `<h1>${title}</h1>
<section>
  <h2>Summary</h2>
  <p>${blurb}</p>
</section>
<section>
  <h2>Key points</h2>
  <ul>
    <li>Mock formatted content for UI exploration</li>
    <li>Subject styling applied application-wide</li>
    <li>No backend — sample HTML only</li>
  </ul>
</section>
<section>
  <h2>Equations / quotes</h2>
  <p class="eq">Sample block · ${displaySubject()}</p>
</section>`;
}

function go(s){
  step = s;
  $all('[data-step]').forEach(el => {
    el.hidden = el.dataset.step !== s;
  });
  const navGroup = {
    home: 'home', capture: 'capture', extract: 'capture',
    classify: 'classify', judge: 'classify',
    research: 'research', formatted: 'library',
    library: 'library', folder: 'library', note: 'library',
  };
  $all('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === (navGroup[s] || s));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (s === 'classify') animateClassify();
  if (s === 'formatted') renderFormatted();
  if (s === 'note') renderNote();
  if (s === 'library') renderLibrary();
  if (s === 'folder') renderFolder();
  if (s === 'research') renderResearch();
  if (s === 'judge') renderJudge();
  if (s === 'extract') {
    const ta = $('#extracted');
    if (ta) ta.value = noteText || MOCK_NOTE;
  }
  if (s === 'capture') {
    const ta = $('#raw-text');
    if (ta && !ta.value.trim()) ta.placeholder = 'Paste raw notes here… (or continue to use sample)';
  }
}

function setOcr(online){
  ocrOnline = online;
  const zone = $('#dropzone');
  const toggle = $('#ocr-toggle');
  if (toggle) toggle.checked = online;
  if (!zone) return;
  zone.classList.toggle('disabled', !online);
  zone.setAttribute('aria-disabled', String(!online));
  const hint = $('#ocr-hint');
  if (hint) hint.textContent = online
    ? 'Image OCR available — drop a photo of handwritten notes (mock).'
    : 'OCR API offline — image upload grayed out. Paste text only.';
}

function useSample(){
  noteText = MOCK_NOTE;
  const raw = $('#raw-text');
  if (raw) raw.value = MOCK_NOTE;
  go('extract');
}

function continueFromCapture(){
  const t = ($('#raw-text')?.value || '').trim();
  noteText = t || MOCK_NOTE;
  go('extract');
}

function continueFromExtract(){
  noteText = ($('#extracted')?.value || '').trim() || MOCK_NOTE;
  go('classify');
}

function animateClassify(){
  $all('.model-card').forEach((card,i) => {
    card.classList.remove('ready');
    const status = card.querySelector('.status');
    const label = card.querySelector('.label-out');
    const conf = card.querySelector('.conf-out');
    if (status) status.textContent = 'Running…';
    if (label) label.textContent = '—';
    if (conf) conf.textContent = '—';
    setTimeout(() => {
      card.classList.add('ready');
      const key = card.dataset.model;
      const v = mockVotes[key];
      if (status) status.textContent = 'Done (mock)';
      if (label) label.textContent = v.label;
      if (conf) conf.textContent = (v.conf*100).toFixed(0) + '%';
    }, 400 + i*350);
  });
}

function renderJudge(){
  const jt = $('#judge-text');
  if (jt) jt.textContent = (noteText || MOCK_NOTE).slice(0, 280) + ((noteText||MOCK_NOTE).length>280?'…':'');
  const vb = $('#vote-base'); if (vb) vb.textContent = mockVotes.base.label + ' · ' + Math.round(mockVotes.base.conf*100) + '%';
  const vf = $('#vote-ft'); if (vf) vf.textContent = mockVotes.ft.label + ' · ' + Math.round(mockVotes.ft.conf*100) + '%';
  const vg = $('#vote-gpt'); if (vg) vg.textContent = mockVotes.gpt.label + ' · ' + Math.round(mockVotes.gpt.conf*100) + '%';
  updateFinalLabel();
  const otherWrap = $('#other-wrap');
  if (otherWrap) otherWrap.hidden = subject !== 'Other';
  const otherInput = $('#other-input');
  if (otherInput) otherInput.value = customOther;
}

function updateFinalLabel(){
  const fl = $('#final-label');
  if (!fl) return;
  fl.textContent = displaySubject();
  fl.style.setProperty('--subj', SUBJECT_COLORS[subject] || '#64748b');
}

function applyJudge(label){
  subject = label;
  const otherWrap = $('#other-wrap');
  if (otherWrap) otherWrap.hidden = label !== 'Other';
  if (label === 'Other'){
    const otherInput = $('#other-input');
    if (otherInput){
      if (!otherInput.value.trim()) otherInput.value = customOther || 'Study Skills';
      customOther = otherInput.value.trim() || 'Study Skills';
      otherInput.focus();
    }
  }
  updateFinalLabel();
}

function renderResearch(){
  const judgeLabel = displaySubject();
  const body = $('#research-body');
  if (!body) return;
  const current = loggedToResearch || true;
  const rows = [];
  if (current){
    rows.push(`<tr class="highlight-row"><td>just now</td><td>${mockVotes.base.label}</td><td>${mockVotes.ft.label}</td><td>${mockVotes.gpt.label}</td><td><strong>${judgeLabel}</strong></td><td><button type="button" class="linkish" data-go="formatted">View format</button></td></tr>`);
  }
  RESEARCH_SEED.forEach(r => {
    rows.push(`<tr><td>${r.when}</td><td>${r.base}</td><td>${r.ft}</td><td>${r.gpt}</td><td>${r.judge}</td><td><button type="button" class="linkish" data-open-subject="${r.judge}">Open folder</button></td></tr>`);
  });
  body.innerHTML = rows.join('');
  const chip = $('#research-subject-chip');
  if (chip){
    chip.textContent = judgeLabel;
    chip.style.setProperty('--subj', SUBJECT_COLORS[subject] || '#64748b');
  }
  bindDynamicClicks(body);
}

function renderFormatted(){
  const shell = $('#formatted-shell');
  if (!shell) return;
  const color = SUBJECT_COLORS[subject] || '#64748b';
  shell.style.setProperty('--subj', color);
  const title = subject === 'Physics' ? 'Thermodynamics — Lecture 12' : `${displaySubject()} · New note`;
  const blurb = subject === 'Physics'
    ? 'First law, isothermal and adiabatic processes from your capture.'
    : 'Mock HTML formatting for the selected subject.';
  $('#formatted-body').innerHTML = subject === 'Physics' ? FORMATTED_HTML : noteHtml(title, blurb);
  const meta = $('#formatted-meta');
  if (meta) meta.textContent = displaySubject() + ' · predetermined subject styling';
}

function openFolder(name){
  currentFolder = name;
  go('folder');
}

function openNote(subjectName, noteId){
  currentFolder = subjectName;
  currentNoteId = noteId;
  subject = subjectName in SUBJECT_COLORS ? subjectName : subject;
  go('note');
}

function renderFolder(){
  const title = $('#folder-title');
  const list = $('#folder-notes');
  const color = SUBJECT_COLORS[currentFolder] || '#64748b';
  if (title){
    title.textContent = currentFolder;
    title.style.setProperty('--subj', color);
  }
  const notes = LIBRARY[currentFolder] || [];
  if (!list) return;
  if (!notes.length){
    list.innerHTML = `<p class="status">No notes yet — <button type="button" class="linkish" data-go="capture">capture one</button></p>`;
    bindDynamicClicks(list);
    return;
  }
  list.innerHTML = notes.map(n => `
    <button type="button" class="note-row" style="--subj:${color}" data-note-id="${n.id}" data-note-subject="${currentFolder}">
      <span class="note-row-title">${n.title}</span>
      <span class="note-row-blurb">${n.blurb}</span>
    </button>`).join('');
  $all('[data-note-id]', list).forEach(btn => {
    btn.addEventListener('click', () => openNote(btn.dataset.noteSubject, btn.dataset.noteId));
  });
}

function renderNote(){
  const notes = LIBRARY[currentFolder] || [];
  const n = notes.find(x => x.id === currentNoteId) || notes[0] || {
    title: displaySubject() + ' note',
    blurb: 'Mock note content.',
  };
  const color = SUBJECT_COLORS[currentFolder] || SUBJECT_COLORS[subject] || '#64748b';
  const heading = $('#note-heading');
  if (heading) heading.textContent = `${currentFolder} · ${n.title}`;
  const shell = $('#note-shell');
  if (!shell) return;
  shell.style.setProperty('--subj', color);
  const body = $('#note-body');
  if (!body) return;
  if (n.id === 'phys-1') body.innerHTML = FORMATTED_HTML;
  else body.innerHTML = noteHtml(n.title, n.blurb);
}

function renderLibrary(){
  const grid = $('#folder-grid');
  if (!grid) return;
  grid.innerHTML = SUBJECTS.map(([name, color]) => {
    const count = (LIBRARY[name] || []).length;
    const active = name === currentFolder ? ' active' : '';
    return `<button type="button" class="folder${active}" style="--subj:${color}" data-open-subject="${name}">
      <span class="folder-mark"></span>
      <span class="folder-name">${name}</span>
      <span class="folder-count">${count} note${count===1?'':'s'}</span>
    </button>`;
  }).join('');
  bindDynamicClicks(grid);
}

function onFile(files){
  if (!ocrOnline) return;
  if (!files || !files.length) return;
  noteText = MOCK_NOTE + `\n\n[Mock OCR from: ${files[0].name}]`;
  const raw = $('#raw-text');
  if (raw) raw.value = noteText;
  go('extract');
}

function bindDynamicClicks(root){
  $all('[data-go]', root).forEach(el => {
    el.addEventListener('click', () => go(el.dataset.go));
  });
  $all('[data-open-subject]', root).forEach(el => {
    el.addEventListener('click', () => openFolder(el.dataset.openSubject));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  $all('[data-go]').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));
  const ocr = $('#ocr-toggle');
  if (ocr) ocr.addEventListener('change', e => setOcr(e.target.checked));
  setOcr(true);

  const drop = $('#dropzone');
  const file = $('#file-input');
  if (drop && file){
    drop.addEventListener('click', () => { if (ocrOnline) file.click(); });
    drop.addEventListener('dragover', e => { e.preventDefault(); if (ocrOnline) drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      onFile(e.dataTransfer.files);
    });
    file.addEventListener('change', () => onFile(file.files));
  }

  $all('[data-judge]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyJudge(btn.dataset.judge);
      $all('[data-judge]').forEach(b => b.classList.toggle('picked', b === btn));
    });
  });

  const otherInput = $('#other-input');
  if (otherInput){
    otherInput.addEventListener('input', () => {
      customOther = otherInput.value.trim() || 'Study Skills';
      if (subject === 'Other') updateFinalLabel();
    });
  }

  const logBtn = $('#log-research-btn');
  if (logBtn){
    logBtn.addEventListener('click', () => {
      loggedToResearch = true;
      go('research');
    });
  }

  go('home');
});
"""


SHARED_UI_CSS = """
.note-row {
  display: grid; gap: .25rem; width: 100%; text-align: left; cursor: pointer;
  border: 1px solid currentColor; border-left: 4px solid var(--subj, #64748b);
  background: #fff; padding: 1rem 1.1rem; font: inherit; margin-bottom: .65rem; opacity: .95;
}
.note-row-title { font-weight: 700; }
.note-row-blurb { font-size: .9rem; opacity: .75; }
button.linkish, .linkish {
  background: none; border: 0; padding: 0; color: inherit; font: inherit;
  cursor: pointer; text-decoration: underline; font-weight: 600;
}
#other-wrap { margin: .75rem 0 1rem; }
#other-wrap input {
  width: min(320px, 100%); padding: .55rem .7rem; border: 1px solid #ccc;
  font: inherit; background: #fff; margin-top: .35rem;
}
tr.highlight-row td { font-weight: 500; }
.notes-list { margin-top: 1rem; }
"""


def wrap(title, fonts, css, body, brand="NoteLMs"):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="{fonts}" rel="stylesheet" />
<style>
{css}
{SHARED_UI_CSS}
</style>
</head>
<body>
{body}
<script>
{SHARED_JS}
</script>
</body>
</html>
"""


# ── Variation 1: Atelier — cool ink academic studio ─────────────────────────
CSS_ATELIER = """
:root {
  --ink: #0b1f33;
  --ink-soft: #1e3a52;
  --paper: #f3f6f9;
  --line: #c5d0db;
  --accent: #1a6b8a;
  --accent-2: #c45c26;
  --ok: #2f6f4e;
  --warn: #8a6a1a;
  --radius: 2px;
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  background:
    radial-gradient(1200px 600px at 10% -10%, #d9e6f0 0%, transparent 55%),
    radial-gradient(900px 500px at 100% 0%, #e8eef3 0%, transparent 50%),
    var(--paper);
  line-height: 1.5;
}
a { color: var(--accent); }
.app { max-width: 1100px; margin: 0 auto; padding: 1.25rem 1.5rem 4rem; }
.top {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line);
  margin-bottom: 2rem;
}
.brand {
  font-family: var(--font-display);
  font-size: 1.75rem; font-weight: 500; letter-spacing: -0.02em; margin: 0;
}
.brand span { color: var(--accent); }
.rail { display: flex; flex-wrap: wrap; gap: .5rem .85rem; font-size: .8rem; }
.rail button {
  background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--ink-soft); font: inherit; border-bottom: 1px solid transparent;
}
.rail button.active, .rail button:hover { color: var(--ink); border-color: var(--accent); }
.panel[hidden] { display: none !important; }
.hero-grid {
  display: grid; grid-template-columns: 1.2fr .8fr; gap: 2.5rem; align-items: end;
  min-height: 70vh;
}
@media (max-width: 800px){ .hero-grid { grid-template-columns: 1fr; min-height: auto; } }
h1, h2, h3 { font-family: var(--font-display); font-weight: 500; letter-spacing: -0.02em; }
.hero h1 { font-size: clamp(2.4rem, 5vw, 3.8rem); line-height: 1.05; margin: 0 0 1rem; }
.lede { font-size: 1.1rem; max-width: 34ch; color: var(--ink-soft); }
.cta-row { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.75rem; }
button.btn, .btn {
  font: inherit; cursor: pointer; border: 1px solid var(--ink);
  background: var(--ink); color: #fff; padding: .7rem 1.1rem; border-radius: var(--radius);
}
button.btn.ghost, .btn.ghost { background: transparent; color: var(--ink); }
button.btn:disabled { opacity: .4; cursor: not-allowed; }
.side-card {
  border: 1px solid var(--line); background: rgba(255,255,255,.7);
  padding: 1.25rem; backdrop-filter: blur(6px);
}
.side-card h3 { margin: 0 0 .5rem; font-size: 1.1rem; }
.side-card ol { margin: 0; padding-left: 1.1rem; color: var(--ink-soft); font-size: .92rem; }
.kicker { font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin: 0 0 .5rem; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 800px){ .split { grid-template-columns: 1fr; } }
.dropzone {
  border: 1.5px dashed var(--line); min-height: 220px; padding: 1.5rem;
  display: grid; place-content: center; text-align: center; gap: .5rem;
  background: #fff; cursor: pointer; transition: border-color .2s, background .2s;
}
.dropzone.drag { border-color: var(--accent); background: #eef6f9; }
.dropzone.disabled { opacity: .45; cursor: not-allowed; background: #e8ecef; filter: grayscale(.4); }
textarea {
  width: 100%; min-height: 220px; resize: vertical; font: inherit;
  border: 1px solid var(--line); padding: 1rem; background: #fff; color: var(--ink);
}
.row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.toggle { display: flex; align-items: center; gap: .5rem; font-size: .9rem; }
.models { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
@media (max-width: 800px){ .models { grid-template-columns: 1fr; } }
.model-card {
  border: 1px solid var(--line); background: #fff; padding: 1rem 1.1rem;
  opacity: .55; transition: opacity .3s, transform .3s;
}
.model-card.ready { opacity: 1; transform: translateY(-2px); }
.model-card .name { font-family: var(--font-mono); font-size: .78rem; color: var(--accent); }
.model-card .label-out { font-family: var(--font-display); font-size: 1.5rem; margin: .4rem 0; }
.model-card .conf-out { font-family: var(--font-mono); }
.status { font-size: .8rem; color: var(--ink-soft); }
.judge-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 1.25rem; }
@media (max-width: 800px){ .judge-grid { grid-template-columns: 1fr; } }
.votes { display: flex; flex-direction: column; gap: .5rem; }
.vote { border-left: 3px solid var(--accent); padding: .5rem .75rem; background: #fff; }
.chip-row { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
.chip-row button {
  border: 1px solid var(--line); background: #fff; padding: .4rem .7rem;
  font: inherit; cursor: pointer; border-radius: var(--radius);
}
.chip-row button.picked { border-color: var(--ink); background: var(--ink); color: #fff; }
table { width: 100%; border-collapse: collapse; background: #fff; font-size: .92rem; }
th, td { text-align: left; padding: .65rem .75rem; border-bottom: 1px solid var(--line); }
th { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); }
.subj-chip {
  display: inline-block; padding: .2rem .55rem; border-radius: var(--radius);
  background: color-mix(in srgb, var(--subj) 18%, white); color: var(--subj);
  font-weight: 600; font-size: .85rem;
}
#formatted-shell, .note-view {
  --subj: #4f46e5;
  border-top: 4px solid var(--subj);
  background: #fff; padding: 1.75rem 2rem; border: 1px solid var(--line); border-top-width: 4px;
}
#formatted-body h1 { color: var(--subj); font-size: 1.8rem; margin-top: 0; }
#formatted-body h2 { font-size: 1.15rem; border-bottom: 1px solid color-mix(in srgb, var(--subj) 30%, white); padding-bottom: .25rem; }
#formatted-body .eq { font-family: var(--font-mono); background: color-mix(in srgb, var(--subj) 8%, white); padding: .5rem .75rem; }
.folders { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: .85rem; }
.folder {
  border: 1px solid var(--line); background: #fff; text-align: left; padding: 1rem;
  cursor: pointer; font: inherit; display: grid; gap: .35rem;
}
.folder.active { outline: 2px solid var(--subj); }
.folder-mark { width: 28px; height: 20px; border-radius: 2px 2px 0 0; background: var(--subj); opacity: .85; }
.folder-name { font-weight: 600; }
.folder-count { font-size: .8rem; color: var(--ink-soft); }
.foot-note { margin-top: 2rem; font-size: .8rem; color: var(--ink-soft); }
.note-row {
  display: grid; gap: .25rem; width: 100%; text-align: left; cursor: pointer;
  border: 1px solid var(--line); background: #fff; padding: 1rem 1.1rem; font: inherit;
  border-left: 4px solid var(--subj); margin-bottom: .65rem;
}
.note-row:hover { background: #f8fafc; }
.note-row-title { font-weight: 600; }
.note-row-blurb { font-size: .9rem; color: var(--ink-soft); }
button.linkish, .linkish {
  background: none; border: 0; padding: 0; color: var(--accent); font: inherit;
  cursor: pointer; text-decoration: underline;
}
#other-wrap { margin: .75rem 0 1rem; }
#other-wrap input {
  width: min(320px, 100%); padding: .55rem .7rem; border: 1px solid var(--line);
  font: inherit; background: #fff;
}
tr.highlight-row { background: color-mix(in srgb, var(--accent, #1a6b8a) 8%, white); }
.notes-list { margin-top: 1rem; }
"""

BODY_ATELIER = """
<div class="app">
  <header class="top">
    <p class="brand">Note<span>LMs</span></p>
    <nav class="rail" aria-label="Flow">
      <button type="button" data-nav="home" data-go="home">Home</button>
      <button type="button" data-nav="capture" data-go="capture">Capture</button>
      <button type="button" data-nav="classify" data-go="classify">Classify</button>
      <button type="button" data-nav="research" data-go="research">Research</button>
      <button type="button" data-nav="library" data-go="library">Library</button>
    </nav>
  </header>

  <section class="panel" data-step="home">
    <div class="hero-grid">
      <div class="hero">
        <p class="kicker">UI mock · variation 01 · Atelier</p>
        <h1>Notes, classified and composed.</h1>
        <p class="lede">Photograph or paste lecture notes. Three models vote. A judge decides. Your library fills with subject-styled pages.</p>
        <div class="cta-row">
          <button class="btn" type="button" data-go="capture">Start capture</button>
          <button class="btn ghost" type="button" data-go="library">Browse library</button>
        </div>
      </div>
      <aside class="side-card">
        <h3>Pipeline</h3>
        <ol>
          <li>Image OCR or raw text</li>
          <li>Base BERT · Fine-tuned BERT · gpt-oss:20b</li>
          <li>Judge LLM (or Other)</li>
          <li>Research log update</li>
          <li>HTML formatting by subject</li>
        </ol>
      </aside>
    </div>
  </section>

  <section class="panel" data-step="capture" hidden>
    <p class="kicker">Step 1</p>
    <h2>Capture notes</h2>
    <div class="row">
      <label class="toggle"><input type="checkbox" id="ocr-toggle" checked /> OCR API online</label>
      <p id="ocr-hint" class="status"></p>
    </div>
    <div class="split">
      <div>
        <div class="dropzone" id="dropzone" role="button" tabindex="0">
          <strong>Drop image of notes</strong>
          <span>JPG, PNG, HEIC — mock OCR only</span>
        </div>
        <input type="file" id="file-input" accept="image/*" hidden />
      </div>
      <div>
        <textarea id="raw-text" placeholder="Or paste raw notes here…"></textarea>
      </div>
    </div>
    <div class="cta-row">
      <button class="btn" type="button" onclick="continueFromCapture()">Continue with text</button>
      <button class="btn ghost" type="button" onclick="useSample()">Use sample Physics notes</button>
    </div>
  </section>

  <section class="panel" data-step="extract" hidden>
    <p class="kicker">Step 2</p>
    <h2>Review extracted text</h2>
    <p class="lede">If this came from an image, OCR output lands here. Edit freely before classification.</p>
    <textarea id="extracted"></textarea>
    <div class="cta-row">
      <button class="btn ghost" type="button" data-go="capture">Back</button>
      <button class="btn" type="button" onclick="continueFromExtract()">Send to classifiers</button>
    </div>
  </section>

  <section class="panel" data-step="classify" hidden>
    <p class="kicker">Step 3</p>
    <h2>Three-model classification</h2>
    <div class="models">
      <article class="model-card" data-model="base">
        <div class="name">base BERT</div>
        <div class="label-out">—</div>
        <div class="conf-out">—</div>
        <div class="status">Idle</div>
      </article>
      <article class="model-card" data-model="ft">
        <div class="name">fine-tuned BERT</div>
        <div class="label-out">—</div>
        <div class="conf-out">—</div>
        <div class="status">Idle</div>
      </article>
      <article class="model-card" data-model="gpt">
        <div class="name">gpt-oss:20b · LM Studio</div>
        <div class="label-out">—</div>
        <div class="conf-out">—</div>
        <div class="status">Idle</div>
      </article>
    </div>
    <div class="cta-row">
      <button class="btn" type="button" data-go="judge">Open judge</button>
    </div>
  </section>

  <section class="panel" data-step="judge" hidden>
    <p class="kicker">Step 4</p>
    <h2>Judge LLM</h2>
    <div class="judge-grid">
      <div>
        <p class="status">Original text (excerpt)</p>
        <div class="side-card" id="judge-text"></div>
        <div class="votes" style="margin-top:1rem">
          <div class="vote"><strong>Base BERT</strong> · <span id="vote-base"></span></div>
          <div class="vote"><strong>Fine-tuned BERT</strong> · <span id="vote-ft"></span></div>
          <div class="vote"><strong>gpt-oss:20b</strong> · <span id="vote-gpt"></span></div>
        </div>
      </div>
      <div>
        <p>Select final label (multiple may be correct if identical):</p>
        <div class="chip-row">
          <button type="button" data-judge="Physics" class="picked">Physics</button>
          <button type="button" data-judge="Mathematics">Mathematics</button>
          <button type="button" data-judge="Chemistry">Chemistry</button>
          <button type="button" data-judge="Biology">Biology</button>
          <button type="button" data-judge="Computer Science">Computer Science</button>
          <button type="button" data-judge="History">History</button>
          <button type="button" data-judge="Literature">Literature</button>
          <button type="button" data-judge="Economics">Economics</button>
          <button type="button" data-judge="Other">Other…</button>
        </div>
        <div id="other-wrap" hidden>
          <label for="other-input">Custom Other subject</label><br />
          <input id="other-input" type="text" value="Study Skills" />
        </div>
        <p>Final: <span class="subj-chip" id="final-label" style="--subj:#4f46e5">Physics</span></p>
        <div class="cta-row">
          <button class="btn ghost" type="button" data-go="classify">Back</button>
          <button class="btn" type="button" id="log-research-btn">Log to research</button>
        </div>
      </div>
    </div>
  </section>

  <section class="panel" data-step="research" hidden>
    <p class="kicker">Step 5 · Research</p>
    <h2>Research data</h2>
    <p>Latest run under <span class="subj-chip" id="research-subject-chip">Physics</span> — mock table only, nothing is saved.</p>
    <table>
      <thead><tr><th>When</th><th>Base BERT</th><th>Fine-tuned</th><th>gpt-oss</th><th>Judge</th><th></th></tr></thead>
      <tbody id="research-body"></tbody>
    </table>
    <div class="cta-row">
      <button class="btn ghost" type="button" data-go="judge">Back to judge</button>
      <button class="btn" type="button" data-go="formatted">Format notes as HTML</button>
      <button class="btn ghost" type="button" data-go="library">Go to library</button>
    </div>
  </section>

  <section class="panel" data-step="formatted" hidden>
    <p class="kicker">Step 6</p>
    <h2>Subject-styled HTML</h2>
    <p id="formatted-meta" class="status"></p>
    <div id="formatted-shell"><div id="formatted-body"></div></div>
    <div class="cta-row">
      <button class="btn ghost" type="button" data-go="research">Back to research</button>
      <button class="btn" type="button" data-go="library">Open library folders</button>
      <button class="btn ghost" type="button" onclick="openFolder(subject)">Open this subject folder</button>
    </div>
  </section>

  <section class="panel" data-step="library" hidden>
    <p class="kicker">Library</p>
    <h2>Folders by subject</h2>
    <p class="lede">Each subject uses a predetermined color and shared note structure. Every folder opens.</p>
    <div class="folders" id="folder-grid"></div>
    <div class="cta-row">
      <button class="btn" type="button" data-go="capture">Capture new notes</button>
      <button class="btn ghost" type="button" data-go="research">View research</button>
    </div>
  </section>

  <section class="panel" data-step="folder" hidden>
    <p class="kicker">Folder</p>
    <h2 id="folder-title" class="subj-chip" style="--subj:#4f46e5">Physics</h2>
    <p class="lede">Mock notes in this subject. Click any row to read.</p>
    <div class="notes-list" id="folder-notes"></div>
    <div class="cta-row">
      <button class="btn ghost" type="button" data-go="library">All folders</button>
      <button class="btn" type="button" data-go="capture">Add notes</button>
    </div>
  </section>

  <section class="panel" data-step="note" hidden>
    <p class="kicker">Note</p>
    <h2 id="note-heading">Physics · Thermodynamics Lecture 12</h2>
    <div id="note-shell" class="note-view" style="--subj:#4f46e5">
      <div id="note-body"></div>
    </div>
    <div class="cta-row">
      <button class="btn ghost" type="button" data-go="folder">Back to folder</button>
      <button class="btn ghost" type="button" data-go="library">All folders</button>
      <button class="btn" type="button" data-go="capture">Capture another</button>
    </div>
  </section>

  <p class="foot-note">Static UI mock — no backend, OCR, or model calls.</p>
</div>
"""


def flow_panels_signal_style():
    """Shared panel markup reused with different chrome via CSS."""
    return BODY_ATELIER  # replaced per variant below


# Build remaining variants with different structure/CSS
CSS_SIGNAL = """
:root {
  --bg: #f7f7f2;
  --ink: #121212;
  --mute: #5a5a52;
  --line: #121212;
  --accent: #e85d04;
  --mint: #2a9d8f;
  --font-d: "Syne", sans-serif;
  --font-b: "Manrope", system-ui, sans-serif;
  --font-m: "JetBrains Mono", monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-b); color: var(--ink); background: var(--bg);
  background-image:
    linear-gradient(90deg, rgba(18,18,18,.04) 1px, transparent 1px),
    linear-gradient(rgba(18,18,18,.04) 1px, transparent 1px);
  background-size: 48px 48px;
}
.app { max-width: 1080px; margin: 0 auto; padding: 1.5rem; }
.top {
  display: flex; justify-content: space-between; align-items: center;
  border: 2px solid var(--ink); padding: .75rem 1rem; background: #fff;
  margin-bottom: 1.5rem;
}
.brand { font-family: var(--font-d); font-weight: 800; font-size: 1.4rem; margin: 0; text-transform: uppercase; letter-spacing: -0.03em; }
.brand span { background: var(--accent); color: #fff; padding: 0 .25rem; }
.rail { display: flex; gap: .35rem; flex-wrap: wrap; }
.rail button {
  font-family: var(--font-m); font-size: .7rem; text-transform: uppercase;
  border: 2px solid transparent; background: transparent; padding: .35rem .5rem; cursor: pointer;
}
.rail button.active { border-color: var(--ink); background: var(--ink); color: #fff; }
.panel[hidden] { display: none !important; }
.hero-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
.hero h1 {
  font-family: var(--font-d); font-size: clamp(2.8rem, 8vw, 5rem); line-height: .95;
  margin: 0; text-transform: uppercase; letter-spacing: -0.04em; max-width: 12ch;
}
.kicker { font-family: var(--font-m); font-size: .7rem; text-transform: uppercase; color: var(--accent); }
.lede { font-size: 1.05rem; max-width: 40ch; color: var(--mute); }
.cta-row { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1.5rem; }
.btn {
  font-family: var(--font-d); font-weight: 700; text-transform: uppercase; letter-spacing: .02em;
  border: 2px solid var(--ink); background: var(--accent); color: #fff; padding: .75rem 1.1rem; cursor: pointer;
}
.btn.ghost { background: #fff; color: var(--ink); }
.side-card { border: 2px solid var(--ink); background: #fff; padding: 1rem; box-shadow: 6px 6px 0 var(--ink); }
.side-card h3 { font-family: var(--font-d); margin: 0 0 .5rem; text-transform: uppercase; }
.side-card ol { margin: 0; padding-left: 1.1rem; color: var(--mute); }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px){ .split { grid-template-columns: 1fr; } }
.dropzone {
  border: 2px solid var(--ink); min-height: 220px; background: #fff;
  display: grid; place-content: center; text-align: center; cursor: pointer;
  box-shadow: 6px 6px 0 var(--mint);
}
.dropzone.disabled { opacity: .4; filter: grayscale(1); box-shadow: none; cursor: not-allowed; }
.dropzone.drag { background: #fff3eb; }
textarea {
  width: 100%; min-height: 220px; border: 2px solid var(--ink); padding: 1rem;
  font: inherit; background: #fff; resize: vertical;
}
.row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.toggle { font-family: var(--font-m); font-size: .75rem; display: flex; gap: .5rem; align-items: center; }
.models { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; }
@media (max-width: 800px){ .models { grid-template-columns: 1fr; } }
.model-card {
  border: 2px solid var(--ink); background: #fff; padding: 1rem; opacity: .5;
  box-shadow: 4px 4px 0 #ccc;
}
.model-card.ready { opacity: 1; box-shadow: 4px 4px 0 var(--mint); }
.model-card .name { font-family: var(--font-m); font-size: .7rem; text-transform: uppercase; }
.model-card .label-out { font-family: var(--font-d); font-size: 1.6rem; font-weight: 800; text-transform: uppercase; }
.status { font-family: var(--font-m); font-size: .7rem; color: var(--mute); }
.judge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px){ .judge-grid { grid-template-columns: 1fr; } }
.votes { display: flex; flex-direction: column; gap: .5rem; }
.vote { border: 2px solid var(--ink); padding: .5rem .75rem; background: #fff; }
.chip-row { display: flex; flex-wrap: wrap; gap: .4rem; margin: 1rem 0; }
.chip-row button {
  border: 2px solid var(--ink); background: #fff; font-family: var(--font-m); font-size: .7rem;
  text-transform: uppercase; padding: .4rem .55rem; cursor: pointer;
}
.chip-row button.picked { background: var(--accent); color: #fff; }
table { width: 100%; border-collapse: collapse; border: 2px solid var(--ink); background: #fff; }
th, td { border: 1px solid var(--ink); padding: .55rem .65rem; text-align: left; font-size: .9rem; }
th { font-family: var(--font-m); font-size: .7rem; text-transform: uppercase; background: #eee; }
.subj-chip { font-family: var(--font-d); font-weight: 800; color: var(--subj); text-transform: uppercase; }
#formatted-shell, .note-view {
  border: 2px solid var(--ink); border-left: 10px solid var(--subj); background: #fff;
  padding: 1.5rem; box-shadow: 8px 8px 0 color-mix(in srgb, var(--subj) 40%, #fff);
}
#formatted-body h1 { font-family: var(--font-d); text-transform: uppercase; color: var(--subj); margin-top: 0; }
#formatted-body .eq { font-family: var(--font-m); background: #f0f0ea; padding: .5rem; border: 1px solid var(--ink); }
.folders { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: .75rem; }
.folder {
  border: 2px solid var(--ink); background: #fff; padding: .9rem; text-align: left;
  cursor: pointer; font: inherit; box-shadow: 4px 4px 0 var(--subj);
}
.folder-mark { display: none; }
.folder-name { font-family: var(--font-d); font-weight: 700; text-transform: uppercase; font-size: .85rem; }
.folder-count { font-family: var(--font-m); font-size: .65rem; }
.foot-note { font-family: var(--font-m); font-size: .65rem; margin-top: 2rem; color: var(--mute); }
h2 { font-family: var(--font-d); text-transform: uppercase; letter-spacing: -0.02em; }
"""

CSS_HARBOR = """
:root {
  --deep: #0c2d48;
  --sea: #145da0;
  --foam: #e8f4f8;
  --sand: #f5efe6;
  --coral: #e07a5f;
  --ink: #0c2d48;
  --mute: #4a667a;
  --font-d: "Literata", Georgia, serif;
  --font-b: "DM Sans", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-b); color: var(--ink);
  background:
    linear-gradient(180deg, #0c2d48 0 220px, transparent 220px),
    radial-gradient(ellipse 80% 40% at 50% 0%, #1a5276, transparent),
    var(--sand);
}
.app { max-width: 1040px; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
.top {
  display: flex; justify-content: space-between; align-items: center;
  color: #e8f4f8; margin-bottom: 2rem; padding-top: .5rem;
}
.brand { font-family: var(--font-d); font-size: 1.6rem; margin: 0; font-weight: 600; }
.brand span { color: #7ec8e3; }
.rail button {
  background: transparent; border: 0; color: #b8d4e3; font: inherit; cursor: pointer; padding: .25rem .4rem;
}
.rail button.active { color: #fff; border-bottom: 2px solid var(--coral); }
.panel[hidden] { display: none !important; }
.panel {
  background: #fff; border-radius: 18px; padding: 1.75rem;
  box-shadow: 0 20px 50px rgba(12,45,72,.12);
}
.hero-grid { display: grid; grid-template-columns: 1.3fr .7fr; gap: 1.5rem; }
@media (max-width: 800px){ .hero-grid { grid-template-columns: 1fr; } }
.kicker { color: var(--coral); font-size: .8rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; margin: 0 0 .5rem; }
.hero h1 { font-family: var(--font-d); font-size: clamp(2.2rem, 4vw, 3.2rem); line-height: 1.15; margin: 0 0 1rem; }
.lede { color: var(--mute); max-width: 38ch; }
.cta-row { display: flex; flex-wrap: wrap; gap: .65rem; margin-top: 1.5rem; }
.btn {
  border: 0; border-radius: 999px; padding: .75rem 1.25rem; font: inherit; font-weight: 600;
  background: var(--sea); color: #fff; cursor: pointer;
}
.btn.ghost { background: var(--foam); color: var(--deep); }
.side-card { background: var(--foam); border-radius: 14px; padding: 1.1rem; }
.side-card h3 { font-family: var(--font-d); margin: 0 0 .4rem; }
.side-card ol { margin: 0; padding-left: 1.1rem; color: var(--mute); font-size: .92rem; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px){ .split { grid-template-columns: 1fr; } }
.dropzone {
  border: 2px dashed #b7d0de; border-radius: 16px; min-height: 210px;
  display: grid; place-content: center; text-align: center; background: var(--foam); cursor: pointer;
}
.dropzone.disabled { opacity: .4; filter: grayscale(.5); cursor: not-allowed; }
.dropzone.drag { border-color: var(--sea); background: #dff0f8; }
textarea {
  width: 100%; min-height: 210px; border: 1px solid #d5e3ec; border-radius: 16px;
  padding: 1rem; font: inherit; background: var(--foam); resize: vertical;
}
.row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.toggle { display: flex; gap: .5rem; align-items: center; font-size: .9rem; }
.models { display: grid; grid-template-columns: repeat(3,1fr); gap: .85rem; }
@media (max-width: 800px){ .models { grid-template-columns: 1fr; } }
.model-card {
  background: var(--foam); border-radius: 14px; padding: 1rem; opacity: .55;
  border: 1px solid transparent;
}
.model-card.ready { opacity: 1; border-color: #b7d0de; transform: translateY(-3px); transition: .3s; }
.model-card .name { font-size: .75rem; color: var(--sea); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.model-card .label-out { font-family: var(--font-d); font-size: 1.45rem; margin: .35rem 0; }
.status { font-size: .8rem; color: var(--mute); }
.judge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px){ .judge-grid { grid-template-columns: 1fr; } }
.votes { display: flex; flex-direction: column; gap: .5rem; }
.vote { background: var(--foam); border-radius: 10px; padding: .6rem .8rem; }
.chip-row { display: flex; flex-wrap: wrap; gap: .45rem; margin: 1rem 0; }
.chip-row button {
  border: 1px solid #d5e3ec; background: #fff; border-radius: 999px;
  padding: .4rem .75rem; font: inherit; cursor: pointer;
}
.chip-row button.picked { background: var(--deep); color: #fff; border-color: var(--deep); }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { text-align: left; padding: .7rem .5rem; border-bottom: 1px solid #e4eef3; }
th { color: var(--mute); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
.subj-chip {
  display: inline-block; padding: .2rem .65rem; border-radius: 999px;
  background: color-mix(in srgb, var(--subj) 15%, white); color: var(--subj); font-weight: 700;
}
#formatted-shell, .note-view {
  border-radius: 16px; padding: 1.5rem 1.75rem;
  background: linear-gradient(180deg, color-mix(in srgb, var(--subj) 8%, white), #fff);
  border: 1px solid color-mix(in srgb, var(--subj) 25%, white);
}
#formatted-body h1 { font-family: var(--font-d); color: var(--subj); margin-top: 0; }
#formatted-body h2 { color: var(--deep); font-size: 1.1rem; }
#formatted-body .eq {
  font-family: ui-monospace, monospace; background: color-mix(in srgb, var(--subj) 10%, white);
  padding: .55rem .75rem; border-radius: 8px;
}
.folders { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: .75rem; }
.folder {
  border: 0; background: var(--foam); border-radius: 14px; padding: 1rem; text-align: left;
  cursor: pointer; font: inherit; border-left: 4px solid var(--subj);
}
.folder.active { background: color-mix(in srgb, var(--subj) 12%, white); }
.folder-mark { width: 10px; height: 10px; border-radius: 50%; background: var(--subj); }
.folder-name { font-weight: 700; }
.folder-count { font-size: .8rem; color: var(--mute); }
.foot-note { color: #8aa4b5; font-size: .8rem; margin: 1.5rem .25rem 0; }
h2 { font-family: var(--font-d); }
.rail { display: flex; flex-wrap: wrap; gap: .35rem; }
"""

CSS_BLUEPRINT = """
:root {
  --navy: #0a2540;
  --blue: #1b4f8a;
  --paper: #f4f7fb;
  --line: #9bb4cc;
  --brass: #b8892d;
  --ink: #0a2540;
  --font-d: "Source Serif 4", Georgia, serif;
  --font-b: "Work Sans", system-ui, sans-serif;
  --font-m: "IBM Plex Mono", monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-b); color: var(--ink); background: var(--paper);
  background-image:
    linear-gradient(rgba(27,79,138,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(27,79,138,.07) 1px, transparent 1px);
  background-size: 24px 24px;
}
.app { max-width: 1060px; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
.top {
  display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center;
  border: 1px solid var(--line); background: rgba(255,255,255,.9); padding: .65rem 1rem;
  margin-bottom: 1.5rem;
}
.brand { font-family: var(--font-m); font-size: .95rem; margin: 0; letter-spacing: .08em; text-transform: uppercase; }
.brand span { color: var(--brass); }
.rail { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-end; }
.rail button {
  font-family: var(--font-m); font-size: .68rem; text-transform: uppercase; letter-spacing: .06em;
  border: 1px solid var(--line); background: #fff; color: var(--blue); padding: .35rem .55rem; cursor: pointer;
}
.rail button.active { background: var(--navy); color: #fff; border-color: var(--navy); }
.panel[hidden] { display: none !important; }
.hero-grid {
  display: grid; grid-template-columns: 1fr 280px; gap: 1.25rem;
  border: 1px solid var(--line); background: #fff; padding: 1.5rem;
}
@media (max-width: 800px){ .hero-grid { grid-template-columns: 1fr; } }
.kicker { font-family: var(--font-m); font-size: .68rem; color: var(--brass); letter-spacing: .1em; text-transform: uppercase; }
.hero h1 { font-family: var(--font-d); font-size: clamp(2rem, 4vw, 2.8rem); margin: .4rem 0 1rem; font-weight: 600; }
.lede { color: #3d5a73; max-width: 42ch; }
.cta-row { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: 1.25rem; }
.btn {
  font-family: var(--font-m); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em;
  border: 1px solid var(--navy); background: var(--navy); color: #fff; padding: .7rem 1rem; cursor: pointer;
}
.btn.ghost { background: #fff; color: var(--navy); }
.side-card { border: 1px dashed var(--line); padding: 1rem; background: #f8fbfe; }
.side-card h3 { font-family: var(--font-m); font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 .5rem; color: var(--blue); }
.side-card ol { margin: 0; padding-left: 1.1rem; font-size: .88rem; color: #3d5a73; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px){ .split { grid-template-columns: 1fr; } }
.dropzone {
  border: 1px solid var(--line); min-height: 210px; background:
    repeating-linear-gradient(-45deg, #fff, #fff 8px, #f0f5fa 8px, #f0f5fa 16px);
  display: grid; place-content: center; text-align: center; cursor: pointer;
}
.dropzone.disabled { opacity: .4; filter: grayscale(.6); cursor: not-allowed; }
.dropzone.drag { outline: 2px solid var(--brass); }
textarea {
  width: 100%; min-height: 210px; border: 1px solid var(--line); padding: 1rem;
  font-family: var(--font-m); font-size: .85rem; background: #fff; resize: vertical;
}
.row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.toggle { font-family: var(--font-m); font-size: .75rem; display: flex; gap: .5rem; align-items: center; }
.models { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; }
@media (max-width: 800px){ .models { grid-template-columns: 1fr; } }
.model-card {
  border: 1px solid var(--line); background: #fff; padding: 1rem; opacity: .5;
  position: relative;
}
.model-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--line);
}
.model-card.ready { opacity: 1; }
.model-card.ready::before { background: var(--brass); }
.model-card .name { font-family: var(--font-m); font-size: .68rem; color: var(--blue); text-transform: uppercase; }
.model-card .label-out { font-family: var(--font-d); font-size: 1.4rem; margin: .35rem 0; }
.status { font-family: var(--font-m); font-size: .68rem; color: #5a738a; }
.judge-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 1rem; }
@media (max-width: 800px){ .judge-grid { grid-template-columns: 1fr; } }
.votes { display: flex; flex-direction: column; gap: .45rem; }
.vote { border-left: 3px solid var(--brass); padding: .5rem .7rem; background: #fff; border: 1px solid var(--line); border-left-width: 3px; }
.chip-row { display: flex; flex-wrap: wrap; gap: .4rem; margin: 1rem 0; }
.chip-row button {
  font-family: var(--font-m); font-size: .68rem; text-transform: uppercase;
  border: 1px solid var(--line); background: #fff; padding: .4rem .6rem; cursor: pointer;
}
.chip-row button.picked { background: var(--brass); color: #fff; border-color: var(--brass); }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: .88rem; }
th, td { padding: .55rem .65rem; border-bottom: 1px solid var(--line); text-align: left; }
th { font-family: var(--font-m); font-size: .65rem; text-transform: uppercase; letter-spacing: .06em; color: var(--blue); }
.subj-chip { font-family: var(--font-m); font-size: .75rem; color: var(--subj); font-weight: 700; text-transform: uppercase; }
#formatted-shell, .note-view {
  background: #fff; border: 1px solid var(--line); padding: 1.5rem;
  border-top: 3px solid var(--subj);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--subj) 15%, transparent);
}
#formatted-body h1 { font-family: var(--font-d); color: var(--subj); margin-top: 0; font-size: 1.6rem; }
#formatted-body h2 {
  font-family: var(--font-m); font-size: .8rem; text-transform: uppercase; letter-spacing: .08em;
  color: var(--blue); border-bottom: 1px solid var(--line); padding-bottom: .25rem;
}
#formatted-body .eq { font-family: var(--font-m); background: #eef3f8; padding: .5rem .7rem; border-left: 2px solid var(--subj); }
.folders { display: grid; grid-template-columns: repeat(auto-fill,minmax(155px,1fr)); gap: .65rem; }
.folder {
  border: 1px solid var(--line); background: #fff; padding: .85rem; text-align: left;
  cursor: pointer; font: inherit; display: grid; gap: .3rem;
}
.folder.active { border-color: var(--subj); box-shadow: inset 3px 0 0 var(--subj); }
.folder-mark { width: 100%; height: 4px; background: var(--subj); }
.folder-name { font-family: var(--font-m); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; }
.folder-count { font-size: .78rem; color: #5a738a; }
.foot-note { font-family: var(--font-m); font-size: .65rem; color: #5a738a; margin-top: 1.5rem; }
h2 { font-family: var(--font-d); font-weight: 600; }
"""

CSS_ORCHARD = """
:root {
  --leaf: #3d6b4f;
  --leaf-deep: #1f3d2c;
  --blossom: #d4849a;
  --cream: #f7f3ec;
  --bark: #2c241b;
  --mute: #6b6258;
  --font-d: "Instrument Serif", Georgia, serif;
  --font-b: "Figtree", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-b); color: var(--bark);
  background:
    radial-gradient(900px 500px at 0% 0%, #e5efe6 0%, transparent 55%),
    radial-gradient(700px 400px at 100% 10%, #f3e4e8 0%, transparent 50%),
    var(--cream);
}
.app { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1.25rem 3.5rem; }
.top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2rem; gap: 1rem; }
.brand {
  font-family: var(--font-d); font-size: 2rem; margin: 0; font-weight: 400;
  font-style: italic;
}
.brand span { color: var(--leaf); font-style: normal; }
.rail { display: flex; flex-wrap: wrap; gap: .6rem; }
.rail button {
  background: none; border: 0; font: inherit; color: var(--mute); cursor: pointer; padding: 0;
  position: relative;
}
.rail button.active { color: var(--leaf-deep); }
.rail button.active::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px;
  background: var(--blossom);
}
.panel[hidden] { display: none !important; }
.hero-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; padding: 1rem 0 2rem; }
.kicker { color: var(--blossom); font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; font-weight: 600; }
.hero h1 {
  font-family: var(--font-d); font-size: clamp(2.6rem, 6vw, 4rem); font-weight: 400;
  line-height: 1.05; margin: .4rem 0 1rem; max-width: 14ch;
}
.lede { font-size: 1.15rem; color: var(--mute); max-width: 36ch; }
.cta-row { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1.75rem; }
.btn {
  font: inherit; font-weight: 600; border: 0; cursor: pointer;
  background: var(--leaf); color: #fff; padding: .8rem 1.3rem; border-radius: 4px;
}
.btn.ghost { background: transparent; color: var(--leaf-deep); box-shadow: inset 0 0 0 1.5px var(--leaf); }
.side-card {
  align-self: start; max-width: 360px;
  background: rgba(255,255,255,.65); border-radius: 4px; padding: 1.2rem 1.3rem;
  border: 1px solid #e0d6c8;
}
.side-card h3 { font-family: var(--font-d); font-size: 1.3rem; font-weight: 400; margin: 0 0 .4rem; }
.side-card ol { margin: 0; padding-left: 1.1rem; color: var(--mute); }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; }
@media (max-width: 800px){ .split { grid-template-columns: 1fr; } }
.dropzone {
  min-height: 220px; border-radius: 4px; cursor: pointer;
  background: rgba(255,255,255,.7); border: 1.5px dashed #c9bba8;
  display: grid; place-content: center; text-align: center; gap: .4rem;
}
.dropzone.disabled { opacity: .4; filter: grayscale(.45); cursor: not-allowed; }
.dropzone.drag { border-color: var(--leaf); background: #eef5f0; }
textarea {
  width: 100%; min-height: 220px; border-radius: 4px; border: 1px solid #d9cfc0;
  padding: 1rem; font: inherit; background: rgba(255,255,255,.8); resize: vertical;
}
.row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.toggle { display: flex; gap: .5rem; align-items: center; color: var(--mute); }
.models { display: grid; grid-template-columns: repeat(3,1fr); gap: .9rem; }
@media (max-width: 800px){ .models { grid-template-columns: 1fr; } }
.model-card {
  background: rgba(255,255,255,.75); border: 1px solid #e0d6c8; border-radius: 4px;
  padding: 1.1rem; opacity: .5; transition: .35s;
}
.model-card.ready { opacity: 1; border-color: var(--leaf); }
.model-card .name { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--leaf); font-weight: 700; }
.model-card .label-out { font-family: var(--font-d); font-size: 1.55rem; margin: .3rem 0; }
.status { font-size: .8rem; color: var(--mute); }
.judge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
@media (max-width: 800px){ .judge-grid { grid-template-columns: 1fr; } }
.votes { display: flex; flex-direction: column; gap: .5rem; }
.vote { background: rgba(255,255,255,.7); border-radius: 4px; padding: .6rem .8rem; border-left: 3px solid var(--blossom); }
.chip-row { display: flex; flex-wrap: wrap; gap: .45rem; margin: 1rem 0; }
.chip-row button {
  border: 1px solid #d9cfc0; background: #fff; border-radius: 4px;
  padding: .4rem .7rem; font: inherit; cursor: pointer;
}
.chip-row button.picked { background: var(--leaf-deep); color: #fff; border-color: var(--leaf-deep); }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { text-align: left; padding: .7rem .4rem; border-bottom: 1px solid #e5ddd0; }
th { font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
.subj-chip {
  font-family: var(--font-d); font-size: 1.1rem; color: var(--subj); font-style: italic;
}
#formatted-shell, .note-view {
  background: #fffef9; border-radius: 4px; padding: 1.75rem 2rem;
  border: 1px solid #e5ddd0; box-shadow: 0 1px 0 color-mix(in srgb, var(--subj) 35%, transparent);
  border-bottom: 3px solid var(--subj);
}
#formatted-body h1 { font-family: var(--font-d); font-weight: 400; font-size: 2rem; color: var(--subj); margin-top: 0; }
#formatted-body h2 { font-family: var(--font-d); font-weight: 400; color: var(--leaf-deep); font-size: 1.25rem; }
#formatted-body .eq {
  font-family: ui-monospace, monospace; background: color-mix(in srgb, var(--subj) 8%, #fffef9);
  padding: .55rem .8rem; border-radius: 3px;
}
.folders { display: grid; grid-template-columns: repeat(auto-fill,minmax(155px,1fr)); gap: .8rem; }
.folder {
  background: rgba(255,255,255,.7); border: 1px solid #e0d6c8; border-radius: 4px;
  padding: 1rem; text-align: left; cursor: pointer; font: inherit;
}
.folder.active { background: color-mix(in srgb, var(--subj) 10%, white); border-color: var(--subj); }
.folder-mark {
  width: 36px; height: 28px; border-radius: 3px 3px 0 0;
  background: linear-gradient(135deg, var(--subj), color-mix(in srgb, var(--subj) 60%, white));
  margin-bottom: .35rem;
}
.folder-name { font-weight: 700; }
.folder-count { font-size: .8rem; color: var(--mute); }
.foot-note { margin-top: 2rem; color: var(--mute); font-size: .82rem; }
h2 { font-family: var(--font-d); font-weight: 400; font-size: 1.8rem; }
"""


def body_for(variant_label, hero_h1, hero_lede, kicker_extra=""):
    # Reuse atelier structure with label swaps in kickers
    b = BODY_ATELIER
    b = b.replace("UI mock · variation 01 · Atelier", f"UI mock · {variant_label}")
    b = b.replace("Notes, classified and composed.", hero_h1)
    b = b.replace(
        "Photograph or paste lecture notes. Three models vote. A judge decides. Your library fills with subject-styled pages.",
        hero_lede,
    )
    return b


INDEX = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NoteLMs — UI variations</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet" />
<style>
  :root { --ink:#142033; --mute:#5a6b7d; --line:#d5dde6; --bg:#f6f8fb; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: "DM Sans", system-ui, sans-serif; color: var(--ink);
    background: radial-gradient(900px 400px at 20% 0%, #e4eef7, transparent), var(--bg);
    padding: 2.5rem 1.25rem 4rem;
  }
  .wrap { max-width: 920px; margin: 0 auto; }
  h1 { font-family: "Fraunces", Georgia, serif; font-weight: 500; font-size: clamp(2rem,4vw,2.8rem); margin: 0 0 .5rem; }
  .lede { color: var(--mute); max-width: 52ch; line-height: 1.55; }
  .grid { display: grid; gap: 1rem; margin-top: 2rem; }
  a.card {
    display: grid; grid-template-columns: 88px 1fr auto; gap: 1rem; align-items: center;
    text-decoration: none; color: inherit; background: #fff; border: 1px solid var(--line);
    padding: 1rem 1.15rem; border-radius: 10px; transition: transform .15s, box-shadow .15s;
  }
  a.card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(20,32,51,.08); }
  .swatch { width: 88px; height: 64px; border-radius: 8px; }
  .name { font-weight: 700; font-size: 1.05rem; }
  .desc { color: var(--mute); font-size: .9rem; margin-top: .2rem; }
  .go { font-size: .85rem; font-weight: 600; color: #1a6b8a; }
  .note { margin-top: 2rem; font-size: .85rem; color: var(--mute); }
</style>
</head>
<body>
  <div class="wrap">
    <h1>NoteLMs UI variations</h1>
    <p class="lede">
      Five static, frontend-only explorations of the full capture → classify → judge → research → format → library flow.
      No backend, OCR, or model calls — toggle “OCR API online” to see image upload grayed out.
    </p>
    <div class="grid">
      <a class="card" href="v01-atelier/index.html">
        <div class="swatch" style="background:linear-gradient(135deg,#0b1f33,#1a6b8a,#f3f6f9)"></div>
        <div><div class="name">01 · Atelier</div><div class="desc">Cool ink academic studio — Fraunces + IBM Plex</div></div>
        <div class="go">Open →</div>
      </a>
      <a class="card" href="v02-signal/index.html">
        <div class="swatch" style="background:linear-gradient(135deg,#121212,#e85d04,#2a9d8f)"></div>
        <div><div class="name">02 · Signal</div><div class="desc">Bold modernist grid — Syne + Manrope, hard shadows</div></div>
        <div class="go">Open →</div>
      </a>
      <a class="card" href="v03-harbor/index.html">
        <div class="swatch" style="background:linear-gradient(135deg,#0c2d48,#145da0,#e07a5f)"></div>
        <div><div class="name">03 · Harbor</div><div class="desc">Coastal calm product UI — Literata + DM Sans</div></div>
        <div class="go">Open →</div>
      </a>
      <a class="card" href="v04-blueprint/index.html">
        <div class="swatch" style="background:linear-gradient(135deg,#0a2540,#1b4f8a,#b8892d)"></div>
        <div><div class="name">04 · Blueprint</div><div class="desc">Technical research instrument — Source Serif + mono</div></div>
        <div class="go">Open →</div>
      </a>
      <a class="card" href="v05-orchard/index.html">
        <div class="swatch" style="background:linear-gradient(135deg,#1f3d2c,#3d6b4f,#d4849a)"></div>
        <div><div class="name">05 · Orchard</div><div class="desc">Botanical study soft UI — Instrument Serif + Figtree</div></div>
        <div class="go">Open →</div>
      </a>
    </div>
    <p class="note">Stored under <code>scratch/</code> for design exploration. Not wired to Vercel production.</p>
  </div>
</body>
</html>
"""

README = """# NoteLMs UI scratch variations

Five frontend-only website mockups of the full NoteLMs user flow:

1. Capture notes (image OCR and/or paste text; OCR can be toggled offline to gray out upload)
2. Review extracted text
3. Classify with base BERT, fine-tuned BERT, and gpt-oss:20b
4. Judge LLM selects final label (or Other)
5. Research table updates
6. Subject-styled HTML formatting
7. Library folders by subject

Open [`index.html`](index.html) in a browser, or open any `v0N-*/index.html` directly.

These are static UI look-and-feel prototypes — no backend, no processing.
"""


def main():
    variants = [
        (
            "v01-atelier",
            "NoteLMs · Atelier",
            "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
            CSS_ATELIER,
            body_for(
                "variation 01 · Atelier",
                "Notes, classified and composed.",
                "Photograph or paste lecture notes. Three models vote. A judge decides. Your library fills with subject-styled pages.",
            ),
        ),
        (
            "v02-signal",
            "NoteLMs · Signal",
            "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Manrope:wght@400;600;700&family=Syne:wght@700;800&display=swap",
            CSS_SIGNAL,
            body_for(
                "variation 02 · Signal",
                "Capture. Vote. Compose.",
                "A hard-edged study stack: OCR or paste, three classifiers, one judge, subject-colored pages in your folders.",
            ).replace(
                '<div class="hero-grid">\n      <div class="hero">',
                '<div class="hero-grid">\n      <div class="hero">\n        <p class="kicker" style="margin-bottom:1rem">01 ingest → 02 classify → 03 judge → 04 library</p>',
            ),
        ),
        (
            "v03-harbor",
            "NoteLMs · Harbor",
            "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=Literata:opsz,wght@7..72,500;7..72,600;7..72,700&display=swap",
            CSS_HARBOR,
            body_for(
                "variation 03 · Harbor",
                "Turn messy notes into a calm library.",
                "Upload a photo or paste text. Models classify. A judge settles the subject. Formatted pages land in the right folder.",
            ),
        ),
        (
            "v04-blueprint",
            "NoteLMs · Blueprint",
            "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Work+Sans:wght@400;500;600&display=swap",
            CSS_BLUEPRINT,
            body_for(
                "variation 04 · Blueprint",
                "Research instrument for student notes.",
                "Instrument-grade flow: ingest → triple classify → adjudicate → log → render HTML by subject specification.",
            ),
        ),
        (
            "v05-orchard",
            "NoteLMs · Orchard",
            "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap",
            CSS_ORCHARD,
            body_for(
                "variation 05 · Orchard",
                "Grow a garden of well-kept notes.",
                "Bring in raw notes, let three models confer, accept the judge’s subject, and browse soft subject-styled pages.",
            ),
        ),
    ]

    (ROOT / "index.html").write_text(INDEX, encoding="utf-8")
    (ROOT / "README.md").write_text(README, encoding="utf-8")

    for folder, title, fonts, css, body in variants:
        path = ROOT / folder / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        # Fix duplicate id issue for note step — use class for second shell
        html = wrap(title, fonts, css, body)
        # Harbor needs top bar outside white panel — adjust structure slightly
        if folder == "v03-harbor":
            html = html.replace(
                '<header class="top">',
                '<header class="top">',
            )
            # wrap each panel already has .panel class - home hero should not force double card for nav
            # Move panels to each have panel class - already do. For harbor, unwrap home from needing nested - ok as is.
        path.write_text(html, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")

    print("done")


if __name__ == "__main__":
    main()
