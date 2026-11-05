#!/usr/bin/env python3
"""Jazz Jam test suite.

Setup (once):  pip install playwright && python3 -m playwright install chromium
               cd tests && npm install          # axe-core for the accessibility audit
Run:           python3 tests/run.py             # from the repo root
               python3 tests/run.py -k editor   # only tests whose name contains "editor"
               python3 tests/run.py --shots     # also save screenshots to tests/out/

Starts its own static server, runs headless Chromium, prints PASS/FAIL per test,
exits non-zero on any failure.
"""
import asyncio, re, functools, http.server, os, sys, threading, traceback
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
AXE = os.path.join(HERE, 'node_modules', 'axe-core', 'axe.min.js')
SHOTS = '--shots' in sys.argv
ONLY = sys.argv[sys.argv.index('-k') + 1] if '-k' in sys.argv else None

PHONE = dict(viewport=dict(width=390, height=844), has_touch=True, is_mobile=True)
LAND = dict(viewport=dict(width=844, height=390), has_touch=True, is_mobile=True)
LAPTOP = dict(viewport=dict(width=1280, height=800))

TESTS = []
def test(fn): TESTS.append(fn); return fn

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

class Ctx:
    def __init__(s, browser, url): s.browser, s.url = browser, url
    async def page(s, dev=PHONE, storage=None, scheme='dark'):
        c = await s.browser.new_context(**dev, color_scheme=scheme, service_workers='block')
        pg = await c.new_page()
        pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and pg.errors.append(m.text))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        if storage:
            await pg.add_init_script('(()=>{const s=%s;for(const k in s)localStorage.setItem("jj_"+k,JSON.stringify(s[k]));})()' % __import__('json').dumps(storage))
        await pg.goto(s.url)
        await pg.wait_for_function('document.querySelector("#grid .cell")')
        await pg.wait_for_timeout(200)
        return pg
    async def shot(s, pg, name):
        if SHOTS:
            os.makedirs(OUT, exist_ok=True)
            await pg.screenshot(path=os.path.join(OUT, name + '.png'))

def ok(cond, msg):
    if not cond: raise AssertionError(msg)

async def ev(pg, js): return await pg.evaluate(js)
def chip(pg, group, text): return pg.locator(f'#{group} .chip').filter(has_text=re.compile('^' + re.escape(text) + '$'))
async def chart(pg): return await ev(pg, 'S.chart')
BLUES = '| F7 | Bb7 | F7 | Cm7 F7 |\n| Bb7 | Bdim7 | F7 | D7 |\n| Gm7 | C7 | F7 D7 | Gm7 C7 |'

# ---------------- music engine ----------------
@test
async def engine_parse_and_labels(c):
    pg = await c.page()
    r = await ev(pg, '''(()=>{const p=parseChart("[A] C7 | % | F7 / G7 | / |\\n[B] Am7 D7 | G",4);
      return {n:p.bars.length,labels:p.labels,src:p.src,err:p.errors,beats:p.beats,
        b2:p.bars[1].map(x=>x.t),b4:p.bars[3].map(x=>x.t)}})()''')
    ok(r['n'] == 6 and r['beats'] == 24, r)
    ok(r['labels'] == ['A', None, None, None, 'B', None], r['labels'])
    ok(r['err'] == [], r['err'])
    ok(r['b2'] == [], 'a %% bar that only holds the chord is blank: %r' % r['b2'])
    r2 = await ev(pg, 'parseChart("| Dm7 G7 | % |",4).bars[1].map(x=>x.t)')
    ok(r2 == ['Dm7', 'G7'], 'a %% bar with chord changes spells them out: %r' % r2)

@test
async def engine_chord_codec_roundtrip(c):
    pg = await c.page()
    bad = await ev(pg, '''(()=>{const L=["C","Cm","C7","Cmaj7","C6","C69","Cm7","Cm6","Cm69","Cm(maj7)","Cm7b5","Cdim7",
      "C7sus4","C9sus4","C7alt","C9","C13","C7b9","C7#9","C7#11","C13b9","C7b9b13","Cmaj9","Cmaj7#11","Cm9","Cm11","C7/E","Bb7/Ab","F#m7b5","Ebmaj7"];
      return L.filter(t=>{const p=chordParts(t);return !p||chordFromParts(p)!==t;})})()''')
    ok(bad == [], 'codec mangles: %r' % bad)

@test
async def engine_loop_pads_to_16(c):
    pg = await c.page()
    r = await ev(pg, '(()=>{const s=sliceSong(chartSong,4,5);return [s.bars.length,s.loopLen,s.offset]})()')
    ok(r == [16, 2, 4], r)

@test
async def engine_all_styles_schedule(c):
    pg = await c.page()
    for st in ['swing', 'ballad', 'waltz', 'bossa', 'samba']:
        await ev(pg, f'setStyle("{st}")')
        await pg.click('#play'); await pg.wait_for_timeout(900)
        ok(await ev(pg, 'P.playing'), st + ' did not start')
        await pg.click('#play')
    ok(not pg.errors, pg.errors)

@test
async def versions_in_step(c):
    # every local script/stylesheet carries the same ?v=, and it matches the service-worker cache name,
    # so a new page never runs with an old cached script
    html = open(os.path.join(ROOT, 'index.html')).read()
    vs = set(re.findall(r'(?:src|href)="(?:js|css|vendor)/[^"]+\?v=(\d+)"', html))
    bare = re.findall(r'(?:src|href)="((?:js|css|vendor)/[^"?]+)"', html)
    ok(not bare, f'unversioned files: {bare}')
    sw = re.search(r"jazzjam-v(\d+)", open(os.path.join(ROOT, 'sw.js')).read()).group(1)
    ok(vs == {sw}, f'index.html ?v={vs} but sw.js cache v{sw}')

# ---------------- main screen ----------------
@test
async def layout_three_sizes(c):
    for name, dev in [('phone', PHONE), ('landscape', LAND), ('laptop', LAPTOP)]:
        pg = await c.page(dev)
        await c.shot(pg, 'main-' + name)
        ok(not pg.errors, (name, pg.errors))
        no_hscroll = await ev(pg, 'document.documentElement.scrollWidth<=innerWidth')
        ok(no_hscroll, name + ': horizontal scroll')
        cls = await ev(pg, 'document.body.className')
        if name == 'laptop': ok('wide' in cls and await pg.is_visible('#panel'), 'laptop should show side panel')
        if name == 'landscape': ok('short' in cls and await pg.is_visible('.inlineNow'), 'landscape should use inline now-playing')
        if name == 'phone': ok(not await pg.is_visible('#panel'), 'phone should not show side panel')

@test
async def play_stop_label_and_now_playing(c):
    pg = await c.page(storage={'chart': BLUES, 'countIn': False})
    await pg.click('#play'); await pg.wait_for_timeout(1200)
    ok(await pg.text_content('#playLabel') == 'Stop', 'label not Stop')
    ok(await pg.text_content('#cur') in ('F7', 'B\u266d7'), await pg.text_content('#cur'))
    ok('Bar ' in await pg.text_content('#pos'), 'no position')
    ok(await pg.locator('#grid .cell.cur').count() == 1, 'no current bar highlight')
    await pg.keyboard.press('Space'); await pg.wait_for_timeout(100)
    ok(await pg.text_content('#playLabel') == 'Play', 'Space did not stop')
    ok(not pg.errors, pg.errors)

@test
async def loop_select_and_status_stays_one_line(c):
    pg = await c.page(storage={'chart': BLUES, 'countIn': False})
    await pg.click('#loopBtn')
    ok(await pg.is_visible('#loopHint'), 'no hint')
    await pg.locator('#grid .cell').nth(4).click()
    await pg.locator('#grid .cell').nth(5).click()
    ok(await ev(pg, 'S.loop') == {'a': 4, 'b': 5}, await ev(pg, 'S.loop'))
    ok(await pg.locator('#grid .cell.inloop').count() == 2, 'loop fill')
    ok(await pg.text_content('#loopChip') == 'Loop 5–6', await pg.text_content('#loopChip'))
    ok(await pg.get_attribute('#loopBtn', 'aria-pressed') == 'true', 'loop button pressed')
    h0 = await ev(pg, '$("now").offsetHeight')
    await pg.click('#play'); await pg.wait_for_timeout(1500)
    await c.shot(pg, 'loop-playing-phone')
    # the now-playing block must keep its height (nothing wraps onto a new line)
    h1 = await ev(pg, '$("now").offsetHeight')
    ok(h1 == h0, 'now-playing changed height %s -> %s' % (h0, h1))
    tops = await ev(pg, '[$("pos").getBoundingClientRect().top,$("loopChip").getBoundingClientRect().top]')
    ok(abs(tops[0] - tops[1]) < 6, 'loop chip not on the status line: %r' % tops)
    await pg.click('#loopBtn')
    ok(await ev(pg, 'S.loop') is None, 'loop not cleared')
    await pg.click('#play')

# ---------------- bar editor ----------------
@test
async def editor_picker_root_quality_ext_bass(c):
    pg = await c.page(storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(5).click()          # Bdim7
    ok(await pg.is_visible('#editor') and not await pg.is_visible('#kbArea'), 'editor should replace keyboard on phone')
    ok(await pg.locator('#grid .cell.sel').count() == 1, 'selected bar')
    await c.shot(pg, 'editor-phone')
    foot = await ev(pg, '$("edDelete").getBoundingClientRect().bottom<=innerHeight')
    ok(foot, 'editor footer buttons must be on screen')
    await chip(pg, 'edRoots', 'C').click()
    await chip(pg, 'edQuals', '7').click()  # "7" (index 0 is maj7)
    t = await ev(pg, 'splitChart(S.chart)[5].toks.join(" ")')
    ok(t == 'C7', 'root+quality gave %r' % t)
    await chip(pg, 'edExts', 'b9').click()
    await chip(pg, 'edExts', '13').click()
    t = await ev(pg, 'splitChart(S.chart)[5].toks.join(" ")')
    ok(t == 'C13b9', 'extensions gave %r' % t)
    # bass note
    await pg.locator('#edNoteMode sl-radio-button[value="bass"]').click()
    ok(await pg.text_content('#edNoteHead') == 'Bass note', 'heading')
    await chip(pg, 'edRoots', 'E').click()
    t = await ev(pg, 'splitChart(S.chart)[5].toks.join(" ")')
    ok(t == 'C13b9/E', 'bass gave %r' % t)
    await pg.click('#edNoBass')
    ok(await ev(pg, 'splitChart(S.chart)[5].toks.join(" ")') == 'C13b9', 'no bass')
    ok(await ev(pg, 'document.querySelectorAll("#grid .cell")[5].querySelector(".ch").textContent') == 'C13\u266d9', 'grid not updated')
    await pg.click('#edDone')
    ok(await pg.is_visible('#kbArea') and not await pg.is_visible('#editor'), 'done')
    ok(not pg.errors, pg.errors)

@test
async def editor_two_chords_and_text_toggle(c):
    pg = await c.page(storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(1).click()          # Bb7
    await pg.get_by_role('button', name='+ Chord').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks') == ['Bb7', 'Bb7'], await ev(pg, 'splitChart(S.chart)[1].toks'))
    await chip(pg, 'edRoots', 'E').click()
    await chip(pg, 'edQuals', 'dim7').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks') == ['Bb7', 'Edim7'], await ev(pg, 'splitChart(S.chart)[1].toks'))
    await pg.get_by_role('button', name='Remove chord').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks') == ['Bb7'], 'remove')
    # text mode
    await pg.click('#edText')
    ok(await pg.is_visible('#edTextBox') and not await pg.is_visible('#edPicker'), 'text toggle')
    inp = pg.locator('#edInput input')
    await inp.fill('Bb7 / Bdim7 /'); await inp.press('Enter')
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Bb7 / Bdim7 /', 'text apply')
    await inp.fill('Hmaj7'); await inp.press('Enter')
    ok('Hmaj7' in await pg.text_content('#edErr'), 'bad chord error')
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Bb7 / Bdim7 /', 'bad text must not apply')
    ok(not pg.errors, pg.errors)

@test
async def editor_insert_delete_move_add(c):
    pg = await c.page(storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(0).click()
    await pg.click('#edInsert')
    ok(await ev(pg, 'chartSong.bars.length') == 13 and await ev(pg, 'ED.bar') == 1, 'insert')
    await pg.click('#edDelete')
    ok(await ev(pg, 'chartSong.bars.length') == 12, 'delete')
    await pg.click('#edNext'); await pg.click('#edNext')
    ok(await ev(pg, 'ED.bar') == 3, 'next')
    await pg.click('#edDone')
    await pg.click('#addBar')
    ok(await ev(pg, 'chartSong.bars.length') == 13 and await ev(pg, 'ED.bar') == 12, 'add bar at end')
    ok(await ev(pg, 'splitChart(S.chart)[12].toks.join(" ")') == 'Gm7 C7', 'new bar copies last')

@test
async def editor_percent_bar_and_labels_survive(c):
    pg = await c.page(storage={'chart': '[A] Cmaj7 | % | Dm7 G7 | % |\n[B] Fmaj7 | Fm7 | Em7 A7 | Dm7 G7 |'})
    await pg.locator('#grid .cell').nth(1).click()          # the % bar
    await chip(pg, 'edQuals', '6').click()
    raw = await ev(pg, 'splitChart(S.chart).map(b=>[b.label,b.toks.join(" ")])')
    ok(raw[1] == [None, 'C6'] and raw[0] == ['A', 'Cmaj7'] and raw[4][0] == 'B', raw)
    # deleting a bar followed by % keeps that bar's chord
    await pg.click('#edNext')                                # bar 3 Dm7 G7, followed by %
    await pg.click('#edDelete')
    raw = await ev(pg, 'splitChart(S.chart).map(b=>b.toks.join(" "))')
    ok(raw[2] == 'Dm7 G7', raw)

@test
async def editor_in_side_panel_on_laptop(c):
    pg = await c.page(LAPTOP, storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(5).click()
    ok(await ev(pg, '$("panel").contains($("editor"))'), 'editor should be in the side panel')
    ok(await pg.is_visible('#kbArea'), 'keyboard stays on laptop')
    await c.shot(pg, 'editor-laptop')
    await pg.keyboard.press('ArrowRight')
    ok(await ev(pg, 'ED.bar') == 6, 'arrow key moves bar')
    await pg.keyboard.press('Escape')
    ok(not await pg.is_visible('#editor'), 'escape closes')

# ---------------- lead-sheet cells & keyboard bar (phone) ----------------
TEO = '| Bm7 | F#7#5 | Bm7 | F#7#5 |\n| Bm7 | F#7#5 | Bm7 | C#m7 F#7 |\n| Em7 | F#7 | Em7 | F#7 |\n| Em7 | F#7 | G7 | F#7 |\n| Bm7 | Bb7#9/Ab Gmaj7#11 | C#m7b5 / F#7alt / | Em7 A7 Dm7 G7 |'

@test
async def leadsheet_lines(c):
    for w in (412, 360):
        pg = await c.page(dict(PHONE, viewport=dict(width=w, height=900)), storage={'chart': TEO, 'keyInst': 'organ'}, scheme='light')
        await pg.wait_for_timeout(300)
        await c.shot(pg, f'leadsheet-{w}')
        info = await ev(pg, '''[...document.querySelectorAll("#grid .sys")].map(r=>[...r.children].map(c=>({
            bar:+c.dataset.bar, w:c.getBoundingClientRect().width, h:c.getBoundingClientRect().height,
            clip:c.querySelector(".ch").scrollWidth>c.querySelector(".ch").clientWidth+1})))''')
        bars = [b for line in info for b in line]
        ok([b['bar'] for b in bars] == list(range(len(bars))), f'{w}: bars out of order')
        ok(not [b['bar'] for b in bars if b['clip']], f'{w}: chords cut off in bars {[b["bar"]+1 for b in bars if b["clip"]]}')
        ok(len({round(b['h']) for b in bars}) == 1, f'{w}: line heights differ')
        ok(max(len(l) for l in info) == 4, f'{w}: plain bars should sit 4 to a line: {[len(l) for l in info]}')
        ok(all(len(l) in (1, 2, 4) or l is info[-1] for l in info), f'{w}: lines split 3+1: {[len(l) for l in info]}')
        line2 = info[1]                                   # bars 5-8: bar 8 has two chords, so it's wider
        ok(line2[3]['w'] > line2[0]['w'] + 10, f'{w}: busy bar not wider {[round(b["w"]) for b in line2]}')
        right = await ev(pg, 'Math.max(...[...document.querySelectorAll("#grid .sys")].map(r=>r.getBoundingClientRect().right))')
        ok(right <= w, f'{w}: line runs off screen')
        # keyboard bar: everything inside the screen, nothing overlapping
        bar = await ev(pg, '''(()=>{const r=[...document.querySelectorAll("#kbBar > *:not(.sr-only)")].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect());
          return {right:Math.max(...r.map(x=>x.right)),overlap:r.some((a,i)=>i&&a.left<r[i-1].right-0.5),w:innerWidth}})()''')
        ok(bar['right'] <= bar['w'] and not bar['overlap'], f'{w}: keyboard bar overflows {bar}')
        ok(await pg.is_visible('#leslieBtn'), 'Leslie button shown for organ')
    # a section label starts a new line
    pg = await c.page(storage={'chart': '[A] C | F | C | G |\n| C | F | G | C |\n[B] F | % | C | % |'})
    starts = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>+r.firstElementChild.dataset.bar)')
    ok(8 in starts, f'section B should start a line: {starts}')

@test
async def comp_toggle_on_main_screen(c):
    for dev in (PHONE, LAND, LAPTOP):
        pg = await c.page(dev)
        ok(await pg.is_visible('#compBtn'), 'comp button visible')
        await pg.click('#compBtn')
        ok(await ev(pg, 'S.mute.cp') is True and await pg.get_attribute('#compBtn', 'aria-pressed') == 'false', 'comp off')
        ok(await pg.get_attribute('#mCp', 'aria-pressed') == 'false', 'settings mute in sync')
        await pg.click('#compBtn')
        ok(await ev(pg, 'S.mute.cp') is False, 'comp back on')
        r = await ev(pg, '(()=>{const b=$("compBtn").getBoundingClientRect(),p=$("compBtn").parentElement.getBoundingClientRect();return b.right<=innerWidth&&b.bottom<=p.bottom+1&&b.top>=p.top-1})()')
        ok(r, 'comp button clipped or off screen')
    await ev(pg, 'setTrio(true)')
    ok(not await pg.is_visible('#compBtn'), 'hidden in trio mode')

# ---------------- settings ----------------
@test
async def settings_sheet_on_phone(c):
    pg = await c.page()
    await pg.click('#panelBtn'); await pg.wait_for_timeout(500)
    ok(await ev(pg, '$("sheet").open && $("sheet").contains($("panelBody"))'), 'sheet')
    ok(await pg.get_attribute('#panelBtn', 'aria-expanded') == 'true', 'aria-expanded')
    await c.shot(pg, 'settings-phone-song')
    await pg.locator('sl-tab[panel="sound"]').click(); await pg.wait_for_timeout(300)
    await c.shot(pg, 'settings-phone-sound')
    await pg.click('#mDr')
    ok(await ev(pg, 'S.mute.dr') is True and await pg.get_attribute('#mDr', 'aria-pressed') == 'false', 'mute')
    await pg.click('#mDr')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    ok(not await ev(pg, '$("sheet").open'), 'sheet closes')

@test
async def settings_open_preset_and_save(c):
    pg = await c.page(LAPTOP)
    await pg.click('#openSong'); await pg.wait_for_timeout(200)
    await pg.locator('#openSong sl-option', has_text='Blues in Bb').first.click(); await pg.wait_for_timeout(200)
    ok(await ev(pg, 'S.songName') == 'Blues in Bb', await ev(pg, 'S.songName'))
    await pg.locator('#songName input').fill('My Leaves'); await pg.click('#saveSong')
    ok('My Leaves' in await ev(pg, 'Object.keys(S.songs)'), 'saved')
    ok('My Leaves' in await pg.text_content('#title'), 'title')
    await pg.click('#textBtn'); await pg.wait_for_timeout(300)
    ok(await ev(pg, '$("textDlg").open'), 'text dialog')
    await pg.locator('#chartText textarea').fill('| Dm7 | G7 | Cmaj7 | % |'); await pg.click('#textApply')
    ok(await ev(pg, 'chartSong.bars.length') == 4, 'text apply')
    ok(not pg.errors, pg.errors)

@test
async def theme_switch(c):
    pg = await c.page(LAPTOP, scheme='light')
    ok(await ev(pg, 'document.documentElement.dataset.theme') == 'light', 'system light')
    await pg.locator('sl-tab[panel="app"]').click()
    await pg.locator('#theme sl-radio-button[value="dark"]').click()
    ok(await ev(pg, 'document.documentElement.dataset.theme') == 'dark' and await ev(pg, 'localStorage.jj_theme') == '"dark"', 'dark')
    await c.shot(pg, 'laptop-dark')
    await pg.reload(); await pg.wait_for_timeout(300)
    ok(await ev(pg, 'document.documentElement.dataset.theme') == 'dark', 'remembered')

# ---------------- keyboard ----------------
@test
async def keyboard_resize_per_orientation(c):
    pg = await c.page(PHONE)
    h0 = await ev(pg, '$("kb").offsetHeight')
    await pg.focus('#kbHandle')
    for _ in range(3): await pg.keyboard.press('ArrowUp')
    h1 = await ev(pg, '$("kb").offsetHeight')
    ok(h1 == h0 + 60, (h0, h1))
    await pg.set_viewport_size(dict(width=844, height=390)); await pg.wait_for_timeout(400)
    hl = await ev(pg, '$("kb").offsetHeight')
    ok(hl != h1, 'landscape should have its own height')
    await pg.click('#kbToggle')
    ok(await ev(pg, '$("kb").hidden') and await pg.text_content('#kbToggle') == 'Show keys', 'hide')
    await pg.set_viewport_size(dict(width=390, height=844)); await pg.wait_for_timeout(400)
    ok(await ev(pg, '$("kb").offsetHeight') == h1, 'portrait height remembered')
    keys = await ev(pg, '$("kb").children.length')
    ok(keys > 10, 'keys built')
    gap = await ev(pg, '(()=>{const w=[...$("kb").querySelectorAll(".w")];return w[1].getBoundingClientRect().left-w[0].getBoundingClientRect().right})()')
    ok(gap >= 1.5, 'white keys need a gap, got %s' % gap)

@test
async def keyboard_plays_and_tones(c):
    pg = await c.page(storage={'chart': BLUES, 'countIn': False})
    k = pg.locator('#kb .w').nth(3)
    await k.dispatch_event('pointerdown', dict(pointerId=7, clientX=0, clientY=0))
    box = await k.bounding_box()
    await ev(pg, f'(()=>{{const e=new PointerEvent("pointerdown",{{pointerId:9,clientX:{box["x"]+box["width"]/2},clientY:{box["y"]+box["height"]-10},bubbles:true}});$("kb").dispatchEvent(e);0}})()')
    ok(await pg.locator('#kb .k.down').count() >= 1, 'key down')
    await pg.click('#play'); await pg.wait_for_timeout(800)
    n = await ev(pg, '[...$("kb").children].filter(k=>k.dataset.tone).length')
    ok(n >= 3, 'chord tones marked: %d' % n)
    await pg.click('#play')

# ---------------- accessibility ----------------
@test
async def axe_audit(c):
    if not os.path.exists(AXE):
        print('    (skipped: run "cd tests && npm install" for axe-core)'); return
    src = open(AXE).read()
    problems = []
    for name, dev, scheme, prep in [
        ('phone-dark', PHONE, 'dark', None), ('phone-light', PHONE, 'light', None),
        ('laptop-dark', LAPTOP, 'dark', None), ('laptop-light', LAPTOP, 'light', None),
        ('editor-phone', PHONE, 'dark', 'editor'), ('sheet-phone', PHONE, 'light', 'sheet')]:
        pg = await c.page(dev, storage={'chart': BLUES}, scheme=scheme)
        if prep == 'editor': await pg.locator('#grid .cell').nth(5).click()
        if prep == 'sheet': await pg.click('#panelBtn'); await pg.wait_for_timeout(600)
        await pg.add_script_tag(content=src)
        res = await ev(pg, '''axe.run(document,{resultTypes:["violations"]}).then(r=>r.violations.map(v=>
            v.id+" ("+v.impact+"): "+v.nodes.slice(0,3).map(n=>n.target.join(" ")).join(" | ")))''')
        problems += [f'{name}: {r}' for r in res]
    ok(not problems, '\n      ' + '\n      '.join(problems))

async def main():
    srv = serve()
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    fails = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        c = Ctx(b, url)
        for t in TESTS:
            if ONLY and ONLY not in t.__name__: continue
            try:
                await t(c); print('PASS', t.__name__)
            except Exception as e:
                fails += 1
                print('FAIL', t.__name__, '\n     ', e if isinstance(e, AssertionError) else traceback.format_exc())
            for ctx in b.contexts: await ctx.close()
        await b.close()
    srv.shutdown()
    print(f'\n{len(TESTS) if not ONLY else "selected"} tests, {fails} failed')
    sys.exit(1 if fails else 0)

asyncio.run(main())
