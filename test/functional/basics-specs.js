'use strict';

var base = require('./base'),
    should = base.should,
    Instruments = require('../../lib/main').Instruments,
    utils = require('../../lib/main').utils,
    logger = require('../../lib/main').logger,
    exec = require('child_process').exec,
    path = require('path'),
    _ =require('underscore'),
    rimraf = require('rimraf'),
    fs = require('fs');

if (process.env.VERBOSE) logger.setConsoleLevel('debug');

var LAUNCH_HANDLER_TIMEOUT = 10000;
var TEMP_DIR = path.resolve(__dirname, 'tmp');

describe('intruments tests', function () {
  this.timeout(90000);

  function newInstrument(opts) {
    _.extend(opts, {
      app: path.resolve(__dirname, '../assets/TestApp.app'),
      bootstrap: path.resolve(__dirname, '../assets/bootstrap.js'),
      simulatorSdkAndDevice: 'iPhone 6 (8.1 Simulator)'
    });
    return utils.quickInstrument(opts);
  }

  function checkLaunched(instruments, done) {
    var _checkLaunched = function (remaining) {
      if (remaining === 0) done(new Error('didn\'t launch'));
      setTimeout(function () {
        if (instruments.didLaunch) return done();
        _checkLaunched(remaining -1);
      },1000);
    };
    _checkLaunched(20);
  }

  function test(appendDesc , opts, checks) {
    checks = checks || {};
    var instruments;
    it('should start' + appendDesc, function (done) {
      utils.killAllSimulators();
      newInstrument(opts).then(function (_instruments) {
        instruments = _instruments;
        if (checks.afterCreate) checks.afterCreate(instruments);
        setTimeout(function () {
          instruments.launchHandler();
        }, LAUNCH_HANDLER_TIMEOUT);
        instruments.start();
        checkLaunched(instruments, function (err) {
          if (err) return done(err);
          if (checks.afterLaunch) checks.afterLaunch(instruments);
          done();
        });
      }).done();
    });
    it('should shutdown' + appendDesc, function (done) {
      instruments.shutdown(done);
    });
  }

  describe('regular timeout', function () {
    test('', {launchTimeout: 60000});
  });

  describe('smart timeout', function () {
    test('', {launchTimeout: {global: 60000, afterSimLaunch: 10000}});
  });

  describe("using different tmp dir", function () {
    var altTmpDir = path.resolve(TEMP_DIR, 'abcd');

    before(function () {
      // travis can't write to /tmp, so let's create a tmp directory
      try {
        fs.mkdirSync(TEMP_DIR);
      } catch (e) {}

      rimraf.sync(altTmpDir);
    });

    after(function () {
      rimraf.sync(TEMP_DIR);
    });

    test(" (1)", {
      launchTimeout: {global: 60000, afterSimLaunch: 10000},
      tmpDir: altTmpDir
    }, {
      afterCreate: function (instruments) { instruments.tmpDir.should.equal(altTmpDir); },
      afterLaunch: function () {
        fs.existsSync(altTmpDir).should.be.ok;
        fs.existsSync(path.resolve(altTmpDir, 'instrumentscli0.trace')).should.be.ok;
      }
    });

    test(" (2)", {
      launchTimeout: {global: 60000, afterSimLaunch: 10000},
      tmpDir: altTmpDir
    }, {
      afterCreate: function (instruments) { instruments.tmpDir.should.equal(altTmpDir); },
      afterLaunch: function () {
        fs.existsSync(altTmpDir).should.be.ok;
        // tmp dir is deleted at startup so trace file is not incremented
        fs.existsSync(path.resolve(altTmpDir, 'instrumentscli0.trace')).should.be.ok;
      }
    });
  });

  describe("using different trace dir", function () {
    var altTraceDir = path.resolve(TEMP_DIR, 'abcd');

    before(function () {
      // travis can't write to /tmp, so let's create a tmp directory
      try {
        fs.mkdirSync(TEMP_DIR);
      } catch (e) {}

      rimraf.sync(altTraceDir);
    });

    after(function () {
      rimraf.sync(TEMP_DIR);
    });

    test(" (1)", {
      launchTimeout: {global: 60000, afterSimLaunch: 10000},
      traceDir: altTraceDir
    }, {
      afterCreate: function (instruments) {
        instruments.tmpDir.should.equal('/tmp/appium-instruments');
      },
      afterLaunch: function () {
        fs.existsSync(altTraceDir).should.be.ok;
        fs.existsSync(path.resolve(altTraceDir, 'instrumentscli0.trace'))
          .should.be.ok;
      }
    });

    test(" (2)", {
      launchTimeout: {global: 60000, afterSimLaunch: 10000},
      traceDir: altTraceDir
    }, {
      afterCreate: function (instruments) {
        instruments.tmpDir.should.equal('/tmp/appium-instruments');
      },
      afterLaunch: function () {
        fs.existsSync(altTraceDir).should.be.ok;
        fs.existsSync(path.resolve(altTraceDir, 'instrumentscli1.trace'))
          .should.be.ok;
      }
    });
  });

  describe("shutdown without startup", function () {
    var instruments;
    it('should start', function (done) {
      utils.killAllSimulators();
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
    utils.killAllSimulators();
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
        Instruments.getAvailableDevicesWithRetry(3, function (err, devices) {
          should.not.exist(err);
          if (iosVer >= 7.1) {
            devices.length.should.be.above(0);
            devices.join('\n').should.include("iPhone 6 (8.1 Simulator)");
          } else {
            devices.length.should.equal(0);
          }
          done();
        });
      });
    });
  });

});
