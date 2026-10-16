/**
 * Host half of dsh-claude-harness.
 *
 * The real work lives in ./branding.js and is normally driven from the CLI
 * (`dsh-claude-harness apply`). The routes below are the same three operations
 * over the local web server, so the app itself can trigger them:
 *
 *   GET  /dsh-claude-harness/status   -> what the bundle looks like right now
 *   POST /dsh-claude-harness/apply    -> install the Claude icon + name
 *   POST /dsh-claude-harness/restore  -> put the original back
 *
 * Loading this plugin never changes the app on its own: branding is opt-in,
 * because a half-applied signature is what makes macOS SIGTRAP-kill the app.
 */

import {
  DEFAULT_ICON,
  DEFAULT_STATE_DIR,
  applyBranding,
  brandingStatus,
  restoreBranding,
} from "./branding.js";

export const name = "dsh-claude-harness";

const PREFIX = "/dsh-claude-harness";

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
  });
  res.end(body);
}

/** Loopback + same-origin only: these routes mutate the app on disk. */
function localOnly(req) {
  const host = String(req.headers.host ?? "").split(":")[0].replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) return false;
  const site = req.headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

export function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const sub = url.pathname.slice(PREFIX.length) || "/";
  if (!localOnly(req)) {
    sendJson(res, 403, { ok: false, error: "loopback same-origin requests only" });
    return;
  }

  if (sub === "/" || sub === "") {
    sendJson(res, 200, {
      ok: true,
      plugin: name,
      icon: DEFAULT_ICON,
      stateDir: DEFAULT_STATE_DIR,
      routes: ["GET /status", "POST /apply", "POST /restore"],
    });
    return;
  }

  if (sub === "/status") {
    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: `${req.method} not allowed` });
      return;
    }
    try {
      sendJson(res, 200, { ok: true, status: brandingStatus() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message ?? String(error) });
    }
    return;
  }

  if (sub === "/apply" || sub === "/restore") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: `${req.method} not allowed, use POST` });
      return;
    }
    try {
      const result =
        sub === "/apply"
          ? applyBranding({ force: url.searchParams.has("force") })
          : restoreBranding({});
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message ?? String(error) });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: `unknown route ${sub}` });
}

export function apply(ctx) {
  const mount = (scope) => {
    const server = scope?.webServer;
    if (!server || typeof server.register !== "function") {
      ctx.logger?.warn?.(`${name}: no webServer service, routes not registered`);
      return;
    }
    const effect = typeof scope.effect === "function" ? scope.effect : (fn) => fn();
    effect(() => {
      const disposers = [];
      const dispose = server.register({ kind: "prefix", path: PREFIX, handler: handleRequest });
      if (typeof dispose === "function") disposers.push(dispose);
      return () => {
        for (const stop of disposers) stop();
      };
    });
  };

  if (typeof ctx.inject === "function") ctx.inject(["webServer"], mount);
  else mount(ctx);
}
