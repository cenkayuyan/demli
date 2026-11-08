// Supabase ile konuşan katman: hesaplar, listeler, öneriler, linkler.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
let sb = null;

export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

export async function init() {
  if (!enabled) return null;
  const { createClient } = await import(LIB);
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

export function onAuthChange(fn) {
  if (sb) sb.auth.onAuthStateChange((_event, session) => fn(session ? session.user : null));
}

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function signIn(email, password) {
  return check(await sb.auth.signInWithPassword({ email, password })).user;
}

export async function signUp({ name, email, password, code }) {
  const data = check(await sb.auth.signUp({ email, password, options: { data: { name, davet: code } } }));
  if (!data.session) throw new Error('EMAIL_CONFIRM_ON');
  return data.user;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function loadAll() {
  const results = await Promise.all([
    sb.from('profiles').select('id,name'),
    sb.from('saved').select('item_id,item,created_at').order('created_at', { ascending: false }),
    sb.from('done').select('item_id,item,done_at'),
    sb.from('recs').select('id,from_id,to_id,item,note,created_at,seen_at').order('created_at', { ascending: false }),
    sb.from('links').select('id,user_id,item,created_at').order('created_at', { ascending: false }),
  ]);
  const [profiles, saved, done, recs, links] = results.map(check);
  return { profiles, saved, done, recs, links };
}

export const save = async (item) => check(await sb.from('saved').upsert({ item_id: item.id, item }));
export const unsave = async (id) => check(await sb.from('saved').delete().eq('item_id', id));
export const markDone = async (item, at) => check(await sb.from('done').upsert({ item_id: item.id, item, done_at: at }));
export const unmarkDone = async (id) => check(await sb.from('done').delete().eq('item_id', id));
export const sendRec = async (toId, item, note) => check(await sb.from('recs').insert({ to_id: toId, item, note: note || null }));
export const markSeen = async (ids) =>
  ids.length ? check(await sb.from('recs').update({ seen_at: new Date().toISOString() }).in('id', ids)) : null;
export const addLink = async (item) => check(await sb.from('links').insert({ item }));

// Supabase'in İngilizce hata mesajlarını anlaşılır Türkçeye çevirir.
export function authMessage(err) {
  const m = String((err && err.message) || err || '');
  if (/invalid login credentials/i.test(m)) return 'E-posta ya da şifre yanlış.';
  if (/DAVET_KODU_GECERSIZ|database error saving new user/i.test(m)) return 'Davet kodu yanlış. Kodu seni davet eden kişiden kontrol et.';
  if (/already registered|already been registered/i.test(m)) return 'Bu e-postayla zaten bir hesap var. "Giriş yap" ile gir.';
  if (/password should be at least|weak password/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/invalid email|unable to validate email/i.test(m)) return 'E-posta adresi geçerli görünmüyor.';
  if (/EMAIL_CONFIRM_ON|email not confirmed/i.test(m)) return 'Hesap açıldı ama e-posta onayı bekleniyor. Supabase\'de "Confirm email" ayarı kapatılmalı.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.';
  if (/failed to fetch|network/i.test(m)) return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';
  return 'Bir şeyler ters gitti: ' + m;
}
