import { adminProfessionsGet, adminProfessionsPost } from '@/server/auth/handlers';

export const dynamic = 'force-dynamic';

export const GET = adminProfessionsGet;
export const POST = adminProfessionsPost;
