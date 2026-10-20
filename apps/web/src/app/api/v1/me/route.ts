import { meDelete, meGet, mePatch } from '@/server/auth/handlers';

export const dynamic = 'force-dynamic';

export const GET = meGet;
export const PATCH = mePatch;
export const DELETE = meDelete;
