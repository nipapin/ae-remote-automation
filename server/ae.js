const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'process-job.jsx');
const PREVIEW_SCRIPT_PATH = path.join(ROOT, 'scripts', 'preview-frame.jsx');
const BOOTSTRAP_PATH = path.join(ROOT, 'scripts', '_run-job.jsx');

let aeRunning = false;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { noui: false, port: 3000, forceRestartAe: true };
  }
}

function findAfterEffectsPath() {
  const config = loadConfig();
  if (config.aePath && fs.existsSync(config.aePath)) {
    return config.aePath;
  }

  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const roots = [programFiles, programFilesX86];

  for (const root of roots) {
    const adobeDir = path.join(root, 'Adobe');
    if (!fs.existsSync(adobeDir)) continue;

    const entries = fs.readdirSync(adobeDir)
      .filter((name) => /^Adobe After Effects \d{4}$/.test(name))
      .sort()
      .reverse();

    for (const entry of entries) {
      const candidate = path.join(adobeDir, entry, 'Support Files', 'AfterFX.exe');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function toExtendScriptPath(p) {
  return String(p).replace(/\\/g, '/');
}

function isAfterFxProcessRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq AfterFX.exe" /NH', {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /AfterFX\.exe/i.test(out);
  } catch {
    return false;
  }
}

function killAfterFxProcesses() {
  try {
    execSync('taskkill /IM AfterFX.exe /F', {
      encoding: 'utf8',
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    // already closed
  }
}

function writeBootstrap(mainScriptPath) {
  const rootPath = toExtendScriptPath(ROOT);
  const mainScript = toExtendScriptPath(mainScriptPath);
  const bootLog = toExtendScriptPath(path.join(ROOT, 'data', 'ae-bootstrap.log'));

  const content = `// Auto-generated - do not edit
(function () {
  var bootLog = new File("${bootLog}");
  function bootWrite(msg) {
    try {
      bootLog.open("a");
      bootLog.writeln(msg);
      bootLog.close();
    } catch (e) {}
  }
  try {
    bootWrite("bootstrap start");
    $.global.__AE_ROOT__ = "${rootPath}";
    var mainFile = new File("${mainScript}");
    if (!mainFile.exists) {
      bootWrite("main script missing: " + mainFile.fsName);
      return;
    }
    bootWrite("loading " + mainFile.fsName);
    $.evalFile(mainFile);
    bootWrite("main finished");
  } catch (e) {
    bootWrite("bootstrap error: " + e.toString());
  }
})();
`;

  fs.writeFileSync(BOOTSTRAP_PATH, content, 'utf8');
  return BOOTSTRAP_PATH;
}

function sleepSync(ms) {
  try {
    execSync(`powershell -Command "Start-Sleep -Milliseconds ${ms}"`, {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    // ignore
  }
}

function launchAfterEffects(onExit, options) {
  if (aeRunning) {
    return { started: false, reason: 'already_running' };
  }

  const aePath = findAfterEffectsPath();
  if (!aePath) {
    return { started: false, reason: 'ae_not_found' };
  }

  const scriptPath = (options && options.scriptPath) || SCRIPT_PATH;
  if (!fs.existsSync(scriptPath)) {
    return { started: false, reason: 'script_not_found' };
  }

  const config = loadConfig();
  const bootstrap = writeBootstrap(scriptPath);

  if (config.forceRestartAe !== false && isAfterFxProcessRunning()) {
    killAfterFxProcesses();
    sleepSync(2500);
  }

  const args = [];
  if (config.noui) {
    args.push('-noui');
  }
  args.push('-r', bootstrap);

  const quotedArgs = args.map((a) => (/\s/.test(a) || a.includes('\\') ? `"${a}"` : a));
  const command = `"${aePath}" ${quotedArgs.join(' ')}`;

  const child = spawn(command, {
    cwd: ROOT,
    detached: false,
    stdio: 'ignore',
    windowsHide: !!config.noui,
    shell: true,
  });

  aeRunning = true;

  child.on('exit', (code) => {
    aeRunning = false;
    if (typeof onExit === 'function') {
      onExit(code);
    }
  });

  child.on('error', () => {
    aeRunning = false;
    if (typeof onExit === 'function') {
      onExit(1);
    }
  });

  return { started: true, pid: child.pid };
}

function isAeRunning() {
  return aeRunning;
}

module.exports = {
  ROOT,
  SCRIPT_PATH,
  PREVIEW_SCRIPT_PATH,
  findAfterEffectsPath,
  launchAfterEffects,
  isAeRunning,
  loadConfig,
};
