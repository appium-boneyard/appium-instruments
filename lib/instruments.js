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
    async = require('async'),
    mkdirp = require('mkdirp'),
    xcode = require('./future.js').xcode,
    fs = require('fs');

var ERR_NEVER_CHECKED_IN = "Instruments never checked in",
    ERR_CRASHED_ON_STARTUP = "Instruments crashed on startup";

var INST_STALL_TIMEOUT = 12000;

var Instruments = function (opts) {
  this.app = opts.app;

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
  this.bootstrap = opts.bootstrap;
  this.template = opts.template;
  this.withoutDelay = opts.withoutDelay;
  this.webSocket = opts.webSocket;
  this.resultHandler = this.defaultResultHandler;
  this.exitHandler = this.defaultExitHandler;
  this.socketConnectTimeouts = [];
  this.proc = null;
  this.shutdownCb = null;
  this.didLaunch = false;
  this.debugMode = false;
  this.guid = uuid.create();
  this.instrumentsPath = opts.instrumentsPath;
  this.processArguments = opts.processArguments;
  this.simulatorSdkAndDevice = opts.simulatorSdkAndDevice;
  this.tmpDir = opts.tmpDir || '/tmp/appium-instruments';
  this.traceDir = opts.traceDir || this.tmpDir;
  this.gotFBSOpenApplicationError = false;
};

Instruments.killAllSim = function () {
  xcode.getVersion(function (err, version) {
    // this is contrary to our usual pattern, but if getting the xcode version
    // fails, we couldn't have started simulators anyways/
    if (err) return;
    if (version >= "7") {
      logger.debug("Killall Simulator");
      exec('pkill -9 -f "Simulator"');
    } else if (version >= "6") {
      logger.debug("Killall iOS Simulator");
      exec('pkill -9 -f "iOS Simulator"');
    } else {
      logger.debug("Killall iPhoneSimulator");
      exec('pkill -9 -f iPhoneSimulator');
    }
  });
};

Instruments.killAll = function () {
  logger.debug("Killall instruments");
  exec('pkill -9 instruments');
};

Instruments.getAvailableDevicesWithRetry = function (times, cb) {
  async.retry(times, Instruments.getAvailableDevices, cb);
};

Instruments.getAvailableDevices = function (cb) {
  logger.debug("Getting list of devices instruments supports");
  Instruments.prototype.getInstrumentsPath.call({}, function (err, instrumentsPath) {
    if (err) return cb(err);
    var opts = {timeout: INST_STALL_TIMEOUT};
    exec("'" + instrumentsPath + "' -s devices", opts, function (err, stdout, stderr) {
      if (err) {
        var msg = "Failed getting devices. Err: " + err + ". Stdout: " +
                  stdout + ". Stderr: " + stderr + ".";
        logger.error(msg);
        return cb(new Error(msg));
      }
      var devices = [];
      _.each(stdout.split("\n"), function (line) {
        if (/^i.+$/.test(line)) {
          devices.push(line);
        }
      });
      cb(null, devices);
    });
  });
};

Instruments.prototype.getInstrumentsPath = function (cb) {
  if (this.instrumentsPath) { return cb(null, this.instrumentsPath); }

  exec('xcrun -find instruments', function (err, stdout) {
    if (typeof stdout === "undefined") stdout = "";
    var instrumentsPath = stdout.trim();
    if (err || !instrumentsPath) {
      logger.error("Could not find instruments binary");
      if (err) logger.error(err.message);
      return cb(new Error("Could not find the instruments " +
          "binary. Please ensure `xcrun -find instruments` can locate it."));
    }
    logger.debug("Instruments is at: " + instrumentsPath);
    cb(null, instrumentsPath);
  });
};

/* INITIALIZATION */

Instruments.prototype.start = function (cb, unexpectedExitCb) {
  cb = cb || function () {};
  this.postLaunchHandler = cb;
  unexpectedExitCb = unexpectedExitCb || function () {};
  if (this.didLaunch) {
    return cb(new Error("Called start() but we already launched"));
  }
  this.exitHandler = unexpectedExitCb;

  this.configure(function (err) {
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
  this.getInstrumentsPath(function (err, instrumentsPath) {
    if (err) return cb(err);
    this.instrumentsPath = instrumentsPath;
    cb();
  }.bind(this));
};

Instruments.prototype.setXcodeVersion = function (cb) {
  xcode.getVersion(function (err, version) {
    if (err) return cb(err);
    this.xcodeVersion = version;

    if (this.xcodeVersion.slice(0, 3) === '6.0' && this.withoutDelay) {
      logger.info("On xcode 6.0, instruments-without-delay does " +
                  "not work. If using appium, you can disable instruments-without-delay " +
                  "with the --native-instruments-lib server flag");
    }

    if (this.xcodeVersion === "5.0.1") {
      return cb(new Error("Xcode 5.0.1 ships with a broken version of " +
                   "Instruments. please upgrade to 5.0.2"));
    }

    cb();
  }.bind(this));
};

Instruments.prototype.setTemplate = function (cb) {
  if (this.template) return cb();
  xcode.getAutomationTraceTemplatePath(function (err, path) {
    if (err) cb(err);
    this.template = path;
    cb();
  }.bind(this));
};

Instruments.prototype.configure = function (cb) {
  async.series([
    this.setXcodeVersion.bind(this),
    this.setTemplate.bind(this),
    this.setInstrumentsPath.bind(this)
  ], cb);
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
      Instruments.killAll();
      var errIsCatchable = err.message === ERR_NEVER_CHECKED_IN ||
                           err.message === ERR_CRASHED_ON_STARTUP;
      logger.debug(err.message);
      if (this.launchTries < this.flakeyRetries && errIsCatchable) {
        this.launchTries++;
        logger.debug("Attempting to retry launching instruments, this is " +
                    "retry #" + this.launchTries);
        var waitForLaunch = 5000;
        if (this.gotFBSOpenApplicationError) {
          logger.debug("Got the FBSOpenApplicationError, not killing the " +
                       "sim but leaving it open so the app will launch");
          waitForLaunch = 1000;
          this.gotFBSOpenApplicationError = false; // clear out for next launch
        } else {
          Instruments.killAllSim();
        }
        // waiting a bit before restart
        setTimeout(function () {
          this.launch(function (err) {
            if (err) return this.launchHandler(err);
          }.bind(this));
        }.bind(this), waitForLaunch);
      } else if (errIsCatchable) {
        logger.debug("We exceeded the number of retries allowed for " +
                     "instruments to successfully start; failing launch");
        this.postLaunchHandler(err);
      }
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
      Instruments.killAll();
    }.bind(this), this.termTimeout);
    this.proc.kill('SIGTERM');
  }
};

Instruments.prototype.onSocketNeverConnect = function (desc) {
  return function () {
    logger.warn("Instruments socket client never checked in; timing out (" + desc + ")");
    this.neverConnected = true;
    Instruments.killAll();
  }.bind(this);
};

// launch Instruments and kill it when the function passed in as the 'condition'
// param returns true.
Instruments.prototype.launchAndKill = function (condition, cb) {
  try {
    rimraf.sync(this.tmpDir);
    mkdirp.sync(this.tmpDir);
    mkdirp.sync(this.traceDir);
  } catch (err) {
    return cb(err);
  }
  cb = _.once(cb);
  var warnlevel = 10; // if we pass 10 attempts to kill but fail, log a warning
  logger.info("Launching instruments briefly then killing it");
  this.configure(function (err) {
    if (err) return cb(err);
    var diedTooYoung = this.spawnInstruments();
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
  try {
    rimraf.sync(this.tmpDir);
    mkdirp.sync(this.tmpDir);
    mkdirp.sync(this.traceDir);
  } catch (err) {
    return cb(err);
  }

  this.instrumentsExited = false;

  this.proc = this.spawnInstruments();
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

Instruments.prototype.spawnInstruments = function () {
  var traceDir;
  for (var i = 0; ; i++) {
    // loop while there are tracedirs to delete
    traceDir = path.resolve(this.traceDir, 'instrumentscli' + i + '.trace');
    if (!fs.existsSync(traceDir)) break;
  }
  var args = ["-t", this.template, "-D", traceDir];
  if (this.udid) {
    args = args.concat(["-w", this.udid]);
    logger.debug("Attempting to run app on real device with UDID " + this.udid);
  }
  if (!this.udid && this.simulatorSdkAndDevice) {
    args = args.concat(["-w", this.simulatorSdkAndDevice]);
    logger.debug("Attempting to run app on " + this.simulatorSdkAndDevice);
  }
  args = args.concat([this.app]);
  if (this.processArguments) {
    args = args.concat(this.processArguments);
    logger.debug("Attempting to run app with process arguments: " + this.processArguments);
  }
  args = args.concat(["-e", "UIASCRIPT", this.bootstrap]);
  args = args.concat(["-e", "UIARESULTSPATH", this.tmpDir]);
  var env = _.clone(process.env);
  var thirdpartyPath = path.resolve(__dirname, "../thirdparty");
  var xcodeVer = parseInt(this.xcodeVersion, 10);
  var iwdPath;
  if (xcodeVer === 4) {
    iwdPath = path.resolve(thirdpartyPath, "iwd4");
  } else if (xcodeVer === 5) {
    iwdPath = path.resolve(thirdpartyPath, "iwd5");
  } else if (xcodeVer === 6) {
    iwdPath = path.resolve(thirdpartyPath, "iwd6");
  } else if (xcodeVer === 7) {
    // iwd currently does not work with xcode7, setting withoutDelay to false
    logger.info("On xcode 7.0, instruments-without-delay does not work, skipping" +
                "instruments-without-delay");
    this.withoutDelay = false;
    iwdPath = path.resolve(thirdpartyPath, "iwd7");
   } else {
    iwdPath = path.resolve(thirdpartyPath, "iwd");
  }
  iwdPath = path.resolve(thirdpartyPath, iwdPath);
  env.CA_DEBUG_TRANSACTIONS = 1;
  if (this.withoutDelay && !this.udid) {
    env.DYLD_INSERT_LIBRARIES = path.resolve(iwdPath, "InstrumentsShim.dylib");
    env.LIB_PATH = iwdPath;
  }
  var instrumentsExecArgs = [this.instrumentsPath].concat(_.clone(args));
  instrumentsExecArgs = _.map(instrumentsExecArgs, function (arg) {
    if (arg === null) {
      throw new Error("A null value was passed as an arg to execute " +
                       "instruments on the command line. A variable is " +
                       "probably not getting set. Array of command args: " +
                       JSON.stringify(instrumentsExecArgs));
    }
    if (arg.indexOf(" ") !== -1) {
      return '"' + arg + '"';
    }
    return arg;
  });
  logger.debug("Spawning instruments with command: " + instrumentsExecArgs.join(" "));
  if (this.withoutDelay) {
    logger.debug("And extra without-delay env: " + JSON.stringify({
      DYLD_INSERT_LIBRARIES: env.DYLD_INSERT_LIBRARIES,
      LIB_PATH: env.LIB_PATH
    }));
  }
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
    this.postLaunchHandler();
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
  this.resultHandler(output);
};

Instruments.prototype.errorStreamHandler = function (output) {
  if (this.launchTimeout.afterSimLaunch && output && output.match(/CLTilesManagerClient: initialize/)) {
    this.socketConnectTimeouts.push(setTimeout(
      this.onSocketNeverConnect('afterLaunch'),
      this.launchTimeout.afterSimLaunch));
  }
  var fbsErrStr = "(FBSOpenApplicationErrorDomain error 8.)";
  if (output.indexOf(fbsErrStr) !== -1) {
    this.gotFBSOpenApplicationError = true;
  }
  output = output.replace(/\n$/m, "");
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

/* DEFAULT HANDLERS */

Instruments.prototype.setResultHandler = function (handler) {
  this.resultHandler = handler;
};

Instruments.prototype.defaultResultHandler = function (output) {
  // if we have multiple log lines, indent non-first ones
  if (output !== "") {
    output = output.replace(/\n$/m, "");
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
