// Keep legacy database values readable while showing one consistent four-stage workflow.
export const ticketStages=[{value:'New',label:'Not started'},{value:'In progress',label:'In progress'},{value:'Waiting',label:'Under review'},{value:'Resolved',label:'Complete'}] as const;
export function ticketStage(value:string){return value==='Assigned'?'New':value==='Closed'?'Resolved':value;}
export function ticketLabel(value:string){return ticketStages.find(s=>s.value===ticketStage(value))?.label??value;}
export function ticketComplete(value:string){return value==='Resolved'||value==='Closed';}
