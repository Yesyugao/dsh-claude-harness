/**
 * Route-level self-check for lib/index.js — a mock req/res, no server needed.
 *
 *   node test/routes.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { handleRequest } from "../lib/index.js";

function call(method, path, headers = {}) {
  const captured = { status: 0, body: "" };
  const res = {
    writeHead: (status) => {
      captured.status = status;
      return res;
    },
    end: (payload) => {
      captured.body = payload ? payload.toString() : "";
    },
  };
  handleRequest(
    { method, url: path, headers: { host: "127.0.0.1:19387", ...headers } },
    res,
  );
  return { status: captured.status, json: captured.body ? JSON.parse(captured.body) : null };
}

test("index route describes the plugin", () => {
  const { status, json } = call("GET", "/dsh-claude-harness");
  assert.equal(status, 200);
  assert.equal(json.plugin, "dsh-claude-harness");
  assert.deepEqual(json.routes, ["GET /status", "POST /apply", "POST /restore"]);
});

test("status is read-only and reports the bundle", { skip: process.platform !== "darwin" }, () => {
  const { status, json } = call("GET", "/dsh-claude-harness/status");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(typeof json.status.appPath, "string");
  assert.equal(typeof json.status.signed, "boolean");
});

test("mutations must be POST", () => {
  assert.equal(call("GET", "/dsh-claude-harness/apply").status, 405);
  assert.equal(call("GET", "/dsh-claude-harness/restore").status, 405);
});

test("non-loopback hosts and cross-site requests are refused", () => {
  assert.equal(call("GET", "/dsh-claude-harness/status", { host: "evil.example" }).status, 403);
  assert.equal(
    call("GET", "/dsh-claude-harness/status", { "sec-fetch-site": "cross-site" }).status,
    403,
  );
});

test("unknown subroutes 404", () => {
  assert.equal(call("GET", "/dsh-claude-harness/nope").status, 404);
});
