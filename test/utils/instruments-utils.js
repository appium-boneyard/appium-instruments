'use strict';

var path = require('path'),
    Q = require('q'),
    exec = Q.denodeify(require('child_process').exec);

exports.bootstrap = require('appium-uiauto').prepareBootstrap();

exports.getXcodeTraceTemplatePath = function () {
  return exec('xcode-select -print-path').then(function (res) {
    var stdout = res[0];
    return path.resolve(stdout, '..', '..',
      'Contents/Applications/Instruments.app',
      'Contents/PlugIns/AutomationInstrument.bundle/Contents/Resources/Automation.tracetemplate'
    );
  });
};

exports.killAllSimulators = function () {
  if (process.env.KILL_SIMULATORS) {
    return exec('`which pkill` -f iPhoneSimulator').catch();
  } else return new Q();
};

exports.cleanAllTraces = function () {
  if (process.env.CLEAN_TRACES) {
    return exec('`rm -rf instrumentscli*.trace').catch();
  } else return new Q();
};
