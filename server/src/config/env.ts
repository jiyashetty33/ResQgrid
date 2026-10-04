import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root or server
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  N8N_BASE_URL: process.env.N8N_BASE_URL || 'http://localhost:5678',
  N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET || 'change-me',
  N8N_ENABLED: process.env.N8N_ENABLED === 'true',
  DEMO_MODE: process.env.DEMO_MODE !== 'false',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
