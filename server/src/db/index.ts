import { IRepository } from './repository.js';
import { MemoryRepository } from './memoryRepo.js';
import { SupabaseRepository } from './supabaseRepo.js';
import { ENV } from '../config/env.js';

let activeRepo: IRepository | null = null;
const memoryRepo = new MemoryRepository();

export async function getRepository(): Promise<IRepository> {
  if (activeRepo) {
    return activeRepo;
  }

  if (ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supa = new SupabaseRepository();
      // Test connectivity
      await supa.getHealth();
      console.log('[Database] Connected successfully to Supabase PostgreSQL.');
      activeRepo = supa;
      return activeRepo;
    } catch (err: any) {
      console.warn(
        `[Database] Supabase connection failed (${err?.message || err}). Falling back to In-Memory Demo Store.`
      );
      activeRepo = memoryRepo;
      return activeRepo;
    }
  }

  console.log('[Database] No Supabase credentials configured. Running with In-Memory Demo Store.');
  activeRepo = memoryRepo;
  return activeRepo;
}
