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
  return exec('`which pkill` -f iPhoneSimulator').catch(function () {})
    .delay(1000);
};

exports.killAllInstruments = function () {
  return exec('`which pkill` -f instruments').catch(function () {})
    .delay(1000);
};

exports.cleanAllTraces = function () {
  if (process.env.CLEAN_TRACES) {
    return exec('`rm -rf instrumentscli*.trace').catch();
  } else return new Q();
};

exports.quickInstrument = function (opts) {
  opts = _.clone(opts);
  if (opts.logger) {
    logger.init(opts.logger);
  }
  delete opts.logger;
  return getXcodeTraceTemplatePath()
    .then(function (xcodeTraceTemplatePath) {
      _.defaults(opts, {
            launchTimeout: 60000,
            template: xcodeTraceTemplatePath,
            withoutDelay: true,
            xcodeVersion: '5.1',
            webSocket: null,
            flakeyRetries: true,
            logNoColors: false,
      });
      return new Instruments(opts);
    });
};
