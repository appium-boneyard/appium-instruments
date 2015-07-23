'use strict';

import path from 'path';
import { exec } from 'teen_process';
import { fs } from 'appium-support';
import log from './logger';
import xcode from 'appium-xcode';

let rootDir = path.resolve(__dirname, '../..');

const INST_STALL_TIMEOUT = 12000;

async function mkdirp (dirPath) {
  await exec('mkdir', ['-p', dirPath]);
}

async function getXcodeTraceTemplatePath () {
  let {stdout} = await exec('xcode-select', ['-print-path']);
  let xCodePath = stdout.trim().replace('\n$', '');
  for(let ext of ['bundle', 'xrplugin']) {
    let traceTemplatePath = path.resolve(xCodePath, '..', '..',
      'Contents/Applications/Instruments.app',
      `Contents/PlugIns/AutomationInstrument.${ext}/Contents/Resources/` +
        'Automation.tracetemplate');
    let fd;
    try {
      fd = await fs.open(traceTemplatePath);
      return traceTemplatePath;
    } catch (ign) {}
    finally {
      try { if (fd) { await fs.close(fd); } } catch (ign) {}
    }
  }
  throw new Error('Could not retrieve trace template!');
}

async function getInstrumentsPath () {
  let instrumentsPath;
  try {
    let {stdout} = await exec('xcrun', ['-find', 'instruments']);
    if (typeof stdout === "undefined") stdout = "";
    instrumentsPath = stdout.trim().replace('\n$', '');
  } catch (err) {
    if (err) log.error(err.message);
  }
  if (!instrumentsPath) {
    log.error("Could not find instruments binary");
    throw new Error("Could not find the instruments " +
        "binary. Please ensure `xcrun -find instruments` can locate it.");
  }
  log.debug("Instruments is at: " + instrumentsPath);
  return instrumentsPath;
}

async function getAvailableDevices () {
  log.debug("Getting list of devices instruments supports");
  let instrumentsPath = await getInstrumentsPath();
  let opts = {timeout: INST_STALL_TIMEOUT};
  let lines;
  try {
    let {stdout} = await exec(instrumentsPath, ['-s', 'devices'], opts);
    lines = stdout.split("\n");
  } catch (err) {
    log.error(err);
    throw new Error(`Failed getting devices, err: ${err}.`);
  }
  let devices = [];
  for(let line of lines) {
    if (/^i.+$/.test(line)) {
      devices.push(line);
    }
  }
  return devices;
}


// TODO: use simulator package
async function killAllSimulators () {
  let version = await xcode.getVersion();
  // this is contrary to our usual pattern, but if getting the xcode version
  // fails, we couldn't have started simulators anyways/
  log.debug("Killing all iOS Simulator");
  try {
    await exec('pkill', ['-9', '-f',
      version >= "6" ? 'iOS Simulator' : 'iPhoneSimulator']);
  } catch (ign) {}
}

async function killAllInstruments () {
  log.debug("Killing all instruments");
  try {
    await exec('pkill',  ['-f', 'instruments']);
  } catch (ign) {}
}

async function cleanAllTraces () {
  if (process.env.CLEAN_TRACES) {
    try {
      await exec('rm', ['-rf', 'instrumentscli*.trace']);
    } catch (ign) {}
  }
}

function parseLaunchTimeout (launchTimeout) {
  // number or object like { global: 40000, afterSimLaunch: 5000 }
  // may also parse JSON strings.
  if (typeof launchTimeout === 'string') {
    try {
      launchTimeout = JSON.parse(launchTimeout);
    } catch (err) {
      log.warn("Invalid launch timeout: " + launchTimeout);
    }
  }
  if (typeof launchTimeout === 'number') {
    launchTimeout = {
      global: launchTimeout
    };
  }
  return launchTimeout;
}

async function getIwdPath(xcodeVersion) {
  xcodeVersion = parseInt(xcodeVersion, 10);
  let thirdpartyPath = path.resolve(rootDir, "thirdparty");
  let iwdPath = path.resolve(thirdpartyPath, `iwd${xcodeVersion}`);
  if(!await fs.exists(iwdPath)) {
    iwdPath = path.resolve(thirdpartyPath, `iwd`);
  }
  return iwdPath;
}

export { rootDir, mkdirp, getXcodeTraceTemplatePath, killAllSimulators, killAllInstruments, cleanAllTraces,
         mkdirp, killAllSimulators, killAllInstruments , getInstrumentsPath, getAvailableDevices,
         parseLaunchTimeout, getIwdPath };
