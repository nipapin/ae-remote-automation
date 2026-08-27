const templates = [];
let pollTimer = null;

const templateSelect = document.getElementById('templateId');
const dynamicFields = document.getElementById('dynamic-fields');
const form = document.getElementById('render-form');
const submitBtn = document.getElementById('submit-btn');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const errorText = document.getElementById('error-text');
const resultEmpty = document.getElementById('result-empty');
const resultVideo = document.getElementById('result-video');
const downloadLink = document.getElementById('download-link');

const STATUS_LABELS = {
  queued: 'В очереди…',
  processing: 'Рендер в After Effects…',
  done: 'Готово',
  error: 'Ошибка',
};

async function loadTemplates() {
  const res = await fetch('/api/templates');
  const data = await res.json();
  templates.length = 0;
  templates.push(...data);

  templateSelect.innerHTML = '';
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    templateSelect.appendChild(opt);
  }

  renderDynamicFields();
}

function getSelectedTemplate() {
  return templates.find((t) => t.id === templateSelect.value);
}

function renderDynamicFields() {
  const template = getSelectedTemplate();
  dynamicFields.innerHTML = '';

  if (!template) return;

  for (const field of template.fields || []) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.textContent = field.label || field.id;
    label.setAttribute('for', field.id);
    wrap.appendChild(label);

    let input;
    if (field.type === 'text') {
      input = document.createElement('input');
      input.type = 'text';
      input.id = field.id;
      input.name = field.id;
      input.value = field.default || '';
    } else if (field.type === 'color') {
      input = document.createElement('input');
      input.type = 'color';
      input.id = field.id;
      input.name = field.id;
      input.value = field.default || '#4f46e5';
    } else if (field.type === 'image') {
      input = document.createElement('input');
      input.type = 'file';
      input.id = field.id;
      input.name = field.id;
      input.accept = 'image/*';
    }

    if (input) wrap.appendChild(input);
    dynamicFields.appendChild(wrap);
  }
}

function setStatus(status, error) {
  statusBox.classList.remove('hidden');
  statusText.textContent = STATUS_LABELS[status] || status;

  if (error) {
    errorText.textContent = error;
    errorText.classList.remove('hidden');
  } else {
    errorText.textContent = '';
    errorText.classList.add('hidden');
  }
}

function resetResult() {
  resultVideo.classList.add('hidden');
  resultVideo.removeAttribute('src');
  downloadLink.classList.add('hidden');
  downloadLink.removeAttribute('href');
  resultEmpty.classList.remove('hidden');
}

function showResult(videoUrl) {
  resultEmpty.classList.add('hidden');
  resultVideo.src = `${videoUrl}?t=${Date.now()}`;
  resultVideo.classList.remove('hidden');
  downloadLink.href = videoUrl;
  downloadLink.classList.remove('hidden');
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(jobId) {
  stopPolling();

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const job = await res.json();
      setStatus(job.status, job.error);

      if (job.status === 'done') {
        stopPolling();
        showResult(job.outputUrl);
        submitBtn.disabled = false;
      } else if (job.status === 'error') {
        stopPolling();
        submitBtn.disabled = false;
      }
    } catch (err) {
      stopPolling();
      setStatus('error', err.message);
      submitBtn.disabled = false;
    }
  }, 2000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  resetResult();
  setStatus('queued');

  const formData = new FormData(form);
  formData.set('templateId', templateSelect.value);

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create job');
    }

    setStatus('queued');
    startPolling(data.id);
  } catch (err) {
    setStatus('error', err.message);
    submitBtn.disabled = false;
  }
});

templateSelect.addEventListener('change', renderDynamicFields);

loadTemplates().catch((err) => {
  setStatus('error', `Не удалось загрузить шаблоны: ${err.message}`);
});
