'use strict';

var winston = require('winston'),
    _ = require('underscore');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ level : 'info' })
  ]
});

var loggerWrap = {
  init:  function (_logger) {
    logger = _logger;
  },
};

_(['info','debug','warn','error']).each(function (level) {
  loggerWrap[level] = function () {
    var args = Array.prototype.slice.call(arguments, 0);
    logger[level].apply(logger, args);
  };
});

loggerWrap.setConsoleLevel = function (level) {
  logger.transports.console.level  = level;
};

loggerWrap.instance = function () {
  return logger;
};

module.exports = loggerWrap;
