/** UI/API pre-check only; database functions enforce the same verified account and membership. */
export function canDeleteRecords(email:string|undefined,role:string){return role==='owner'&&email?.toLowerCase()==='nyasha@nxt-workforce.com';}
