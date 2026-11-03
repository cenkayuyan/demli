# Demli

Hızlı değil, demli. Belgesel, podcast, yazı ve haberlerden oluşan kişisel bir seçki sitesi.

## Bilgisayarında açmak

Bu klasörde bir terminal açıp şunu çalıştır, sonra tarayıcıda http://127.0.0.1:5173 adresine git:

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Herhangi bir kurulum gerekmez. Site saf HTML, CSS ve JavaScript ile yazıldı; bu yüzden Google Drive'da da rahatça durur.

## İçerikleri güncellemek

Yeni videoları, podcast'leri ve haberleri çekmek için bu klasörde şunu çalıştır (yaklaşık 1 dakika sürer):

```bash
python3 scripts/topla.py
```

Kaynak eklemek ya da çıkarmak için `data/sources.json` dosyasını düzenle. Konular ve kişiler `data/site.json` içinde.

## Klasörler

- `index.html`: sayfanın iskeleti ve pencereler (Link ekle, Birine öner)
- `css/style.css`: Demlik teması (renkler, yazı tipleri, yerleşim)
- `js/main.js`: sayfalar arası geçiş ve düğmeler
- `js/views.js`: Keşfet, Konu, İçerik, Sonra izle, Arkadaşlar, Haftam sayfaları
- `js/ui.js`: kart, raf ve ortak parçalar
- `js/data.js`: içerik verisi, süre filtresi, haftalık özet hesabı
- `js/store.js`: sonra izle, bitirilenler, öneriler (şimdilik tarayıcıda saklanır)
- `data/sources.json`: YouTube kanalları, podcast'ler ve siteler
- `data/site.json`: konular ve kişiler
- `data/content.json`: toplayıcının ürettiği içerik listesi (elle düzenleme)
- `data/durations.json`: bulunan video süreleri (her seferinde yeniden sorulmasın diye)
- `scripts/topla.py`: içerik toplayıcı

## Aşamalar

1. Konsept ✓
2. Tasarım yönü: Demlik ✓
3. Tıklanabilir ilk sürüm ✓
4. Gerçek içerik kaynakları ✓
5. Yayına alma ve arkadaşlarla paylaşma
