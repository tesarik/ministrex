# Ministrex – ministrantská výprava

*Sloužit je královské.* (minister = služebník, rex = král)

**Verze 0.1.0**

Pixelová hra do prohlížeče pro ministranty katolické církve. Hráč poznává liturgické předměty,
roucha, postoje a gesta, služby ministrantů, průběh mše a liturgické barvy.
Funguje na počítači i na mobilu, bez instalace a bez internetu (kromě písem).

## Spuštění
- **Na počítači:** stačí otevřít `index.html` v prohlížeči.
- **Přes Wi‑Fi (i pro telefony):** ve složce hry spusť
  ```
  python3 -m http.server 8000
  ```
  a na zařízení ve stejné síti otevři `http://<IP počítače>:8000/`
  (IP zjistíš příkazem `hostname -I`). Pokud se stránka nenačte, povol port ve firewallu:
  `sudo ufw allow 8000`.

## Obsah
| Sekce | Levely |
|---|---|
| Liturgické předměty | Příprava darů · Na oltáři · Slavnostní liturgie |
| Kostel | Presbytář · Celý kostel |
| Liturgická roucha | Ministrant · Kněz a jáhen · Slavnosti a průvody · Biskup |
| Postoje a gesta | Postoje · Gesta |
| Služby ministrantů | V průvodu · U oltáře |
| Průběh mše | Úvod a Boží slovo · Oběť a závěr |
| Barvy a liturgický rok | Liturgické barvy · Liturgický rok |

## Herní mechaniky
- 3 životy, za špatnou odpověď nebo vypršený čas −1 život
- body: 100 + bonus za rychlost (až 50), série 3 = ×2, série 5 = ×3
- prémiové otázky: ×3 body, +1 život, za chybu se život neztrácí
- **časový limit lze vypnout** přepínačem na úvodní obrazovce (pak bez bonusu za rychlost)
- učebna před každým levelem, sbírka objevených předmětů, hvězdy, odemykání levelů
- tlačítko Opustit během kvízu, ovládání klávesami 1–4 / Enter / Esc
- postup a nastavení se ukládají do `localStorage` prohlížeče (každé zařízení má svůj)

## Typy otázek (generují se automaticky z dat)
`identify` – co je na obrázku · `find` – najdi předmět mezi 4 obrázky ·
`purpose` – hádanka → název · `use` – k čemu předmět slouží · `premium` – ručně psané otázky.
V průběhu mše: co následuje / co je před / do které části patří / jaký postoj.

## Struktura
```
index.html            stránka hry
css/style.css         vzhled (pergamen, vitráže, responzivní pro mobil)
js/game.js            logika hry (obrazovky, otázky, body, ukládání); verze v konstantě VERSION
js/data/items.js      všechny předměty, roucha, postoje… (název, popis, hádanka, použití, zdroj)
js/data/sections.js   sekce a levely, prémiové otázky, kroky mše
js/sprites.js         vykreslování obrázků + ručně kreslené UI ikony 16×16
js/sprite-art.js      VYGENEROVANÉ obrázky předmětů (needitovat ručně)
js/audio.js           8bitové zvuky (WebAudio)
tools/draw_sprites.py generátor obrázků předmětů
```

## Jak přidat obsah
- **Nový předmět**: záznam v `js/data/items.js` + obrázek se stejným klíčem.
  Obrázky se kreslí z tvarů (obrys, elipsa, obdélník, čára) v `tools/draw_sprites.py`
  (funkce pojmenovaná podle klíče, přidat do seznamu `ITEMS`) a vygenerují příkazem
  `python3 tools/draw_sprites.py --preview nahled.png` → `js/sprite-art.js`.
- **Nový level**: přidej objekt do `levels` v `js/data/sections.js`.
- **Nová sekce**: přidej objekt do `sections`; `comingSoon: true` ji na mapě ukáže jako „Připravujeme“.
- **Sdílený obrázek**: předmět může použít obrázek jiného (`sprite: 'kalich'`),
  tak jsou udělané třeba služby ministrantů nebo liturgická období.
- **Vlastní znění otázek**: sekce nebo level může mít `prompts` (`identify`, `find`, `purpose`, `use`;
  `{name}` / `{name_lc}` = název předmětu).
- **Level typu posloupnost** (průběh mše): místo `items` má `steps` (`name`, `part`, `posture`, `desc`,
  volitelně `sprite`) a sekce má `parts`.

## Zdroje
- *Liturgické předměty, oblečení, postoje* – Ministranti Hněvošice 2018 (názvy a podoba)
- *Příručka pro ministranty* – Ministranti Dolní Újezd 2019, Josef Kladivo (názvy i popisy)

U předmětů je zdroj v poli `zdroj`; co zdroj nemá, je obecný popis ke kontrole.

## Grafika a licence
- **Všechny obrázky jsou vlastní** – vytváří je skript `tools/draw_sprites.py` z geometrických tvarů,
  UI ikony jsou ručně zapsané v `js/sprites.js`. Podoba předmětů vychází z obecné znalosti
  a slovních popisů v příručkách; žádné obrázky nebyly převzaty z PDF ani odjinud.
- **Písma** Pixelify Sans a VT323 se načítají z Google Fonts, obě pod licencí SIL Open Font License.
- Hra záměrně nepoužívá prvky ani názvy cizích her (původní pracovní název byl změněn na Ministrex).
