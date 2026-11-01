import type {Workspace} from './types';

export const NXT_DOMAIN_WORKSPACE = 'bdb66466-e569-4a47-beb4-046fd03fdbce';
export const domainStatuses = ['pending','processing','needs_attention','registered','cancelled'] as const;
export type DomainStatus = typeof domainStatuses[number];
export const domainStatusLabels:Record<DomainStatus,string> = {pending:'New request',processing:'In progress',needs_attention:'Needs attention',registered:'Registered',cancelled:'Cancelled'};
export const domainTransitions:Record<DomainStatus,DomainStatus[]> = {pending:['processing','needs_attention','cancelled'],processing:['registered','needs_attention','cancelled'],needs_attention:['processing','cancelled'],registered:['needs_attention'],cancelled:[]};
export function canManageDomains(workspace:Pick<Workspace,'id'|'role'>) {
 return workspace.id===NXT_DOMAIN_WORKSPACE && ['owner','admin'].includes(workspace.role);
}
export type DomainContact = {name:string;organisation:string;physical:string;postal:string;city:string;country:string;phone:string;email:string};
export type DomainOrder = {id:string;customer_email:string;items:{domain:string;registration_cents:number;renewal_cents:number;years:number}[];total_cents:number;currency:string;payment_status:'unpaid'|'paid'|'refunded';fulfilment_status:DomainStatus;fulfilment_version:number;payment_reference:string|null;paid_at:string|null;registered_at:string|null;created_at:string;details:{owner:DomainContact;billing:DomainContact;description:string;usage:string;notices:string;notes?:string}};
export type DomainEvent = {id:string;order_id:string;actor_label:string;from_status:DomainStatus;to_status:DomainStatus;note:string;registration_reference:string;created_at:string};
export type DomainQueue = {orders:DomainOrder[];total:number;counts:Record<DomainStatus,number>;unpaid:number};
