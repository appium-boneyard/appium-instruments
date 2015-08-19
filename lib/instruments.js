// Wrapper around Apple's Instruments app
'use strict';

import 'colors';

import { spawn } from 'teen_process';
import log from './logger';
import _ from 'lodash';
import { through } from 'through';
import path from 'path';
import { rimraf, fs, cancellableDelay } from 'appium-support';
import xcode from 'appium-xcode';
import B from 'bluebird';
import { mkdirp, getXcodeTraceTemplatePath, killAllSimulators, killAllInstruments,
  getInstrumentsPath, parseLaunchTimeout, getIwdPath } from './utils';
import EventEmitter from 'events';
import { outputStream, errorStream, webSocketAlertStream, dumpStream } from './streams';

const ERR_NEVER_CHECKED_IN = "Instruments never checked in";
const ERR_CRASHED_ON_STARTUP = "Instruments crashed on startup";

class Instruments extends EventEmitter {
  // simpler constructor
  static async quickInstruments (opts) {
    opts = _.clone(opts);
    let xcodeTraceTemplatePath = await getXcodeTraceTemplatePath();
    _.defaults(opts, {
          launchTimeout: 60000,
          template: xcodeTraceTemplatePath,
          withoutDelay: true,
          xcodeVersion: '8.1',
          webSocket: null,
          flakeyRetries: 2
    });
    return new Instruments(opts);
  }

  constructor (opts) {
    super();

    opts = _.cloneDeep(opts);
    _.defaults(opts, {
      termTimeout: 3000,
      tmpDir: '/tmp/appium-instruments',
      launchTimeout: 90000,
      flakeyRetries: 0
    });

    // config
    for (let f of ['app', 'termTimeout', 'flakeyRetries', 'udid', 'bootstrap', 'template', 'withoutDelay',
                   'processArguments', 'simulatorSdkAndDevice', 'tmpDir', 'traceDir']) {
      this[f] = opts[f];
    }
    this.traceDir = this.traceDir || this.tmpDir;
    this.launchTimeout = parseLaunchTimeout(opts.launchTimeout);

    // state
    this.proc = null;
    this.webSocket = opts.webSocket;
    this.instrumentsPath = opts.instrumentsPath;
    this.launchTries = 0;
    this.socketConnectDelays = [];
    this.gotFBSOpenApplicationError = false;
  }

  async configure() {
    if (!this.xcodeVersion) {
      this.xcodeVersion = await xcode.getVersion();
    }
    if (this.xcodeVersion.slice(0, 3) === '6.0' && this.withoutDelay) {
      log.info("On xcode 6.0, instruments-without-delay does " +
                  "not work. If using appium, you can disable instruments-without-delay " +
                  "with the --native-instruments-lib server flag");
    }
    if (this.xcodeVersion === "5.0.1") {
      throw new Error("Xcode 5.0.1 ships with a broken version of " +
        "Instruments. please upgrade to 5.0.2");
    }

    if (!this.template) {
      this.template = await xcode.getAutomationTraceTemplatePath();
    }

    if (!this.instrumentsPath) {
      this.instrumentsPath = await getInstrumentsPath();
    }
  }

  // removed launchAndKill, we should be able to do that using launch
  // or at least calling launch with some params.

  async launchOnce () {
    log.info("Launching instruments");
    // prepare temp dir
    await rimraf(this.tmpDir);
    await mkdirp(this.tmpDir);
    await mkdirp(this.traceDir);

    this.exitListener = null;
    this.launchResultDeferred = null;
    this.proc = await this.spawnInstruments();
    this.proc.on('exit', (code) => {
      log.debug(`Instruments exited with code ${code}`);
    });

    let launchResultPromise = new B((resolve, reject) => {
      this.launchResultDeferred = {
        resolve: () => { resolve(); },
        reject: (err) => { reject(err); }
      };
    });

    // There was a special case for ignoreStartupExit
    // but it is not needed anymore, you may just listen for exit.
    this.setExitListener(() => {
      this.launchResultDeferred.reject(new Error(ERR_CRASHED_ON_STARTUP));
    });

    this.proc.on("error", (err) => {
      log.debug("Error with instruments proc: " + err.message);
      if (err.message.indexOf("ENOENT") !== -1) {
        this.proc = null; // otherwise we'll try to send sigkill
        log.error("Unable to spawn instruments: " + err.message);
        this.launchResultDeferred.reject(err);
      }
    });

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.pipe(outputStream()).pipe(dumpStream());

    this.proc.stderr.setEncoding('utf8');
    let actOnStderr = (output) => {
      if (this.launchTimeout.afterSimLaunch && output && output.match(/CLTilesManagerClient: initialize/)) {
        this.addSocketConnectTimer(this.launchTimeout.afterSimLaunch, 'afterLaunch', async () => {
          await killAllInstruments();
        });
      }

      let fbsErrStr = "(FBSOpenApplicationErrorDomain error 8.)";
      if (output.indexOf(fbsErrStr) !== -1) {
        this.gotFBSOpenApplicationError = true;
      }
    };
    this.proc.stderr.pipe(through(function (output) {
      actOnStderr(output);
      this.queue(output);
    })).pipe(errorStream())
    .pipe(webSocketAlertStream(this.webSocket))
    .pipe(dumpStream());

    // start waiting for instruments to launch successfully
    this.addSocketConnectTimer(this.launchTimeout.global, 'global', async () => {
      await killAllInstruments();
    });

    try {
      await launchResultPromise;
    } finally {
      this.clearSocketConnectTimers();
    }
    this.setExitListener((code) => {
      this.proc = null;
      this.emit('exit', code);
    });
  }

  async launch () {
    await this.configure();
    let launchTries = 0;
    do {
      if (launchTries > 0) {
        log.debug("Attempting to retry launching instruments, this is " +
                    "retry #" + launchTries);
      }
      try {
        launchTries ++;
        await this.launchOnce();
        break;
      } catch (err) {
        log.debug(err.message);
        let errIsCatchable = err.message === ERR_NEVER_CHECKED_IN ||
                             err.message === ERR_CRASHED_ON_STARTUP;
        if(errIsCatchable) {
          if(launchTries < (this.flakeyRetries + 1)) {
            if (this.gotFBSOpenApplicationError) {
              log.debug("Got the FBSOpenApplicationError, not killing the " +
                           "sim but leaving it open so the app will launch");
              this.gotFBSOpenApplicationError = false; // clear out for next launch
              await B.delay(1000);
            } else {
              killAllSimulators();
              await B.delay(5000);
            }
          } else {
            log.debug("We exceeded the number of retries allowed for " +
                         "instruments to successfully start; failing launch");
            throw err;
          }
        } else {
          throw err;
        }
      }
    } while (true);
  }

  registerLaunch () {
    this.launchResultDeferred.resolve();
  }

  async spawnInstruments () {
    let traceDir;
    for (var i = 0; ; i++) {
      // loop while there are tracedirs to delete
      traceDir = path.resolve(this.traceDir, 'instrumentscli' + i + '.trace');
      if (!await fs.exists(traceDir)) break;
    }
    let args = ["-t", this.template, "-D", traceDir];
    if (this.udid) {
      args = args.concat(["-w", this.udid]);
      log.debug("Attempting to run app on real device with UDID " + this.udid);
    }
    if (!this.udid && this.simulatorSdkAndDevice) {
      args = args.concat(["-w", this.simulatorSdkAndDevice]);
      log.debug("Attempting to run app on " + this.simulatorSdkAndDevice);
    }
    args = args.concat([this.app]);
    if (this.processArguments) {
      args = args.concat(this.processArguments);
      log.debug("Attempting to run app with process arguments: " + this.processArguments);
    }
    args = args.concat(["-e", "UIASCRIPT", this.bootstrap]);
    args = args.concat(["-e", "UIARESULTSPATH", this.tmpDir]);
    let env = _.clone(process.env);
    let iwdPath = await getIwdPath(this.xcodeVersion);
    env.CA_DEBUG_TRANSACTIONS = 1;
    if (this.withoutDelay && !this.udid) {
      env.DYLD_INSERT_LIBRARIES = path.resolve(iwdPath, "InstrumentsShim.dylib");
      env.LIB_PATH = iwdPath;
    }
    let instrumentsExecArgs = [this.instrumentsPath].concat(_.clone(args));
    instrumentsExecArgs = _.map(instrumentsExecArgs, function (arg) {
      if (arg === null) {
        throw new Error("A null value was passed as an arg to execute " +
                         "instruments on the command line. A letiable is " +
                         "probably not getting set. Array of command args: " +
                         JSON.stringify(instrumentsExecArgs));
      }
      if (typeof arg === 'string' && arg.indexOf(" ") !== -1) {
        return '"' + arg + '"';
      }
      return arg;
    });
    log.debug("Spawning instruments with command: " + instrumentsExecArgs.join(" "));
    log.debug("And extra without-delay env: " + JSON.stringify({
      DYLD_INSERT_LIBRARIES: env.DYLD_INSERT_LIBRARIES,
      LIB_PATH: env.LIB_PATH
    }));
    log.debug("And launch timeouts (in ms): " + JSON.stringify(this.launchTimeout));
    return spawn(this.instrumentsPath, args, {env: env});
  }

  addSocketConnectTimer(delay, type, doAction) {
    let socketConnectDelay = cancellableDelay(delay);
    socketConnectDelay.then(() => {
      log.warn(`Instruments socket client never checked in; timing out (${type})`);
      this.setExitListener(() => {
        this.launchResultDeferred.reject(new Error(ERR_NEVER_CHECKED_IN));
      });
      return doAction();
    }).catch(B.CancellationError, () => {}).done();
    this.socketConnectDelays.push(socketConnectDelay);
  }

  clearSocketConnectTimers() {
    _(this.socketConnectDelays).each(function (d) {
      d.cancel();
    }, this).value();
    this.socketConnectDelays = [];
  }

  setExitListener(exitListener) {
    if (!this.proc) return;
    if (this.exitListener) {
      this.proc.removeListener('exit', this.exitListener);
    }
    this.exitListener = exitListener;
    this.proc.on('exit', exitListener);
  }

  /* PROCESS MANAGEMENT */
  async shutdown () {
    // monitoring process termination
    let termDelay = cancellableDelay(this.termTimeout);
    let termPromise = termDelay.catch(B.CancellationError, () => {
    });

    let wasTerminated = false;
    this.setExitListener(() => {
      wasTerminated = true;
      termDelay.cancel();
      this.proc = null;
    });

    // terminating process
    log.debug("Sending sigterm to instruments");
    if (this.proc) {
      this.proc.kill('SIGTERM');
    }
    await termPromise;
    if(!wasTerminated) {
      throw new Error("Instruments did not terminate after " + (this.termTimeout / 1000) +
        " seconds!");
    }
    // removed the kill all instruments/global shutdown logic, out of scope.
    // if someone want to kill all instruments, let it do it separately
  }

}

export default Instruments;
