"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { html2json } = require("../html2json.js");

const doc = html => html2json(html);
const items = node => node.children.filter(child => child.type === "element");
const first = html => items(doc(html))[0];
const textOf = node => node.children.filter(n => n.type === "text").map(n => n.value).join("");

test("empty string and null produce a document with an empty children array", () => {
  assert.deepEqual(doc(""), { type: "document", children: [] });
  assert.deepEqual(doc(null), { type: "document", children: [] });
});

test("text input remains text (including whitespace and stray angle brackets)", () => {
  assert.deepEqual(doc("  A < B and X > Y  ").children, [
    { type: "text", value: "  A < B and X > Y  " }
  ]);
  assert.equal(textOf(first("<p>1 < 2 and 3 > 2</p>")), "1 < 2 and 3 > 2");
});

test("nested elements, ordered siblings and mixed text are preserved", () => {
  assert.deepEqual(doc("<p>Hello <b>world</b>!</p>"), {
    type: "document", children: [{
      type: "element", tagName: "p", attributes: {}, children: [
        { type: "text", value: "Hello " },
        { type: "element", tagName: "b", attributes: {}, children: [{ type: "text", value: "world" }] },
        { type: "text", value: "!" }
      ]
    }]
  });
  assert.equal(items(doc("<a>A</a><a>B</a>")).length, 2);
});

test("quoted > and < do not terminate a tag; unquoted > terminates an attribute", () => {
  const el = first(`<div title="1 > 0 and 0 < 1" data-check='x > y' id=test>OK</div>`);
  assert.equal(el.attributes.title, "1 > 0 and 0 < 1");
  assert.equal(el.attributes["data-check"], "x > y");
  assert.equal(el.attributes.id, "test");
  assert.equal(textOf(el), "OK");
  const odd = first("<a title='x<y>z'>link</a>");
  assert.equal(odd.attributes.title, "x<y>z");
});

test("boolean, duplicate, escaped and prototype-key attributes", () => {
  const el = first(`<input disabled checked="" title="Tom &amp; Jerry" ID="A" id="B" toString="custom" __proto__="x">`);
  assert.equal(el.attributes.disabled, "");
  assert.equal(el.attributes.checked, "");
  assert.equal(el.attributes.title, "Tom & Jerry");
  assert.equal(el.attributes.id, "A");
  assert.equal(Object.getOwnPropertyDescriptor(el.attributes, "__proto__").value, "x");
  assert.equal(el.attributes.tostring, "custom");
  assert.equal(JSON.parse(JSON.stringify(el)).attributes.__proto__, "x");
});

test("common named, decimal, hex entities and invalid numeric references", () => {
  assert.equal(textOf(first("<p>&amp; &copy; &#169; &#x1F600; &lt;hi&gt; &unknown; &#0; &#xD800;</p>")),
    "& © © 😀 <hi> &unknown; � �");
  assert.equal(textOf(first("<p>&#128; &#x80; &nbsp; &mdash;</p>")), "€ € \u00a0 —");
});

test("comments and doctype preserved as separate nodes", () => {
  assert.deepEqual(doc("<!DOCTYPE html><!-- A <b> B --><p>x</p>").children.slice(0, 2), [
    { type: "doctype", value: "html" },
    { type: "comment", value: " A <b> B " }
  ]);
  assert.equal(doc("<!-- no close").children[0].value, " no close");
});

test("doctype supports quoted > and bracketed internal subset", () => {
  const result = doc('<!DOCTYPE html [ <!ENTITY x "a>b"> ]><p>x</p>');
  assert.equal(result.children[0].type, "doctype");
  assert.equal(result.children[0].value, 'html [ <!ENTITY x "a>b"> ]');
  assert.equal(items(result)[0].tagName, "p");
});

test("void tags do not swallow their later siblings", () => {
  const el = first('<div><img src="x"><br/><input checked>after</div>');
  assert.deepEqual(items(el).map(x => x.tagName), ["img", "br", "input"]);
  assert.equal(textOf(el), "after");
});

test("slash on non-void HTML elements is ignored (HTML5 behavior)", () => {
  const el = first("<div/>following");
  assert.equal(textOf(el), "following");
});

test("explicit self-closing SVG nodes have no children", () => {
  const svg = first('<svg viewBox="0 0 2 2"><path d="x"/><circle r="1"/></svg>');
  assert.deepEqual(items(svg).map(x => x.tagName), ["path", "circle"]);
  assert.deepEqual(items(svg)[0].children, []);
  assert.deepEqual(items(svg)[1].children, []);
});

test("script/style content is raw, including <, >, entities and fake tags", () => {
  const root = doc('<script>if (a < b) { x = "<div>"; y = "&amp;"; }</script><style>.x{content:"<b> >"}</style>');
  const script = items(root)[0];
  const style = items(root)[1];
  assert.equal(textOf(script), 'if (a < b) { x = "<div>"; y = "&amp;"; }');
  assert.equal(textOf(style), '.x{content:"<b> >"}');
});

test("script only ends on matching tag with boundary, case insensitive", () => {
  const script = first("<SCRIPT>before </scripture> < 3</ScRiPt><p>after</p>");
  assert.equal(textOf(script), "before </scripture> < 3");
});

test("title/textarea preserve literal tags but decode character references", () => {
  const root = doc("<title>1 < 2 &amp;</title><textarea><b>literal</b> &copy;</textarea>");
  assert.equal(textOf(items(root)[0]), "1 < 2 &");
  assert.equal(textOf(items(root)[1]), "<b>literal</b> ©");
  assert.equal(items(items(root)[1]).length, 0);
});

test("a would-be raw-text closing tag missing > stays raw text", () => {
  assert.equal(textOf(first("<script>one </script no end")), "one </script no end");
});

test("unclosed raw-text element takes the rest as a text node", () => {
  assert.equal(textOf(first("<script>if(a<b){} <div>")), "if(a<b){} <div>");
});

test("optional li closing works for siblings and nested lists", () => {
  const ul = first("<ul><li>One<li>Two<ul><li>Inner<li>Inner2</ul><li>Three</ul>");
  const li = items(ul);
  assert.equal(li.length, 3);
  assert.deepEqual(li.map(textOf), ["One", "Two", "Three"]);
  assert.equal(items(items(li[1])[0]).length, 2);
});

test("a block start implicitly closes p, even if inline elements were open", () => {
  const tree = doc("<p>one<span>two<div>three</div><p>four</p>");
  assert.deepEqual(items(tree).map(x => x.tagName), ["p", "div", "p"]);
  assert.equal(textOf(items(items(tree)[0])[0]), "two");
});

test("optional dt/dd, option, tr and table cell closing", () => {
  assert.deepEqual(items(first("<dl><dt>A<dd>B<dt>C</dl>")).map(x => x.tagName), ["dt", "dd", "dt"]);
  assert.equal(items(first("<select><option>A<option>B</select>")).length, 2);
  const table = first("<table><tbody><tr><td>A<td>B<tr><th>C<td>D</tbody></table>");
  const rows = items(items(table)[0]);
  assert.equal(rows.length, 2);
  assert.deepEqual(items(rows[0]).map(x => x.tagName), ["td", "td"]);
  assert.deepEqual(items(rows[1]).map(x => x.tagName), ["th", "td"]);
});

test("incorrect nesting recovers by closing matching ancestor, stray ends ignored", () => {
  const div = first("</x><div><b><i>A</b>B</i><p>C</p></div></missing>");
  assert.deepEqual(div.children.map(n => n.type === "element" ? n.tagName : n.value), ["b", "B", "p"]);
  assert.equal(textOf(items(items(div)[0])[0]), "A");
});

test("malformed / incomplete tags are text, not incomplete element objects", () => {
  assert.deepEqual(doc('<div title="unterminated > value'), {
    type: "document", children: [{ type: "text", value: '<div title="unterminated > value' }]
  });
  assert.equal(textOf(first("<p>a < 3 then > and b</p>")), "a < 3 then > and b");
});

test("root fragment can have several top-level nodes without synthetic html/body", () => {
  assert.deepEqual(doc("hello<br>world").children.map(x => x.type), ["text", "element", "text"]);
});

test("long text and many sibling nodes can be parsed and serialized", () => {
  const bigText = "xyz <> &amp; ".repeat(10000);
  const el = first("<div>" + bigText + "</div>");
  assert.equal(textOf(el), bigText.replaceAll("&amp;", "&"));
  const many = doc("<i>x</i>".repeat(2000));
  assert.equal(items(many).length, 2000);
  assert.doesNotThrow(() => JSON.stringify(many, null, 2));
});

test("depth and node budgets report truncation rather than crashing", () => {
  const deep = doc("<div>".repeat(600) + "x" + "</div>".repeat(600));
  assert.match(deep.errors[0], /Nesting depth limit/);
  assert.doesNotThrow(() => JSON.stringify(deep, null, 2));
  const many = doc("x<br>".repeat(30000));
  assert.match(many.errors[0], /Node limit/);
  assert.doesNotThrow(() => JSON.stringify(many));
});

test("deterministic malformed-input sweep always returns serializable JSON", () => {
  const chars = `< > / = \" \' ! & ; 0 a b c \n`.replaceAll(" ", "");
  let seed = 17379;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  }
  for (let index = 0; index < 400; index++) {
    let input = "";
    const size = 1 + Math.floor(random() * 250);
    for (let j = 0; j < size; j++) input += chars[Math.floor(random() * chars.length)];
    const result = doc(input);
    assert.equal(result.type, "document");
    assert.doesNotThrow(() => JSON.stringify(result));
  }
});

test("all shipped HTML samples parse, serialize and keep expected root type", () => {
  const folder = path.join(__dirname, "..", "html_samples");
  const files = fs.readdirSync(folder).filter(name => name.endsWith(".html"));
  assert.ok(files.length >= 12);
  for (const file of files) {
    const source = fs.readFileSync(path.join(folder, file), "utf8");
    const result = doc(source);
    assert.equal(result.type, "document", file);
    assert.ok(Array.isArray(result.children), file);
    assert.doesNotThrow(() => JSON.stringify(result, null, 2), file);
  }
});

test("all three original index.html buttons work with unmodified function names", () => {
  const htmlField = { value: "" };
  const jsonField = { textContent: "" };
  const document = { getElementById(id) { return id === "html" ? htmlField : jsonField; } };
  const context = vm.createContext({ document });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "html2json.js"), "utf8"), context);
  vm.runInContext("showExample1(); convertHtml2JsonAndSet();", context);
  assert.match(htmlField.value, /<!DOCTYPE html>/);
  assert.equal(JSON.parse(jsonField.textContent).type, "document");
  vm.runInContext("showExample2(); convertHtml2JsonAndSet();", context);
  assert.match(htmlField.value, /<textarea>/);
  assert.equal(JSON.parse(jsonField.textContent).type, "document");
  htmlField.value = '<p title="x > y">x</p>';
  vm.runInContext("convertHtml2JsonAndSet();", context);
  assert.equal(JSON.parse(jsonField.textContent).children[0].attributes.title, "x > y");
});

// Each shipped input is checked against independently specified semantic
// expectations. A separate smoke test above checks that every sample serializes.
const sample = number => fs.readFileSync(path.join(__dirname, "..", "html_samples",
  `${String(number).padStart(2, "0")}-${[
    "full-document", "mixed-content", "attributes-and-inequalities", "script-style",
    "entities", "comments-doctype", "optional-li", "optional-p", "bad-nesting",
    "void-tags", "textarea-title", "malformed", "table", "svg"
  ][number - 1]}.html`), "utf8");
const tags = node => items(node).map(child => child.tagName);

test("sample 01: full document has DOCTYPE, correctly ordered sections, attributes and text", () => {
  const root = doc(sample(1));
  assert.deepEqual(root.children.map(n => n.type), ["doctype", "text", "element", "text"]);
  assert.equal(root.children[0].value, "html");
  assert.equal(root.children[1].value, "\n");
  const html = items(root)[0];
  assert.equal(html.tagName, "html");
  assert.deepEqual(html.attributes, { lang: "en" });
  assert.deepEqual(tags(html), ["head", "body"]);
  const [head, body] = items(html);
  assert.deepEqual(tags(head), ["meta", "meta", "title", "link"]);
  assert.deepEqual(items(head).map(el => el.attributes), [
    { charset: "UTF-8" }, { name: "viewport" }, {}, { rel: "stylesheet", href: "styles.css" }
  ]);
  assert.equal(textOf(items(head)[2]), "Sample HTML");
  assert.deepEqual(tags(body), ["header", "nav", "main", "footer", "script"]);
  assert.equal(textOf(items(items(body)[0])[0]), "Welcome to My Website");
  const links = items(items(items(body)[1])[0]).map(li => items(li)[0]);
  assert.deepEqual(links.map(x => [x.attributes.href, textOf(x)]),
    [["#home", "Home"], ["#about", "About"]]);
  assert.equal(textOf(items(items(body)[3])[0]), "© 2024 My Website");
  assert.equal(items(body)[4].attributes.src, "script.js");
  assert.deepEqual(items(body)[4].children, []);
});

test("sample 02: complete ordered mixed-content tree, including whitespace", () => {
  assert.deepEqual(doc(sample(2)), {
    type: "document", children: [{
      type: "element", tagName: "div", attributes: {}, children: [
        { type: "text", value: "Before " },
        { type: "element", tagName: "em", attributes: {}, children: [{ type: "text", value: "emphasis" }] },
        { type: "text", value: " and " },
        { type: "element", tagName: "strong", attributes: {}, children: [{ type: "text", value: "bold" }] },
        { type: "text", value: " after." }
      ]
    }, { type: "text", value: "\n" }]
  });
});

test("sample 03: attributes containing < and >, boolean and unquoted values", () => {
  const el = first(sample(3));
  assert.deepEqual(el.attributes, {
    title: "2 > 1 and 1 < 2", "data-math": "a < b > c", disabled: "", "data-x": "hello&world"
  });
  assert.deepEqual(el.children, [{ type: "text", value: "2 < 3 and 5 > 4" }]);
});

test("sample 04: script and style preserve literal markup, entities, and node order", () => {
  const root = doc(sample(4));
  assert.deepEqual(root.children.map(n => n.type === "element" ? n.tagName : n.type),
    ["script", "text", "style", "text"]);
  assert.equal(textOf(items(root)[0]), 'const x = "<div>"; if (a < b && c > d) console.log("&amp;");');
  assert.equal(textOf(items(root)[1]), '.a::after { content: "<b> &amp; >"; }');
  assert.equal(root.children[1].value, "\n");
});

test("sample 05: entities in text and attributes, including unknown names", () => {
  const p = first(sample(5));
  assert.deepEqual(p.attributes, { title: "Tom & Jerry" });
  assert.deepEqual(p.children, [{ type: "text", value: "© © 😀 <tag> \u00a0 &madeup;" }]);
});

test("sample 06: DOCTYPE, document comment, and nested comment all retain positions", () => {
  const root = doc(sample(6));
  assert.deepEqual(root.children.slice(0, 2), [
    { type: "doctype", value: "html" },
    { type: "comment", value: " <div>not an element</div> " }
  ]);
  assert.deepEqual(items(root)[0].children, [{ type: "comment", value: " unfinished? " }]);
});

test("sample 07: optional li closures preserve three peers and nested list", () => {
  const ul = first(sample(7));
  assert.deepEqual(tags(ul), ["li", "li", "li"]);
  assert.deepEqual(items(ul).map(textOf), ["First", "Second", "Third"]);
  assert.deepEqual(tags(items(ul)[1]), ["ul"]);
  assert.deepEqual(items(items(ul)[1])[0].children.map(el => [el.tagName, textOf(el)]),
    [["li", "Nested"], ["li", "Nested 2"]]);
});

test("sample 08: an intervening block implicitly closes p and inline descendants", () => {
  const root = doc(sample(8));
  assert.deepEqual(tags(root), ["p", "div"]);
  const [p, div] = items(root);
  assert.deepEqual(p.children.map(n => n.tagName || n.value), ["first", "span"]);
  assert.equal(textOf(items(p)[0]), " part");
  assert.deepEqual(div.children.map(n => n.tagName || n.value), ["block", "p"]);
  assert.equal(textOf(items(div)[0]), "second");
});

test("sample 09: mismatched end closes ancestors but not later siblings", () => {
  const root = doc(sample(9));
  const div = items(root)[0];
  assert.deepEqual(div.children.map(n => n.tagName || n.value), ["b", "world", "p"]);
  assert.deepEqual(tags(items(div)[0]), ["i"]);
  assert.equal(textOf(items(items(div)[0])[0]), "hello");
  assert.equal(textOf(items(div)[1]), "ok");
  assert.equal(root.children.at(-1).value, "\n");
});

test("sample 10: void elements, their attributes, and following text", () => {
  const div = first(sample(10));
  assert.deepEqual(tags(div), ["img", "br", "input", "hr"]);
  assert.deepEqual(items(div).map(x => x.attributes), [
    { src: "x.png", alt: "Hi" }, {}, { type: "checkbox", checked: "" }, {}
  ]);
  assert.equal(div.children.at(-1).value, "Done");
});

test("sample 11: RCDATA respects literal tags but decodes entities", () => {
  const root = doc(sample(11));
  assert.deepEqual(tags(root), ["title", "textarea"]);
  assert.deepEqual(items(root)[0].children, [{ type: "text", value: "1 < 2 & 3" }]);
  assert.deepEqual(items(root)[1].children, [{ type: "text", value: "text <b>literal</b> ©" }]);
});

test("sample 12: unfinished quoted attribute stays literal without invented nodes", () => {
  assert.deepEqual(doc(sample(12)), {
    type: "document", children: [{ type: "text", value: sample(12) }]
  });
});

test("sample 13: table row and cell implied ends preserve row/column order", () => {
  const tbody = items(first(sample(13)))[0];
  assert.deepEqual(tags(tbody), ["tr", "tr"]);
  assert.deepEqual(items(tbody).map(row => items(row).map(cell => [cell.tagName, textOf(cell)])), [
    [["td", "A"], ["td", "B"]], [["th", "C"], ["td", "D"]]
  ]);
});

test("sample 14: SVG canonical viewBox and two self-closing siblings", () => {
  const root = first(sample(14));
  assert.deepEqual(root.attributes, { viewBox: "0 0 10 10" });
  assert.equal(Object.hasOwn(root.attributes, "viewbox"), false);
  assert.deepEqual(tags(root), ["path", "circle"]);
  assert.deepEqual(items(root).map(x => x.attributes), [
    { d: "M0 0 L10 10" }, { cx: "5", cy: "5", r: "2" }
  ]);
  assert.deepEqual(items(root).map(x => x.children), [[], []]);
});

test("eacute and hearts decode in text, HTML attributes, and RCDATA only once", () => {
  const input = '<p title="&eacute; &hearts; &unknown;">&eacute; &hearts; &amp;eacute;</p>' +
    '<textarea>&eacute; &hearts;</textarea><script>"&eacute; &hearts;"</script>';
  const [p, textarea, script] = items(doc(input));
  assert.equal(p.attributes.title, "é ♥ &unknown;");
  assert.equal(textOf(p), "é ♥ &eacute;");
  assert.equal(textOf(textarea), "é ♥");
  assert.equal(textOf(script), '"&eacute; &hearts;"');
});

test("SVG attribute casing is adjusted only in SVG context, not ordinary HTML", () => {
  const [div, svg] = items(doc('<div viewBox="oops"></div><svg viewbox="0 0 4 4" preserveaspectratio="none">' +
    '<path pathLength="12"/><linearGradient gradientUnits="userSpaceOnUse"/></svg>'));
  assert.deepEqual(div.attributes, { viewbox: "oops" });
  assert.deepEqual(svg.attributes, { viewBox: "0 0 4 4", preserveAspectRatio: "none" });
  assert.deepEqual(items(svg).map(n => n.attributes), [
    { pathLength: "12" }, { gradientUnits: "userSpaceOnUse" }
  ]);
});

test("huge unfinished attributes are retained as one text node, without losing a valid prefix", () => {
  for (const n of [100, 1000, 9000]) {
    const broken = '<a title="'.repeat(n);
    assert.deepEqual(doc(broken), { type: "document", children: [{ type: "text", value: broken }] });
    const result = doc('<p>safe</p>' + broken);
    assert.deepEqual(tags(result), ["p"]);
    assert.equal(textOf(items(result)[0]), "safe");
    assert.deepEqual(result.children[1], { type: "text", value: broken });
  }
});

test("huge incomplete script/style closing candidates keep raw text intact", () => {
  const broken = '</script title="'.repeat(9000);
  const root = doc('<script>start ' + broken);
  assert.deepEqual(tags(root), ["script"]);
  assert.deepEqual(items(root)[0].children, [{ type: "text", value: 'start ' + broken }]);
  const styleBroken = '</style title="'.repeat(2000);
  assert.equal(textOf(first('<style>' + styleBroken)), styleBroken);
});

test("malformed-at-EOF recovery still processes valid later markup after a stray '<'", () => {
  assert.deepEqual(doc('x < 3 <b>yes</b>').children, [
    { type: "text", value: 'x < 3 ' },
    { type: "element", tagName: "b", attributes: {}, children: [{ type: "text", value: "yes" }] }
  ]);
  assert.deepEqual(doc('before </p test="unterminated <b>ignored</b>').children,
    [{ type: "text", value: 'before </p test="unterminated <b>ignored</b>' }]);
});

test("performance regression: 9000 incomplete attributes complete in a bounded subprocess", () => {
  const { spawnSync } = require("node:child_process");
  const child = spawnSync(process.execPath, ["-e", `
    const { html2json } = require(${JSON.stringify(path.join(__dirname, "..", "html2json.js"))});
    const html = '<a title="'.repeat(9000);
    const result = html2json(html);
    if (result.children.length !== 1 || result.children[0].value !== html) process.exit(2);
  `], { timeout: 2000, encoding: "utf8" });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test("sample 15: named entities and canonical SVG attributes have exact trees", () => {
  const root = doc(fs.readFileSync(path.join(__dirname, "..", "html_samples", "15-entities-svg-attributes.html"), "utf8"));
  assert.deepEqual(root.children.map(n => n.tagName || n.type), ["p", "text", "svg", "text"]);
  const [p, svg] = items(root);
  assert.deepEqual(p.attributes, { title: "Café & ♥" });
  assert.deepEqual(p.children, [{ type: "text", value: "Café ♥ &unknown;" }]);
  assert.deepEqual(svg.attributes, { viewBox: "0 0 20 20", preserveAspectRatio: "none" });
  assert.deepEqual(tags(svg), ["path"]);
  assert.deepEqual(items(svg)[0].attributes, { pathLength: "10", d: "M0 0 L20 20" });
  assert.deepEqual(items(svg)[0].children, []);
});

test("sample 16: valid prefix remains structured; unfinished attribute is literal remainder", () => {
  const root = doc(fs.readFileSync(path.join(__dirname, "..", "html_samples", "16-unterminated-attribute.html"), "utf8"));
  assert.deepEqual(tags(root), ["div"]);
  assert.equal(textOf(items(root)[0]), "Still valid");
  assert.deepEqual(root.children[1], {
    type: "text", value: '<a title="never closed <p>not a new element</p>\n'
  });
});

// HTML Standard "in body" / RAWTEXT / PLAINTEXT edge cases.
// These test complete expected JSON trees, not only non-throw behavior.
const el = (tagName, attributes, children) => ({type: "element", tagName, attributes, children});
const txt = value => ({type: "text", value});
const tree = (...children) => ({type: "document", children});
const sampleFile = number => fs.readFileSync(path.join(__dirname, "..", "html_samples",
  fs.readdirSync(path.join(__dirname, "..", "html_samples"))
    .find(name => name.startsWith(String(number).padStart(2, "0") + "-") && name.endsWith(".html"))), "utf8");

test("sample 17: a heading start implicitly closes the current heading", () => {
  assert.deepEqual(doc(sampleFile(17)), tree(
    el("h1", {}, [txt("First")]),
    el("h2", {}, [txt("Second")])
  ));
});

test("sample 18: li starts after closing an open p", () => {
  assert.deepEqual(doc(sampleFile(18)), tree(
    el("p", {}, [txt("Before")]),
    el("li", {}, [txt("First")])
  ));
});

test("sample 19: nested button start closes the previous button", () => {
  assert.deepEqual(doc(sampleFile(19)), tree(
    el("button", {}, [txt("A")]),
    el("button", {}, [txt("B")])
  ));
});

test("sample 20: plaintext consumes all following markup and entities literally", () => {
  assert.deepEqual(doc(sampleFile(20)), tree(
    el("plaintext", {}, [txt("A<b>B</b>&amp;C")])
  ));
});

test("sample 21: xmp contents are RAWTEXT and parsing resumes after the matching end tag", () => {
  assert.deepEqual(doc(sampleFile(21)), tree(
    el("xmp", {title: "2 > 1"}, [txt("A<b>B</b>&amp;C")]),
    el("p", {}, [txt("after")])
  ));
});

test("sample 22: iframe fallback contents are RAWTEXT and parsing resumes after closing", () => {
  assert.deepEqual(doc(sampleFile(22)), tree(
    el("iframe", {title: "2 > 1"}, [txt("A<b>B</b>&amp;C")]),
    el("p", {}, [txt("after")])
  ));
});

test("new heading start closes only a *current* heading; open inline nesting is not forcibly rearranged", () => {
  assert.deepEqual(doc("<h1>A<h2>B</h2>"), tree(
    el("h1", {}, [txt("A")]), el("h2", {}, [txt("B")])
  ));
});

test("opening a new button ends an earlier button even when phrasing content is open", () => {
  assert.deepEqual(doc("<button><span>A<button>B</button>"), tree(
    el("button", {}, [el("span", {}, [txt("A")])]),
    el("button", {}, [txt("B")])
  ));
});

test("li, dt and dd close an open p; iframe does not close p", () => {
  assert.deepEqual(doc("<p>A<dt>B<dd>C"), tree(
    el("p", {}, [txt("A")]),
    el("dt", {}, [txt("B")]), el("dd", {}, [txt("C")])
  ));
  assert.deepEqual(doc("<p>A<iframe>X &amp;</iframe>Y</p>"), tree(
    el("p", {}, [txt("A"), el("iframe", {}, [txt("X &amp;")]), txt("Y")])
  ));
});

test("xmp and plaintext close an open p; the latter treats even its own closing tag as text", () => {
  assert.deepEqual(doc("<p>A<xmp><b>&amp;</xmp><i>Z</i>"), tree(
    el("p", {}, [txt("A")]),
    el("xmp", {}, [txt("<b>&amp;")]),
    el("i", {}, [txt("Z")])
  ));
  assert.deepEqual(doc("<p>A<plaintext>hi</plaintext><b>X</b> &hearts;"), tree(
    el("p", {}, [txt("A")]),
    el("plaintext", {}, [txt("hi</plaintext><b>X</b> &hearts;")])
  ));
});

test("raw-text matching is case-insensitive, and non-matching close strings remain literal", () => {
  assert.deepEqual(doc("<XMP>left </xmps> > &amp;</XmP><p>right</p>"), tree(
    el("xmp", {}, [txt("left </xmps> > &amp;")]), el("p", {}, [txt("right")])
  ));
  assert.deepEqual(doc("<iframe>a </iframed> <b> &lt;</iframe>z"), tree(
    el("iframe", {}, [txt("a </iframed> <b> &lt;")]), txt("z")
  ));
});


// Regression: HTML's RAWTEXT/RCDATA tokenizer modes must not be selected for
// foreign SVG/MathML elements (especially after a self-closing '/>').
const E = (tagName, children = [], attributes = {}) =>
  ({ type: "element", tagName, attributes, children });
const T = value => ({ type: "text", value });
const D = (...children) => ({ type: "document", children });

test("SVG self-closing script does not swallow following circle", () => {
  assert.deepEqual(doc('<svg><script/><circle cx="1"/></svg>'),
    D(E("svg", [E("script"), E("circle", [], { cx: "1" })])));
});

test("SVG self-closing style does not swallow following circle", () => {
  assert.deepEqual(doc("<svg><style/><circle/></svg>"),
    D(E("svg", [E("style"), E("circle")])));
});

test("SVG self-closing title does not swallow following circle", () => {
  assert.deepEqual(doc("<svg><title/><circle/></svg>"),
    D(E("svg", [E("title"), E("circle")])));
});

test("SVG non-self-closing script has ordinary child elements and closes correctly", () => {
  assert.deepEqual(doc("<svg><script><circle/></script><circle/></svg>"),
    D(E("svg", [E("script", [E("circle")]), E("circle")])));
});

test("SVG non-self-closing style likewise keeps nested elements as nodes", () => {
  assert.deepEqual(doc("<svg><style><circle/></style><circle/></svg>"),
    D(E("svg", [E("style", [E("circle")]), E("circle")])));
});

test("MathML self-closing style/title do not consume subsequent sibling", () => {
  assert.deepEqual(doc("<math><style/><title/><mi>x</mi></math>"),
    D(E("math", [E("style"), E("title"), E("mi", [T("x")])])));
});

test("MathML non-self-closing script parses nested MathML child", () => {
  assert.deepEqual(doc("<math><script><mi>x</mi></script><mi>y</mi></math>"),
    D(E("math", [E("script", [E("mi", [T("x")])]), E("mi", [T("y")])])));
});

test("HTML script/style/textarea/title keep distinct special text modes even with '/>'", () => {
  assert.deepEqual(doc('<script/>a<b</script><style/>a<b</style><textarea/><b>hi</b>&amp;</textarea><title/>A &amp; B</title><p>end</p>'),
    D(E("script", [T("a<b")]), E("style", [T("a<b")]),
      E("textarea", [T("<b>hi</b>&")]), E("title", [T("A & B")]), E("p", [T("end")])));
});

test("SVG foreignObject HTML integration point preserves raw HTML script and next SVG node", () => {
  assert.deepEqual(doc("<svg><foreignObject><script>if(a<b){}</script><p>yes</p></foreignObject><circle/></svg>"),
    D(E("svg", [E("foreignobject", [E("script", [T("if(a<b){}")]),
      E("p", [T("yes")])]), E("circle")])));
});

test("non-special foreign text decodes character references like normal text", () => {
  assert.deepEqual(doc("<svg><script>A &amp; B<circle/></script></svg>"),
    D(E("svg", [E("script", [T("A & B"), E("circle")])])));
});
