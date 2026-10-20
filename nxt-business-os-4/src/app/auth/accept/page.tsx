import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Accept your client invitation',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Accept({searchParams}:{searchParams:Promise<{token_hash?:string;type?:string}>}){
 const p=await searchParams,valid=p.token_hash&&/^[a-zA-Z0-9_-]{20,512}$/.test(p.token_hash)&&['invite','recovery'].includes(p.type??'');
 return <main className="login"><section className="login-story"><div className="brand-image"><img src="/brand/nxt-business-os.png" alt="NXT Business OS"/></div><div><h1>Your client portal.</h1><p>Review shared work, projects and messages with NXT Workforce.</p></div></section><section className="login-form"><div><h2>Set up your access</h2>{valid?<><p>Continue to verify your invitation and choose a password. Only continue if you requested or expected an invitation from NXT Workforce.</p><form action="/auth/confirm" method="post"><input type="hidden" name="token_hash" value={p.token_hash}/><input type="hidden" name="type" value={p.type}/><button className="primary">Continue to password setup</button></form></>:<p className="notice" role="alert">This invitation link is invalid. Ask your NXT Workforce contact to resend it.</p>}<p><a href="/login">Already have access? Sign in</a></p></div></section></main>;
}
