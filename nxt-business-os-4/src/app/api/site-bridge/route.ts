import type {NextRequest} from 'next/server';
import {renderV6Page} from '@/lib/v6-render';

export function GET(req:NextRequest){
  return renderV6Page(req.nextUrl.searchParams.get('path') || '/');
}
