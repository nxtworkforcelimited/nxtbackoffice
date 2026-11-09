import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=async f=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL('../src/lib/'+f,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const {normalisePhone,phoneKey}=await load('phone.ts');
const {isPreviewBot,deviceFromUserAgent}=await load('tracking-classify.ts');
test('Zimbabwe numbers written four ways give one key',()=>{
 for(const v of ['0771234567','+263 77 123 4567','263771234567','771234567','(077) 123-4567','00263771234567'])assert.equal(normalisePhone(v).e164,'+263771234567',v);
});
test('UK numbers are recognised by length and prefix',()=>{
 assert.equal(normalisePhone('07911 123456').e164,'+447911123456');
 assert.equal(normalisePhone('+44 7911 123456').e164,'+447911123456');
 assert.equal(normalisePhone('01733 123456').e164,'+441733123456');
});
test('unclear numbers are left alone but still comparable by digits',()=>{
 const r=normalisePhone('verify number');assert.equal(r.e164,null);assert.equal(r.key,'');
 const s=normalisePhone('12-345-678');assert.equal(s.e164,null);assert.equal(s.key,'12345678');
 assert.equal(phoneKey('12 345 678'),phoneKey('12345678'));
});
test('extensions and empty input do not break',()=>{
 assert.equal(normalisePhone('0771234567 ext 22').e164,'+263771234567');
 assert.deepEqual(normalisePhone(''),{e164:null,key:''});assert.deepEqual(normalisePhone(null),{e164:null,key:''});
});
test('link-preview robots are not counted as people',()=>{
 for(const ua of ['WhatsApp/2.23.20.0','facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)','Slackbot-LinkExpanding 1.0','TelegramBot (like TwitterBot)','Mozilla/5.0 (compatible; Googlebot/2.1)','Twitterbot/1.0','LinkedInBot/1.0','python-requests/2.31'])assert.equal(deviceFromUserAgent(ua),'Bot',ua);
});
test('real phones, tablets and desktops are still counted',()=>{
 assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'),'Mobile');
 assert.equal(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'),'Mobile');
 assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),'Tablet');
 assert.equal(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'),'Desktop');
 assert.equal(isPreviewBot('Mozilla/5.0 (Linux; Android 13) Instagram 300 FBAN/FB4A'),false);
});
const stats=await (async()=>{
 const c=await readFile(new URL('../src/lib/tracking-classify.ts',import.meta.url),'utf8'),s=(await readFile(new URL('../src/lib/tracking-stats.ts',import.meta.url),'utf8')).replace(/^import .*$/m,'');
 return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(c+'\n'+s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
})();
test('results count people once, drop preview robots, and fill empty days',()=>{
 const now=new Date('2026-11-09T12:00:00Z'),iso=d=>new Date(d).toISOString();
 const links=[{id:'l1',client_id:'c1',campaign:'festive',source:'whatsapp',medium:'social',code:'abc'},{id:'l2',client_id:'c1',campaign:'quiet',source:'x',medium:'social',code:'def'}];
 const phone='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
 const mk=(over)=>({campaign_id:'l1',clicked_at:iso('2026-11-08T10:00:00Z'),user_agent:phone,device:'Mobile',referrer:'https://l.facebook.com/x',visitor_hash:'h1',visitor_user_id:null,...over});
 const clicks=[mk({}),mk({clicked_at:iso('2026-11-09T09:00:00Z')}),mk({visitor_hash:'h2',referrer:''}),
  mk({user_agent:'WhatsApp/2.23',device:'Mobile',visitor_hash:'h3'}),mk({device:'Bot',visitor_hash:'h4'}),mk({clicked_at:iso('2026-09-01T00:00:00Z'),visitor_hash:'h5'})];
 const r=stats.summariseTracking(links,clicks,7,now);
 assert.equal(r.clicks,3);assert.equal(r.unique,2);assert.equal(r.bots_filtered,2);
 assert.equal(r.by_day.length,7);assert.equal(r.by_day.at(-1).count,1);assert.equal(r.by_day.at(-2).count,2);
 assert.equal(r.links[0].campaign,'festive');assert.equal(r.links[0].clicks,3);assert.equal(r.links.find(l=>l.id==='l2').clicks,0);
 assert.deepEqual(r.referrers.map(x=>x.label),['l.facebook.com','Direct or unknown']);
});
