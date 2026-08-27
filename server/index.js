const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { addJob, getJob, hasQueuedJobs, hasProcessingJobs, updateJob, getLatestQueuedJob } = require('./queue');
const { launchAfterEffects, isAeRunning, loadConfig, ROOT } = require('./ae');
const { listTemplates, getTemplate } = require('./templates');

const app = express();
const config = loadConfig();
const PORT = config.port || 3000;

const JOBS_DIR = path.join(ROOT, 'data', 'jobs');

app.use(express.static(path.join(ROOT, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const jobId = req.jobId;
      const dir = path.join(JOBS_DIR, jobId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `image${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function scheduleAeIfNeeded() {
  if (!hasQueuedJobs() || isAeRunning() || hasProcessingJobs()) return;

  const result = launchAfterEffects(() => {
    // Child often exits immediately when AE was already open; wait and retry if still queued
    setTimeout(() => {
      if (hasQueuedJobs() && !hasProcessingJobs()) {
        scheduleAeIfNeeded();
      }
    }, 3000);
  });

  if (!result.started && result.reason !== 'already_running') {
    const job = getLatestQueuedJob();
    if (job) {
      const messages = {
        ae_not_found: 'AfterFX.exe not found. Set aePath in config.json',
        script_not_found: 'scripts/process-job.jsx not found',
      };
      updateJob(job.id, {
        status: 'error',
        error: messages[result.reason] || `Failed to start After Effects (${result.reason})`,
      });
    }
  }
}

app.get('/api/templates', (req, res) => {
  const templates = listTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    mode: t.mode,
    fields: t.fields || [],
  }));
  res.json(templates);
});

app.get('/api/templates/:id', (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

app.post('/api/jobs', (req, res, next) => {
  req.jobId = uuidv4();
  next();
}, upload.any(), (req, res) => {
  const templateId = req.body.templateId;
  if (!templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }

  const template = getTemplate(templateId);
  if (!template) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }

  const jobId = req.jobId;
  const workDir = path.join(JOBS_DIR, jobId);
  fs.mkdirSync(workDir, { recursive: true });

  const fields = {};
  for (const field of template.fields || []) {
    if (field.type === 'image') {
      const uploaded = (req.files || []).find((f) => f.fieldname === field.id);
      if (uploaded) {
        fields[field.id] = uploaded.path.replace(/\\/g, '/');
      }
    } else {
      fields[field.id] = req.body[field.id] || field.default || '';
    }
  }

  const outputBase = path.join(workDir, 'output.mp4');
  const job = {
    id: jobId,
    status: 'queued',
    templateId,
    fields,
    output: outputBase.replace(/\\/g, '/'),
    workDir: workDir.replace(/\\/g, '/'),
    createdAt: new Date().toISOString(),
    error: null,
  };

  addJob(job);
  scheduleAeIfNeeded();

  res.status(201).json({ id: jobId, status: 'queued' });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const payload = {
    id: job.id,
    status: job.status,
    templateId: job.templateId,
    error: job.error || null,
    createdAt: job.createdAt,
    outputUrl: job.status === 'done' ? `/api/jobs/${job.id}/video` : null,
  };

  res.json(payload);
});

app.get('/api/jobs/:id/video', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.status !== 'done') {
    return res.status(409).json({ error: 'Video not ready' });
  }

  const outputPath = job.output ? job.output.replace(/\//g, path.sep) : null;
  if (!outputPath || !fs.existsSync(outputPath)) {
    const movPath = outputPath ? outputPath.replace(/\.mp4$/i, '.mov') : null;
    if (movPath && fs.existsSync(movPath)) {
      res.setHeader('Content-Type', 'video/quicktime');
      return res.sendFile(path.resolve(movPath));
    }
    return res.status(404).json({ error: 'Output file not found' });
  }

  const ext = path.extname(outputPath).toLowerCase();
  const contentType = ext === '.mov' ? 'video/quicktime' : 'video/mp4';
  res.setHeader('Content-Type', contentType);
  res.sendFile(path.resolve(outputPath));
});

app.get('/api/health', (req, res) => {
  const { findAfterEffectsPath } = require('./ae');
  res.json({
    ok: true,
    aePath: findAfterEffectsPath(),
    aeRunning: isAeRunning(),
    queued: hasQueuedJobs(),
  });
});

app.listen(PORT, () => {
  console.log(`AE Remote Automation running at http://localhost:${PORT}`);
});
