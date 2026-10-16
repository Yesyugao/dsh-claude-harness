/**
 * Self-check for lib/branding.js — runs the real codesign/PlistBuddy path
 * against a throwaway fake bundle, so nothing here touches the real app.
 *
 *   node --test test/
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { applyBranding, brandingStatus, plistGet, restoreBranding } from "../lib/branding.js";

const ICON = new URL("../assets/Claude.icns", import.meta.url).pathname;
const ORIGINAL_ICON = Buffer.from("this-was-the-original-icon");
const root = mkdtempSync(join(tmpdir(), "dsh-claude-harness-"));
const stateDir = join(root, "state");

const PLIST = (identifier) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${identifier}</string>
  <key>CFBundleName</key><string>DeepSeek Harness</string>
  <key>CFBundleDisplayName</key><string>DeepSeek Harness</string>
  <key>CFBundleExecutable</key><string>fake-dsh</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.0.1</string>
</dict>
</plist>
`;

function fakeApp(name, identifier = "com.deepseek.dsh") {
  const app = join(root, name);
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), PLIST(identifier));
  const exe = join(app, "Contents", "MacOS", "fake-dsh");
  copyFileSync("/bin/echo", exe);
  chmodSync(exe, 0o755);
  writeFileSync(join(app, "Contents", "Resources", "icon.icns"), ORIGINAL_ICON);
  execFileSync("codesign", ["--force", "--sign", "-", app], { stdio: "pipe" });
  return app;
}

after(() => rmSync(root, { recursive: true, force: true }));

test("brands icon + name, is idempotent, and restores", { skip: process.platform !== "darwin" }, () => {
  const app = fakeApp("Fake DeepSeek Harness.app");
  const branded = join(root, "Claude Harness.app");

  assert.equal(brandingStatus({ app, stateDir }).nameApplied, false);

  const first = applyBranding({ app, icon: ICON, stateDir });
  assert.equal(first.changed, true);
  assert.equal(first.appPath, branded);
  assert.ok(existsSync(branded), "bundle was renamed to Claude Harness.app");
  assert.ok(!existsSync(app), "old bundle path is gone");
  assert.equal(plistGet(branded, "CFBundleName"), "Claude Harness");
  assert.equal(plistGet(branded, "CFBundleDisplayName"), "Claude Harness");
  assert.deepEqual(readFileSync(join(branded, "Contents", "Resources", "icon.icns")), readFileSync(ICON));

  const status = brandingStatus({ app: branded, stateDir });
  assert.equal(status.nameApplied, true);
  assert.equal(status.iconMatches, true);
  assert.equal(status.fileNamed, true);
  assert.equal(status.signed, true, "the ad-hoc re-sign kept the bundle valid");

  const second = applyBranding({ app: branded, icon: ICON, stateDir });
  assert.equal(second.changed, false, "second apply is a no-op");

  const restored = restoreBranding({ stateDir });
  assert.equal(restored.appPath, app);
  assert.ok(existsSync(app));
  assert.equal(plistGet(app, "CFBundleName"), "DeepSeek Harness");
  assert.equal(plistGet(app, "CFBundleDisplayName"), "DeepSeek Harness");
  assert.deepEqual(readFileSync(join(app, "Contents", "Resources", "icon.icns")), ORIGINAL_ICON);
});

test("refuses to touch a bundle that is not the harness", { skip: process.platform !== "darwin" }, () => {
  const other = fakeApp("Some Other App.app", "com.example.other");
  assert.throws(
    () => applyBranding({ app: other, icon: ICON, stateDir }),
    /refusing to modify/,
  );
});
