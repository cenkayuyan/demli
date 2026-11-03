// Yönlendirme, düğme işlemleri ve pencereler.
import * as D from './data.js';
import { store } from './store.js';
import * as V from './views.js';
import { esc, toast } from './ui.js';

const app = document.getElementById('app');
const addDialog = document.getElementById('add-dialog');
const sendDialog = document.getElementById('send-dialog');

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [page = '', id = ''] = parts;
  switch (page) {
    case '': return { key: 'home', html: V.home, nav: 'home' };
    case 'konu': return { key: 'konu/' + id, html: () => V.topicPage(id), nav: 'konular' };
    case 'icerik': return { key: 'icerik/' + id, html: () => V.itemPage(id), nav: '' };
    case 'sonra': return { key: 'sonra', html: V.savedPage, nav: 'sonra' };
    case 'arkadaslar': return { key: 'arkadaslar', html: V.friendsPage, nav: 'arkadaslar' };
    case 'haftam': return { key: 'haftam', html: V.weekPage, nav: 'haftam' };
    default: return { key: '404', html: V.notFound, nav: '' };
  }
}

let currentKey = null;

function render() {
  const r = route();
  const same = r.key === currentKey;

  // Aynı sayfada yeniden çizerken rafların kaydırma yerini ve odağı koru.
  const scrolls = same ? [...app.querySelectorAll('.row__track')].map((el) => el.scrollLeft) : [];
  const active = document.activeElement;
  const focusSel = same && active && active.dataset && active.dataset.action
    ? `[data-action="${active.dataset.action}"]${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}${active.dataset.value ? `[data-value="${CSS.escape(active.dataset.value)}"]` : ''}`
    : null;

  app.innerHTML = r.html();
  currentKey = r.key;

  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.nav === r.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (same) {
    app.querySelectorAll('.row__track').forEach((el, n) => (el.scrollLeft = scrolls[n] || 0));
    if (focusSel) app.querySelector(focusSel)?.focus();
  } else {
    window.scrollTo(0, 0);
    const title = app.querySelector('h1');
    document.title = r.key === 'home' || !title ? 'Demli' : title.textContent + ' · Demli';
  }
}

// ---------- Düğmeler ----------
app.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, value } = btn.dataset;
  if (action === 'time') store.setTime(value);
  else if (action === 'type') {
    V.setTypeFilter(value);
    render();
  } else if (action === 'save') toast(store.toggleSaved(id) ? 'Sonra izle listene eklendi' : 'Listenden çıkarıldı');
  else if (action === 'done') toast(store.toggleDone(id) ? 'Haftalık özetine eklendi' : 'Bitirdim işareti kaldırıldı');
  else if (action === 'recommend') openSend(id);
});

document.querySelector('[data-action="add-link"]').addEventListener('click', openAdd);

document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Link ekle ----------
const addForm = addDialog.querySelector('form');
const f = {
  url: document.getElementById('link-url'),
  title: document.getElementById('link-title'),
  topic: document.getElementById('link-topic'),
  type: document.getElementById('link-type'),
  minutes: document.getElementById('link-minutes'),
  note: document.getElementById('link-note'),
  error: document.getElementById('link-error'),
};

function openAdd() {
  addForm.reset();
  f.error.hidden = true;
  f.topic.innerHTML = D.topics().map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  addDialog.showModal();
  f.url.focus();
}

f.url.addEventListener('change', async () => {
  const info = D.parseLink(f.url.value);
  if (!info) return;
  f.type.value = info.type;
  if (info.youtubeId && !f.title.value) {
    f.title.placeholder = 'Başlık getiriliyor…';
    const title = await D.youtubeTitle(info.url);
    f.title.placeholder = 'Örneğin: Semerkant gezisi';
    if (title && !f.title.value) f.title.value = title;
  }
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const info = D.parseLink(f.url.value);
  if (!info) {
    f.error.textContent = 'Bu bir bağlantıya benzemiyor. https:// ile başlayan tam adresi yapıştır.';
    f.error.hidden = false;
    f.url.focus();
    return;
  }
  const title = f.title.value.trim() || info.host;
  const item = {
    id: 'u' + Date.now().toString(36),
    topic: f.topic.value,
    type: f.type.value,
    title,
    minutes: Math.max(1, parseInt(f.minutes.value, 10) || 10),
    published: new Date().toISOString().slice(0, 10),
    url: info.url,
    youtubeId: info.youtubeId,
    summary: f.note.value.trim(),
    mark: title.charAt(0).toUpperCase(),
    fs: 72,
    by: 'sen',
  };
  store.addItem(item);
  addDialog.close();
  location.hash = '#/icerik/' + item.id;
  toast((D.topic(item.topic) || {}).name + ' rafına eklendi');
});

// ---------- Birine öner ----------
const sendForm = sendDialog.querySelector('form');
function openSend(itemId) {
  const i = D.item(itemId);
  if (!i) return;
  sendForm.reset();
  sendForm.dataset.item = itemId;
  document.getElementById('send-title').textContent = i.title;
  document.getElementById('send-people').innerHTML = D.people()
    .map((p, n) => `<label class="person" style="cursor:pointer"><input type="radio" name="to" value="${esc(p.id)}" ${n === 0 ? 'checked' : ''}> ${esc(p.name)}</label>`)
    .join('');
  sendDialog.showModal();
}

sendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const to = new FormData(sendForm).get('to');
  store.send({ itemId: sendForm.dataset.item, to, note: document.getElementById('send-note').value.trim() });
  sendDialog.close();
  toast((D.person(to) || { name: to }).name + ' için öneri kaydedildi');
});

// ---------- Başlat ----------
store.subscribe(render);
window.addEventListener('hashchange', render);

D.loadContent()
  .then(() => {
    document.getElementById('sample-notice').hidden = !D.isSample();
    render();
  })
  .catch((err) => {
    app.innerHTML = `<section class="page-head wrap"><h1 class="page-head__title">İçerikler yüklenemedi</h1>
      <p class="page-head__text">${esc(err.message)}. Siteyi bir yerel sunucu üzerinden açtığından emin ol (README'de nasıl yapılacağı yazıyor).</p></section>`;
  });
