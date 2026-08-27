const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');

function readQueue() {
  try {
    const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeQueue(jobs) {
  const dir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${QUEUE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
  fs.renameSync(tmp, QUEUE_PATH);
}

function getJob(id) {
  return readQueue().find((job) => job.id === id) || null;
}

function addJob(job) {
  const jobs = readQueue();
  jobs.push(job);
  writeQueue(jobs);
  return job;
}

function updateJob(id, updates) {
  const jobs = readQueue();
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) return null;
  jobs[index] = { ...jobs[index], ...updates };
  writeQueue(jobs);
  return jobs[index];
}

function hasQueuedJobs() {
  return readQueue().some((job) => job.status === 'queued');
}

function hasProcessingJobs() {
  return readQueue().some((job) => job.status === 'processing');
}

function getLatestQueuedJob() {
  const jobs = readQueue().filter((job) => job.status === 'queued');
  return jobs.length ? jobs[jobs.length - 1] : null;
}

module.exports = {
  QUEUE_PATH,
  readQueue,
  writeQueue,
  getJob,
  addJob,
  updateJob,
  hasQueuedJobs,
  hasProcessingJobs,
  getLatestQueuedJob,
};
