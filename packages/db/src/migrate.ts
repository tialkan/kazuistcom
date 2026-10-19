import { fileURLToPath } from 'node:url';

/** Absolute path of the drizzle migrations folder, for drizzle-orm migrators. */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
