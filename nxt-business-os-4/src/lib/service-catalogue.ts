/** NXT Workforce Services & Pricing Guide 2026. USD starting prices, editable per quote/invoice. */
export type ServiceItem={id:string;category:string;description:string;price:number;unit:string};
const groups:[string,[string,number,string][]][]=[
 ['Small Business',[
 ['Website - up to 5 pages, mobile-friendly, contact form',100,'once-off'],
 ['Social media management - 1-2 platforms, 12 posts a month, captions and scheduling',100,'month'],
 ['Logo and basic brand kit',60,'once-off'],['Google Business Profile setup',30,'once-off'],['Website maintenance',25,'month'],['Hosting and domain',10,'month']]],
 ['Medium Business',[
 ['Website - up to 12 pages, blog, WhatsApp or booking integration',350,'once-off'],['E-commerce website - online shop with product catalogue and payments',500,'once-off'],['Back office add-on - enquiry dashboard, content editing, basic records',500,'once-off'],['Social media management - 3 platforms, 20 posts a month, basic reporting',250,'month'],['Website maintenance',60,'month'],['Hosting',30,'month']]],
 ['Large Business',[
 ['Website - custom design, multiple sections, integrations',650,'once-off'],['Back office system - user roles, data management, reporting',500,'once-off'],['Social media management',500,'month'],['Website maintenance and support',150,'month'],['Secure managed hosting',80,'month']]],
 ['Video Adverts',[
 ['Advert script writing',40,'script'],['Video advert for social media and digital - 30 seconds to 1 minute',300,'once-off'],['Television advert - broadcast-ready, 30 seconds to 1 minute',1000,'once-off'],['Brand-led advertising campaign - multiple adverts across TV, social and digital',1500,'once-off'],['Brand-led advertising campaign - multiple adverts across TV, social and digital (retained)',1200,'month']]],
 ['Apps, Systems & Platforms',[
 ['Mobile application - Android and iOS',700,'once-off'],['Multi-portal platform - separate logins for customers, staff and admin',1500,'once-off'],['Customer loyalty programme - points, tiers and rewards, linked to app or website',1000,'once-off'],['CRM setup - customer records, pipelines and follow-up automation',300,'once-off'],['Property listing and management software',5000,'licence']]],
 ['Marketing Services',[
 ['Monthly SME Digital Package - social media, content and design bundle',350,'month'],['Growth Package - multi-channel marketing and lead generation',900,'month'],['Graphic design',20,'design'],['Graphic design - monthly package',200,'month'],['Content writing - blogs, website copy, profiles',25,'piece'],['Paid advertising management (ad spend paid separately)',100,'month'],['Search engine optimisation (SEO)',100,'month'],['LinkedIn marketing',150,'month'],['Email marketing - campaigns and newsletters (setup)',150,'setup'],['Email marketing - campaigns and newsletters',100,'month'],['Email funnels and automated sequences',300,'once-off'],['Website and digital presence audit report',50,'once-off']]],
 ['Call Centre & Business Process Outsourcing',[
 ['Virtual assistant - full-time seat',500,'month'],['Virtual assistant - part-time (4 hours a day)',300,'month'],['Inbound customer service agent seat',550,'month'],['Outbound sales and cold calling seat',600,'month'],['Outbound Sales Package - team, scripts and reporting',900,'month'],['Managed contact centre - team, supervisor and reporting',1200,'month'],['Data capturing',15,'1,000 records'],['Data mining and research',50,'project'],['Lead list sourcing',50,'500 verified leads']]],
 ['Sector Packages',[
 ['NXT Mine - mining sector marketing and support',1000,'month'],['NXT Farm - agriculture sector marketing and support',900,'month'],['NXT Property - real estate marketing and support',900,'month'],['NXT Bank - financial services marketing and support',1000,'month']]],
 ['Hosting Options',[
 ['Basic hosting - simple brochure websites, includes SSL certificate',10,'month'],['Business hosting - faster servers, weekly backups, SSL, malware scanning',30,'month'],['Secure managed hosting - daily backups, firewall, malware scanning, software updates, two-factor admin login, monitoring',80,'month']]],
];
export const serviceCatalogue:ServiceItem[]=groups.flatMap(([category,items],g)=>items.map(([description,price,unit],i)=>({id:`nxt-2026-${g+1}-${i+1}`,category,description,price,unit})));
export function catalogueLine(item:ServiceItem){return {description:`${item.category}: ${item.description}${item.unit==='once-off'?'':` (per ${item.unit})`}`,quantity:1,unit_price:item.price};}
