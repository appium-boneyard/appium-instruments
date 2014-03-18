'use strict';

var Instruments = require('../lib/main').Instruments,
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

describe('intruments tests', function () {
  var xcodeTraceTemplatePath,
      instruments;

  before(function (done) {
    getXcodeTraceTemplatePath()
      .then(function (_path) { xcodeTraceTemplatePath = _path; })
      .nodeify(done);
  });

  it('should start', function (done) {
    console.log(xcodeTraceTemplatePath);
    instruments = new Instruments({
      app: path.resolve(__dirname, 'assets/TestApp.app'), // TODO extract app package
      bootstrap: bootstrap,
      template: xcodeTraceTemplatePath,
      withoutDelay: true,
      xcodeVersion: '5.0.2',
      webSocket: null,
      launchTimeout: 45000,
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
