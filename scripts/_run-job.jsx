// Auto-generated - do not edit
(function () {
  var bootLog = new File("C:/Users/nipap/ae-remote-automation/data/ae-bootstrap.log");
  function bootWrite(msg) {
    try {
      bootLog.open("a");
      bootLog.writeln(msg);
      bootLog.close();
    } catch (e) {}
  }
  try {
    bootWrite("bootstrap start");
    $.global.__AE_ROOT__ = "C:/Users/nipap/ae-remote-automation";
    var mainFile = new File("C:/Users/nipap/ae-remote-automation/scripts/process-job.jsx");
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
