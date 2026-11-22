#!/usr/bin/env python3
"""Render the animated SVG cards for the GitHub profile README.

Reads data/activity.json (written by fetch_activity.py) and data/portrait.txt,
writes cards/*.svg. Standard library only.

Every card uses only what GitHub keeps inside an <img>-loaded SVG:
an internal <style> block (CSS keyframes), SMIL (<animate>, <set>),
and fonts embedded as base64 data URIs. No scripts, no external requests.

STATIC=1 renders the end state (no motion), for screenshots.
"""
import base64, datetime as dt, json, os, re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards"
STATIC = os.environ.get("STATIC") == "1"

# ---- edit these -------------------------------------------------------------
NAME = ("Rahul", "Kumar.")
LOGIN = "EAGLERK"
TAGLINE = ("I build things you can", "walk through, talk to & scroll.")
FEATURED = [
    # repo, title, tag, two description lines, stack, accent
    ("Day_One", "HireTown", "3D WEB · JOBS",
     ("Walk a bright 3D town, meet recruiters outside", "their offices and apply on the spot."),
     ("Three.js", "Supabase", "Vite"), "blue"),
    ("MyMoney", "MyMoney", "FINANCE · VOICE",
     ("A personal finance planner with Mitra, a voice", "assistant. Runs on web, Android and iOS."),
     ("React", "Three.js", "Supabase", "Capacitor"), "red"),
    ("dhun-disc-library", "Dhun Disc Library", "MUSIC · DATA",
     ("Real albums with 30-second previews. A GitHub", "Action rebuilds the catalog every month."),
     ("HTML", "iTunes API", "Actions"), "yellow"),
    ("school-of-athens", "School of Athens", "ART · WEBGL",
     ("Raphael's fresco and David's Socrates, told as", "one continuous scroll film."),
     ("Three.js", "WebGL", "esbuild"), "ink"),
]
# -----------------------------------------------------------------------------

C = dict(paper="#F5F1E8", ink="#17150F", muted="#6E685C", line="#DED8CA",
         blue="#2D5BE3", red="#E04A2F", yellow="#F3B805", yellow_text="#8A6A00")
ACCENT_TEXT = dict(blue=C["blue"], red=C["red"], yellow=C["yellow_text"], ink=C["ink"])
ACCENT_FILL = dict(blue=C["blue"], red=C["red"], yellow=C["yellow"], ink=C["ink"])

FONTS = {"IS": "InstrumentSerif", "G": "Geist-Regular", "GM": "GeistMono", "GB": "Geist-Medium"}


def font_css(*keys):
    out = []
    for k in keys:
        b64 = base64.b64encode((ROOT / "fonts" / f"{FONTS[k]}.woff2").read_bytes()).decode()
        out.append(f"@font-face{{font-family:{k};src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
    return "".join(out)


BASE_CSS = """
.s{font-family:IS,Georgia,'Times New Roman',serif}
.g{font-family:G,'Helvetica Neue',Arial,sans-serif}
.gb{font-family:GB,G,'Helvetica Neue',Arial,sans-serif}
.m{font-family:GM,ui-monospace,Menlo,Consolas,monospace}
.a{animation-duration:.8s;animation-timing-function:cubic-bezier(.2,.8,.2,1);animation-fill-mode:both;transform-box:fill-box}
.static{display:none}
@keyframes rise{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes pop{0%{opacity:0;transform:scale(0)}65%{opacity:1;transform:scale(1.3)}100%{opacity:1;transform:scale(1)}}
@keyframes swing{0%{opacity:0;transform:translateY(70px) rotate(-6deg)}55%{opacity:1;transform:translateY(-10px) rotate(1.6deg)}78%{transform:translateY(4px) rotate(-.5deg)}100%{opacity:1;transform:none}}
"""
NO_MOTION = ".a{animation:none!important}.anim{display:none!important}.static{display:inline!important}"


def merge_classes(body):
    """anim() adds class="a"; fold it into an element's existing class attribute."""
    return re.sub(r'(<\w+[^>]*?) class="([^"]*)"([^>]*?) class="([^"]*)"',
                  lambda m: f'{m[1]} class="{m[2]} {m[4]}"{m[3]}', body)


def svg(w, h, body, fonts, extra_css="", label=""):
    body = merge_classes(body)
    motion = NO_MOTION if STATIC else f"@media (prefers-reduced-motion:reduce){{{NO_MOTION}}}"
    css = font_css(*fonts) + BASE_CSS + extra_css + motion
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-label="{escape(label)}"><title>{escape(label)}</title>'
            f'<style>{css}</style>{body}</svg>\n')


def anim(name, delay, dur=None, origin=None):
    s = f"animation-name:{name};animation-delay:{delay:.3f}s"
    if dur:
        s += f";animation-duration:{dur}s"
    if origin:
        s += f";transform-origin:{origin}"
    return f'class="a" style="{s}"'


def countup(x, y, value, attrs, begin, dur=1.0, frames=18, suffix=""):
    """Number that counts up via 18 SMIL <set> frames (CSS can't change text)."""
    parts = ['<g class="anim">']
    for i in range(frames):
        t = i / (frames - 1)
        v = round(value * (1 - (1 - t) ** 3))
        b = begin + dur * t
        end = "" if i == frames - 1 else f' end="{begin + dur * (i + 1) / (frames - 1):.3f}s"'
        fill = ' fill="freeze"' if i == frames - 1 else ""
        parts.append(f'<text x="{x}" y="{y}" {attrs} visibility="hidden">{v:,}{suffix}'
                     f'<set attributeName="visibility" to="visible" begin="{b:.3f}s"{end}{fill}/></text>')
    parts.append(f'</g><text class="static" x="{x}" y="{y}" {attrs}>{value:,}{suffix}</text>')
    return "".join(parts)


def frame(w, h, r=20, fill=None, stroke=True):
    s = f' stroke="{C["line"]}" stroke-width="1.5"' if stroke else ""
    return f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="{r}" fill="{fill or C["paper"]}"{s}/>'


# ---- data -------------------------------------------------------------------

def load():
    data = json.loads((ROOT / "data" / "activity.json").read_text())
    today = dt.date.fromisoformat(data["generated"])
    days = {dt.date.fromisoformat(k): v for k, v in data["days"].items()}
    year = {d: v for d, v in days.items() if (today - d).days < 365}
    active = sorted(year)
    best, run, prev = 0, 0, None
    for d in active:
        run = run + 1 if prev and (d - prev).days == 1 else 1
        best, prev = max(best, run), d
    busiest = max(year.items(), key=lambda kv: (kv[1], kv[0])) if year else (today, 0)
    return dict(today=today, days=days, total=sum(year.values()), streak=best,
                busiest=busiest, first=active[0] if active else today, repos=data.get("repos", {}))


def fmt_day(d, year=False):
    return f"{d.strftime('%b')} {d.day}" + (f", {d.year}" if year else "")


# ---- cards ------------------------------------------------------------------

def hero(D):
    W, H = 1200, 470
    b = [frame(W, H)]
    b.append(f'<text x="56" y="70" class="m" font-size="15" letter-spacing="2.5" fill="{C["muted"]}" '
             f'{anim("rise", .05)}>@{LOGIN}  ·  BUILDER  ·  {D["today"].year}</text>')
    for i, line in enumerate(NAME):
        b.append(f'<text x="50" y="{186 + i*108}" class="s" font-size="124" fill="{C["ink"]}" '
                 f'{anim("rise", .15 + i*.18, .9)}>{escape(line)}</text>')
    t1, t2 = TAGLINE
    b.append(f'<text x="56" y="366" class="s" font-size="32" fill="{C["muted"]}" {anim("rise", .6)}>{escape(t1)}</text>')
    # line 2 with a shine sweep: SVG has no background-clip:text, so overlay a copy
    # filled with a gradient whose gradientTransform is animated by SMIL.
    b.append(f'<g {anim("rise", .75)}>'
             f'<text x="56" y="406" class="s" font-size="32" fill="{C["ink"]}">{escape(t2)}</text>'
             f'<text x="56" y="406" class="s anim" font-size="32" fill="url(#shine)">{escape(t2)}</text></g>')
    b.append(f'<text x="56" y="440" class="m" font-size="13" letter-spacing="1.5" fill="{C["muted"]}" {anim("fade", 1.1)}>'
             + "  ·  ".join(escape(f[1]).upper() for f in FEATURED) + "</text>")
    # ASCII School of Athens, rows fade in 18 ms apart
    rows = (ROOT / "data" / "portrait.txt").read_text().rstrip("\n").split("\n")
    cols = max(len(r) for r in rows)
    x0, y0, aw = 646, 46, 512
    cw = aw / cols
    fs = cw / 0.6
    b.append(f'<g class="m" font-size="{fs:.2f}" fill="{C["ink"]}" xml:space="preserve">')
    for i, r in enumerate(rows):
        if r.strip():
            b.append(f'<text x="{x0}" y="{y0 + (i+1)*fs:.1f}" textLength="{len(r)*cw:.1f}" lengthAdjust="spacing" '
                     f'{anim("fade", .25 + i*.018, .5)}>{escape(r)}</text>')
    b.append("</g>")
    yc = y0 + len(rows) * fs + 22
    b.append(f'<text x="{x0 + aw}" y="{yc:.0f}" text-anchor="end" class="m" font-size="12" fill="{C["muted"]}" '
             f'{anim("fade", 1.5)}>THE SCHOOL OF ATHENS · RAPHAEL, 1509-11 · IN ASCII</text>')
    defs = (f'<defs><linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="56" y1="0" x2="556" y2="0">'
            f'<stop offset="0" stop-color="{C["blue"]}" stop-opacity="0"/>'
            f'<stop offset=".42" stop-color="{C["blue"]}" stop-opacity="0"/>'
            f'<stop offset=".5" stop-color="{C["blue"]}" stop-opacity="1"/>'
            f'<stop offset=".58" stop-color="{C["blue"]}" stop-opacity="0"/>'
            f'<stop offset="1" stop-color="{C["blue"]}" stop-opacity="0"/>'
            f'<animateTransform attributeName="gradientTransform" type="translate" '
            f'values="-560 0;560 0;560 0" keyTimes="0;.45;1" dur="5s" begin="1.4s" repeatCount="indefinite"/>'
            f'</linearGradient></defs>')
    return svg(W, H, defs + "".join(b), ("IS", "GM"),
               label=f"{' '.join(NAME)} — {t1} {t2}")


def tile_glyph(label, D, fg, d0):
    """Small motif in the tile's empty right half."""
    g = []
    if label == "BUILD":  # last 14 days as mini bars
        vals = [D["days"].get(D["today"] - dt.timedelta(days=13 - i), 0) for i in range(14)]
        pk = max(vals) or 1
        for i, v in enumerate(vals):
            h = max(3, 92 * v / pk)
            g.append(f'<rect x="{262 + i*9}" y="{168-h:.1f}" width="6" height="{h:.1f}" rx="2" fill="{fg}" '
                     f'opacity="{.95 if v else .35}" {anim("grow", d0 + i*.04, .5, "50% 100%")}/>')
    elif label == "SHIP":  # one block per product
        for i in range(len(FEATURED)):
            x, y = 286 + (i % 2) * 46, 76 + (i // 2) * 46
            g.append(f'<rect x="{x}" y="{y}" width="38" height="38" rx="9" fill="{fg}" opacity="{1 - i*.18:.2f}" '
                     f'{anim("pop", d0 + i*.12, .5, "50% 50%")}/>')
    else:  # streak as a row of dots, a week per row
        n = max(D["streak"], 1)
        for i in range(max(7, n)):
            x, y = 270 + (i % 7) * 18, 92 + (i // 7) * 18
            on = i < n
            g.append(f'<circle cx="{x}" cy="{y}" r="6" fill="{fg if on else "none"}" stroke="{fg}" stroke-width="1.5" '
                     f'{anim("pop", d0 + i*.07, .4, "50% 50%")}/>')
    return "".join(g)


def tiles(D):
    bd, bn = D["busiest"]
    specs = [
        ("tile-build", "BUILD", D["total"], "commits in the last", "12 months", "→ ALL REPOSITORIES", "blue"),
        ("tile-ship", "SHIP", len(FEATURED), "products built and", "open on GitHub", "→ SEE THEM BELOW", "red"),
        ("tile-streak", "STREAK", D["streak"], "days in a row, my", "best run this year",
         f"BUSIEST: {fmt_day(bd).upper()} · {bn} COMMITS", "yellow"),
    ]
    out = {}
    for i, (fname, label, num, c1, c2, foot, acc) in enumerate(specs):
        W, H, P = 420, 290, 12
        bg = ACCENT_FILL[acc]
        fg = C["ink"] if acc == "yellow" else C["paper"]
        d0 = 1.9 + i * .15
        g = [f'<g {anim("swing", d0, 1.0, "0% 100%")}>',
             f'<rect x="{P}" y="{P}" width="{W-2*P}" height="{H-2*P}" rx="18" fill="{bg}"/>',
             f'<circle cx="{P+34}" cy="{P+38}" r="6" fill="{fg}"/>',
             f'<text x="{P+50}" y="{P+44}" class="m" font-size="17" letter-spacing="3" fill="{fg}">{label}</text>',
             countup(P + 26, P + 158, num, f'class="s" font-size="118" fill="{fg}"', d0 + .35),
             f'<text x="{P+30}" y="{P+196}" class="g" font-size="19" fill="{fg}" opacity=".92">{escape(c1)}</text>',
             f'<text x="{P+30}" y="{P+220}" class="g" font-size="19" fill="{fg}" opacity=".92">{escape(c2)}</text>',
             f'<text x="{P+30}" y="{H-P-22}" class="m" font-size="13" letter-spacing="1.5" fill="{fg}" opacity=".8">{escape(foot)}</text>',
             tile_glyph(label, D, fg, d0 + .4), "</g>"]
        out[fname] = svg(W, H, "".join(g), ("IS", "G", "GM"), label=f"{label}: {num} {c1} {c2}")
    return out


def activity(D):
    W, H = 1200, 400
    today, days = D["today"], D["days"]
    months_active = {(d.year, d.month) for d in days if (today - d).days < 365}
    if len(months_active) >= 6:
        mode, buckets = "monthly", []
        y, m = today.year, today.month
        for _ in range(12):
            buckets.append((dt.date(y, m, 1).strftime("%b").upper(),
                            sum(v for d, v in days.items() if d.year == y and d.month == m)))
            y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        buckets.reverse()
        title, sub = "The last 12 months", "COMMITS PER MONTH · ALL MY REPOS"
    else:
        mode = "daily"
        span = [today - dt.timedelta(days=29 - i) for i in range(30)]
        buckets = [(fmt_day(d).upper(), days.get(d, 0)) for d in span]
        title, sub = "The last 30 days", "COMMITS PER DAY · ALL MY REPOS"
    total = sum(v for _, v in buckets)
    peak = max((v for _, v in buckets), default=0) or 1
    best_i = max(range(len(buckets)), key=lambda i: (buckets[i][1], i))
    b = [frame(W, H),
         f'<text x="56" y="84" class="s" font-size="46" fill="{C["ink"]}" {anim("rise", 1.2)}>{title}</text>',
         f'<text x="58" y="116" class="m" font-size="14" letter-spacing="2" fill="{C["muted"]}" {anim("rise", 1.3)}>{sub}</text>',
         f'<text x="{W-56}" y="62" text-anchor="end" class="m" font-size="14" letter-spacing="2" fill="{C["muted"]}" {anim("fade", 1.3)}>TOTAL</text>',
         countup(W - 56, 112, total, f'class="s" font-size="56" fill="{C["ink"]}" text-anchor="end"', 1.4)]
    x0, x1, base, top = 56, W - 56, 340, 160
    n = len(buckets)
    slot = (x1 - x0) / n
    bw = slot * (0.62 if mode == "daily" else 0.56)
    b.append(f'<line x1="{x0}" y1="{base}" x2="{x1}" y2="{base}" stroke="{C["line"]}" stroke-width="1.5"/>')
    for i, (lab, v) in enumerate(buckets):
        x = x0 + i * slot + (slot - bw) / 2
        h = max(3, (base - top) * v / peak) if v else 3
        col = C["blue"] if i == best_i and v else (C["ink"] if v else C["line"])
        b.append(f'<rect x="{x:.1f}" y="{base-h:.1f}" width="{bw:.1f}" height="{h:.1f}" rx="3" fill="{col}" '
                 f'{anim("grow", 1.5 + i*.03, .7, "50% 100%")}/>')
        if mode == "monthly" or i % 5 == 4 or i == n - 1:
            b.append(f'<text x="{x + bw/2:.1f}" y="{base+28}" text-anchor="middle" class="m" font-size="12" '
                     f'fill="{C["muted"]}">{lab}</text>')
    bl, bv = buckets[best_i]
    if bv:
        x = x0 + best_i * slot + slot / 2
        y = base - (base - top) * bv / peak - 14
        b.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" class="s" font-size="30" fill="{C["blue"]}" '
                 f'{anim("pop", 1.5 + n*.03 + .5, .6, "50% 100%")}>{bv}</text>')
    return svg(W, H, "".join(b), ("IS", "GM"), label=f"{title}: {total} commits, best {bl.title()} with {bv}")


def heatmap(D):
    W, H = 1200, 330
    today, days = D["today"], D["days"]
    end = today + dt.timedelta(days=(5 - today.weekday()) % 7)  # Saturday of this week
    start = end - dt.timedelta(days=53 * 7 - 1)                 # a Sunday
    cell, gap = 17, 3.4
    x0, y0 = 70, 120
    peak = max([v for d, v in days.items() if d >= start] or [1])
    ramp = [C["line"], "#C3D0F6", "#8EA8EF", "#5A80E9", C["blue"]]
    b = [frame(W, H),
         f'<text x="56" y="70" class="s" font-size="40" fill="{C["ink"]}" {anim("rise", .9)}>'
         f'{D["total"]} commits in the last year</text>',
         f'<text x="{W-56}" y="70" text-anchor="end" class="m" font-size="13" letter-spacing="2" fill="{C["muted"]}" '
         f'{anim("fade", 1.0)}>SINCE {fmt_day(D["first"], True).upper()}  ·  UPDATED {fmt_day(today).upper()}</text>']
    for r, lab in ((1, "MON"), (3, "WED"), (5, "FRI")):
        b.append(f'<text x="{x0-12}" y="{y0 + r*(cell+gap) + 13}" text-anchor="end" class="m" font-size="11" fill="{C["muted"]}">{lab}</text>')
    last_month = None
    for w in range(53):
        wk = start + dt.timedelta(weeks=w)
        if wk.month != last_month and w < 51:
            b.append(f'<text x="{x0 + w*(cell+gap)}" y="{y0-12}" class="m" font-size="11" fill="{C["muted"]}">{wk.strftime("%b").upper()}</text>')
            last_month = wk.month
        for r in range(7):
            d = wk + dt.timedelta(days=r)
            if d > today:
                continue
            v = days.get(d, 0)
            lvl = 0 if not v else min(4, 1 + int(3 * v / peak + .5))
            b.append(f'<rect x="{x0 + w*(cell+gap):.1f}" y="{y0 + r*(cell+gap):.1f}" width="{cell}" height="{cell}" rx="4" '
                     f'fill="{ramp[lvl]}" {anim("pop", 1.0 + w*.022 + r*.01, .45, "50% 50%")}/>')
    lx = W - 56 - 5 * (cell + gap) - 70
    ly = y0 + 7 * (cell + gap) + 22
    b.append(f'<text x="{lx-8}" y="{ly+13}" text-anchor="end" class="m" font-size="11" fill="{C["muted"]}">LESS</text>')
    for i, c in enumerate(ramp):
        b.append(f'<rect x="{lx + i*(cell+gap):.1f}" y="{ly}" width="{cell}" height="{cell}" rx="4" fill="{c}"/>')
    b.append(f'<text x="{lx + 5*(cell+gap) + 4:.1f}" y="{ly+13}" class="m" font-size="11" fill="{C["muted"]}">MORE</text>')
    b.append(f'<text x="56" y="{ly+13}" class="m" font-size="11" fill="{C["muted"]}">COMMITS ACROSS ALL MY PUBLIC REPOS</text>')
    return svg(W, H, "".join(b), ("IS", "GM"), label=f"Commit graph: {D['total']} commits in the last year")


def repo_cards(D):
    out = {}
    for i, (repo, title, tag, desc, stack, acc) in enumerate(FEATURED):
        W, H = 600, 310
        info = D["repos"].get(repo, {})
        n = info.get("commits", 0)
        last = info.get("last")
        foot = f"{n} COMMITS" + (f"  ·  UPDATED {fmt_day(dt.date.fromisoformat(last)).upper()}" if last else "")
        d0 = 2.5 + (i // 2) * .25 + (i % 2) * .12
        b = [f'<g {anim("rise", d0, .9)}>', frame(W, H),
             f'<rect x="1" y="26" width="7" height="{H-52}" rx="3.5" fill="{ACCENT_FILL[acc]}"/>',
             f'<text x="44" y="62" class="m" font-size="14" letter-spacing="2.5" fill="{ACCENT_TEXT[acc]}">'
             f'{i+1:02d}  ·  {escape(tag)}</text>',
             f'<text x="{W-44}" y="64" text-anchor="end" class="m" font-size="22" fill="{C["muted"]}">↗</text>',
             f'<text x="40" y="128" class="s" font-size="58" fill="{C["ink"]}">{escape(title)}</text>']
        for j, line in enumerate(desc):
            b.append(f'<text x="44" y="{170 + j*27}" class="g" font-size="19" fill="{C["muted"]}">{escape(line)}</text>')
        x = 44
        for s in stack:
            w = len(s) * 8.4 + 26
            b.append(f'<rect x="{x}" y="226" width="{w:.0f}" height="30" rx="15" fill="none" stroke="{C["line"]}" stroke-width="1.5"/>'
                     f'<text x="{x + w/2:.0f}" y="246" text-anchor="middle" class="m" font-size="14" fill="{C["ink"]}">{escape(s)}</text>')
            x += w + 10
        b.append(f'<text x="44" y="{H-22}" class="m" font-size="12" letter-spacing="1.5" fill="{C["muted"]}">{foot}</text></g>')
        out[f"repo-{repo.lower()}"] = svg(W, H, "".join(b), ("IS", "G", "GM"),
                                          label=f"{title}: {' '.join(desc)}")
    return out


def main():
    D = load()
    CARDS.mkdir(exist_ok=True)
    files = {"hero": hero(D), "heatmap": heatmap(D), "activity": activity(D), **tiles(D), **repo_cards(D)}
    for name, content in files.items():
        (CARDS / f"{name}.svg").write_text(content)
    print(f"rendered {len(files)} cards · {D['total']} commits · streak {D['streak']}" + (" · STATIC" if STATIC else ""))


if __name__ == "__main__":
    main()
