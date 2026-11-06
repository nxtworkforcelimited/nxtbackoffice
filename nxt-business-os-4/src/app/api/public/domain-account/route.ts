import {PublicError,readPublicJson,reply,publicFailure,takeQuota} from '../../../../lib/public-services';
import {settings,customer,cookie,setSession,clearSession,textField} from '../../../../lib/domain-store';

export async function GET(request:Request) {
  try {const user=await customer(request);return reply({user:{email:user.email}});}catch(e){return publicFailure(e);}
}
export async function POST(request:Request) {
  try {
    const v=await readPublicJson(request,3000);
    const {url,key}=settings();
    if(v.action==='logout') {
      const token=cookie(request,'__Host-nxt-customer-access');
      if(token)await fetch(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)}).catch(()=>{});
      return clearSession(reply({ok:true}));
    }
    if(!['login','signup','refresh','resend'].includes(v.action))throw new PublicError('Choose sign in or create account.');
    if(v.action!=='refresh')await takeQuota(request,'domain');
    const email=v.action==='refresh'?'':textField(v.email,'email',false,254).toLowerCase();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PublicError('Enter a valid email address.');
    let path='',body:Record<string,unknown>={};
    if(v.action==='refresh') {path='/token?grant_type=refresh_token';body={refresh_token:cookie(request,'__Host-nxt-customer-refresh')};if(!body.refresh_token)throw new PublicError('Please sign in.',401);}
    else if(v.action==='resend'){path='/resend';body={type:'signup',email};}
    else {
      const password=v.password;
      if(typeof password!=='string'||password.length<1||password.length>128)throw new PublicError('Please check password.');
      if(v.action==='signup'&&(password.length<12||v.terms!==true))throw new PublicError('Use at least 12 characters and accept the account terms.');
      path=v.action==='signup'?'/signup':'/token?grant_type=password';body={email,password};
    }
    const r=await fetch(url+'/auth/v1'+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const result=await r.json().catch(()=>null);
    if(!r.ok) {
      if(v.action==='refresh')return clearSession(reply({error:'Please sign in again.'},401));
      throw new PublicError(r.status===429?'Please wait before trying again.':v.action==='login'?'Sign-in failed. Check your password and confirm your email first.':'We could not send the account email. Please try again later.',r.status===429?429:400);
    }
    if(result?.access_token&&result?.refresh_token)return setSession(reply({ok:true,user:{email:result.user.email}}),result);
    return reply({confirmationRequired:true,message:'Check your inbox to confirm your email, then return here to sign in.'});
  } catch(e){return publicFailure(e);}
}
