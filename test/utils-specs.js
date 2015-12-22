// transpile:mocha

import { utils, Instruments } from '..';
import * as tp from 'teen_process';
import xcode from 'appium-xcode';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks, verify, stubEnv } from 'appium-test-support';
import { fs } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

describe('utils', () => {
  describe('getInstrumentsPath', withMocks({tp}, (mocks) => {
    it('should retrieve path', async () => {
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      (await utils.getInstrumentsPath()).should.equal('/a/b/c/d');
      verify(mocks);
    });
    it('should throw an error if cannnot find Instruments', async () => {
      mocks.tp
        .expects('exec')
        .once()
        .throws(new Error('Instruments not found'));
      await utils.getInstrumentsPath().should.be.rejectedWith(/Could not find the instruments binary/);
      verify(mocks);
    });
  }));
  describe('getAvailableDevices', withMocks({tp}, (mocks) => {
    it('should work', async () => {
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: 'iphone1\niphone2\niphone3', stderr:'' }));
      (await utils.getAvailableDevices()).should.deep.equal(
        ['iphone1', 'iphone2', 'iphone3']);
      verify(mocks);
    });
    it('should throw an error when Instruments fails', async () => {
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp
        .expects('exec')
        .once()
        .throws(new Error('Instruments failed'));
      await utils.getAvailableDevices().should.be.rejectedWith(/Failed getting devices, err: Error: Instruments failed./);
      verify(mocks);
    });
  }));
  describe('killAllInstruments', withMocks({tp}, (mocks) => {
    it('should work', async () => {
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '', stderr:'' }));
      await utils.killAllInstruments();
      verify(mocks);
    });
  }));
  describe('cleanAllTraces', withMocks({fs}, (mocks) => {
    stubEnv();
    it('should work', async () => {
      process.env.CLEAN_TRACES = 1;
      mocks.fs
        .expects('rimraf')
        .once()
        .returns(Promise.resolve({stdout: '', stderr:'' }));
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
    it('should work with invalid JSON', () => {
      utils.parseLaunchTimeout('x').should.equal('x');
    });
  });
  describe('getIwdPath', withMocks({fs}, (mocks) => {
    it('should work when path is found', async () => {
      mocks.fs
        .expects('exists')
        .once()
        .returns(Promise.resolve(true));
      (await utils.getIwdPath('10')).should.match(
        /.*thirdparty\/iwd10/);
      verify(mocks);
    });
    it('should work when path is not found', async () => {
      mocks.fs
        .expects('exists')
        .once()
        .returns(Promise.resolve(false));
      (await utils.getIwdPath('10')).should.match(
        /.*thirdparty\/iwd/);
      verify(mocks);
    });
  }));

  describe('quickLaunch', withMocks({fs, tp}, (mocks) => {
    it('should remove trace directory', async () => {
      mocks.fs
        .expects('rimraf')
        .once()
        .returns(Promise.resolve());
      mocks.tp
        .expects('exec')
        .once()
        .withArgs('xcrun')
        .returns(Promise.resolve({stdout: '', stderr:'' }));
      await utils.quickLaunch();
      verify(mocks);
    });
  }));

  describe('quickInstruments', withMocks({xcode}, (mocks) => {
    it('should create an Instruments object', async () => {
      let inst = await utils.quickInstruments({
        xcodeTraceTemplatePath: '/some/path'
      });
      inst.should.be.an.instanceof(Instruments);
    });

    it('should get xcode trace template if none supplied', async () => {
      mocks.xcode
        .expects('getAutomationTraceTemplatePath')
        .once()
        .returns(Promise.resolve('/some/path'));
      let inst = await utils.quickInstruments();
      inst.template.should.equal('/some/path');
    });
  }));
});
