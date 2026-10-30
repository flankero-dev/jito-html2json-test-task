"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { html2json } = require("../html2json.js");

const text = value => ({ type: "text", value });
const element = (tagName, children = [], attributes = {}) =>
  ({ type: "element", tagName, attributes, children });
const documentTree = (...children) => ({ type: "document", children });
const unicode = ["İ", "İİ", "I\u0307", "ß", "ﬃ", "Σ", "ΟΣ", "K", "ſ", "𐐀", "😀", "\ud800"];

test("D1: Unicode before script preserves the following element exactly", () => {
  assert.deepEqual(html2json("İ<script>x</script><p>y</p>"), documentTree(
    text("İ"), element("script", [text("x")]), element("p", [text("y")])
  ));
});

for (const tag of ["script", "style", "xmp", "iframe", "textarea", "title"]) {
  test(`D1: ${tag} keeps Unicode offsets before and inside its text`, () => {
    const rcdata = tag === "textarea" || tag === "title";
    for (const value of unicode) {
      const input = `${value}<${tag.toUpperCase()}>${value}<b>&amp;</${tag.toUpperCase()}><p>after</p>`;
      assert.deepEqual(html2json(input), documentTree(
        text(value), element(tag, [text(value + "<b>" + (rcdata ? "&" : "&amp;"))]),
        element("p", [text("after")])
      ), JSON.stringify({ tag, value }));
    }
  });
}

test("D1: Unicode before DOCTYPE and in ordinary text is unchanged", () => {
  for (const value of unicode) {
    assert.deepEqual(html2json(`${value}<!DoCtYpE html><p>${value}</p>`), documentTree(
      text(value), { type: "doctype", value: "html" }, element("p", [text(value)])
    ));
  }
});

test("D1: plaintext and incomplete markup keep Unicode and literal suffixes", () => {
  for (const value of unicode) {
    assert.deepEqual(html2json(`${value}<plaintext>${value}</plaintext>&amp;<b>`), documentTree(
      text(value), element("plaintext", [text(value + "</plaintext>&amp;<b>")])
    ));
    assert.deepEqual(html2json(`<p>${value}</p><a title="${value}`), documentTree(
      element("p", [text(value)]), text(`<a title="${value}`)
    ));
  }
});

test("D1: only ASCII capitals in tag and attribute names are folded", () => {
  assert.deepEqual(html2json('<X-İ DATA-İ="İ" DATA-K="K">x</x-İ><p>y</p>'), documentTree(
    element("x-İ", [text("x")], { "data-İ": "İ", "data-K": "K" }), element("p", [text("y")])
  ));
  assert.deepEqual(html2json('<script>x</scrİpt>y</SCRIPT><p>z</p>'), documentTree(
    element("script", [text("x</scrİpt>y")]), element("p", [text("z")])
  ));
});

test("D2: SVG prototype-like attributes survive JSON round trip without renaming", () => {
  const names = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "__defineGetter__"];
  const attributes = Object.fromEntries(names.map((name, i) => [name.replace(/[A-Z]/g, c => c.toLowerCase()), String(i)]));
  const input = `<svg ${names.map((name, i) => `${name}="${i}"`).join(" ")}/>`;
  const expected = documentTree(element("svg", [], attributes));
  const actual = html2json(input);
  assert.deepEqual(actual, expected);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
  assert.equal(Object.getPrototypeOf(actual.children[0].attributes), Object.prototype);
  assert.equal(Object.hasOwn(actual.children[0].attributes, "__proto__"), true);
});

test("D2: canonical SVG casing and first duplicate values still work", () => {
  const attributes = JSON.parse('{"constructor":"first","__proto__":"p","viewBox":"0 0 1 1","preserveAspectRatio":"none"}');
  assert.deepEqual(html2json('<svg constructor="first" constructor="second" __proto__="p" viewbox="0 0 1 1" preserveaspectratio="none"><circle pathlength="4"/></svg>'),
    documentTree(element("svg", [element("circle", [], { pathLength: "4" })], attributes)));
});

test("D3: dotted custom tags close correctly and keep ordered siblings", () => {
  assert.deepEqual(html2json('<my-widget.v2>x</my-widget.v2><p>y</p>'), documentTree(
    element("my-widget.v2", [text("x")]), element("p", [text("y")])
  ));
  assert.deepEqual(html2json('<my-widget.v2><my-widget.v3>x</my-widget.v3>y</my-widget.v2>'), documentTree(
    element("my-widget.v2", [element("my-widget.v3", [text("x")]), text("y")])
  ));
});

test("D3: digits, underscores, colons and non-ASCII tag suffixes are consistent", () => {
  for (const [inputName, outputName] of [["DIV", "div"], ["x-2", "x-2"], ["x_a.b2", "x_a.b2"],
    ["ns:widget.v2", "ns:widget.v2"], ["x-é", "x-é"], ["x-İ", "x-İ"], ["x-😀", "x-😀"]]) {
    assert.deepEqual(html2json(`<${inputName} @click="a" :value="b">v</${inputName}>`), documentTree(
      element(outputName, [text("v")], { "@click": "a", ":value": "b" })
    ));
  }
});

test("D3: invalid tag starts stay literal; incomplete dotted tags recover at EOF", () => {
  for (const input of ["<3>x</3>", "<_x>x</_x>", "<.x>x</.x>", "<é-x>x</é-x>", "<x.v2", "</x.v2"]) {
    assert.deepEqual(html2json(input), documentTree(text(input)));
  }
});
