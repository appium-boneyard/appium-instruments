'use strict';

var base = require('./base'),
    should = base.should,
    utils = require('../../lib/main').utils,
    exec = require('child_process').exec,
    path = require('path'),
    _ =require('underscore'),
    rimraf = require('rimraf'),
    fs = require('fs');

describe('intruments tests', function () {
  this.timeout(90000);

  var instruments;

  beforeEach(function () {
    return utils.killAllSimulators();
  });

  afterEach(function (done) {
    utils.cleanAllTraces().nodeify(done);
  });

  function newInstrument(opts) {
    _.extend(opts, {
      app: path.resolve(__dirname, '../assets/TestApp.app'),
      bootstrap: path.resolve(__dirname, '../assets/bootstrap.js'),
    });
    return utils.quickInstrument(opts);
  }

  function test(opts) {
    it('should start', function (done) {
      newInstrument(opts).then(function (_instruments) {
        instruments = _instruments;
        setTimeout(function () {
          instruments.launchHandler();
        }, 5000);
        instruments.start(function (err) {
          should.not.exist(err);
        });
      }).done();
      setTimeout(function () {
        instruments.didLaunch.should.be.ok;
        done();
      },20000);
    });
    it('should shutdown', function (done) {
      instruments.shutdown(done);
    });
  }

  describe('regular timeout', function () {
    test({launchTimeout: 60000});
  });

  describe('smart timeout', function () {
    test({launchTimeout: {global: 60000, afterSimLaunch: 10000}});
  });

  describe("using different tmp dir", function () {
    it('should start', function (done) {
      var altTmpDir = '/tmp/abcd';
      rimraf.sync(altTmpDir);
      newInstrument({launchTimeout: 60000, tmpDir: altTmpDir}).then(function (_instruments) {
        instruments = _instruments;
        instruments.tmpDir.should.equal(altTmpDir);
        setTimeout(function () {
          instruments.launchHandler();
        }, 5000);
        instruments.start(function (err) {
          should.not.exist(err);
          fs.exists('/tmp/abcd').should.be.ok;
        });
      }).done();
      setTimeout(function () {
        instruments.didLaunch.should.be.ok;
        done();
      },20000);
    });
    it('should shutdown', function (done) {
      instruments.shutdown(done);
    });
  });

  describe("shutdown without startup", function () {
    it('should start', function (done) {
      newInstrument({launchTimeout: 60000}).then(function (_instruments) {
        instruments = _instruments;
        instruments.shutdown(function (err) {
          err.should.include('Didn\'t not shutdown within');
          done();
        });
      })
      .done();
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
        newInstrument({launchTimeout: 60000}).then(function (_instruments) {
          instruments = _instruments;
          instruments.getAvailableDevices(function (err, devices) {
            should.not.exist(err);
            if (iosVer >= 7.1) {
              devices.length.should.be.above(0);
              devices.should.contain("iPhone - Simulator - iOS 7.1");
            } else {
              devices.length.should.equal(0);
            }
            done();
          });
        }).done();
      });
    });
  });

});
