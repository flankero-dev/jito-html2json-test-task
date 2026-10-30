'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {html2json} = require('../html2json.js');
const E=(tagName,children=[],attributes={})=>({type:'element',tagName,attributes,children});
const T=value=>({type:'text',value}); const D=(...children)=>({type:'document',children});
const cases=[];
function script(name,body,rest='<p>after</p>'){ cases.push({name,input:`<script>${body}</script>${rest}`,expected:D(E('script',[T(body)]),E('p',[T('after')]))}); }
script('plain-script','a < b &amp;');
script('escaped-end','<!-- old');
script('double-escaped-inner-close','<!--<script>inside</script>tail');
script('double-escaped-case','<!--<ScRiPt >inside</sCrIpT >tail');
script('double-escape-slash-boundary','<!--<script/>inside</script/>tail');
script('escaped-other-name','<!--<scripty>inside');
script('double-escape-dash-exit','<!--<script>inside-->tail');
script('escaped-dash-exit','<!--x-->tail');
script('escaped-dash-less','<!--x-<script>inside</script>tail');
script('escaped-double-dash-less','<!--x--<script>inside</script>tail');
script('double-dash-less','<!--<script>x-</script>tail');
script('double-double-dash-less','<!--<script>x--</script>tail');
script('double-second-open-does-not-nest','<!--<script><script></script>tail');
cases.push({name:'double-escaped-eof-retains-all',input:'<script><!--<script>inside</script><p>still-script</p>',expected:D(E('script',[T('<!--<script>inside</script><p>still-script</p>')]))});
cases.push({name:'style-never-script-escape',input:'<style><!--<style>x</style><p>after</p>',expected:D(E('style',[T('<!--<style>x')]),E('p',[T('after')]))});
cases.push({name:'empty-end-tag-text',input:'a</>bc',expected:D(T('a'),T('bc'))});
cases.push({name:'empty-end-tag-comment',input:'a</><!--b-->c',expected:D(T('a'),{type:'comment',value:'b'},T('c'))});
cases.push({name:'empty-end-tag-following-node',input:'</><p>ok</p>',expected:D(E('p',[T('ok')]))});
cases.push({name:'math-definition-url',input:'<math definitionurl="x"><mi definitionURL="y">z</mi></math>',expected:D(E('math',[E('mi',[T('z')],{definitionURL:'y'})],{definitionURL:'x'}))});
cases.push({name:'math-annotation-svg-no-encoding',input:'<math><annotation-xml><svg><script/><circle/></svg></annotation-xml><mi>x</mi></math>',expected:D(E('math',[E('annotation-xml',[E('svg',[E('script'),E('circle')])]),E('mi',[T('x')])]))});
cases.push({name:'math-annotation-svg-unknown-encoding',input:'<math><annotation-xml encoding="x"><svg viewbox="0 0 1 1"/></annotation-xml></math>',expected:D(E('math',[E('annotation-xml',[E('svg',[],{viewBox:'0 0 1 1'})],{encoding:'x'})]))});
for (const fixture of cases) {
  test("Acceptance: " + fixture.name, () => assert.deepEqual(html2json(fixture.input), fixture.expected));
}
