let params = { layers: [] };
let saveTimer = null;
let pollTimer = null;

const layersForm = document.getElementById('layers-form');
const saveBtn = document.getElementById('save-btn');
const previewBtn = document.getElementById('preview-btn');
const statusText = document.getElementById('status-text');
const errorText = document.getElementById('error-text');
const previewEmpty = document.getElementById('preview-empty');
const previewImage = document.getElementById('preview-image');

function rgbToHex(fill) {
  if (!fill || fill.length < 3) return '#ffffff';
  const to = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(v) * 255)));
    return n.toString(16).padStart(2, '0');
  };
  return `#${to(fill[0])}${to(fill[1])}${to(fill[2])}`;
}

function hexToRgb(hex, alpha) {
  const h = String(hex || '#ffffff').replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b, alpha === undefined ? 1 : alpha];
}

function setStatus(text, error) {
  statusText.textContent = text;
  if (error) {
    errorText.textContent = error;
    errorText.classList.remove('hidden');
  } else {
    errorText.textContent = '';
    errorText.classList.add('hidden');
  }
}

function collectFromForm() {
  const next = { layers: [] };
  for (const layer of params.layers) {
    const block = document.querySelector(`[data-layer="${CSS.escape(layer.name)}"]`);
    if (!block) {
      next.layers.push(layer);
      continue;
    }

    const copy = JSON.parse(JSON.stringify(layer));
    const textInput = block.querySelector('[data-field="sourceText"]');
    if (textInput) copy.sourceText = textInput.value;

    const colorInput = block.querySelector('[data-field="fill"]');
    if (colorInput) {
      const alpha = copy.fill && copy.fill[3] !== undefined ? copy.fill[3] : 1;
      copy.fill = hexToRgb(colorInput.value, alpha);
    }

    const sx = block.querySelector('[data-field="scaleX"]');
    const sy = block.querySelector('[data-field="scaleY"]');
    if (sx && sy) {
      copy.transform = copy.transform || {};
      copy.transform.scale = [Number(sx.value), Number(sy.value)];
    }

    const px = block.querySelector('[data-field="posX"]');
    const py = block.querySelector('[data-field="posY"]');
    if (px && py) {
      copy.transform = copy.transform || {};
      copy.transform.position = [Number(px.value), Number(py.value)];
    }

    next.layers.push(copy);
  }
  params = next;
  return params;
}

function renderForm() {
  layersForm.innerHTML = '';

  for (const layer of params.layers) {
    const section = document.createElement('section');
    section.className = 'layer-card';
    section.dataset.layer = layer.name;

    const title = document.createElement('h3');
    title.textContent = `${layer.name} (${layer.type})`;
    section.appendChild(title);

    if (layer.type === 'text') {
      section.appendChild(fieldRow('Текст', (() => {
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.field = 'sourceText';
        input.value = layer.sourceText || '';
        return input;
      })()));
    }

    section.appendChild(fieldRow('Цвет', (() => {
      const input = document.createElement('input');
      input.type = 'color';
      input.dataset.field = 'fill';
      input.value = rgbToHex(layer.fill);
      return input;
    })()));

    const scale = (layer.transform && layer.transform.scale) || [100, 100];
    section.appendChild(fieldRow('Scale X / Y', pairNumber('scaleX', 'scaleY', scale[0], scale[1])));

    const pos = (layer.transform && layer.transform.position) || [0, 0];
    section.appendChild(fieldRow('Position X / Y', pairNumber('posX', 'posY', pos[0], pos[1])));

    layersForm.appendChild(section);
  }

  layersForm.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', scheduleAutoSave);
    input.addEventListener('change', scheduleAutoSave);
  });
}

function fieldRow(labelText, control) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  wrap.appendChild(control);
  return wrap;
}

function pairNumber(nameA, nameB, a, b) {
  const row = document.createElement('div');
  row.className = 'pair';
  for (const [name, val] of [[nameA, a], [nameB, b]]) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.dataset.field = name;
    input.value = val;
    row.appendChild(input);
  }
  return row;
}

function scheduleAutoSave() {
  setStatus('Изменения… (сохранение через 1с)');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveParams(true);
  }, 1000);
}

async function saveParams(withPreview) {
  collectFromForm();
  setStatus(withPreview ? 'Сохранение + preview…' : 'Сохранение…');
  saveBtn.disabled = true;
  previewBtn.disabled = true;

  try {
    const qs = withPreview ? '' : '?preview=0';
    const res = await fetch(`/api/params${qs}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');

    setStatus(withPreview ? 'JSON сохранён, ждём preview…' : 'JSON сохранён');
    if (withPreview) startPreviewPolling();
  } catch (err) {
    setStatus('Ошибка', err.message);
  } finally {
    saveBtn.disabled = false;
    previewBtn.disabled = false;
  }
}

async function requestPreviewOnly() {
  setStatus('Запрос preview…');
  try {
    const res = await fetch('/api/preview', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preview failed');
    startPreviewPolling();
  } catch (err) {
    setStatus('Ошибка', err.message);
  }
}

function showPreview(url) {
  previewEmpty.classList.add('hidden');
  previewImage.src = url;
  previewImage.classList.remove('hidden');
}

function startPreviewPolling() {
  if (pollTimer) clearInterval(pollTimer);
  let tries = 0;

  pollTimer = setInterval(async () => {
    tries += 1;
    try {
      const res = await fetch('/api/preview/status');
      const data = await res.json();

      if (data.status === 'done' && data.previewUrl) {
        clearInterval(pollTimer);
        pollTimer = null;
        showPreview(data.previewUrl);
        setStatus('Preview готов');
      } else if (data.status === 'error') {
        clearInterval(pollTimer);
        pollTimer = null;
        setStatus('Ошибка preview', data.error || 'unknown');
      } else {
        setStatus(`Preview: ${data.status || 'ожидание'}…`);
      }
    } catch (err) {
      clearInterval(pollTimer);
      pollTimer = null;
      setStatus('Ошибка', err.message);
    }

    if (tries > 90) {
      clearInterval(pollTimer);
      pollTimer = null;
      setStatus('Таймаут preview', 'After Effects слишком долго не ответил');
    }
  }, 2000);
}

async function loadParams() {
  const res = await fetch('/api/params');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load params');
  params = data.data;
  renderForm();
  setStatus(`Загружено: ${data.path}`);

  const statusRes = await fetch('/api/preview/status');
  const status = await statusRes.json();
  if (status.ready && status.previewUrl) {
    showPreview(status.previewUrl);
  }
}

saveBtn.addEventListener('click', () => saveParams(true));
previewBtn.addEventListener('click', () => requestPreviewOnly());

loadParams().catch((err) => setStatus('Ошибка загрузки', err.message));
