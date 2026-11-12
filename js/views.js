// Sayfalar. Her fonksiyon <main> içine konacak HTML'i döndürür.
import * as D from './data.js';
import * as cloud from './cloud.js';
import { store } from './store.js';

const friendsEmpty = () =>
  cloud.enabled && !store.state.user
    ? 'Giriş yapınca nişanlının ve arkadaşlarının önerileri burada görünür.'
    : 'Henüz kimse bir şey önermedi.';
import { esc, icon, card, row, poster, imgTag, imageOf, fmtMinutes, fmtDuration, fmtDate, metaLine, TYPE_LABEL } from './ui.js';

function timeChips() {
  const current = store.state.time;
  return `<div class="chips" role="group" aria-label="Ne kadar vaktin var?">
    <span class="chips__label">Ne kadar vaktin var?</span>
    ${D.TIME_OPTIONS.map((o) => `<button type="button" class="chip" data-action="time" data-value="${o.id}" aria-pressed="${current === o.id}">${o.label}</button>`).join('')}
  </div>`;
}

function timeNote(count) {
  const opt = D.TIME_OPTIONS.find((o) => o.id === store.state.time);
  if (!opt) return '';
  return `<p class="filter-note wrap">${esc(opt.note)} uyan ${count} içerik gösteriliyor. <button type="button" data-action="time" data-value="${opt.id}">Temizle</button></p>`;
}

function hero(i) {
  if (!i) return '';
  const t = D.topic(i.topic);
  const tags = [t, ...(i.tags || []).map(D.topic)].filter(Boolean).map((x) => x.short);
  const saved = store.isSaved(i.id);
  return `<section class="wrap" aria-label="Haftanın seçkisi">
    <div class="hero">
      ${imageOf(i) ? `<div class="hero__img" aria-hidden="true">${imgTag(i, { large: true })}</div>` : `<div class="hero__mark" aria-hidden="true">${esc(i.mark)}</div>`}
      <div class="hero__body">
        <span class="badge">Haftanın seçkisi</span>
        <h1 class="hero__title"><a href="#/icerik/${esc(i.id)}">${esc(i.title)}</a></h1>
        ${i.summary ? `<p class="hero__text">${esc(i.summary)}</p>` : ''}
        <div class="meta"><span>${TYPE_LABEL[i.type]}</span><span>${esc(fmtDuration(i))}</span>${i.source ? `<span>${esc(i.source)}</span>` : ''}<span>${esc(tags.join(', '))}</span></div>
        <div class="actions">
          <a class="btn btn--primary btn--lg" href="#/icerik/${esc(i.id)}">${icon.play} İzle</a>
          <button type="button" class="btn btn--lg" data-action="save" data-id="${esc(i.id)}" aria-pressed="${saved}">${icon.bookmark} ${saved ? 'Listende' : 'Sonra izle'}</button>
          <button type="button" class="btn btn--lg" data-action="recommend" data-id="${esc(i.id)}">${icon.send} Birine öner</button>
        </div>
      </div>
    </div>
  </section>`;
}

function summaryBlock(stats, { compact = false } = {}) {
  if (!stats.total) {
    return `<div class="empty">
      <p><strong>Bu hafta henüz bir içeriği bitirmedin.</strong> Bir içeriği izleyince, dinleyince ya da okuyunca sayfasındaki "Bitirdim" düğmesine bas. Haftalık özetin burada birikecek.</p>
      ${compact ? '<a class="btn btn--quiet" href="#/haftam">Haftam sayfasına git</a>' : ''}
    </div>`;
  }
  const max = stats.topicRows[0].minutes;
  const diff = stats.total - stats.last;
  const compare = stats.last
    ? diff >= 0 ? `Geçen haftadan ${fmtMinutes(diff)} fazla.` : `Geçen haftadan ${fmtMinutes(-diff)} az.`
    : 'Hepsi seçtiğin konulardan.';
  return `<div class="summary">
    <div class="summary__total">
      <span class="summary__label">Bu haftan</span>
      <span class="summary__big">${fmtMinutes(stats.total)}</span>
      <span class="summary__text">izledin, dinledin, okudun. ${compare}</span>
    </div>
    <div class="bars">
      ${stats.topicRows.slice(0, compact ? 4 : 8).map((r) => `<div class="bar">
        <span class="bar__label">${esc(r.topic.short)}</span>
        <div class="bar__track" aria-hidden="true"><div class="bar__fill" style="width:${Math.max(4, Math.round((r.minutes / max) * 100))}%"></div></div>
        <span class="bar__value">${fmtMinutes(r.minutes)}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

export function home() {
  const time = store.state.time;
  const fresh = D.newThisWeek();
  const short = fresh.filter((i) => i.minutes <= 30).length;
  const featured = D.items().find((i) => i.featured);
  const freshShown = D.mixTopics(D.fitsTime(fresh, time));
  const friends = D.fitsTime(D.fromFriends(), time);
  const topicRows = D.topics().map((t) => ({ t, list: D.mixBy(D.fitsTime(D.inTopic(t.id), time), 'type') }));
  const shownCount = new Set([...freshShown, ...friends, ...topicRows.flatMap((r) => r.list)].map((i) => i.id)).size;
  const emptyMsg = 'Bu süreye uyan içerik yok.';

  return `
    <section class="greet wrap">
      <div>
        <p class="greet__title">Demli olsun.</p>
        <p class="greet__sub">Bu hafta ${fresh.length} yeni içerik var. Yarım saatten kısa olanlar: ${short}.</p>
      </div>
      ${timeChips()}
    </section>
    ${timeNote(shownCount)}
    ${hero(featured)}
    ${row({ title: 'Bu hafta yeni', sub: 'Tüm konulardan, son 7 gün', list: freshShown, empty: emptyMsg })}
    ${row({ title: 'Arkadaşlardan', sub: 'Nişanlın ve arkadaşlarının önerdikleri', href: '#/arkadaslar', list: friends,
      empty: D.fromFriends().length ? emptyMsg : friendsEmpty() })}
    ${topicRows.map(({ t, list }) => row({ title: t.name, sub: t.desc, href: '#/konu/' + t.id, list, empty: emptyMsg })).join('')}
    <section class="row wrap" aria-label="Bu haftan">${summaryBlock(D.weekStats(), { compact: true })}</section>
  `;
}

export function topicsPage() {
  const labels = { video: 'video', podcast: 'podcast', yazi: 'yazı', haber: 'haber' };
  return `
    <section class="page-head wrap">
      <span class="page-head__eyebrow">Keşfet</span>
      <h1 class="page-head__title">Konular</h1>
      <p class="page-head__text">Her konuda videolar, podcast'ler, yazılar ve haberler bir arada.</p>
    </section>
    <div class="wrap">
      <div class="topics">
        ${D.topics().map((t) => {
          const list = D.inTopic(t.id);
          const counts = Object.entries(labels)
            .map(([k, label]) => [list.filter((i) => i.type === k).length, label])
            .filter(([n]) => n)
            .map(([n, label]) => `${n} ${label}`)
            .join(' · ');
          return `<a class="topic-card" href="#/konu/${esc(t.id)}" style="--p-bg:${t.bg};--p-fg:${t.fg}">
            <span class="topic-card__name">${esc(t.name)}</span>
            <span class="topic-card__desc">${esc(t.desc)}</span>
            <span class="topic-card__count">${counts || 'Henüz içerik yok'}</span>
          </a>`;
        }).join('')}
      </div>
    </div>`;
}

// Konu sayfasındaki tür filtresi sayfa değişince sıfırlanır.
let typeFilter = 'all';
let lastTopic = null;
export function setTypeFilter(v) {
  typeFilter = v;
}

export function topicPage(id) {
  const t = D.topic(id);
  if (!t) return notFound();
  if (lastTopic !== id) typeFilter = 'all';
  lastTopic = id;
  let list = D.fitsTime(D.inTopic(id), store.state.time);
  list = typeFilter === 'all' ? D.mixBy(list, 'type') : list.filter((i) => i.type === typeFilter);
  const types = [['all', 'Tümü'], ...Object.entries(TYPE_LABEL)];
  return `
    <section class="page-head wrap">
      <span class="page-head__eyebrow">Konu</span>
      <h1 class="page-head__title">${esc(t.name)}</h1>
      <p class="page-head__text">${esc(t.desc)}</p>
    </section>
    <div class="toolbar wrap">
      <div class="chips" role="group" aria-label="İçerik türü">
        ${types.map(([v, label]) => `<button type="button" class="chip" data-action="type" data-value="${v}" aria-pressed="${typeFilter === v}">${label}</button>`).join('')}
      </div>
      ${timeChips()}
    </div>
    <div class="wrap">
      ${list.length
        ? `<div class="grid">${list.map((i) => card(i, { showTopic: false })).join('')}</div>`
        : `<div class="empty"><p>Bu seçimlere uyan içerik yok. Filtreleri değiştirmeyi dene.</p></div>`}
    </div>`;
}

function media(i) {
  if (i.youtubeId) {
    return `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${esc(i.youtubeId)}?rel=0" title="${esc(i.title)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  }
  if (i.vimeoId) {
    return `<div class="player"><iframe src="https://player.vimeo.com/video/${esc(i.vimeoId)}?dnt=1" title="${esc(i.title)}" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (i.videoUrl) {
    return `<div class="player"><video controls preload="metadata" playsinline src="${esc(i.videoUrl)}"${i.image ? ` poster="${esc(i.image)}"` : ''}></video></div>`;
  }
  if (i.audioUrl) {
    return `${poster(i, { big: true })}<audio class="audio" controls preload="none" src="${esc(i.audioUrl)}"></audio>`;
  }
  const note = i.url
    ? 'Bu içerik sitenin dışında. "Kaynağa git" ile açabilirsin.'
    : 'Bu bir örnek içerik. Gerçek kaynaklar bağlanınca videolar burada oynayacak, podcast\'ler burada çalacak.';
  return `${poster(i, { big: true })}<p class="hint" style="padding-top:12px">${note}</p>`;
}

export function itemPage(id) {
  const i = D.item(id);
  if (!i) return notFound();
  const t = D.topic(i.topic) || { name: '', id: '' };
  const saved = store.isSaved(i.id);
  const done = store.isDone(i.id);
  const related = D.inTopic(i.topic).filter((x) => x.id !== i.id);
  const by = i.by === 'sen' ? 'Sen ekledin' : i.by ? esc((D.person(i.by) || { name: i.by }).name) + ' önerdi' : '';
  return `
    <div class="wrap"><a class="backlink" href="#/konu/${esc(t.id)}">${icon.back} ${esc(t.name)}</a></div>
    <article class="item wrap">
      <div class="item__media">${media(i)}</div>
      <div class="item__info">
        <div class="meta"><span>${TYPE_LABEL[i.type]}</span><span>${esc(fmtDuration(i))}</span><span>${fmtDate(i.published)}</span>${i.source ? `<span>${esc(i.source)}</span>` : ''}${by ? `<span>${by}</span>` : ''}</div>
        <h1 class="item__title">${esc(i.title)}</h1>
        ${i.summary ? `<p class="item__text">${esc(i.summary)}</p>` : ''}
        ${i.route ? `<div class="meta" aria-label="Güzergâh">${i.route.map((r) => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
        <div class="actions">
          <button type="button" class="btn ${done ? '' : 'btn--primary'}" data-action="done" data-id="${esc(i.id)}" aria-pressed="${done}">${icon.check} ${done ? 'Bitirdin' : 'Bitirdim'}</button>
          <button type="button" class="btn" data-action="save" data-id="${esc(i.id)}" aria-pressed="${saved}">${icon.bookmark} ${saved ? 'Listende' : 'Sonra izle'}</button>
          <button type="button" class="btn" data-action="recommend" data-id="${esc(i.id)}">${icon.send} Birine öner</button>
          ${i.url ? `<a class="btn" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${icon.out} Kaynağa git</a>` : ''}
        </div>
        <p class="hint">"Bitirdim" dediğin içerikler haftalık özetine eklenir.</p>
      </div>
    </article>
    ${row({ title: 'Aynı konudan', sub: t.name, href: '#/konu/' + t.id, list: related })}`;
}

export function savedPage() {
  const list = store.state.saved.map(D.item).filter(Boolean);
  return `
    <section class="page-head wrap">
      <span class="page-head__eyebrow">Listen</span>
      <h1 class="page-head__title">Sonra izle</h1>
      <p class="page-head__text">Kaydettiğin içerikler burada bekler. Bir tanesini bitirince listede kalır, üzerinde yeşil işaret görünür.</p>
    </section>
    <div class="wrap">
      ${list.length
        ? `<div class="grid">${list.map((i) => card(i)).join('')}</div>`
        : `<div class="empty"><p>Listen şimdilik boş. Bir içeriğin sayfasında "Sonra izle"ye bastığında buraya gelir.</p><a class="btn btn--quiet" href="#/">Keşfet'e dön</a></div>`}
    </div>`;
}

function recList(entries) {
  return `<ul class="list">${entries.map((e) => `<li class="list__item">
      ${poster(e.item)}
      <div class="list__body">
        <a class="list__title" href="#/icerik/${esc(e.item.id)}">${esc(e.item.title)}</a>
        <span class="list__meta">${esc(e.who)} · ${fmtDate(e.at)}</span>
        ${e.note ? `<span class="list__note">"${esc(e.note)}"</span>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

export function friendsPage() {
  const s = store.state;
  const head = `
    <section class="page-head wrap">
      <span class="page-head__eyebrow">Birlikte</span>
      <h1 class="page-head__title">Arkadaşlar</h1>
      <p class="page-head__text">Nişanlının ve arkadaşlarının önerdikleri, senin onlara gönderdiklerin.</p>
      ${D.people().length ? `<div class="people" style="padding-top:8px">
        ${D.people().map((p) => `<span class="person"><span class="avatar" aria-hidden="true">${esc(p.name.charAt(0))}</span>${esc(p.name)}</span>`).join('')}
      </div>` : ''}
    </section>`;

  if (cloud.enabled && !s.user) {
    return head + `<div class="wrap"><div class="empty">
      <p><strong>Önerileri görmek ve göndermek için giriş yap.</strong> Nişanlının ve arkadaşlarının sana gönderdikleri burada toplanır; senin önerdiklerin de onların sayfasına düşer.</p>
      <button type="button" class="btn btn--primary" data-action="login">Giriş yap ya da hesap aç</button>
    </div></div>`;
  }

  const name = (id) => (D.person(id) || { name: 'Biri' }).name;
  const incoming = s.user
    ? s.incoming.map((r) => ({ item: D.item(r.item.id) || r.item, who: name(r.from) + ' önerdi', note: r.note, at: r.at }))
    : [];
  const sent = s.sent.map((x) => ({ ...x, item: D.item(x.itemId) })).filter((x) => x.item)
    .map((x) => ({ item: x.item, who: name(x.to) + ' için', note: x.note, at: x.at }));

  return `${head}
    ${s.user && !D.people().length ? `<div class="wrap"><div class="empty"><p><strong>Henüz başka kimse hesap açmadı.</strong> Nişanlına ve arkadaşlarına sitenin linkini ve davet kodunu gönder; hesap açtıklarında burada görünürler.</p></div></div>` : ''}
    <section class="row wrap" aria-label="Sana önerilenler">
      <h2 class="section-title">Sana önerilenler</h2>
      ${incoming.length ? recList(incoming) : `<div class="empty"><p>${esc(friendsEmpty())}</p></div>`}
    </section>
    <section class="row wrap" aria-label="Senin önerdiklerin">
      <h2 class="section-title">Senin önerdiklerin</h2>
      ${sent.length
        ? recList(sent)
        : `<div class="empty"><p>Henüz kimseye bir şey önermedin. Beğendiğin bir içeriğin sayfasında "Birine öner"e bas.</p></div>`}
      ${s.user ? '' : '<p class="hint" style="padding-top:14px">Hesapsız kullanımda öneriler yalnızca bu tarayıcıda tutulur.</p>'}
    </section>`;
}

export function weekPage() {
  const s = D.weekStats();
  const start = D.weekStart();
  const counts = [
    ['video', 'video izledin'],
    ['podcast', 'podcast dinledin'],
    ['yazi', 'yazı okudun'],
    ['haber', 'haber okudun'],
  ];
  return `
    <section class="page-head wrap">
      <span class="page-head__eyebrow">${fmtDate(start.toISOString())}'den beri</span>
      <h1 class="page-head__title">Haftam</h1>
      <p class="page-head__text">Vaktini nereye ayırdığını gör. Instagram'ın tersine, burada geçen her dakikanın karşılığı var.</p>
    </section>
    <div class="wrap">
      ${summaryBlock(s)}
      ${s.total ? `<div class="stats">${counts.map(([k, label]) => `<div class="stat"><div class="stat__num">${s.perType[k] || 0}</div><div class="stat__label">${label}</div></div>`).join('')}</div>` : ''}
    </div>
    ${s.list.length ? `<section class="row wrap" aria-label="Bu hafta bitirdiklerin">
      <h2 class="section-title">Bu hafta bitirdiklerin</h2>
      <ul class="list">${s.list.map(({ item: i, at }) => `<li class="list__item">
        ${poster(i)}
        <div class="list__body">
          <a class="list__title" href="#/icerik/${esc(i.id)}">${esc(i.title)}</a>
          <span class="list__meta">${metaLine(i)} · ${fmtDate(at.toISOString())}</span>
        </div>
      </li>`).join('')}</ul>
    </section>` : ''}`;
}

export function notFound() {
  return `<section class="page-head wrap">
    <h1 class="page-head__title">Burada bir şey yok</h1>
    <p class="page-head__text">Aradığın sayfa taşınmış ya da silinmiş olabilir.</p>
    <p><a class="btn btn--quiet" href="#/">Keşfet'e dön</a></p>
  </section>`;
}
