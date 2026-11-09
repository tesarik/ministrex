# Ministrex – poznámky pro Clauda

Pixelová prohlížečová hra (česky) pro ministranty. Popis pro lidi je v `README.md`.
S uživatelem komunikuj česky.

## Technika
- Čistý JavaScript, **bez buildu a bez frameworku** (žádný React/TS). Obyčejné `<script>` tagy,
  hra musí fungovat i z `file://`. Data jsou globály `window.MC_DATA`, `window.MC_SPRITE_ART`.
- Verze je jen na jednom místě: `VERSION` v `js/game.js` (+ řádek v README). Aktuálně 0.1.0.
- Uložení: `localStorage` klíč `ministrex.save.v1` (fallback na starý `minicraft.save.v1`).
  Nastavení v uložení: `muted`, `noTimer` (vypnutý časový limit → bez bonusu za rychlost).
- `js/sprite-art.js` je **generovaný** – měň `tools/draw_sprites.py` a spusť
  `python3 tools/draw_sprites.py [--preview out.png]`. Mřížka návrhu 32, výstup 48×48 (K=1.5);
  zobrazované velikosti držet v násobcích 48. Materiály mají 5barevné rampy, barevný obrys.
- Písmo: VT323 všude, Pixelify Sans **jen na logo** (v textu se pletlo Z/2 a 8/S).
- Musí fungovat na mobilu (testovat šířku 375 px, bez vodorovného posunu).
- Debug: `window.__ministrex.state()`.

## Grafika a licence
- Všechny obrázky jsou vlastní (generátor z tvarů + ručně psané ikony). Nepřebírat obrázky
  z PDF ani z internetu. Podoba předmětů = obecná znalost + slovní popisy z příruček.
- Žádné prvky, názvy ani vzhled Minecraftu či jiných her (proto přejmenování na Ministrex).
- Písma z Google Fonts (SIL OFL).

## Zdroje obsahu
- *Liturgické předměty, oblečení, postoje* – Ministranti Hněvošice 2018
- *Příručka pro ministranty* – Ministranti Dolní Újezd 2019 (Josef Kladivo)
- U položek pole `zdroj`. Fakta brát z těchto zdrojů; co v nich není, označit jako obecný popis.

## Obsahová rozhodnutí uživatele (dodržovat)
- **Lavabo** = ručník, který leží u konviček (bez křížku).
- **Kropenka** = nádobka se svěcenou vodou u vchodu do kostela; **aspergil** = přenosný kropáč.
- **Loďka** je správný název.
- **Purifikatorium** má křížek („liší se kostel od kostela“).
- **Paténu nerozdělovat** na více položek.
- Ponechat misál, lekcionář, zvonky, svíce a procesní kříž.
- **Komže** = černá sukně; **superpelice** = rocheta = bílé svrchní roucho; **límec** = černý.
  Samostatná položka „rocheta“ není.
- Pixida = neprůhledné pouzdro na velkou hostii mimo vystavení (ne „pro nemocné“).

## Testování
- Server: `python3 -m http.server 8000` ve složce projektu (dostupné i přes Wi‑Fi).
- Headless: `google-chrome --headless=new --screenshot=… --window-size=375,900 URL`,
  pomocné stránky dávat do scratchpadu, ne do projektu.
- Po změně dat ověřit, že všechny položky/obrázky/části existují a každá položka je použitá;
  `node --check js/game.js`.
