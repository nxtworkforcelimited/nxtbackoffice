import {demoBusiness} from '@/lib/business';
import Dashboard from '@/components/dashboard';
import {demoData} from '@/lib/demo';
export default function Demo(){const workspace={id:'demo',name:'NXT Workforce',role:'owner' as const,client_id:null};return <Dashboard business={demoBusiness} initial={demoData} workspace={workspace} workspaces={[workspace]} email="Demo workspace" demo/>;}
