'use strict';

var Instruments = require('../../lib/main').Instruments,
    chai = require('chai'),
    sinon = require('sinon'),
    sinonChai = require("sinon-chai");

chai.should();
chai.use(sinonChai);

var asyncCbStub = function (success, delay) {
  return function (cb) {
    setTimeout(function () {
      if (success) cb(); else cb("Simulated crash");
    }, delay);
  };
};


describe('Early failures', function () {
  var clock;

  beforeEach(function () { clock = sinon.useFakeTimers(); });
  afterEach(function () { clock.restore(); });

  it('should call launch cb on setInstrumentsPath failure', function (done) {
    var instruments = new Instruments({});
    sinon.stub(instruments, "setInstrumentsPath", asyncCbStub(false, 50));
    var launchCbSpy = sinon.spy();
    var unexpectedExitCbSpy = sinon.spy();
    try { instruments.start(launchCbSpy, unexpectedExitCbSpy); } catch (ign) {}
    clock.tick(49);
    launchCbSpy.should.not.have.been.called;
    clock.tick(10);
    launchCbSpy.should.have.been.calledOnce;
    unexpectedExitCbSpy.should.not.have.been.called;
    done();
  });

  it('should call launch cb on initSocketServer failure', function (done) {
    var instruments = new Instruments({});
    sinon.stub(instruments, "setInstrumentsPath", asyncCbStub(true, 0));
    sinon.stub(instruments, "initSocketServer", asyncCbStub(false, 50));
    var launchCbSpy = sinon.spy();
    var unexpectedExitCbSpy = sinon.spy();
    try { instruments.start(launchCbSpy, unexpectedExitCbSpy); } catch (ign) {}
    clock.tick(40);
    launchCbSpy.should.not.have.been.called;
    clock.tick(20);
    launchCbSpy.should.have.been.calledOnce;
    unexpectedExitCbSpy.should.not.have.been.called;
    done();
  });

});

