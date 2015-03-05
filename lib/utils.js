'use strict';

var path = require('path'),
    Q = require('q'),
    exec = Q.denodeify(require('child_process').exec),
    fsOpen = Q.denodeify(require('fs').open),
    fsClose = Q.denodeify(require('fs').close),
     _ = require('underscore'),
    Instruments = require('./instruments'),
    logger = require('./logger');

var getXcodeTraceTemplatePath = function () {
  var instrumentsAppPath, traceTemplatePath;
  return exec('xcode-select -print-path')
    .then(function (res) {
      var xCodePath = res[0];
      instrumentsAppPath = path.resolve(xCodePath, '..', '..',
        'Contents/Applications/Instruments.app'
      );
    }).then(function () {
      traceTemplatePath = path.resolve(instrumentsAppPath,
        'Contents/PlugIns/AutomationInstrument.bundle/Contents/Resources/Automation.tracetemplate'
      );
      return fsOpen(traceTemplatePath).catch(function () {
        traceTemplatePath = path.resolve(instrumentsAppPath,
          'Contents/PlugIns/AutomationInstrument.xrplugin/Contents/Resources/Automation.tracetemplate'
        );
        return fsOpen(traceTemplatePath, 'r');
      });
    }).then(function (fd) { return fsClose(fd); })
    .then(function () {
      return traceTemplatePath;
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
            xcodeVersion: '8.1',
            webSocket: null,
            flakeyRetries: true,
            logNoColors: false,
      });
      return new Instruments(opts);
    });
};
