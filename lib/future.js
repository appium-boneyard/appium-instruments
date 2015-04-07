"use strict";

var nodeifyModule = require('appium-support').util.nodeifyModule,
    xcode = require('appium-xcode');

module.exports = {
  xcode: nodeifyModule(xcode)
};
