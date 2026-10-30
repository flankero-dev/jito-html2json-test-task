"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { html2json } = require("../html2json.js");
const T = value => ({type:"text", value});
const E = (tagName, children = [], attributes = {}) => ({type:"element", tagName, attributes, children});
const D = (...children) => ({type:"document", children});
// Browser DOM coalesces adjacent character tokens. This adapter merges only
// adjacent text; no elements, comments, whitespace or attributes are dropped.
function mergeText(node) {
  if (node.children) node.children = node.children.map(mergeText).reduce((nodes, child) => {
    if (child.type === "text" && nodes.at(-1)?.type === "text") nodes.at(-1).value += child.value;
    else nodes.push(child);
    return nodes;
  }, []);
  return node;
}
// Expected trees independently recorded with html5lib1.1 and Chromium153.
// Two etree fragment artifacts were corrected only after browser corroboration.
const tableCases = [
  {"input":"<table><tr><td>A<td>B<tr><th>C<td>D</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]},{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]},{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"th","attributes":{},"children":[{"type":"text","value":"C"}]},{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"D"}]}]}]}]}]}},
  {"input":"<table><td>A<td>B</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]},{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]}]}},
  {"input":"<table><caption>Title</caption><col><col><thead><tr><th>H<tbody><tr><td>D<tfoot><tr><td>F</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"caption","attributes":{},"children":[{"type":"text","value":"Title"}]},{"type":"element","tagName":"colgroup","attributes":{},"children":[{"type":"element","tagName":"col","attributes":{},"children":[]},{"type":"element","tagName":"col","attributes":{},"children":[]}]},{"type":"element","tagName":"thead","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"th","attributes":{},"children":[{"type":"text","value":"H"}]}]}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"D"}]}]}]},{"type":"element","tagName":"tfoot","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"F"}]}]}]}]}]}},
  {"input":"<table><colgroup><col><colgroup><col></table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"colgroup","attributes":{},"children":[{"type":"element","tagName":"col","attributes":{},"children":[]}]},{"type":"element","tagName":"colgroup","attributes":{},"children":[{"type":"element","tagName":"col","attributes":{},"children":[]}]}]}]}},
  {"input":"<table>before<tr><td>A</td></tr>after</table><p>last</p>","expected":{"type":"document","children":[{"type":"text","value":"beforeafter"},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]}]}]},{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"last"}]}]}},
  {"input":"<table><div>A<span>B</span></div><tr><td>C</table>","expected":{"type":"document","children":[{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"A"},{"type":"element","tagName":"span","attributes":{},"children":[{"type":"text","value":"B"}]}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"C"}]}]}]}]}]}},
  {"input":"<table><tr><td>A<table><tr><td>B</table>C<td>D</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]},{"type":"text","value":"C"}]},{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"D"}]}]}]}]}]}},
  {"input":"<table><tbody><tr><td><p>A<td>B<tbody><tr><td>C</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"A"}]}]},{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"C"}]}]}]}]}]}},
  {"input":"<div><table>x<!--c--><tr><td>y</table>z</div>","expected":{"type":"document","children":[{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"x"},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"comment","value":"c"},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"y"}]}]}]}]},{"type":"text","value":"z"}]}]}},
  {"input":"<table><caption><b>A</b><tbody><tr><td>B</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"caption","attributes":{},"children":[{"type":"element","tagName":"b","attributes":{},"children":[{"type":"text","value":"A"}]}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]}]}},
  {"input":"<table><colgroup> \n<col></colgroup><tr><td>x</td></tr></table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"colgroup","attributes":{},"children":[{"type":"text","value":" \n"},{"type":"element","tagName":"col","attributes":{},"children":[]}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"x"}]}]}]}]}]}},
  {"input":"<table><input type=hidden><tr><td>X</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"input","attributes":{"type":"hidden"},"children":[]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"X"}]}]}]}]}]}},
  {"input":"<table><script>x</script><style>x</style><tr><td>A</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"script","attributes":{},"children":[{"type":"text","value":"x"}]},{"type":"element","tagName":"style","attributes":{},"children":[{"type":"text","value":"x"}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]}]}]}]}},
  {"input":"<table><tr><td>A</td></tr></table><table><tr><td>B</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]}]}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]}]}},
  {"input":"<table><tr><td>A</table><p>B</p>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]}]}]},{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"B"}]}]}},
  {"input":"<table><thead><tr><th>A</thead><tfoot><tr><td>B</tfoot><tbody><tr><td>C</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"thead","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"th","attributes":{},"children":[{"type":"text","value":"A"}]}]}]},{"type":"element","tagName":"tfoot","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"C"}]}]}]}]}]}},
  {"input":"<table><tr><td>A</tr><tr><td>B</tr></table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]},{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]}]}},
  {"input":"<table><caption>A</caption><caption>B</caption><tbody><tr><td>C</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"caption","attributes":{},"children":[{"type":"text","value":"A"}]},{"type":"element","tagName":"caption","attributes":{},"children":[{"type":"text","value":"B"}]},{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"C"}]}]}]}]}]}},
  {"input":"<table><tr><td>A</td></tr><table><tr><td>B</table>","expected":{"type":"document","children":[{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"A"}]}]}]}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"B"}]}]}]}]}]}},
  {"input":"<a>one<a>two</a>three</a>","expected":{"type":"document","children":[{"type":"element","tagName":"a","attributes":{},"children":[{"type":"text","value":"one"}]},{"type":"element","tagName":"a","attributes":{},"children":[{"type":"text","value":"two"}]},{"type":"text","value":"three"}]}},
  {"input":"<nobr>one<nobr>two</nobr>three</nobr>","expected":{"type":"document","children":[{"type":"element","tagName":"nobr","attributes":{},"children":[{"type":"text","value":"one"}]},{"type":"element","tagName":"nobr","attributes":{},"children":[{"type":"text","value":"two"}]},{"type":"text","value":"three"}]}},
  {"input":"<p>first<div>second</div>third","expected":{"type":"document","children":[{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"first"}]},{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"second"}]},{"type":"text","value":"third"}]}},
 ];
for (const [i, fixture] of tableCases.entries()) test(`table and scope regression ${i + 1}`, () => {
  assert.deepEqual(mergeText(html2json(fixture.input)), fixture.expected);
});

for (const [input, value] of [
  ["&notin; &mdash; &copy &nbsp;", "∉ — © \u00a0"],
  ["&notit", "¬it"], ["&notin;", "∉"],
  ["&NotEqualTilde; &acE;", "≂̸ ∾̳"],
  ["&CounterClockwiseContourIntegral;", "∳"],
  ["&Afr; &fjlig;", "𝔄 fj"],
  ["&amp;notin;", "&notin;"],
  ["&AMP &quot &unknown;", '& " &unknown;'],
  ["&#128; &#x80 &#0; &#xD800; &#1114112;", "€ € � � �"],
  ["&#x; &#; &#65x &#x41z", "&#x; &#; Ax Az"]
]) test(`character references: ${input}`, () => {
  assert.deepEqual(html2json(`<p>${input}</p><textarea>${input}</textarea>`), D(E("p", [T(value)]), E("textarea", [T(value)])));
});

test("legacy references obey the ambiguous ampersand rule in all attribute quoting forms", () => {
  for (const quote of ['"', "'", ""]) {
    assert.deepEqual(html2json(`<p a=${quote}&notit${quote} b=${quote}&copy=1${quote} c=${quote}&copy${quote} d=${quote}&notin;${quote}></p>`),
      D(E("p", [], {a:"&notit", b:"&copy=1", c:"©", d:"∉"})));
  }
});
test("full references do not decode in RAWTEXT, PLAINTEXT or foreign CDATA", () => {
  const value = "&notin;&copy&NotEqualTilde;";
  assert.deepEqual(html2json(`<script>${value}</script><style>${value}</style><svg><![CDATA[${value}]]></svg><plaintext>${value}`),
    D(E("script", [T(value)]), E("style", [T(value)]), E("svg", [T(value)]), E("plaintext", [T(value)])));
});
test("NUL in tag and attribute tokenizer states becomes a replacement character", () => {
  assert.deepEqual(html2json('<x\0 data-\0="a\0b">z</x\0><p>after</p>'),
    D(E("x�", [T("z")], {"data-�":"a�b"}), E("p", [T("after")])));
  assert.deepEqual(html2json('<svg viewbo\0x="x" __proto__="a\0b"/>'),
    D(E("svg", [], JSON.parse('{"viewbo�x":"x","__proto__":"a�b"}'))));
});
test("prototype-like attribute keys remain own data after expanded decoding", () => {
  const attrs = JSON.parse('{"__proto__":"∉","constructor":"©","prototype":"∳","tostring":"𝔄","valueof":"fj","hasownproperty":"¬it","tojson":"&copy=1"}');
  const html = '<svg __proto__="&notin;" constructor="&copy" prototype="&CounterClockwiseContourIntegral;" toString="&Afr;" valueOf="&fjlig;" hasOwnProperty="&notit;" toJSON="&copy=1"/>';
  // &notit; has a legacy &not match, but attributes retain the entire ambiguous spelling.
  attrs.hasownproperty = "&notit;";
  const actual = html2json(html);
  assert.deepEqual(actual, D(E("svg", [], attrs)));
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), actual);
  assert.equal(Object.getPrototypeOf(actual.children[0].attributes), Object.prototype);
});
test("implicit table nodes count towards the node budget", () => {
  const result = html2json('<br>'.repeat(49998) + '<table><tr><td>last');
  assert.equal(result.children.length, 49999);
  assert.deepEqual(result.children.at(-1), E("table", [E("tbody")]));
  assert.match(result.errors[0], /Node limit/);
  assert.doesNotThrow(() => JSON.stringify(result));
});
test("implicit table nodes respect the depth budget", () => {
  const result = html2json('<x>'.repeat(509) + '<table><tr><td>x');
  assert.match(result.errors[0], /Nesting depth limit/);
  let node = result; while (node.children?.[0]) node = node.children[0];
  assert.equal(node.tagName, "tbody");
  assert.doesNotThrow(() => JSON.stringify(result));
});

// Regression for insertion location after implicit p closure, independently
// reproduced against Chromium before repairing the new table implementation.
test("foster location after scope change 1", () => {
  assert.deepEqual(mergeText(html2json("<table><p>a<p>b<tr><td>c</table>")), {"type":"document","children":[{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"a"}]},{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"b"}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"c"}]}]}]}]}]});
});
test("foster location after scope change 2", () => {
  assert.deepEqual(mergeText(html2json("<table><p>a<div>b</div><tr><td>c</table>")), {"type":"document","children":[{"type":"element","tagName":"p","attributes":{},"children":[{"type":"text","value":"a"}]},{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"b"}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"c"}]}]}]}]}]});
});
test("foster location after scope change 3", () => {
  assert.deepEqual(mergeText(html2json("<table><div>a<div>b</div></div><tr><td>c</table>")), {"type":"document","children":[{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"a"},{"type":"element","tagName":"div","attributes":{},"children":[{"type":"text","value":"b"}]}]},{"type":"element","tagName":"table","attributes":{},"children":[{"type":"element","tagName":"tbody","attributes":{},"children":[{"type":"element","tagName":"tr","attributes":{},"children":[{"type":"element","tagName":"td","attributes":{},"children":[{"type":"text","value":"c"}]}]}]}]}]});
});
