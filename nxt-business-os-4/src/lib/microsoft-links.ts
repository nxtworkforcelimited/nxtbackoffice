// Shared-link handling for Excel files on OneDrive and SharePoint (Microsoft 365).
const HOSTS=['sharepoint.com','onedrive.live.com','1drv.ms','1drv.com','api.onedrive.com','microsoftpersonalcontent.com'];
export function isMicrosoftHost(host:string){const h=host.toLowerCase();return HOSTS.some(s=>h===s||h.endsWith('.'+s));}
export function isMicrosoftLink(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&isMicrosoftHost(u.hostname);}catch{return false;}}
const b64url=(s:string)=>Buffer.from(s,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
// Direct-download addresses to try, best first. "Anyone with the link" links download without signing in.
export function microsoftDownloadCandidates(raw:string):string[]{
 const u=new URL(raw);if(u.protocol!=='https:'||!isMicrosoftHost(u.hostname))throw Error('Use a OneDrive or SharePoint link.');
 const out:string[]=[];
 if(u.hostname.toLowerCase().endsWith('sharepoint.com')){const d=new URL(raw);d.searchParams.set('download','1');out.push(d.toString());}
 else{
  out.push('https://api.onedrive.com/v1.0/shares/u!'+b64url(raw)+'/root/content');
  const d=new URL(raw);d.searchParams.set('download','1');out.push(d.toString());
 }
 return out;
}
