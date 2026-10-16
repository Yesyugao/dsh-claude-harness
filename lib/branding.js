/**
 * macOS branding engine for the DeepSeek Harness desktop app.
 *
 * Two visible facts are changed:
 *   1. the app icon      -> assets/Claude.icns (Contents/Resources/icon.icns)
 *   2. the bundle name   -> "Claude Harness" (CFBundleName / CFBundleDisplayName,
 *                           plus the .app filename itself)
 *
 * Order matters. Editing Info.plist or any sealed resource invalidates the code
 * signature, and macOS SIGTRAP-kills an app whose signature is invalid
 * (EXC_BREAKPOINT / "Trace/BPT trap: 5"). So every mutation is followed by a
 * re-sign of the top level only, and the bundle is renamed LAST. `codesign
 * --deep` is deliberately never used: it walks into the running helper
 * processes' subcomponents and fails with "Operation not permitted".
 *
 * ponytail: ad-hoc (`-s -`) re-signing only. Good enough to keep the app
 * launchable; macOS resets TCC grants after a re-sign, so folder permissions may
 * be asked for again. A Developer ID identity would fix that, at the cost of a
 * signing certificate this plugin is not allowed to assume.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const BUNDLE_ID = "com.deepseek.dsh";
export const TARGET_NAME = "Claude Harness";
export const PLUGIN_NAME = "dsh-claude-harness";
export const DEFAULT_APP_PATHS = [
  `/Applications/${TARGET_NAME}.app`,
  "/Applications/DeepSeek Harness.app",
];
export const DEFAULT_ICON = fileURLToPath(new URL("../assets/Claude.icns", import.meta.url));
export const DEFAULT_STATE_DIR = join(homedir(), ".dsh", PLUGIN_NAME);

const PLIST_BUDDY = "/usr/libexec/PlistBuddy";
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/* ------------------------------------------------------------------ shell */

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function failure(error) {
  const stderr = error?.stderr?.toString?.().trim?.() ?? "";
  const stdout = error?.stdout?.toString?.().trim?.() ?? "";
  return stderr || stdout || error?.message || String(error);
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/* ------------------------------------------------------------------ plist */

export function isAppBundle(path) {
  return Boolean(path) && existsSync(join(path, "Contents", "Info.plist"));
}

export function plistGet(app, key) {
  return run(PLIST_BUDDY, ["-c", `Print :${key}`, join(app, "Contents", "Info.plist")]);
}

export function plistTryGet(app, key) {
  try {
    return plistGet(app, key);
  } catch {
    return undefined;
  }
}

export function plistSet(app, key, value) {
  const plistPath = join(app, "Contents", "Info.plist");
  const command = plistTryGet(app, key) === undefined ? "Add" : "Set";
  // PlistBuddy takes everything after the key as the value, spaces included.
  run(PLIST_BUDDY, ["-c", `${command} :${key} ${value}`, plistPath]);
}

/* ------------------------------------------------------------------ app */

export function appIdentifier(app) {
  return plistTryGet(app, "CFBundleIdentifier");
}

/**
 * Which .app to brand. Explicit path > what we branded last time > Spotlight >
 * the two well-known /Applications locations.
 */
export function findApp(explicit, stateDir = DEFAULT_STATE_DIR) {
  if (explicit) {
    if (!isAppBundle(explicit)) throw new Error(`not an app bundle: ${explicit}`);
    return explicit;
  }
  const remembered = readState(stateDir)?.appPath;
  if (isAppBundle(remembered)) return remembered;
  try {
    const hits = run("mdfind", [`kMDItemCFBundleIdentifier == '${BUNDLE_ID}'`])
      .split("\n")
      .map((line) => line.trim())
      .filter(isAppBundle);
    if (hits.length > 0) {
      return hits.sort((a, b) => rank(a) - rank(b))[0];
    }
  } catch {
    /* mdfind missing or unhappy: fall through to the known locations */
  }
  for (const path of DEFAULT_APP_PATHS) {
    if (isAppBundle(path)) return path;
  }
  throw new Error(
    `no DeepSeek Harness app bundle found (looked for ${BUNDLE_ID} in /Applications); pass --app`,
  );
}

const rank = (path) => (basename(path) === `${TARGET_NAME}.app` ? 0 : 1);

export function signatureValid(app) {
  try {
    run("codesign", ["--verify", app]);
    return true;
  } catch {
    return false;
  }
}

export function isRunning(app) {
  try {
    // Not pgrep -f: on macOS it only matches a truncated prefix of argv, so an
    // app path containing a space never matches.
    const marker = `${app}/Contents/MacOS/`;
    return run("ps", ["ax", "-o", "command="])
      .split("\n")
      .some((line) => line.includes(marker));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ state */

function statePath(stateDir) {
  return join(stateDir, "state.json");
}

export function readState(stateDir = DEFAULT_STATE_DIR) {
  const path = statePath(stateDir);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ status */

export function brandingStatus({ app, icon = DEFAULT_ICON, stateDir = DEFAULT_STATE_DIR } = {}) {
  const appPath = findApp(app, stateDir);
  const iconPath = join(appPath, "Contents", "Resources", "icon.icns");
  const bundleName = plistTryGet(appPath, "CFBundleName");
  const displayName = plistTryGet(appPath, "CFBundleDisplayName");
  const iconPresent = existsSync(iconPath);
  return {
    appPath,
    bundleName,
    displayName,
    identifier: plistTryGet(appPath, "CFBundleIdentifier"),
    executable: plistTryGet(appPath, "CFBundleExecutable"),
    shortVersion: plistTryGet(appPath, "CFBundleShortVersionString"),
    nameApplied: bundleName === TARGET_NAME && displayName === TARGET_NAME,
    fileNamed: basename(appPath) === `${TARGET_NAME}.app`,
    iconPath,
    iconPresent,
    iconMatches: iconPresent && existsSync(icon) && sha256(iconPath) === sha256(icon),
    signed: signatureValid(appPath),
    running: isRunning(appPath),
    state: readState(stateDir),
  };
}

/* ------------------------------------------------------------------ apply */

function backupOnce(app, stateDir, log) {
  const dir = join(stateDir, "backup");
  const state = readState(stateDir);
  if (state?.backup) return state;
  mkdirSync(dir, { recursive: true });
  const plist = join(dir, "Info.plist");
  const icns = join(dir, "icon.icns");
  copyFileSync(join(app, "Contents", "Info.plist"), plist);
  const live = join(app, "Contents", "Resources", "icon.icns");
  const hasIcon = existsSync(live);
  if (hasIcon) copyFileSync(live, icns);
  const record = {
    appPath: app,
    originalName: basename(app),
    originalBundleName: plistTryGet(app, "CFBundleName") ?? null,
    originalDisplayName: plistTryGet(app, "CFBundleDisplayName") ?? null,
    originalIdentifier: plistTryGet(app, "CFBundleIdentifier") ?? null,
    backup: { plist, icon: hasIcon ? icns : null },
    appliedAt: new Date().toISOString(),
    version: readVersion(),
  };
  writeFileSync(statePath(stateDir), `${JSON.stringify(record, null, 2)}\n`);
  log(`backed up original Info.plist${hasIcon ? " and icon.icns" : ""} to ${dir}`);
  return record;
}

function readVersion() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

/** Re-sign the top level only. Never --deep (see the file header). */
function resign(app, log) {
  run("codesign", ["--force", "--sign", "-", app]);
  if (!signatureValid(app)) throw new Error(`re-signed ${app} but codesign --verify still fails`);
  log("re-signed ad-hoc (top level only) and verified");
}

/**
 * Install the Claude icon and the "Claude Harness" name onto the app bundle.
 * Idempotent: a second run on an already-branded app changes nothing.
 */
export function applyBranding(options = {}) {
  const { icon = DEFAULT_ICON, stateDir = DEFAULT_STATE_DIR, onStep, force = false } = options;
  const steps = [];
  const log = (message) => {
    steps.push(message);
    onStep?.(message);
  };

  if (process.platform !== "darwin") throw new Error("dsh-claude-harness only works on macOS");
  const app = findApp(options.app, stateDir);
  const identifier = appIdentifier(app);
  if (identifier !== BUNDLE_ID) {
    throw new Error(
      `refusing to modify ${app}: CFBundleIdentifier is ${identifier ?? "(none)"}, expected ${BUNDLE_ID}`,
    );
  }
  if (!existsSync(icon)) throw new Error(`icon not found: ${icon}`);

  const resourcesIcon = join(app, "Contents", "Resources", "icon.icns");
  const bundleName = plistTryGet(app, "CFBundleName");
  const displayName = plistTryGet(app, "CFBundleDisplayName");
  const iconSame = existsSync(resourcesIcon) && sha256(resourcesIcon) === sha256(icon);
  const target = join(dirname(app), `${TARGET_NAME}.app`);

  if (!force && bundleName === TARGET_NAME && displayName === TARGET_NAME && iconSame) {
    log("already branded — nothing to do");
    return {
      ok: true,
      changed: false,
      appPath: app,
      renamedTo: null,
      running: isRunning(app),
      signed: signatureValid(app),
      steps,
    };
  }
  if (basename(app) !== `${TARGET_NAME}.app` && existsSync(target)) {
    throw new Error(`cannot rename: ${target} already exists`);
  }
  if (isRunning(app)) log(`note: ${basename(app)} is running; the change shows on next launch`);

  const before = { bundleName, displayName, iconSame };
  backupOnce(app, stateDir, log);

  if (!iconSame) {
    copyFileSync(icon, resourcesIcon);
    log(`installed icon ${basename(icon)} -> Contents/Resources/icon.icns`);
  }
  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    if (plistTryGet(app, key) !== TARGET_NAME) {
      plistSet(app, key, TARGET_NAME);
      log(`set ${key} = ${TARGET_NAME}`);
    }
  }

  resign(app, log);

  let finalPath = app;
  if (basename(app) !== `${TARGET_NAME}.app`) {
    renameSync(app, target);
    finalPath = target;
    log(`renamed ${basename(app)} -> ${basename(target)}`);
  }

  try {
    run(LSREGISTER, ["-f", finalPath]);
    log("refreshed LaunchServices registration");
  } catch {
    log("LaunchServices refresh skipped (lsregister unavailable)");
  }

  if (!signatureValid(finalPath)) throw new Error(`branded ${finalPath} but its signature is invalid`);
  log("verified: signature valid");

  return {
    ok: true,
    changed: true,
    appPath: finalPath,
    renamedTo: finalPath === app ? null : finalPath,
    previously: before,
    running: isRunning(finalPath),
    signed: true,
    steps,
  };
}

/* ------------------------------------------------------------------ restore */

/** Put back the bundle as it was before the first apply (plist, icon, name). */
export function restoreBranding({ stateDir = DEFAULT_STATE_DIR, onStep } = {}) {
  const steps = [];
  const log = (message) => {
    steps.push(message);
    onStep?.(message);
  };
  const state = readState(stateDir);
  if (!state?.backup) throw new Error(`nothing to restore: no backup in ${stateDir}`);

  const renamed = join(dirname(state.appPath), `${TARGET_NAME}.app`);
  const app = existsSync(renamed) && isAppBundle(renamed) ? renamed : state.appPath;
  if (!isAppBundle(app)) throw new Error(`branded bundle is gone: ${app} / ${renamed}`);
  if (isRunning(app)) log(`note: ${basename(app)} is running; the change shows on next launch`);

  const plist = state.backup.plist;
  if (existsSync(plist)) {
    copyFileSync(plist, join(app, "Contents", "Info.plist"));
    log("restored original Info.plist");
  }
  if (state.backup.icon && existsSync(state.backup.icon)) {
    copyFileSync(state.backup.icon, join(app, "Contents", "Resources", "icon.icns"));
    log("restored original icon.icns");
  }
  resign(app, log);

  let finalPath = app;
  if (basename(app) !== state.originalName) {
    const target = join(dirname(app), state.originalName);
    if (existsSync(target)) throw new Error(`cannot rename back: ${target} already exists`);
    renameSync(app, target);
    finalPath = target;
    log(`renamed ${basename(app)} -> ${state.originalName}`);
  }
  return { ok: true, appPath: finalPath, steps };
}
