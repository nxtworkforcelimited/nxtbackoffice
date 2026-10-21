'use client';
import Legacy from './people-legacy';import LeaveWorkspace from './leave-workspace';import ClientInbox from './client-inbox';import type {ComponentProps} from 'react';
export default function People(p:ComponentProps<typeof Legacy>){return p.area==='leave'?<LeaveWorkspace workspace={p.workspace} demo={p.demo}/>:p.area==='messages'?<ClientInbox workspace={p.workspace} clients={p.clients} demo={p.demo}/>:<Legacy {...p}/>;}
