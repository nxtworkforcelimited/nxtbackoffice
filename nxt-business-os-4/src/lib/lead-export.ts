export const leadStatuses=['new','contacted','qualified','converted','closed'] as const;
export function spreadsheetText(value:unknown){
 const text=String(value??'');
 return /^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;
}
export function leadCsv(rows:Record<string,unknown>[]){
 const columns=['id','business','name','phone','email','interest','source','status','created_at','consented_at','notes'];
 const cell=(v:unknown)=>'"'+spreadsheetText(v).replaceAll('"','""')+'"';
 return '\uFEFF'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n');
}
