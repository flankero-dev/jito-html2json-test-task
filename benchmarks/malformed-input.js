"use strict";
const { performance } = require("node:perf_hooks");
const { html2json } = require("../html2json.js");

const counts = [100, 500, 1000, 2000, 4500, 9000, 18000, 36000];
const samples = [
  { name: 'incomplete quoted attribute', input: n => '<a title="'.repeat(n) },
  { name: 'incomplete raw text end tag', input: n => '<script>' + '</script title="'.repeat(n) },
  { name: 'many ordinary comments', input: n => '<!--x-->'.repeat(n) },
  { name: 'many bang-ended comments', input: n => '<!--x--!>'.repeat(n) }
];

// Report a median for repeatability; measurements are indicative, not an SLA.
for (const { name, input } of samples) {
  console.log(`\n${name}`);
  for (const n of counts) {
    const html = input(n);
    for (let j = 0; j < 2; j++) html2json(html);
    const timings = [];
    for (let j = 0; j < 7; j++) {
      const start = performance.now();
      const result = html2json(html);
      timings.push(performance.now() - start);
      if (JSON.stringify(result).length === 0) throw new Error("Unexpected empty result");
    }
    timings.sort((a, b) => a - b);
    console.log(`${String(n).padStart(6)} repeats | ${String(html.length).padStart(7)} chars | median ${timings[3].toFixed(3)} ms`);
  }
}
