'use strict';

module.exports.asyncCbStub = function (success, delay) {
  return function (cb) {
    setTimeout(function () {
      if (success) cb(); else cb(new Error("Simulated crash"));
    }, delay);
  };
};
