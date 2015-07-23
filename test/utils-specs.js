// transpile:mocha

import { utils } from '..';
import * as tp from 'teen_process';
import chai from 'chai';
import 'mochawait';
import { withMocks, verify, stubEnv }from 'appium-test-support';
import { fs } from 'appium-support';
chai.should();

let P = Promise;

describe('utils', () => {
  describe('getXcodeTraceTemplatePath', withMocks({tp, fs}, (mocks) => {
    it('should retrieve .bundle path', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.fs.expects('open').once().returns(P.resolve({}));
      mocks.fs.expects('close').once().returns(P.resolve());
      (await utils.getXcodeTraceTemplatePath()).should.equal(
        '/a/b/Contents/Applications/Instruments.app/Contents/PlugIns/' +
        'AutomationInstrument.bundle/Contents/Resources/' +
        'Automation.tracetemplate');
      verify(mocks);
    });
    it('should retrieve .xrplugin path', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.fs.expects('open').once().returns(P.reject(new Error('ouch!')));
      mocks.fs.expects('open').once().returns(P.resolve({}));
      mocks.fs.expects('close').once().returns(P.resolve());
      (await utils.getXcodeTraceTemplatePath()).should.equal(
        '/a/b/Contents/Applications/Instruments.app/Contents/PlugIns/' +
        'AutomationInstrument.xrplugin/Contents/Resources/' +
        'Automation.tracetemplate');
      verify(mocks);
    });
  }));
  describe('getInstrumentsPath', withMocks({tp}, (mocks) => {
    it('should retrieve path', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '/a/b/c/d\n', stderr:'' }));
      (await utils.getInstrumentsPath()).should.equal('/a/b/c/d');
      verify(mocks);
    });
  }));
  describe('getAvailableDevices', withMocks({tp}, (mocks) => {
    it('should work', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: 'iphone1\niphone2\niphone3', stderr:'' }));
      (await utils.getAvailableDevices()).should.deep.equal(
        ['iphone1', 'iphone2', 'iphone3']);
      verify(mocks);
    });
  }));
  describe('killAllSimulators', withMocks({tp}, (mocks) => {
    it('should work', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '', stderr:'' }));
      await utils.killAllSimulators();
      verify(mocks);
    });
  }));
  describe('killAllInstruments', withMocks({tp}, (mocks) => {
    it('should work', async () => {
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '', stderr:'' }));
      await utils.killAllInstruments();
      verify(mocks);
    });
  }));
  describe('cleanAllTraces', withMocks({tp}, (mocks) => {
    stubEnv();
    it('should work', async () => {
      process.env.CLEAN_TRACES = 1;
      mocks.tp.expects('exec').once().returns(P.resolve(
        {stdout: '', stderr:'' }));
      await utils.cleanAllTraces();
      verify(mocks);
    });
  }));
  describe('parseLaunchTimeout', () => {
    stubEnv();
    it('should work', () => {
      utils.parseLaunchTimeout(90000).should.deep.equal({
        global: 90000 });
      utils.parseLaunchTimeout('90000').should.deep.equal({
        global: 90000 });
      utils.parseLaunchTimeout({global: 90000, afterLaunch: 30000}).should.deep.equal({
        global: 90000, afterLaunch: 30000 });
      utils.parseLaunchTimeout('{"global": 90000, "afterLaunch": 30000}').should.deep.equal({
        global: 90000, afterLaunch: 30000 });
    });
  });
  describe('getIwdPath', withMocks({fs}, (mocks) => {
    it('should work when path is found', async () => {
      mocks.fs.expects('exists').once().returns(P.resolve(true));
      (await utils.getIwdPath('10.10.10')).should.equal(
        '/Users/baba/Work/appium-instruments/thirdparty/iwd10');
      verify(mocks);
    });
    it.only('should work when path is not found', async () => {
      mocks.fs.expects('exists').once().returns(P.resolve(false));
      (await utils.getIwdPath('10.10.10')).should.equal(
        '/Users/baba/Work/appium-instruments/thirdparty/iwd');
      verify(mocks);
    });
  }));
});
