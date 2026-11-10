# Ministrex – poznámky pro Clauda

Pixelová prohlížečová hra (česky) pro ministranty. Popis pro lidi je v `README.md`.
S uživatelem komunikuj česky.

## Technika
- Čistý JavaScript, **bez buildu a bez frameworku** (žádný React/TS). Obyčejné `<script>` tagy,
  hra musí fungovat i z `file://`. Data jsou globály `window.MC_DATA`, `window.MC_SPRITE_ART`.
- Verze je jen na jednom místě: `VERSION` v `js/game.js` (+ řádek v README). Aktuálně 0.2.0 (seznam změn v README).
- Uložení: `localStorage` klíč `ministrex.save.v1` (fallback na starý `minicraft.save.v1`).
  Nastavení v uložení: `muted`, `noTimer` (vypnutý časový limit → bez bonusu za rychlost),
  `miss` (spletené předměty id → 1–3). Záloha = kód `MX1:` + base64 JSON (Záloha postupu).
- Odemykání: vše do levelu za nejdál dokončeným (nový level vložený doprostřed nic nezamkne).
- `js/sprite-art.js` je **generovaný** – měň `tools/draw_sprites.py` a spusť
  `python3 tools/draw_sprites.py [--preview out.png]`. Mřížka návrhu 32, výstup 48×48 (K=1.5);
  zobrazované velikosti držet v násobcích 48. Materiály mají 5barevné rampy, barevný obrys.
- Písmo: VT323 všude, Pixelify Sans **jen na logo** (v textu se pletlo Z/2 a 8/S).
- Musí fungovat na mobilu (testovat šířku 375 px, bez vodorovného posunu).
- Typy: `// @ts-check` + JSDoc, typy dat v `js/types.d.ts`, `jsconfig.json`. Žádný TS build –
  kontrola `npx -y -p typescript@5.6.3 tsc -p jsconfig.json`.
- PWA: `sw.js` (síť napřed, offline z mezipaměti, písma cache-first) + `manifest.webmanifest`,
  registrace v `js/game.js` jen přes http(s). Nový soubor hry → přidat do `FILES` v `sw.js`.
  Ikony `icons/` generuje `tools/draw_sprites.py` (`ICON_SPRITE`).
- GitHub Pages jsou **vypnuté** (uživatel nechce nasazovat) – nezapínat bez výslovného pokynu.
  CI `.github/workflows/check.yml` jen kontroluje, nic nenasazuje.
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
- **Paténu nerozdělovat** na více položek. Paténa = talířek, který ministrant drží pod bradou
  při svatém přijímání (podle Dolní Újezd 2019, ne „leží na ní hostie“).
- Ověřeno uživatelem: procesní kříž (krucifer jde za kadidelnicí a loďkou) a pravidlo svící
  (2, při slavnostech 4 nebo 6, sedmá při koncelebraci sídelního biskupa).
- Ponechat misál, lekcionář, zvonky, svíce a procesní kříž.
- **Komže** = černá sukně; **superpelice** = rocheta = bílé svrchní roucho; **límec** = černý.
  Samostatná položka „rocheta“ není.
- Pixida = neprůhledné pouzdro na velkou hostii mimo vystavení (ne „pro nemocné“).

## Testování
- Server: `python3 -m http.server 8000` ve složce projektu (dostupné i přes Wi‑Fi).
- Headless: `google-chrome --headless=new --screenshot=… --window-size=375,900 URL`,
  pomocné stránky dávat do scratchpadu, ne do projektu.
- Po změně dat: `node tools/check.js` (položky/obrázky/části existují, každá položka je použitá,
  seznam v `sw.js`, verze v README) + kontrola typů výše; `node --check js/game.js`.
