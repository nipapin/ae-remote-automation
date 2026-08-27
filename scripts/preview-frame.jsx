// Preview: apply params.json to Main, save frame at 1s
// ES3 compatible

(function () {
  var rootFolder;
  if (typeof $.global.__AE_ROOT__ === 'string' && $.global.__AE_ROOT__) {
    rootFolder = new Folder($.global.__AE_ROOT__);
  } else {
    rootFolder = new File($.fileName).parent.parent;
  }

  var root = rootFolder.fsName.replace(/\\/g, '/');
  var configFile = new File(root + '/config.json');
  var statusFile = new File(root + '/data/preview/status.json');
  var logFile = new File(root + '/data/preview/preview.log');

  function nowStamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function log(msg) {
    try {
      logFile.open('a');
      logFile.writeln(nowStamp() + ' ' + msg);
      logFile.close();
    } catch (e) {}
  }

  function parseJson(text) {
    return eval('(' + text + ')');
  }

  function stringifyJson(obj) {
    if (obj === null) return 'null';
    if (typeof obj === 'string') {
      return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (obj instanceof Array) {
      var arr = [];
      for (var i = 0; i < obj.length; i++) arr.push(stringifyJson(obj[i]));
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

  function readText(file) {
    if (!file.exists) return null;
    file.open('r');
    var t = file.read();
    file.close();
    return t;
  }

  function writeText(file, content) {
    var parent = file.parent;
    if (parent && !parent.exists) parent.create();
    file.open('w');
    file.write(content);
    file.close();
  }

  function writeStatus(status, extra) {
    var obj = { status: status, updatedAt: nowStamp() };
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) obj[k] = extra[k];
      }
    }
    writeText(statusFile, stringifyJson(obj));
  }

  function resolvePath(rel) {
    if (!rel) return null;
    if (rel.indexOf(':') === 1 || rel.charAt(0) === '/') return rel.replace(/\\/g, '/');
    return root + '/' + String(rel).replace(/\\/g, '/');
  }

  function findLayer(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) return comp.layer(i);
    }
    return null;
  }

  function findCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === name) return item;
    }
    return null;
  }

  function setShapeFillColors(propGroup, rgb) {
    if (!propGroup) return;
    for (var i = 1; i <= propGroup.numProperties; i++) {
      var prop = propGroup.property(i);
      if (!prop) continue;
      if (prop.matchName === 'ADBE Vector Graphic - Fill') {
        try { prop.property('Color').setValue(rgb); } catch (e1) {}
      }
      if (prop.numProperties && prop.numProperties > 0) {
        setShapeFillColors(prop, rgb);
      }
    }
  }

  function applyFill(layer, fill) {
    if (!layer || !fill) return;
    var rgb = [fill[0], fill[1], fill[2]];

    try {
      var contents = layer.property('Contents') || layer.property('ADBE Root Vectors Group');
      if (contents) setShapeFillColors(contents, rgb);
    } catch (e2) {}

    try {
      if (layer.property('Source Text')) {
        var textProp = layer.property('Source Text');
        var doc = textProp.value;
        doc.fillColor = rgb;
        textProp.setValue(doc);
      }
    } catch (e3) {}

    try {
      var source = layer.source;
      if (source && source.mainSource && source.mainSource.color !== undefined) {
        source.mainSource.color = rgb;
      }
    } catch (e4) {}
  }

  function applyLayer(comp, layerData) {
    var layer = findLayer(comp, layerData.name);
    if (!layer) {
      log('layer not found: ' + layerData.name);
      return;
    }

    if (layerData.type === 'text' && layerData.sourceText !== undefined) {
      try {
        var textProp = layer.property('Source Text');
        var doc = textProp.value;
        doc.text = String(layerData.sourceText);
        textProp.setValue(doc);
      } catch (e5) {
        log('text fail ' + layerData.name + ': ' + e5.toString());
      }
    }

    if (layerData.fill) applyFill(layer, layerData.fill);

    if (layerData.transform) {
      try {
        if (layerData.transform.position) {
          layer.property('Position').setValue(layerData.transform.position);
        }
      } catch (e6) {}
      try {
        if (layerData.transform.scale) {
          layer.property('Scale').setValue(layerData.transform.scale);
        }
      } catch (e7) {}
    }
  }

  function savePreviewFrame(comp, timeSec, outPath) {
    var outFile = new File(outPath);
    if (outFile.exists) outFile.remove();

    if (typeof comp.saveFrameToPng === 'function') {
      comp.saveFrameToPng(timeSec, outFile);
      return outFile.exists;
    }

    // Fallback: render a single frame via RQ as PNG sequence-like still
    var rq = app.project.renderQueue.items.add(comp);
    rq.timeSpanStart = timeSec;
    rq.timeSpanDuration = comp.frameDuration;
    var om = rq.outputModule(1);
    try { om.applyTemplate('Photoshop'); } catch (e8) {
      try { om.applyTemplate('PNG Sequence'); } catch (e9) {}
    }
    om.file = outFile;
    app.project.renderQueue.render();
    return outFile.exists;
  }

  writeText(logFile, '');
  writeStatus('processing');

  try {
    var configText = readText(configFile);
    if (!configText) throw new Error('config.json missing');
    var config = parseJson(configText);

    var paramsPath = resolvePath(config.paramsPath || 'templates/rainbow/params.json');
    var aepPath = resolvePath(config.aepPath || 'templates/rainbow/template.aep');
    var previewPath = resolvePath(config.previewPath || 'data/preview/preview.png');
    var compName = config.compName || 'Main';
    var previewTime = (config.previewTime !== undefined) ? config.previewTime : 1;

    log('params=' + paramsPath);
    log('aep=' + aepPath);
    log('preview=' + previewPath);

    var paramsText = readText(new File(paramsPath));
    if (!paramsText) throw new Error('params.json missing: ' + paramsPath);
    var params = parseJson(paramsText);

    var aepFile = new File(aepPath);
    if (!aepFile.exists) throw new Error('AEP missing: ' + aepPath);

    app.open(aepFile);
    var comp = findCompByName(compName);
    if (!comp) throw new Error('Comp not found: ' + compName);

    app.beginUndoGroup('Apply params preview');
    var layers = params.layers || [];
    for (var i = 0; i < layers.length; i++) {
      applyLayer(comp, layers[i]);
    }
    app.endUndoGroup();

    // Give AE a tick to refresh
    $.sleep(300);

    log('saving frame at t=' + previewTime);
    var ok = savePreviewFrame(comp, previewTime, previewPath);
    if (!ok) throw new Error('Preview PNG was not written');

    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}

    writeStatus('done', { previewUrl: '/api/preview', previewPath: previewPath });
    log('done');
  } catch (err) {
    writeStatus('error', { error: err.message || String(err) });
    log('ERROR: ' + (err.message || String(err)));
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e2) {}
  }
})();
