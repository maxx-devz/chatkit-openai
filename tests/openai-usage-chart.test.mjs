import test from 'node:test';
import assert from 'node:assert/strict';
import {usageTimeline,chartDomain,usageSeriesPaths} from '../lib/openai-usage-chart.js';
const period='2026-11',now=Date.parse('2026-11-26T12:00:00Z');
test('Disconnected charts contain null observations rather than sample or zero usage',()=>{
 const points=usageTimeline({configured:false},period,now);assert.equal(points.length,26);assert.equal(points.at(-1).date,'2026-11-26');assert.ok(points.every(p=>p.cost===null&&p.input===null&&p.output===null&&p.cached===null&&p.requests===null));
});
test('Daily aggregation combines projects and models without counting cached input twice',()=>{
 const points=usageTimeline({usage:{status:'ready',rows:[{date:'2026-11-02',inputTokens:1000,outputTokens:100,cachedInputTokens:400,requests:2},{date:'2026-11-02',inputTokens:500,outputTokens:50,cachedInputTokens:200,requests:1}]},costs:{status:'ready',rows:[{date:'2026-11-02',amountUsd:'0.01'},{date:'2026-11-02',amountUsd:'0.02'}]}},period,now);
 const day=points[1];assert.equal(day.input,1500);assert.equal(day.output,150);assert.equal(day.cached,600);assert.equal(day.requests,3);assert.ok(Math.abs(day.cost-.03)<1e-12);assert.equal(day.input+day.output,1650);
});
test('Unavailable endpoint and missing cache counts create gaps, while reported empty days can be zero',()=>{
 const points=usageTimeline({costs:{status:'unavailable'},usage:{status:'ready',rows:[{date:'2026-11-02',inputTokens:10,outputTokens:1,cachedInputTokens:null,requests:1}]}},period,now);
 assert.ok(points.every(p=>p.cost===null));assert.equal(points[0].input,0);assert.equal(points[1].cached,null);assert.equal(points[1].input,10);
});
test('UTC month boundaries and provider end dates do not add future activity',()=>{
 const points=usageTimeline({range:{end:'2024-03-01T00:00:00Z'}},'2024-02',now);assert.equal(points.length,29);assert.equal(points.at(-1).date,'2024-02-29');assert.deepEqual(usageTimeline({},'2026-99',now),[]);assert.deepEqual(usageTimeline({},'2026-12',now),[]);
});
test('Chart domains preserve negative cost adjustments and use integer ticks for request counts',()=>{
 const dollars=chartDomain([-.02,.1],true);assert.ok(dollars.min<=-.02);assert.ok(dollars.max>=.1);assert.ok(dollars.ticks.includes(0));const requests=chartDomain([0,1,2]);assert.ok(requests.ticks.every(Number.isInteger));
});
test('Curves split at unknown values, close to their base, and never generate nonfinite paths',()=>{
 const paths=usageSeriesPaths([{input:1,output:2},{input:2,output:3},{input:null,output:4},{input:1,output:2}],'output',{x:i=>i*10,y:n=>100-n*10,base:'input'});
 assert.equal(paths.length,2);assert.match(paths[0].area,/^M0,70 C/);assert.match(paths[0].area,/ Z$/);assert.ok(paths.every(p=>!p.area.includes('NaN')&&!p.area.includes('Infinity')));
});
