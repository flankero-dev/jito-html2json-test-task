"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { html2json } = require("../html2json.js");
const T = value => ({ type: "text", value });
const C = value => ({ type: "comment", value });
const E = (tagName, children = [], attributes = {}) => ({ type: "element", tagName, attributes, children });
const D = (...children) => ({ type: "document", children });

// The expected comment data follows HTML tokenizer EOF states, not the old
// implementation's raw suffix slicing. Existing malformed-comment tests stay.
for (const [suffix, value] of [["", ""], ["-", ""], ["--", ""], ["--!", ""],
  ["x-", "x"], ["x--", "x"], ["x--!", "x"], [" <!--", " <!"], ["x--!a", "x--!a"]]) {
  test(`comment EOF pending delimiters: ${JSON.stringify(suffix)}`, () => {
    assert.deepEqual(html2json("<!--" + suffix), D(C(value)));
  });
}

test("comment NUL replacement and mixed endings preserve the following sibling", () => {
  assert.deepEqual(html2json("<!--a\0b--!><p>İ</p><!--c--->"), D(C("a�b"), E("p", [T("İ")]), C("c-")));
});

test("bogus declarations end at the first greater-than sign even inside quotes", () => {
  for (const quote of ['"', "'"]) {
    assert.deepEqual(html2json(`<!x ${quote}><p>ok</p>`), D(C(`x ${quote}`), E("p", [T("ok")])));
  }
});

test("HTML CDATA remains a bogus comment; its quote cannot swallow siblings", () => {
  assert.deepEqual(html2json('<![CDATA["x>y]]><p>ok</p>'),
    D(C('[CDATA["x'), T("y]]>"), E("p", [T("ok")])));
});

for (const tag of ["svg", "math"]) {
  test(`${tag} CDATA preserves literal markup and references`, () => {
    assert.deepEqual(html2json(`<${tag}><![CDATA[a<b> &amp; İ]]><x/></${tag}>`),
      D(E(tag, [T("a<b> &amp; İ"), E("x")])));
  });
  test(`${tag} incomplete CDATA consumes only its literal suffix through EOF`, () => {
    assert.deepEqual(html2json(`<${tag}><![CDATA[a<b>&amp;]]`), D(E(tag, [T("a<b>&amp;]]")])));
  });
}

for (const [root, tag] of [["svg", "foreignObject"], ["svg", "title"], ["svg", "desc"], ["math", "mtext"]]) {
  test(`CDATA uses current namespace in ${root}/${tag} integration point`, () => {
    assert.deepEqual(html2json(`<${root}><${tag}><![CDATA[a<b>&amp;]]></${tag}></${root}>`),
      D(E(root, [E(tag.toLowerCase(), [T("a<b>&amp;")])])));
  });
}

test("CDATA checks the actual current node after entering an HTML child", () => {
  assert.deepEqual(html2json('<svg><foreignObject><div><![CDATA[x]]></div></foreignObject></svg>'),
    D(E("svg", [E("foreignobject", [E("div", [C("[CDATA[x]]")])])])));
});

test("empty CDATA does not create an empty text node", () => {
  assert.deepEqual(html2json('<svg><![CDATA[]]><circle/></svg>'), D(E("svg", [E("circle")])));
});

test("p scope stops at SVG foreignObject instead of closing an outer HTML p", () => {
  assert.deepEqual(html2json('<p><svg><foreignObject><p>x</p></foreignObject></svg>'),
    D(E("p", [E("svg", [E("foreignobject", [E("p", [T("x")])])])])));
});

for (const tag of ["desc", "title"]) {
  test(`p scope stops at SVG ${tag}`, () => {
    assert.deepEqual(html2json(`<p><svg><${tag}><p>x</p></${tag}></svg>`),
      D(E("p", [E("svg", [E(tag, [E("p", [T("x")])])])])));
  });
}

test("p scope stops at MathML text integration points", () => {
  assert.deepEqual(html2json('<p><math><mtext><p>x</p></mtext></math>'),
    D(E("p", [E("math", [E("mtext", [E("p", [T("x")])])])])));
});

test("p scope stops at ordinary HTML object boundaries", () => {
  assert.deepEqual(html2json('<p><object><p>x</p></object>y'),
    D(E("p", [E("object", [E("p", [T("x")])]), T("y")])));
});

test("inner p still closes before a block within foreignObject", () => {
  assert.deepEqual(html2json('<svg><foreignObject><p>a<div>b</div>c</foreignObject></svg>'),
    D(E("svg", [E("foreignobject", [E("p", [T("a")]), E("div", [T("b")]), T("c")])])));
});

test("unmatched p end cannot close a p outside the foreign scope", () => {
  assert.deepEqual(html2json('<p><svg><foreignObject></p>x</foreignObject></svg>'),
    D(E("p", [E("svg", [E("foreignobject", [T("x")])])])));
});

test("foreign ordinary elements do not apply HTML implicit-closing rules", () => {
  assert.deepEqual(html2json('<svg><p><circle/></p><circle/></svg>'),
    D(E("svg", [E("p", [E("circle")]), E("circle")])));
});

test("many short comments complete in a bounded subprocess with exact siblings", () => {
  const child = spawnSync(process.execPath, ["--max-old-space-size=256", "-e", `
    const assert = require("node:assert/strict");
    const { html2json } = require(${JSON.stringify(require.resolve("../html2json.js"))});
    for (const comment of ["<!--x-->", "<!--x--!>"]) {
    const result = html2json(comment.repeat(30000) + "<p>last</p>");
    assert.equal(result.errors, undefined);
    assert.equal(result.children.length, 30001);
    for (const node of result.children.slice(0, -1)) assert.deepEqual(node, {type:"comment",value:"x"});
    assert.deepEqual(result.children.at(-1), {type:"element",tagName:"p",attributes:{},children:[{type:"text",value:"last"}]});
    }
  `], { timeout: 5000, encoding: "utf8" });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test("ASCII folding keeps offsets across chunk boundaries and surrogate pairs", () => {
  for (const size of [16382, 16383, 16384, 16385, 32767]) {
    const prefix = "A".repeat(size) + "😀İI\u0307";
    assert.deepEqual(html2json(prefix + "<SCRIPT>x</SCRIPT><p>y</p>"),
      D(T(prefix), E("script", [T("x")]), E("p", [T("y")])));
  }
  const name = "X-" + "A".repeat(20000) + "İ😀";
  assert.deepEqual(html2json(`<${name}>x</${name}>`), D(E("x-" + "a".repeat(20000) + "İ😀", [T("x")])));
});

test("large uppercase text parses and serializes under a bounded heap", () => {
  const child = spawnSync(process.execPath, ["--max-old-space-size=128", "-e", `
    const assert = require("node:assert/strict");
    const { html2json } = require(${JSON.stringify(require.resolve("../html2json.js"))});
    const input = "A".repeat(4 * 1024 * 1024);
    const result = html2json(input);
    assert.deepEqual(result, {type:"document",children:[{type:"text",value:input}]});
    assert.equal(JSON.parse(JSON.stringify(result)).children[0].value, input);
  `], { timeout: 15000, encoding: "utf8" });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});
