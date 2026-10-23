import {z} from 'zod';
const date=z.iso.date();
export const clientTrackerPlan=z.object({
 client_id:z.uuid().nullable(),client_name:z.string().trim().min(1).max(160),client_email:z.union([z.email(),z.literal('')]),tracker_name:z.string().trim().min(1).max(160),document_id:z.string().regex(/^[-A-Za-z0-9_]{3,80}$/),revision:z.string().trim().min(1).max(80),source_name:z.string().min(1).max(200),source_text:z.string().min(1).max(150000),sla:z.string().max(10000),
 tasks:z.array(z.object({key:z.string().regex(/^[-A-Za-z0-9_]{1,80}$/),title:z.string().trim().min(1).max(160),description:z.string().max(5000),assignee_id:z.uuid(),priority:z.enum(['P0','P1','P2','P3']),scheduled_start:date,internal_due:date,client_due:date,checks:z.array(z.string().trim().min(1).max(1000)).min(1).max(50),source_excerpt:z.string().max(10000)}).strict().refine(t=>t.scheduled_start<=t.internal_due&&t.internal_due<=t.client_due,'Start must be on or before the internal deadline, which must be on or before the client deadline.')).min(1).max(100)
}).strict().refine(p=>new Set(p.tasks.map(t=>t.key)).size===p.tasks.length,'Task keys must be unique.');
export type ClientTrackerPlan=z.infer<typeof clientTrackerPlan>;
