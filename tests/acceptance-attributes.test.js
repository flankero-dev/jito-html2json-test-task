'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {html2json} = require('../html2json.js');
const E=(attributes,children=[])=>({type:'element',tagName:'div',attributes,children}), T=value=>({type:'text',value}),D=(...children)=>({type:'document',children});const cases=[
{name:'leading-equals-attribute-name',input:'<div =x></div>',expected:D(E({'=x':''}))},
{name:'less-than-inside-attribute-name',input:'<div a<b=1></div>',expected:D(E({'a<b':'1'}))},
{name:'less-than-starts-attribute-name',input:'<div <x="y"></div>',expected:D(E({'<x':'y'}))},
{name:'leading-equals-then-value',input:'<div ==v></div>',expected:D(E({'=':'v'}))},
{name:'stray-slash-before-attribute',input:'<div /a=1 b=2></div>',expected:D(E({a:'1',b:'2'}))},
{name:'quote-inside-attribute-name',input:'<div a"b=1></div>',expected:D(E({'a"b':'1'}))}];

for (const fixture of cases) test("Acceptance: " + fixture.name, () => assert.deepEqual(html2json(fixture.input), fixture.expected));
