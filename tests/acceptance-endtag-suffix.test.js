'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {html2json} = require('../html2json.js');
const E=(tagName,children=[])=>({type:'element',tagName,attributes:{},children}),T=value=>({type:'text',value}),D=(...children)=>({type:'document',children});const cases=[
{name:'quote-in-end-attribute-name',input:'<div>x</div a"><p>y</p>',expected:D(E('div',[T('x')]),E('p',[T('y')]))},
{name:'singlequote-in-end-attribute-name',input:"<div>x</div a'><p>y</p>",expected:D(E('div',[T('x')]),E('p',[T('y')]))},
{name:'quote-in-unquoted-end-value',input:'<div>x</div a=b"><p>y</p>',expected:D(E('div',[T('x')]),E('p',[T('y')]))},
{name:'quoted-end-value-keeps-greaterthan',input:'<div>x</div a=">still"><p>y</p>',expected:D(E('div',[T('x')]),E('p',[T('y')]))},
{name:'script-end-name-quote',input:'<script>x</script a"><p>y</p>',expected:D(E('script',[T('x')]),E('p',[T('y')]))}
];

for (const fixture of cases) test("Acceptance: " + fixture.name, () => assert.deepEqual(html2json(fixture.input), fixture.expected));
