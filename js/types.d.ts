/* Typy pro kontrolu v editoru (VS Code) a `tsc --noEmit`. Prohlížeč tento soubor nenačítá,
   hra zůstává čistý JavaScript bez buildu. Viz jsconfig.json. */

/** Předmět v encyklopedii (js/data/items.js). Klíč = id = název obrázku, pokud není `sprite`. */
interface MCItem {
  /** název – zobrazuje se v odpovědích */
  name: string;
  /** vysvětlení (učebna + zpětná vazba po odpovědi) */
  desc: string;
  /** hádanka bez názvu předmětu */
  clue: string;
  /** krátké „k čemu slouží“ */
  use: string;
  /** odkud je fakt ověřený; bez zdroje = obecný popis */
  zdroj?: string;
  /** sdílený obrázek jiného předmětu */
  sprite?: string;
}

/** Ruční (prémiová) otázka. PRVNÍ odpověď je správná. */
interface MCPremium {
  q: string;
  options: string[];
  explain: string;
  sprite?: string;
}

type MCPosture = 'Stojíme' | 'Sedíme' | 'Klečíme' | 'Chodíme';

/** Krok mše (sekce s `parts`). */
interface MCStep {
  name: string;
  part: string;
  posture?: MCPosture;
  sprite?: string;
  desc: string;
}

/** Znění otázek; {name} a {name_lc} se nahradí názvem předmětu. */
interface MCPrompts {
  identify?: string;
  find?: string;
  purpose?: string;
  use?: string;
}

interface MCLevel {
  id: string;
  title: string;
  intro: string;
  /** předměty, ze kterých se generují běžné otázky */
  items?: string[];
  /** kroky mše – místo `items` */
  steps?: MCStep[];
  questionCount: number;
  premiumCount: number;
  premium: MCPremium[];
  prompts?: MCPrompts;
}

interface MCSection {
  id: string;
  title: string;
  icon: string;
  desc: string;
  /** zamčená sekce „Připravujeme“ */
  comingSoon?: boolean;
  /** části mše pro kroky `steps` */
  parts?: string[];
  prompts?: MCPrompts;
  levels: MCLevel[];
}

interface MCData {
  items: Record<string, MCItem>;
  sections: MCSection[];
}

/** Výstup tools/draw_sprites.py (js/sprite-art.js). */
interface MCSpriteArt {
  /** znak → barva */
  pal: Record<string, string>;
  /** materiál → 5 znaků rampy [obrys, tmavá, střední, světlá, odlesk] */
  mats: Record<string, string[]>;
  /** id → řádky pixelů, '.' = průhledná */
  spr: Record<string, string[]>;
}

interface MCSpriteOpts {
  /** záměna znaků (např. šedé srdce) */
  map?: Record<string, string>;
  silhouette?: boolean;
}

interface MCSprites {
  PAL: Record<string, string>;
  SPR: Record<string, string[]>;
  ART: MCSpriteArt;
  url(id: string, opts?: MCSpriteOpts): string;
  img(id: string, size?: number, opts?: MCSpriteOpts): HTMLImageElement;
  texture(kind: string, seed?: number): string;
  hideMat(mat: string): Record<string, string>;
}

interface MCAudio {
  muted: boolean;
  ctx: AudioContext | null;
  click(): void;
  correct(): void;
  wrong(): void;
  premium(): void;
  heal(): void;
  tick(): void;
  start(): void;
  win(): void;
  lose(): void;
}

/** Uložený postup (localStorage `ministrex.save.v1`). */
interface MCSave {
  levels: Record<string, { stars?: number; best?: number }>;
  collected: Record<string, boolean>;
  muted?: boolean;
  /** vypnutý časový limit → bez bonusu za rychlost */
  noTimer?: boolean;
}

interface Window {
  MC_DATA: MCData;
  MC_SPRITE_ART: MCSpriteArt;
  MC_SPRITES: MCSprites;
  MC_AUDIO: MCAudio;
  webkitAudioContext?: typeof AudioContext;
  __ministrex: { state(): unknown };
}
