# ResQGrid Database Setup Guide

ResQGrid supports dual data layers:
1. **Zero-Configuration In-Memory Store**: Default mode. Runs instantly without external credentials.
2. **Supabase PostgreSQL**: Persistent cloud database.

---

## Setting Up Supabase (Optional)

If you would like to connect your own Supabase project:

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com) and create a new project.
2. **Run `schema.sql`**:
   - Open the **SQL Editor** in your Supabase project dashboard.
   - Paste the contents of `database/schema.sql` and click **Run**.
3. **Run `seed.sql`**:
   - In the same SQL Editor, paste the contents of `database/seed.sql` and click **Run**.
4. **Configure Environment Variables**:
   - In your `.env` file (at the repository root), add:
     ```env
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
     ```
5. **Restart Server**:
   - Run `npm run dev` or restart your server.
   - The health endpoint (`/api/health`) and the top bar in the web app will now display:
     `Data: Supabase` instead of `Data: Demo memory`.

---

## Seeding via API
When `DEMO_MODE=true`, you can also trigger a reseed at any time:
- `POST /api/admin/seed`: Reseeds database from code.
- `POST /api/demo/reset`: Resets demo state to initial baseline.
