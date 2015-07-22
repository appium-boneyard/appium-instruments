// transpile:mocha

import { utils } from '..';
import * as tp from 'teen_process';
import chai from 'chai';
import 'mochawait';
import { withMocks, verify }from 'appium-test-support';
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
    it.only('should retrieve .xrplugin path', async () => {
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
});
