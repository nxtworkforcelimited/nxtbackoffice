// What NXT looks after for a client decides whether that client can post support tickets, and about what.
export const serviceOptions=[
 {key:'website',label:'Website'},
 {key:'back_office',label:'Back office'},
 {key:'hosting',label:'Hosting'},
 {key:'domain',label:'Domain / DNS'},
 {key:'email',label:'Business email'},
 {key:'other',label:'Other IT support'}
] as const;
export type ServiceKey=typeof serviceOptions[number]['key'];
export const serviceKeys=serviceOptions.map(s=>s.key) as ServiceKey[];

const byService:Record<ServiceKey,string[]>={
 website:['Website Change','Website Bug','Content Update'],
 back_office:['Back Office Issue'],
 hosting:['Hosting / DNS'],
 domain:['Hosting / DNS'],
 email:['Email Issue'],
 other:['Other Support Request']
};
export function cleanServices(value:unknown):ServiceKey[]{
 return Array.isArray(value)?serviceKeys.filter(k=>value.includes(k)):[];
}
export function supportEnabled(services:unknown){return cleanServices(services).length>0;}
/** Categories a client may pick. Billing questions are always allowed once support is on. Mirrors create_client_ticket in the database. */
export function categoriesFor(services:unknown){
 const list=cleanServices(services);
 if(!list.length)return [] as string[];
 return [...new Set([...list.flatMap(k=>byService[k]),'Billing Query'])];
}
export const clientPriorities=[{value:'Normal',label:'Normal'},{value:'High',label:'Urgent - my site or system is down or blocked'},{value:'Low',label:'Low - whenever you can'}] as const;

// Extra portal features NXT can switch on per client. 'sms' shows Tasks and Messages.
export const featureOptions=[
 {key:'sms',label:'SMS and messages',hint:'Shows Tasks and Messages in their portal'}
] as const;
export type FeatureKey=typeof featureOptions[number]['key'];
export const featureKeys=featureOptions.map(f=>f.key) as FeatureKey[];
export function cleanFeatures(value:unknown):FeatureKey[]{
 return Array.isArray(value)?featureKeys.filter(k=>value.includes(k)):[];
}
/** What a client sees in their portal. Nothing is on until NXT ticks it. */
export function portalAccess(services:unknown,features:unknown){
 const s=cleanServices(services),f=cleanFeatures(features);
 return {support:supportEnabled(s),website:s.includes('website'),back_office:s.includes('back_office'),sms:f.includes('sms')};
}
export type PortalAccess=ReturnType<typeof portalAccess>;
