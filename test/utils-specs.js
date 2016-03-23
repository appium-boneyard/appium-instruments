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
    it('should work for Xcode 7.3', async () => {
      let instrumentsOutput = `Known Devices:
INsaikrisv [C8476FF9-9BC4-5E52-AE3D-536A2E85D43B]
AppiumParallel1 (9.2) [0120C306-95C1-4196-BC13-4196105EBEF9]
Apple TV 1080p (9.1) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]
iPad 2 (8.4) [B45264A0-551C-41A5-A636-8211C05D8003] (Simulator)
iPad 2 (9.2) [4444EB1E-BA48-4DFA-B16C-777171FCF3BC] (Simulator)
iPad Air (8.4) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF] (Simulator)`;
      let devices = [
        'AppiumParallel1 (9.2) [0120C306-95C1-4196-BC13-4196105EBEF9]',
        'Apple TV 1080p (9.1) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]',
        'iPad 2 (8.4) [B45264A0-551C-41A5-A636-8211C05D8003] (Simulator)',
        'iPad 2 (9.2) [4444EB1E-BA48-4DFA-B16C-777171FCF3BC] (Simulator)',
        'iPad Air (8.4) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF] (Simulator)'
      ];
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: instrumentsOutput, stderr:'' }));
        (await utils.getAvailableDevices()).should.deep.equal(devices);
        verify(mocks);
    });
    it('should work for Xcode 7.0-7.2', async () => {
      let instrumentsOutput = `Known Devices:
INsaikrisv [C8476FF9-9BC4-5E52-AE3D-536A2E85D43B]
AppiumParallel1 (9.2) [0120C306-95C1-4196-BC13-4196105EBEF9]
Apple TV 1080p (9.1) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]
iPad 2 (8.4) [B45264A0-551C-41A5-A636-8211C05D8003]
iPad 2 (9.2) [4444EB1E-BA48-4DFA-B16C-777171FCF3BC]
iPad Air (8.4) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF]`;
      let devices = [
        'AppiumParallel1 (9.2) [0120C306-95C1-4196-BC13-4196105EBEF9]',
        'Apple TV 1080p (9.1) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]',
        'iPad 2 (8.4) [B45264A0-551C-41A5-A636-8211C05D8003]',
        'iPad 2 (9.2) [4444EB1E-BA48-4DFA-B16C-777171FCF3BC]',
        'iPad Air (8.4) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF]'
      ];
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: instrumentsOutput, stderr:'' }));
        (await utils.getAvailableDevices()).should.deep.equal(devices);
        verify(mocks);
    });
    it('should work for Xcode 6', async () => {
      let instrumentsOutput = `Known Devices:
INsaikrisv [C8476FF9-9BC4-5E52-AE3D-536A2E85D43B]
AppiumParallel1 (8.4 Simulator) [0120C306-95C1-4196-BC13-4196105EBEF9]
Apple TV 1080p (8.4 Simulator) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]
iPad 2 (8.4 Simulator) [B45264A0-551C-41A5-A636-8211C05D8003]
iPad Air (8.2 Simulator) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF]`;
      let devices = [
        'AppiumParallel1 (8.4 Simulator) [0120C306-95C1-4196-BC13-4196105EBEF9]',
        'Apple TV 1080p (8.4 Simulator) [C5957108-6BA4-4A98-9A83-4BED47EFF1BC]',
        'iPad 2 (8.4 Simulator) [B45264A0-551C-41A5-A636-8211C05D8003]',
        'iPad Air (8.2 Simulator) [F26279E7-8BAF-4D7B-ABFE-08D1AC364DCF]'
      ];
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: '/a/b/c/d\n', stderr:'' }));
      mocks.tp
        .expects('exec')
        .once()
        .returns(Promise.resolve({stdout: instrumentsOutput, stderr:'' }));
        (await utils.getAvailableDevices()).should.deep.equal(devices);
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
