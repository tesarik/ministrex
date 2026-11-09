#!/usr/bin/env python3
"""Generátor pixel-art spritů (návrh 32×32, výstup 48×48) pro Ministrex.

Předměty se kreslí z tvarů (profil nádoby „na soustruhu“, elipsy, obdélníky,
polygony, čáry). Skript doplní stínování (světlo zleva shora) a barevný obrys
a zapíše výsledek do js/sprite-art.js.

Spuštění:  python3 tools/draw_sprites.py        (volitelně --preview cesta.png)
"""
import json, math, os, sys, zlib, struct

D = 32            # návrhová mřížka – všechny souřadnice tvarů jsou v ní
K = 1.5           # zjemnění: výstup má D*K pixelů (32 → 48)
W = H = int(D * K)


def dc(i):
    """střed výstupního pixelu i v návrhových souřadnicích"""
    return (i + .5) / K

# Každý materiál: [obrys, tmavá, střední, světlá, odlesk]
MATS = {
    'gold':      ['#4a3008', '#9a6a12', '#d9a420', '#f5cc45', '#fff2a8'],
    'silver':    ['#343b47', '#6f7985', '#a9b3bf', '#d8dee6', '#ffffff'],
    'cloth':     ['#5a564e', '#b0aca2', '#d8d4ca', '#f2efe6', '#ffffff'],
    'red':       ['#3e0a10', '#7a1622', '#b8283a', '#e04a56', '#ff9a9a'],
    'wine':      ['#2a0408', '#5a0c18', '#7e1426', '#a8243a', '#d05060'],
    'glass':     ['#2a4660', '#7fa8c8', '#b8dcf2', '#e2f4ff', '#ffffff'],
    'water':     ['#1e4a78', '#3a7ac0', '#6aaee8', '#a8d8ff', '#e8f6ff'],
    'wood':      ['#2e1a0a', '#5e3b1c', '#8a5a30', '#b07a48', '#d8a878'],
    'green':     ['#0e3016', '#1f6a2a', '#2f8f3a', '#55b860', '#9ae0a0'],
    'flame':     ['#c04a08', '#ff7a10', '#ffb030', '#ffe14d', '#fffbe0'],
    'ink':       ['#3a3a3a', '#6a6a6a', '#8c8c8c', '#a8a8a8', '#c8c8c8'],
    'blue':      ['#12285a', '#1f4aa0', '#2f5fc8', '#5a88e8', '#a0c0ff'],
    'smoke':     ['#8a8a98', '#a8a8b6', '#c4c4d0', '#dcdce6', '#f0f0f6'],
    'redglass':  ['#4a0810', '#a01828', '#d83040', '#ff6a60', '#ffd0a0'],
    'stone':     ['#34343c', '#6a6a74', '#9696a0', '#c0c0c8', '#e4e4ea'],
    'black':     ['#0a0a0e', '#1c1c24', '#2c2c38', '#444458', '#6a6a84'],
    'violet':    ['#2a0f3a', '#4f2272', '#7b3fa0', '#a066c8', '#d0a8f0'],
    'skin':      ['#6a3a1a', '#c08050', '#e0a878', '#f0c898', '#fff0d8'],
    'rose':      ['#5a1a32', '#b0507a', '#e07aa0', '#f4a8c4', '#ffd8e8'],
    'hair':      ['#2a1608', '#4a2a12', '#6b4423', '#8a5a30', '#a8784a'],
}

CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+-=?@^_~' + ';:<>()[]{}|/,' + 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ'


class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]

    # ---------- tvary -> množina pixelů ----------
    @staticmethod
    def lathe(profile, cx=16.0):
        """profile = [(y, poloviční šířka), ...] – rotačně souměrná nádoba."""
        m = set()
        ys = [p[0] for p in profile]
        y_lo, y_hi = min(ys), max(ys)
        for y in range(H):
            yd = dc(y)
            if not (y_lo <= math.floor(yd) <= y_hi):
                continue
            t = min(max(yd - .5, y_lo), y_hi)
            hw = None
            for (y0, w0), (y1, w1) in zip(profile, profile[1:]):
                if y0 <= t <= y1:
                    hw = w0 if y1 == y0 else w0 + (w1 - w0) * (t - y0) / (y1 - y0)
                    break
            if hw is None:
                continue
            for x in range(W):
                if abs(dc(x) - cx) <= hw:
                    m.add((x, y))
        return m

    @staticmethod
    def ellipse(cx, cy, rx, ry):
        return {(x, y) for y in range(H) for x in range(W)
                if ((dc(x) - cx) / rx) ** 2 + ((dc(y) - cy) / ry) ** 2 <= 1}

    @staticmethod
    def rect(x0, y0, x1, y1):
        return {(x, y) for y in range(H) for x in range(W)
                if x0 <= dc(x) < x1 + 1 and y0 <= dc(y) < y1 + 1}

    @staticmethod
    def poly(pts):
        m = set()
        for y in range(H):
            for x in range(W):
                px, py = dc(x), dc(y)
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    m.add((x, y))
        return m

    @staticmethod
    def line(x0, y0, x1, y1):
        # návrhové souřadnice pixelů (celé číslo = střed pixelu) → výstupní mřížka
        x0, y0, x1, y1 = [(v + .5) * K - .5 for v in (x0, y0, x1, y1)]
        m = set()
        n = int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 1
        for i in range(n + 1):
            t = i / n
            m.add((round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)))
        return {(x, y) for x, y in m if 0 <= x < W and 0 <= y < H}

    # ---------- malování ----------
    def paint(self, mask, mat, shade='cyl', edge=False):
        mask = {(x, y) for x, y in mask if 0 <= x < W and 0 <= y < H}
        if not mask:
            return mask
        rows = {}
        for x, y in mask:
            lo, hi = rows.get(y, (x, x))
            rows[y] = (min(lo, x), max(hi, x))
        xs = [p[0] for p in mask]; ys = [p[1] for p in mask]
        bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
        for x, y in mask:
            if isinstance(shade, int):
                idx = shade
            elif shade == 'cyl':
                lo, hi = rows[y]
                span = hi - lo + 1
                t = (x - lo + .5) / span
                if span <= 3:
                    idx = 3 if x == lo else (1 if x == hi and span > 1 else 2)
                else:
                    idx = 2 if t < .12 else 3 if t < .26 else 4 if t < .34 else 2 if t < .64 else 1
            elif shade == 'sphere':
                cx, cy = (bx0 + bx1 + 1) / 2, (by0 + by1 + 1) / 2
                r = max(bx1 - bx0 + 1, by1 - by0 + 1) / 2
                d = math.hypot(x + .5 - (cx - .35 * r), y + .5 - (cy - .35 * r)) / r
                idx = 4 if d < .25 else 3 if d < .6 else 2 if d < 1.05 else 1
            elif shade == 'flat':
                idx = 2
                if y == by0 or x == bx0: idx = 3
                if y == by1 or x == bx1: idx = 1
            elif shade == 'vgrad':
                t = (y - by0 + .5) / (by1 - by0 + 1)
                idx = 3 if t < .3 else 2 if t < .75 else 1
            else:
                idx = 2
            self.px[y][x] = (mat, idx)
        if edge:
            for x, y in mask:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n not in mask and 0 <= n[0] < W and 0 <= n[1] < H and self.px[n[1]][n[0]] is not None:
                        self.px[y][x] = (mat, 1)
                        break
        return mask

    def outline(self):
        out = [row[:] for row in self.px]
        for y in range(H):
            for x in range(W):
                c = self.px[y][x]
                if c is None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < W and 0 <= ny < H) or self.px[ny][nx] is None:
                        out[y][x] = (c[0], 0)
                        break
        self.px = out


C = Canvas  # zkratka pro tvary


# ======================= PŘEDMĚTY =======================
def kalich(c):
    c.paint(C.lathe([(3, 10.5), (6, 10.5), (10, 9.5), (13, 7.5), (15, 5), (16, 3)]), 'gold')
    c.paint(C.ellipse(16, 3.6, 9.5, 1.3), 'gold', 1)                 # otvor kalicha
    c.paint(C.rect(15, 16, 16, 27), 'gold')                          # dřík
    c.paint(C.ellipse(16, 21.5, 4, 2), 'gold', 'cyl', edge=True)     # nodus
    c.paint(C.lathe([(26, 3), (28, 7), (29, 9.5), (30, 10.5)]), 'gold', 'cyl', edge=True)


def patena(c):
    c.paint(C.ellipse(16, 18, 14.5, 5.5), 'gold')
    c.paint(C.ellipse(16, 17.6, 11, 3.6), 'gold', 3)
    c.paint(C.ellipse(16, 17.2, 6.5, 2.2), 'cloth', 'vgrad')          # hostie
    c.paint(C.line(14, 17, 18, 17), 'cloth', 1)


def konvicky(c):
    c.paint(C.rect(1, 27, 30, 29), 'silver', 'vgrad', edge=True)          # tácek
    for cx, liquid in ((9.5, 'wine'), (22.5, 'water')):
        c.paint(C.lathe([(4, 1.8), (6, 1.8)], cx), 'silver', 'cyl')    # zátka
        c.paint(C.lathe([(7, 1.5), (10, 1.7), (13, 4.6), (24, 5.2), (26, 4.4), (27, 4.8)], cx), 'glass')
        c.paint(C.lathe([(15, 3.6), (24, 4.2), (25, 3.4)], cx), liquid)
        c.paint(C.line(cx + 5, 14, cx + 6.5, 16) | C.line(cx + 6.5, 16, cx + 6.5, 20) | C.line(cx + 6.5, 20, cx + 5, 22), 'glass', 1)  # ucho
        c.paint(C.ellipse(cx - 1.5, 18, .9, 3), 'glass', 4)            # odlesk skla


def lavabo(c):
    # ručníček bez křížku, složený
    c.paint(C.poly([(3, 10), (28, 8), (29, 23), (4, 25)]), 'cloth', 'flat')
    c.paint(C.line(11, 10, 12, 24), 'cloth', 1)
    c.paint(C.line(20, 9, 21, 23), 'cloth', 1)
    c.paint(C.line(4, 21, 28, 19), 'blue', 3)                             # tkaný proužek


def zvonky(c):
    c.paint(C.rect(15, 1, 17, 9), 'wood')
    c.paint(C.rect(4, 9, 28, 11), 'gold', 'vgrad')
    for cx in (7, 16, 25):
        c.paint(C.rect(int(cx) - 1, 12, int(cx), 13), 'gold', 1)
        c.paint(C.lathe([(13, 2), (15, 3.4), (18, 4.2), (21, 5.4), (23, 6.4), (24, 6.4)], cx + .0), 'gold')
        c.paint(C.ellipse(cx, 25.5, 1.6, 1.6), 'gold', 1)


def misal(c):
    c.paint(C.rect(24, 4, 27, 27), 'cloth', 'flat')                     # ořízka stránek
    for y in range(6, 27, 2):
        c.paint(C.rect(25, y, 26, y), 'cloth', 1)
    c.paint(C.rect(4, 3, 24, 27), 'red', 'flat')
    c.paint(C.rect(6, 5, 22, 5) | C.rect(6, 25, 22, 25) | C.rect(6, 5, 6, 25) | C.rect(22, 5, 22, 25), 'gold', 3)
    c.paint(C.rect(13, 8, 15, 21) | C.rect(9, 11, 19, 13), 'gold', 'cyl')
    for x, m in ((10, 'blue'), (13, 'green'), (16, 'red')):
        c.paint(C.rect(x, 28, x + 1, 31), m, 2)


def korporal(c):
    c.paint(C.rect(3, 4, 28, 27), 'cloth', 'flat')
    for x in (11, 20):
        c.paint(C.rect(x, 5, x, 26), 'cloth', 1)
    for y in (11, 19):
        c.paint(C.rect(4, y, 27, y), 'cloth', 1)
    c.paint(C.rect(15, 21, 16, 26) | C.rect(13, 22, 18, 23), 'red', 2)


def purifikatorium(c):
    # úzká podélně složená rouška
    c.paint(C.rect(11, 2, 20, 29), 'cloth', 'flat')
    for y in (9, 16, 23):
        c.paint(C.rect(12, y, 19, y), 'cloth', 1)
    c.paint(C.rect(15, 3, 16, 7) | C.rect(13, 4, 18, 5), 'red', 2)


def pala(c):
    c.paint(C.rect(8, 8, 26, 26), 'ink', 1)                              # tloušťka
    c.paint(C.rect(6, 6, 24, 24), 'cloth', 'flat')
    c.paint(C.rect(7, 7, 23, 7) | C.rect(7, 23, 23, 23) | C.rect(7, 7, 7, 23) | C.rect(23, 7, 23, 23), 'gold', 3)
    c.paint(C.rect(14, 10, 16, 20) | C.rect(10, 13, 20, 15), 'gold', 'cyl')


def ciborium(c):
    c.paint(C.rect(15, 0, 16, 4) | C.rect(13, 1, 18, 2), 'gold', 'cyl')
    c.paint(C.lathe([(5, 2), (6, 4), (8, 8), (10, 10.5)]), 'gold')
    c.paint(C.lathe([(10, 11.5), (11, 11.5)]), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(12, 10.5), (15, 10), (18, 7.5), (19, 4)]), 'gold', 'cyl', edge=True)
    c.paint(C.rect(15, 19, 16, 27), 'gold')
    c.paint(C.ellipse(16, 23, 3.5, 1.8), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(27, 3), (29, 7.5), (30, 10)]), 'gold', 'cyl', edge=True)


def lekcionar(c):
    c.paint(C.poly([(1, 10), (16, 11), (31, 10), (31, 26), (16, 27), (1, 26)]), 'green', 'flat')
    c.paint(C.poly([(2, 8), (9, 7), (15, 9), (15, 25), (9, 23), (2, 24)]), 'cloth', 'flat')
    c.paint(C.poly([(17, 9), (23, 7), (30, 8), (30, 24), (23, 23), (17, 25)]), 'cloth', 'flat')
    for i, y in enumerate(range(11, 23, 2)):
        w = 9 if i % 3 != 2 else 6
        c.paint(C.rect(4, y, 4 + w, y), 'ink', 2)
        c.paint(C.rect(19, y, 19 + w, y), 'ink', 2)
    c.paint(C.rect(15, 9, 16, 26), 'cloth', 1)
    c.paint(C.rect(20, 25, 21, 30), 'red', 2)


def svice(c):
    c.paint(C.ellipse(16, 4.5, 2.2, 4), 'flame', 2)
    c.paint(C.ellipse(16, 5.5, 1.2, 2.2), 'flame', 4)
    c.paint(C.rect(16, 8, 16, 9), 'ink', 0)
    c.paint(C.lathe([(9, 3.5), (22, 3.5)]), 'cloth')
    c.paint(C.rect(13, 10, 14, 12), 'cloth', 4)                          # stékající vosk
    c.paint(C.lathe([(22, 7), (24, 7.5), (25, 5)]), 'gold', 'cyl', edge=True)
    c.paint(C.rect(15, 25, 16, 27), 'gold')
    c.paint(C.lathe([(28, 3), (30, 7), (31, 8)]), 'gold', 'cyl', edge=True)


def kadidelnice(c):
    for x1 in (8, 16, 24):
        c.paint(C.line(16, 2, x1, 13), 'gold', 1)
    c.paint(C.ellipse(16, 1.5, 2, 1.5), 'gold', 2)
    c.paint(C.lathe([(8, 2.5), (10, 4.5), (12, 7.5), (14, 9.5)]), 'gold')
    for x, y in ((12, 12), (16, 11), (20, 12), (14, 13), (18, 13)):
        c.paint(C.rect(x, y, x, y), 'gold', 0)                                      # otvory ve víku
    c.paint(C.lathe([(15, 11), (16, 11)]), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(17, 10.5), (19, 10), (22, 7.5), (24, 4)]), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(25, 2.5), (27, 4.5), (28, 6)]), 'gold', 'cyl', edge=True)
    for (x, y, r) in ((24.5, 8, 1.3), (27, 4.5, 1.6), (24.5, 1.5, 1.2)):
        c.paint(C.ellipse(x, y, r, r), 'smoke', 'sphere')


def lodka(c):
    hull = C.ellipse(16, 13, 14.5, 8.5) & C.rect(0, 13, 31, 31)
    c.paint(hull, 'gold')
    c.paint(C.poly([(1, 8), (5, 13), (1, 13)]) | C.poly([(31, 8), (27, 13), (31, 13)]), 'gold', 3)
    c.paint(C.rect(2, 13, 29, 14), 'gold', 'vgrad', edge=True)
    c.paint(C.lathe([(22, 2), (24, 3.5), (26, 7)]), 'gold', 'cyl', edge=True)
    c.paint(C.line(18, 12, 26, 4), 'silver', 2)
    c.paint(C.ellipse(27, 3.5, 2.4, 1.8), 'silver', 'sphere')


def kropenka(c):
    # nádobka na svěcenou vodu u vchodu do kostela (na zdi)
    c.paint(C.ellipse(16, 8, 8, 6) | C.rect(8, 8, 23, 21), 'stone', 'flat')
    c.paint(C.rect(15, 5, 16, 14) | C.rect(12, 7, 19, 8), 'gold', 'cyl')
    c.paint(C.ellipse(16, 20, 12, 8) & C.rect(0, 20, 31, 31), 'stone', 'cyl', edge=True)
    c.paint(C.ellipse(16, 20.5, 10, 1.6), 'water', 2)
    c.paint(C.lathe([(28, 2.5), (30, 1)]), 'stone', 'cyl')


def monstrance(c):
    for i in range(16):
        a = math.radians(i * 22.5)
        ln = 15 if i % 2 == 0 else 12
        c.paint(C.line(16 + 6 * math.cos(a), 12 + 6 * math.sin(a), 16 + ln * math.cos(a) * .95, 12 + ln * math.sin(a) * .78), 'gold', 3 if i % 2 else 2)
    c.paint(C.ellipse(16, 12, 6.5, 6.5), 'gold', 'sphere')
    c.paint(C.ellipse(16, 12, 4, 4), 'cloth', 'sphere')
    c.paint(C.rect(15, 0, 16, 2), 'gold', 3)
    c.paint(C.rect(15, 19, 16, 27), 'gold')
    c.paint(C.ellipse(16, 23, 3, 1.6), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(27, 3), (29, 7), (31, 10)]), 'gold', 'cyl', edge=True)


def kriz(c):
    c.paint(C.rect(14, 1, 17, 15), 'gold', 'cyl')
    c.paint(C.rect(7, 5, 24, 8), 'gold', 'vgrad')
    for x, y in ((15.5, 1.5), (7.5, 6.5), (24.5, 6.5)):
        c.paint(C.ellipse(x, y, 1.8, 1.8), 'gold', 'sphere')
    c.paint(C.ellipse(16, 17, 3, 2), 'gold', 'sphere')
    c.paint(C.rect(15, 19, 16, 31), 'wood')


def vecne_svetlo(c):
    for x1 in (10, 16, 22):
        c.paint(C.line(16, 1, x1, 9), 'gold', 1)
    c.paint(C.ellipse(16, 1, 1.6, 1.2), 'gold', 2)
    c.paint(C.lathe([(9, 7.5), (11, 7.5)]), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(12, 6.5), (19, 6.5), (22, 4.5), (23, 3)]), 'redglass')
    c.paint(C.ellipse(16, 15, 1.6, 2.8), 'flame', 3)
    c.paint(C.ellipse(16, 16, .9, 1.4), 'flame', 4)
    c.paint(C.lathe([(23, 4), (25, 2.5), (27, 1)]), 'gold', 'cyl', edge=True)
    c.paint(C.ellipse(16, 28.5, 1.4, 1.4), 'gold', 'sphere')


def aspergil(c):
    # kropáč: rukojeť a děrovaná kulička
    c.paint(C.line(4, 29, 19, 14) | C.line(5, 29, 20, 14) | C.line(4, 28, 19, 13), 'wood')
    c.paint(C.ellipse(20, 12.5, 2.2, 2.2), 'silver', 'sphere')
    c.paint(C.ellipse(24.5, 8, 6, 6), 'silver', 'sphere')
    for x, y in ((22, 6), (25, 5), (27, 8), (24, 9), (21, 9), (26, 11), (23, 12)):
        c.paint(C.rect(x, y, x, y), 'silver', 0)
    for x, y in ((29, 15), (27, 17), (30, 19)):
        c.paint(C.rect(x, y, x, y), 'water', 3)


def abak(c):
    c.paint(C.rect(4, 13, 6, 29) | C.rect(25, 13, 27, 29), 'wood')
    c.paint(C.rect(6, 22, 25, 23), 'wood', 'vgrad')
    c.paint(C.rect(1, 10, 30, 14), 'cloth', 'flat')                     # ubrus
    for cx, liq in ((10, 'wine'), (15, 'water')):
        c.paint(C.lathe([(2, 1), (4, 1.2), (5, 2.2), (9, 2.4)], cx), 'glass')
        c.paint(C.lathe([(6, 1.6), (9, 1.8)], cx), liq)
    c.paint(C.lathe([(3, 3.5), (5, 3.5), (6, 2), (7, 1), (8, 1), (9, 2.5)], 23), 'gold')


def kalichove_velum(c):
    c.paint(C.lathe([(27, 6), (29, 9)]), 'gold', 'cyl', edge=True)       # noha kalicha
    c.paint(C.poly([(7, 4), (25, 4), (28, 27), (4, 27)]), 'green', 'cyl')
    c.paint(C.rect(15, 9, 17, 22) | C.rect(10, 13, 22, 15), 'gold', 'cyl')
    c.paint(C.poly([(4, 25), (28, 25), (28, 27), (4, 27)]), 'gold', 'vgrad')


def ciboriove_velum(c):
    c.paint(C.rect(15, 0, 16, 4) | C.rect(13, 1, 18, 2), 'gold', 'cyl')
    c.paint(C.lathe([(28, 4), (30, 9)]), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(4, 2.5), (6, 6), (9, 9), (14, 10.5), (25, 12.5), (27, 13)]), 'cloth')
    c.paint(C.lathe([(26, 12.6), (27, 13)]), 'gold', 'vgrad')
    c.paint(C.rect(15, 13, 16, 21) | C.rect(12, 15, 19, 16), 'gold', 'cyl')


def pixida(c):
    # neprůhledná schránka podobná monstranci, bez paprsků
    c.paint(C.rect(15, 0, 16, 4) | C.rect(13, 1, 18, 2), 'gold', 'cyl')
    c.paint(C.ellipse(16, 11.5, 8, 8), 'gold', 'sphere')
    c.paint(C.ellipse(16, 11.5, 5.5, 5.5), 'gold', 2, edge=True)
    c.paint(C.rect(15, 8, 16, 15) | C.rect(13, 10, 18, 11), 'gold', 1)
    c.paint(C.rect(15, 19, 16, 27), 'gold')
    c.paint(C.ellipse(16, 23, 3, 1.6), 'gold', 'cyl', edge=True)
    c.paint(C.lathe([(27, 3), (29, 7), (31, 9)]), 'gold', 'cyl', edge=True)


def oltar(c):
    c.paint(C.rect(4, 17, 27, 29), 'stone', 'flat')
    c.paint(C.rect(13, 20, 18, 26), 'stone', 1)
    c.paint(C.rect(15, 21, 16, 25) | C.rect(14, 22, 17, 22), 'gold', 3)
    c.paint(C.rect(2, 14, 29, 17), 'cloth', 'flat')
    for cx in (6, 26):
        c.paint(C.lathe([(12, 2), (13, 2)], cx), 'gold', 'cyl')
        c.paint(C.lathe([(6, 1.3), (11, 1.3)], cx), 'cloth')
        c.paint(C.ellipse(cx, 4, 1.1, 2), 'flame', 3)
    c.paint(C.rect(15, 4, 16, 13) | C.rect(12, 6, 19, 7), 'gold', 'cyl')
    c.paint(C.lathe([(12, 2.5), (13, 3)]), 'gold', 'cyl')


def sedes(c):
    c.paint(C.ellipse(16, 4, 8.5, 3) | C.rect(8, 4, 23, 18), 'wood', 'flat')
    c.paint(C.rect(10, 5, 21, 16), 'red', 'cyl')
    c.paint(C.rect(7, 21, 9, 30) | C.rect(22, 21, 24, 30), 'wood')
    c.paint(C.rect(5, 13, 8, 15) | C.rect(23, 13, 26, 15), 'wood', 'vgrad')
    c.paint(C.rect(6, 15, 7, 19) | C.rect(24, 15, 25, 19), 'wood')
    c.paint(C.rect(6, 17, 25, 18), 'red', 'vgrad')
    c.paint(C.rect(5, 19, 26, 21), 'wood', 'vgrad', edge=True)


def ambon(c):
    c.paint(C.rect(6, 27, 25, 30), 'wood', 'vgrad', edge=True)
    c.paint(C.rect(9, 11, 22, 27), 'wood', 'cyl')
    c.paint(C.rect(11, 13, 20, 24), 'green', 'flat')
    c.paint(C.rect(15, 15, 16, 22) | C.rect(13, 17, 18, 18), 'gold', 3)
    c.paint(C.poly([(3, 7), (29, 7), (27, 12), (5, 12)]), 'wood', 'vgrad', edge=True)
    c.paint(C.poly([(7, 2), (16, 4), (25, 2), (25, 7), (16, 8), (7, 7)]), 'cloth', 'flat')
    c.paint(C.line(16, 4, 16, 8), 'cloth', 1)
    c.paint(C.rect(17, 8, 17, 12), 'red', 2)


def svatostanek(c):
    c.paint(C.rect(4, 28, 27, 30), 'stone', 'vgrad', edge=True)
    c.paint(C.rect(6, 10, 25, 28), 'gold', 'cyl')
    c.paint(C.rect(10, 13, 21, 26), 'gold', 3, edge=True)
    c.paint(C.rect(15, 15, 16, 23) | C.rect(12, 17, 19, 18), 'gold', 1)
    c.paint(C.rect(20, 19, 20, 20), 'gold', 0)                           # zámek
    c.paint(C.poly([(3, 10), (16, 3), (28, 10)]), 'gold', 'vgrad', edge=True)
    c.paint(C.rect(15, 0, 16, 4) | C.rect(13, 1, 18, 2), 'gold', 'cyl')


def krtitelnice(c):
    c.paint(C.lathe([(25, 5), (28, 9), (30, 10.5)]), 'stone', 'cyl', edge=True)
    c.paint(C.lathe([(17, 3.5), (25, 3.5)]), 'stone', 'cyl')
    c.paint(C.lathe([(11, 12.5), (13, 12), (16, 9), (17, 5)]), 'stone', 'cyl', edge=True)
    c.paint(C.lathe([(5, 2), (7, 5), (9, 9), (11, 12.5)]), 'gold')
    c.paint(C.rect(15, 0, 16, 5) | C.rect(13, 1, 18, 2), 'gold', 'cyl')


def paskal(c):
    c.paint(C.ellipse(16, 3, 1.8, 3), 'flame', 2)
    c.paint(C.ellipse(16, 4, 1, 1.7), 'flame', 4)
    c.paint(C.lathe([(6, 4), (24, 4)]), 'cloth')
    c.paint(C.rect(15, 9, 16, 21) | C.rect(12, 12, 19, 13), 'red', 2)
    for x, y in ((15.5, 9), (15.5, 20), (12, 12.5), (19, 12.5), (15.5, 12.5)):
        c.paint(C.ellipse(x + .5, y + .5, .9, .9), 'gold', 3)            # pět zrn kadidla
    c.paint(C.lathe([(25, 5.5), (26, 6)]), 'gold', 'cyl', edge=True)
    c.paint(C.rect(15, 26, 16, 28), 'gold')
    c.paint(C.lathe([(28, 3), (30, 7), (31, 8)]), 'gold', 'cyl', edge=True)


def zpovednice(c):
    c.paint(C.rect(3, 7, 28, 30), 'wood', 'flat')
    c.paint(C.rect(1, 5, 30, 8), 'wood', 'vgrad', edge=True)
    c.paint(C.ellipse(16, 13, 4.5, 4) | C.rect(12, 13, 19, 29), 'wood', 1, edge=True)
    c.paint(C.rect(18, 20, 18, 21), 'gold', 3)                           # klika
    for x0 in (5, 22):
        c.paint(C.rect(x0, 12, x0 + 4, 19), 'red', 1)
        for x in range(x0, x0 + 5, 2):
            c.paint(C.rect(x, 12, x, 19), 'wood', 3)
        for y in range(12, 20, 2):
            c.paint(C.rect(x0, y, x0 + 4, y), 'wood', 3)
    c.paint(C.rect(15, 0, 16, 5) | C.rect(13, 1, 18, 2), 'gold', 'cyl')


# ======================= ROUCHA =======================
def mirror(pts):
    return [(31 - x, y) for x, y in pts]


def komze(c):
    # černá sukně se šňůrkou v pase
    c.paint(C.poly([(10, 4), (22, 4), (27, 29), (5, 29)]), 'black', 'cyl')
    c.paint(C.rect(10, 3, 21, 5), 'black', 3, edge=True)
    c.paint(C.line(15, 5, 13, 12) | C.line(16, 5, 18, 11), 'cloth', 1)    # tkanice
    for x in (10, 16, 22):
        c.paint(C.line(x, 9, x + (x - 16) * .35, 28), 'black', 1)        # sklady


def superpelice(c):
    for pts in ([(10, 4), (2, 14), (4, 20), (10, 14)],):
        c.paint(C.poly(pts) | C.poly(mirror(pts)), 'cloth', 'flat')
    c.paint(C.poly([(10, 3), (22, 3), (23, 12), (9, 12)]), 'cloth', 'cyl')
    c.paint(C.poly([(8, 12), (24, 12), (27, 28), (5, 28)]), 'cloth', 'cyl')
    c.paint(C.rect(9, 12, 23, 12), 'cloth', 1)
    for x in range(8, 25, 3):
        c.paint(C.line(x, 13, x + (x - 16) * .25, 27), 'cloth', 1)       # sklady
    c.paint(C.ellipse(16, 3.5, 3, 1.5), 'cloth', 0)


def limec(c):
    c.paint(C.lathe([(9, 4), (11, 8), (15, 12), (21, 13.5), (25, 14)]), 'black', 'cyl')
    c.paint(C.rect(12, 6, 19, 10), 'black', 2, edge=True)
    c.paint(C.rect(13, 7, 18, 7), 'cloth', 3)
    for y in (13, 17, 21):
        c.paint(C.rect(15, y, 16, y + 1), 'black', 4)


def alba(c):
    sleeve = [(9, 6), (3, 21), (6, 22), (10, 11)]
    c.paint(C.poly(sleeve) | C.poly(mirror(sleeve)), 'cloth', 'flat')
    c.paint(C.poly([(11, 3), (21, 3), (23, 6), (25, 30), (7, 30), (9, 6)]), 'cloth', 'cyl')
    c.paint(C.rect(13, 1, 18, 3), 'cloth', 3, edge=True)
    c.paint(C.line(14, 8, 12, 29) | C.line(18, 8, 20, 29), 'cloth', 1)


def klerika(c):
    sleeve = [(9, 6), (3, 21), (6, 22), (10, 11)]
    c.paint(C.poly(sleeve) | C.poly(mirror(sleeve)), 'black', 'flat')
    c.paint(C.poly([(11, 3), (21, 3), (23, 6), (25, 30), (7, 30), (9, 6)]), 'black', 'cyl')
    c.paint(C.rect(13, 1, 18, 3), 'black', 3, edge=True)
    c.paint(C.rect(15, 2, 16, 2), 'cloth', 4)                              # kolárek
    for y in range(5, 29, 3):
        c.paint(C.rect(16, y, 16, y), 'black', 4)                          # knoflíky


def humeral(c):
    c.paint(C.line(6, 9, 1, 27) | C.line(25, 9, 30, 27), 'cloth', 1)      # tkanice
    c.paint(C.rect(6, 7, 25, 20), 'cloth', 'flat')
    c.paint(C.rect(6, 7, 25, 8), 'cloth', 3)
    c.paint(C.rect(15, 10, 16, 14) | C.rect(13, 11, 18, 12), 'red', 2)


def cingulum(c):
    pts = [(x, 15 + 7 * math.sin((x - 2) / 4.2)) for x in range(3, 30)]
    rope = set()
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        rope |= C.line(ax, ay, bx, by) | C.line(ax, ay + 1, bx, by + 1)
    c.paint(rope, 'cloth', 2)
    for i, (x, y) in enumerate(pts):
        if i % 2 == 0:
            c.paint(C.rect(int(x), int(y), int(x), int(y)), 'cloth', 4)
    for x, y in ((3, pts[0][1]), (29, pts[-1][1])):
        c.paint(C.poly([(x - 1, y), (x + 1, y), (x + 2.5, y + 7), (x - 2.5, y + 7)]), 'cloth', 'flat')


def stola(c):
    c.paint(C.ellipse(16, 3, 5, 2.5) - C.ellipse(16, 2.5, 3, 1.3), 'green', 2)
    left = [(11, 3), (14, 4), (11, 29), (7, 29)]
    c.paint(C.poly(left) | C.poly(mirror(left)), 'green', 'cyl')
    for cx in (9, 22):
        c.paint(C.rect(cx, 21, cx + 1, 26) | C.rect(cx - 1, 23, cx + 2, 24), 'gold', 3)
    c.paint(C.rect(7, 28, 11, 29) | C.rect(20, 28, 24, 29), 'gold', 2)


def ornat(c):
    c.paint(C.poly([(9, 2), (23, 2), (28, 10), (28, 24), (24, 30), (8, 30), (4, 24), (4, 10)]), 'green', 'cyl')
    c.paint(C.rect(13, 5, 18, 30), 'gold', 'cyl')
    for y in range(7, 29, 4):
        c.paint(C.rect(15, y, 16, y + 1), 'green', 1)
    c.paint(C.ellipse(16, 2.5, 4.5, 2.5), 'green', 0)


def dalmatika(c):
    sleeve = [(9, 4), (2, 9), (3, 16), (9, 13)]
    c.paint(C.poly(sleeve) | C.poly(mirror(sleeve)), 'cloth', 'flat')
    c.paint(C.poly([(9, 3), (22, 3), (24, 30), (7, 30)]), 'cloth', 'cyl')
    c.paint(C.rect(11, 4, 12, 30) | C.rect(19, 4, 20, 30), 'gold', 3)
    c.paint(C.rect(11, 9, 20, 10) | C.rect(11, 24, 20, 25), 'gold', 2)
    c.paint(C.rect(2, 14, 4, 16) | C.rect(27, 14, 29, 16), 'gold', 2)
    c.paint(C.ellipse(16, 3, 4, 1.6), 'cloth', 0)


def pluvial(c):
    c.paint(C.poly([(10, 2), (22, 2), (29, 30), (3, 30)]), 'red', 'cyl')
    c.paint(C.poly([(14, 8), (18, 8), (21, 30), (11, 30)]), 'cloth', 'flat')   # alba pod pluviálem
    c.paint(C.line(13, 8, 10, 30) | C.line(12, 8, 9, 30) | C.line(18, 8, 21, 30) | C.line(19, 8, 22, 30), 'gold', 3)
    c.paint(C.rect(12, 6, 19, 9), 'gold', 'cyl', edge=True)                # spona
    c.paint(C.rect(15, 7, 16, 8), 'red', 3)


def biret(c):
    c.paint(C.poly([(5, 22), (12, 27), (12, 17), (5, 12)]), 'black', 2)
    c.paint(C.poly([(12, 17), (27, 13), (27, 23), (12, 27)]), 'black', 1)
    c.paint(C.poly([(5, 12), (20, 8), (27, 13), (12, 17)]), 'black', 3)
    for pts in ([(7, 12), (9, 5), (11, 13)], [(20, 9), (23, 3), (25, 12)], [(11, 16), (14, 9), (17, 15)]):
        c.paint(C.poly(pts), 'black', 2)
    c.paint(C.ellipse(16, 10, 3.2, 3), 'black', 4)


def velum(c):
    band = [(1, 12), (10, 9), (20, 12), (31, 8), (31, 17), (20, 21), (10, 18), (1, 21)]
    c.paint(C.poly(band), 'cloth', 'vgrad')
    c.paint(C.poly([(1, 12), (3, 11.5), (3, 20.5), (1, 21)]) | C.poly([(29, 8.5), (31, 8), (31, 17), (29, 17.5)]), 'gold', 3)
    c.paint(C.rect(15, 11, 16, 18) | C.rect(13, 13, 18, 14), 'gold', 'cyl')


def vimpa(c):
    # bílý nezdobený pás
    band = [(1, 12), (10, 9), (20, 12), (31, 8), (31, 17), (20, 21), (10, 18), (1, 21)]
    c.paint(C.poly(band), 'cloth', 'vgrad')
    c.paint(C.line(10, 10, 10, 17) | C.line(20, 13, 20, 20), 'cloth', 1)


def solideo(c):
    c.paint(C.ellipse(16, 21, 12, 9) & C.rect(0, 0, 31, 21), 'violet', 'sphere')
    for x in (8, 24):
        c.paint(C.line(16, 13, x, 21), 'violet', 1)
    c.paint(C.line(16, 13, 16, 21), 'violet', 1)
    c.paint(C.rect(15, 10, 16, 12), 'violet', 1)


def mitra(c):
    c.paint(C.rect(10, 22, 12, 31) | C.rect(19, 22, 21, 31), 'cloth', 'cyl')
    c.paint(C.rect(10, 29, 12, 31) | C.rect(19, 29, 21, 31), 'gold', 3)
    c.paint(C.poly([(16, 0), (25, 9), (25, 23), (6, 23), (6, 9)]), 'cloth', 'cyl')
    c.paint(C.rect(6, 19, 25, 23), 'gold', 'vgrad', edge=True)
    c.paint(C.rect(15, 6, 16, 15) | C.rect(12, 8, 19, 9), 'gold', 'cyl')


def berla(c):
    shaft = C.line(6, 31, 18, 12) | C.line(7, 31, 19, 12) | C.line(8, 31, 20, 12)
    c.paint(shaft, 'gold', 'cyl')
    crook = set()
    for r in (5.6, 4.9, 4.2):
        pts = [(22 + r * math.cos(math.radians(a)), 7.5 - r * math.sin(math.radians(a))) for a in range(215, -110, -10)]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            crook |= C.line(ax, ay, bx, by)
    c.paint(crook, 'gold', 3)
    c.paint(C.ellipse(22.5, 8, 1.8, 1.8), 'gold', 'sphere')
    c.paint(C.ellipse(19, 13, 2.8, 2), 'gold', 'sphere')


def pektoral(c):
    pts = [(16 + 9 * math.cos(math.radians(a)), 10 - 8.5 * math.sin(math.radians(a))) for a in range(0, 181, 10)]
    chain = set()
    for i, ((ax, ay), (bx, by)) in enumerate(zip(pts, pts[1:])):
        chain |= C.line(ax, ay, bx, by)
    c.paint(chain, 'gold', 2)
    c.paint(C.rect(13, 9, 18, 30), 'gold', 'cyl')
    c.paint(C.rect(7, 13, 24, 18), 'gold', 'vgrad', edge=True)
    c.paint(C.rect(15, 14, 16, 23), 'skin', 1)
    c.paint(C.rect(10, 15, 21, 15), 'skin', 1)
    c.paint(C.ellipse(16, 13, 1.1, 1.1), 'skin', 2)


def pallium(c):
    ring = C.ellipse(16, 9, 14, 7) - C.ellipse(16, 8.5, 10.5, 4)
    c.paint(ring, 'cloth', 'vgrad')
    c.paint(C.rect(14, 13, 17, 30), 'cloth', 'cyl')
    c.paint(C.rect(14, 28, 17, 30), 'black', 2)
    for x, y in ((16, 20), (5, 10), (27, 10), (16, 14)):
        c.paint(C.rect(x - 1, y - 2, x, y + 1) | C.rect(x - 2, y - 1, x + 1, y), 'black', 2)


# ======================= POSTOJE A GESTA =======================
def head(c, x, y, face='right'):
    c.paint(C.ellipse(x, y, 3.2, 3.4), 'skin', 'sphere')
    c.paint(C.ellipse(x - (.6 if face == 'right' else 0), y - 1.4, 3.5, 2.4) & C.rect(0, 0, 31, int(y - 1)), 'hair', 2)
    if face == 'right':
        c.paint(C.rect(int(x + 1), int(y), int(x + 1), int(y)), 'ink', 0)


def praying(c, x, y):
    c.paint(C.poly([(x, y + 2), (x + 4, y - 1), (x + 5, y), (x + 1, y + 3)]), 'skin', 2)


def stani(c):
    head(c, 16, 5)
    c.paint(C.poly([(12, 20), (20, 20), (20, 29), (12, 29)]), 'black', 'cyl')
    c.paint(C.poly([(13, 9), (19, 9), (21, 20), (11, 20)]), 'cloth', 'cyl')
    c.paint(C.rect(14, 8, 18, 9), 'black', 2)
    c.paint(C.line(17, 10, 19, 13), 'cloth', 1)
    praying(c, 19, 12)
    c.paint(C.rect(12, 29, 15, 30) | C.rect(17, 29, 21, 30), 'black', 0)


def sezeni(c):
    c.paint(C.rect(5, 20, 18, 22), 'wood', 'vgrad', edge=True)
    c.paint(C.rect(6, 22, 7, 30) | C.rect(16, 22, 17, 30), 'wood')
    head(c, 12, 4)
    c.paint(C.poly([(9, 8), (15, 8), (16, 20), (8, 20)]), 'cloth', 'cyl')
    c.paint(C.rect(9, 17, 22, 20), 'black', 'vgrad')
    c.paint(C.rect(19, 20, 22, 29), 'black', 'cyl')
    c.paint(C.rect(19, 29, 25, 30), 'black', 0)
    c.paint(C.line(13, 10, 19, 16), 'cloth', 1)
    c.paint(C.ellipse(20, 16.5, 1.6, 1.2), 'skin', 2)


def kleceni(c):
    c.paint(C.rect(3, 27, 22, 29), 'wood', 'vgrad', edge=True)          # klekátko
    head(c, 13, 4)
    c.paint(C.rect(3, 24, 16, 26), 'black', 'vgrad')                   # lýtka
    c.paint(C.rect(9, 18, 16, 25), 'black', 'cyl')                      # stehna
    c.paint(C.poly([(10, 8), (16, 8), (17, 19), (9, 19)]), 'cloth', 'cyl')
    c.paint(C.line(15, 9, 18, 12), 'cloth', 1)
    praying(c, 17, 11)
    c.paint(C.rect(1, 22, 3, 26), 'black', 0)


def pokleknuti(c):
    c.paint(C.rect(0, 30, 31, 30), 'stone', 1)
    head(c, 12, 4)
    c.paint(C.poly([(8, 17), (13, 17), (14, 27), (10, 27)]), 'black', 'cyl')   # zadní stehno
    c.paint(C.rect(1, 27, 13, 29), 'black', 'vgrad')                            # pravé koleno na zemi
    c.paint(C.rect(12, 17, 22, 20), 'black', 'vgrad')                           # přední stehno
    c.paint(C.rect(19, 20, 22, 29), 'black', 'cyl')
    c.paint(C.rect(19, 29, 25, 29) | C.rect(0, 26, 1, 29), 'black', 0)
    c.paint(C.poly([(9, 8), (15, 8), (16, 18), (8, 18)]), 'cloth', 'cyl')
    c.paint(C.line(14, 9, 17, 12), 'cloth', 1)
    praying(c, 16, 11)


def uklona(c):
    c.paint(C.poly([(9, 16), (16, 16), (17, 29), (9, 29)]), 'black', 'cyl')
    c.paint(C.poly([(8, 18), (16, 18), (26, 12), (22, 6)]), 'cloth', 'cyl')
    c.paint(C.rect(22, 6, 25, 9), 'black', 2)
    head(c, 26.5, 12)
    c.paint(C.line(20, 11, 21, 15), 'cloth', 1)
    praying(c, 20, 15)
    c.paint(C.rect(9, 29, 12, 30) | C.rect(14, 29, 18, 30), 'black', 0)


def prostrace(c):
    c.paint(C.rect(0, 27, 31, 29), 'stone', 'vgrad')
    c.paint(C.poly([(6, 20), (26, 20), (28, 26), (6, 26)]), 'cloth', 'cyl')   # alba
    c.paint(C.rect(26, 22, 30, 26), 'black', 2)
    c.paint(C.ellipse(4, 23, 3, 3), 'hair', 'sphere')
    c.paint(C.rect(1, 25, 8, 26), 'skin', 2)                                     # ruce pod čelem


def sklon_hlavy(c):
    c.paint(C.poly([(5, 23), (27, 23), (30, 31), (2, 31)]), 'cloth', 'cyl')
    c.paint(C.rect(13, 21, 19, 24), 'black', 2)
    c.paint(C.ellipse(16, 15, 6, 6.5), 'skin', 'sphere')
    c.paint(C.ellipse(16, 10.5, 6.6, 4.5) & C.rect(0, 0, 31, 11), 'hair', 2)
    c.paint(C.rect(12, 16, 14, 16) | C.rect(18, 16, 20, 16), 'ink', 0)          # zavřené oči
    arrow = C.line(24, 3, 27, 6) | C.line(27, 6, 27, 10) | C.line(25, 9, 27, 11) | C.line(29, 9, 27, 11)
    c.paint(arrow, 'gold', 3)


def sepjate_ruce(c):
    left = [(9, 30), (9, 17), (15, 3), (16, 3), (16, 30)]
    c.paint(C.poly(left), 'skin', 'cyl')
    c.paint(C.poly(mirror(left)), 'skin', 'cyl')
    c.paint(C.line(16, 4, 16, 28), 'skin', 1)
    c.paint(C.rect(13, 16, 16, 21), 'skin', 3, edge=True)                       # pravý palec přes levý
    c.paint(C.rect(4, 26, 14, 31) | C.rect(18, 26, 27, 31), 'cloth', 'flat')


def biti_v_prsa(c):
    c.paint(C.poly([(4, 21), (28, 21), (31, 31), (1, 31)]), 'cloth', 'cyl')
    c.paint(C.rect(13, 19, 19, 22), 'black', 2)
    c.paint(C.ellipse(16, 12, 6, 6.5), 'skin', 'sphere')
    c.paint(C.ellipse(16, 7.5, 6.6, 4.5) & C.rect(0, 0, 31, 8), 'hair', 2)
    c.paint(C.rect(13, 12, 13, 13) | C.rect(19, 12, 19, 13), 'ink', 0)
    c.paint(C.line(24, 31, 18, 25), 'cloth', 1)
    c.paint(C.ellipse(16, 25, 3, 2.6), 'skin', 'sphere')                        # pěst
    c.paint(C.line(21, 23, 23, 21) | C.line(22, 26, 25, 26), 'gold', 3)


def znameni_krize(c):
    c.paint(C.poly([(4, 21), (28, 21), (31, 31), (1, 31)]), 'cloth', 'cyl')
    c.paint(C.rect(13, 19, 19, 22), 'black', 2)
    c.paint(C.ellipse(16, 12, 6, 6.5), 'skin', 'sphere')
    c.paint(C.ellipse(16, 7.5, 6.6, 4.5) & C.rect(0, 0, 31, 8), 'hair', 2)
    c.paint(C.rect(13, 12, 13, 13) | C.rect(19, 12, 19, 13), 'ink', 0)
    for y in range(3, 30, 2):
        c.paint(C.rect(16, y, 16, y), 'gold', 3)
    for x in range(6, 27, 2):
        c.paint(C.rect(x, 25, x, 25), 'gold', 3)
    c.paint(C.ellipse(18, 6, 1.8, 1.4), 'skin', 3)                              # ruka u čela


def podani_ruky(c):
    c.paint(C.poly([(0, 12), (9, 11), (10, 21), (0, 23)]), 'cloth', 'flat')
    c.paint(C.poly([(31, 11), (22, 12), (21, 22), (31, 21)]), 'cloth', 'flat')
    c.paint(C.poly([(9, 12), (18, 13), (19, 19), (10, 20)]), 'skin', 'cyl')
    c.paint(C.poly([(13, 15), (22, 13), (22, 21), (13, 21)]), 'skin', 'vgrad', edge=True)
    c.paint(C.line(15, 14, 19, 12), 'skin', 4)                                  # palec


def chuze(c):
    head(c, 16, 4)
    c.paint(C.poly([(12, 18), (20, 18), (25, 28), (7, 28)]), 'black', 'cyl')
    c.paint(C.poly([(13, 8), (19, 8), (20, 18), (12, 18)]), 'cloth', 'cyl')
    c.paint(C.rect(14, 7, 18, 8), 'black', 2)
    c.paint(C.line(17, 9, 19, 12), 'cloth', 1)
    praying(c, 19, 11)
    c.paint(C.rect(21, 28, 26, 29) | C.rect(5, 28, 9, 29), 'black', 0)
    c.paint(C.line(2, 10, 8, 10) | C.line(1, 14, 8, 14) | C.line(3, 18, 8, 18), 'smoke', 1)


# ======================= LITURGICKÉ BARVY A ROK =======================
def make_ornat(mat, band='gold'):
    def f(c):
        c.paint(C.poly([(9, 2), (23, 2), (28, 10), (28, 24), (24, 30), (8, 30), (4, 24), (4, 10)]), mat, 'cyl')
        c.paint(C.rect(13, 5, 18, 30), band, 'cyl')
        c.paint(C.rect(10, 12, 21, 15), band, 'vgrad')
        c.paint(C.ellipse(16, 2.5, 4.5, 2.5), mat, 0)
    return f


barva_bila = make_ornat('cloth')
barva_bila.__name__ = 'barva_bila'
barva_cervena = make_ornat('red')
barva_zelena = make_ornat('green')
barva_fialova = make_ornat('violet')
barva_ruzova = make_ornat('rose')
for _n in ('barva_cervena', 'barva_zelena', 'barva_fialova', 'barva_ruzova'):
    globals()[_n].__name__ = _n


def adventni_venec(c):
    ring = C.ellipse(16, 23, 14, 6) - C.ellipse(16, 22.5, 9, 3)
    c.paint(ring, 'green', 'vgrad')
    for x in range(3, 30, 3):
        c.paint(C.rect(x, 22 + (x % 2), x, 22 + (x % 2)), 'green', 4)
    for cx, cy, mat in ((8, 20, 'violet'), (13, 17, 'violet'), (19, 17, 'rose'), (24, 20, 'violet')):
        c.paint(C.lathe([(cy - 9, 1.6), (cy, 1.6)], cx), mat, 'cyl')
        c.paint(C.ellipse(cx, cy - 11, .9, 1.6), 'flame', 3)
    c.paint(C.rect(13, 27, 18, 29) | C.rect(10, 26, 11, 28), 'red', 2)       # mašle


def vanoce(c):
    star = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        r = 7 if i % 2 == 0 else 3
        star.append((12 + r * math.cos(a), 9 + r * math.sin(a)))
    c.paint(C.poly([(16, 9), (31, 15), (31, 19), (16, 12)]), 'gold', 'vgrad')    # ohon
    c.paint(C.poly(star), 'gold', 'sphere')
    c.paint(C.poly([(8, 24), (25, 24), (22, 30), (11, 30)]), 'wood', 'vgrad', edge=True)  # jesle
    c.paint(C.ellipse(16.5, 23.5, 8, 2.2), 'gold', 3)                        # sláma
    c.paint(C.ellipse(16.5, 22, 3, 2), 'cloth', 'sphere')                     # zavinuté děťátko
    c.paint(C.ellipse(17.5, 21.5, 1.3, 1.3), 'skin', 2)


def popelec(c):
    c.paint(C.lathe([(17, 12), (19, 11.5), (23, 8), (25, 5)]), 'stone', 'cyl', edge=True)
    c.paint(C.ellipse(16, 17, 11, 3) | C.ellipse(16, 16, 7, 3), 'smoke', 'sphere')
    c.paint(C.rect(15, 3, 17, 12) | C.rect(11, 6, 21, 8), 'ink', 1)           # popelem udělaný křížek


def mezidobi(c):
    c.paint(C.lathe([(22, 9), (24, 8), (29, 6), (30, 6.5)]), 'wood', 'cyl', edge=True)   # květináč
    c.paint(C.ellipse(16, 22.5, 8.5, 1.5), 'hair', 2)
    c.paint(C.line(16, 22, 16, 7) | C.line(17, 22, 17, 7), 'green', 2)
    for (x, y, rx, ry) in ((11, 15, 5, 2.2), (21.5, 12, 5, 2.2), (12, 8, 4, 2), (21, 5.5, 4, 1.8)):
        c.paint(C.ellipse(x, y, rx, ry), 'green', 'sphere')


ITEMS = [kalich, patena, konvicky, lavabo, abak, zvonky, misal,
         korporal, purifikatorium, pala, kalichove_velum, ciborium, ciboriove_velum, svice,
         kadidelnice, lodka, aspergil, monstrance, pixida, kriz,
         oltar, ambon, sedes, lekcionar, svatostanek, vecne_svetlo,
         kropenka, krtitelnice, paskal, zpovednice,
         komze, superpelice, limec, alba, klerika, humeral, cingulum, stola, ornat, dalmatika,
         pluvial, biret, velum, vimpa, solideo, mitra, berla, pektoral, pallium,
         stani, sezeni, kleceni, pokleknuti, uklona, prostrace,
         sklon_hlavy, sepjate_ruce, biti_v_prsa, znameni_krize, podani_ruky, chuze,
         barva_bila, barva_cervena, barva_zelena, barva_fialova, barva_ruzova,
         adventni_venec, vanoce, popelec, mezidobi]


def build():
    keymap, pal = {}, {}
    def ch(mat, idx):
        k = (mat, idx)
        if k not in keymap:
            c = CHARS[len(keymap)]
            keymap[k] = c
            pal[c] = MATS[mat][idx]
        return keymap[k]
    # pevné pořadí znaků, ať se soubor zbytečně nemění
    for m in MATS:
        for i in range(5):
            ch(m, i)
    spr = {}
    for fn in ITEMS:
        c = Canvas()
        fn(c)
        c.outline()
        spr[fn.__name__] = [''.join('.' if p is None else ch(*p) for p in row) for row in c.px]
    mats = {m: [keymap[(m, i)] for i in range(5)] for m in MATS}
    return pal, spr, mats


def write_js(pal, spr, mats, path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('/* VYGENEROVÁNO skriptem tools/draw_sprites.py – needitovat ručně. */\n')
        f.write('window.MC_SPRITE_ART = ')
        f.write(json.dumps({'pal': pal, 'mats': mats, 'spr': spr}, ensure_ascii=False, indent=1))
        f.write(';\n')


def preview(pal, spr, path, scale=4):
    ids = list(spr)
    cols = 6
    cell = (W + 4) * scale
    rows = (len(ids) + cols - 1) // cols
    img = [[(35, 32, 58)] * (cols * cell) for _ in range(rows * cell)]
    for n, k in enumerate(ids):
        ox, oy = (n % cols) * cell + 2 * scale, (n // cols) * cell + 2 * scale
        for y, r in enumerate(spr[k]):
            for x, c in enumerate(r):
                if c == '.':
                    continue
                hx = pal[c].lstrip('#')
                col = tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))
                for yy in range(scale):
                    for xx in range(scale):
                        img[oy + y * scale + yy][ox + x * scale + xx] = col
    raw = b''.join(b'\0' + bytes(v for p in row for v in p) for row in img)
    chunk = lambda t, b: struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', len(img[0]), len(img), 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pal, spr, mats = build()
    write_js(pal, spr, mats, os.path.join(root, 'js', 'sprite-art.js'))
    if '--preview' in sys.argv:
        preview(pal, spr, sys.argv[sys.argv.index('--preview') + 1])
    print(f'{len(spr)} spritů → js/sprite-art.js')
