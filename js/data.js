// İçerik verisi: data/content.json + kullanıcının elle eklediği linkler.
import { store } from './store.js';

let base = { sample: false, topics: [], people: [], items: [] };

export async function loadContent() {
  const res = await fetch('data/content.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('İçerik dosyası okunamadı (' + res.status + ')');
  base = await res.json();
}

export const isSample = () => Boolean(base.sample);
export const topics = () => base.topics;
export const people = () => base.people;
export const topic = (id) => base.topics.find((t) => t.id === id);
export const person = (id) => base.people.find((p) => p.id === id);

export function items() {
  return [...store.state.added, ...base.items];
}
export const item = (id) => items().find((i) => i.id === id);

export const byNewest = (a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0);

export function inTopic(topicId) {
  return items().filter((i) => i.topic === topicId || (i.tags || []).includes(topicId)).sort(byNewest);
}

// "Ne kadar vaktin var?" seçimine göre süzme.
export const TIME_OPTIONS = [
  { id: '15', label: '15 dk', test: (m) => m <= 15, note: '15 dakikaya' },
  { id: '30', label: '30 dk', test: (m) => m <= 30, note: 'Yarım saate' },
  { id: '60', label: '1 saat', test: (m) => m <= 60, note: '1 saate' },
  { id: 'aksam', label: 'Akşam boyu', test: (m) => m >= 40, note: 'Uzun bir akşama' },
];
export function fitsTime(list, timeId) {
  const opt = TIME_OPTIONS.find((o) => o.id === timeId);
  return opt ? list.filter((i) => opt.test(i.minutes)) : list;
}

export function newThisWeek(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 7);
  const iso = cutoff.toISOString().slice(0, 10);
  return items().filter((i) => i.published >= iso).sort(byNewest);
}

// Raf tek bir konunun haberleriyle dolmasın: konular sırayla birer birer dizilir.
export function mixTopics(list) {
  const groups = new Map();
  list.forEach((i) => {
    if (!groups.has(i.topic)) groups.set(i.topic, []);
    groups.get(i.topic).push(i);
  });
  const queues = [...groups.values()];
  const out = [];
  while (queues.some((q) => q.length)) queues.forEach((q) => q.length && out.push(q.shift()));
  return out;
}

export const fromFriends = () => items().filter((i) => i.by && i.by !== 'sen').sort(byNewest);

// Haftanın başlangıcı: pazartesi 00:00.
export function weekStart(now = new Date()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function weekStats(now = new Date()) {
  const start = weekStart(now);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const done = Object.entries(store.state.done)
    .map(([id, at]) => ({ item: item(id), at: new Date(at) }))
    .filter((d) => d.item);

  const thisWeek = done.filter((d) => d.at >= start).sort((a, b) => b.at - a.at);
  const lastWeek = done.filter((d) => d.at >= prevStart && d.at < start);
  const sum = (arr) => arr.reduce((n, d) => n + d.item.minutes, 0);

  const perTopic = {};
  const perType = { video: 0, podcast: 0, yazi: 0, haber: 0 };
  thisWeek.forEach(({ item: i }) => {
    perTopic[i.topic] = (perTopic[i.topic] || 0) + i.minutes;
    perType[i.type] = (perType[i.type] || 0) + 1;
  });
  const topicRows = Object.entries(perTopic)
    .map(([id, minutes]) => ({ topic: topic(id), minutes }))
    .filter((r) => r.topic)
    .sort((a, b) => b.minutes - a.minutes);

  return { total: sum(thisWeek), last: sum(lastWeek), list: thisWeek, topicRows, perType };
}

// Link ekle: bağlantıdan türü ve YouTube kimliğini çıkar.
export function parseLink(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let youtubeId = null;
  if (host === 'youtu.be') youtubeId = url.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com')) {
    youtubeId = url.searchParams.get('v') || (url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1] || null;
  }
  let type = 'yazi';
  if (youtubeId || host.endsWith('vimeo.com')) type = 'video';
  else if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts\.com|castbox\.fm/.test(host) || /\.(mp3|m4a)$/i.test(url.pathname)) type = 'podcast';
  else if (/news|haber|bbc|reuters|aljazeera|dw\.com|ft\.com/.test(host)) type = 'haber';
  return { url: url.href, host, youtubeId: youtubeId && /^[\w-]{6,}$/.test(youtubeId) ? youtubeId : null, type };
}

export async function youtubeTitle(url) {
  try {
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url));
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
  }
}
