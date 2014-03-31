'use strict';

var base = require('./base'),
    should = base.should,
    utils = require('../utils/instruments-utils'),
    path = require('path'),
    exec = require('child_process').exec,
    Instruments = require('../../lib/main').Instruments;

describe('intruments tests', function () {
  this.timeout(90000);

  var xcodeTraceTemplatePath,
      instruments;

  beforeEach(function (done) {
    utils.killAllSimulators()
    .then(utils.getXcodeTraceTemplatePath)
    .then(function (_path) { xcodeTraceTemplatePath = _path; })
    .nodeify(done);
  });

  afterEach(function (done) {
    utils.cleanAllTraces().nodeify(done);
  });

  function newInstrument(timeout) {
    return new Instruments({
      app: path.resolve(__dirname, '../assets/TestApp.app'),
      bootstrap: utils.bootstrap,
      template: xcodeTraceTemplatePath,
      withoutDelay: true,
      xcodeVersion: '5.1',
      webSocket: null,
      launchTimeout: timeout,
      flakeyRetries: true,
      logNoColors: false,
    });
  }

  function test(desc, timeout) {
    describe(desc, function () {
      it('should start', function (done) {
        instruments = newInstrument(timeout);
        instruments.start(function (err) {
          should.not.exist(err);
          done();
        });
      });

      it('should shutdown', function (done) {
        instruments.shutdown(done);
      });
    });
  }

  test('regular timeout', 60000);
  test('smart timeout', {global: 60000, afterSimLaunch: 10000});

  describe("shutdown without startup", function () {
    it('should start', function (done) {
      instruments = newInstrument(60000);
      instruments.shutdown(function (err) {
        err.should.include('Didn\'t not shutdown within');
        done();
      });
    });
  });

  // works only on 7.1
  describe("getting devices", function () {
    it('should get all available devices', function (done) {
      exec('xcrun --sdk iphonesimulator --show-sdk-version', function (err, stdout) {
        var onErr = function () {
          console.error("Couldn't get iOS sdk version, skipping test");
          done();
        };
        if (err) return onErr();
        var iosVer = parseFloat(stdout);
        if (typeof iosVer !== "number" || isNaN(iosVer)) {
          return onErr();
        }
        instruments = newInstrument(60000);
        instruments.getAvailableDevices(function (err, devices) {
          should.not.exist(err);
          if (iosVer >= 7.1) {
            devices.length.should.equal(7);
            devices.should.contain("iPhone - Simulator - iOS 7.1");
          } else {
            devices.length.should.equal(0);
          }
          done();
        });
      });
    });
  });

});
