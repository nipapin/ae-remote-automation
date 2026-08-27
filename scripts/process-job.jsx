// After Effects ExtendScript - process latest queued job
// ES3 compatible

(function () {
  var rootFolder;
  if (typeof $.global.__AE_ROOT__ === 'string' && $.global.__AE_ROOT__) {
    rootFolder = new Folder($.global.__AE_ROOT__);
  } else {
    var scriptFile = new File($.fileName);
    rootFolder = scriptFile.parent.parent;
  }

  var queueFile = new File(rootFolder.fsName + '/data/queue.json');
  var templatesFolder = new File(rootFolder.fsName + '/templates');
  var logFile = null;
  var currentJob = null;

  function nowStamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function log(msg) {
    if (logFile) {
      logFile.open('a');
      logFile.writeln(nowStamp() + ' ' + msg);
      logFile.close();
    }
  }

  function parseJson(text) {
    return eval('(' + text + ')');
  }

  function stringifyJson(obj) {
    if (obj === null) return 'null';
    if (typeof obj === 'string') {
      return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }
    if (obj instanceof Array) {
      var arr = [];
      for (var i = 0; i < obj.length; i++) {
        arr.push(stringifyJson(obj[i]));
      }
      return '[' + arr.join(',') + ']';
    }
    var parts = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        parts.push('"' + key + '":' + stringifyJson(obj[key]));
      }
    }
    return '{' + parts.join(',') + '}';
  }

  function readTextFile(file) {
    if (!file.exists) return null;
    file.open('r');
    var content = file.read();
    file.close();
    return content;
  }

  function writeTextFile(file, content) {
    file.open('w');
    file.write(content);
    file.close();
  }

  function readQueue() {
    var text = readTextFile(queueFile);
    if (!text) return [];
    var data = parseJson(text);
    return data instanceof Array ? data : [];
  }

  function writeQueue(jobs) {
    var tmp = new File(queueFile.fsName + '.tmp');
    writeTextFile(tmp, stringifyJson(jobs));
    if (queueFile.exists) {
      queueFile.remove();
    }
    tmp.copy(queueFile);
    if (tmp.exists) {
      tmp.remove();
    }
  }

  function updateJobStatus(jobId, status, extra) {
    var jobs = readQueue();
    for (var i = 0; i < jobs.length; i++) {
      if (jobs[i].id === jobId) {
        jobs[i].status = status;
        if (extra) {
          for (var key in extra) {
            if (extra.hasOwnProperty(key)) {
              jobs[i][key] = extra[key];
            }
          }
        }
        break;
      }
    }
    writeQueue(jobs);
  }

  function findLatestQueuedJob(jobs) {
    var found = null;
    for (var i = 0; i < jobs.length; i++) {
      if (jobs[i].status === 'queued') {
        found = jobs[i];
      }
    }
    return found;
  }

  function hexToRgb(hex) {
    if (!hex) return [0.2, 0.2, 0.2];
    var h = String(hex).replace('#', '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    var r = parseInt(h.substring(0, 2), 16) / 255;
    var g = parseInt(h.substring(2, 4), 16) / 255;
    var b = parseInt(h.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  function findLayer(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
    return null;
  }

  function findCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === name) {
        return item;
      }
    }
    return null;
  }

  function applyTextLayer(layer, textValue) {
    if (!layer || !(layer.property('Source Text'))) return;
    var textProp = layer.property('Source Text');
    var textDoc = textProp.value;
    textDoc.text = String(textValue || '');
    textProp.setValue(textDoc);
  }

  function setShapeFillColors(propGroup, rgb) {
    if (!propGroup) return;
    for (var i = 1; i <= propGroup.numProperties; i++) {
      var prop = propGroup.property(i);
      if (!prop) continue;
      if (prop.matchName === 'ADBE Vector Graphic - Fill') {
        try {
          prop.property('Color').setValue(rgb);
        } catch (eFill) {}
      }
      if (prop.property && prop.numProperties && prop.numProperties > 0) {
        setShapeFillColors(prop, rgb);
      }
    }
  }

  function applySolidColor(layer, rgb) {
    if (!layer) return;

    // Solid footage
    var source = layer.source;
    if (source && source.mainSource && source.mainSource.color !== undefined) {
      source.mainSource.color = rgb;
    }

    // Shape layer Fill (Contents → … → Fill → Color)
    try {
      var contents = layer.property('Contents') || layer.property('ADBE Root Vectors Group');
      if (contents) {
        setShapeFillColors(contents, rgb);
      }
    } catch (eShape) {}

    // Fill effect
    if (layer.property('Effects')) {
      var effects = layer.property('Effects');
      for (var i = 1; i <= effects.numProperties; i++) {
        var effect = effects.property(i);
        if (effect.matchName === 'ADBE Fill' || effect.name === 'Fill') {
          if (effect.property('Color')) {
            effect.property('Color').setValue(rgb);
          }
        }
      }
    }

    // Text fill color
    try {
      if (layer.property('Source Text')) {
        var textProp = layer.property('Source Text');
        var textDoc = textProp.value;
        textDoc.fillColor = rgb;
        textProp.setValue(textDoc);
      }
    } catch (eText) {}
  }

  function applyImageLayer(comp, layerName, imagePath) {
    if (!imagePath) return;
    var file = new File(imagePath);
    if (!file.exists) return;
    var importOpts = new ImportOptions(file);
    importOpts.importAs = ImportAsType.FOOTAGE;
    var footage = app.project.importFile(importOpts);
    var layer = findLayer(comp, layerName);
    if (layer) {
      layer.replaceSource(footage, false);
    } else {
      comp.layers.add(footage);
      comp.layer(1).name = layerName;
    }
  }

  function generateDemoComp(manifest, fields) {
    var comp = app.project.items.addComp(
      manifest.comp || 'Demo Comp',
      1920,
      1080,
      1,
      manifest.duration || 5,
      30
    );

    var rgb = hexToRgb(fields.color || '#4f46e5');
    var bg = comp.layers.addSolid(rgb, 'Background', 1920, 1080, 1, comp.duration);
    bg.moveToEnd();

    var title = comp.layers.addText(fields.title || 'Hello');
    title.name = 'Title';
    var titleProp = title.property('Source Text').value;
    titleProp.fontSize = 96;
    titleProp.fillColor = [1, 1, 1];
    titleProp.justification = ParagraphJustification.CENTER_JUSTIFY;
    title.property('Source Text').setValue(titleProp);
    title.property('Position').setValue([960, 420]);

    var subtitle = comp.layers.addText(fields.subtitle || 'After Effects Render');
    subtitle.name = 'Subtitle';
    var subProp = subtitle.property('Source Text').value;
    subProp.fontSize = 48;
    subProp.fillColor = [0.9, 0.9, 0.9];
    subProp.justification = ParagraphJustification.CENTER_JUSTIFY;
    subtitle.property('Source Text').setValue(subProp);
    subtitle.property('Position').setValue([960, 540]);

    if (fields.image) {
      applyImageLayer(comp, 'Image', fields.image);
      var imgLayer = findLayer(comp, 'Image');
      if (imgLayer) {
        imgLayer.property('Position').setValue([960, 780]);
        imgLayer.property('Scale').setValue([40, 40]);
      }
    }

    return comp;
  }

  function openAepComp(manifest) {
    var templateDir = new File(templatesFolder.fsName + '/' + manifest.id);
    var aepFile = new File(templateDir.fsName + '/' + manifest.aep);
    if (!aepFile.exists) {
      throw new Error('AEP file not found: ' + aepFile.fsName);
    }
    app.open(aepFile);
    var comp = findCompByName(manifest.comp);
    if (!comp) {
      throw new Error('Composition not found: ' + manifest.comp);
    }
    return comp;
  }

  function applyManifestFields(comp, manifest, fields) {
    var fieldList = manifest.fields || [];
    for (var i = 0; i < fieldList.length; i++) {
      var field = fieldList[i];
      var value = fields[field.id];
      if (value === undefined || value === null || value === '') continue;

      if (field.type === 'text') {
        var textLayer = findLayer(comp, field.layer);
        applyTextLayer(textLayer, value);
      } else if (field.type === 'color') {
        var colorLayer = findLayer(comp, field.layer);
        applySolidColor(colorLayer, hexToRgb(value));
      } else if (field.type === 'image') {
        applyImageLayer(comp, field.layer, value);
      }
    }
  }

  function applyOutputModuleTemplate(outputModule) {
    var templates = [
      'H.264 - Match Render Settings - 15 Mbps',
      'H.264 - Match Render Settings -  5 Mbps',
      'Lossless with Alpha',
      'High Quality'
    ];
    for (var i = 0; i < templates.length; i++) {
      try {
        outputModule.applyTemplate(templates[i]);
        return templates[i];
      } catch (e) {
        // try next
      }
    }
    return 'default';
  }

  function renderComp(comp, outputPath) {
    var outFile = new File(outputPath);
    if (outFile.exists) outFile.remove();

    var rqItem = app.project.renderQueue.items.add(comp);
    var om = rqItem.outputModule(1);
    var usedTemplate = applyOutputModuleTemplate(om);
    om.file = outFile;

    if (usedTemplate.indexOf('H.264') === -1 && /\.mp4$/i.test(outputPath)) {
      var movPath = outputPath.replace(/\.mp4$/i, '.mov');
      om.file = new File(movPath);
      outputPath = movPath;
    }

    app.project.renderQueue.render();
    return outputPath;
  }

  function failJob(message) {
    log('ERROR: ' + message);
    if (currentJob) {
      updateJobStatus(currentJob.id, 'error', { error: message });
    }
    try {
      if (app.project) {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      }
    } catch (e) {}
  }

  app.beginUndoGroup('Process AE Job');

  try {
    var jobs = readQueue();
    currentJob = findLatestQueuedJob(jobs);
    if (!currentJob) {
      app.endUndoGroup();
      return;
    }

    logFile = new File(currentJob.workDir + '/render.log');
    writeTextFile(logFile, '');
    log('Starting job ' + currentJob.id);
    log('Root: ' + rootFolder.fsName);

    updateJobStatus(currentJob.id, 'processing');

    var manifestFile = new File(templatesFolder.fsName + '/' + currentJob.templateId + '/manifest.json');
    var manifestText = readTextFile(manifestFile);
    if (!manifestText) {
      throw new Error('Manifest not found for template: ' + currentJob.templateId);
    }
    var manifest = parseJson(manifestText);

    var comp;
    if (manifest.mode === 'generate') {
      app.newProject();
      comp = generateDemoComp(manifest, currentJob.fields || {});
    } else if (manifest.mode === 'aep') {
      comp = openAepComp(manifest);
      applyManifestFields(comp, manifest, currentJob.fields || {});
    } else {
      throw new Error('Unknown manifest mode: ' + manifest.mode);
    }

    log('Rendering composition: ' + comp.name);
    var finalOutput = renderComp(comp, currentJob.output);
    log('Render complete: ' + finalOutput);

    updateJobStatus(currentJob.id, 'done', {
      output: String(finalOutput).replace(/\\/g, '/'),
      error: null,
    });

    app.endUndoGroup();
    try {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } catch (e2) {}
  } catch (err) {
    try { app.endUndoGroup(); } catch (e3) {}
    failJob(err.message || String(err));
  }
})();
