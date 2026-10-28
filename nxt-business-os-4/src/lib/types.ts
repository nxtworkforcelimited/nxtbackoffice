export type Role = 'owner' | 'admin' | 'staff' | 'client';
export type Module = 'clients'|'deals'|'projects'|'tasks'|'social_posts'|'documents';
export type RecordRow = { id:string; tenant_id:string; title:string; status:string; client_id:string|null; client_visible:boolean; created_at:string; description?:string|null; due_date?:string|null; amount?:number; currency?:string; channel?:string; object_path?:string|null; email?:string|null; };
export type Workspace = {id:string;name:string;role:Role;client_id:string|null;permissions?:string[];can_delete?:boolean};
export type Data = Record<Module,RecordRow[]>;
export const modules:Module[]=['clients','deals','projects','tasks','social_posts','documents'];
export const statuses:Record<Module,string[]>={clients:['active','inactive'],deals:['new','qualified','proposal','won','lost'],projects:['planned','active','review','completed'],tasks:['todo','in_progress','done'],social_posts:['draft','manager_review','client_review','approved','changes_requested','published'],documents:['shared','internal']};
export const labels:Record<Module,string>={clients:'Clients',deals:'Sales pipeline',projects:'Projects',tasks:'Tasks',social_posts:'Social planner',documents:'Documents'};
