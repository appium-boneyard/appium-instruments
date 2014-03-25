'use strict';

var chai = require('chai'),
    sinon = require('sinon'),
    sinonChai = require("sinon-chai");

var should = chai.should();


chai.use(sinonChai);

module.exports = {
  should: should,
  sinon: sinon
};

