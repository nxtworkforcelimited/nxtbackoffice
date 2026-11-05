import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';

export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const {data,error}=await c.db.from('ga4_dashboard_snapshots').select('property_id,period_label,snapshot,updated_at').eq('tenant_id',c.workspace.id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
 if(error)return NextResponse.json({error:'Website analytics could not load.'},{status:503});
 return NextResponse.json(data??{property_id:'557554251',period_label:'Last 30 days',snapshot:null,updated_at:null},{headers:{'Cache-Control':'private, no-store'}});
}