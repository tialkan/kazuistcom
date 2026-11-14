import { notificationPrefsGet, notificationPrefsPut } from '@/server/auth/handlers';

export const dynamic = 'force-dynamic';

export const GET = notificationPrefsGet;
export const PUT = notificationPrefsPut;
