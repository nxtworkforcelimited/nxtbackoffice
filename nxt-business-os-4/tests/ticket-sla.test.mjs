import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const L=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await read('src/lib/ticket-sla.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const at=(h,base='2026-11-09T08:00:00Z')=>new Date(new Date(base).getTime()+h*3600000);
const t=(o={})=>({priority:'Normal',status:'New',created_at:'2026-11-09T08:00:00Z',...o});

test('deadlines follow priority, and stored deadlines win',()=>{
 const n=L.ticketSla(t(),at(0));assert.equal(n.reply.due.toISOString(),at(8).toISOString());assert.equal(n.resolve.due.toISOString(),at(72).toISOString());
 const u=L.ticketSla(t({priority:'Urgent'}),at(0));assert.equal(u.reply.due.toISOString(),at(1).toISOString());assert.equal(u.resolve.due.toISOString(),at(4).toISOString());
 const s=L.ticketSla(t({first_response_due:at(2).toISOString()}),at(0));assert.equal(s.reply.due.toISOString(),at(2).toISOString());
 assert.equal(L.ticketSla(t({priority:'Weird'}),at(0)).reply.due.toISOString(),at(8).toISOString(),'unknown priority treated as Normal');
});
test('states: ok, soon, overdue, met',()=>{
 assert.equal(L.ticketSla(t(),at(1)).reply.state,'ok');
 assert.equal(L.ticketSla(t(),at(7)).reply.state,'soon');
 assert.equal(L.ticketSla(t(),at(9)).reply.state,'overdue');
 assert.match(L.ticketSla(t(),at(10)).reply.label,/overdue by 2h/);
 assert.equal(L.ticketSla(t({status:'Assigned'}),at(100)).reply.state,'met','picked up counts as replied');
 assert.equal(L.ticketSla(t({first_response_at:at(3).toISOString()}),at(100)).reply.state,'met');
 assert.equal(L.ticketSla(t({status:'Resolved'}),at(1000)).resolve.state,'met');
});
test('the list shows the most urgent open item and resolved tickets are never overdue',()=>{
 assert.equal(L.slaHeadline(t(),at(9)).state,'overdue');
 assert.match(L.slaHeadline(t({status:'In progress'}),at(1)).label,/Resolve due in/);
 assert.equal(L.slaHeadline(t({status:'Resolved'}),at(9999)).label,'Resolved');
 assert.equal(L.isOverdue(t({status:'Closed'}),at(9999)),false);assert.equal(L.isOverdue(t(),at(9)),true);
});
test('durations read naturally',()=>{
 assert.equal(L.duration(45*60000),'45m');assert.equal(L.duration(3*3600000),'3h');assert.equal(L.duration(90*3600000),'3d 18h');assert.equal(L.duration(-5),'0m');
});
test('the app and database use the same hours',async()=>{
 const sql=await read('supabase/migrations/202611090006_tickets_deadlines_notes_client.sql');
 assert.match(sql,/'Urgent' then 1 when 'High' then 4 when 'Low' then 24 else 8/);assert.match(sql,/'Urgent' then 4 when 'High' then 24 when 'Low' then 168 else 72/);
 assert.deepEqual(L.slaHours,{Urgent:{reply:1,fix:4},High:{reply:4,fix:24},Normal:{reply:8,fix:72},Low:{reply:24,fix:168}});
});
test('no hard-coded staff accounts; internal notes never fall back to a public reply; migration is additive',async()=>{
 const api=await read('src/app/api/operations/route.ts'),ui=await read('src/components/operations-legacy.tsx'),sql=await read('supabase/migrations/202611090006_tickets_deadlines_notes_client.sql');
 for(const id of ['3c5d23a8-6fea-48ca-a630-37124a10d1db','76e3f054-7bdf-4670-800e-c54329dfa4dd']){assert.ok(!api.includes(id),'api '+id);assert.ok(!ui.includes(id),'ui '+id);}
 assert.match(api,/Only ticket managers can add internal notes/);assert.match(api,/need the tickets upgrade/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from|drop column/i);
 assert.match(sql,/not it_ticket_comments\.internal/,'requesters cannot read internal notes');
});
