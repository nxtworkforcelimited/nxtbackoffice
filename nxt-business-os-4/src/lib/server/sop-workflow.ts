import type {context} from '../context';
import type {TrackerProject,TrackerRecord} from '../master-tracker';
type Context=NonNullable<Awaited<ReturnType<typeof context>>>;
export async function sopSnapshot(c:Context){
 const t=c.workspace!.id;
 const [runs,tasks,staff,clients,archives]=await Promise.all([
  c.db.from('sop_runs').select('id,client_id,project_id,deal_id,service').eq('tenant_id',t),
  c.db.from('sop_tasks').select('*').eq('tenant_id',t).order('due'),
  c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t),
  c.db.from('clients').select('id,title').eq('tenant_id',t),
  c.db.from('tracker_archives').select('project,record_id,archived_at').eq('tenant_id',t)
 ]);
 if([runs,tasks,staff,clients,archives].some(r=>r.error))throw Error('SOP workflow data could not load. Apply the SOP database upgrade and retry.');
 const people=staff.data??[],names=new Map(people.map(p=>[p.user_id,p.name]));
 const manager=['owner','admin'].includes(c.workspace!.role)||!!c.workspace!.permissions?.includes('delivery');
 const projects:TrackerProject[]=(runs.data??[]).map(run=>({id:'sop:'+run.id,sop:true,projectId:run.project_id,clientId:run.client_id,name:(clients.data??[]).find(p=>p.id===run.client_id)?.title+' · SOP',available:true,checkedAt:new Date().toISOString(),data:{approvals:[],risks:[],tasks:(tasks.data??[]).filter(r=>r.run_id===run.id).map(r=>({id:r.id,title:r.title,description:r.description,status:r.status,owner:names.get(r.owner_id)||'Staff unavailable',support:r.support_ids.map((id:string)=>names.get(id)||'Staff unavailable'),due:r.due,clientDue:r.client_due,priority:r.priority,notes:r.notes,evidence:r.evidence,checks:r.checks,action:r.next_action,updatedAt:r.updated_at,dependencies:r.dependencies.map((key:string)=>(tasks.data??[]).find(d=>d.run_id===run.id&&d.key===key)?.id||key),approvalIds:[],version:r.version,canEdit:manager||[r.owner_id,r.reviewer_id,...r.support_ids].includes(c.user.id),canSchedule:manager,sop:{key:r.key,ownerId:r.owner_id,reviewerId:r.reviewer_id,backupId:r.backup_id,reviewer:names.get(r.reviewer_id)||'Staff unavailable',backup:names.get(r.backup_id)||'Staff unavailable',nextAction:r.next_action,followUp:r.follow_up,blocker:r.blocker,approvalEvidence:r.approval_evidence,approvedAt:r.approved_at,approvedBy:r.approved_by}} as TrackerRecord))}}));
 return {projects,staff:people,currentUserId:c.user.id,canManage:manager,archives:(archives.data??[]).map(a=>({project:a.project,id:a.record_id,archivedAt:a.archived_at}))};
}
