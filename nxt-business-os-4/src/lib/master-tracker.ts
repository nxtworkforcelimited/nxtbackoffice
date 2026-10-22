export type TrackerKind = 'tasks' | 'approvals' | 'risks';
export type TrackerRecord = {
 id:string;title:string;description:string;owner:string;support:string[];status:string;priority:string;
 due:string|null;clientDue:string|null;notes:string;action:string;evidence:string;updatedAt:string|null;
 checks:{text:string;done:boolean}[];dependencies:string[];approvalIds:string[];
};
export type TrackerProject = {id:string;name:string;available:boolean;checkedAt:string|null;error?:string;data?:Record<TrackerKind,TrackerRecord[]>};
export type TrackerSnapshot = {version:1;checkedAt:string;complete:boolean;projects:TrackerProject[]};
