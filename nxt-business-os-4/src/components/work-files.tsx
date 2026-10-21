'use client';
import LegacyWorkFiles from './work-files-legacy';
import TaskChat from './task-chat';
import type {ComponentProps} from 'react';
export default function WorkFiles(props:ComponentProps<typeof LegacyWorkFiles>){return <><LegacyWorkFiles {...props}/><TaskChat workspace={props.workspace} parent={props.parent} kind={props.kind} demo={props.demo}/></>;}
