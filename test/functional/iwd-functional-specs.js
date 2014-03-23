'use strict';

var Instruments = require('../../lib/main').Instruments,
    chai = require('chai'),
    should = chai.should(),
    path = require('path'),
    Q = require('q'),
    exec = Q.denodeify(require('child_process').exec),
    bootstrap = require('appium-uiauto').bootstrap;


var getXcodeTraceTemplatePath = function () {
  return exec('xcode-select -print-path').then(function (res) {
    var stdout = res[0];
    return path.resolve(stdout, '..', '..',
      'Contents/Applications/Instruments.app',
      'Contents/PlugIns/AutomationInstrument.bundle/Contents/Resources/Automation.tracetemplate'
    );
  });
};

var killAllSimulators = function () {
  if (process.env.KILL_SIMULATORS) {
    return exec('`which pkill` -f iPhoneSimulator').catch();
  } else return new Q();
};

var cleanAllTraces = function () {
  if (process.env.CLEAN_TRACES) {
    return exec('`rm -rf instrumentscli*.trace').catch();
  } else return new Q();
};

describe('intruments tests', function () {
  var xcodeTraceTemplatePath,
      instruments;

  before(function (done) {
    killAllSimulators()
    .then(getXcodeTraceTemplatePath)
    .then(function (_path) { xcodeTraceTemplatePath = _path; })
    .nodeify(done);
  });

  after(function (done) {
    cleanAllTraces().nodeify(done);
  });
  
  it('should start', function (done) {
    console.log(xcodeTraceTemplatePath);
    instruments = new Instruments({
      app: path.resolve(__dirname, "../../", '../../assets/TestApp.app'), // TODO extract app package
      bootstrap: bootstrap,
      template: xcodeTraceTemplatePath,
      withoutDelay: true,
      xcodeVersion: '5.1',
      webSocket: null,
      launchTimeout: 30000,
      flakeyRetries: true,
      logNoColors: false,
    });

    instruments.start(function (err) {
      should.not.exist(err);
      done();
    });
  });

  it('should shutdown', function (done) {
    instruments.shutdown(done);
  });
});
