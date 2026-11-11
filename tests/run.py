import json
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
async def engine_section_start_names_held_chord(c):
    pg = await c.page()
    r = await ev(pg, '''(()=>{const p=parseChart("[A] Cmaj7 | % | Dm7 | G7 |\\n[B] G7 | % | Cmaj7 / Dm7 / | Dm7 |",4);
      return p.bars.map(b=>b.map(x=>(x.dim?"~":"")+x.t).join(" "))})()''')
    ok(r == ['Cmaj7', '', 'Dm7', 'G7', 'G7', '', 'Cmaj7 Dm7', ''], r)

@test
async def section_double_bar_lines(c):
    chart = '[A] C | F | C | G |\n[B] F | % | C | G |\n[A] C | F | G | C |'
    pg = await c.page(storage={'chart': chart})
    r = await ev(pg, 'CELLS.map((c,i)=>c.classList.contains("secend")?i:c.classList.contains("end")?"end"+i:null).filter(x=>x!==null)')
    ok(r == [3, 7, 'end11'], r)
    st = await ev(pg, '[getComputedStyle(CELLS[3]).borderRightStyle,getComputedStyle(CELLS[11]).borderRightStyle]')
    ok(st == ['double', 'solid'], st)
    await c.shot(pg, 'section-bars-chords')
    pg = await c.page(LAPTOP, storage={'chart': chart, 'melody': {'pickup': '', 'bars': ['C5w'] * 12}}, scheme='light')
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await c.shot(pg, 'section-bars-staff')
    ok(not pg.errors, pg.errors)

@test
async def engine_chord_codec_roundtrip(c):
    pg = await c.page()
    bad = await ev(pg, '''(()=>{const L=["C","Cm","C7","Cmaj7","C6","C69","Cm7","Cm6","Cm69","Cm(maj7)","Cm7b5","Cm9b5","C7(13)","Cmaj7(13)","Cm7(13)","Cm7(11)","C7(11)","C7b5","C7#5","C7#5#9","C9#5","C7b5b9","Bbm7b5","Cdim7",
      "C7sus4","C9sus4","C7alt","C9","C13","C7b9","C7#9","C7#11","C13b9","C7b9b13","Cmaj9","Cmaj7#11","Cm9","Cm11","C7/E","Bb7/Ab","F#m7b5","Ebmaj7"];
      return L.filter(t=>{const p=chordParts(t);return !p||chordFromParts(p)!==t;})})()''')
    ok(bad == [], 'codec mangles: %r' % bad)

@test
async def engine_loop_pads_to_16(c):
    pg = await c.page()
    r = await ev(pg, '(()=>{const s=sliceSong(chartSong,4,5);return [s.bars.length,s.loopLen,s.map.slice(0,4)]})()')
    ok(r == [16, 2, [4, 5, 4, 5]], r)

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
    ok(await pg.text_content('#playLabel') == 'Stop', 'label not Stop %s' % pg.errors)
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
    foot = await ev(pg, '$("edNext").getBoundingClientRect().bottom<=innerHeight')
    ok(foot, 'editor footer buttons must be on screen')
    await chip(pg, 'edRoots', 'C').click()
    await chip(pg, 'edQuals', '7').click()  # "7" (index 0 is maj7)
    t = await ev(pg, 'splitChart(S.chart)[5].toks.join(" ")')
    ok(t == 'C7', 'root+quality gave %r' % t)
    await pg.locator('#edExts [aria-label="flat 9"]').click()
    await pg.locator('#edExts [aria-label="13"]').click()
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
    ok(await ev(pg, 'document.querySelectorAll("#grid .cell")[5].querySelector(".ch").textContent.replace(document.querySelectorAll("#grid .cell")[5].querySelector(".tn")?.textContent||"","")') == 'C13\u266d9', 'grid not updated')
    await pg.click('#edDone')
    ok(await pg.is_visible('#kbArea') and not await pg.is_visible('#editor'), 'done')
    ok(not pg.errors, pg.errors)

@test
async def editor_flats_and_sharps(c):
    pg = await c.page(storage={'chart': '| Dbmaj7 | F#m7 B7 | Ebm7 | Ab7 |', 'keySig': 'C'})
    # every spelling parses and sounds the same pitch class
    r = await ev(pg, '["Gbm7","F#m7","C#7","Db7","D#m7","Ebm7","G#7","Ab7","A#7","Bb7"].map(t=>parseChord(t)&&parseChord(t).root)')
    ok(r == [6, 6, 1, 1, 3, 3, 8, 8, 10, 10], r)
    await pg.locator('#grid .cell').nth(1).click()
    roots = lambda: ev(pg, '[...document.querySelectorAll("#edRoots .chip")].map(b=>b.textContent).join(" ")')
    ok(await roots() == 'C C\u266f D D\u266f E F F\u266f G G\u266f A A\u266f B', 'F#m7 shows sharps: ' + await roots())
    ok(await pg.get_attribute('#edSharp', 'aria-pressed') == 'true', 'sharp switch on')
    await pg.click('#edFlat')
    await c.shot(pg, 'editor-flats')
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Gbm7 B7', 'respelled: ' + await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")'))
    ok(await roots() == 'C D\u266d D E\u266d E F G\u266d G A\u266d A B\u266d B', await roots())
    ok('G\u266d' in await ev(pg, 'CELLS[1].querySelector(".ch").textContent'), 'chart shows Gb')
    # the second chord (B7, white key): buttons follow the key signature, a pick uses that spelling
    await pg.locator('#edSlots .slot').nth(1).click()
    ok(await pg.get_attribute('#edFlat', 'aria-pressed') == 'true', 'C major: flats by default')
    await pg.click('#edSharp'); await pg.locator('#edRoots .chip[aria-label="C sharp"]').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Gbm7 C#7', await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")'))
    # bass note: its own spelling; same pitch as the root means no bass note
    await pg.locator('#edNoteMode sl-radio-button[value="bass"]').click()
    await pg.click('#edFlat'); await pg.locator('#edRoots .chip[aria-label="D flat"]').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Gbm7 C#7', 'Db bass under C#7 = no bass note')
    await pg.locator('#edRoots .chip[aria-label="G flat"]').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")') == 'Gbm7 C#7/Gb', await ev(pg, 'splitChart(S.chart)[1].toks.join(" ")'))
    # a sharp key signature starts with sharps
    await ev(pg, 'setKeySig("E")'); await pg.click('#edNext')
    ok(await pg.get_attribute('#edSharp', 'aria-pressed') == 'false' and await pg.get_attribute('#edFlat', 'aria-pressed') == 'true', 'Ebm7 stays flat as written')
    await pg.click('#edNext')                         # Ab7 (bar 4), root mode: flat as written
    await pg.locator('#edNoteMode sl-radio-button[value="root"]').click()
    ok(await pg.get_attribute('#edFlat', 'aria-pressed') == 'true', 'Ab7 flat')
    await pg.click('#edPrev'); await pg.click('#edPrev'); await pg.locator('#edSlots .slot').nth(1).click()
    await ev(pg, 'updateSlot(x=>{x.root="E";x.bass=null;})')   # a white-key chord in E major: sharps
    ok(await pg.get_attribute('#edSharp', 'aria-pressed') == 'true', 'E major key: sharps for a white-key chord')
    ok(not pg.errors, pg.errors)

@test
async def editor_flat5_sharp5(c):
    pg = await c.page(storage={'chart': '| Bbm7 | C7 | Dm7 |'})
    await pg.locator('#grid .cell').nth(0).click()
    ok(await pg.locator('#edQuals [aria-label^="m7 flat 5"]').text_content() == 'm7\u266d5', 'm7b5 button labelled as written')
    await pg.locator('#edExts [aria-label="flat 5"]').click()          # m7 + flat 5 = m7b5
    tok = lambda i: ev(pg, f'splitChart(S.chart)[{i}].toks.join(" ")')
    ok(await tok(0) == 'Bbm7b5', await tok(0))
    ok(await pg.locator('#edQuals [aria-label^="m7 flat 5"]').get_attribute('aria-pressed') == 'true'
       and await pg.locator('#edExts [aria-label="flat 5"]').get_attribute('aria-pressed') == 'true', 'shown as m7b5 with its flat 5')
    await pg.locator('#edExts [aria-label="9"]').click()
    ok(await tok(0) == 'Bbm9b5', await tok(0))
    await pg.locator('#edExts [aria-label="9"]').click(); await pg.locator('#edExts [aria-label="flat 5"]').click()
    ok(await tok(0) == 'Bbm7', 'tap flat 5 again: back to m7 ' + await tok(0))
    await pg.click('#edNext')
    await pg.locator('#edExts [aria-label="sharp 5"]').click(); await pg.locator('#edExts [aria-label="sharp 9"]').click()
    ok(await tok(1) == 'C7#5#9', await tok(1))
    await pg.locator('#edExts [aria-label="sharp 5"]').click(); await pg.locator('#edExts [aria-label="sharp 9"]').click()
    await pg.locator('#edExts [aria-label="flat 5"]').click()
    ok(await tok(1) == 'C7b5', await tok(1))
    # the sound: b5 / #5 replace the fifth
    r = await ev(pg, '[parseChord("C7b5").arp,parseChord("C7#5").arp,parseChord("Bbm7b5").kind]')
    ok(r == [[0, 4, 6, 10], [0, 4, 8, 10], 'm7b5'], r)
    ok(not pg.errors, pg.errors)

@test
async def editor_section_labels(c):
    pg = await c.page(storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(0).click()
    await pg.locator('#edSecs .chip', has_text='A').click()
    await pg.click('#edNext'); await pg.click('#edNext'); await pg.click('#edNext'); await pg.click('#edNext')   # bar 5
    inp = pg.locator('#edSecName input'); await inp.fill('Bridge'); await inp.press('Enter')
    labels = await ev(pg, 'chartSong.labels.slice(0,6)')
    ok(labels == ['A', None, None, None, 'Bridge', None], labels)
    ok(await ev(pg, 'CELLS[4].querySelector(".lbl").textContent') == 'Bridge', 'shown on the chart')
    ok(4 in await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>+r.firstElementChild.dataset.bar)'), 'starts a line')
    ok(await ev(pg, 'splitChart(S.chart)[0].label') == 'A' and await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'F7', await ev(pg, 'S.chart'))
    # brackets can't break the chart text
    await inp.fill('[x]|y'); await inp.press('Enter')
    ok(await ev(pg, 'chartSong.labels[4]') == 'xy' and await ev(pg, 'chartSong.bars.length') == 12, await ev(pg, 'chartSong.labels[4]'))
    await pg.locator('#edSecs .chip[aria-label="No section label"]').click()
    ok(await ev(pg, 'chartSong.labels[4]') is None, 'removed')
    await c.shot(pg, 'editor-section')
    # the rhythm-section setting still works (a name clash once broke it)
    await ev(pg, 'setSection("blakey",false)')
    ok(await ev(pg, 'S.section') == 'blakey', 'rhythm section setting intact')
    ok(not pg.errors, pg.errors)

@test
async def editor_added_13_without_9(c):
    pg = await c.page(storage={'chart': '| Gb7 | Gb7 |'})
    await pg.locator('#grid .cell').nth(0).click()
    tok = lambda: ev(pg, 'splitChart(S.chart)[0].toks.join(" ")')
    await pg.locator('#edExts [aria-label="13"]').click()
    ok(await tok() == 'Gb7(13)', '7 + 13 = 7(13): ' + await tok())
    await pg.locator('#edExts [aria-label="9"]').click()
    ok(await tok() == 'Gb13', '+ 9 = 13: ' + await tok())
    await pg.locator('#edExts [aria-label="9"]').click()
    ok(await tok() == 'Gb7(13)', 'take the 9 out again: ' + await tok())
    # sound: no 9 in 7(13); 13 keeps it; altered chords unchanged
    r = await ev(pg, '''["Gb7(13)","Gb7add13","Gb13","Gb7"].map(t=>{const c=parseChord(t);let has9=false;
      for(let k=0;k<20;k++){const v=voicingFor(c,null,"rootless",{});if(v.some(m=>((m-c.root)%12+12)%12===2))has9=true;}
      return [!!c.noNine,c.ext.includes(2),has9]})''')
    ok(r == [[True, False, False], [True, False, False], [False, True, True], [False, False, True]], r)
    ok(await ev(pg, 'chordFromParts(chordParts("Gb7add13"))') == 'Gb7(13)', 'typed add13')
    ok('(13)' in await ev(pg, 'CELLS[0].querySelector(".ch").textContent'), 'chart shows (13)')
    ok(not pg.errors, pg.errors)

@test
async def chart_tones_in_bar_being_played(c):
    st = dict(MELSONG, melody={'pickup': '', 'bars': ['A4q C5q Eb5q G5q', 'D5h Ab4h', '', 'Eb5q F5q A5q Bb5q & C4w']})
    for dev, mel in ((PHONE, True), (LAPTOP, False)):
        pg = await c.page(dev, storage=dict(st, showMel=mel), scheme='light')
        if mel: await pg.wait_for_function('document.querySelector("#grid .staff")')
        ok(await ev(pg, 'CELLS[0].querySelector(".tn").textContent') == 'FACE\u266d', 'F7 spelled')
        ok(await ev(pg, 'getComputedStyle(CELLS[0].querySelector(".tn")).display') == 'none', 'hidden until played')
        h0 = await ev(pg, 'CELLS.map(x=>x.offsetWidth+":"+x.offsetHeight).join()')
        await ev(pg, 'setCur(CELLS[3])')
        ok(await ev(pg, 'getComputedStyle(CELLS[3].querySelector(".tn")).display') == 'block', 'shown in the bar being played')
        ok(await ev(pg, 'CELLS.map(x=>x.offsetWidth+":"+x.offsetHeight).join()') == h0, 'nothing moves')
        await c.shot(pg, 'chart_tones_' + ('mel' if mel else 'plain'))
        if mel:
            # bar 4 is Cm7 then F7: Eb = 3rd of Cm7, F not in Cm7, A = 3rd of F7, Bb not in F7
            r = await ev(pg, '[...Array(4).keys()].map(i=>{const e=NOT.els.get("3:1:"+i);return e?[...e.querySelectorAll(".vf-notehead")].map(h=>h.dataset.tone||"").join("/"):"?"})')
            ok(r == ['gt', '', 'gt', ''], r)
            ok(await ev(pg, 'NOT.els.get("3:1:0").classList.contains("tcur")&&!NOT.els.get("0:1:0").classList.contains("tcur")'), 'only the current bar is coloured')
            ok(await ev(pg, 'NOT.els.get("3:2:0").querySelector(".vf-notehead").dataset.tone') == 'ct', 'voice 2 root of Cm7')
            await ev(pg, 'setCur(null)')
            ok(not await ev(pg, 'NOT.els.get("3:1:0").classList.contains("tcur")'), 'cleared on stop')
        await ev(pg, 'S.chartTones=false;renderGrid()')
        await pg.wait_for_timeout(300)
        ok(await ev(pg, '!document.querySelector("#grid .tn")'), 'switch off')
        ok(not pg.errors, pg.errors)
    # a chord held over several bars keeps its tones in each bar
    for mel in (False, True):
        pg = await c.page(PHONE, storage={'chart': '| Cm7 | % | / | F7 |', 'showMel': mel, 'melody': {'pickup': '', 'bars': ['', '', 'Eb5h D5h', '']}}, scheme='light')
        if mel: await pg.wait_for_function('document.querySelector("#grid .staff")')
        ok(await ev(pg, 'CELLS.map(c=>c.querySelector(".tn")?.textContent||"")') == ['CE\u266dGB\u266d'] * 3 + ['FACE\u266d'], 'held chord tones')
        await ev(pg, 'setCur(CELLS[2])')
        ok(await ev(pg, 'getComputedStyle(CELLS[2].querySelector(".tn")).display') == 'block', 'shown in a held bar')
        if mel:
            ok(await ev(pg, 'NOT.els.get("2:1:0").querySelector(".vf-notehead").dataset.tone') == 'gt', 'Eb over held Cm7')
        await c.shot(pg, 'chart_tones_held_' + ('mel' if mel else 'plain'))
        ok(not pg.errors, pg.errors)
    # a crowded bar (4 chords) on a phone: tones never overlap and stay on screen
    for scheme in ('light', 'dark'):
        pg = await c.page(PHONE, storage={'chart': TEO, 'showMel': False}, scheme=scheme)
        await ev(pg, 'setCur(CELLS[19]);CELLS[19].scrollIntoView()'); await pg.wait_for_timeout(300)
        r = await ev(pg, '[...CELLS[19].querySelectorAll(".tn")].map(t=>{const b=t.getBoundingClientRect();return [b.left,b.right]})')
        ok(len(r) == 4 and all(r[i][0] >= r[i-1][1] for i in range(1, 4)), r)
        ok(r[-1][1] <= await ev(pg, 'innerWidth'), 'off screen %s' % r)
        await c.shot(pg, 'chart_tones_busy_' + scheme)

@test
async def engine_swing_follows_tempo(c):
    pg = await c.page(storage={'chart': BLUES})
    r = await ev(pg, '[100,120,200,300,320].map(b=>Math.round(swingPct(b,0)*10)/10)')
    ok(r[0] == r[1] == 72.3 and 66 < r[2] < 68 and r[3] == r[4] == 57.1, 'curve %s' % r)
    ok(await ev(pg, '[swingPct(200,-12),swingPct(300,-10),swingPct(120,8)]') == [50, 50, 78], 'straight / clamped')
    # the label follows the tempo
    await ev(pg, 'setBpm(120)')
    l120 = await pg.text_content('#vSwing')
    await ev(pg, 'setBpm(280)')
    ok(l120 == 'typical \u00b7 72%' and await pg.text_content('#vSwing') == 'typical \u00b7 58%', (l120, await pg.text_content('#vSwing')))
    await ev(pg, 'setSlider("Swing",3)')
    ok(await pg.text_content('#vSwing') == '+3 \u00b7 61%' and await ev(pg, 'S.swingAdj') == 3, await pg.text_content('#vSwing'))
    # the scheduler uses it: at 120 bpm the "and" lands 72% through the beat
    await ev(pg, 'setBpm(120);setSlider("Swing",0)')
    sn = await ev(pg, "[swingNow(),S.style,S.bpm,S.swingAdj]")
    ok(abs(sn[0] - 0.7227) < 1e-3, sn)
    await ev(pg, 'setStyle("bossa")')
    ok(await ev(pg, 'swingNow()') == 0.5, 'bossa stays straight')
    # rhythm sections set an offset from typical
    await ev(pg, 'setStyle("swing");setSection("blakey",true)')
    ok(await ev(pg, 'S.swingAdj') == -2, 'Blakey')
    # songs saved before: a fixed 66% becomes +4, 50% stays straight
    ok(await ev(pg, '[swingAdjFrom(62),swingAdjFrom(66),swingAdjFrom(50),swingAdjFrom(72)]') == [0, 4, -12, 8], 'old songs')
    await ev(pg, 'S.songs.old={chart:"| C7 |",bpm:160,swing:66};loadSong("old")')
    ok(await ev(pg, 'S.swingAdj') == 4, 'old song loads as +4')
    ok(not pg.errors, pg.errors)
    pg2 = await c.page(PHONE, storage={'chart': BLUES, 'bpm': 120})
    await pg2.click('#panelBtn'); await pg2.wait_for_timeout(500)
    await pg2.locator('#sSwing').scroll_into_view_if_needed()
    ok(await ev(pg2, '$("vSwing").getBoundingClientRect().right<=innerWidth&&$("vSwing").getBoundingClientRect().height<30'), 'label fits')
    await c.shot(pg2, 'swing_slider')
    # an old stored swing setting carries over
    pg = await c.page(storage={'chart': BLUES, 'swing': 58})
    ok(await ev(pg, 'S.swingAdj') == -4, 'stored swing migrated')

@test
async def engine_voicings_include_written_extensions(c):
    pg = await c.page()
    r = await ev(pg, '''Object.fromEntries(["Cmaj7","Cmaj13","Cmaj7(13)","Cm7","Cm11","Cm7(11)","Cm13","C11","C13"].map(t=>{
      const ch=parseChord(t),s=new Set();
      for(let k=0;k<30;k++){const v=voicingFor(ch,null,"rootless",{});v.forEach(m=>s.add(((m-ch.root)%12+12)%12));}
      return [t,[...s].sort((a,b)=>a-b)]}))''')
    ok(r['Cmaj7'] == [2, 4, 7, 11] and r['Cm7'] == [2, 3, 7, 10], 'plain chords unchanged: %s' % r)
    ok(9 in r['Cmaj13'] and 9 in r['Cmaj7(13)'] and 9 in r['Cm13'], '13 is played: %s' % r)
    ok(5 in r['Cm11'] and 5 in r['Cm7(11)'], 'minor 11 is played: %s' % r)
    ok(2 not in r['Cmaj7(13)'], 'added 13 still has no 9: %s' % r)
    ok(4 not in r['C11'] and 5 in r['C11'], 'C11 is a 9sus sound: %s' % r)
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
async def editor_split_bar_holds_last_chord(c):
    # a new song is | Cmaj7 | % | % | %: two chords in bar 1 must not repeat into bars 2-4
    pg = await c.page(storage={'chart': '| Cmaj7 | % | % | % |'})
    await pg.locator('#grid .cell').nth(0).click()
    await pg.get_by_role('button', name='+ Chord').click()
    await chip(pg, 'edRoots', 'D').click()
    await chip(pg, 'edQuals', 'm7').click()
    ok(await ev(pg, 'S.chart.replace(/\\s+/g," ").trim()') == '| Cmaj7 Dm7 | / | / | / |', await ev(pg, 'S.chart'))
    await c.shot(pg, 'split_bar_after')
    ok(await ev(pg, 'chartSong.segs.map(s=>s.chord.sym+":"+s.len).join()') == 'Cmaj7:2,Dm7:14', await ev(pg, 'chartSong.segs.map(s=>s.chord.sym+":"+s.len).join()'))
    # a % after a bar that already had two chords still repeats the whole bar
    pg = await c.page(storage={'chart': '| C7 F7 | % | G7 |'})
    await pg.locator('#grid .cell').nth(0).click()
    await chip(pg, 'edRoots', 'D').click()
    ok(await ev(pg, 'splitChart(S.chart)[1].toks') == ['%'], await ev(pg, 'S.chart'))
    ok(not pg.errors, pg.errors)

@test
async def editor_insert_delete_move_add(c):
    pg = await c.page(storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(0).click()
    await pg.click('#edInsert')
    ok(await ev(pg, 'chartSong.bars.length') == 13 and await ev(pg, 'ED.bar') == 1, 'insert')
    await pg.click('#edBars'); await pg.click('#edDelete')
    ok(await ev(pg, 'chartSong.bars.length') == 12, 'delete')
    await pg.click('#edNext'); await pg.click('#edNext')
    ok(await ev(pg, 'ED.bar') == 3, 'next')
    await pg.click('#edDone')
    await pg.click('#addBar')
    ok(await ev(pg, 'chartSong.bars.length') == 13 and await ev(pg, 'ED.bar') == 12, 'add bar at end')
    ok(await ev(pg, 'splitChart(S.chart)[12].toks.join(" ")') == 'C7', 'new bar carries the last chord on')

@test
async def editor_percent_bar_and_labels_survive(c):
    pg = await c.page(storage={'chart': '[A] Cmaj7 | % | Dm7 G7 | % |\n[B] Fmaj7 | Fm7 | Em7 A7 | Dm7 G7 |'})
    await pg.locator('#grid .cell').nth(1).click()          # the % bar
    await chip(pg, 'edQuals', '6').click()
    raw = await ev(pg, 'splitChart(S.chart).map(b=>[b.label,b.toks.join(" ")])')
    ok(raw[1] == [None, 'C6'] and raw[0] == ['A', 'Cmaj7'] and raw[4][0] == 'B', raw)
    # deleting a bar followed by % keeps that bar's chord
    await pg.click('#edNext')                                # bar 3 Dm7 G7, followed by %
    await pg.click('#edBars'); await pg.click('#edDelete')
    raw = await ev(pg, 'splitChart(S.chart).map(b=>b.toks.join(" "))')
    ok(raw[2] == 'Dm7 G7', raw)

@test
async def repeats_and_endings(c):
    chart = '[A] |: Cmaj7 | Am7 | 1. Dm7 | G7 :| 2. Dm7 G7 | C6 |\n[B] | F | E7 |'
    for dev, mel in ((PHONE, False), (PHONE, True), (LAPTOP, True)):
        pg = await c.page(dev, storage={'chart': chart, 'showMel': mel, 'melody': {'pickup': '', 'bars': ['E5w', 'C5w', 'F5w', 'D5w', 'D5h B4h', 'C5w', '', '']}})
        if mel: await pg.wait_for_function('document.querySelector("#grid .staff")')
        # played: 1 2 3 4 | 1 2 | 5 6 7 8
        ok(await ev(pg, 'chartSong.played.map') == [0, 1, 2, 3, 0, 1, 4, 5, 6, 7], await ev(pg, 'chartSong.played.map'))
        ok(await ev(pg, 'chartSong.bars.length') == 8, 'written bars stay 8')
        ok(await ev(pg, '[...document.querySelectorAll("#grid .cell")].map(c=>["rs","re"].filter(k=>c.classList.contains(k)).join("")+(c.querySelector(".endn")?.textContent||""))') == ['rs', '', '1.', 're', '2.', '', '', ''], 'drawn')
        ok('start of repeat' in await pg.get_attribute('#grid .cell >> nth=0', 'aria-label'), 'aria')
        ok('2nd ending' in await pg.get_attribute('#grid .cell >> nth=4', 'aria-label'), 'aria ending')
        await c.shot(pg, 'repeats_' + ('mel' if mel else 'plain') + ('_laptop' if dev is LAPTOP else ''))
        ok(not pg.errors, pg.errors)
    # the 2nd ending names its chord even though the bar before ends on the same one
    ok(await ev(pg, 'chartSong.bars[4].map(x=>x.t).join()') == 'Dm7,G7', 'ending names chord')
    # the band follows the played order: what the display shows at played bar 4 is written bar 1
    await ev(pg, 'song=loopSong();showBeat({t:0,beat:4*4,bar:4,song})')
    ok(await ev(pg, 'curCell===CELLS[0]') and 'Bar 1/8' in await pg.text_content('#pos'), await pg.text_content('#pos'))
    await ev(pg, 'showBeat({t:0,beat:6*4,bar:6,song})')
    ok(await ev(pg, 'curCell===CELLS[4]'), 'played bar 7 is the 2nd ending')
    # a loop over the 2nd ending takes in the whole repeat; a loop inside it is just those bars
    await ev(pg, 'S.loop={a:0,b:4}')
    ok(await ev(pg, 'loopSong().map.slice(0,7)') == [0, 1, 2, 3, 0, 1, 4], await ev(pg, 'loopSong().map.slice(0,7)'))
    await ev(pg, 'S.loop={a:1,b:2}')
    ok(await ev(pg, 'loopSong().map.slice(0,4)') == [1, 2, 1, 2], 'loop inside the repeat')
    await ev(pg, 'S.loop=null')
    # starting from a bar plays from its first time through
    ok(await ev(pg, '(chartSong.played).map.indexOf(4)') == 6, 'from bar 5')
    # real playback: the highlight goes 1, 2, back to 1, then the 2nd ending and on
    pg = await c.page(storage={'chart': '|: C | 1. D :| 2. E | F |', 'bpm': 320, 'countIn': False})
    await ev(pg, 'window.SEEN=[];setInterval(()=>{const i=CELLS.indexOf(curCell);if(i>=0&&SEEN[SEEN.length-1]!==i)SEEN.push(i)},30)')
    await pg.click('#play'); await pg.wait_for_timeout(4300); await pg.click('#play')
    ok((await ev(pg, 'SEEN'))[:5] == [0, 1, 0, 2, 3], await ev(pg, 'SEEN'))
    ok(not pg.errors, pg.errors)
    # editing: build the same thing from plain bars with the Bars menu
    pg = await c.page(PHONE, storage={'chart': '| Cmaj7 | Am7 | Dm7 | G7 | Dm7 G7 | C6 |'})
    await pg.locator('#grid .cell').nth(0).click()
    await ev(pg, 'setSelection(0,3)'); await pg.click('#edBars'); await pg.click('#mnRepeat')
    ok('Bars 1–4 repeat' in await pg.text_content('#edMsg'), await pg.text_content('#edMsg'))
    await ev(pg, 'setSelection(2,3)'); await pg.click('#edBars'); await pg.click('#mnEnd1')
    await ev(pg, 'ED.bar=4;renderEditor()'); await pg.click('#edBars'); await pg.click('#mnEnd2')
    ok(await ev(pg, 'S.chart') == '|: Cmaj7 | Am7 | 1. Dm7 | G7 :|\n| 2. Dm7 G7 | C6 |', await ev(pg, 'S.chart'))
    ok(await ev(pg, 'chartSong.played.map') == [0, 1, 2, 3, 0, 1, 4, 5], 'plays as written')
    # undo, then remove them all
    await pg.click('#edUndo')
    ok(await ev(pg, 'chartSong.endings[4]') is None, 'undo the 2nd ending')
    await ev(pg, 'setSelection(0,5)'); await pg.click('#edBars'); await pg.click('#mnNoRep')
    ok(await ev(pg, 'S.chart') == '| Cmaj7 | Am7 | Dm7 | G7 |\n| Dm7 G7 | C6 |', await ev(pg, 'S.chart'))
    # deleting the bar that ends a repeat moves the sign to the bar before
    await ev(pg, 'applyChartText("|: C | D | E :| F |");ED.bar=2;renderEditor()')
    await pg.click('#edBars'); await pg.click('#edDelete')
    ok(await ev(pg, 'S.chart') == '|: C | D :| F |', await ev(pg, 'S.chart'))
    ok(not pg.errors, pg.errors)

@test
async def bars_menu_stays_on_screen(c):
    # the menu must be fully visible: above the button, below it, or scrolling if neither fits
    vis = """(()=>{const m=$("barsMenu").getBoundingClientRect();let t=0,b=innerHeight;
      for(let el=$("edBars").parentElement;el&&el!==document.body;el=el.parentElement){const o=getComputedStyle(el);
        if(/(auto|scroll|hidden|clip)/.test(o.overflowY)){const r=el.getBoundingClientRect();t=Math.max(t,r.top);b=Math.min(b,r.bottom);}}
      return [Math.round(m.top),Math.round(m.bottom),Math.round(t),Math.round(b),$("barsMenu").classList.contains("down")]})()"""
    for vp, scroll in ((dict(width=1280, height=800), False), (dict(width=1280, height=800), True), (dict(width=1280, height=520), False), (dict(width=1280, height=420), True), (dict(width=390, height=844), False)):
        pg = await c.page(dict(viewport=vp), storage={'chart': BLUES})
        await pg.locator('#grid .cell').nth(0).click()
        if scroll:   # footer near the top of the panel
            await ev(pg, '$("edBars").scrollIntoView({block:"start"})')
        await pg.click('#edBars')
        r = await ev(pg, vis)
        ok(r[0] >= r[2] - 1 and r[1] <= r[3] + 1, '%s scroll=%s: menu %s' % (vp, scroll, r))
        ok(await ev(pg, '$("barsMenu").scrollHeight<=$("barsMenu").clientHeight+1||getComputedStyle($("barsMenu")).overflowY==="auto"'), 'scrolls if cut')
        if vp['height'] == 420: await c.shot(pg, 'bars_menu_short')
        ok(not pg.errors, pg.errors)

@test
async def pickup_stays_with_labelled_bar_1(c):
    for dev in (PHONE, LAPTOP):
        pg = await c.page(dev, storage={'chart': '[A] | C | F | G | C |\n[B] | F | G |', 'melody': {'pickup': 'G4q A4q', 'bars': ['C5w']}})
        await pg.wait_for_function('document.querySelector("#grid .staff")')
        rows = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>[...r.querySelectorAll(".cell")].map(c=>c===PICK?"p":c.dataset.bar))')
        ok(rows[0][:2] == ['p', '0'], rows)
        ok(any(r[0] == '4' for r in rows), 'section B still starts a line: %s' % rows)
        ok(not pg.errors, pg.errors)

@test
async def chart_never_scrolls_sideways(c):
    # nothing on the chart may hang past its right edge (hidden chord tones once did)
    over = '(()=>{const w=$("chartWrap");return w.scrollWidth-w.clientWidth})()'
    for dev in (PHONE, dict(viewport=dict(width=844, height=390), has_touch=True, is_mobile=True)):
        pg = await c.page(dev, storage={'chart': BLUES})
        for mel in (False, True):
            for n in await ev(pg, 'Object.keys(PRESETS)'):
                await ev(pg, 'S.showMel=%s;loadPreset(%s)' % ('true' if mel else 'false', json.dumps(n)))
                await pg.wait_for_timeout(500 if mel else 80)
                ok(await ev(pg, over) <= 0, '%s %s: %s px' % ('mel' if mel else 'plain', n, await ev(pg, over)))
                # the bar being played at the end of each line shows its tones inside the chart
                ends = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>[...r.querySelectorAll(".cell")].pop()).map(c=>CELLS.indexOf(c)).filter(i=>i>=0)')
                for i in ends:
                    await ev(pg, 'setCur(CELLS[%d])' % i)
                    ok(await ev(pg, over) <= 0, '%s %s bar %d playing: %s px' % ('mel' if mel else 'plain', n, i + 1, await ev(pg, over)))
                await ev(pg, 'setCur(null)')
        ok(not pg.errors, pg.errors)

@test
async def repeat_ties_follow_playing_order(c):
    # bar 2 ends tied; 1st ending (bar 3) and 2nd ending (bar 5) both start on that note
    chart = '|: C | C | 1. F | G :| 2. F | C |'
    mel = {'pickup': '', 'bars': ['E5w', 'G4h C5h~', 'C5h A4h', 'B4w', 'C5h D5h', 'E5w']}
    pg = await c.page(LAPTOP, storage={'chart': chart, 'melody': mel})
    await pg.wait_for_function('document.querySelector("#grid .staff")')
    ok(await ev(pg, 'chartSong.played.map') == [0, 1, 2, 3, 0, 1, 4, 5], 'order')
    ev_ = await ev(pg, 'getTimeline().events.filter(e=>e.voice===1).map(e=>[e.bar,e.wbar,e.midi,e.dur])')
    # first time: C5 in bar 2 ties into the 1st ending (2 + 2 beats), A4 follows
    ok([1, 1, 72, 4] in ev_ and not any(e[0] == 2 and e[2] == 72 for e in ev_), ev_)
    # second time: it ties into the 2nd ending instead; the 2nd ending's C5 isn't struck again
    ok([5, 1, 72, 4] in ev_ and not any(e[0] == 6 and e[2] == 72 for e in ev_), ev_)
    ok([6, 4, 74, 2] in ev_, 'D5 in the 2nd ending %s' % ev_)
    # the staff shows the tie coming into the 2nd ending
    ok(await ev(pg, 'tieIntoEnding(4,1,melNotesV(S.melody.bars[4],1)[0])'), 'tie arc into the 2nd ending')
    ok(not await ev(pg, 'tieIntoEnding(2,1,melNotesV(S.melody.bars[2],1)[0])'), 'not on the 1st ending')
    await c.shot(pg, 'repeat_tie')
    # Hear from the 2nd ending's bar starts at its first time through... which is after the repeat
    ok(await ev(pg, 'playedAt(4)') == 6 and await ev(pg, 'playedAt(1)') == 1, 'playedAt')
    # real playback: the 2nd ending's C5 is never struck (count C5 attacks: bar 2 twice only)
    await ev(pg, '(()=>{setBpm(300);S.countIn=0;S.melPlay=true;window.HITS=[];const mv=melVoice;window.melVoice=(m,...r)=>{HITS.push(m);return mv(m,...r)}})()')
    await pg.click('#play'); await pg.wait_for_timeout(7200); await pg.click('#play')
    hits = await ev(pg, 'HITS')
    ok(hits.count(72) == 2 and hits.count(74) == 1, hits)
    ok(not pg.errors, pg.errors)

@test
async def section_lines_fill_the_width(c):
    chart = '[A] | C | F | G |\n[B] | Am | Dm | G7 | C | F |'
    for dev in (PHONE, LAPTOP):
        for mel in (False, True):
            pg = await c.page(dev, storage={'chart': chart, 'showMel': mel, 'melody': {'pickup': '', 'bars': ['C5w']}})
            if mel: await pg.wait_for_function('document.querySelector("#grid .staff")')
            w = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>[r.querySelectorAll(".cell").length,Math.round(r.getBoundingClientRect().width)])')
            full = max(x[1] for x in w)
            ok(w[0][0] == 3 and w[0][1] >= full - 2, 'section A (3 bars) fills the line: %s' % w)
            ok(w[-1][0] < 4 and w[-1][1] < full - 20, 'the last line stays short: %s' % w)
            ok(not pg.errors, pg.errors)

@test
async def section_label_clear_of_chord_after_pickup(c):
    mel = {'pickup': 'G4e A4e B4e C5e D5e E5e', 'bars': ['F5e E5e D5e C5e B4e A4e G4e F4e', 'E4q G4q B4q D5q', 'C5w', 'A4w']}
    for dev in (PHONE, LAPTOP):
        pg = await c.page(dev, storage={'chart': '[A] | Bbmaj7 | Ebm7b5 Ab7 | Dbmaj7 | Gb7 |\n[B] | C | F |', 'melody': mel})
        await pg.wait_for_function('document.querySelector("#grid .staff")')
        r = await ev(pg, '(()=>{const l=CELLS[0].querySelector(".lbl").getBoundingClientRect(),c=CELLS[0].querySelector(".chd .cr").getBoundingClientRect();return [l.bottom,c.top]})()')
        ok(r[0] <= r[1], 'label above the chord: %s' % r)
        # only that line moves: section B starts its own line as usual
        rows = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>r.classList.contains("lblmid"))')
        ok(rows[0] and not any(rows[1:]), 'only the pickup line moves: %s' % rows)
        ok(not pg.errors, pg.errors)

@test
async def new_bar_carries_the_last_chord(c):
    pg = await c.page(LAPTOP, storage={'chart': '| C | Dm7 G7 |'})
    await pg.locator('#grid .cell').nth(1).click()
    await pg.click('#edInsert')
    ok(await ev(pg, 'splitChart(S.chart).map(b=>b.toks.join(" "))') == ['C', 'Dm7 G7', 'G7'], await ev(pg, 'S.chart'))
    ok(await ev(pg, 'ED.bar') == 2 and await ev(pg, 'chartSong.bars[2].length') == 0, 'shown as the chord carrying on')
    # one tap on a root changes it: no other chords to delete first
    await chip(pg, 'edRoots', 'C').click()
    ok(await ev(pg, 'splitChart(S.chart)[2].toks') == ['C7'], await ev(pg, 'S.chart'))   # the root changes, the quality stays
    # the + Bar at the end of the chart does the same; a held "/" bar looks back for its chord
    await ev(pg, 'applyChartText("| C | Dm7 G7 | / |")')
    await pg.click('#addBar')
    ok(await ev(pg, 'splitChart(S.chart).map(b=>b.toks.join(" "))') == ['C', 'Dm7 G7', '/', 'G7'], await ev(pg, 'S.chart'))
    ok(not pg.errors, pg.errors)

@test
async def editor_copy_cut_paste(c):
    chart = '[A] C | Am7 | Dm7 | G7 |\n[B] F | % | E7 | Am7 |'
    pg = await c.page(PHONE, storage={'chart': chart, 'melody': {'pickup': '', 'bars': ['C5w', 'A4w', '', '', 'F4h & C4h', '', '', '/']}})
    raw = lambda: ev(pg, 'splitChart(S.chart).map(b=>(b.label?"["+b.label+"] ":"")+b.toks.join(" "))')
    mel = lambda: ev(pg, 'S.melody.bars.slice(0,chartSong.bars.length)')
    await pg.locator('#grid .cell').nth(0).click()
    # select bars 1-4 (tap Select bars…, then bar 4)
    await pg.click('#edBars'); await pg.click('#mnSelect'); await pg.locator('#grid .cell').nth(3).click()
    ok(await ev(pg, '[SEL.a,SEL.b]') == [0, 3] and await pg.locator('#grid .cell.insel').count() == 4, 'selected 1-4')
    await pg.click('#edBars')
    await c.shot(pg, 'bars-menu')
    ok(await pg.text_content('#barsWhat') == 'Selected: bars 1–4', await pg.text_content('#barsWhat'))
    await pg.click('#mnCopy')
    ok(await ev(pg, 'CLIP.bars.length') == 4 and 'Copied' in await pg.text_content('#edMsg'), 'copied')
    # paste after bar 4 with no selection: AA
    await ev(pg, 'clearSelection();ED.bar=3;renderEditor()')
    await pg.click('#edBars')
    ok(await pg.text_content('#mnPaste') == 'Paste after bar 4', await pg.text_content('#mnPaste'))
    await pg.click('#mnPaste')
    r = await raw()
    ok(r[:9] == ['[A] C', 'Am7', 'Dm7', 'G7', '[A] C', 'Am7', 'Dm7', 'G7', '[B] F'], r)
    m = await mel()
    ok(m[:6] == ['C5w', 'A4w', '', '', 'C5w', 'A4w'] and m[8] == 'F4h & C4h' and m[11] == '/', m)
    ok(await ev(pg, 'ED.bar') == 4, 'on the pasted bars')
    # undo the paste in one step
    await pg.click('#edUndo')
    ok(len(await raw()) == 8, 'undo removes the whole paste')
    await pg.click('#edRedo')
    # paste over a selection replaces it (bar count changes): replace bars 10-11 (2 bars) with the 4 copied
    await ev(pg, 'ED.bar=9;setSelection(9,10)')
    await pg.click('#edBars'); await pg.click('#mnPaste')
    r = await raw()
    ok(len(r) == 14 and r[9:13] == ['[A] C', 'Am7', 'Dm7', 'G7'] and r[13] == 'Am7', r)
    # a "%" right after a change keeps its chord: cut bar 9 (F), bar 10 was "%" of F
    await ev(pg, 'applyChartText("| C | F | % | G |");melSet(0,"");ED.bar=1;SEL.a=SEL.b=null;renderGrid();renderEditor()')
    await pg.click('#edBars'); await pg.click('#mnCut')
    ok(await raw() == ['C', 'F', 'G'], await raw())
    # delete a range; Ctrl shortcuts on the laptop
    pg = await c.page(LAPTOP, storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(4).click()
    await pg.locator('#grid .cell').nth(7).click(modifiers=['Shift'])
    ok(await ev(pg, '[SEL.a,SEL.b]') == [4, 7], 'shift-click extends')
    await pg.keyboard.press('Control+c'); await ev(pg, 'clearSelection();ED.bar=11;renderEditor()')
    await pg.keyboard.press('Control+v')
    ok(await ev(pg, 'chartSong.bars.length') == 16, 'Ctrl+C, Ctrl+V')
    await ev(pg, 'setSelection(12,15)'); await pg.click('#edBars'); await pg.click('#edDelete')
    ok(await ev(pg, 'chartSong.bars.length') == 12, 'delete a range')
    # Loop these
    await ev(pg, 'ED.bar=0;setSelection(0,3)'); await pg.click('#edBars'); await pg.click('#mnLoop')
    ok(await ev(pg, 'S.loop') == {'a': 0, 'b': 3} and not await ev(pg, 'ED.open'), 'loop the selection')
    ok(not pg.errors, pg.errors)

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
            clip:[...c.querySelectorAll(".chd")].some(d=>d.getBoundingClientRect().right>c.querySelector(".ch").getBoundingClientRect().right+1)})))''')
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
async def song_message_confirms_then_fades(c):
    pg = await c.page(LAPTOP, storage={'chart': BLUES})
    await pg.locator('#songName input').fill('Fade test'); await pg.click('#saveSong')
    await pg.wait_for_timeout(300)
    ok((await pg.text_content('#songMsg')).startswith('Saved'), 'saved message shown')
    await pg.wait_for_timeout(4700)
    ok(await pg.text_content('#songMsg') == '', 'confirmation clears after a few seconds')
    # saving again shows it again
    await pg.click('#saveSong'); await pg.wait_for_timeout(300)
    ok((await pg.text_content('#songMsg')).startswith('Saved'), 'repeat save shows the message again')
    # a problem stays
    await pg.locator('#songName input').fill(''); await pg.click('#saveSong'); await pg.wait_for_timeout(5000)
    ok('name' in await pg.text_content('#songMsg'), 'problem message stays')

@test
async def drive_new_client_forgets_old_file(c):
    pg = await c.page(LAPTOP, storage={'driveOn': True, 'driveClient': 'old.apps.googleusercontent.com',
                                       'driveFile': 'OLDFILE', 'driveTok': {'t': 'x', 'exp': 9e15}, 'driveVer': 3})
    r = await ev(pg, '[store.get("driveFile",null),store.get("driveTok",null),store.get("driveClient",null)===GOOGLE.clientId,G.fileId,G.token,store.get("driveOn",false)]')
    ok(r == [None, None, True, None, None, True], r)

@test
async def composer_field(c):
    pg = await c.page(LAPTOP, storage={'chart': BLUES})
    await pg.locator('#songName input').fill('Blues for Dave'); await pg.locator('#songName input').press('Enter')
    await pg.locator('#composer input').fill('D. Krstin'); await pg.locator('#composer input').press('Enter')
    ok(await pg.text_content('#title') == 'Blues for Dave · D. Krstin · Swing', await pg.text_content('#title'))
    await pg.click('#saveSong')
    ok(await ev(pg, 'S.songs["Blues for Dave"].composer') == 'D. Krstin', 'saved with the song')
    await ev(pg, 'loadPreset("Blues in Bb")')
    ok(await ev(pg, 'S.composer') == '' and await pg.input_value('#composer input') == '', 'a preset has none')
    await ev(pg, 'loadSong("Blues for Dave")')
    ok(await pg.input_value('#composer input') == 'D. Krstin' and 'D. Krstin' in await pg.text_content('#title'), 'loaded back')
    await pg.reload(); await pg.wait_for_timeout(500)
    ok(await ev(pg, 'S.composer') == 'D. Krstin', 'remembered after reload')

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

# ---------------- melody ----------------
MEL = {'pickup': 'C5e D5e', 'bars': ['F5q D5e C5e A4h', 'Ab4e Bb4e C5e D5e F5h', 'Eb5q. C5e A4h', 'rq G4e A4e C5q Eb5q',
       'D5h. rq', 'D5e B4e Ab4e F4e D5q rq', 'C5w', 'rq F#4e A4e C5e Eb5e D5q', 'D5q. Bb4e G4h~', 'G4e G4e Bb4e C5e E5h',
       'F5q C5q F#4et A4et C5et D5q', 'G4h rq C5e D5e']}
MELSONG = {'chart': BLUES, 'melody': MEL, 'keySig': 'F', 'countIn': False}

async def mel_page(c, dev=PHONE, extra=None, scheme='dark'):
    st = dict(MELSONG); st.update(extra or {})
    pg = await c.page(dev, storage=st, scheme=scheme)
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    return pg

async def key_down(pg, m):
    # tap an on-screen key by its MIDI number
    await ev(pg, f'''(()=>{{const k=$("kb").querySelector('[data-m="{m}"]');const r=k.getBoundingClientRect();
      const o={{pointerId:{m},clientX:r.left+r.width/2,clientY:r.bottom-12,bubbles:true}};
      $("kb").dispatchEvent(new PointerEvent("pointerdown",o));$("kb").dispatchEvent(new PointerEvent("pointerup",o));0}})()''')

@test
async def melody_tokens(c):
    pg = await c.page()
    r = await ev(pg, '''[melBeats("F5q D5e C5e A4h"),melBeats("Eb5q. C5e A4h"),melBeats("C5et D5et E5et"),melTok("G4h~").tie,
      melTok("Bb4e").midi,melTok("x5q"),midiName(70,"F"),midiName(66,"D"),midiName(61,"C")]''')
    ok(r == [4, 4, 1, True, 70, None, 'Bb4', 'F#4', 'Db4'], r)

@test
async def melody_beaming(c):
    pg = await c.page()
    async def groups(str, style='swing'):
        return await ev(pg, f'(()=>{{setStyle("{style}");const ns=melNotes("{str}");let a=0;const st=ns.map(n=>{{const x=a;a+=n.beats;return x;}});return beamGroups(ns,st).map(g=>g.length)}})()')
    ok(await groups('C5e D5e E5e F5e G5e A5e B5e C6e') == [4, 4], 'eighths by half bar')
    ok(await groups('C5s D5s E5s F5s G5s A5s B5s C6s C5h') == [4, 4], 'sixteenths by beat')
    ok(await groups('C5e D5e re F5e G5e A5e B5e C6e') == [2, 4], 'a rest breaks the beam')
    ok(await groups('C5q D5e E5e F5e G5e A5q') == [2, 2], 'never across the middle of the bar')
    ok(await groups('C5e. D5s E5e F5e G5h') == [2, 2], 'a half bar with sixteenths beams by beat')
    ok(await groups('C5et D5et E5et F5e G5e A5h') == [3, 2], 'triplets beam by beat')
    ok(await groups('C5e D5e E5e F5e G5e A5e', 'waltz') == [6], '3/4: the bar beams as one')

@test
async def melody_filler_rests(c):
    pg = await c.page()
    async def fill(str, style='swing'):
        return await ev(pg, f'(()=>{{setStyle("{style}");return fillRests(melBeats("{str}"),curBpb())}})()')
    ok(await fill('') == ['w'], 'empty bar: whole-bar rest')
    ok(await fill('C5q D5q E5q') == ['q'], 'three quarters: quarter rest')
    ok(await fill('C5q D5q E5q re') == ['e'], 'then an eighth rest you added: eighth to finish')
    ok(await fill('C5q') == ['q', 'h'], 'beat 2: quarter, then half on beat 3')
    ok(await fill('C5h') == ['h'], 'half')
    ok(await fill('C5e') == ['e', 'q', 'h'], 'eighth to the beat, quarter, half')
    ok(await fill('C5s') == ['s', 'e', 'q', 'h'], 'sixteenth, eighth, quarter, half')
    ok(await fill('C5e.') == ['s', 'q', 'h'], 'after a dotted eighth')
    ok(await fill('C5et') == ['et', 'et', 'q', 'h'], 'finish the triplet')
    ok(await fill('C5q D5q', 'waltz') == ['q'], '3/4')
    ok(await fill('', 'waltz') == ['w'], '3/4 empty bar')
    ok(await fill('C5w') == [], 'full bar: nothing')
    # drawn on the staff, but not saved, not played, not tappable
    pg = await c.page(PHONE, storage={'chart': BLUES, 'melody': {'pickup': 'C5e', 'bars': ['F4q G4q A4q', '']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    rests = await ev(pg, 'document.querySelectorAll(".staff .vf-stavenote").length')
    ok(rests >= 4 + 12, f'filler rests drawn in every bar ({rests} notes/rests)')
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q A4q' and await ev(pg, 'getTimeline().events.filter(e=>e.bar===0).length') == 3, 'not stored or played')
    ok(await ev(pg, 'NOT.hits.get(0).filter(h=>h.ni!=null).length') == 3 and await ev(pg, 'NOT.hits.get(1).every(h=>h.ni==null)'), 'filler rests are not selectable notes')
    await tap_note(pg, 0, 2)
    x, y = await ev(pg, '''(()=>{const h=NOT.hits.get(0).find(h=>h.ni==null),row=CELLS[0].closest('.sys').getBoundingClientRect();return [row.left+h.x,row.top+48]})()''')
    await pg.mouse.click(x, y)
    ok(await ev(pg, '[ED.bar,ED.note]') == [0, None], 'tapping the filler rest: add at the end')
    await key_down(pg, 72)
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q A4q C5q', await ev(pg, 'melGet(0)'))
    await c.shot(pg, 'melody-filler-rests')
    ok(not pg.errors, pg.errors)

@test
async def melody_notation_renders(c):
    for dev, name in ((PHONE, 'phone'), (LAND, 'landscape'), (LAPTOP, 'laptop')):
        pg = await mel_page(c, dev, scheme='light' if name == 'laptop' else 'dark')
        await c.shot(pg, 'melody-' + name)
        ok(not pg.errors, (name, pg.errors))
        n = await ev(pg, 'document.querySelectorAll(".staff svg").length')
        rows = await ev(pg, 'document.querySelectorAll("#grid .sys").length')
        ok(n == rows and n >= 2, f'{name}: {n} staves for {rows} lines')
        ok(await pg.locator('#grid .cell.pick').count() == 1, 'pickup bar shown')
        ok(await ev(pg, 'document.documentElement.scrollWidth<=innerWidth'), name + ': horizontal scroll')
        # chord symbols never overlap within a bar
        bad = await ev(pg, '''[...document.querySelectorAll("#grid .cell")].filter(c=>{const r=[...c.querySelectorAll(".chd")].map(x=>x.getBoundingClientRect());
          return r.some((a,i)=>i&&a.left<r[i-1].right+2)}).map(c=>c.dataset.bar)''')
        ok(not bad, f'{name}: chord symbols overlap in bars {bad}')
    # chords-only view
    await pg.locator('sl-tab[panel="song"]').click()
    await pg.click('#cShowMel'); await pg.wait_for_timeout(200)
    ok(await ev(pg, 'document.querySelectorAll(".staff svg").length') == 0, 'Show melody off hides the staff')

@test
async def editor_hot_keys(c):
    pg = await c.page(LAPTOP, storage={'chart': '| C | F | G | C |'})
    await pg.locator('#grid .cell').nth(0).click()
    ok(await pg.is_visible('#edKeys'), 'the ? button shows on a laptop')
    await pg.keyboard.press('m')
    ok(await ev(pg, 'ED.part') == 'melody', 'M: melody')
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    # 4 . = dotted quarter, then 8 = eighth, R = rest, 2 = half
    await pg.keyboard.press('4'); await pg.keyboard.press('.')
    await key_down(pg, 72)
    await pg.keyboard.press('8'); await key_down(pg, 74)
    await pg.keyboard.press('r')
    await pg.keyboard.press('4'); await key_down(pg, 76)
    ok(await ev(pg, 'melGet(0)') == 'C5q. D5e re E5q', await ev(pg, 'melGet(0)'))
    # 3 = triplet eighths in bar 2
    await pg.keyboard.press('Shift+ArrowRight')
    ok(await ev(pg, 'ED.bar') == 1, 'Shift+Right: next bar %s' % await ev(pg, 'ED.bar'))
    await pg.keyboard.press('8'); await pg.keyboard.press('3')
    for m in (65, 67, 69): await key_down(pg, m)
    ok(await ev(pg, 'melGet(1)') == 'F4et G4et A4et', await ev(pg, 'melGet(1)'))
    # T ties the selected note to the next one
    await ev(pg, 'selectNote(2)'); await pg.keyboard.press('t')
    ok(await ev(pg, 'melGet(1)') == 'F4et G4et A4et~', await ev(pg, 'melGet(1)'))
    # V: voice 2; B: a new bar after this one
    await pg.keyboard.press('v')
    ok(await ev(pg, 'ED.voice') == 2, 'V: voice 2')
    await pg.keyboard.press('b')
    ok(await ev(pg, 'chartSong.bars.length') == 5 and await ev(pg, 'ED.bar') == 2, 'B: new bar')
    await pg.keyboard.press('m')
    ok(await ev(pg, 'ED.part') == 'chords', 'M: back to chords')
    # ? lists them
    await c.shot(pg, 'hot_keys_editor')
    await pg.keyboard.press('?'); await pg.wait_for_timeout(300)
    ok(await ev(pg, '$("keysDlg").open'), '? opens the list')
    await c.shot(pg, 'hot_keys')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    ok(not pg.errors, pg.errors)
    # no ? button on a phone
    pg = await c.page(PHONE, storage={'chart': BLUES})
    await pg.locator('#grid .cell').nth(0).click()
    ok(not await pg.is_visible('#edKeys'), 'no ? button on a phone')

@test
async def melody_step_entry_phone(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F'})
    await pg.locator('#grid .cell').nth(0).click()
    await pg.click('#edPartMel')
    ok(await pg.is_visible('#edMel') and await pg.is_visible('#kbArea'), 'melody editor keeps the keyboard on a phone')
    ok(not await pg.is_visible('#now'), 'now-playing steps aside while entering')
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await c.shot(pg, 'melody-entry-phone')
    await pg.click('#edLens [data-len="e"]')
    for m in (67, 69, 67, 64):          # G4 A4 G4 E4 eighths
        await key_down(pg, m)
    ok(await ev(pg, 'melGet(0)') == 'G4e A4e G4e E4e', await ev(pg, 'melGet(0)'))
    ok(await pg.text_content('#edFill') == '2 of 4 beats', await pg.text_content('#edFill'))
    await pg.click('#edLens [data-len="h"]')
    await key_down(pg, 65)               # F4 half fills the bar -> moves on
    ok(await ev(pg, 'ED.bar') == 1 and 'full' in await pg.text_content('#edMelMsg'), 'auto-advance')
    await pg.click('#edLens [data-len="q"]'); await pg.click('#edDot')
    await key_down(pg, 70)               # Bb4 dotted quarter (spelled for F major)
    await pg.click('#edLens [data-len="e"]')    # a new length starts without the dot
    await pg.click('#edRest')
    await pg.click('#edTri')
    for m in (67, 68, 69):
        await key_down(pg, m)
    ok(await ev(pg, 'melGet(1)') == 'Bb4q. re G4et Ab4et A4et', await ev(pg, 'melGet(1)'))
    await pg.click('#edMelDel')
    ok(await ev(pg, 'melGet(1)') == 'Bb4q. re G4et Ab4et', 'delete last note')
    # too long for the bar
    await pg.click('#edTri'); await pg.click('#edLens [data-len="w"]'); await key_down(pg, 72)
    ok('won' in await pg.text_content('#edMelMsg'), 'refuses a note that does not fit')
    # tie: the next note ties to the previous one
    await pg.click('#edPrev'); await pg.click('#edMelDel')            # bar 1: remove F4h
    await pg.click('#edLens [data-len="q"]'); await key_down(pg, 65); await pg.click('#edTie'); await key_down(pg, 65)
    ok(await ev(pg, 'melGet(0)') == 'G4e A4e G4e E4e F4q~ F4q', await ev(pg, 'melGet(0)'))
    # text mode
    await pg.click('#edText')
    inp = pg.locator('#edInput input')
    await inp.fill('F5q D5e C5e A4h'); await inp.press('Enter')
    ok(await ev(pg, 'ED.bar') == 1 and await ev(pg, 'melGet(1)') == 'F5q D5e C5e A4h', 'typed melody (bar 1 filled, so entry moved to bar 2)')
    await inp.fill('F5w D5q'); await inp.press('Enter')
    ok('beats' in await pg.text_content('#edErr'), 'typed melody too long')
    ok(not pg.errors, pg.errors)

@test
async def melody_edit_single_note_and_tie_across_bars(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F', 'melody': {'pickup': '', 'bars': ['F4q G4q A4q C5q~', 'C5h rh']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell').nth(0).click(); await pg.click('#edPartMel')
    notes = pg.locator('#edNotes .slot.note')
    ok(await notes.count() == 4, 'one (screen-reader) button per note')
    ok(await notes.nth(3).get_attribute('aria-label') == 'Note 4: C5, quarter, tied', await notes.nth(3).get_attribute('aria-label'))
    # tap note 2 on the staff, change its pitch: selection moves on to note 3
    await tap_note(pg, 0, 1)
    ok(await ev(pg, 'ED.note') == 1, 'tapping a note selects it')
    ok(await ev(pg, '!!document.querySelector(".staff .selnote")'), 'selected note marked on the staff')
    await key_down(pg, 70)
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q A4q C5q~' and await ev(pg, 'ED.note') == 2, await ev(pg, 'melGet(0)'))
    # a new length for note 3; too long is refused
    await pg.click('#edLens [data-len="e"]')
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q A4e C5q~', await ev(pg, 'melGet(0)'))
    await pg.click('#edLens [data-len="w"]')
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q A4e C5q~' and 'too long' in await pg.text_content('#edMelMsg'), 'too long refused')
    await pg.click('#edRest')
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q re C5q~', 'make rest')
    # Dave's case: redo the end of the bar, then tie its last note into the next bar
    await pg.click('#edAddEnd')
    await pg.click('#edMelDel')                        # remove the tied C5; the note before keeps no stray tie
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q re', await ev(pg, 'melGet(0)'))
    await pg.click('#edLens [data-len="e"]'); await key_down(pg, 69)   # A4 eighth
    await pg.click('#edLens [data-len="q"]')
    await pg.click('#oct' + 'Up'); await key_down(pg, 72); await pg.click('#octDn')   # C5 quarter fills the bar
    ok(await ev(pg, 'melGet(0)') == 'F4q Bb4q re A4e C5q' and await ev(pg, 'ED.bar') == 1, await ev(pg, 'melGet(0)'))
    await pg.click('#edPrev'); await tap_note(pg, 0, 4); await pg.click('#edTie')
    ok((await ev(pg, 'melGet(0)')).endswith('C5q~') and await pg.get_attribute('#edTie', 'aria-pressed') == 'true', 'tied across the barline')
    ok(await ev(pg, 'getTimeline().events.find(e=>e.bar===0&&e.midi===72).dur') == 3, 'playback holds C5 into bar 2')
    await pg.click('#edTie')
    ok((await ev(pg, 'melGet(0)')).endswith('C5q'), 'tie removed')
    # delete just the selected note
    await tap_note(pg, 0, 1); await pg.click('#edMelDel')
    ok(await ev(pg, 'melGet(0)') == 'F4q re A4e C5q', await ev(pg, 'melGet(0)'))
    await c.shot(pg, 'melody-note-select')
    ok(not pg.errors, pg.errors)

async def tap_note(pg, bar, ni):
    # tap a note on the staff (bar = chart bar index, -1 = pickup)
    x, y = await ev(pg, f'''(()=>{{const h=NOT.hits.get({bar}).find(h=>h.ni==={ni});const cell={bar}<0?document.querySelector('.cell.pick'):CELLS[{bar}];
      cell.scrollIntoView({{block:'nearest'}});const r=cell.closest('.sys').getBoundingClientRect();return [r.left+h.x,r.top+28+20]}})()''')
    await pg.mouse.click(x, y)

async def key_hold(pg, m):
    await ev(pg, f'''(()=>{{const k=$("kb").querySelector('[data-m="{m}"]');const r=k.getBoundingClientRect();
      $("kb").dispatchEvent(new PointerEvent("pointerdown",{{pointerId:{m},clientX:r.left+r.width/2,clientY:r.bottom-12,bubbles:true}}));0}})()''')
async def key_up(pg, m):
    await ev(pg, f'(()=>{{$("kb").dispatchEvent(new PointerEvent("pointerup",{{pointerId:{m},bubbles:true}}));0}})()')

@test
async def melody_chords(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F'})
    await pg.locator('#grid .cell').nth(0).click(); await pg.click('#edPartMel')
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.click('#edLens [data-len="h"]')
    # keys that overlap (not simultaneous) become one chord: hold F4, add A4, let go of F4, add C5 while A4 is held
    await key_hold(pg, 65); await pg.wait_for_timeout(150); await key_hold(pg, 69)
    await key_up(pg, 65); await key_hold(pg, 72)
    await key_up(pg, 69); await key_up(pg, 72)
    ok(await ev(pg, 'melGet(0)') == 'F4+A4+C5h', await ev(pg, 'melGet(0)'))
    # all keys up: the next key is a new note
    await key_down(pg, 70)
    ok(await ev(pg, 'melGet(0)') == 'F4+A4+C5h Bb4h', await ev(pg, 'melGet(0)'))
    # Chord toggle: one-finger taps stack onto the selected note; tap again to take one out
    await pg.click('#edPrev'); await tap_note(pg, 0, 1); await pg.click('#edChord')
    await key_down(pg, 62); await key_down(pg, 65)
    ok(await ev(pg, 'melGet(0)') == 'F4+A4+C5h D4+F4+Bb4h', await ev(pg, 'melGet(0)'))
    await key_down(pg, 62)
    ok(await ev(pg, 'melGet(0)') == 'F4+A4+C5h F4+Bb4h', 'tap again removes it: ' + await ev(pg, 'melGet(0)'))
    await c.shot(pg, 'melody-chords')
    ok(await pg.locator('#edNotes .slot.note').nth(1).get_attribute('aria-label') == 'Note 2: F4 and B flat4 (chord), half', await pg.locator('#edNotes .slot.note').nth(1).get_attribute('aria-label'))
    # the staff draws chords; playback / preview sound every note; keys light every note
    ok(await ev(pg, 'document.querySelectorAll(".staff .vf-stavenote .vf-notehead").length') >= 5, 'chord noteheads drawn')
    await ev(pg, 'window.__v=[];melVoice=(m,t,d,v)=>__v.push(m);0')
    await ev(pg, '(()=>{initAudio();ED.bar=0;hearBar();})()')
    ok(sorted(await ev(pg, '__v')) == [65, 65, 69, 70, 72], await ev(pg, '__v'))
    await ev(pg, 'showMel(getTimeline().events[0])')
    ok(await ev(pg, '[65,69,72].every(m=>$("kb").querySelector(`[data-m="${m}"]`).classList.contains("mel"))'), 'all chord notes violet')
    # typed chord, and tied chords merge in playback
    await ev(pg, 'melSet(1,"F4+A4h~ F4+A4h");melSet(2,"")')
    ok(await ev(pg, 'getTimeline().events.find(e=>e.bar===1).dur') == 4, 'tied chord held')
    ok(not pg.errors, pg.errors)

@test
async def melody_chord_mode_full_bar(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'C'})
    await pg.locator('#grid .cell').nth(0).click(); await pg.click('#edPartMel')
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.click('#edLens [data-len="w"]'); await pg.click('#edChord')
    for m in (60, 64, 67):                     # a whole-note C chord: the first note fills the bar
        await key_down(pg, m)
    ok(await ev(pg, 'melGet(0)') == 'C4+E4+G4w' and await ev(pg, 'ED.bar') == 0, 'stayed to finish the chord: ' + await ev(pg, 'melGet(0)'))
    ok('Finish the chord' in await pg.text_content('#edMelMsg'), 'says what to do')
    # a length starts the next chord, which goes in the next bar
    await pg.click('#edLens [data-len="h"]')
    for m in (62, 65):
        await key_down(pg, m)
    await pg.click('#edLens [data-len="h"]')
    for m in (64, 67):
        await key_down(pg, m)
    ok(await ev(pg, '[melGet(0),melGet(1)]') == ['C4+E4+G4w', 'D4+F4h E4+G4h'], await ev(pg, '[melGet(0),melGet(1)]'))
    ok(await ev(pg, 'ED.bar') == 1, 'still in bar 2 (full, but building chords)')
    # turning Chord on starts a fresh chord instead of stacking onto the last one
    await pg.click('#edChord'); await pg.click('#edChord'); await key_down(pg, 69)
    ok(await ev(pg, '[melGet(1),melGet(2),ED.bar]') == ['D4+F4h E4+G4h', 'A4h', 2], await ev(pg, '[melGet(1),melGet(2),ED.bar]'))
    # single notes: a key in a full bar carries on in the next bar
    await pg.click('#edChord'); await ev(pg, 'ED.bar=1;renderEditor()'); await key_down(pg, 72)
    ok(await ev(pg, '[melGet(1),melGet(2)]') == ['D4+F4h E4+G4h', 'A4h C5h'], await ev(pg, '[melGet(1),melGet(2)]'))
    ok(not pg.errors, pg.errors)

@test
async def melody_delete_key(c):
    pg = await c.page(LAPTOP, storage={'chart': BLUES, 'melody': {'pickup': '', 'bars': ['F4q G4q A4q C5q']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell:not(.pick)').nth(0).click(); await pg.click('#edPartMel')
    await tap_note(pg, 0, 1)
    await pg.keyboard.press('Delete')
    ok(await ev(pg, 'melGet(0)') == 'F4q A4q C5q', 'Delete removes the selected note')
    await pg.click('#edAddEnd')
    await pg.keyboard.press('Backspace')
    ok(await ev(pg, 'melGet(0)') == 'F4q A4q', 'Backspace removes the last note')
    # not while typing
    await pg.click('#edText'); await pg.locator('#edInput input').focus(); await pg.keyboard.press('Backspace')
    ok(await ev(pg, 'melGet(0)') == 'F4q A4q', 'typing keeps Backspace')

@test
async def melody_tap_notes_on_staff(c):
    pg = await mel_page(c, PHONE)
    # editor closed: tapping a note opens Melody with it selected
    await tap_note(pg, 5, 2)
    ok(await ev(pg, '[ED.open,ED.part,ED.bar,ED.note]') == [True, 'melody', 5, 2], await ev(pg, '[ED.open,ED.part,ED.bar,ED.note]'))
    ok(await ev(pg, '!!document.querySelector(".staff .selnote")') and await pg.is_visible('#edAddEnd'), 'marked; Add at end shown')
    ok(await ev(pg, '$("edNotes").getBoundingClientRect().width') <= 1, 'no note-button row on screen')
    # tap well after the last note (bar 7 is one whole note): back to adding
    await tap_note(pg, 6, 0)
    ok(await ev(pg, '[ED.bar,ED.note]') == [6, 0], 'whole note selected')
    x, y = await ev(pg, '''(()=>{const r=CELLS[6].getBoundingClientRect(),row=CELLS[6].closest('.sys').getBoundingClientRect();return [r.right-8,row.top+48]})()''')
    await pg.mouse.click(x, y)
    ok(await ev(pg, 'ED.note') is None and await ev(pg, 'ED.open'), 'tap past the last note: add at the end')
    # tap the chord symbols: Chords
    x, y = await ev(pg, '''(()=>{const r=CELLS[7].getBoundingClientRect();return [r.left+30,r.top+16]})()''')
    await pg.mouse.click(x, y)
    ok(await ev(pg, '[ED.bar,ED.part]') == [7, 'chords'], await ev(pg, '[ED.bar,ED.part]'))
    # pickup notes are tappable too
    await tap_note(pg, -1, 1)
    ok(await ev(pg, '[ED.bar,ED.note,ED.part]') == [-1, 1, 'melody'], await ev(pg, '[ED.bar,ED.note,ED.part]'))
    await c.shot(pg, 'melody-tap-note')
    ok(not pg.errors, pg.errors)

@test
async def melody_insert_notes(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F', 'melody': {'pickup': '', 'bars': ['F4q A4q C5q', 'F4q G4q A4q Bb4q']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await tap_note(pg, 0, 1)                          # select A4
    ok(await pg.is_visible('#edInsNote'), 'Insert shown with a note selected')
    await pg.click('#edInsNote')
    await pg.click('#edLens [data-len="e"]')          # in Insert, a length is for the new notes
    ok(await ev(pg, 'melGet(0)') == 'F4q A4q C5q', 'the selected note keeps its length')
    await key_down(pg, 67)                            # G4 eighth before A4
    ok(await ev(pg, 'melGet(0)') == 'F4q G4e A4q C5q' and await ev(pg, 'ED.note') == 2, await ev(pg, 'melGet(0)'))
    await pg.click('#edRest')                         # an eighth rest before A4 too
    ok(await ev(pg, 'melGet(0)') == 'F4q G4e re A4q C5q', await ev(pg, 'melGet(0)'))
    await key_down(pg, 69)                            # bar is full now
    ok('full' in await pg.text_content('#edMelMsg') and await ev(pg, 'melGet(0)') == 'F4q G4e re A4q C5q', 'full bar refuses')
    # Insert off: a key changes the selected note again
    await pg.click('#edInsNote'); await key_down(pg, 70)
    ok(await ev(pg, 'melGet(0)') == 'F4q G4e re Bb4q C5q', await ev(pg, 'melGet(0)'))
    # held keys make an inserted chord
    await ev(pg, 'melSet(0,"F4q A4q C5q");ED.note=1;ED.insert=true;renderGrid();renderEditor()')
    await key_hold(pg, 64); await key_hold(pg, 67); await key_up(pg, 64); await key_up(pg, 67)
    ok(await ev(pg, 'melGet(0)') == 'F4q E4+G4q A4q C5q', await ev(pg, 'melGet(0)'))
    ok(not pg.errors, pg.errors)

@test
async def editing_keeps_the_bar_in_view(c):
    # a long chart with a melody; tap a note low on the screen: once the editor is open the bar must be visible
    long = BLUES + '\n' + BLUES
    pg = await mel_page(c, PHONE, extra={'chart': long, 'melody': {'pickup': '', 'bars': MEL['bars'] * 2}})
    for bar in (6, 9, 2):
        await ev(pg, 'closeEditor&&ED.open&&closeEditor()')
        x, y = await ev(pg, f'''(()=>{{const c=CELLS[{bar}];c.scrollIntoView({{block:'end'}});const h=NOT.hits.get({bar})[0],r=c.closest('.sys').getBoundingClientRect();return [r.left+h.x,r.top+48]}})()''')
        await pg.mouse.click(x, y); await pg.wait_for_timeout(400)
        r = await ev(pg, f'''(()=>{{const w=$("chartWrap").getBoundingClientRect(),r=CELLS[{bar}].closest('.sys').getBoundingClientRect();return [ED.open,ED.bar,r.top>=w.top-1&&r.bottom<=w.bottom+1]}})()''')
        ok(r == [True, bar, True], f'bar {bar+1}: {r}')
    await c.shot(pg, 'edit-bar-in-view')

@test
async def melody_arrow_keys_step_notes(c):
    pg = await c.page(LAPTOP, storage={'chart': BLUES, 'melody': {'pickup': '', 'bars': ['F4h G4h', 'A4w']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await tap_note(pg, 0, 0)
    seen = []
    for _ in range(4):
        await pg.keyboard.press('ArrowRight'); seen.append(await ev(pg, '[ED.bar,ED.note]'))
    ok(seen == [[0, 1], [0, None], [1, 0], [1, None]], seen)
    await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowLeft')
    ok(await ev(pg, '[ED.bar,ED.note]') == [0, 1], await ev(pg, '[ED.bar,ED.note]'))
    # screen-reader / keyboard route: the note buttons appear when tabbed to
    await pg.locator('#edNotes .slot.note').first.focus()
    ok(await ev(pg, '$("edNotes").getBoundingClientRect().width') > 100, 'note buttons show when focused')

@test
async def undo_redo(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F', 'melody': {'pickup': '', 'bars': ['F4q G4q']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell:not(.pick)').nth(0).click(); await pg.click('#edPartMel')
    ok(await pg.locator('#edUndo').is_disabled() and await pg.locator('#edRedo').is_disabled(), 'nothing to undo at first')
    await pg.click('#edLens [data-len="q"]')
    await key_down(pg, 69); await key_down(pg, 72)     # A4, then C5 fills the bar -> on to bar 2
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q A4q C5q' and await ev(pg, 'ED.bar') == 1, 'entered')
    await pg.click('#edUndo')
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q A4q' and await ev(pg, 'ED.bar') == 0, 'undo one note, back in bar 1')
    await pg.click('#edUndo')
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q', 'undo again')
    await pg.click('#edRedo'); await pg.click('#edRedo')
    ok(await ev(pg, 'melGet(0)') == 'F4q G4q A4q C5q' and await pg.locator('#edRedo').is_disabled(), 'redo both')
    # chords and bar inserts too, one step each
    ok(await ev(pg, 'ED.bar') == 1, 'redo puts you back where entry had moved on to')
    await pg.click('#edPartCh'); await pg.click('#edPrev')
    await chip(pg, 'edQuals', 'maj7').click()
    ok(await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'Fmaj7', await ev(pg, 'splitChart(S.chart)[0].toks.join()'))
    await pg.click('#edInsert')
    ok(await ev(pg, 'chartSong.bars.length') == 13 and await ev(pg, 'S.melody.bars[1]') == '', 'inserted')
    await pg.click('#edUndo')
    ok(await ev(pg, 'chartSong.bars.length') == 12 and await ev(pg, 'S.melody.bars[0]') == 'F4q G4q A4q C5q', 'insert undone in one step')
    await pg.click('#edUndo')
    ok(await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'F7', 'chord change undone')
    # a new change clears redo
    await chip(pg, 'edQuals', 'm7').click()
    ok(await pg.locator('#edRedo').is_disabled(), 'new change clears redo')
    # keyboard shortcuts (not while typing)
    await pg.keyboard.press('Control+z')
    ok(await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'F7', 'Ctrl+Z')
    await pg.keyboard.press('Control+Shift+z')
    ok(await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'Fm7', 'Ctrl+Shift+Z')
    await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+y')
    ok(await ev(pg, 'splitChart(S.chart)[0].toks.join()') == 'Fm7', 'Ctrl+Y')
    # loading a song starts fresh
    await ev(pg, 'loadPreset("Blues in Bb")'); await pg.wait_for_timeout(50)
    ok(await ev(pg, 'HIST.undo.length') == 0, 'fresh history after loading')
    ok(not pg.errors, pg.errors)

@test
async def melody_rhythm_slashes(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'melody': {'pickup': '', 'bars': ['F4w']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell:not(.pick)').nth(1).click(); await pg.click('#edPartMel')
    await pg.click('#edSlash')
    ok(await ev(pg, 'melGet(1)') == '/' and await ev(pg, 'ED.bar') == 2, 'bar 2 slashes, on to bar 3')
    await pg.click('#edPrev')
    ok(await pg.get_attribute('#edSlash', 'aria-pressed') == 'true', 'button shows on')
    ok(await ev(pg, 'NOT.hits.get(1).length') == 4 and await ev(pg, 'NOT.hits.get(1).every(h=>h.ni==null)'), 'four slashes, not selectable')
    ok(await ev(pg, 'getTimeline().events.filter(e=>e.bar===1).length') == 0 and await ev(pg, 'melBeats(melGet(1))') == 0, 'slashes play nothing')
    # chords sit over their beat's slash
    await ev(pg, 'ED.open&&closeEditor()')
    await ev(pg, 'applyChartText("| F7 | Bb7 C7 | F7 |")'); await pg.wait_for_timeout(200)
    xs = await ev(pg, '''(()=>{const c=CELLS[1],ch=[...c.querySelectorAll(".chd")].map(x=>x.getBoundingClientRect().left),
      row=c.closest(".sys").getBoundingClientRect(),h=NOT.hits.get(1).map(h=>row.left+h.x);return [ch,h]})()''')
    ok(abs(xs[0][1] - xs[1][2]) < 14, f'second chord over beat 3: {xs}')
    # a key in a slash bar starts its melody
    await pg.locator('#grid .cell:not(.pick)').nth(1).click(); await pg.click('#edPartMel')
    await pg.click('#edLens [data-len="h"]'); await key_down(pg, 70)
    ok(await ev(pg, 'melGet(1)') == 'A#4h' or await ev(pg, 'melGet(1)') == 'Bb4h', await ev(pg, 'melGet(1)'))
    ok(await pg.get_attribute('#edSlash', 'aria-pressed') == 'false', 'no longer slashes')
    await pg.click('#edUndo')
    ok(await ev(pg, 'melGet(1)') == '/', 'undo brings the slashes back')
    # typed
    await pg.click('#edSlash'); ok(await ev(pg, 'melGet(1)') == '', 'toggled off')
    await pg.click('#edText'); inp = pg.locator('#edInput input'); await inp.fill('/'); await inp.press('Enter')
    ok(await ev(pg, 'melGet(1)') == '/' and await pg.text_content('#edErr') == '', 'typed /: ' + await ev(pg, 'melGet(1)'))
    await c.shot(pg, 'melody-slashes')
    ok(not pg.errors, pg.errors)

@test
async def melody_second_voice(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'keySig': 'F', 'melody': {'pickup': '', 'bars': ['C5e D5e E5e F5e G5h']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell:not(.pick)').nth(0).click(); await pg.click('#edPartMel')
    await pg.click('#edV2')
    ok(await pg.get_attribute('#edV2', 'aria-pressed') == 'true' and await pg.text_content('#edFill') == '0 of 4 beats', 'voice 2 starts empty')
    await pg.click('#edLens [data-len="h"]'); await key_down(pg, 69); await key_down(pg, 65)
    ok(await ev(pg, 'melGet(0)') == 'C5e D5e E5e F5e G5h & A4h F4h', await ev(pg, 'melGet(0)'))
    ok(await ev(pg, 'ED.bar') == 1 and await ev(pg, 'ED.voice') == 2, 'voice 2 full: on to bar 2, still voice 2')
    # voice 1 untouched by voice-2 edits; beats counted per voice
    ok(await ev(pg, 'melBeats(melGet(0))') == 4 and await ev(pg, 'melNotesV(melGet(0),2).length') == 2, 'per voice')
    # stems: voice 1 up, voice 2 down
    dirs = await ev(pg, '(()=>{const b=vfBar(melGet(0));return b.voices.map(v=>v.notes.filter((n,i)=>!v.meta[i].filler).map(n=>n.getStemDirection()))})()')
    ok(dirs == [[1, 1, 1, 1, 1], [-1, -1]], dirs)
    # playback plays both; the held voice-2 note overlaps the moving line
    ev1 = await ev(pg, 'getTimeline().events.filter(e=>e.bar===0).map(e=>[e.voice,e.midi,e.start,e.dur])')
    ok([2, 69, 0, 2] in ev1 and [1, 72, 0, 0.5] in ev1 and len(ev1) == 7, ev1)
    await ev(pg, 'window.__v=[];melVoice=(m,t,d,v,b)=>__v.push(m);0')
    await pg.click('#edPrev'); await pg.click('#edHear')
    ok(sorted(await ev(pg, '__v')) == [65, 69, 72, 74, 76, 77, 79], await ev(pg, '__v'))
    # tapping a low note picks voice 2, a high one voice 1
    await tap_note(pg, 0, 0)
    sel = await ev(pg, '[ED.voice,ED.note]')
    x, y = await ev(pg, '''(()=>{const h=NOT.hits.get(0).find(h=>h.v===2&&h.ni===1),row=CELLS[0].closest('.sys').getBoundingClientRect(),lift=+(CELLS[0].closest('.sys').dataset.lift||0);return [row.left+h.x,row.top+28+lift+h.y]})()''')
    await pg.mouse.click(x, y)
    ok(await ev(pg, '[ED.voice,ED.note]') == [2, 1], 'tap the low F4: voice 2, note 2')
    x, y = await ev(pg, '''(()=>{const h=NOT.hits.get(0).find(h=>h.v===1&&h.ni===4),row=CELLS[0].closest('.sys').getBoundingClientRect(),lift=+(CELLS[0].closest('.sys').dataset.lift||0);return [row.left+h.x,row.top+28+lift+h.y]})()''')
    await pg.mouse.click(x, y)
    ok(await ev(pg, '[ED.voice,ED.note]') == [1, 4], 'tap the high G5: voice 1, note 5')
    # editing a selected voice-2 note; undo; text mode shows the voice
    await ev(pg, 'setVoice(2);selectNote(0)'); await key_down(pg, 67)
    ok(await ev(pg, 'melGet(0)') == 'C5e D5e E5e F5e G5h & G4h F4h', await ev(pg, 'melGet(0)'))
    await pg.click('#edUndo')
    ok(await ev(pg, 'melGet(0)') == 'C5e D5e E5e F5e G5h & A4h F4h' and await ev(pg, 'ED.voice') == 2, 'undo, still voice 2')
    await pg.click('#edText')
    ok(await pg.input_value('#edInput input') == 'A4h F4h', 'text mode shows voice 2')
    await pg.click('#edText')
    # the pickup has one voice
    await ev(pg, 'ED.bar=-1;renderEditor()')
    ok(await pg.locator('#edV2').is_disabled() and await ev(pg, 'ED.voice') == 1, 'pickup: voice 1 only')
    # saved with the song
    ok(' & ' in await ev(pg, 'JSON.stringify(S.melody)'), 'stored')
    await c.shot(pg, 'melody-two-voices')
    ok(not pg.errors, pg.errors)

@test
async def melody_clears_chord_symbols(c):
    # two voices force voice-1 stems up; high notes would hit the chord symbols
    for dev in (PHONE, LAPTOP):
        pg = await c.page(dev, storage={'chart': '| Fmaj7 | Gm7 C7 | Am7 D7 | Gm7 C7 |', 'keySig': 'F',
            'melody': {'pickup': '', 'bars': ['F5e G5e A5e Bb5e C6h & A4h F4h', 'D5q E5q F5h & Bb3w', 'C6w', 'G4q A4q Bb4h']}})
        await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
        bad = await ev(pg, '''(()=>{const out=[];for(const row of document.querySelectorAll("#grid .sys")){
            const st=row.querySelector(".staff");if(!st)continue;
            const marks=[...st.querySelectorAll("svg path,svg rect,svg text")].map(e=>e.getBoundingClientRect()).filter(r=>r.width||r.height);
            for(const ch of row.querySelectorAll(".chd")){const c=ch.getBoundingClientRect();
              if(marks.some(m=>m.top<c.bottom-2&&m.bottom>c.top&&m.left<c.right&&m.right>c.left))out.push(ch.textContent);}
            const next=row.nextElementSibling;
            if(next&&next.classList.contains("sys")){const nb=next.getBoundingClientRect().top;if(marks.some(m=>m.bottom>nb+1))out.push("into next line");}}
          return out})()''')
        ok(not bad, f'notation overlaps: {bad}')
        lifts = await ev(pg, '[...document.querySelectorAll("#grid .sys")].map(r=>+(r.dataset.lift||0))')
        ok(any(lifts), 'a line moved down to make room')
        await c.shot(pg, 'melody-clear-chords-' + ('phone' if dev is PHONE else 'laptop'))
        ok(not pg.errors, pg.errors)
    # an ordinary melody stays compact
    pg = await mel_page(c, PHONE)
    ok(await ev(pg, '[...document.querySelectorAll("#grid .sys")].filter(r=>+(r.dataset.lift||0)>12+(S.chartTones?TONES_H:0)).length') == 0, 'ordinary lines barely move')

@test
async def melody_pickup_and_bar_ops(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'melody': {'pickup': '', 'bars': ['F5w', 'Bb4w', 'A4w']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await pg.locator('#grid .cell:not(.pick)').nth(0).click()
    await pg.click('#edPartMel'); await pg.click('#edPrev')
    ok(await ev(pg, 'ED.bar') == -1 and await pg.text_content('#edTitle') == 'Pickup', 'pickup reachable from bar 1')
    ok(await pg.locator('#edPartCh').is_disabled(), 'no chords in a pickup')
    await pg.click('#edLens [data-len="e"]'); await key_down(pg, 60); await key_down(pg, 62)
    ok(await ev(pg, 'S.melody.pickup') == 'C4e D4e' and await pg.locator('#grid .cell.pick').count() == 1, 'pickup entered')
    # insert/delete bars keep the melody with its bar
    await pg.click('#edNext'); await pg.click('#edNext')               # bar 2 (index 1)
    await pg.click('#edInsert')
    ok(await ev(pg, 'S.melody.bars.slice(0,4)') == ['F5w', 'Bb4w', '', 'A4w'], await ev(pg, 'S.melody.bars.slice(0,4)'))
    await pg.click('#edBars'); await pg.click('#edDelete')
    ok(await ev(pg, 'S.melody.bars.slice(0,3)') == ['F5w', 'Bb4w', 'A4w'], await ev(pg, 'S.melody.bars.slice(0,3)'))

@test
async def melody_playback_pickup_and_highlight(c):
    pg = await mel_page(c, extra={'countIn': True, 'bpm': 240, 'melKeys': True})
    await ev(pg, 'window.__mel=[];const _s=showMel;showMel=e=>{if(e)__mel.push([e.bar,e.ni,performance.now()]);_s(e);};0')
    await pg.click('#play'); await pg.wait_for_timeout(1700)
    seen = await ev(pg, '__mel.map(x=>x[0]+":"+x[1])')
    ok(seen[:2] == ['-1:0', '-1:1'] and '0:0' in seen, f'pickup should play at the end of the count-in: {seen[:6]}')
    ok(await ev(pg, '!!document.querySelector(".staff .cur")'), 'current note highlighted on the staff')
    await pg.click('#play')
    # without a count-in the pickup still plays first, alone
    pg = await mel_page(c, extra={'countIn': False, 'bpm': 240})
    await ev(pg, 'window.__mel=[];const _s=showMel;showMel=e=>{if(e)__mel.push(e.bar+":"+e.ni);_s(e);};0')
    await pg.click('#play'); await pg.wait_for_timeout(900)
    seen = await ev(pg, '__mel')
    ok(seen[:3] == ['-1:0', '-1:1', '0:0'], seen[:4])
    await pg.click('#play')
    ok(not pg.errors, pg.errors)

@test
async def chart_scroll_reads_ahead(c):
    # 24 bars of melody on a phone: lines are taller than the view can hold
    long = BLUES + '\n' + BLUES
    pg = await mel_page(c, PHONE, extra={'chart': long, 'melody': {'pickup': '', 'bars': MEL['bars'] * 2}})
    rows = await ev(pg, 'document.querySelectorAll("#grid .sys").length')
    for bar in (5, 9, 13, 17, 21):
        await ev(pg, f'(()=>{{const c=CELLS[{bar}];curCell=null;followLine(c);}})()')
        await pg.wait_for_timeout(500)
        r = await ev(pg, f'''(()=>{{const w=$("chartWrap").getBoundingClientRect(),row=CELLS[{bar}].closest(".sys"),nx=row.nextElementSibling;
          const a=row.getBoundingClientRect();const fits=!nx||!nx.classList.contains("sys")||nx.getBoundingClientRect().bottom<=w.bottom+1;
          return [a.top>=w.top-1&&a.bottom<=w.bottom+1,fits]}})()''')
        ok(r[0], f'bar {bar+1}: playing line not fully visible')
        ok(r[1], f'bar {bar+1}: next line not visible')
    # starting a loop selection, picking bars and cancelling keep the chart where it is
    await ev(pg, '$("chartWrap").scrollTop=400'); await pg.wait_for_timeout(100)
    top = await ev(pg, '$("chartWrap").scrollTop')
    for js in ('startLoopSelect()', 'loopTap(16)', 'loopTap(18)', 'clearLoop()'):
        await ev(pg, js); await pg.wait_for_timeout(100)
        ok(abs(await ev(pg, '$("chartWrap").scrollTop') - top) < 2, f'{js} jumped the chart')
    # back to bar 1 scrolls up again
    await ev(pg, 'followLine(CELLS[0])'); await pg.wait_for_timeout(1500)
    st = await ev(pg, '$("chartWrap").scrollTop')
    ok(st < 5, 'scrolls back to the top: %s' % st)

@test
async def melody_hear_bar_honours_ties(c):
    pg = await c.page(storage={'chart': '| C | C | C |', 'melody': {'pickup': '', 'bars': ['E4q F4q~ F4q G4q~', 'G4h A4h~', 'A4q rq rh']}, 'bpm': 60})
    await ev(pg, 'window.__v=[];melVoice=(m,t,d)=>__v.push([m,Math.round((t-ctx.currentTime)*100)/100,Math.round(d*100)/100]);0')
    async def hear(bar):
        return await ev(pg, f'(()=>{{initAudio();__v=[];ED.bar={bar};hearBar();return __v.map(x=>[x[0],x[2]])}})()')
    r = await hear(0)   # E4 1 beat; F4 tied over 2 beats; G4 tied into bar 2, rings 3 beats in all
    ok(r == [[64, 0.95], [65, 1.9], [67, 2.85]], r)
    r = await hear(1)   # G4 carried in from bar 1 sounds at once for its last 2 beats; A4 tied on
    ok(r == [[67, 1.9], [69, 2.85]], r)

@test
async def melody_hear_from_here(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'bpm': 240, 'melody': {'pickup': 'C5e D5e', 'bars': ['F4q G4q A4q C5q', 'Bb4h~ Bb4h', 'A4w']}})
    await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
    await ev(pg, 'window.__v=[];const _mv=melVoice;melVoice=(m,t,d,v,b)=>{__v.push([m,Math.round(d*100)/100]);_mv(m,t,d,v,b);};0')
    await tap_note(pg, 0, 1); await pg.click('#edAddEnd')
    await pg.click('#edHearAll')
    ok(await pg.get_attribute('#edHearAll', 'aria-pressed') == 'true' and await pg.text_content('#edHearAllLabel') == 'Stop', 'playing')
    ok(await ev(pg, '__v.map(x=>x[0])') == [65, 67, 69, 72, 70, 69], await ev(pg, '__v'))
    ok(await ev(pg, '__v[4][1]') == 0.95, 'tied Bb held for 4 beats (at 240 bpm)')
    await pg.wait_for_timeout(1200)
    ok(await ev(pg, '!!document.querySelector("#grid .cell.cur")') and await ev(pg, '!!document.querySelector(".staff .cur")'), 'bar and note lit while hearing')
    await pg.click('#edHearAll')
    ok(await pg.get_attribute('#edHearAll', 'aria-pressed') == 'false' and not await ev(pg, '!!document.querySelector("#grid .cell.cur")'), 'stops')
    # from the pickup: the whole song
    await pg.click('#edPrev'); await ev(pg, '__v=[]'); await pg.click('#edHearAll')
    ok((await ev(pg, '__v.map(x=>x[0])'))[:3] == [72, 74, 65], 'from the pickup')
    # Play stops the preview
    await pg.click('#play'); await pg.wait_for_timeout(200)
    ok(await ev(pg, '!PREV.on'), 'Play stops the preview'); await pg.click('#play')
    # with a loop: just the looped bars
    await ev(pg, 'setLoop(1,2)'); await pg.locator('#grid .cell:not(.pick)').nth(0).click(); await pg.click('#edPartMel')
    ok(await pg.text_content('#edHearAllLabel') == 'Hear the loop', 'loop label')
    await ev(pg, '__v=[]'); await pg.click('#edHearAll')
    ok(await ev(pg, '__v.map(x=>x[0])') == [70, 69], await ev(pg, '__v'))
    ok(not pg.errors, pg.errors)

@test
async def melody_on_keys(c):
    pg = await c.page(PHONE, storage={'chart': '| C | C |', 'melody': {'pickup': '', 'bars': ['E4h G4h', 'C5w']}, 'oct': 4})
    await ev(pg, 'showMel(getTimeline().events[0])')
    ok(await ev(pg, '$("kb").querySelector("[data-m=\'64\']").classList.contains("mel")'), 'melody note violet')
    ok(await ev(pg, '$("kb").querySelector("[data-m=\'67\']").classList.contains("melnext")'), 'next note outlined')
    await ev(pg, 'setMelKeys(false);showMel(getTimeline().events[0])')
    ok(await ev(pg, '!$("kb").querySelector(".mel,.melnext")'), 'switch turns it off')
    # the main-screen button only where there's room
    ok(not await pg.is_visible('#melKeysBtn'), 'no Melody button on a phone in portrait')
    for dev in (LAND, LAPTOP):
        pg = await c.page(dev)
        ok(await pg.is_visible('#melKeysBtn'), 'Melody button in landscape / laptop')
        await pg.click('#melKeysBtn')
        ok(await ev(pg, 'S.melKeys') is False and await pg.get_attribute('#melKeysBtn', 'aria-pressed') == 'false', 'toggles')

@test
async def melody_record_transcribe(c):
    pg = await c.page(storage={'chart': BLUES})
    # beats at 0.5 s, swing 62%: C5 quarter, eighth rest, D5 on the swung "and", E5 half
    r = await ev(pg, '''(()=>{REC.from=0;REC.to=0;REC.marks=[0,1,2,3].map(b=>({t:b*0.5,bar:0,beat:b,beatDur:0.5,sw:0.62}));
      REC.notes=[{m:72,t:0.0,off:0.47},{m:74,t:0.81,off:0.98},{m:76,t:1.0,off:1.98}];
      return [recTranscribe(false)[0],recTranscribe(true)[0]]})()''')
    ok(r[0] == 'C5q re D5e E5h', 'snapped: ' + r[0])
    ok(r[1].startswith('C5q') and 'E5h' in r[1], 'as played: ' + r[1])
    # a note held across the barline is tied
    r = await ev(pg, '''(()=>{REC.from=0;REC.to=1;REC.marks=[0,1,2,3,4,5,6,7].map(b=>({t:b*0.5,bar:b>>2,beat:b%4,beatDur:0.5,sw:0.62}));
      REC.notes=[{m:65,t:1.0,off:2.95}];return recTranscribe(false)})()''')
    ok(r == ['rh F4h~', 'F4h rh'], r)

@test
async def melody_record_flow(c):
    pg = await c.page(PHONE, storage={'chart': BLUES, 'bpm': 240})
    await pg.locator('#grid .cell').nth(2).click()
    await pg.click('#edPartMel')
    ok(await pg.get_attribute('#edRec', 'aria-label') == 'Record from bar 3', await pg.get_attribute('#edRec', 'aria-label'))
    await pg.click('#edRec')
    ok(await ev(pg, 'REC.on&&P.playing') and await ev(pg, 'document.body.classList.contains("recording")'), 'recording')
    await pg.wait_for_function('REC.marks.length>2', timeout=6000)
    await key_down(pg, 65); await pg.wait_for_timeout(300); await key_down(pg, 69)
    await pg.wait_for_timeout(300)
    await pg.click('#play')
    ok(await pg.is_visible('#recPanel') and not await ev(pg, 'P.playing'), 'review after stop')
    await c.shot(pg, 'melody-record-review')
    ok(await ev(pg, 'S.melody.bars.slice(2).some(Boolean)') and await ev(pg, '!S.melody.bars[0]'), 'take written from bar 3')
    await pg.locator('#recSnap sl-radio-button[value="raw"]').click()
    await pg.click('#recDiscard')
    ok(not await ev(pg, 'S.melody.bars.some(Boolean)') and not await pg.is_visible('#recPanel'), 'discard restores')
    ok(not pg.errors, pg.errors)

@test
async def melody_saved_with_song(c):
    pg = await mel_page(c, LAPTOP)
    await pg.locator('#songName input').fill('Blues head'); await pg.click('#saveSong')
    ok(await ev(pg, 'S.songs["Blues head"].melody.pickup') == 'C5e D5e' and await ev(pg, 'S.songs["Blues head"].keySig') == 'F', 'saved')
    await ev(pg, 'loadPreset("Blues in Bb")')
    ok(not await ev(pg, 'melHas()'), 'a preset has no melody')
    await ev(pg, 'loadSong("Blues head")'); await pg.wait_for_timeout(300)
    ok(await ev(pg, 'melGet(10)') == MEL['bars'][10] and await ev(pg, 'S.keySig') == 'F', 'loaded back')

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
        ('editor-phone', PHONE, 'dark', 'editor'), ('sheet-phone', PHONE, 'light', 'sheet'),
        ('melody-phone', PHONE, 'dark', 'melody'), ('melody-laptop-light', LAPTOP, 'light', 'melody')]:
        pg = await c.page(dev, storage=MELSONG if prep == 'melody' else {'chart': BLUES}, scheme=scheme)
        if prep == 'editor': await pg.locator('#grid .cell').nth(5).click()
        if prep == 'melody':
            await pg.wait_for_function('document.querySelectorAll(".staff svg").length>0', timeout=8000)
            await pg.locator('#grid .cell:not(.pick)').nth(3).click(); await pg.click('#edPartMel')
        if prep == 'sheet': await pg.click('#panelBtn'); await pg.wait_for_timeout(600)
        await pg.add_script_tag(content=src)
        # label-title-only misfires on Shoelace selects (labelled across the shadow boundary); the
        # accessibility-tree check below covers what it's for.
        res = await ev(pg, '''axe.run(document,{resultTypes:["violations"],rules:{"label-title-only":{enabled:false}}}).then(r=>r.violations.map(v=>
            v.id+" ("+v.impact+"): "+v.nodes.slice(0,3).map(n=>n.target.join(" ")).join(" | ")))''')
        problems += [f'{name}: {r}' for r in res]
        # every control a screen reader reaches must have a name (Chromium's own accessibility tree)
        cdp = await pg.context.new_cdp_session(pg)
        ax = (await cdp.send('Accessibility.getFullAXTree'))['nodes']
        roles = ('combobox', 'button', 'checkbox', 'switch', 'slider', 'textbox', 'radio', 'tab')
        nameless = [n['role']['value'] for n in ax if not n.get('ignored') and n.get('role', {}).get('value') in roles
                    and not str(n.get('name', {}).get('value', '')).strip()]
        if nameless: problems.append(f'{name}: unnamed controls {nameless}')
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
