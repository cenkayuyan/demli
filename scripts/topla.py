#!/usr/bin/env python3
"""Demli toplayıcı.

data/sources.json'daki YouTube kanallarının, podcast'lerin ve sitelerin
son içeriklerini çeker, sürelerini bulur ve data/content.json'a yazar.

Kullanım (demli klasöründe):  python3 scripts/topla.py
Kurulum gerekmez; sadece Python'un kendi kütüphaneleri kullanılır.

YOUTUBE_API_KEY ortam değişkeni tanımlıysa YouTube'un resmî arayüzü kullanılır
(GitHub sunucularında gereklidir; YouTube oradan gelen akış isteklerini reddediyor).
Tanımlı değilse kanalların herkese açık akışları okunur.
"""
import hashlib
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DURATIONS = DATA / 'durations.json'

YT_KEY = os.environ.get('YOUTUBE_API_KEY', '').strip()

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
NS = {
    'atom': 'http://www.w3.org/2005/Atom',
    'media': 'http://search.yahoo.com/mrss/',
    'yt': 'http://www.youtube.com/xml/schemas/2015',
    'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'dc': 'http://purl.org/dc/elements/1.1/',
}
SHORT_VIDEO_SECONDS = 75          # bundan kısa videolar "Shorts" sayılıp atlanır
READ_WPM = 200                    # okuma hızı (kelime/dakika)
DEFAULT_READ = {'haber': 3, 'yazi': 6}


# ---------- yardımcılar ----------

def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'tr,en;q=0.8'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(text):
    text = re.sub(r'<[^>]+>', ' ', text or '')
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


def shorten(text, n=280):
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(' ', 1)[0]
    return cut.rstrip('.,;:') + '…'


def to_iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_date(value):
    if not value:
        return None
    value = value.strip()
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def parse_duration(value):
    """'1:02:03', '42:10' ya da '3725' biçimindeki süreyi saniyeye çevirir."""
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return int(value)
    parts = value.split(':')
    if all(p.isdigit() for p in parts):
        sec = 0
        for p in parts:
            sec = sec * 60 + int(p)
        return sec
    return None


def mark_for(src):
    if src.get('mark'):
        return src['mark']
    words = re.findall(r'[A-Za-zÇĞİÖŞÜçğıöşüÂâÎî]+', src['name'].split('·')[0])
    return ''.join(w[0] for w in words[:2]).upper() or '•'


def tidy_title(title, source):
    """'Başlık | DW Documentary' gibi sondaki kanal adını atar."""
    parts = [p.strip() for p in title.split(' | ')]
    source_words = set(re.findall(r'\w{3,}', source.lower()))
    while len(parts) > 1:
        tail = parts[-1].lower()
        if set(re.findall(r'\w{3,}', tail)) & source_words or 'documentary' in tail:
            parts.pop()
        else:
            break
    return ' | '.join(parts)


def text_of(el, path):
    found = el.find(path, NS)
    return found.text if found is not None and found.text else ''


# ---------- YouTube ----------

def video_item(src, vid, title, published, description):
    if not vid or '#shorts' in title.lower():
        return None
    if src.get('filter') and src['filter'].lower() not in title.lower():
        return None
    return {
        'id': 'yt-' + vid,
        'type': 'video',
        'title': tidy_title(title, src['name']),
        'published': to_iso(published or datetime.now(timezone.utc)),
        'url': 'https://www.youtube.com/watch?v=' + vid,
        'youtubeId': vid,
        'summary': shorten(clean(description)),
    }


def yt_api(endpoint, **params):
    params['key'] = YT_KEY
    return json.loads(fetch('https://www.googleapis.com/youtube/v3/' + endpoint + '?' + urllib.parse.urlencode(params)))


def youtube_api(src):
    # Bir kanalın tüm yüklemeleri "UU…" ile başlayan gizli bir oynatma listesinde durur.
    playlist = src.get('playlist') or 'UU' + src['channel'][2:]
    data = yt_api('playlistItems', part='snippet,contentDetails', playlistId=playlist, maxResults=15)
    items = []
    for entry in data.get('items', []):
        sn, cd = entry['snippet'], entry['contentDetails']
        if sn.get('title') in ('Private video', 'Deleted video'):
            continue
        published = parse_date(cd.get('videoPublishedAt') or sn.get('publishedAt'))
        item = video_item(src, cd.get('videoId'), sn.get('title', ''), published, sn.get('description', ''))
        if item:
            items.append(item)
    return items


def iso_seconds(value):
    m = re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?', value or '')
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return ((d * 24 + h) * 60 + mi) * 60 + s


def api_durations(vids):
    out = {}
    for k in range(0, len(vids), 50):
        data = yt_api('videos', part='contentDetails', id=','.join(vids[k:k + 50]))
        for v in data.get('items', []):
            sec = iso_seconds(v['contentDetails'].get('duration'))
            if sec is not None:
                out[v['id']] = sec
    return out


def youtube(src):
    if YT_KEY:
        return youtube_api(src)
    key = 'playlist_id=' + src['playlist'] if src.get('playlist') else 'channel_id=' + src['channel']
    root = ET.fromstring(fetch('https://www.youtube.com/feeds/videos.xml?' + key))
    items = []
    for e in root.findall('atom:entry', NS):
        item = video_item(src, text_of(e, 'yt:videoId'), text_of(e, 'atom:title'),
                          parse_date(text_of(e, 'atom:published')), text_of(e, 'media:group/media:description'))
        if item:
            items.append(item)
    return items


PLAYER_CONTEXT = {'client': {'clientName': 'WEB', 'clientVersion': '2.20241001.00.00', 'hl': 'en'}}


def video_seconds(vid):
    """Videonun süresini YouTube'un küçük oynatıcı yanıtından okur (izleme sayfasının ~%1'i kadar)."""
    body = json.dumps({'videoId': vid, 'context': PLAYER_CONTEXT}).encode('utf-8')
    req = urllib.request.Request('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', data=body,
                                 headers={'User-Agent': UA, 'Content-Type': 'application/json'})
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                m = re.search(rb'"lengthSeconds":"(\d+)"', r.read())
            if m:
                return int(m.group(1))
        except Exception:
            pass
    return None


# ---------- RSS (podcast, yazı, haber) ----------

def item_image(it):
    for path, attr in (('itunes:image', 'href'), ('media:thumbnail', 'url'), ('media:content', 'url'),
                       ('media:group/media:content', 'url')):
        for el in it.findall(path, NS):
            url = el.get(attr)
            medium = el.get('medium') or el.get('type') or 'image'
            if url and ('image' in medium or path != 'media:content'):
                return url
    enc = it.find('enclosure')
    if enc is not None and (enc.get('type') or '').startswith('image'):
        return enc.get('url')
    m = re.search(r'<img[^>]+src="([^"]+)"', text_of(it, 'content:encoded') or text_of(it, 'description'))
    return html.unescape(m.group(1)) if m else None


def rss(src):
    root = ET.fromstring(fetch(src['url']))
    kind = src['type']
    channel = root.find('channel')
    entries = channel.findall('item') if channel is not None else []
    channel_image = None
    if channel is not None:
        img = channel.find('itunes:image', NS)
        channel_image = img.get('href') if img is not None else (text_of(channel, 'image/url') or None)

    # Atom biçimindeki akışlar
    atom = not entries
    if atom:
        entries = root.findall('atom:entry', NS)

    items = []
    for it in entries:
        if atom:
            title = clean(text_of(it, 'atom:title'))
            link_el = it.find("atom:link[@rel='alternate']", NS)
            if link_el is None:
                link_el = it.find('atom:link', NS)
            link = link_el.get('href') if link_el is not None else ''
            body = text_of(it, 'atom:content') or text_of(it, 'atom:summary')
            published = parse_date(text_of(it, 'atom:published') or text_of(it, 'atom:updated'))
            image, audio, seconds = None, None, None
        else:
            title = clean(text_of(it, 'title'))
            link = text_of(it, 'link').strip() or text_of(it, 'guid').strip()
            body = text_of(it, 'content:encoded') or text_of(it, 'description')
            published = parse_date(text_of(it, 'pubDate') or text_of(it, 'dc:date'))
            image = item_image(it)
            enc = it.find('enclosure')
            audio = enc.get('url') if enc is not None and (enc.get('type') or '').startswith('audio') else None
            seconds = parse_duration(text_of(it, 'itunes:duration'))
        if not title:
            continue

        text = clean(body)
        if kind == 'podcast':
            minutes = round(seconds / 60) if seconds else 30
        else:
            words = len(text.split())
            minutes = max(DEFAULT_READ[kind], round(words / READ_WPM)) if words > 150 else DEFAULT_READ[kind]

        uid = hashlib.sha1((audio or link or title).encode('utf-8')).hexdigest()[:12]
        item = {
            'id': 'r-' + uid,
            'type': kind,
            'title': title,
            'published': to_iso(published or datetime.now(timezone.utc)),
            'url': link,
            'summary': shorten(text),
            'minutes': max(1, minutes),
        }
        if audio:
            item['audioUrl'] = audio
        if image or (kind == 'podcast' and channel_image):
            item['image'] = image or channel_image
        items.append(item)
    return items


# ---------- ana akış ----------

def collect(src):
    try:
        items = youtube(src) if src['kind'] == 'youtube' else rss(src)
        return src, items, None
    except Exception as exc:  # bir kaynağın bozulması diğerlerini durdurmasın
        return src, [], f'{type(exc).__name__}: {exc}'


def main():
    config = json.loads((DATA / 'sources.json').read_text(encoding='utf-8'))
    site = json.loads((DATA / 'site.json').read_text(encoding='utf-8'))
    default_limit = config.get('defaults', {}).get('limit', 4)
    sources = config['sources']

    print(f'{len(sources)} kaynak okunuyor…')
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(collect, sources))

    # YouTube süreleri: önceden bulunanlar data/durations.json'da saklanır.
    try:
        durations = json.loads(DURATIONS.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        durations = {}
    wanted = []
    for src, items, _ in results:
        limit = src.get('limit', default_limit)
        newest = sorted((i for i in items if i.get('youtubeId')), key=lambda i: i['published'], reverse=True)
        wanted += [i['youtubeId'] for i in newest[: limit * 2] if i['youtubeId'] not in durations]
    if wanted:
        print(f'{len(wanted)} videonun süresi bulunuyor…')
        if YT_KEY:
            durations.update(api_durations(wanted))
        else:
            with ThreadPoolExecutor(max_workers=4) as pool:
                for vid, sec in zip(wanted, pool.map(video_seconds, wanted)):
                    if sec is not None:
                        durations[vid] = sec

    # Okunamayan bir kaynağın önceki içerikleri silinmesin diye eski liste saklanır.
    try:
        previous = json.loads((DATA / 'content.json').read_text(encoding='utf-8')).get('items', [])
    except (FileNotFoundError, json.JSONDecodeError):
        previous = []

    all_items, seen, report = [], set(), []
    for src, items, error in results:
        if error:
            kept = [i for i in previous if i.get('source') == src['name'] and i['id'] not in seen]
            for i in kept:
                i.pop('featured', None)
                seen.add(i['id'])
            all_items += kept
            report.append(f'  ✗ {src["name"]}: {error} (önceki {len(kept)} içerik korundu)')
            continue
        kept = []
        for item in sorted(items, key=lambda i: i['published'], reverse=True):
            if item.get('youtubeId'):
                sec = durations.get(item['youtubeId'])
                if sec is None:
                    item['minutes'], item['approx'] = 20, True  # süre bulunamadı: tahmini göster
                elif sec < SHORT_VIDEO_SECONDS:
                    continue
                else:
                    item['minutes'] = max(1, round(sec / 60))
            if item['id'] in seen:
                continue
            item.update({'topic': src['topic'], 'source': src['name'], 'lang': src.get('lang', ''),
                         'mark': mark_for(src), 'fs': 44})
            kept.append(item)
            seen.add(item['id'])
            if len(kept) >= src.get('limit', default_limit):
                break
        all_items += kept
        report.append(f'  ✓ {src["name"]}: {len(kept)}')

    # Haftanın seçkisi: son iki haftanın en yeni, en az 25 dakikalık belgeseli.
    cutoff = to_iso(datetime.now(timezone.utc) - timedelta(days=14))
    docs = [i for i in all_items if i['topic'] == 'belgesel' and i['type'] == 'video'
            and i['minutes'] >= 25 and i['published'] >= cutoff]
    if docs:
        max(docs, key=lambda i: i['published'])['featured'] = True

    all_items.sort(key=lambda i: i['published'], reverse=True)
    out = {
        'sample': False,
        'generated': to_iso(datetime.now(timezone.utc)),
        'topics': site['topics'],
        'people': site['people'],
        'items': all_items,
    }
    (DATA / 'content.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    DURATIONS.write_text(json.dumps(durations, indent=0), encoding='utf-8')

    print('\n'.join(report))
    failed = sum(1 for line in report if '✗' in line)
    approx = sum(1 for i in all_items if i.get('approx'))
    print(f'\n{len(all_items)} içerik data/content.json dosyasına yazıldı.'
          + (f' {failed} kaynak okunamadı.' if failed else '')
          + (f' {approx} videonun süresi bulunamadı, tahmini gösteriliyor.' if approx else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
