"""Generates the AgroRende brand SVGs and the web BrandLogo component.

The mark is "Cabeceira" (headland): two furrows converge on the horizon and form a
capital A; the headland row across them is the crossbar, and on that row sits a node, a
white ring around a Terra core, the same circle the product uses for a field report on
the map: the place a technician reports from and the office watches live. docs/brand/LOGO.md explains the concept and the construction.

Everything is plain geometry computed here, and the lettering is Geist Sans SemiBold
converted to outlines with the font's own kerning, so no font is needed to render the
logo and the output is identical on every run. Run from the repository root:

    python3 -m venv .data/brandenv && .data/brandenv/bin/pip install fonttools brotli
    .data/brandenv/bin/python packages/design-tokens/brand/generate.py
    pnpm --filter landing brand
"""
import math
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# Campo claro palette (docs/ARCHITECTURE.md section 3.7).
MATA6 = "#2B8A3E"
TERRA = "#E8590C"
G900 = "#1C1F23"
WHITE = "#FFFFFF"

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "packages/design-tokens/brand")


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


# ---------------------------------------------------------------------------
# Mark geometry. Master grid: 64 x 64 units, 4-unit module (one pixel at 16 px).
# ---------------------------------------------------------------------------
class Geometry:
    """An A of two furrows that converge on the horizon, a headland crossbar and a node.

    The outer edges of the furrows run from the feet to a short flat apex; the inner
    edges run to the counter apex, so each furrow narrows as it recedes. The node sits on
    the crossbar at the centre line: a white ring around a Terra core.
    """

    def __init__(self, cx, apex, flat, counter, base, outer, inner, bar, ring, core, round_=0.0):
        self.cx = cx
        self.apex = apex  # y of the flat apex
        self.flat = flat  # half width of the flat apex
        self.counter = counter  # y of the apex of the counter (the inner triangle)
        self.base = base  # baseline of both furrows
        self.outer = outer  # x of the outer foot of the left furrow
        self.inner = inner  # x of the inner foot of the left furrow
        self.bar = bar  # (top, bottom) of the headland crossbar
        self.ring = ring  # outer radius of the node ring
        self.core = core  # radius of the node core
        self.round = round_  # corner rounding, drawn as a same-colour round-join stroke

    @property
    def node(self):
        return self.cx, sum(self.bar) / 2

    def inner_x(self, y):
        return self.inner + (self.cx - self.inner) * (self.base - y) / (self.base - self.counter)

    def m(self, x):
        return 2 * self.cx - x

    def letter(self):
        c, b = self.cx, self.base
        pts = [(self.outer, b), (c - self.flat, self.apex), (c + self.flat, self.apex), (self.m(self.outer), b),
               (self.m(self.inner), b), (c, self.counter), (self.inner, b)]
        t, u = self.bar
        lt, lu = self.inner_x(t), self.inner_x(u)
        bar = [(lt, t), (self.m(lt), t), (self.m(lu), u), (lu, u)]
        path = lambda ps: "M" + "L".join(f"{f(x)} {f(y)}" for x, y in ps) + "Z"
        return path(pts) + path(bar)

    def disc(self, r, ccw=False):
        x, y = self.node
        s = 1 if ccw else 0
        return f"M{f(x - r)} {f(y)}A{f(r)} {f(r)} 0 1 {s} {f(x + r)} {f(y)}A{f(r)} {f(r)} 0 1 {s} {f(x - r)} {f(y)}Z"


MASTER = Geometry(cx=32, apex=9, flat=2, counter=16, base=53, outer=10, inner=18, bar=(39.5, 44), ring=6, core=3.5, round_=2)
# The 16 px favicon is hinted on its own 16-unit grid: apex, crossbar and baseline fall on
# whole pixels, and the furrows and the node are a little heavier than the scaled master.
FAVICON = Geometry(cx=8, apex=2, flat=0.75, counter=5.5, base=14, outer=1.5, inner=4.75, bar=(10, 11.5), ring=2.25, core=1.2)


def glyph(g, fg=WHITE, core=TERRA):
    """The coloured glyph: white A and node ring, Terra core."""
    s = f' stroke="{fg}" stroke-width="{f(g.round)}" stroke-linejoin="round"' if g.round else ""
    x, y = g.node
    return (f'<path fill="{fg}"{s} d="{g.letter()}"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(g.ring)}" fill="{fg}"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(g.core)}" fill="{core}"/>')


def glyph_mono(g, color="currentColor"):
    """One-colour glyph: the core becomes a hole in the node."""
    s = f' stroke="{color}" stroke-width="{f(g.round)}" stroke-linejoin="round"' if g.round else ""
    return (f'<path fill="{color}"{s} d="{g.letter()}"/>'
            f'<path fill="{color}" fill-rule="evenodd" d="{g.disc(g.ring)}{g.disc(g.core, ccw=True)}"/>')


TILE_RX = 14


def tile(size=64, rx=TILE_RX, fill=MATA6):
    return f'<rect width="{size}" height="{size}" rx="{f(rx)}" fill="{fill}"/>'


def svg(view, body, w=None, h=None, label=True):
    vw, vh = view
    w = w or vw
    h = h or vh
    aria = ' role="img" aria-label="AgroRende"' if label else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(vw)} {f(vh)}" width="{f(w)}" height="{f(h)}"{aria}>{body}</svg>\n'


def scaled(body, k, cx=32, cy=32, tx=32, ty=32):
    return f'<g transform="translate({f(tx)} {f(ty)}) scale({f(k)}) translate({f(-cx)} {f(-cy)})">{body}</g>'


# Centre of the master glyph's bounding box, used to centre it on the mobile canvases.
GLYPH_BOX = (MASTER.apex - MASTER.round / 2, MASTER.base + MASTER.round / 2)
GLYPH_CY = sum(GLYPH_BOX) / 2

# ---------------------------------------------------------------------------
# Wordmark: Geist Sans SemiBold, outlined, with the font's own pair kerning.
# ---------------------------------------------------------------------------
font = TTFont(os.path.join(ROOT, "apps/landing/src/fonts/Geist-Variable-latin.woff2"))
font = instantiateVariableFont(font, {"wght": 600})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight
hmtx = font["hmtx"]


def _class_of(class_def, glyph):
    return class_def.classDefs.get(glyph, 0) if class_def else 0


def kern(left, right):
    gpos = font["GPOS"].table
    lookups = set()
    for rec in gpos.FeatureList.FeatureRecord:
        if rec.FeatureTag == "kern":
            lookups.update(rec.Feature.LookupListIndex)
    for i in sorted(lookups):
        lookup = gpos.LookupList.Lookup[i]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if getattr(sub, "LookupType", 2) != 2 or left not in sub.Coverage.glyphs:
                continue
            if sub.Format == 1:
                idx = sub.Coverage.glyphs.index(left)
                for rec in sub.PairSet[idx].PairValueRecord:
                    if rec.SecondGlyph == right:
                        return getattr(rec.Value1, "XAdvance", 0) or 0
            elif sub.Format == 2:
                c1 = _class_of(sub.ClassDef1, left)
                c2 = _class_of(sub.ClassDef2, right)
                rec = sub.Class1Record[c1].Class2Record[c2]
                v = getattr(rec.Value1, "XAdvance", 0) or 0
                if v:
                    return v
    return 0


WORD = "AgroRende"
TRACK = -0.012  # em; SemiBold at display size wants a little less air than text


def wordmark(size, x0, baseline):
    s = size / UPM
    x = x0
    out = []
    names = [cmap[ord(ch)] for ch in WORD]
    for i, g in enumerate(names):
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        out.append(pen.getCommands())
        x += hmtx[g][0] * s + TRACK * size
        if i + 1 < len(names):
            x += kern(g, names[i + 1]) * s
    return "".join(out), x


# Lockup: the cap height is 7/16 of the tile and is centred on the glyph's optical
# centre; the space between tile and lettering is 16 units (a quarter of the tile).
WORD_SIZE = 28 / (CAP / UPM)
WORD_BASELINE = GLYPH_CY + 14
WORD_X = 64 + 16
WORD_PATH, WORD_END = wordmark(WORD_SIZE, WORD_X, WORD_BASELINE)
LOGO_W = math.ceil(WORD_END + 1)


def lockup(text_fill):
    return svg((LOGO_W, 64), tile() + glyph(MASTER) + f'<path fill="{text_fill}" d="{WORD_PATH}"/>')


def write(name, content):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(content)


write("agrorende-mark.svg", svg((64, 64), tile() + glyph(MASTER)))
write("agrorende-mark-mono.svg", svg((64, 64), glyph_mono(MASTER)))
write("agrorende-mark-reversed.svg", svg((64, 64),
      f'<mask id="m"><rect width="64" height="64" fill="#fff"/>{glyph_mono(MASTER, "#000")}</mask>'
      f'<rect width="64" height="64" rx="{TILE_RX}" fill="currentColor" mask="url(#m)"/>'))
write("agrorende-favicon.svg", svg((16, 16), tile(16, 3.5) + glyph(FAVICON), 16, 16))
write("agrorende-logo.svg", lockup(G900))
write("agrorende-logo-dark.svg", lockup(WHITE))

# Mobile. iOS: full-bleed square, the system rounds the corners; the glyph keeps the same
# share of the tile as the master. Android adaptive icon: transparent foreground on the
# Mata background from app.config.ts; the glyph fits the 66 dp safe circle of the 108 dp
# canvas, with a margin. Splash: the tile mark, centred by expo-splash-screen.
write("app-icon.svg", svg((64, 64), f'<rect width="64" height="64" fill="{MATA6}"/>'
      + scaled(glyph(MASTER), 0.9, cy=GLYPH_CY), 1024, 1024, label=False))
SAFE = 66 / 108 * 64 * 0.94  # safe-circle diameter in master units, with a 6% margin
GLYPH_RADIUS = math.hypot(32 - (MASTER.outer - MASTER.round / 2), GLYPH_BOX[1] - GLYPH_CY)  # the feet are farthest out
write("adaptive-foreground.svg", svg((64, 64), scaled(glyph(MASTER), SAFE / 2 / GLYPH_RADIUS, cy=GLYPH_CY), 1024, 1024, label=False))
write("splash-icon.svg", svg((64, 64), tile() + glyph(MASTER), 1024, 1024, label=False))

# ---------------------------------------------------------------------------
# Admin web component.
# ---------------------------------------------------------------------------
tsx = f"""// Generated by packages/design-tokens/brand/generate.py. Do not edit by hand.
import {{ cn }} from "@/lib/cn";

const LETTER = "{MASTER.letter()}";
const WORDMARK = "{WORD_PATH}";

function Mark() {{
  return (
    <>
      <rect fill="{MATA6}" height="64" rx="{TILE_RX}" width="64" />
      <path d={{LETTER}} fill="{WHITE}" stroke="{WHITE}" strokeLinejoin="round" strokeWidth="{f(MASTER.round)}" />
      <circle cx="{f(MASTER.node[0])}" cy="{f(MASTER.node[1])}" fill="{WHITE}" r="{f(MASTER.ring)}" />
      <circle cx="{f(MASTER.node[0])}" cy="{f(MASTER.node[1])}" fill="{TERRA}" r="{f(MASTER.core)}" />
    </>
  );
}}

/{'*'}* The AgroRende symbol: two furrows forming an A, with a live report point on the headland row. Decorative by default. {'*'}/
export function BrandMark({{ className, title }}: {{ readonly className?: string; readonly title?: string }}) {{
  return (
    <svg aria-hidden={{title === undefined ? true : undefined}} aria-label={{title}} className={{cn("shrink-0", className)}} role={{title === undefined ? undefined : "img"}} viewBox="0 0 64 64">
      <Mark />
    </svg>
  );
}}

/{'*'}* Symbol and outlined "AgroRende" lettering; the lettering follows the theme text colour. {'*'}/
export function BrandLogo({{ className, title = "AgroRende" }}: {{ readonly className?: string; readonly title?: string }}) {{
  return (
    <svg aria-label={{title}} className={{cn("shrink-0", className)}} role="img" viewBox="0 0 {LOGO_W} 64">
      <Mark />
      <path d={{WORDMARK}} fill="var(--ar-text)" />
    </svg>
  );
}}
"""
with open(os.path.join(ROOT, "apps/web/src/components/brand/BrandLogo.tsx"), "w") as fh:
    fh.write(tsx)
print("logo width", LOGO_W, "word size", round(WORD_SIZE, 2), "baseline", WORD_BASELINE)
