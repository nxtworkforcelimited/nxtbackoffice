// Server-only orchestration. Invitation tokens never enter database logs or API responses.
type Result={data:any;error:any};
type Dependencies={workspace:string;clientId:string;db:{rpc:(name:string,args:Record<string,string>)=>PromiseLike<Result>};admin:{auth:{admin:{generateLink:(params:any)=>PromiseLike<Result>}};from:(name:string)=>any};appUrl:string;send:(email:string,subject:string,body:string,key:string)=>Promise<void>};
export async function deliverClientInvitation(d:Dependencies){
 const reserved=await d.db.rpc('reserve_client_invite',{t:d.workspace,c:d.clientId});
 if(reserved.error)throw Error(reserved.error.message);
 const invitation=reserved.data as {id:string;email:string;client_title:string};
 try{
  let linked=await d.db.rpc('link_client_login',{t:d.workspace,c:d.clientId,invitation:invitation.id});if(linked.error)throw Error(linked.error.message);
  // New Auth user: invite. Existing approved client account: recovery for a fresh setup link.
  const generated=await d.admin.auth.admin.generateLink({type:linked.data?'recovery':'invite',email:invitation.email});
  if(generated.error||!generated.data?.properties?.hashed_token||!generated.data?.user?.id)throw Error('Could not generate a setup link. The account may already exist; retry or contact the workspace owner.');
  const properties=generated.data.properties;
  if(!['invite','recovery'].includes(properties.verification_type))throw Error('Unexpected invitation link type');
  linked=await d.db.rpc('link_client_login',{t:d.workspace,c:d.clientId,invitation:invitation.id});
  if(linked.error||linked.data!==generated.data.user.id)throw Error('Client account could not be linked safely. No invitation was sent.');
  const url=new URL('/auth/accept',d.appUrl);url.searchParams.set('token_hash',properties.hashed_token);url.searchParams.set('type',properties.verification_type);
  await d.send(invitation.email,'Your NXT Workforce client portal invitation',`You have been invited to the ${invitation.client_title} client portal by NXT Workforce.\n\nUse this secure, single-use link to set your password:\n${url}\n\nIf the link expires, ask NXT Workforce to resend your invitation. You will only see work shared with your client account.\n\nIf you were not expecting this invitation, ignore this email.`,invitation.id);
  const saved=await d.admin.from('client_invitations').update({status:'sent',sent_at:new Date().toISOString(),last_error:null}).eq('id',invitation.id).eq('tenant_id',d.workspace);
  if(saved.error)return {message:'The email provider accepted the invitation, but its status could not be saved. Check the recipient inbox before resending.'};
  return {message:'Invitation accepted by the email provider. Ask the client to check their inbox and spam folder.'};
 }catch(e){
  await d.admin.from('client_invitations').update({status:'failed',last_error:'Invitation could not be completed. Retry after checking email delivery and account linking.'}).eq('id',invitation.id).eq('tenant_id',d.workspace);
  throw e;
 }
}
