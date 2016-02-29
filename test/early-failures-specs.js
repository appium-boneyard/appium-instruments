// transpile:mocha

import { Instruments } from '..';
import * as utils from '../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { withSandbox } from 'appium-test-support';


chai.should();
chai.use(chaiAsPromised);

describe('Early failures', withSandbox({}, (S) => {
  it('should error on getInstrumentsPath failure', async () => {
    let instruments = new Instruments({});
    S.sandbox.stub(utils, 'getInstrumentsPath').returns(Promise.reject(new Error('ouch!')));
    let onExitSpy = sinon.spy();
    instruments.onShutdown.then(onExitSpy, onExitSpy).done();
    await instruments.launch().should.be.rejectedWith(/ouch!/);
    onExitSpy.should.not.have.been.called;
  });
}));
