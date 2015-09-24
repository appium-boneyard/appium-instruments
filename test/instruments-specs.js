// transpile:mocha

import { Instruments } from '..';
import { utils } from '..';
import * as tp from 'teen_process';
import chai from 'chai';
import xcode from 'appium-xcode';
import { withMocks, verify } from 'appium-test-support';
import { fs } from 'appium-support';
chai.should();

let P = Promise;
const XCODE_VERSION = {
  versionString: '7.1.1',
  versionFloat: 7.1,
  major: 7,
  minor: 1,
  patch: 1
};

describe('instruments', () => {
  describe('quickInstrument', async () => {
    it('should create instruments', async () => {
      let opts = {
        app: '/a/b/c/my.app',
      };
      let instruments = await Instruments.quickInstruments(opts);
      instruments.app.should.equal(opts.app);
    });
  });
  describe('constructor', () => {
    it('should create instruments', () => {
      let opts = {
        app: '/a/b/c/my.app',
      };
      let instruments = new Instruments(opts);
      instruments.app.should.equal(opts.app);
    });
  });
  describe('configure', withMocks({xcode, utils}, (mocks) => {
    it('should work', async () => {
      let instruments = new Instruments({});
      mocks.xcode.expects('getVersion').once().returns(P.resolve(XCODE_VERSION));
      mocks.xcode.expects('getAutomationTraceTemplatePath').once().returns(P.resolve(
        '/a/b/c/d/tracetemplate'));
      mocks.utils.expects('getInstrumentsPath').once().returns(P.resolve(
        '/a/b/c/instrumentspath'));
      await instruments.configure();
      instruments.xcodeVersion.versionString.should.equal(XCODE_VERSION.versionString);
      instruments.template.should.equal('/a/b/c/d/tracetemplate');
      instruments.instrumentsPath.should.equal('/a/b/c/instrumentspath');
      verify(mocks);
    });
  }));
  describe('spawnInstruments', withMocks({fs, tp, utils}, (mocks) => {
    it('should work', async () => {
      let instruments = new Instruments({});
      instruments.xcodeVersion = XCODE_VERSION;
      instruments.template = '/a/b/c/d/tracetemplate';
      instruments.instrumentsPath = '/a/b/c/instrumentspath';
      mocks.fs.expects('exists').once().returns(P.resolve(false));
      mocks.tp.expects('spawn').once().returns({});
      mocks.utils.expects('getIwdPath').once().returns(Promise.resolve('/a/b/c/iwd'));
      await instruments.spawnInstruments();
      verify(mocks);
    });
  }));
});
