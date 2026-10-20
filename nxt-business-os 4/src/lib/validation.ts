import { z } from 'zod';
import { statuses, type Module } from './types';
export function recordSchema(module:Module) { return z.object({title:z.string().trim().min(1).max(160),description:z.string().max(5000).nullable().optional(),status:z.enum(statuses[module] as [string,...string[]]),client_id:z.uuid().nullable().optional(),client_visible:z.boolean().default(false),due_date:z.iso.date().nullable().optional(),amount:z.number().min(0).max(100000000).optional(),currency:z.enum(['USD']).optional(),channel:z.enum(['LinkedIn','Facebook','Instagram','TikTok','YouTube','Email','Other']).optional(),email:z.union([z.email(),z.literal('')]).nullable().optional()}).strict().superRefine((v,ctx)=>{if(v.client_visible&&!v.client_id)ctx.addIssue({code:'custom',message:'Choose a client before sharing.',path:['client_id']});}); }
export function fields(module:Module, value:Record<string,unknown>) {
 const allowed=['title','status',...(module==='clients'?['email']:['client_id','client_visible','description']),...(['tasks','projects','social_posts'].includes(module)?['due_date']:[]),...(module==='deals'?['amount','currency']:[]),...(module==='social_posts'?['channel']:[])];
 return Object.fromEntries(Object.entries(value).filter(([key])=>allowed.includes(key)));
}
