// contacts-import — bulk import contacts from CSV / JSON.
// Input: either
//   { format: 'csv', csv: string, has_header?: boolean, mapping?: {email?, first_name?, last_name?, company?, tags?} }
//   { format: 'json', records: [{email, first_name?, last_name?, company?, tags?: string[]}] }
// Output: { imported, skipped, errors: {row, reason}[], inserted_ids: uuid[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'contacts-import';

const MAX_RECORDS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(csv: string, hasHeader: boolean): { headers: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (l: string): string[] => {
    // Minimal CSV parser handling quoted fields with commas.
    const out: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (inQ) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"' && cur === '') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = hasHeader ? parseLine(lines[0]).map(h => h.toLowerCase()) : [];
  const rows = (hasHeader ? lines.slice(1) : lines).map(parseLine);
  return { headers, rows };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const format = String(body.format ?? 'json');

    let records: any[] = [];
    if (format === 'csv') {
      const csv = String(body.csv ?? '');
      if (!csv) return jsonResp({ error: 'csv required' }, 400);
      const hasHeader = body.has_header !== false;
      const { headers, rows } = parseCsv(csv, hasHeader);
      const mapping = body.mapping ?? {};
      const colIdx = (name: string) => {
        const explicit = mapping[name];
        if (typeof explicit === 'number') return explicit;
        return headers.indexOf(explicit ?? name);
      };
      records = rows.map(r => ({
        email: r[colIdx('email')] ?? '',
        first_name: r[colIdx('first_name')] ?? '',
        last_name: r[colIdx('last_name')] ?? '',
        company: r[colIdx('company')] ?? '',
        tags: (r[colIdx('tags')] ?? '').split(/[;|]/).map((s: string) => s.trim()).filter(Boolean),
      }));
    } else {
      records = Array.isArray(body.records) ? body.records : [];
    }

    if (records.length === 0) return jsonResp({ error: 'no records' }, 400);
    if (records.length > MAX_RECORDS) return jsonResp({ error: `too many records (max ${MAX_RECORDS})` }, 413);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const valid: any[] = []; const errors: { row: number; reason: string }[] = [];
    records.forEach((r, idx) => {
      const email = String(r.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { errors.push({ row: idx, reason: 'invalid_email' }); return; }
      valid.push({
        user_id: user.id,
        email,
        first_name: String(r.first_name ?? '').trim() || null,
        last_name: String(r.last_name ?? '').trim() || null,
        company: String(r.company ?? '').trim() || null,
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        source: 'import',
      });
    });

    // Chunked upsert to avoid postgres parameter-limit explosion.
    const chunk = 200; const insertedIds: string[] = [];
    for (let i = 0; i < valid.length; i += chunk) {
      const slice = valid.slice(i, i + chunk);
      const { data, error } = await admin
        .from('contacts')
        .upsert(slice, { onConflict: 'user_id,email', ignoreDuplicates: false })
        .select('id');
      if (error) {
        slice.forEach((_, j) => errors.push({ row: i + j, reason: error.message }));
      } else {
        (data ?? []).forEach((row: any) => insertedIds.push(row.id));
      }
    }

    return jsonResp({
      imported: insertedIds.length,
      skipped: records.length - insertedIds.length - errors.length,
      errors,
      inserted_ids: insertedIds,
    });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
