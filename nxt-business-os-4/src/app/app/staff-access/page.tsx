import {redirect} from 'next/navigation';
import {context} from '@/lib/context';
import StaffAccess from '@/components/staff-access';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{workspace?:string}>}){
 const c=await context((await searchParams).workspace);
 if(!c?.workspace)redirect('/login');
 if(c.workspace.role!=='owner')return <main className="setup"><h1>Owner access required</h1><p>Ask the workspace owner for help with staff login.</p><a href="/app">Back to workspace</a></main>;
 return <main style={{maxWidth:1200,margin:'auto',padding:24}}><a href={'/app?workspace='+c.workspace.id}>← Back office</a><StaffAccess workspace={c.workspace}/></main>;
}
