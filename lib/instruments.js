// Wrapper around Apple's Instruments app

import { spawn } from 'teen_process';
import log from './logger';
import _ from 'lodash';
import { through } from 'through';
import path from 'path';
import { mkdirp, fs, cancellableDelay } from 'appium-support';
import xcode from 'appium-xcode';
import B from 'bluebird';
import { killAllSimulators } from 'appium-ios-simulator';
import { killAllInstruments, getInstrumentsPath, parseLaunchTimeout,
         getIwdPath } from './utils';
import { outputStream, errorStream, webSocketAlertStream, dumpStream } from './streams';
import 'colors';


const ERR_NEVER_CHECKED_IN = 'Instruments never checked in';
const ERR_CRASHED_ON_STARTUP = 'Instruments crashed on startup';

class Instruments {
  // simple factory with sane defaults
  static async quickInstruments (opts) {
    opts = _.clone(opts);
    let xcodeTraceTemplatePath = await xcode.getAutomationTraceTemplatePath();
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

  /*
   * opts:
   *   - app
   *   - termTimeout - defaults to 5000
   *   - flakeyRetries - defaults to 0
   *   - udid
   *   - bootstrap
   *   - template
   *   - withoutDelay
   *   - processArguments
   *   - simulatorSdkAndDevice
   *   - tmpDir - defaults to `/tmp/appium-instruments`
   *   - traceDir
   *   - launchTimeout - defaults to 90000
   *   - webSocket
   *   - instrumentsPath
   */
  constructor (opts) {
    opts = _.cloneDeep(opts);
    _.defaults(opts, {
      termTimeout: 5000,
      tmpDir: '/tmp/appium-instruments',
      launchTimeout: 90000,
      flakeyRetries: 0
    });

    // config
    for (let f of ['app', 'termTimeout', 'flakeyRetries', 'udid', 'bootstrap',
                   'template', 'withoutDelay', 'processArguments',
                   'simulatorSdkAndDevice', 'tmpDir', 'traceDir']) {
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
    this.onShutdown = new B((resolve, reject) => {
      this.onShutdownDeferred = {resolve, reject};
    });
    // avoids UnhandledException
    this.onShutdown.catch(() => {}).done();
  }

  async configure () {
    if (!this.xcodeVersion) {
      this.xcodeVersion = await xcode.getVersion(true);
    }
    if (this.xcodeVersion.versionFloat === 6.0 && this.withoutDelay) {
      log.info('In xcode 6.0, instruments-without-delay does not work. ' +
               'If using Appium, you can disable instruments-without-delay ' +
               'with the --native-instruments-lib server flag');
    }
    if (this.xcodeVersion.versionString === '5.0.1') {
      throw new Error('Xcode 5.0.1 ships with a broken version of ' +
                      'Instruments. please upgrade to 5.0.2');
    }

    if (!this.template) {
      this.template = await xcode.getAutomationTraceTemplatePath();
    }

    if (!this.instrumentsPath) {
      this.instrumentsPath = await getInstrumentsPath();
    }
  }

  async launchOnce () {
    log.info('Launching instruments');
    // prepare temp dir
    await fs.rimraf(this.tmpDir);
    await mkdirp(this.tmpDir);
    await mkdirp(this.traceDir);

    this.exitListener = null;
    this.proc = await this.spawnInstruments();
    this.proc.on('exit', (code) => {
      log.debug(`Instruments exited with code ${code}`);
    });

    // set up the promise to handle launch
    let launchResultPromise = new B((resolve, reject) => {
      this.launchResultDeferred = {resolve, reject};
    });

    // There was a special case for ignoreStartupExit
    // but it is not needed anymore, you may just listen for exit.
    this.setExitListener(() => {
      this.proc = null;
      this.launchResultDeferred.reject(new Error(ERR_CRASHED_ON_STARTUP));
    });

    this.proc.on('error', (err) => {
      log.debug(`Error with instruments proc: ${err.message}`);
      if (err.message.indexOf('ENOENT') !== -1) {
        this.proc = null; // otherwise we'll try to send sigkill
        log.error(`Unable to spawn instruments: ${err.message}`);
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

      let fbsErrStr = '(FBSOpenApplicationErrorDomain error 8.)';
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
      this.onShutdownDeferred.reject(new Error(`Abnormal exit with code: ${code}`));
    });
  }

  async launch () {
    await this.configure();
    let launchTries = 0;
    do {
      launchTries++;
      log.debug(`Attempting to launch instruments, this is try #${launchTries}`);

      try {
        await this.launchOnce();
        break;
      } catch (err) {
        log.error(`Error launching instruments: ${err.message}`);
        let errIsCatchable = err.message === ERR_NEVER_CHECKED_IN ||
                             err.message === ERR_CRASHED_ON_STARTUP;
        if (!errIsCatchable) {
          throw err;
        }
        if (launchTries <= this.flakeyRetries) {
          if (this.gotFBSOpenApplicationError) {
            log.debug('Got the FBSOpenApplicationError, not killing the ' +
                      'sim but leaving it open so the app will launch');
            this.gotFBSOpenApplicationError = false; // clear out for next launch
            await B.delay(1000);
          } else {
            await killAllSimulators();
            await B.delay(5000);
          }
        } else {
          log.errorAndThrow('We exceeded the number of retries allowed for ' +
                            'instruments to successfully start; failing launch');
        }
      }
    } while (true);
  }

  registerLaunch () {
    this.launchResultDeferred.resolve();
  }

  async spawnInstruments () {
    let traceDir;
    for (let i = 0; ; i++) {
      // loop while there are tracedirs to delete
      traceDir = path.resolve(this.traceDir, `instrumentscli${i}.trace`);
      if (!await fs.exists(traceDir)) break;
    }

    // build up the arguments to use
    let args = ['-t', this.template, '-D', traceDir];
    if (this.udid) {
      // real device, so specify udid
      args = args.concat(['-w', this.udid]);
      log.debug(`Attempting to run app on real device with UDID '${this.udid}'`);
    }
    if (!this.udid && this.simulatorSdkAndDevice) {
      // sim, so specify the sdk and device
      args = args.concat(['-w', this.simulatorSdkAndDevice]);
      log.debug(`Attempting to run app on ${this.simulatorSdkAndDevice}`);
    }
    args = args.concat([this.app]);
    if (this.processArguments) {
      // any additional stuff specifyied by the user
      var extraArgument = this.processArguments.split('-e ');
      for (var i = 0; i < extraArgument.length; i++) {
          var argu = extraArgument[i].trim();
          if (argu.length > 0) {
            var empty = argu.indexOf(" ");
            var option = argu.substring(0, empty);
            var subArgument = argu.substring(empty + 1);
            args = args.concat(["-e", option, subArgument]);
          }
        }
      log.debug(`Attempting to run app with process arguments: ${JSON.stringify(this.processArguments)}`);
    }
    args = args.concat(['-e', 'UIASCRIPT', this.bootstrap]);
    args = args.concat(['-e', 'UIARESULTSPATH', this.tmpDir]);

    let env = _.clone(process.env);
    if (this.xcodeVersion.major >= 7 && !this.udid) {
      // iwd currently does not work with xcode7, setting withoutDelay to false
      log.info("On xcode 7.0+, instruments-without-delay does not work, " +
               "skipping instruments-without-delay");
      this.withoutDelay = false;
    }
    let iwdPath = await getIwdPath(this.xcodeVersion.major);
    env.CA_DEBUG_TRANSACTIONS = 1;
    if (this.withoutDelay && !this.udid) {
      // sim, and using i-w-d
      env.DYLD_INSERT_LIBRARIES = path.resolve(iwdPath, 'InstrumentsShim.dylib');
      env.LIB_PATH = iwdPath;
    }
    let instrumentsExecArgs = [this.instrumentsPath, ...args];
    instrumentsExecArgs = _.map(instrumentsExecArgs, function (arg) {
      if (arg === null) {
        throw new Error('A null value was passed as an arg to execute ' +
                        'instruments on the command line. A letiable is ' +
                        'probably not getting set. Array of command args: ' +
                        JSON.stringify(instrumentsExecArgs));
      }
      // escape any argument that has a space in it
      if (_.isString(arg) && arg.indexOf(' ') !== -1) {
        return `"${arg}"`;
      }
      // otherwise just use the argument
      return arg;
    });

    log.debug(`Spawning instruments with command: '${instrumentsExecArgs.join(' ')}'`);
    if (this.withoutDelay) {
      log.debug('And extra without-delay env: ' + JSON.stringify({
        DYLD_INSERT_LIBRARIES: env.DYLD_INSERT_LIBRARIES,
        LIB_PATH: env.LIB_PATH
      }));
    }
    log.debug(`And launch timeouts (in ms): ${JSON.stringify(this.launchTimeout)}`);
    return await spawn(this.instrumentsPath, args, {env: env});
  }

  addSocketConnectTimer (delay, type, doAction) {
    let socketConnectDelay = cancellableDelay(delay);
    socketConnectDelay.then(() => {
      log.warn(`Instruments socket client never checked in; timing out (${type})`);
      this.setExitListener(() => {
        this.proc = null;
        this.launchResultDeferred.reject(new Error(ERR_NEVER_CHECKED_IN));
      });
      return doAction();
    }).catch(B.CancellationError, () => {}).done();
    this.socketConnectDelays.push(socketConnectDelay);
  }

  clearSocketConnectTimers () {
    for (let delay of this.socketConnectDelays) {
      delay.cancel();
    }
    this.socketConnectDelays = [];
  }

  setExitListener (exitListener) {
    if (!this.proc) return;
    if (this.exitListener) {
      this.proc.removeListener('exit', this.exitListener);
    }
    this.exitListener = exitListener;
    this.proc.on('exit', exitListener);
  }

  /* PROCESS MANAGEMENT */
  async shutdown () {
    if (this.proc) {
      log.debug('Starting shutdown.');
      let wasTerminated = false;
      // monitoring process termination
      let termDelay = cancellableDelay(this.termTimeout);
      let termPromise = termDelay.catch(B.CancellationError, () => {});
      this.setExitListener(() => {
        this.proc = null;
        wasTerminated = true;
        termDelay.cancel();
        this.onShutdownDeferred.resolve();
      });
      log.debug('Sending sigterm to instruments');
      this.proc.kill('SIGTERM');
      await termPromise;
      if (!wasTerminated) {
        throw new Error(`Instruments did not terminate after ${this.termTimeout / 1000} seconds!`);
      }
    }
  }
}

export default Instruments;
