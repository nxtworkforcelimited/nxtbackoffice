export type TrackerKind = 'tasks' | 'approvals' | 'risks';
export type TrackerRecord = {
 version?:number;canEdit?:boolean;canSchedule?:boolean;submitted?:string;feedbackDate?:string;revisionDue?:string;approvedDate?:string;rounds?:number;
 archivedAt?:string;sop?:{key:string;ownerId:string;reviewerId:string;backupId:string;reviewer:string;backup:string;nextAction:string;followUp:string|null;blocker:string;approvalEvidence:string;approvedAt:string|null;approvedBy:string|null};
 id:string;title:string;description:string;owner:string;support:string[];status:string;priority:string;
 due:string|null;clientDue:string|null;notes:string;action:string;evidence:string;updatedAt:string|null;
 checks:{text:string;done:boolean}[];dependencies:string[];approvalIds:string[];
};
export type TrackerProject = {sop?:boolean;native?:boolean;projectId?:string;clientId?:string;id:string;name:string;available:boolean;checkedAt:string|null;error?:string;access?:{canCreateTasks:boolean;canApplyPlan:boolean;canSchedule:boolean;name:string;owners:string[]};data?:Record<TrackerKind,TrackerRecord[]>};
export type TrackerSnapshot = {version:1;checkedAt:string;complete:boolean;projects:TrackerProject[];sop?:{staff:{user_id:string;name:string;email:string}[];currentUserId:string;canManage:boolean;archives:{project:string;id:string;archivedAt:string}[]}};
