// Which menus the owner can switch on or off for each staff member. Pure data, shared by the page and the server.
// 'cap' = a real permission (switching it off removes access to the data). No cap = a menu switch only.
export const accessApps=[
 {key:'deals',label:'CRM',group:'Everyday'},
 {key:'clients',label:'Contacts',group:'Everyday'},
 {key:'calls',label:'Cold Calling',group:'Everyday'},
 {key:'projects',label:'Master Tracker',group:'Everyday'},
 {key:'tasks',label:'Tasks',group:'Everyday'},
 {key:'tickets',label:'Tickets',group:'Everyday'},
 {key:'builds',label:'Websites & Back Offices',group:'Everyday'},
 {key:'campaigns',label:'Campaigns',group:'Everyday'},
 {key:'utm',label:'UTM & QR',group:'Everyday'},
 {key:'leave',label:'Leave',group:'Everyday'},
 {key:'loans',label:'Employee Loans',group:'Everyday'},
 {key:'overtime',label:'Overtime',group:'Everyday'},
 {key:'receipts',label:'Receipts and Finance',group:'Controlled',cap:'finance'},
 {key:'accounting',label:'Accounting',group:'Controlled',cap:'accounting'},
 {key:'payroll',label:'Payroll',group:'Controlled',cap:'payroll'},
 {key:'sms',label:'SMS',group:'Controlled',cap:'sms'},
 {key:'blog',label:'Blog and Marketing',group:'Controlled',cap:'content'},
 {key:'documents',label:'Documents',group:'Controlled',cap:'documents'},
 {key:'reports',label:'Reports',group:'Controlled',cap:'reports'},
 {key:'staff_profiles',label:'Staff Profiles (HR)',group:'Controlled',cap:'hr'}
] as const;
export type AccessApp=typeof accessApps[number];
export const menuSwitchKeys=accessApps.filter(a=>!('cap' in a)).map(a=>a.key) as string[];
/** Only these app names may be stored as hidden for a member. */
export function cleanHidden(list:unknown):string[]{
 return Array.isArray(list)?menuSwitchKeys.filter(k=>list.includes(k)):[];
}
