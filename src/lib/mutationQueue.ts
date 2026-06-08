// src/lib/mutationQueue.ts
// Lightweight offline mutation queue. Phase B of P0-5.
//
// When the device is offline (or a write fails with a network error),
// the caller can enqueue the operation here. On the next "online" pulse
// from useOnlineStatus, flushQueue() replays them in order.
//
// Designed for the event-capture use case: a user at a bad-WiFi venue
// captures 12 posts. Without this queue all 12 writes 5xx and the
// captures are lost. With this queue: the user sees the captures locally
// (cached query updated optimistically), the writes queue, and they
// flush automatically when the user gets back to good signal.
//
// Constraints:
//   • Only writes that fit the {table, op: insert|update|delete, payload}
//     shape are queueable.
//   • Mutations referencing locally-minted UUIDs (no FK to server-side
//     rows that don't exist yet) work; cross-row dependencies do NOT —
//     caller is responsible for keeping the queue order coherent.
//   • Queue persists across cold starts in AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

const QUEUE_KEY = '@inclufy_mutation_queue_v1';

export type MutationOp = 'insert' | 'update' | 'delete';

export interface QueuedMutation {
  id: string;                    // client-generated UUID, also used as idempotency key
  table: string;
  op: MutationOp;
  payload?: Record<string, unknown>;
  match?: Record<string, unknown>;  // for update/delete: WHERE clause
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

async function loadQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(q: QueuedMutation[]): Promise<void> {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch (e) { console.warn('[mutationQueue] save failed:', e); }
}

export async function enqueue(mut: Omit<QueuedMutation, 'enqueuedAt' | 'attempts'>): Promise<void> {
  const queue = await loadQueue();
  queue.push({ ...mut, enqueuedAt: Date.now(), attempts: 0 });
  await saveQueue(queue);
}

export async function getQueueSize(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export interface FlushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  remaining: number;
}

export async function flushQueue(): Promise<FlushResult> {
  const queue = await loadQueue();
  if (queue.length === 0) return { attempted: 0, succeeded: 0, failed: 0, remaining: 0 };

  const survivors: QueuedMutation[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const mut of queue) {
    try {
      let res;
      if (mut.op === 'insert') {
        res = await supabase.from(mut.table).insert(mut.payload as any);
      } else if (mut.op === 'update') {
        let q = supabase.from(mut.table).update(mut.payload as any) as any;
        for (const [k, v] of Object.entries(mut.match ?? {})) q = q.eq(k, v);
        res = await q;
      } else {
        let q = supabase.from(mut.table).delete() as any;
        for (const [k, v] of Object.entries(mut.match ?? {})) q = q.eq(k, v);
        res = await q;
      }
      if (res?.error) throw res.error;
      succeeded++;
    } catch (e: any) {
      failed++;
      const attempts = mut.attempts + 1;
      // Drop after 5 attempts to avoid permanent failures eating the queue
      if (attempts < 5) {
        survivors.push({ ...mut, attempts, lastError: e?.message ?? String(e) });
      } else {
        console.warn('[mutationQueue] dropping after 5 attempts:', mut.id, e?.message);
      }
    }
  }

  await saveQueue(survivors);
  return {
    attempted: queue.length,
    succeeded,
    failed,
    remaining: survivors.length,
  };
}

export async function clearQueue(): Promise<void> {
  try { await AsyncStorage.removeItem(QUEUE_KEY); } catch {}
}
