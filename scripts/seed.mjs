import { makeDefaultData } from '../src/model.mjs';
import { writeFile } from 'node:fs/promises';
await writeFile('supabase/seed.sql', `-- Initial season. Existing data is never overwritten.\ninsert into public.squad_state (id, data) values ('squad', '${JSON.stringify(makeDefaultData()).replaceAll("'", "''")}'::jsonb) on conflict (id) do nothing;\n`);
