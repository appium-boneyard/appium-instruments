// Wrapper around Apple's Instruments app
'use strict';

var spawn = require('child_process').spawn,
    through = require('through'),
    exec = require('child_process').exec,
    logger = require('./logger.js'),
    _ = require('underscore'),
    uuid = require('uuid-js'),
    path = require('path'),
    rimraf = require('rimraf'),
    mkdirp = require('mkdirp');

var ERR_NEVER_CHECKED_IN = "Instruments never checked in",
    ERR_CRASHED_ON_STARTUP = "Instruments crashed on startup";

var Instruments = function (opts) {
  this.app = opts.app;
  var quotePath = function (path) {
    if (!path) return path;
    return "\"" + path.replace(/^"|"$/g, '').replace(/"/g, '\\"') + "\"";
  };

  // number or object like { global: 40000, afterSimLaunch: 5000 }
  // may also parse JSON strings.
  if (typeof opts.launchTimeout === 'string') {
    try {
      opts.launchTimeout = JSON.parse(opts.launchTimeout);
    } catch (err) {
      logger.warn("Invalid launch timeout: " + opts.launchTimeout);
    }
  }
  this.launchTimeout = opts.launchTimeout || 90000;
  if (typeof this.launchTimeout === 'number') {
    this.launchTimeout = {
      global: this.launchTimeout
    };
  }

  this.termTimeout = 3000;
  this.killTimeout = 3000;
  this.termTimer = null;
  this.killTimer = null;
  this.flakeyRetries = opts.flakeyRetries;
  this.launchTries = 0;
  this.neverConnected = false;
  this.udid = opts.udid;
  if (typeof opts.isSafariLauncherApp !== "undefined") {
    logger.warn("The `isSafariLauncherApp` option is deprecated. Use the " +
                 "`ignoreStartupExit` option instead");
  }
  this.ignoreStartupExit = opts.ignoreStartupExit || opts.isSafariLauncherApp;
  this.bootstrap = quotePath(opts.bootstrap);
  this.template = quotePath(opts.template);
  this.withoutDelay = opts.withoutDelay;
  this.xcodeVersion = opts.xcodeVersion;
  this.webSocket = opts.webSocket;
  this.resultHandler = this.defaultResultHandler;
  this.exitHandler = this.defaultExitHandler;
  this.socketConnectTimeouts = [];
  this.traceDir = null;
  this.proc = null;
  this.shutdownCb = null;
  this.didLaunch = false;
  this.debugMode = false;
  this.guid = uuid.create();
  this.instrumentsPath = "";
  this.processArguments = opts.processArguments;
  this.simulatorSdkAndDevice = opts.simulatorSdkAndDevice;
};


/* INITIALIZATION */

Instruments.prototype.start = function (cb, unexpectedExitCb) {
  cb = cb || function () {};
  unexpectedExitCb = unexpectedExitCb || function () {};
  if (this.didLaunch) {
    return cb(new Error("Called start() but we already launched"));
  }
  this.exitHandler = unexpectedExitCb;

  this.setInstrumentsPath(function (err) {
    if (err) {
      logger.error(err.message);
      return cb(err);
    }
    this.launch(function (err) {
      if (err) return cb(err);
    }.bind(this));

  }.bind(this));
};

Instruments.prototype.setInstrumentsPath = function (cb) {
  exec('xcrun -find instruments', function (err, stdout) {
    if (typeof stdout === "undefined") stdout = "";
    this.instrumentsPath = stdout.trim();
    if (err || !this.instrumentsPath) {
      logger.error("Could not find instruments binary");
      if (err) logger.error(err.message);
      return cb(new Error("Could not find the instruments " +
          "binary. Please ensure `xcrun -find instruments` can locate it."));
    }
    logger.debug("Instruments is at: " + this.instrumentsPath);
    cb();
  }.bind(this));
};

Instruments.prototype.launchHandler = function (err) {
  if (!this.launchHandlerCalledBack) {
    _(this.socketConnectTimeouts).each(function (t) {
      clearTimeout(t);
    }, this);
    this.socketConnectTimeouts = [];
    if (!err) {
      this.didLaunch = true;
      this.neverConnected = false;
    } else {
      this.killProc();
      if (this.launchTries < this.flakeyRetries &&
          (err.message === ERR_NEVER_CHECKED_IN ||
           err.message === ERR_CRASHED_ON_STARTUP)) {
        this.launchTries++;
        logger.debug("Attempting to retry launching instruments, this is " +
                    "retry #" + this.launchTries);
        // waiting a bit before restart
        this.killIPhoneSim();
        setTimeout(function () {
          this.launch(function (err) {
            if (err) return this.launchHandler(err);
          }.bind(this));
        }.bind(this), 5000);
        return;
      }
      logger.debug(err.message);
    }
  } else {
    logger.debug("Trying to call back from instruments launch but we " +
                "already did");
  }
};

Instruments.prototype.termProc = function () {
  if (this.proc !== null) {
    logger.debug("Sending sigterm to instruments");
    this.termTimer = setTimeout(function () {
      logger.debug("Instruments didn't terminate after " + (this.termTimeout / 1000) +
                  " seconds; trying to kill it");
      this.killProc();
    }.bind(this), this.termTimeout);
    this.proc.kill('SIGTERM');
  }
};

Instruments.prototype.killProc = function () {
  logger.debug("Killall instruments");
  exec('pkill -9 -f instruments');
};

Instruments.prototype.killIPhoneSim = function () {
  logger.debug("Killall iPhoneSimulator");
  exec('pkill -9 -f iPhoneSimulator');
};

Instruments.prototype.onSocketNeverConnect = function (desc) {
  return function () {
    logger.warn("Instruments socket client never checked in; timing out (" + desc + ")");
    this.neverConnected = true;
    this.killProc();
  }.bind(this);
};

// launch Instruments and kill it when the function passed in as the 'condition'
// param returns true.
Instruments.prototype.launchAndKill = function (condition, cb) {
  cb = _.once(cb);
  var warnlevel = 10; // if we pass 10 attempts to kill but fail, log a warning
  logger.info("Launching instruments briefly then killing it");
  this.setInstrumentsPath(function (err) {
    if (err) return cb(err);
    var diedTooYoung = this.spawnInstruments("/tmp");
    diedTooYoung.on("error", function (err) {
      if (err.message.indexOf("ENOENT") !== -1) {
        cb(new Error("Unable to spawn instruments: " + err.message));
      }
    });

    var attempts = 0;
    var timelyCauseOfDeath = function () {
      attempts++;
      if (attempts > warnlevel && attempts < warnlevel + 3) {
        logger.warn("attempted to kill instruments " + attempts + " times. Could be stuck on the wait condition.");
      }

      logger.debug("Checking condition to see if we should kill instruments");
      if (condition()) {
        logger.debug("Condition passed, killing instruments and calling back");
        diedTooYoung.kill("SIGKILL");
        cb();
      } else {
        setTimeout(timelyCauseOfDeath, 700);
      }
    };

    process.nextTick(timelyCauseOfDeath);

  }.bind(this));
};

Instruments.prototype.launch = function (cb) {
  logger.info("Launching instruments");
  // prepare temp dir
  var tmpDir = "/tmp/appium-instruments";
  try {
    rimraf.sync(tmpDir);
    mkdirp.sync(tmpDir);
  } catch (err) {
    return cb(err);
  }

  this.instrumentsExited = false;

  this.proc = this.spawnInstruments(tmpDir);
  this.proc.on("error", function (err) {
    logger.error("Error with instruments proc: " + err.message);
    if (err.message.indexOf("ENOENT") !== -1) {
      this.proc = null; // otherwise we'll try to send sigkill
      if (!this.instrumentsExited) {
        this.instrumentsExited = true;
        cb(new Error("Unable to spawn instruments: " + err.message));
      }
    }
  }.bind(this));

  // start waiting for instruments to launch successfully
  this.socketConnectTimeouts.push(setTimeout(
        this.onSocketNeverConnect('global'),
        this.launchTimeout.global));

  this.proc.stdout.setEncoding('utf8');
  this.proc.stderr.setEncoding('utf8');
  this.proc.stdout.pipe(through(this.outputStreamHandler.bind(this)));
  this.proc.stderr.pipe(through(this.errorStreamHandler.bind(this)));
  this.proc.on('exit', function (code) {
    if (!this.instrumentsExited) {
      this.instrumentsExited = true;
      this.onInstrumentsExit(code);
    }
  }.bind(this));
};

Instruments.prototype.spawnInstruments = function (tmpDir) {
  var args = ["-t", this.template];
  if (this.udid) {
    args = args.concat(["-w", this.udid]);
    logger.debug("Attempting to run app on real device with UDID " + this.udid);
  }
  if (!this.udid && this.simulatorSdkAndDevice) {
    var simulatorSdkAndDevice = this.simulatorSdkAndDevice;
    if (simulatorSdkAndDevice && simulatorSdkAndDevice[0] === '=') {
      simulatorSdkAndDevice = simulatorSdkAndDevice.substring(1);
    } else {
      // bugfix: restoring the deviceString logic in 1.2.4 to avoid npm appium
      // 1.2 deviceString bug.
      if (simulatorSdkAndDevice === 'iPhone - Simulator - iOS 7.1')
        simulatorSdkAndDevice = 'iPhone Retina (4-inch 64-bit) - Simulator - iOS 7.1';
      if (simulatorSdkAndDevice === 'iPad - Simulator - iOS 7.1')
        simulatorSdkAndDevice = 'iPad Retina (64-bit) - Simulator - iOS 7.1';
    }
    if (simulatorSdkAndDevice !== this.simulatorSdkAndDevice)
      logger.debug("Instruments device was changed from:\"", this.simulatorSdkAndDevice, "\" to:\"",
        simulatorSdkAndDevice + "\"");

    args = args.concat(["-w", simulatorSdkAndDevice]);
    logger.debug("Attempting to run app on " + simulatorSdkAndDevice);
  }
  args = args.concat([this.app]);
  if (this.processArguments) {
    args = args.concat(this.processArguments);
    logger.debug("Attempting to run app with process arguments: " + this.processArguments);
  }
  args = args.concat(["-e", "UIASCRIPT", this.bootstrap]);
  args = args.concat(["-e", "UIARESULTSPATH", tmpDir]);
  var env = _.clone(process.env);
  var thirdpartyPath = path.resolve(__dirname, "../thirdparty");
  var isXcode4 = this.xcodeVersion !== null && this.xcodeVersion[0] === '4';
  var iwdPath = path.resolve(thirdpartyPath, isXcode4 ? "iwd4" : "iwd");
  env.CA_DEBUG_TRANSACTIONS = 1;
  if (this.withoutDelay && !this.udid) {
    env.DYLD_INSERT_LIBRARIES = path.resolve(iwdPath, "InstrumentsShim.dylib");
    env.LIB_PATH = iwdPath;
  }
  logger.debug("Spawning instruments with command: " + this.instrumentsPath +
              " " + args.join(" "));
  logger.debug("And extra without-delay env: " + JSON.stringify({
    DYLD_INSERT_LIBRARIES: env.DYLD_INSERT_LIBRARIES,
    LIB_PATH: env.LIB_PATH
  }));
  logger.debug("And launch timeouts (in ms): " + JSON.stringify(this.launchTimeout));
  return spawn(this.instrumentsPath, args, {env: env});
};

Instruments.prototype.onInstrumentsExit = function (code) {
  if (this.termTimer) {
    clearTimeout(this.termTimer);
  }
  if (this.killTimer) {
    clearTimeout(this.killTimer);
  }

  this.debug("Instruments exited with code " + code);

  if (this.neverConnected) {
    this.neverConnected = false; // reset so we can catch this again
    return this.launchHandler(new Error(ERR_NEVER_CHECKED_IN));
  }

  if (!this.didLaunch && !this.ignoreStartupExit) {
    return this.launchHandler(new Error(ERR_CRASHED_ON_STARTUP));
  }

  this.cleanupInstruments();

  if (this.ignoreStartupExit) {
    logger.debug("Not worrying about instruments exit since we're using " +
                "SafariLauncher");
    this.launchHandler();
  } else if (this.shutdownCb !== null) {
    this.shutdownCb();
    this.shutdownCb = null;
  } else {
    this.exitHandler(code, this.traceDir);
  }

};

Instruments.prototype.cleanupInstruments = function () {
  logger.debug("Cleaning up after instruments exit");
  this.proc = null;
};

Instruments.prototype.getAvailableDevices = function (cb) {
  logger.debug("Getting list of devices instruments supports");
  this.setInstrumentsPath(function (err) {
    if (err) return cb(err);
    exec(this.instrumentsPath + " -s devices", function (err, stdout) {
      if (err) return cb(err);
      var devices = [];
      _.each(stdout.split("\n"), function (line) {
        if (/^i.+$/.test(line)) {
          devices.push(line);
        }
      });
      cb(null, devices);
    });
  }.bind(this));
};

/* PROCESS MANAGEMENT */

Instruments.prototype.shutdown = function (cb) {
  var wasShutDown = false;
  var shutdownTimeout;
  function wrap(err) {
    wasShutDown = true;
    clearTimeout(shutdownTimeout);
    cb(err);
  }
  shutdownTimeout = setTimeout(function () {
    if (!wasShutDown) {
      cb("Didn't not shutdown within 5 seconds, maybe process did not start or was already dead.");
    }
  }, 5000);
  this.shutdownCb = wrap;
  this.termProc();
};

Instruments.prototype.doExit = function () {
  logger.info("Calling exit handler");
};


/* INSTRUMENTS STREAM MANIPULATION*/

Instruments.prototype.clearBufferChars = function (output) {
  // Instruments output is buffered, so for each log output we also output
  // a stream of very many ****. This function strips those out so all we
  // get is the log output we care about
  var re = /(\n|^)\*+\n?/g;
  output = output.toString();
  output = output.replace(re, "");
  return output;
};

Instruments.prototype.outputStreamHandler = function (output) {
  output = this.clearBufferChars(output);
  this.lookForShutdownInfo(output);
  this.resultHandler(output);
};

Instruments.prototype.errorStreamHandler = function (output) {
  if (this.launchTimeout.afterSimLaunch && output && output.match(/CLTilesManagerClient: initialize/)) {
    this.socketConnectTimeouts.push(setTimeout(
      this.onSocketNeverConnect('afterLaunch'),
      this.launchTimeout.afterSimLaunch));
  }
  var logMsg = ("[INST STDERR] " + output);
  logMsg = logMsg.yellow;
  logger.debug(logMsg);
  if (this.webSocket) {
    var re = /Call to onAlert returned 'YES'/;
    var match = re.test(output);
    if (match) {
      logger.debug("Emiting alert message...");
      this.webSocket.sockets.emit('alert', {message: output});
    }
  }
};

Instruments.prototype.lookForShutdownInfo = function (output) {
  var re = /Instruments Trace Complete.+Output : ([^\)]+)\)/;
  var match = re.exec(output);
  if (match) {
    this.traceDir = match[1];
  }
};


/* DEFAULT HANDLERS */

Instruments.prototype.setResultHandler = function (handler) {
  this.resultHandler = handler;
};

Instruments.prototype.defaultResultHandler = function (output) {
  // if we have multiple log lines, indent non-first ones
  if (output !== "") {
    output = output.replace(/\n/m, "\n       ");
    output = "[INST] " + output;
    output = output.green;
    logger.debug(output);
  }
};

Instruments.prototype.defaultExitHandler = function (code, traceDir) {
  logger.debug("Instruments exited with code " + code + " and trace dir " + traceDir);
};


/* MISC */

Instruments.prototype.setDebug = function (debug) {
  if (typeof debug === "undefined") {
    debug = true;
  }
  this.debugMode = debug;
};

Instruments.prototype.debug = function (msg) {
  var log = "[INSTSERVER] " + msg;
  log = log.grey;
  logger.debug(log);
};

module.exports = Instruments;
