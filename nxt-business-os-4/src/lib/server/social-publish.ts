import {decryptSocialSecret} from './social-crypto';
type Account={provider:string;external_account_id:string;token_cipher:string|null;account_name:string};
type Post={description?:string|null;title:string};
export async function publishSocial(account:Account,post:Post,copy:string){
 if(!account.token_cipher)throw new Error('This social account is not fully connected yet.');
 const token=decryptSocialSecret(account.token_cipher);
 const text=(copy||post.description||post.title).trim();
 if(account.provider==='linkedin'){
  const version=process.env.LINKEDIN_API_VERSION||'202610';
  const author=account.external_account_id.startsWith('urn:li:')?account.external_account_id:'urn:li:organization:'+account.external_account_id;
  const r=await fetch('https://api.linkedin.com/rest/posts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Restli-Protocol-Version':'2.0.0','Linkedin-Version':version},body:JSON.stringify({author,commentary:text,visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false})});
  const raw=await r.text();if(!r.ok)throw new Error('LinkedIn publish failed ('+r.status+'). '+raw.slice(0,500));
  return {providerPostId:r.headers.get('x-restli-id')||'',providerUrl:''};
 }
 if(account.provider==='facebook'){
  const version=process.env.META_GRAPH_VERSION||'v24.0';
  const r=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(account.external_account_id)+'/feed',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({message:text,access_token:token})});
  const b=await r.json();if(!r.ok||b.error)throw new Error('Facebook publish failed. '+String(b.error?.message||r.status));
  return {providerPostId:String(b.id||''),providerUrl:''};
 }
 if(account.provider==='instagram')throw new Error('Instagram publishing needs an image/video media adapter. The scheduler is ready, but this account cannot publish text-only posts.');
 if(account.provider==='tiktok')throw new Error('TikTok Direct Post requires the Content Posting API media flow and an audited app for public posts.');
 throw new Error('Unsupported social provider.');
}
