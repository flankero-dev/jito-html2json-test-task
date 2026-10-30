# HTML to JSON — Jito Intern Test Task

A dependency-free JavaScript implementation of `html2json(htmlText)`. It converts HTML into a JSON-compatible tree without using `DOMParser`, browser DOM parsing, or external HTML-parser libraries. The provided `index.html` is unchanged.

## Run

Open `index.html` in a browser. Enter HTML or choose an example, then click **Convert to JSON**.

To run the checks (Node.js 18+; no installation of dependencies required):

```sh
npm test
npm run check
npm run benchmark
```

## Output format

The function returns a document node containing ordered child nodes. For example:

**Input**

```html
<p class="intro">Hello <strong>world</strong>!</p>
```

**Output**

```json
{
  "type": "document",
  "children": [
    {
      "type": "element",
      "tagName": "p",
      "attributes": { "class": "intro" },
      "children": [
        { "type": "text", "value": "Hello " },
        {
          "type": "element",
          "tagName": "strong",
          "attributes": {},
          "children": [{ "type": "text", "value": "world" }]
        },
        { "type": "text", "value": "!" }
      ]
    }
  ]
}
```

The supported node types are `document`, `element`, `text`, `comment`, and `doctype`. Multiple root nodes are allowed. An empty string returns `{ "type": "document", "children": [] }`. Whitespace-only text is preserved. No implicit `html`, `head`, or `body` wrappers are inserted. Table rules can insert `tbody`, `tr`, and `colgroup`. Element names use ASCII lowercase throughout the JSON schema, including SVG; non-ASCII characters are preserved.

## Implementation

A character-scanning tokenizer reads tags, attributes, comments, declarations, and text. A stack-based tree builder preserves nesting and sibling order. The parser handles quoted attribute values, HTML void elements, common optional end tags, and the complete static HTML named character reference set (including legacy forms and attribute-context rules). Numeric references include HTML replacement mappings. Data attribution is in [ENTITY_DATA_NOTICE.md](ENTITY_DATA_NOTICE.md). It also distinguishes HTML text modes (`script`, `style`, `title`, `textarea`, etc.) from SVG/MathML content, reads foreign-content CDATA literally, and respects HTML paragraph scope boundaries at integration points. Script scanning includes escaped and double-escaped states. Table rules handle omitted cells/rows/groups and foster misplaced content before the table; deferred insertion avoids repeated array splicing.

For incomplete or mismatched markup, recovery is deterministic: unmatched named closing tags and empty `</>` tags are ignored, invalid tag starts/end names remain literal, and incomplete tags or DOCTYPE declarations at the end of input are kept as text. Parsing stops with an `errors` field before exceeding **50,000 output nodes** or **511 nested element levels** (the internal stack limit is 512, including the document root). These limits prevent some excessive structures, but do not strictly bound memory or processing time for every input.

## Known limitations

This is **not a full HTML5 browser parser**. In particular:

- The full HTML5 document insertion-mode machine, active formatting list/adoption agency algorithm, and complete table/template/form/select interactions are not implemented. Typical table structures and foster parenting are supported; complex malformed combinations can still differ from a browser.
- SVG/MathML namespace behavior and integration points are supported partially; full foreign-content breakout is not implemented. Element names intentionally use ASCII lowercase. Foreign CDATA follows the current-node namespace rule in the HTML Standard, which differs from Chromium 153 at some integration points.
- Source whitespace is preserved: CR/CRLF normalization and leading-newline removal in `pre`/`textarea` are not applied. DOCTYPE values preserve their textual identifiers/internal subset, and processing instructions use the comment representation.
- Malformed EOF recovery, invalid tag names, literal NUL in ordinary text, and document-level DOCTYPE placement may differ from browser parsing. NUL in tag/attribute names and attribute values is replaced with U+FFFD. Adjacent text tokens need not be coalesced.

The converter does not execute HTML scripts. The page displays converted JSON as text rather than inserting the input HTML into the document.

## Tests and samples

- **201 automated tests** across `tests/`: structural assertions, malformed input, Unicode, special text modes, SVG/MathML, comment EOF recovery, CDATA, paragraph scope, attribute preservation, complete-reference decoding cases, tables, escaped script states, and bounded performance regression checks.
- `html_samples/`: **31 sample HTML files**. All have JSON-serialization smoke tests, with exact or partial structure assertions for selected examples.
- `benchmarks/malformed-input.js`: measurements for incomplete tags, raw-text closing candidates, and many short comments. Timings depend on the machine.

The test command discovers the test files without shell wildcard expansion. Node.js 18 and newer can run the checks without installing dependencies.

## AI-assisted development

The ChatGPT development conversation is linked in [`ai_help/chatgpt_chat.txt`](ai_help/chatgpt_chat.txt). Additional AI review and correction sessions must also be supplied with the submission; this link alone is not a verified record of all AI use.
