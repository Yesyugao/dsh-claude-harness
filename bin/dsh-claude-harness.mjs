#!/usr/bin/env node
/**
 * dsh-claude-harness CLI — the supported way to brand/unbrand the desktop app.
 *
 *   dsh-claude-harness status [--json]
 *   dsh-claude-harness apply  [--app PATH] [--icon PATH] [--force] [--json]
 *   dsh-claude-harness restore [--json]
 */

import { DEFAULT_STATE_DIR, applyBranding, brandingStatus, restoreBranding } from "../lib/branding.js";

const USAGE = `dsh-claude-harness — Claude icon + "Claude Harness" name for the desktop app

  status   [--json]                 what the app bundle looks like right now
  apply    [--app PATH] [--icon PATH] [--force] [--json]
                                    install the Claude icon and bundle name
  restore  [--json]                 put the original icon/plist/name back

State (and the pre-change backup) lives in ${DEFAULT_STATE_DIR}.
`;

const [command, ...rest] = process.argv.slice(2);

const options = { json: false, force: false };
for (let index = 0; index < rest.length; index += 1) {
  const flag = rest[index];
  if (flag === "--json") options.json = true;
  else if (flag === "--force") options.force = true;
  else if (flag === "--app" || flag === "--icon") options[flag.slice(2)] = rest[(index += 1)];
  else {
    process.stderr.write(`unknown argument: ${flag}\n\n${USAGE}`);
    process.exit(2);
  }
}

const emit = (payload, lines) => {
  if (options.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${lines.join("\n")}\n`);
};

try {
  if (command === "status") {
    const status = brandingStatus({ app: options.app, icon: options.icon });
    emit(status, [
      `app           ${status.appPath}`,
      `bundle id     ${status.identifier}`,
      `CFBundleName  ${status.bundleName ?? "(unset)"}`,
      `display name  ${status.displayName ?? "(unset)"}`,
      `name applied  ${status.nameApplied ? "yes" : "no"}`,
      `file renamed  ${status.fileNamed ? "yes" : "no"}`,
      `icon applied  ${status.iconMatches ? "yes" : "no"}`,
      `signature     ${status.signed ? "valid" : "INVALID"}`,
      `running       ${status.running ? "yes" : "no"}`,
    ]);
  } else if (command === "apply") {
    const result = applyBranding({
      app: options.app,
      icon: options.icon,
      force: options.force,
      onStep: options.json ? undefined : (step) => process.stderr.write(`  ${step}\n`),
    });
    emit(result, [
      result.changed ? `branded ${result.appPath}` : `already branded (${result.appPath})`,
      ...result.steps.map((step) => `  ${step}`),
    ]);
  } else if (command === "restore") {
    const result = restoreBranding({
      onStep: options.json ? undefined : (step) => process.stderr.write(`  ${step}\n`),
    });
    emit(result, [`restored ${result.appPath}`, ...result.steps.map((step) => `  ${step}`)]);
  } else {
    process.stdout.write(USAGE);
    if (command !== undefined && command !== "help" && command !== "--help") process.exit(2);
  }
} catch (error) {
  process.stderr.write(`dsh-claude-harness: ${error?.message ?? String(error)}\n`);
  process.exit(1);
}
