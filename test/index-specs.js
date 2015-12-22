// transpile:mocha

import { Instruments, utils } from '..';
import chai from 'chai';


chai.should();

describe('index', () => {
  it('exported objects should exist', () => {
    Instruments.should.exist;
    utils.should.exist;
  });
});

