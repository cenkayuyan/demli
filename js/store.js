// Kişisel durum: sonra izle listesi, bitirilenler, öneriler, eklenen linkler.
// Giriş yapılmamışsa her şey bu tarayıcıda saklanır. Giriş yapılınca kayıtlar
// Supabase'e yazılır ve kişinin tüm cihazlarında aynı olur.
import * as cloud from './cloud.js';

const KEY = 'demli.v1';
const blank = () => ({ saved: [], done: {}, sent: [], added: [], snap: {}, time: null });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    return blank();
  }
}

// Akıştan düşen içerikler kaybolmasın diye kaydedilen her içeriğin bir kopyası tutulur.
const FIELDS = ['id', 'topic', 'tags', 'type', 'title', 'minutes', 'approx', 'published', 'url', 'youtubeId',
  'audioUrl', 'image', 'summary', 'source', 'lang', 'mark', 'fs'];
export function slim(item) {
  const out = {};
  FIELDS.forEach((k) => item[k] !== undefined && (out[k] = item[k]));
  return out;
}

let local = load();
let state = { ...local, user: null, me: null, people: null, incoming: [], links: [] };
const listeners = new Set();
const errorListeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.user ? { ...blank(), time: state.time } : {
      saved: state.saved, done: state.done, sent: state.sent, added: state.added, snap: state.snap, time: state.time,
    }));
  } catch {
    // Gizli pencere vb. durumlarda kayıt yapılamaz; site yine de çalışır.
  }
}

function commit() {
  persist();
  listeners.forEach((fn) => fn(state));
}

function remote(promise) {
  promise.catch((err) => errorListeners.forEach((fn) => fn(err)));
}

export const store = {
  get state() {
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  onError(fn) {
    errorListeners.add(fn);
  },

  isSaved: (id) => state.saved.includes(id),
  toggleSaved(item) {
    const on = !state.saved.includes(item.id);
    state.saved = on ? [item.id, ...state.saved] : state.saved.filter((x) => x !== item.id);
    if (on) state.snap[item.id] = slim(item);
    commit();
    if (state.user) remote(on ? cloud.save(slim(item)) : cloud.unsave(item.id));
    return on;
  },

  isDone: (id) => Boolean(state.done[id]),
  toggleDone(item) {
    const on = !state.done[item.id];
    if (on) {
      state.done[item.id] = new Date().toISOString();
      state.snap[item.id] = slim(item);
    } else {
      delete state.done[item.id];
    }
    commit();
    if (state.user) remote(on ? cloud.markDone(slim(item), state.done[item.id]) : cloud.unmarkDone(item.id));
    return on;
  },

  send({ item, to, note }) {
    state.snap[item.id] = slim(item);
    state.sent = [{ itemId: item.id, to, note, at: new Date().toISOString() }, ...state.sent];
    commit();
    if (state.user) remote(cloud.sendRec(to, slim(item), note));
  },

  addItem(item) {
    if (state.user) {
      state.links = [{ ...item, by: 'sen' }, ...state.links];
      remote(cloud.addLink(slim(item)));
    } else {
      state.added = [item, ...state.added];
    }
    commit();
  },

  setTime(value) {
    state.time = state.time === value ? null : value;
    commit();
  },

  unseenCount: () => state.incoming.filter((r) => !r.seen).length,
  markSeen() {
    const ids = state.incoming.filter((r) => !r.seen).map((r) => r.id);
    if (!ids.length) return;
    state.incoming.forEach((r) => (r.seen = true));
    commit();
    remote(cloud.markSeen(ids));
  },

  // ---------- Hesap ----------

  async attach(user) {
    let data = await cloud.loadAll();

    // İlk girişte bu tarayıcıdaki kayıtları hesaba taşı.
    const uploads = [];
    const remoteSaved = new Set(data.saved.map((r) => r.item_id));
    const remoteDone = new Set(data.done.map((r) => r.item_id));
    local.saved.forEach((id) => !remoteSaved.has(id) && local.snap[id] && uploads.push(cloud.save(local.snap[id])));
    Object.entries(local.done).forEach(([id, at]) => !remoteDone.has(id) && local.snap[id] && uploads.push(cloud.markDone(local.snap[id], at)));
    local.added.forEach((item) => uploads.push(cloud.addLink(slim(item))));
    if (uploads.length) {
      await Promise.allSettled(uploads);
      data = await cloud.loadAll();
    }
    local = { ...blank(), time: state.time };

    const snap = {};
    const remember = (item) => item && item.id && (snap[item.id] = item);
    data.saved.forEach((r) => remember(r.item));
    data.done.forEach((r) => remember(r.item));
    data.recs.forEach((r) => remember(r.item));

    const meRow = data.profiles.find((p) => p.id === user.id);
    state = {
      ...blank(),
      time: state.time,
      user,
      me: meRow ? meRow.name : user.email,
      people: data.profiles.filter((p) => p.id !== user.id).map((p) => ({ id: p.id, name: p.name })),
      saved: data.saved.map((r) => r.item_id),
      done: Object.fromEntries(data.done.map((r) => [r.item_id, r.done_at])),
      sent: data.recs.filter((r) => r.from_id === user.id).map((r) => ({ itemId: r.item.id, to: r.to_id, note: r.note, at: r.created_at })),
      incoming: data.recs.filter((r) => r.to_id === user.id)
        .map((r) => ({ id: r.id, item: r.item, from: r.from_id, note: r.note, at: r.created_at, seen: Boolean(r.seen_at) })),
      links: data.links.map((r) => ({ ...r.item, by: r.user_id === user.id ? 'sen' : r.user_id, addedAt: r.created_at })),
      snap,
    };
    commit();
  },

  detach() {
    local = load();
    state = { ...local, time: state.time, user: null, me: null, people: null, incoming: [], links: [] };
    commit();
  },
};
