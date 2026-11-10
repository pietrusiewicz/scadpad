import './style.css';
import 'codemirror/lib/codemirror.css';

import exampleSource from './example.scad?raw';
import { createEditor } from './editor.js';
import { parseParams, buildDefines } from './params.js';
import { parseStl } from './stl.js';
import { bboxOf, formatMm, measureBetween, volumeOf } from './measure.js';
import { Viewport } from './viewport.js';
import { Renderer } from './renderer.js';

const PLA_DENSITY = 1.24; // g/cm³

const els = {
  params: document.getElementById('params'),
  stats: document.getElementById('stats'),
  status: document.getElementById('status'),
  log: document.getElementById('log'),
  logToggle: document.getElementById('log-toggle'),
  renderBtn: document.getElementById('render-btn'),
  exportBtn: document.getElementById('export-btn'),
  measureBtn: document.getElementById('measure-btn'),
  fileInput: document.getElementById('file-input'),
  hint: document.getElementById('hint'),
  measureBox: document.getElementById('measure-box'),
};

const state = {
  source: exampleSource,
  params: [],
  values: {},
  defaults: {},
  lastStl: null,
  renders: 0,
};

const renderer = new Renderer();
let pendingRender = false;

const viewport = new Viewport(document.getElementById('viewport'), {
  onMeasure: showMeasurement,
  onHint: setHint,
});

const editor = createEditor(document.getElementById('editor'), {
  value: exampleSource,
  onChange: (code) => {
    state.source = code;
    scheduleSyncParams();
    setStatus('Kod zmieniony — kliknij Renderuj (Ctrl+Enter).');
  },
  onRender: () => render(),
});

/* ------------------------------------------------------------------ params */

let syncTimer = null;

function scheduleSyncParams() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncParams, 300);
}

function syncParams() {
  const { params } = parseParams(state.source);

  const previous = state.values;
  const previousDefaults = state.defaults;

  state.params = params;
  state.values = {};
  state.defaults = {};

  for (const param of params) {
    const kept = previous[param.name];
    // If the default in the code changed, the code wins. Otherwise a slider the
    // user moved keeps its value, so typing a comment does not reset the model.
    const codeChanged =
      previousDefaults[param.name] !== undefined && previousDefaults[param.name] !== param.value;

    const keepValue = kept && kept.type === param.type && !codeChanged;

    state.values[param.name] = {
      type: param.type,
      value: keepValue ? kept.value : param.value,
    };
    state.defaults[param.name] = param.value;
  }

  renderParamControls(params);
}

function renderParamControls(params) {
  els.params.replaceChildren();

  if (params.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Ten model nie ma parametrów w formacie Customizera.';
    els.params.append(empty);
    return;
  }

  let currentSection = null;

  for (const param of params) {
    if (param.section && param.section !== currentSection) {
      currentSection = param.section;
      const heading = document.createElement('h2');
      heading.textContent = currentSection;
      els.params.append(heading);
    }

    els.params.append(buildParamRow(param));
  }
}

function buildParamRow(param) {
  const row = document.createElement('div');
  row.className = 'param';

  const head = document.createElement('div');
  head.className = 'param-head';

  const name = document.createElement('span');
  name.className = 'param-name';
  name.textContent = param.name;
  head.append(name);

  const update = (value) => {
    state.values[param.name] = { type: param.type, value };
    scheduleRender();
  };

  if (param.type === 'number' && param.control === 'slider') {
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'param-value';
    number.min = String(param.min);
    number.max = String(param.max);
    number.step = String(param.step);
    number.value = String(param.value);
    head.append(number);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(param.value);
    slider.setAttribute('aria-label', param.name);

    slider.addEventListener('input', () => {
      number.value = slider.value;
      update(Number(slider.value));
    });

    number.addEventListener('change', () => {
      const value = clamp(Number(number.value), param.min, param.max);
      number.value = String(value);
      slider.value = String(value);
      update(value);
    });

    row.append(head, slider);
    return row;
  }

  if (param.type === 'number') {
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'param-value';
    number.step = 'any';
    number.value = String(param.value);
    number.addEventListener('change', () => {
      const value = Number(number.value);
      if (Number.isFinite(value)) update(value);
    });
    head.append(number);
    row.append(head);
    return row;
  }

  if (param.type === 'boolean') {
    head.remove();
    const label = document.createElement('label');
    label.className = 'check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = param.value;
    checkbox.addEventListener('change', () => update(checkbox.checked));
    const text = document.createElement('span');
    text.textContent = param.name;
    text.className = 'param-name';
    label.append(checkbox, text);
    row.append(label);
    return row;
  }

  if (param.control === 'select') {
    const select = document.createElement('select');
    for (const choice of param.choices) {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = choice;
      if (choice === param.value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => update(select.value));
    row.append(select);
    return row;
  }

  const text = document.createElement('input');
  text.type = 'text';
  text.value = String(param.value);
  text.addEventListener('change', () => update(text.value));
  row.append(text);
  return row;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/* ----------------------------------------------------------------- render */

let renderTimer = null;

function scheduleRender(delay = 250) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(), delay);
}

async function render() {
  clearTimeout(renderTimer);

  if (renderer.isBusy) {
    pendingRender = true;
    return;
  }

  els.renderBtn.disabled = true;
  setStatus('Renderuję…', 'busy');

  try {
    const result = await renderer.render(state.source, buildDefines(state.values));
    const { positions, triangleCount } = parseStl(result.stl);

    state.lastStl = result.stl;
    els.exportBtn.disabled = false;

    viewport.setGeometry(positions);
    updateStats(positions, triangleCount);

    const warnings = result.warnings.length;
    els.status.dataset.ms = String(result.ms);
    setStatus(`Wyrenderowano w ${result.ms} ms${warnings ? ` · ${warnings} ostrzeżeń` : ''}`, 'ok');
    if (warnings) showLog(result.log.join('\n'));
  } catch (error) {
    // Keep the last good STL: a failed edit should not throw away the model
    // that is already on screen and exportable.
    setStatus(error.message, 'error');
    if (error.log?.length) showLog(error.log.join('\n'));
  } finally {
    state.renders += 1;
    els.renderBtn.disabled = false;
    if (pendingRender) {
      pendingRender = false;
      render();
    }
  }
}

function updateStats(positions, triangleCount) {
  const box = bboxOf(positions);
  const volume = volumeOf(positions) / 1000; // mm³ → cm³

  const rows = [
    ['Wymiary', `${box.size.map((v) => v.toFixed(1)).join(' × ')} mm`],
    ['Objętość', `${volume.toFixed(1)} cm³`],
    ['Masa (PLA)', `${(volume * PLA_DENSITY).toFixed(1)} g`],
    ['Trójkąty', triangleCount.toLocaleString('pl-PL')],
  ];

  els.stats.replaceChildren(
    ...rows.map(([label, value]) => {
      const wrapper = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      wrapper.append(dt, dd);
      return wrapper;
    }),
  );
}

/* --------------------------------------------------------------- measuring */

function showMeasurement({ a, b }) {
  const { dx, dy, dz, distance } = measureBetween(a, b);

  els.measureBox.hidden = false;
  els.measureBox.replaceChildren();

  const title = document.createElement('h3');
  title.textContent = 'Pomiar';

  const list = document.createElement('dl');
  for (const [label, value] of [
    ['ΔX', formatMm(dx)],
    ['ΔY', formatMm(dy)],
    ['ΔZ', formatMm(dz)],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }

  const total = document.createElement('div');
  total.className = 'total';
  total.textContent = `Odległość: ${formatMm(distance)}`;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Wyczyść pomiar';
  clear.addEventListener('click', () => {
    viewport.clearMeasurement();
    els.measureBox.hidden = true;
  });

  els.measureBox.append(title, list, total, clear);
}

function setHint(text) {
  els.hint.textContent = text;
  els.hint.classList.toggle('visible', Boolean(text));
}

/* ------------------------------------------------------------------- misc */

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`.trim();
}

function showLog(text) {
  els.log.textContent = text.trim();
  els.log.hidden = false;
  els.logToggle.hidden = false;
}

function downloadStl() {
  if (!state.lastStl) return;
  const blob = new Blob([state.lastStl], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'model.stl';
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.renderBtn.addEventListener('click', () => render());
els.exportBtn.addEventListener('click', downloadStl);

els.measureBtn.addEventListener('click', () => {
  const enabled = els.measureBtn.getAttribute('aria-pressed') !== 'true';
  els.measureBtn.setAttribute('aria-pressed', String(enabled));
  viewport.setMeasureMode(enabled);
  if (!enabled) els.measureBox.hidden = true;
  setHint(enabled ? 'Kliknij dwa punkty — blisko krawędzi przyciąga do wierzchołka' : '');
});

els.logToggle.addEventListener('click', () => {
  els.log.hidden = !els.log.hidden;
});

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;

  const text = await file.text();
  editor.setValue(text);
  syncParams();
  render();
  els.fileInput.value = '';
});

syncParams();
setStatus('Ładowanie OpenSCAD (24 MB)…', 'busy');
render();

// Small embedding API: lets a host page (or the smoke test) drive the editor
// without reaching into internals.
window.scadpad = {
  render,
  setSource(code) {
    editor.setValue(code);
    syncParams();
  },
  getStl: () => state.lastStl,
  get renders() {
    return state.renders;
  },
  // Debug handle for the smoke test; not part of the public surface.
  __viewport: viewport,
};
