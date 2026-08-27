const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

function loadManifest(templateDir) {
  const manifestPath = path.join(templateDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];

  return fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadManifest(path.join(TEMPLATES_DIR, entry.name)))
    .filter(Boolean);
}

function getTemplate(templateId) {
  const templateDir = path.join(TEMPLATES_DIR, templateId);
  if (!fs.existsSync(templateDir)) return null;
  return loadManifest(templateDir);
}

function getTemplateDir(templateId) {
  return path.join(TEMPLATES_DIR, templateId);
}

module.exports = {
  TEMPLATES_DIR,
  listTemplates,
  getTemplate,
  getTemplateDir,
};
