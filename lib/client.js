// 中文衬线体补丁。
//
// dsh-claude-style 的衬线字体栈是
//   "Anthropic Serif Web Text", "Claude Style Noto Serif", Georgia, ..., "Noto Sans SC", "PingFang SC", ...
// 前两个族名都没有汉字字形（插件自带的 Noto Serif 是 802 字形的拉丁子集），
// 所以汉字会一路回退到栈尾的无衬线字体，中文就全成了黑体。
//
// 给栈里第一个族名补一个只覆盖汉字的 @font-face：汉字用系统宋体，
// 拉丁字仍然由 Anthropic Serif 出图（unicode-range 把它们隔开）。

var FAMILY = "Anthropic Serif Web Text";
var STYLE_ID = "dsh-claude-harness-cjk-serif";
var CJK_RANGE = [
  "U+3000-303F", // 、。「」等中文标点
  "U+3400-4DBF", // 扩展 A
  "U+4E00-9FFF", // 基本汉字
  "U+F900-FAFF", // 兼容汉字
  "U+FF00-FFEF", // 全角
  "U+20000-2FA1F", // 扩展 B 及以后
].join(",");
var CSS =
  '@font-face{font-family:"' + FAMILY + '";' +
  'src:local("Songti SC"),local("Noto Serif SC"),local("Source Han Serif SC");' +
  "unicode-range:" + CJK_RANGE +
  ";font-weight:100 900}";

function apply(ctx) {
  ctx.effect(function () {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    return function () {
      style.remove();
    };
  }, "claude-harness: 中文衬线体");
}

window.__ModuleLoader__.load({
  id: "dsh-claude-harness",
  factory: function () {
    var module = { exports: {} };
    module.exports.apply = apply;
    module.exports.inject = [];
    return module.exports;
  },
});
