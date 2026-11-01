import {renderV6Page} from '@/lib/v6-render';

export async function GET(_req:Request, {params}: {params: Promise<{segments:string[]}>}){
  const {segments} = await params;
  return renderV6Page('/' + segments.join('/'));
}
