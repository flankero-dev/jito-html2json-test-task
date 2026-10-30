'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { html2json } = require('../html2json');
const T = value => ({ type: 'text', value });
const C = value => ({ type: 'comment', value });
const E = (tagName, children = []) => ({ type: 'element', tagName, attributes: {}, children });
const D = (...children) => ({ type: 'document', children });

test('abrupt empty <!--> ends comment and preserves following markup', () => {
  assert.deepEqual(html2json('<!--><p>ok</p>'), D(C(''), E('p', [T('ok')])));
});
test('abrupt empty <!---> ends comment and preserves following markup', () => {
  assert.deepEqual(html2json('<!---><p>ok</p>'), D(C(''), E('p', [T('ok')])));
});
test('--!> terminator preserves later elements', () => {
  assert.deepEqual(html2json('<!--x--!><p>ok</p>'), D(C('x'), E('p', [T('ok')])));
});
test('ordinary comment terminator still works', () => {
  assert.deepEqual(html2json('<!--x--><p>ok</p>'), D(C('x'), E('p', [T('ok')])));
});
test('three trailing hyphens leave the third in comment data', () => {
  assert.deepEqual(html2json('<!--x---><p>ok</p>'), D(C('x-'), E('p', [T('ok')])));
});
test('nested-looking opening sequence stays inside ordinary comment', () => {
  assert.deepEqual(html2json('<!--<!----><p>ok</p>'), D(C('<!--'), E('p', [T('ok')])));
});
test('unclosed comment consumes the remaining input, safely', () => {
  assert.deepEqual(html2json('<!--x<p>ok</p>'), D(C('x<p>ok</p>')));
});
test('invalid comment marker -!> must not close early', () => {
  assert.deepEqual(html2json('<!---!><p>ok</p>'), D(C('-!><p>ok</p>')));
});
test('earliest of --!> and --> wins and following comment parses', () => {
  assert.deepEqual(html2json('<!--first--!><p>ok</p><!--second-->'), D(C('first'), E('p', [T('ok')]), C('second')));
});
test('adjacent text and recovered comments preserve stable order and JSON round trip', () => {
  const expected = D(T('a'), C(''), E('b', [T('B')]), C('x'), E('i', [T('I')]));
  const result = html2json('a<!--><b>B</b><!--x--!><i>I</i>');
  assert.deepEqual(result, expected);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected);
});
