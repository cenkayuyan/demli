// Kişisel durum: sonra izle listesi, bitirilenler, öneriler, eklenen linkler.
// Şimdilik tarayıcıda saklanıyor; yayına alma aşamasında ortak bir sunucuya taşınacak.

const KEY = 'demli.v1';
const blank = () => ({ saved: [], done: {}, sent: [], added: [], time: null });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    return blank();
  }
}

let state = load();
const listeners = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Gizli pencere vb. durumlarda kayıt yapılamaz; site yine de çalışır.
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get state() {
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  isSaved: (id) => state.saved.includes(id),
  toggleSaved(id) {
    state.saved = state.saved.includes(id) ? state.saved.filter((x) => x !== id) : [id, ...state.saved];
    commit();
    return state.saved.includes(id);
  },

  isDone: (id) => Boolean(state.done[id]),
  toggleDone(id) {
    if (state.done[id]) delete state.done[id];
    else state.done[id] = new Date().toISOString();
    commit();
    return Boolean(state.done[id]);
  },

  send({ itemId, to, note }) {
    state.sent = [{ itemId, to, note, at: new Date().toISOString() }, ...state.sent];
    commit();
  },

  addItem(item) {
    state.added = [item, ...state.added];
    commit();
  },

  setTime(value) {
    state.time = state.time === value ? null : value;
    commit();
  },
};
