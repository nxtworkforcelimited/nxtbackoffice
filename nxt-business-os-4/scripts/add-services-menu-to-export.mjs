// Run with Node 24 after generating a standalone HTML export of the marketing site.
import {headerBrand} from '../src/lib/public-footer.ts';
import {withServicesMenu} from '../src/lib/public-services-menu.ts';
import {readdir,readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
if (!process.argv[2]) throw Error('Pass the directory containing the exported website.');
const root=resolve(process.argv[2]);
const pages=(await readdir(root,{recursive:true})).filter(name=>name.endsWith('.html'));
for (const name of pages) {
  const path=join(root,name), before=await readFile(path,'utf8'), after=withServicesMenu(before,headerBrand,name);
  if (before!==after) await writeFile(path,after);
}
await mkdir(join(root,'v6'),{recursive:true});
for (const name of ['services-menu.css','services-menu.js'])
  await copyFile(new URL('../public/v6/'+name,import.meta.url),join(root,'v6',name));
if (pages.includes('admin.html')) {
  await copyFile(new URL('./standalone/admin.js', import.meta.url), join(root, 'admin.js'));
}
