'use strict';

var base = require('./base'),
    should = base.should,
    utils = require('../utils/instruments-utils'),
    path = require('path'),
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


});
