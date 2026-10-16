// 用最小 DOM 桩验证浏览器半边：注册契约、样式内容、生命周期。
import assert from "node:assert/strict";

const head = [];
const disposers = [];
let loaded = null;

globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec;
    },
  },
};
globalThis.document = {
  head: {
    appendChild(el) {
      head.push(el);
    },
  },
  createElement() {
    return {
      id: "",
      textContent: "",
      remove() {
        const i = head.indexOf(this);
        if (i >= 0) head.splice(i, 1);
      },
    };
  },
};

await import("../lib/client.js");

assert.ok(loaded, "client bundle must register through __ModuleLoader__");
assert.equal(loaded.id, "dsh-claude-harness");

const mod = loaded.factory();
assert.deepEqual(mod.inject, [], "no host services needed");

mod.apply({
  effect(fn) {
    disposers.push(fn());
  },
});

assert.equal(head.length, 1, "apply injects exactly one style tag");
const style = head[0];
assert.equal(style.id, "dsh-claude-harness-cjk-serif");
assert.match(style.textContent, /font-family:"Anthropic Serif Web Text"/);
assert.match(style.textContent, /local\("Songti SC"\)/);
assert.match(style.textContent, /unicode-range:U\+3000-303F,U\+3400-4DBF,U\+4E00-9FFF/);
assert.ok(!/U\+0041/.test(style.textContent), "must not touch Latin letters");

assert.equal(disposers.length, 1, "cleanup registered through ctx.effect");
disposers[0]();
assert.equal(head.length, 0, "dispose removes the style tag");

console.log("client.test.mjs: OK");
