'use strict';

var base = require('./base'),
    should = base.should,
    Instruments = require('../../lib/main').Instruments;

describe('Parsing smart timeouts', function () {

  it('should work when passing timeout as an integer', function (done) {
    var instruments = new Instruments({launchTimeout: 123456});
    instruments.launchTimeout.global.should.equal(123456);
    should.not.exist(instruments.launchTimeout.afterSimLaunch);
    done();
  });

  it('should work when passing timeout as an integer string', function (done) {
    var instruments = new Instruments({launchTimeout: "123456"});
    instruments.launchTimeout.global.should.equal(123456);
    should.not.exist(instruments.launchTimeout.afterSimLaunch);
    done();
  });

  it('should work when passing timeout as an object', function (done) {
    var instruments = new Instruments({launchTimeout: {global: 123456, afterSimLaunch: 234}});
    instruments.launchTimeout.global.should.equal(123456);
    instruments.launchTimeout.afterSimLaunch.should.equal(234);
    done();
  });

  it('should work when passing timeout as a JSON object', function (done) {
    var instruments = new Instruments({launchTimeout: '{"global": 123456, "afterSimLaunch": 234}'});
    instruments.launchTimeout.global.should.equal(123456);
    instruments.launchTimeout.afterSimLaunch.should.equal(234);
    done();
  });

});


