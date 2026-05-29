import './style.css';
import { Visualizer } from './scene';
import { getHealth, getLessons, getDemos, runCode, trainStream } from './api';
import type { Lesson, Demo, RunResult, TrainConfig, TrainFrame } from './types';
import { createEditor, type EditorHandle } from './editor';
import { HINT_GROUPS } from './hints';
import { sparkBurst, glowPulse } from './fx';
import {
  unlockAudio,
  setMuted,
  isMuted,
  playTick,
  playSuccess,
  playError,
} from './sound';

// ---------------------------------------------------------------------------
// Tiny, safe markdown -> HTML (no deps). Headings, code blocks, inline code,
// bold/italic, links, lists. Escapes HTML first.
// ---------------------------------------------------------------------------
function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(md: string): string {
  const lines = escapeHTML(md).split('\n');
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let para: string[] = [];

  const inline = (t: string): string =>
    t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith('```')) {
      flushPara();
      closeList();
      if (!inCode) {
        out.push('<pre><code>');
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const level = Math.min(h[1].length, 3);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      closeList();
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Welcome snippet — creates a tensor so users immediately see 3D output.
// ---------------------------------------------------------------------------
const WELCOME_CODE = `# Welcome to PyTorch Sandbox! 🔥
# Create a tensor, print it, and watch it render in 3D.
import torch

x = torch.arange(12, dtype=torch.float32).reshape(3, 4)
print(x)

# Tip: start typing "torch." for live API hints.
# The last expression's repr is shown too:
x.sum()
`;

// ---------------------------------------------------------------------------
// DOM scaffold
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <div class="logo"><span class="flame">🔥</span> PyTorch Sandbox <span class="badge">Play</span></div>
    <div class="header-spacer"></div>
    <div class="health" id="health"><span class="dot"></span><span id="health-text">connecting…</span></div>
    <button class="icon-btn" id="mute-btn" title="Toggle sound" aria-label="Toggle sound">🔊</button>
  </header>

  <nav class="tab-bar" role="tablist">
    <button class="tab-btn active" data-tab="sandbox">Sandbox</button>
    <button class="tab-btn" data-tab="lessons">Lessons</button>
    <button class="tab-btn" data-tab="trainer">Live Trainer</button>
  </nav>

  <div class="layout">
    <section class="panel">
      <!-- Sandbox -->
      <div class="pane active" id="pane-sandbox">
        <div class="section-label">Python</div>
        <div class="editor-wrap" id="editor-host"></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="run-btn">Run ▶</button>
          <button class="btn" id="clear-btn">Clear</button>
          <span class="kbd-hint">⌘ / Ctrl + Enter</span>
        </div>
        <div class="note"><span class="note-title">Tips</span> Type <code>torch.</code> for autocomplete, or pick a function below to load a runnable example — then Run, tweak, Run again.</div>
        <div class="section-label">Output</div>
        <div class="console" id="console"><span class="muted">Run code to see output…</span></div>

        <div class="fnref" id="fnref">
          <div class="fnref-head">
            <span class="section-label" style="margin:0">Functions</span>
            <input type="search" id="fn-search" class="fn-search" placeholder="Search functions…" autocomplete="off" />
            <span class="fn-count" id="fn-count"></span>
          </div>
          <div class="fnref-body" id="fnref-body"></div>
        </div>
      </div>

      <!-- Lessons -->
      <div class="pane" id="pane-lessons">
        <div class="section-label">Curriculum</div>
        <div class="lesson-list" id="lesson-list"></div>
        <div class="section-label">Lesson</div>
        <div class="lesson-explain" id="lesson-explain"><span class="muted">Select a lesson…</span></div>
        <div class="hint" id="lesson-hint" style="display:none"></div>
        <div class="section-label">Try it</div>
        <div class="editor-wrap short" id="lesson-editor-host"></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="lesson-run-btn">Run ▶</button>
          <span class="kbd-hint">⌘ / Ctrl + Enter</span>
        </div>
        <div class="console" id="lesson-console"><span class="muted">Run the starter code to see output…</span></div>
      </div>

      <!-- Trainer -->
      <div class="pane" id="pane-trainer">
        <div class="section-label">Demo</div>
        <select id="demo-select"></select>
        <div class="demo-desc" id="demo-desc"></div>
        <div class="section-label">Hyperparameters</div>
        <div class="fields-grid">
          <div class="field">
            <label for="f-epochs">Epochs <span class="val" id="f-epochs-val">200</span></label>
            <input type="range" id="f-epochs" min="20" max="1000" step="10" value="200" />
          </div>
          <div class="field">
            <label for="f-lr">Learning rate <span class="val" id="f-lr-val">0.05</span></label>
            <input type="range" id="f-lr" min="0.001" max="0.5" step="0.001" value="0.05" />
          </div>
          <div class="field">
            <label for="f-hidden">Hidden units <span class="val" id="f-hidden-val">32</span></label>
            <input type="range" id="f-hidden" min="2" max="128" step="1" value="32" />
          </div>
          <div class="field">
            <label for="f-seed">Seed</label>
            <input type="number" id="f-seed" value="0" min="0" step="1" />
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="train-btn">Train ▶</button>
          <button class="btn btn-danger" id="stop-btn" disabled>Stop</button>
        </div>
        <div class="metrics">
          <div class="metric-chip"><span class="k">Epoch</span><span class="v" id="m-epoch">—</span></div>
          <div class="metric-chip"><span class="k">Loss</span><span class="v" id="m-loss">—</span></div>
          <div class="metric-chip"><span class="k" id="m-metric-k">Metric</span><span class="v" id="m-metric">—</span></div>
        </div>
        <div class="progress"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="section-label">Log</div>
        <div class="train-log" id="train-log"><span class="muted">Pick a demo and press Train…</span></div>
      </div>
    </section>

    <section class="stage" id="stage">
      <div class="stage-empty hidden" id="stage-empty"></div>
      <div class="stage-hint">Drag to orbit · scroll to zoom</div>
    </section>
  </div>
`;

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel) as T;

const stageEl = $('#stage');
const stageEmpty = $('#stage-empty');
const viz = new Visualizer(stageEl);

const healthEl = $('#health');
const healthText = $<HTMLSpanElement>('#health-text');
const muteBtn = $<HTMLButtonElement>('#mute-btn');

const runBtn = $<HTMLButtonElement>('#run-btn');
const clearBtn = $<HTMLButtonElement>('#clear-btn');
const consoleEl = $('#console');

const lessonList = $('#lesson-list');
const lessonExplain = $('#lesson-explain');
const lessonHint = $<HTMLDivElement>('#lesson-hint');
const lessonRunBtn = $<HTMLButtonElement>('#lesson-run-btn');
const lessonConsole = $('#lesson-console');

const demoSelect = $<HTMLSelectElement>('#demo-select');
const demoDesc = $('#demo-desc');
const fEpochs = $<HTMLInputElement>('#f-epochs');
const fLr = $<HTMLInputElement>('#f-lr');
const fHidden = $<HTMLInputElement>('#f-hidden');
const fSeed = $<HTMLInputElement>('#f-seed');
const trainBtn = $<HTMLButtonElement>('#train-btn');
const stopBtn = $<HTMLButtonElement>('#stop-btn');
const trainLog = $('#train-log');
const mEpoch = $('#m-epoch');
const mLoss = $('#m-loss');
const mMetric = $('#m-metric');
const mMetricK = $('#m-metric-k');
const progressFill = $<HTMLDivElement>('#progress-fill');

// ---------------------------------------------------------------------------
// Stage helpers (empty-state + glow on render)
// ---------------------------------------------------------------------------
function stageRendered(): void {
  stageEmpty.classList.add('hidden');
  glowPulse(stageEl);
}
function stageCleared(): void {
  stageEmpty.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Editors (CodeMirror)
// ---------------------------------------------------------------------------
let lastTensors: RunResult['tensors'] = [];

const sandboxEditor: EditorHandle = createEditor({
  parent: $('#editor-host'),
  doc: WELCOME_CODE,
  onRun: () => doRun(sandboxEditor.getCode(), consoleEl, runBtn),
});

const lessonEditor: EditorHandle = createEditor({
  parent: $('#lesson-editor-host'),
  doc: '',
  onRun: () => doRun(lessonEditor.getCode(), lessonConsole, lessonRunBtn),
});

// ---------------------------------------------------------------------------
// Console rendering
// ---------------------------------------------------------------------------
function renderRunResult(target: HTMLElement, result: RunResult): void {
  const parts: string[] = [];
  if (result.stdout) parts.push(escapeHTML(result.stdout.replace(/\n$/, '')));
  if (result.result_repr) parts.push(`<span class="repr">${escapeHTML(result.result_repr)}</span>`);
  if (result.error) parts.push(`<span class="err">${escapeHTML(result.error)}</span>`);
  if (!parts.length) parts.push('<span class="muted">(no output)</span>');
  const status = result.ok
    ? `<span class="ok">✓ ran in ${result.duration.toFixed(3)}s</span>`
    : `<span class="err">✗ error</span>`;
  target.innerHTML = `${status}\n${parts.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Run code (shared by Sandbox + Lessons)
// ---------------------------------------------------------------------------
async function doRun(code: string, target: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  unlockAudio();
  sparkBurst(btn);
  playTick();
  btn.disabled = true;
  target.innerHTML = '<span class="muted">Running…</span>';
  // Destroy all previous 3D objects on every run.
  lastTensors = [];
  viz.clear();
  stageCleared();
  try {
    const result = await runCode(code);
    renderRunResult(target, result);
    if (result.ok) {
      if (result.tensors.length) {
        lastTensors = result.tensors;
        viz.showTensors(result.tensors);
        stageRendered();
      }
      playSuccess();
    } else {
      playError();
    }
  } catch (err) {
    target.innerHTML = `<span class="err">${escapeHTML((err as Error).message)}</span>`;
    playError();
  } finally {
    btn.disabled = false;
  }
}

clearBtn.addEventListener('click', () => {
  // Destroy all 3D objects and reset the output.
  lastTensors = [];
  viz.clear();
  stageCleared();
  consoleEl.innerHTML = '<span class="muted">Run code to see output…</span>';
});

runBtn.addEventListener('click', () => doRun(sandboxEditor.getCode(), consoleEl, runBtn));
lessonRunBtn.addEventListener('click', () =>
  doRun(lessonEditor.getCode(), lessonConsole, lessonRunBtn),
);

// ---------------------------------------------------------------------------
// Functions reference — browse all PyTorch functions; click one to load a
// runnable example into the Sandbox editor (then Run, tweak, Run again).
// ---------------------------------------------------------------------------
const fnBody = $('#fnref-body');
const fnSearch = $<HTMLInputElement>('#fn-search');
const fnCount = $('#fn-count');

function loadExample(label: string, example: string): void {
  const tabSandbox = $<HTMLButtonElement>('[data-tab="sandbox"]');
  if (tabSandbox && !tabSandbox.classList.contains('active')) tabSandbox.click();
  sandboxEditor.setCode(example);
  sandboxEditor.focus();
  glowPulse(stageEl);
  consoleEl.innerHTML = `<span class="muted">Loaded example for <b style="color:var(--accent-2)">${escapeHTML(label)}</b> — press Run ▶ (or ⌘/Ctrl+Enter), then tweak it.</span>`;
}

function renderFnRef(filter = ''): void {
  const q = filter.trim().toLowerCase();
  fnBody.innerHTML = '';
  let shown = 0;
  for (const group of HINT_GROUPS) {
    const items = q
      ? group.items.filter(
          (h) => h.label.toLowerCase().includes(q) || h.info.toLowerCase().includes(q),
        )
      : group.items;
    if (!items.length) continue;
    const cat = document.createElement('div');
    cat.className = 'fn-cat';
    cat.textContent = group.category;
    fnBody.appendChild(cat);
    const grid = document.createElement('div');
    grid.className = 'fn-grid';
    for (const h of items) {
      shown++;
      const btn = document.createElement('button');
      btn.className = 'fn-item';
      btn.type = 'button';
      btn.title = `${h.detail}\n\n${h.info}\n\nClick to load an example.`;
      btn.innerHTML = `<span class="fn-label">${escapeHTML(h.label)}</span><span class="fn-detail">${escapeHTML(h.detail)}</span>`;
      btn.addEventListener('click', () => loadExample(h.label, h.example));
      grid.appendChild(btn);
    }
    fnBody.appendChild(grid);
  }
  if (!shown) {
    const none = document.createElement('div');
    none.className = 'muted';
    none.style.padding = '8px 2px';
    none.textContent = 'No functions match your search.';
    fnBody.appendChild(none);
  }
  const total = HINT_GROUPS.reduce((n, g) => n + g.items.length, 0);
  fnCount.textContent = q ? `${shown} / ${total}` : `${total} functions`;
}

fnSearch.addEventListener('input', () => renderFnRef(fnSearch.value));
renderFnRef();

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
let lessons: Lesson[] = [];
let activeLessonId: string | null = null;

function selectLesson(lesson: Lesson, index: number): void {
  activeLessonId = lesson.id;
  lessonList.querySelectorAll('.lesson-item').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.id === lesson.id);
  });
  lessonExplain.innerHTML = renderMarkdown(lesson.explanation || '');
  lessonEditor.setCode(lesson.starter_code || '');
  if (lesson.hint) {
    lessonHint.textContent = lesson.hint;
    lessonHint.style.display = '';
  } else {
    lessonHint.style.display = 'none';
  }
  lessonConsole.innerHTML = '<span class="muted">Run the starter code to see output…</span>';
  void index;
}

async function loadLessons(): Promise<void> {
  try {
    lessons = await getLessons();
    lessonList.innerHTML = '';
    lessons.forEach((lesson, i) => {
      const btn = document.createElement('button');
      btn.className = 'lesson-item';
      btn.dataset.id = lesson.id;
      btn.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
      (btn.lastElementChild as HTMLElement).textContent = lesson.title;
      btn.addEventListener('click', () => selectLesson(lesson, i));
      lessonList.appendChild(btn);
    });
    if (lessons.length && !activeLessonId) selectLesson(lessons[0], 0);
  } catch (err) {
    lessonList.innerHTML = `<span class="muted">Failed to load lessons: ${escapeHTML(
      (err as Error).message,
    )}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Live Trainer
// ---------------------------------------------------------------------------
let demos: Demo[] = [];
let cancelTrain: (() => void) | null = null;

function currentDemo(): Demo | undefined {
  return demos.find((d) => d.key === demoSelect.value);
}

async function loadDemos(): Promise<void> {
  try {
    demos = await getDemos();
    demoSelect.innerHTML = '';
    demos.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.key;
      opt.textContent = d.label;
      demoSelect.appendChild(opt);
    });
    updateDemoDesc();
  } catch (err) {
    demoDesc.textContent = `Failed to load demos: ${(err as Error).message}`;
  }
}

function updateDemoDesc(): void {
  const d = currentDemo();
  demoDesc.textContent = d ? d.description : '';
}
demoSelect.addEventListener('change', updateDemoDesc);

const bindSlider = (input: HTMLInputElement, label: HTMLElement, fmt: (v: number) => string) => {
  const update = () => (label.textContent = fmt(parseFloat(input.value)));
  input.addEventListener('input', update);
  update();
};
bindSlider(fEpochs, $('#f-epochs-val'), (v) => String(v));
bindSlider(fLr, $('#f-lr-val'), (v) => v.toFixed(3));
bindSlider(fHidden, $('#f-hidden-val'), (v) => String(v));

function setTrainingActive(active: boolean): void {
  trainBtn.disabled = active;
  stopBtn.disabled = !active;
}

function applyFrameViz(frame: TrainFrame): void {
  if (frame.loss_history && frame.loss_history.length) {
    viz.showLossCurve(frame.loss_history);
    stageRendered();
  }
  const v = frame.viz;
  if (!v) return;
  if (v.kind === 'regression') {
    viz.showRegression({ x: v.x, y: v.y, yPred: v.y_pred });
    stageRendered();
  } else if (v.kind === 'classification') {
    viz.showClassification({ points: v.points, labels: v.labels, grid: v.grid });
    stageRendered();
  }
}

function updateTrainStatus(frame: TrainFrame): void {
  mEpoch.textContent = `${frame.epoch}/${frame.total}`;
  mLoss.textContent = frame.loss.toFixed(4);
  if (frame.metric != null) {
    mMetricK.textContent = frame.metric_name || 'Metric';
    mMetric.textContent = frame.metric.toFixed(4);
  } else {
    mMetric.textContent = '—';
  }
  const pct = frame.total ? Math.min(100, (frame.epoch / frame.total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  if (frame.log) {
    trainLog.textContent = `${trainLog.textContent}\n${frame.log}`.trimStart();
    trainLog.scrollTop = trainLog.scrollHeight;
  }
}

function startTraining(): void {
  unlockAudio();
  sparkBurst(trainBtn);
  playTick();
  if (cancelTrain) cancelTrain();
  const config: TrainConfig = {
    demo: demoSelect.value,
    epochs: parseInt(fEpochs.value, 10),
    lr: parseFloat(fLr.value),
    hidden: parseInt(fHidden.value, 10),
    seed: parseInt(fSeed.value, 10) || 0,
  };
  viz.clear();
  stageCleared();
  trainLog.textContent = '';
  setTrainingActive(true);

  cancelTrain = trainStream(config, {
    onFrame: (frame) => {
      updateTrainStatus(frame);
      applyFrameViz(frame);
      if (frame.done) playSuccess();
    },
    onError: (message) => {
      trainLog.textContent = `${trainLog.textContent}\n[error] ${message}`.trimStart();
      trainLog.scrollTop = trainLog.scrollHeight;
      playError();
    },
    onDone: () => {
      setTrainingActive(false);
      cancelTrain = null;
    },
  });
}

trainBtn.addEventListener('click', startTraining);
stopBtn.addEventListener('click', () => {
  if (cancelTrain) cancelTrain();
  cancelTrain = null;
  setTrainingActive(false);
});

// ---------------------------------------------------------------------------
// Tabs — switching clears the stage and re-renders the active tab's viz.
// ---------------------------------------------------------------------------
type TabName = 'sandbox' | 'lessons' | 'trainer';
let currentTab: TabName = 'sandbox';

function showTabViz(tab: TabName): void {
  viz.clear();
  stageCleared();
  if (tab === 'sandbox' && lastTensors.length) {
    viz.showTensors(lastTensors);
    stageRendered();
  }
  // Lessons render on Run; Trainer renders on Train.
}

function switchTab(tab: TabName): void {
  if (tab === currentTab) return;
  currentTab = tab;
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLDivElement>('.pane').forEach((p) => {
    p.classList.toggle('active', p.id === `pane-${tab}`);
  });
  showTabViz(tab);
  requestAnimationFrame(() => viz.resize());
}

document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab as TabName));
});

// ---------------------------------------------------------------------------
// Mute toggle
// ---------------------------------------------------------------------------
muteBtn.addEventListener('click', () => {
  unlockAudio();
  const next = !isMuted();
  setMuted(next);
  muteBtn.textContent = next ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', next);
  if (!next) playTick();
});

// ---------------------------------------------------------------------------
// Health + resize + boot
// ---------------------------------------------------------------------------
async function pollHealth(): Promise<void> {
  try {
    const h = await getHealth();
    healthEl.classList.add('online');
    healthEl.classList.remove('offline');
    healthText.textContent = `torch ${h.torch} · ${h.device}${h.mps ? ' · mps' : ''}`;
  } catch {
    healthEl.classList.add('offline');
    healthEl.classList.remove('online');
    healthText.textContent = 'backend offline';
  }
}

let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => viz.resize());
});

// Boot
pollHealth();
setInterval(pollHealth, 10000);
loadLessons();
loadDemos();
requestAnimationFrame(() => viz.resize());
