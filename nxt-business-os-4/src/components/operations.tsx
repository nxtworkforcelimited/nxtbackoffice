'use client';
import Legacy from './operations-legacy';import WorkHub from './work-hub';import StaffAccess from './staff-access';import type {ComponentProps} from 'react';
export default function Operations(p:ComponentProps<typeof Legacy>){return p.area==='tasks'||p.area==='projects'?<WorkHub workspace={p.workspace} area={p.area} demo={p.demo}/>:<>{p.area==='team'&&p.workspace.role==='owner'&&!p.demo&&<StaffAccess workspace={p.workspace}/>}<Legacy {...p}/></>;}
