// Yönlendirme, düğme işlemleri ve pencereler.
import * as D from './data.js';
import * as cloud from './cloud.js';
import { store } from './store.js';
import * as V from './views.js';
import { esc, toast } from './ui.js';

const app = document.getElementById('app');
const addDialog = document.getElementById('add-dialog');
const sendDialog = document.getElementById('send-dialog');
const authDialog = document.getElementById('auth-dialog');
const accountDialog = document.getElementById('account-dialog');
const accountBtn = document.getElementById('account-btn');
const recBadge = document.getElementById('rec-badge');

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [page = '', id = ''] = parts;
  switch (page) {
    case '': return { key: 'home', html: V.home, nav: 'home' };
    case 'konular': return { key: 'konular', html: V.topicsPage, nav: 'konular' };
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

  updateAccount();
  if (r.key === 'arkadaslar' && store.state.user && store.unseenCount()) setTimeout(() => store.markSeen(), 0);
}

function updateAccount() {
  const s = store.state;
  accountBtn.hidden = !cloud.enabled;
  if (s.user) {
    const name = s.me || s.user.email;
    accountBtn.innerHTML = `<span class="account-btn__avatar" aria-hidden="true">${esc(name.charAt(0).toLocaleUpperCase('tr'))}</span>${esc(name)}`;
    accountBtn.setAttribute('aria-label', 'Hesabın: ' + name);
  } else {
    accountBtn.textContent = 'Giriş yap';
    accountBtn.removeAttribute('aria-label');
  }
  const unseen = store.unseenCount();
  recBadge.hidden = !unseen;
  recBadge.textContent = unseen ? String(unseen) : '';
  recBadge.setAttribute('aria-label', unseen + ' yeni öneri');
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
  } else if (action === 'save' && D.item(id)) toast(store.toggleSaved(D.item(id)) ? 'Sonra izle listene eklendi' : 'Listenden çıkarıldı');
  else if (action === 'done' && D.item(id)) toast(store.toggleDone(D.item(id)) ? 'Haftalık özetine eklendi' : 'Bitirdim işareti kaldırıldı');
  else if (action === 'recommend') openSend(id);
  else if (action === 'login') openAuth();
});

accountBtn.addEventListener('click', () => {
  if (!store.state.user) return openAuth();
  document.getElementById('account-info').textContent = (store.state.me || '') + ' · ' + store.state.user.email;
  accountDialog.showModal();
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  accountDialog.close();
  await cloud.signOut();
  toast('Çıkış yaptın');
});

store.onError(() => toast('Kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene.'));

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
  if (cloud.enabled && !store.state.user) return openAuth('Öneri göndermek için önce giriş yap.');
  if (!D.people().length) return toast('Henüz başka kimse hesap açmadı. Davet kodunu arkadaşlarına gönder.');
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
  const item = D.item(sendForm.dataset.item);
  if (!item || !to) return;
  store.send({ item, to, note: document.getElementById('send-note').value.trim() });
  sendDialog.close();
  const name = (D.person(to) || { name: to }).name;
  toast(store.state.user ? name + ' için öneri gönderildi' : name + ' için öneri kaydedildi');
});

// ---------- Giriş / hesap aç ----------
const authForm = authDialog.querySelector('form');
const a = {
  title: document.getElementById('auth-title'),
  lead: document.getElementById('auth-lead'),
  nameField: document.getElementById('auth-name-field'),
  name: document.getElementById('auth-name'),
  email: document.getElementById('auth-email'),
  password: document.getElementById('auth-password'),
  passwordHint: document.getElementById('auth-password-hint'),
  codeField: document.getElementById('auth-code-field'),
  code: document.getElementById('auth-code'),
  error: document.getElementById('auth-error'),
  switchBtn: document.getElementById('auth-switch'),
  submit: document.getElementById('auth-submit'),
};
const LEAD = 'Önerilerin, Sonra izle listen ve haftan tüm cihazlarında aynı olsun.';
let signupMode = false;

function setAuthMode(signup) {
  signupMode = signup;
  a.title.textContent = signup ? 'Hesap aç' : 'Giriş yap';
  a.submit.textContent = signup ? 'Hesap aç' : 'Giriş yap';
  a.switchBtn.textContent = signup ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Hesap aç';
  a.nameField.hidden = !signup;
  a.codeField.hidden = !signup;
  a.passwordHint.hidden = !signup;
  a.password.autocomplete = signup ? 'new-password' : 'current-password';
  a.error.hidden = true;
}

function openAuth(lead) {
  authForm.reset();
  setAuthMode(false);
  a.lead.textContent = lead || LEAD;
  authDialog.showModal();
  a.email.focus();
}

a.switchBtn.addEventListener('click', () => {
  setAuthMode(!signupMode);
  (signupMode ? a.name : a.email).focus();
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = a.email.value.trim();
  const password = a.password.value;
  const showError = (msg, field) => {
    a.error.textContent = msg;
    a.error.hidden = false;
    if (field) field.focus();
  };
  if (signupMode && !a.name.value.trim()) return showError('Adını yaz; arkadaşların seni bu adla görecek.', a.name);
  if (!email) return showError('E-posta adresini yaz.', a.email);
  if (!password) return showError('Şifreni yaz.', a.password);
  if (signupMode && !a.code.value.trim()) return showError('Davet kodunu yaz.', a.code);

  a.submit.disabled = true;
  a.error.hidden = true;
  try {
    const user = signupMode
      ? await cloud.signUp({ name: a.name.value.trim(), email, password, code: a.code.value.trim() })
      : await cloud.signIn(email, password);
    authDialog.close();
    await handleAuth(user);
    toast(signupMode ? 'Hoş geldin, hesabın açıldı' : 'Giriş yaptın');
  } catch (err) {
    showError(cloud.authMessage(err));
  } finally {
    a.submit.disabled = false;
  }
});

// Aynı hesabın iki kez yüklenmesini önler (giriş anında Supabase de haber verir).
let authId = null;
async function handleAuth(user) {
  const id = user ? user.id : null;
  if (id === authId) return;
  authId = id;
  if (user) {
    try {
      await store.attach(user);
    } catch (err) {
      authId = null;
      toast('Hesap bilgileri yüklenemedi: ' + cloud.authMessage(err));
    }
  } else {
    store.detach();
  }
}

// Sekmeye geri dönüldüğünde yeni önerileri getir.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.state.user) {
    store.attach(store.state.user).catch(() => {});
  }
});

// ---------- Başlat ----------
store.subscribe(render);
window.addEventListener('hashchange', render);

D.loadContent()
  .then(async () => {
    document.getElementById('sample-notice').hidden = !D.isSample();
    render();
    if (!cloud.enabled) return;
    try {
      const user = await cloud.init();
      cloud.onAuthChange((u) => handleAuth(u));
      if (user) await handleAuth(user);
    } catch (err) {
      console.warn(err);
      toast('Hesap bağlantısı kurulamadı; site hesapsız çalışıyor.');
    }
  })
  .catch((err) => {
    app.innerHTML = `<section class="page-head wrap"><h1 class="page-head__title">İçerikler yüklenemedi</h1>
      <p class="page-head__text">${esc(err.message)}. Siteyi bir yerel sunucu üzerinden açtığından emin ol (README'de nasıl yapılacağı yazıyor).</p></section>`;
  });
