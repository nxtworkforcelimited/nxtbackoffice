import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const src=await readFile(new URL('../src/lib/microsoft-links.ts',import.meta.url),'utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('only OneDrive and SharePoint addresses are accepted',()=>{
 for(const u of ['https://nxtworkforce-my.sharepoint.com/:x:/g/personal/diana/abc?e=1','https://1drv.ms/x/s!Abc','https://onedrive.live.com/redir?resid=1'])assert.equal(m.isMicrosoftLink(u),true,u);
 for(const u of ['http://1drv.ms/x/s!Abc','https://evil.com/?u=1drv.ms','https://sharepoint.com.evil.com/x','https://169.254.169.254/latest','https://docs.google.com/spreadsheets/d/1/edit','not a url'])assert.equal(m.isMicrosoftLink(u),false,u);
});
test('SharePoint links become direct downloads; personal OneDrive tries the shares API first',()=>{
 const sp=m.microsoftDownloadCandidates('https://x.sharepoint.com/:x:/g/personal/d/abc?e=1');
 assert.equal(sp.length,1);assert.ok(new URL(sp[0]).searchParams.get('download')==='1');assert.equal(new URL(sp[0]).searchParams.get('e'),'1');
 const od=m.microsoftDownloadCandidates('https://1drv.ms/x/s!Abc');
 assert.ok(od[0].startsWith('https://api.onedrive.com/v1.0/shares/u!'));assert.ok(!/[+/=]/.test(od[0].split('shares/u!')[1].split('/')[0]));
 assert.throws(()=>m.microsoftDownloadCandidates('https://evil.com/x'));
});
