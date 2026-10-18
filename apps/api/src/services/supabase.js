import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../lib/errors.js';

export function createDatabaseService(config) {
  // Lazy initialization lets the app run before credentials are configured.
  let client;
  return {
    async check() {
      if (!config.supabaseUrl || !config.supabaseSecretKey) {
        throw new HttpError(503, 'Add SUPABASE_URL and SUPABASE_SECRET_KEY to apps/api/.env and restart the backend.');
      }
      try {
        client ||= createClient(config.supabaseUrl, config.supabaseSecretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await client.from('starter_health').select('id').limit(1).abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
      } catch {
        throw new HttpError(503, 'Supabase check failed. Verify credentials and run supabase/migrations/001_starter.sql.');
      }
      return { status: 'connected' };
    },
  };
}
