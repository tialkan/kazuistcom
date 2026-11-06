import { projeDelete, projeGet, projePatch } from '@/app/yazma/_sunucu/uclar.ts';

export const dynamic = 'force-dynamic';

export const GET = projeGet();
export const PATCH = projePatch();
export const DELETE = projeDelete();
