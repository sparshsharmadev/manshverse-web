import { requireSupabase, supabase } from "../supabase";

const now = () => new Date().toISOString();
export const serverTimestamp = () => now();
export const increment = (by) => ({ __increment: by });
export const doc = (_db, ...parts) => ({ kind: "doc", parts });
export const collection = (_db, ...parts) => ({ kind: "collection", parts });
export const orderBy = (field, direction = "asc") => ({ type: "order", field, direction });
export const limit = (count) => ({ type: "limit", count });
export const query = (ref, ...constraints) => ({ ...ref, constraints });

function target(parts) {
  if (parts[0] === "plan_requests") return { table: "plan_requests", data: "request" };
  if (parts[0] === "settings") return { table: "app_settings", id: parts[1], userId: null, data: "settings" };
  if (parts[0] !== "users") throw new Error(`Unsupported data path: ${parts.join("/")}`);
  if (parts.length === 1) return { table: "profiles", data: "profile" };
  const userId = parts[1];
  if (parts.length === 2) return { table: "profiles", id: userId, userId, data: "profile" };
  if (parts[2] === "conversations") {
    if (parts.length === 3) return { table: "conversations", userId, data: "conversation" };
    if (parts.length === 4) return { table: "conversations", id: parts[3], userId, data: "conversation" };
    if (parts[4] === "messages") return { table: "messages", id: parts[5], conversationId: parts[3], userId, data: "message" };
  }
  if (parts[2] === "usage") return { table: "daily_usage", id: parts[3], userId, data: "usage" };
  if (parts[2] === "planRequests") return { table: "plan_requests", id: parts[3], userId, data: "request" };
  throw new Error(`Unsupported data path: ${parts.join("/")}`);
}
const rowData = (row, t) => t.data === "settings" ? row.data || {} : t.data === "profile" ? row.data || {} : row.data || {};
const toRow = (t, data) => {
  if (t.table === "app_settings") return { key: t.id, data };
  const row = { data };
  if (t.userId && t.table !== "profiles") row.user_id = t.userId;
  if (t.id && t.table !== "daily_usage") row.id = t.id;
  if (t.conversationId) row.conversation_id = t.conversationId;
  if (t.table === "daily_usage") row.day = t.id;
  return row;
};
const idOf = (row, t) => t.table === "app_settings" ? row.key : t.table === "daily_usage" ? row.day : row.id;
function snapshot(row, t) {
  return { id: idOf(row, t), exists: () => Boolean(row), data: () => row ? rowData(row, t) : undefined, ref: { parent: { parent: { id: row?.user_id } } } };
}
function unwrap(result) { if (result.error) throw result.error; return result.data; }
function mergeData(oldData = {}, newData = {}) {
  const out = { ...oldData };
  for (const [key, val] of Object.entries(newData)) out[key] = val && typeof val === "object" && "__increment" in val ? Number(oldData[key] || 0) + val.__increment : val;
  return out;
}
export async function getDoc(ref) {
  const t = target(ref.parts); const sb = requireSupabase();
  let req = sb.from(t.table).select("*").eq(t.table === "app_settings" ? "key" : t.table === "daily_usage" ? "day" : "id", t.id);
  if (t.userId && t.table !== "profiles") req = req.eq("user_id", t.userId);
  if (t.conversationId) req = req.eq("conversation_id", t.conversationId);
  const row = unwrap(await req.maybeSingle()); return snapshot(row, t);
}
export async function getDocs(ref) {
  const t = target(ref.parts); const sb = requireSupabase();
  let req = sb.from(t.table).select("*");
  if (t.userId) req = req.eq("user_id", t.userId);
  if (t.conversationId) req = req.eq("conversation_id", t.conversationId);
  for (const c of ref.constraints || []) if (c.type === "order") req = req.order(c.field === "createdAt" ? "created_at" : c.field, { ascending: c.direction !== "desc" }); else if (c.type === "limit") req = req.limit(c.count);
  if (t.table === "plan_requests" && ref.parts.length === 1) { /* RLS scopes admin visibility */ }
  const rows = unwrap(await req); const docs = rows.map(row => snapshot(row, t)); return { docs, size: docs.length, empty: docs.length === 0 };
}
export async function addDoc(ref, payload) {
  const t = target(ref.parts); const sb = requireSupabase(); const data = { createdAt: now(), ...payload };
  const row = toRow(t, data); const saved = unwrap(await sb.from(t.table).insert(row).select("*").single());
  return { id: idOf(saved, t) };
}
export async function setDoc(ref, payload, options = {}) {
  const t = target(ref.parts); const sb = requireSupabase(); const old = await getDoc(ref);
  const oldData = options.merge ? old.data() || {} : {};
  const data = options.merge ? mergeData(oldData, payload) : payload;
  const row = toRow(t, { ...oldData, ...data, updatedAt: now() });
  const key = t.table === "app_settings" ? "key" : t.table === "daily_usage" ? "user_id,day" : "id";
  unwrap(await sb.from(t.table).upsert(row, { onConflict: key }));
}
export async function updateDoc(ref, payload) { return setDoc(ref, payload, { merge: true }); }
export async function deleteDoc(ref) {
  const t = target(ref.parts); const sb = requireSupabase(); let req = sb.from(t.table).delete().eq(t.table === "app_settings" ? "key" : t.table === "daily_usage" ? "day" : "id", t.id);
  if (t.table === "profiles") {
    const { error } = await sb.rpc("delete_manshverse_user", { target_user: t.id });
    if (error) throw error;
    return;
  }
  if (t.userId && t.table !== "profiles") req = req.eq("user_id", t.userId);
  unwrap(await req);
}
export function onSnapshot(ref, next, error = console.error) {
  let stopped = false;
  let refreshing = false;
  const refresh = async () => {
    if (stopped || refreshing) return;
    refreshing = true;
    try {
      if (ref.kind === "doc") {
        const snap = await getDoc(ref);
        next({ exists: snap.exists, data: snap.data });
      } else {
        next(await getDocs(ref));
      }
    } catch (err) {
      error(err);
    } finally {
      refreshing = false;
    }
  };
  refresh();
  // Realtime is the primary update path; this is a slow fallback for dropped subscriptions.
  const timer = window.setInterval(refresh, 30000);
  const channel = supabase?.channel(`watch-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: target(ref.parts).table }, refresh).subscribe();
  return () => { stopped = true; clearInterval(timer); if (channel) supabase.removeChannel(channel); };
}
export function collectionGroup(_db, group) { return { kind: "collection", parts: [group === "planRequests" ? "plan_requests" : group] }; }
