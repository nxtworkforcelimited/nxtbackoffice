export const ticketStages=[
 {value:'New',label:'New'},
 {value:'Assigned',label:'Assigned'},
 {value:'In progress',label:'In Progress'},
 {value:'Waiting',label:'Waiting on User'},
 {value:'Resolved',label:'Resolved'}
] as const;
export function ticketStage(value:string){return value==='Closed'?'Resolved':value;}
export function ticketLabel(value:string){return ticketStages.find(s=>s.value===ticketStage(value))?.label??value;}
export function ticketComplete(value:string){return value==='Resolved'||value==='Closed';}
