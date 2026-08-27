const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig } = require('./ae');

function resolveFromRoot(relOrAbs) {
  if (!relOrAbs) return null;
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
}

function getParamsPath() {
  const config = loadConfig();
  return resolveFromRoot(config.paramsPath || 'templates/rainbow/params.json');
}

function getPreviewPath() {
  const config = loadConfig();
  return resolveFromRoot(config.previewPath || 'data/preview/preview.png');
}

function getPreviewStatusPath() {
  return path.join(ROOT, 'data', 'preview', 'status.json');
}

function readParams() {
  const filePath = getParamsPath();
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeParams(data) {
  const filePath = getParamsPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

function writePreviewStatus(status) {
  const filePath = getPreviewStatusPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf8');
}

function readPreviewStatus() {
  const filePath = getPreviewStatusPath();
  if (!fs.existsSync(filePath)) {
    return { status: 'idle' };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { status: 'idle' };
  }
}

module.exports = {
  getParamsPath,
  getPreviewPath,
  getPreviewStatusPath,
  readParams,
  writeParams,
  writePreviewStatus,
  readPreviewStatus,
  resolveFromRoot,
};
