// Shared helpers for the Cold Calling module.
// The category list is the one used by the Spotly Africa outreach tracker.
export const callCategories=[
 'Restaurants','Salons & Barbers','Gyms & Fitness','Spas & Wellness','Gift Shops','Flower Shops','Bars & Lounges',
 'Events & Ticketing','Couriers & Delivery','Supermarkets & Groceries','Electronics & Home Retail','Fashion & Clothing',
 'Bakeries & Food Shops','Services & Bookings','Strategic Platforms & Integrations'
] as const;
// A dropdown must always show what is already saved, even when it is not in the list.
export function withCurrent(list:readonly string[],current:string):string[]{
 const c=String(current??'').trim();
 return c&&!list.includes(c)?[...list,c]:[...list];
}
// A number can be dialled only when it has enough digits. Notes such as "Verify before visiting" cannot.
export function canDial(phone:string|null|undefined):boolean{
 const digits=String(phone??'').replace(/\D/g,'');
 return digits.length>=7&&digits.length<=15;
}
// Next Business ID for a list, matching the database rule: IB-0001, IB-0002 and so on.
export function nextBusinessId(existing:readonly (string|null|undefined)[]):string{
 let max=0;
 for(const v of existing){const m=/^IB-(\d{1,6})$/.exec(String(v??'').trim());if(m)max=Math.max(max,Number(m[1]));}
 return 'IB-'+String(max+1).padStart(4,'0');
}
