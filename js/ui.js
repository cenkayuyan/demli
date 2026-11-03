// Ortak parçalar: kaçış, süre biçimi, ikonlar, kart ve raf.
import { topic, person } from './data.js';
import { store } from './store.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const TYPE_LABEL = { video: 'Video', podcast: 'Podcast', yazi: 'Yazı', haber: 'Haber' };

export function fmtMinutes(min) {
  if (min < 60) return min + ' dk';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? h + ' sa ' + m + ' dk' : h + ' sa';
}
export const fmtDuration = (i) =>
  (i.approx ? '≈ ' : '') + (i.type === 'yazi' || i.type === 'haber' ? i.minutes + ' dk okuma' : fmtMinutes(i.minutes));

// Kart ve kapak görseli: YouTube küçük resmi ya da akıştan gelen görsel.
export function imageOf(i, { large = false } = {}) {
  if (i.youtubeId) return `https://i.ytimg.com/vi/${encodeURIComponent(i.youtubeId)}/${large ? 'maxresdefault' : 'mqdefault'}.jpg`;
  return i.image || '';
}
const fallbackImg = (i) => (i.youtubeId ? ` onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${esc(i.youtubeId)}/hqdefault.jpg'"` : ` onerror="this.remove()"`);
export const imgTag = (i, opts = {}) => {
  const src = imageOf(i, opts);
  return src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"${fallbackImg(i)}>` : '';
};

const DATE_FMT = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
export function fmtDate(iso) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return DATE_FMT.format(d);
}

export const icon = {
  play: '<svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1.5v13a.8.8 0 0 0 1.2.7l11-6.5a.8.8 0 0 0 0-1.4l-11-6.5A.8.8 0 0 0 1 1.5z"/></svg>',
  bookmark: '<svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 1.5h10v13L7 11l-5 3.5z"/></svg>',
  bookmarkFill: '<svg aria-hidden="true" width="12" height="14" viewBox="0 0 14 16" fill="currentColor"><path d="M2 1.5h10v13L7 11l-5 3.5z"/></svg>',
  send: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M14.5 1.5L1.5 7l5 2 2 5z"/><path d="M14.5 1.5L6.5 9"/></svg>',
  plus: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  check: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  out: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h4v4M12 2L6 8M10 8.5V12H2V4h3.5"/></svg>',
  back: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2L4 7l5 5"/></svg>',
  user: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="6" r="3.2"/><path d="M2.8 16c.8-3.2 3.2-5 6.2-5s5.4 1.8 6.2 5" stroke-linecap="round"/></svg>',
  glass: '<svg aria-hidden="true" width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h16c-1.5 6-1.5 9 0 13-1.2 6-3.5 11-8 11s-6.8-5-8-11c1.5-4 1.5-7 0-13z"/><path d="M6.4 14h13.2" stroke-linecap="round"/></svg>',
};

export function poster(i, { big = false } = {}) {
  const t = topic(i.topic) || { bg: '#2A1A13', fg: '#F0B860' };
  const fs = Math.round((i.fs || 56) * (big ? 1.9 : 1));
  const img = imgTag(i, { large: big });
  const flag = store.isDone(i.id)
    ? `<span class="poster__flag poster__flag--done" title="Bitirdin">${icon.check}</span>`
    : store.isSaved(i.id)
      ? `<span class="poster__flag" title="Sonra izle listende">${icon.bookmarkFill}</span>`
      : '';
  return `<div class="poster" style="--p-bg:${t.bg};--p-fg:${t.fg}">
    <span class="poster__mark" aria-hidden="true" style="font-size:${fs}px">${esc(i.mark || i.title.charAt(0))}</span>
    ${img}
    <span class="poster__type">${TYPE_LABEL[i.type] || 'İçerik'}</span>
    ${flag}
    <span class="poster__dur">${esc(fmtDuration(i))}</span>
  </div>`;
}

export function metaLine(i, { showTopic = true } = {}) {
  const parts = [];
  if (i.by === 'sen') parts.push('Sen ekledin');
  else if (i.by) parts.push(esc((person(i.by) || { name: i.by }).name) + ' önerdi');
  if (i.source) parts.push(esc(i.source.split(' · ')[0]));
  if (showTopic) parts.push(esc((topic(i.topic) || {}).short || ''));
  else parts.push(fmtDate(i.published));
  if (i.lang === 'en') parts.push('EN');
  return parts.filter(Boolean).join(' · ');
}

export function card(i, opts) {
  return `<a class="card" href="#/icerik/${esc(i.id)}">
    ${poster(i)}
    <span class="card__title">${esc(i.title)}</span>
    <span class="card__meta">${metaLine(i, opts)}</span>
  </a>`;
}

export function row({ title, sub = '', href = '', list, empty = 'Burada henüz içerik yok.', opts }) {
  const head = href ? `<a href="${href}">${esc(title)}</a>` : esc(title);
  return `<section class="row" aria-label="${esc(title)}">
    <div class="row__head wrap">
      <div class="row__titles"><h2 class="row__title">${head}</h2>${sub ? `<span class="row__sub">${esc(sub)}</span>` : ''}</div>
      ${href ? `<a class="row__more" href="${href}">Tümü</a>` : ''}
    </div>
    ${list.length
      ? `<div class="row__track wrap">${list.slice(0, 15).map((i) => card(i, opts)).join('')}</div>`
      : `<p class="row__empty wrap">${esc(empty)}</p>`}
  </section>`;
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}
