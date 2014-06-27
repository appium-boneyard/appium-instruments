'use strict';

var path = require('path'),
    Q = require('q'),
    exec = Q.denodeify(require('child_process').exec),
    _ = require('underscore'),
    Instruments = require('./instruments'),
    logger = require('./logger');

var getXcodeTraceTemplatePath = function () {
  return exec('xcode-select -print-path').then(function (res) {
    var stdout = res[0];
    return path.resolve(stdout, '..', '..',
      'Contents/Applications/Instruments.app',
      'Contents/PlugIns/AutomationInstrument.bundle/Contents/Resources/Automation.tracetemplate'
    );
  });
};
exports.getXcodeTraceTemplatePath = getXcodeTraceTemplatePath;

exports.killAllSimulators = function () {
  return exec('`which pkill` -f iPhoneSimulator').catch(function () {});
};

exports.killAllInstruments = function () {
  return exec('`which pkill` -f instruments').catch(function () {});
};

exports.cleanAllTraces = function () {
  if (process.env.CLEAN_TRACES) {
    return exec('`rm -rf instrumentscli*.trace').catch();
  } else return new Q();
};

exports.quickInstrument = function (opts) {
  if (opts.logger) {
    logger.init(opts.logger);
  }
  opts = _.clone(opts);
  _.defaults(opts, {
    launchTimeout: 60000
  });
  return getXcodeTraceTemplatePath()
    .then(function (xcodeTraceTemplatePath) {
      return new Instruments({
        app: opts.app,
        bootstrap: opts.bootstrap,
        template: xcodeTraceTemplatePath,
        withoutDelay: true,
        xcodeVersion: '5.1',
        webSocket: null,
        launchTimeout: opts.launchTimeout,
        flakeyRetries: true,
        logNoColors: false,
      });
    });
};
