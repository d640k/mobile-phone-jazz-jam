// ---------- UI ----------
const $=id=>document.getElementById(id);
let curCell=null,curTones=null;
const MQ_WIDE=matchMedia('(min-width: 960px) and (min-height: 560px)');
const MQ_SHORT=matchMedia('(max-height: 500px)');
const MQ_DARK=matchMedia('(prefers-color-scheme: dark)');
const orient=()=>innerWidth>innerHeight?'land':'port';

// ---------- Theme ----------
function applyTheme(){
  const dark=S.theme==='dark'||(S.theme==='system'&&MQ_DARK.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.classList.toggle('sl-theme-dark',dark);
  document.querySelector('meta[name="theme-color"]').content=dark?'#14161a':'#f6f3ec';
}
function setTheme(t){S.theme=['light','dark'].includes(t)?t:'system';store.set('theme',S.theme);$('theme').value=S.theme;applyTheme();}

// ---------- Layout: side panel on wide screens, bottom sheet on phones ----------
function layout(){
  const wide=MQ_WIDE.matches,short=MQ_SHORT.matches&&!wide;
  document.body.classList.toggle('wide',wide);document.body.classList.toggle('short',short);
  const body=$('panelBody'),ed=$('editor'),cb=$('compBtn');
  if(short&&cb.parentElement!==$('topbar'))$('topbar').insertBefore(cb,$('loopBtn'));
  if(!short&&cb.parentElement!==$('now'))$('now').insertBefore(cb,$('status'));
  if(wide){
    if(body.parentElement!==$('panel'))$('panel').appendChild(body);
    if(ed.parentElement!==body)body.insertBefore(ed,body.firstChild);
    $('sheet').hide();
    $('panel').hidden=!S.panelOpen&&!ED.open;
    $('panelBtn').setAttribute('aria-expanded',String(!$('panel').hidden));
  }else{
    if(body.parentElement!==$('sheet'))$('sheet').appendChild(body);
    if(ed.parentElement!==$('dock')||ed.nextElementSibling!==$('recPanel'))$('dock').insertBefore(ed,$('kbArea'));
    $('panel').hidden=true;
    $('panelBtn').setAttribute('aria-expanded',String($('sheet').open));
  }
  if($('recPanel').nextElementSibling!==$('kbArea'))$('dock').insertBefore($('recPanel'),$('kbArea'));
  const melEd=ED.open&&ED.part==='melody';
  document.body.classList.toggle('melEdit',melEd&&!wide);
  $('kbArea').hidden=!wide&&ED.open&&!melEd;
  applyKbHeight();layoutLines();
}
function togglePanel(){
  if(MQ_WIDE.matches){S.panelOpen=$('panel').hidden;store.set('panelOpen',S.panelOpen);if(!S.panelOpen&&ED.open)closeEditor();layout();}
  else if($('sheet').open)$('sheet').hide();
  else{if(ED.open)closeEditor();$('sheet').show();$('panelBtn').setAttribute('aria-expanded','true');}
}

// ---------- Chart (lead-sheet layout) ----------
// Bars sit in lines separated by barlines. Each bar is as wide as its chords need;
// lines hold 4 bars (8 on a short landscape phone) and break early only when the bars don't fit,
// splitting 4 into 2+2 rather than 3+1. A section label always starts a new line.
let CELLS=[],PICK=null;
// melody view: the staff is shown when the song has a melody (or you're entering one)
const melOn=()=>S.showMel&&(melHas()||(ED.open&&ED.part==='melody'));
function tonesEl(sym){
  const tn=document.createElement('span');tn.className='tn';
  for(const t of chordToneNames(sym)){const s=document.createElement('span');s.className=t.tone;s.textContent=t.name;tn.appendChild(s);}
  return tn;
}
let KEEP_TOP=null;   // where the chart was scrolled to, kept through a redraw
function renderGrid(){
  const g=$('grid');KEEP_TOP=$('chartWrap').scrollTop;g.innerHTML='';CELLS=[];PICK=null;document.body.classList.toggle('ctones',!!S.chartTones);
  if(melOn()&&(S.melody.pickup||(ED.open&&ED.bar===-1))){
    const c=document.createElement('button');c.type='button';c.className='cell pick';c.dataset.bar=-1;
    if(ED.open&&ED.bar===-1)c.classList.add('sel');
    const n=document.createElement('span');n.className='n';n.textContent='Pickup';
    const ch=document.createElement('span');ch.className='ch';
    c.append(n,ch);c.setAttribute('aria-label','Pickup (melody before bar 1). Edit');PICK=c;
  }
  chartSong.bars.forEach((b,i)=>{
    const c=document.createElement('button');c.type='button';c.className='cell';c.dataset.bar=i;
    if(S.loop&&i>=S.loop.a&&i<=S.loop.b)c.classList.add('inloop');
    if(LOOP.sel&&i===LOOP.first)c.classList.add('loopfirst');
    if(ED.open&&chartSong.src[i]===ED.bar)c.classList.add('sel');
    if(SEL.a!=null&&chartSong.src[i]>=SEL.a&&chartSong.src[i]<=SEL.b)c.classList.add('insel');
    if(i===chartSong.bars.length-1)c.classList.add('end');
    else if(chartSong.labels[i+1])c.classList.add('secend');   // double bar line before a new section
    const n=document.createElement('span');n.className='n';
    const lab=chartSong.labels[i];
    if(lab){const l=document.createElement('span');l.className='lbl';l.textContent=lab;n.appendChild(l);c.classList.add('secstart');}
    // repeat signs and ending brackets
    const rp=chartSong.reps[i]||{},em=chartSong.endings[i];
    if(rp.rs)c.classList.add('rs');if(rp.re)c.classList.add('re');
    if(em){
      const g=document.createElement('span');g.className='endg'+(em.first?' first':'')+(em.closed?' closed':'');c.appendChild(g);
      if(em.first){const e=document.createElement('span');e.className='endn';e.textContent=em.num+'.';n.appendChild(e);}
    }
    const num=document.createElement('span');num.className='num';num.textContent=String(i+1);n.appendChild(num);
    const ch=document.createElement('span');ch.className='ch';ch.setAttribute('aria-hidden','true');
    // chords spread across the bar by beats once there's room
    let at=0;
    b.forEach(x=>{
      if(x.beat>at){const gp=document.createElement('span');gp.className='gap';gp.style.flexGrow=x.beat-at;ch.appendChild(gp);}
      const sp=document.createElement('span');sp.className='chd'+(x.dim?' rep':'');sp.style.flexGrow=x.len;sp.dataset.beat=x.beat;
      chordInto(sp,x.t);ch.appendChild(sp);at=x.beat+x.len;
      if(S.chartTones)sp.appendChild(tonesEl(x.t));
    });
    // a chord held over from an earlier bar: no symbol, but its tones still show here
    if(!b.length&&S.chartTones){const held=chordAt(i,0);
      if(held){const sp=document.createElement('span');sp.className='chd held';sp.dataset.beat=0;sp.textContent='\u200b';sp.appendChild(tonesEl(held));ch.appendChild(sp);}}
    c.append(n,ch);
    const words=b.length?b.map(x=>x.t).join(', '):'same chord';
    const repTxt=(rp.rs?', start of repeat':'')+(em&&em.first?`, ${em.num===1?'1st':em.num===2?'2nd':em.num+'th'} ending`:'')+(rp.re?', end of repeat':'');
    c.setAttribute('aria-label',`Bar ${i+1}${lab?', section '+lab:''}${repTxt}: ${words}. ${LOOP.sel?'Choose for the loop':'Edit'}`);
    CELLS.push(c);
  });
  curCell=null;layoutLines();
}
function layoutLines(){
  const g=$('grid');if(!CELLS.length){g.innerHTML='';g.appendChild(addBarBtn());return;}
  const mel=melOn()&&!!NOT.vf;
  if(melOn()&&!NOT.vf)loadNotation().then(()=>renderGrid()).catch(e=>{console.error(e);songMsg(e.message,true);});
  g.classList.remove('mel');NOT.els.clear();NOT.hits.clear();NOT.cur=null;   // measure chords in normal flow first
  const focused=document.activeElement,top=KEEP_TOP??$('chartWrap').scrollTop;KEEP_TOP=null;
  const items=(mel&&PICK?[{el:PICK,bar:-1}]:[]).concat(CELLS.map((el,i)=>({el,bar:i})));
  // 1) measure each bar at its natural width (chords, or the melody if that needs more room)
  const meas=document.createElement('div');meas.className='sys measure';g.innerHTML='';g.appendChild(meas);
  items.forEach(it=>{it.el.style.cssText='';it.el.querySelectorAll('.chd').forEach(c=>c.style.left='');meas.appendChild(it.el);});
  const W=g.clientWidth-2;
  const nat=items.map(it=>Math.ceil(it.el.getBoundingClientRect().width));
  // with the staff, chords sit over their notes: a bar needs its chord text (plus gaps), not tile padding
  if(mel)items.forEach((it,k)=>{
    const ch=[...it.el.querySelectorAll('.chd')].reduce((w,c)=>w+c.getBoundingClientRect().width+8,8);
    nat[k]=Math.max(it.bar<0?0:ch,Math.ceil(notationMinWidth(melGet(it.bar),it.bar)));
  });
  const hw=mel?[Math.ceil(notationHeadWidth(true)),Math.ceil(notationHeadWidth(false))]:[0,0];
  const head=li=>hw[li===0?0:1];
  g.classList.toggle('mel',mel);
  // 2) break into lines (a pickup rides along with bar 1)
  const per=document.body.classList.contains('short')?8:4;
  const real=(a,b)=>{let n=0;for(let i=a;i<b;i++)if(items[i].bar>=0)n++;return n;};
  const lines=[];
  const place=(a,b,split)=>{
    let sum=head(lines.length);for(let i=a;i<b;i++)sum+=nat[i];
    if(sum<=W||b-a===1||(b-a===2&&items[a].bar<0)){lines.push([a,b,split]);return;}
    const mid=a+Math.ceil((b-a)/2);place(a,mid,true);place(mid,b,true);
  };
  let start=0;
  for(let i=1;i<=items.length;i++){
    // a section starts a new line, except right after the pickup: that rides along with bar 1
    if(i===items.length||(chartSong.labels[items[i].bar]&&real(start,i)>0)||real(start,i)===per){place(start,i,false);start=i;}
  }
  // 3) build the lines; a short line keeps the bar spacing of a full one
  g.innerHTML='';
  const rows=[];
  lines.forEach(([a,b,split],li)=>{
    const row=document.createElement('div');row.className='sys';
    let sum=head(li);for(let i=a;i<b;i++)sum+=nat[i];
    // a short line ending a section stretches to the edge; only the song's last line stays short
    // (keeping a full line's bar spacing)
    const n=real(a,b),last=b===items.length,share=!split&&n<per&&last?Math.max(sum,W*n/per):W;
    row.style.width=Math.min(W,share)+'px';
    for(let i=a;i<b;i++){
      // with the staff, spare width goes mostly to the bars with more in them
      const c=items[i].el,extra=i===a?head(li):0;c.style.flex=`${mel?(nat[i]/50).toFixed(2):1} 1 ${nat[i]+extra}px`;
      if(b-a===1&&nat[i]>W)c.style.setProperty('--k',Math.max(0.6,W/nat[i]).toFixed(2));
      row.appendChild(c);
    }
    g.appendChild(row);rows.push([row,items.slice(a,b)]);
  });
  g.appendChild(addBarBtn());
  if(mel)rows.forEach(([row,its],li)=>{try{drawStaffRow(row,its,li===0);}catch(e){console.error(e);}});
  $('chartWrap').scrollTop=top;
  if(focused&&g.contains(focused))focused.focus({preventScroll:true});
  showSel();
  markSelNote();
}
function addBarBtn(){
  const add=document.createElement('button');add.type='button';add.className='addBar';add.id='addBar';add.textContent='+ Bar';add.setAttribute('aria-label','Add a bar at the end');
  return add;
}
// Lead-sheet chord symbol: root and accidental full size, quality/extensions small and raised,
// slash bass a little smaller. "Bb7#9/Ab" -> B♭ ⁷♯⁹ /A♭
const accTxt=t=>t.replace(/#/g,'\u266f').replace(/b(?=\d|$|\/)/g,'\u266d');
function chordInto(el,sym){
  el.textContent='';
  const m=/^([A-G][b#]?)([^/]*)(?:\/(.+))?$/.exec(sym);
  if(!m){el.textContent=sym;return;}
  const r=document.createElement('span');r.className='cr';r.textContent=m[1].replace('#','\u266f').replace('b','\u266d');el.appendChild(r);
  if(m[2]){const q=document.createElement('span');q.className='cq';q.textContent=accTxt(m[2]);el.appendChild(q);}
  if(m[3]){const bs=document.createElement('span');bs.className='cb';bs.textContent='/'+m[3].replace('#','\u266f').replace('b','\u266d');el.appendChild(bs);}
}
// the bar being played: lit on the chart, with its chord tones showing and its melody's
// chord tones coloured (when that's switched on)
function setCur(cell){
  if(curCell)curCell.classList.remove('cur');curCell=cell||null;
  if(cell){cell.classList.add('cur');spreadTones(cell);}
  markToneBar(cell&&S.chartTones?+cell.dataset.bar:null);
}
// Tones hang under their chord without taking room in the bar; in a busy bar they can be wider
// than the chord, so push each clear of the one before, and keep the last on the screen.
function spreadTones(cell){
  const tns=[...cell.querySelectorAll('.tn')];if(!tns.length)return;
  tns.forEach(t=>{t.style.left='';t.classList.remove('tight');});
  // more tones than the bar has room for: a smaller size
  if(tns.length>1&&tns.reduce((w,t)=>w+t.offsetWidth+4,0)>cell.clientWidth-8)tns.forEach(t=>t.classList.add('tight'));
  let right=-1e9;
  for(const t of tns){const r=t.getBoundingClientRect();if(r.left<right+4)t.style.left=(right+4-r.left)+'px';right=t.getBoundingClientRect().right;}
  const w=$('chartWrap'),lim=Math.min($('grid').getBoundingClientRect().right,w.getBoundingClientRect().left+w.clientWidth)-2,over=right-lim;
  if(over>0)for(const t of tns)t.style.left=((parseFloat(t.style.left)||0)-over)+'px';
}
function setNow(cur,next,pos){
  const put=(id,t)=>{const e=$(id);if(e.dataset.v===t)return;e.dataset.v=t;if(/^[A-G]/.test(t))chordInto(e,t);else e.textContent=t;};
  put('cur',cur);put('curS',cur);
  const nx=next.replace(/^→ /,'');
  for(const id of ['next','nextS']){const e=$(id);if(e.dataset.v===nx)continue;e.dataset.v=nx;e.textContent='';
    if(nx){e.append('→ ');const c=document.createElement('span');chordInto(c,nx);e.appendChild(c);}}
  $('pos').textContent=pos;$('posS').textContent=pos;
}
function showBeat(ev){
  const loopTxt=S.loop?`Loop ${S.loop.a+1}–${S.loop.b+1}`:'';
  $('loopChip').textContent=loopTxt;$('loopChip').hidden=!loopTxt;
  if(!ev){
    const s0=S.loop?chartSong.segs[chartSong.segOfBeat[S.loop.a*chartSong.bpb]]:chartSong.segs[0];
    setNow(s0?s0.chord.sym:'—','','');$('feelChip').hidden=true;
    setCur(null);setTones(null);return;
  }
  if(ev.count){setNow(String(ev.count),song.segs[0]?'→ '+song.segs[0].chord.sym:'','Count-in');return;}
  const sg=ev.song||song,wb=sg.map?sg.map[ev.bar%sg.map.length]:ev.bar;   // the written bar being played
  const si=sg.segOfBeat[ev.beat],seg=sg.segs[si];
  const nseg=sg.segs[(si+1)%sg.segs.length];
  setNow(seg.chord.sym,nseg!==seg?'→ '+nseg.chord.sym:'',
    `Bar ${wb+1}/${chartSong.bars.length} · Beat ${ev.beat%sg.bpb+1}`+(ev.chorus!=null?` · Chorus ${ev.chorus+1}`:''));
  const feel=ev.stroll?'comp out':(ev.feel||'');
  $('feelChip').textContent=feel;$('feelChip').hidden=!feel;
  const cell=CELLS[wb];
  if(cell!==curCell){setCur(cell);if(cell&&ev.beat%sg.bpb===0)followLine(cell);}
  setTones(seg.chord);
}
// the melody note being played: amber on the staff; violet on the keys, the next one outlined
// the melody note being played: amber on the staff; violet on the keys, the next one outlined.
// Each voice keeps its own mark, so a held voice-2 note stays lit while voice 1 moves.
const MELMARK={1:{keys:[],next:[]},2:{keys:[],next:[]}};
function showMel(e){
  if(!e){markNote(null,0,1);markNote(null,0,2);for(const k of $('kb').querySelectorAll('.mel,.melnext'))k.classList.remove('mel','melnext');MELMARK[1]={keys:[],next:[]};MELMARK[2]={keys:[],next:[]};return;}
  const v=e.voice||1;
  markNote(e.midi!=null?e.wbar:null,e.ni,v);
  const M=MELMARK[v];
  for(const m of [...M.keys,...M.next])keyEl(m)?.classList.remove('mel','melnext');
  M.keys=[];M.next=[];
  if(!S.melKeys)return;
  const tl=getTimeline().events,i=tl.indexOf(e);
  for(const m of e.midis||[]){keyEl(m)?.classList.add('mel');M.keys.push(m);}
  for(let j=i+1;j<tl.length;j++)if(tl[j].midi!=null&&(tl[j].voice||1)===v){for(const m of tl[j].midis)if(!(e.midis||[]).includes(m)){keyEl(m)?.classList.add('melnext');M.next.push(m);}break;}
}
// Keep the bar being edited (its whole line) in view. Run again whenever the chart area changes
// size, because opening the editor shrinks it after the bar was first scrolled to.
function showSel(){
  const sel=$('grid').querySelector('.cell.sel');if(!sel)return;
  const wrap=$('chartWrap'),row=sel.closest('.sys')||sel,box=wrap.getBoundingClientRect(),r=row.getBoundingClientRect(),pad=6;
  if(r.top<box.top)wrap.scrollTop+=r.top-box.top-pad;
  else if(r.bottom>box.bottom)wrap.scrollTop+=Math.min(r.bottom-box.bottom+pad,r.top-box.top-pad);
}
// Keep the playing line on screen, plus the line after it so you can read ahead.
// If both don't fit, the playing line goes to the top.
function followLine(cell){
  const wrap=$('chartWrap'),row=cell.closest('.sys');if(!row)return;
  const next=row.nextElementSibling&&row.nextElementSibling.classList.contains('sys')?row.nextElementSibling:null;
  const box=wrap.getBoundingClientRect(),r=row.getBoundingClientRect(),pad=6;
  let target=wrap.scrollTop;
  if(r.top<box.top)target=row===wrap.querySelector('#grid .sys')?0:target+r.top-box.top-pad;   // playing line above the view (back to bar 1: the very top)
  else{
    const bottom=(next||row).getBoundingClientRect().bottom;
    if(bottom>box.bottom)target+=Math.min(bottom-box.bottom+pad,r.top-box.top-pad);
  }
  if(Math.abs(target-wrap.scrollTop)>1)wrap.scrollTo({top:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function setPlayUI(on){
  $('play').classList.toggle('playing',on);$('playLabel').textContent=on?'Stop':'Play';
  $('play').setAttribute('aria-label',on?'Stop (Space)':'Play (Space)');
}

// Replace the chart text and everything that depends on it.
// ---------- Undo / redo ----------
// Every change to the song (chart text or melody) takes a snapshot first; changes made in the same
// moment (one tap) share one snapshot, so a recorded take or a bar insert undoes in one step.
// Loading a song starts a fresh history.
const HIST={undo:[],redo:[],marked:false,restoring:false,max:100};
const snapSong=()=>({chart:S.chart,melody:JSON.stringify(S.melody),bar:ED.bar,note:ED.note,part:ED.part,voice:ED.voice});
function histMark(){
  if(HIST.restoring||HIST.marked)return;
  HIST.marked=true;queueMicrotask(()=>{HIST.marked=false;});
  HIST.undo.push(snapSong());if(HIST.undo.length>HIST.max)HIST.undo.shift();
  HIST.redo.length=0;histUI();
}
function histReset(){HIST.undo.length=0;HIST.redo.length=0;histUI();}
function histUI(){if($('edUndo')){$('edUndo').disabled=!HIST.undo.length;$('edRedo').disabled=!HIST.redo.length;}}
function histGo(from,to){
  const snap=from.pop();if(!snap)return false;
  to.push(snapSong());
  HIST.restoring=true;
  try{
    S.melody=JSON.parse(snap.melody);melSave();melTimeline=null;
    applyChartText(snap.chart);
  }finally{HIST.restoring=false;}
  if(ED.open){
    ED.bar=Math.min(snap.bar,rawBars().length-1);ED.part=snap.part;ED.voice=snap.voice||1;
    ED.note=snap.note!=null&&snap.note<toksOf(ED.bar).length?snap.note:null;STACK.ref=null;
    layout();renderGrid();renderEditor();
  }
  histUI();return true;
}
const undo=()=>histGo(HIST.undo,HIST.redo),redo=()=>histGo(HIST.redo,HIST.undo);
function applyChartText(text){
  histMark();
  const oldLen=chartSong.bars.length;
  S.chart=text;store.set('chart',S.chart);
  chartSong=parseChart(S.chart,curBpb());melFit(chartSong.bars.length);melTimeline=null;
  if(S.loop&&(chartSong.bars.length!==oldLen||S.loop.b>=chartSong.bars.length))clearLoop(true);
  if(P.playing){if(!chartSong.segs.length)stop();else song=loopSong();}else song=chartSong;
  renderGrid();if(!P.playing)showBeat(null);
}

// ---------- Looping bars ----------
// Loop button -> tap the first bar -> tap the last bar. Loop button again (or Escape) turns it off.
const LOOP={sel:false,first:null};
// The loop is chosen on written bars; it plays from the first time bar a is played to the next
// time bar b is (so a loop over a repeat's 2nd ending takes in the whole repeat).
function loopSong(){
  if(!S.loop)return chartSong.played||chartSong;
  const [pa,pb]=loopRange();return sliceSong(chartSong,pa,pb);
}
function loopRange(){
  const map=(chartSong.played||chartSong).map;let pa=map.indexOf(S.loop.a);if(pa<0)pa=0;
  let pb=map.indexOf(S.loop.b,pa);if(pb<0)pb=Math.max(pa,map.lastIndexOf(S.loop.b));
  return [pa,pb];
}
function loopHint(t){$('loopHint').textContent=t||'';$('loopHint').hidden=!t;}
function refreshLoopBtn(){
  const b=$('loopBtn');b.setAttribute('aria-pressed',String(!!S.loop||LOOP.sel));
  $('loopLabel').textContent=LOOP.sel?'Cancel':'Loop';
  b.setAttribute('aria-label',S.loop?`Loop bars ${S.loop.a+1} to ${S.loop.b+1} is on. Turn off`:LOOP.sel?'Cancel loop selection':'Loop some bars');
}
function applyLoopLive(resumeBar){if(P.playing)P.pending={song:loopSong(),bar:resumeBar||0};}
function setLoop(a,b){
  S.loop={a:Math.min(a,b),b:Math.max(a,b)};LOOP.sel=false;LOOP.first=null;loopHint('');
  renderGrid();refreshLoopBtn();applyLoopLive(0);if(!P.playing)showBeat(null);
}
function clearLoop(silent){
  const was=S.loop;S.loop=null;LOOP.sel=false;LOOP.first=null;loopHint('');
  if(!silent){
    let bar=0;
    if(was&&P.playing&&song.loopLen){   // carry on from the bar after the one playing now
      const cur=Math.floor(((P.step-P.countSteps)/2)%song.beats/song.bpb),wb=song.map[cur%song.map.length];
      bar=Math.max(0,(chartSong.played||chartSong).map.indexOf((wb+1)%chartSong.bars.length));
    }
    if(was)applyLoopLive(bar);
    renderGrid();if(!P.playing)showBeat(null);
  }
  refreshLoopBtn();
}
function startLoopSelect(){
  if(ED.open)closeEditor();
  LOOP.sel=true;LOOP.first=null;loopHint('Tap the first bar of the loop.');refreshLoopBtn();renderGrid();
}
function loopTap(i){
  if(LOOP.first===null){LOOP.first=i;loopHint(`Bar ${i+1}. Now tap the last bar of the loop (or the same bar again).`);renderGrid();CELLS[i].focus({preventScroll:true});}
  else setLoop(LOOP.first,i);
}

// ---------- Bar editor ----------
const ED={open:false,bar:0,slot:0,mode:'root',text:false,part:'chords',len:'q',dot:false,tri:false,note:null,chord:false,insert:false,voice:1};   // insert: keys add before the selected note   // note: selected note in the bar (null = adding at the end)
const rawBars=()=>splitChart(S.chart);
function edToks(){const raw=rawBars();return raw[ED.bar]?resolveToks(raw,ED.bar):[];}
function edChords(){return edToks().filter(t=>t!=='/'&&t!=='%');}
function openEditor(rawIndex,part){
  if(LOOP.sel||REC.review)return;
  ED.open=true;ED.bar=rawIndex;ED.slot=0;ED.mode='root';ED.note=null;
  if(part)ED.part=part;if(rawIndex<0)ED.part='melody';
  if($('sheet').open)$('sheet').hide();
  $('editor').hidden=false;layout();renderGrid();renderEditor();
  $('edTitle').focus?.();
}
function closeEditor(){
  SEL.a=SEL.b=null;SEL.picking=false;barsMenu(false);
  ED.open=false;$('editor').hidden=true;layout();renderGrid();
  const i=chartSong.src.indexOf(ED.bar);const c=CELLS[i];if(c)c.focus();
}
// write one raw bar's tokens back to the chart
function setBarToks(toks){
  const raw=rawBars();if(!raw[ED.bar])return;
  const chords=t=>t.filter(x=>x!=='/'&&x!=='%'),before=chords(resolveToks(raw,ED.bar)),after=chords(toks);
  // "%" after a one-chord bar means "that chord carries on". If the bar now has several chords,
  // the next bars hold its last chord ("/") rather than repeating the whole bar.
  if(before.length<=1&&after.length>1)for(let j=ED.bar+1;raw[j]&&raw[j].toks.join(' ')==='%'&&!raw[j].label;j++)raw[j].toks=['/'];
  raw[ED.bar].toks=toks.length?toks:['%'];
  applyChartText(barsToText(raw));renderEditor();
}
function updateSlot(fn){
  const toks=edToks(),idx=toks.map((t,i)=>t!=='/'&&t!=='%'?i:-1).filter(i=>i>=0);
  if(!idx.length){toks.splice(0,toks.length,'C');idx.push(0);}
  const ti=idx[Math.min(ED.slot,idx.length-1)];
  const p=chordParts(toks[ti])||{root:'C',q:'',ext:[],bass:null};
  fn(p);delete p.raw;if(p.q==null)p.q='';
  toks[ti]=chordFromParts(p);setBarToks(toks);
}
function renderEditor(){
  if(!ED.open)return;
  const raw=rawBars(),n=chartSong.src.indexOf(ED.bar)+1,isMel=ED.part==='melody';
  $('edTitle').textContent=ED.bar<0?'Pickup':`Bar ${n||ED.bar+1}`;
  $('edText').setAttribute('aria-pressed',String(ED.text));
  $('edPartCh').setAttribute('aria-pressed',String(!isMel));$('edPartMel').setAttribute('aria-pressed',String(isMel));$('edPartCh').disabled=ED.bar<0;
  $('edPicker').hidden=ED.text||isMel;$('edMel').hidden=ED.text||!isMel;$('edTextBox').hidden=!ED.text;
  $('edInsert').hidden=$('edDelete').hidden=ED.bar<0;
  if(isMel)renderMelEditor();
  const chords=edChords();
  ED.slot=Math.min(ED.slot,Math.max(0,chords.length-1));
  // chord slots
  const slots=$('edSlots');slots.innerHTML='';
  const pretty=c=>c.replace(/^([A-G])b/,'$1\u266d').replace(/\/([A-G])b/,'/$1\u266d').replace(/b(?=\d)/g,'\u266d').replace(/#/g,'\u266f');
  chords.forEach((c,j)=>{const b=document.createElement('button');b.type='button';b.className='slot';b.textContent=pretty(c);
    b.setAttribute('aria-pressed',String(j===ED.slot));b.setAttribute('aria-label',`Chord ${j+1}: ${c}`);b.onclick=()=>{ED.slot=j;renderEditor();};slots.appendChild(b);});
  if(chords.length<curBpb()){const a=document.createElement('button');a.type='button';a.className='btn small';a.textContent='+ Chord';
    a.onclick=()=>{const c=chords[chords.length-1]||'C';setBarToks([...chords,c]);ED.slot=chords.length;renderEditor();};slots.appendChild(a);}
  if(chords.length>1){const r=document.createElement('button');r.type='button';r.className='btn small';r.textContent='Remove chord';
    r.onclick=()=>{const c=[...chords];c.splice(ED.slot,1);ED.slot=Math.max(0,ED.slot-1);setBarToks(c);};slots.appendChild(r);}
  const p=chordParts(chords[ED.slot])||{root:null,q:null,ext:[],bass:null};
  // root / bass note, spelled with flats or sharps: as the chord is written, else as you last chose
  // for this chord, else from the key signature
  $('edNoteMode').value=ED.mode;$('edNoteHead').textContent=ED.mode==='bass'?'Bass note':'Root';
  const key=ED.bar+':'+ED.slot+':'+ED.mode;if(ED.spellKey!==key){ED.spellKey=key;ED.spell=null;}
  const spell=ED.spell||spellingOf(ED.mode==='bass'?p.bass:p.root)||spellingOf(p.root)||(SHARP_KEYS.includes(S.keySig)?'sharp':'flat');
  $('edFlat').setAttribute('aria-pressed',String(spell==='flat'));$('edSharp').setAttribute('aria-pressed',String(spell==='sharp'));
  const roots=$('edRoots');roots.innerHTML='';
  (spell==='sharp'?ROOTS_SHARP:ROOTS_FLAT).forEach(r=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=r.replace('#','\u266f').replace(/^([A-G])b/,'$1\u266d');
    b.setAttribute('aria-label',r.replace('#',' sharp').replace(/^([A-G])b/,'$1 flat'));
    const on=ED.mode==='bass'?p.bass===r:p.root===r;b.setAttribute('aria-pressed',String(on));
    b.onclick=()=>updateSlot(x=>{if(ED.mode==='bass')x.bass=r===x.root||ENHARMONIC[r]===x.root?null:r;else x.root=r;});roots.appendChild(b);});
  $('edNoBass').hidden=ED.mode!=='bass';$('edNoBass').setAttribute('aria-pressed',String(!p.bass));
  // quality
  const quals=$('edQuals');quals.innerHTML='';
  PICK_QUALS.forEach(([t,q])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=t;
    if(q==='m7b5')b.setAttribute('aria-label','m7 flat 5 (half-diminished)');if(t==='mΔ')b.setAttribute('aria-label','minor major 7');
    b.setAttribute('aria-pressed',String(p.q===q));b.onclick=()=>updateSlot(x=>{x.q=q;if(q==='7alt'||q==='dim7')x.ext=[];});quals.appendChild(b);});
  // extensions
  const exts=$('edExts');exts.innerHTML='';
  PICK_EXTS.forEach(e=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=e.replace('b','\u266d').replace('#','\u266f');
    b.setAttribute('aria-label',e.replace('b','flat ').replace('#','sharp '));
    const implied=e==='b5'&&p.q==='m7b5';   // m7b5 already has its flat 5: tapping it goes back to m7
    b.setAttribute('aria-pressed',String(p.ext.includes(e)||implied));
    if(implied){b.onclick=()=>updateSlot(x=>{x.q='m7';});exts.appendChild(b);return;}
    b.onclick=()=>updateSlot(x=>{x.ext=x.ext.includes(e)?x.ext.filter(y=>y!==e):[...x.ext,e];if(x.q==='7alt')x.q='7';});exts.appendChild(b);});
  // section label (starts a new line on the chart)
  const lab=raw[ED.bar]?raw[ED.bar].label:null,secs=$('edSecs');secs.innerHTML='';
  [['','None'],['A','A'],['B','B'],['C','C'],['D','D']].forEach(([v,t])=>{
    const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=t;
    if(!v)b.setAttribute('aria-label','No section label');
    b.setAttribute('aria-pressed',String((lab||'')===v));b.onclick=()=>setBarLabel(v);secs.appendChild(b);});
  if(document.activeElement!==$('edSecName'))$('edSecName').value=lab&&!['A','B','C','D'].includes(lab)?lab:'';
  // text mode
  if(document.activeElement!==$('edInput')){$('edInput').value=isMel?vGet(ED.bar):(raw[ED.bar]?resolveToks(raw,ED.bar):[]).join(' ');$('edErr').textContent='';}
  $('edInput').label=isMel?(ED.bar<0?'Pickup melody':`${ED.voice===2?'Voice 2':'Melody'} in bar ${n||ED.bar+1}`):`Chords in bar ${n||ED.bar+1}`;
  $('edInput').helpText=isMel?'Notes like F5q D5e C5e A4h: pitch, then w h q e s; add . for dotted, t for triplet, ~ to tie. r is a rest; D4+F4+Bb4q is a chord; / alone gives rhythm slashes. Enter applies.':'Up to 4 chords, separated by spaces. “/” holds a beat, e.g. C7 / / F7. Enter applies.';
  $('edPrev').disabled=ED.bar<=(isMel?-1:0);$('edNext').disabled=ED.bar>=raw.length-1;
  $('edDelete').disabled=raw.length<2;
}
// label the selected bar as the start of a section ('' removes it)
function setBarLabel(v){
  const raw=rawBars();if(!raw[ED.bar])return;
  v=(v||'').replace(/[\[\]|]/g,'').trim().slice(0,12);
  if((raw[ED.bar].label||'')===v)return;   // unchanged (e.g. the text box losing focus): don't redraw mid-tap
  raw[ED.bar].label=v||null;
  applyChartText(barsToText(raw));renderEditor();
}
function applyBarText(){
  const v=$('edInput').value.trim(),toks=v.split(/\s+/).filter(Boolean);
  if(ED.part==='melody'){
    if(v==='/'){$('edErr').textContent='';melSet(ED.bar,'/');renderGrid();renderEditor();return;}   // rhythm slashes
    const bad=toks.filter(t=>!melTok(t));
    if(bad.length){$('edErr').textContent=`Don’t know ${bad.map(b=>'“'+b+'”').join(', ')}. Use e.g. F5q, Bb4e., re.`;return;}
    const used=melBeats(v);
    if(used>curBpb()+1e-6){$('edErr').textContent=`That’s ${fmtBeats(used)} beats; a bar holds ${curBpb()}.`;return;}
    $('edErr').textContent='';vSet(ED.bar,toks.join(' '));renderGrid();renderEditor();return;
  }
  if(!toks.length){$('edErr').textContent='Type at least one chord.';return;}
  if(toks.length>curBpb()){$('edErr').textContent=`At most ${curBpb()} chords or “/” in a bar.`;return;}
  const bad=toks.filter(t=>t!=='/'&&t!=='%'&&!parseChord(t));
  if(bad.length){$('edErr').textContent=`Don’t know ${bad.map(b=>'“'+b+'”').join(', ')}.`;return;}
  if(toks[0]==='/'){$('edErr').textContent='Start the bar with a chord.';return;}
  $('edErr').textContent='';setBarToks(toks);
}
function moveBar(d){const raw=rawBars();ED.note=null;STACK.ref=null;barMsg('');ED.bar=Math.max(ED.part==='melody'?-1:0,Math.min(raw.length-1,ED.bar+d));ED.slot=0;renderGrid();renderEditor();}
function setPart(p){ED.part=p;ED.note=null;if(p==='chords'&&ED.bar<0)ED.bar=0;ED.text=false;layout();renderGrid();renderEditor();}
function insertBar(){
  const raw=rawBars(),cur=raw[ED.bar]?resolveToks(raw,ED.bar).filter(t=>t!=='%'):['C'];
  raw.splice(ED.bar+1,0,{label:null,toks:cur.length?cur:['C']});melInsertBar(ED.bar+1);ED.bar++;ED.slot=0;
  applyChartText(barsToText(raw));renderEditor();
}
function deleteBar(){
  const raw=rawBars();if(raw.length<2)return;
  const keep=resolveToks(raw,ED.bar);
  if(raw[ED.bar+1]&&raw[ED.bar+1].toks.join(' ')==='%')raw[ED.bar+1].toks=keep;   // don't break a following "%"
  if(raw[ED.bar].label&&raw[ED.bar+1]&&!raw[ED.bar+1].label)raw[ED.bar+1].label=raw[ED.bar].label;
  const gone=raw[ED.bar];   // its repeat signs move to the neighbouring bars
  if(gone.rs&&raw[ED.bar+1])raw[ED.bar+1].rs=true;
  if(gone.re&&raw[ED.bar-1])raw[ED.bar-1].re=true;
  if(gone.end&&raw[ED.bar+1]&&!raw[ED.bar+1].end&&!gone.re)raw[ED.bar+1].end=gone.end;
  raw.splice(ED.bar,1);melDeleteBar(ED.bar);ED.bar=Math.min(ED.bar,raw.length-1);ED.slot=0;
  applyChartText(barsToText(raw));renderEditor();
}
function addBarAtEnd(){
  const raw=rawBars();raw.push({label:null,toks:raw.length?resolveToks(raw,raw.length-1):['C']});
  applyChartText(barsToText(raw));openEditor(raw.length-1);
}

// ---------- Selecting bars; copy, cut, paste ----------
// A selection is a range of bars (raw chart indices). Copy takes chords, both melody voices, slashes
// and section labels. Paste replaces the selection, or with none goes in after the current bar.
// Each is one undo step. Copy also puts the chords on the device clipboard as chart text.
const SEL={a:null,b:null,picking:false},CLIP={bars:null,mel:null};
function barMsg(t){$('edMsg').textContent=t||'';}
// Repeat signs and endings on the selected bars (or this bar):
// repeat = |: on the first, :| on the last; 1st ending ends with :| (that's where it turns back);
// 2nd ending is where the music carries on the second time.
function setRepeat(kind){
  const [a,b]=selRange(),raw=rawBars(),r=rangeText(a,b),R=r[0].toUpperCase()+r.slice(1);if(a<0)return;
  if(kind==='repeat'){raw[a].rs=true;raw[b].re=true;barMsg(`${R} repeat (played twice).`);}
  else if(kind==='clear'){for(let k=a;k<=b;k++){raw[k].rs=raw[k].re=false;raw[k].end=null;}barMsg(`No repeat signs in ${r}.`);}
  else{
    const num=kind==='end1'?1:2;
    for(let k=a;k<=b;k++)raw[k].end=null;
    raw[a].end=num;if(num===1)raw[b].re=true;
    barMsg(`${R}: ${num===1?'1st':'2nd'} ending.`);
  }
  applyChartText(barsToText(raw));barsMenu(false);SEL.a=SEL.b=null;renderGrid();renderEditor();
}
const selRange=()=>SEL.a!=null?[SEL.a,SEL.b]:[ED.bar,ED.bar];
function setSelection(a,b){SEL.a=Math.min(a,b);SEL.b=Math.max(a,b);SEL.picking=false;renderGrid();renderEditor();}
function clearSelection(){if(SEL.a==null&&!SEL.picking)return;SEL.a=SEL.b=null;SEL.picking=false;renderGrid();if(ED.open)renderEditor();}
const rangeText=(a,b)=>a===b?`bar ${a+1}`:`bars ${a+1}–${b+1}`;
function copyBars(){
  if(ED.bar<0)return;
  const [a,b]=selRange(),raw=rawBars();
  CLIP.bars=raw.slice(a,b+1).map((r,k)=>({label:r.label,toks:resolveToks(raw,a+k)}));   // "%" resolved: the copy stands alone
  CLIP.mel=S.melody.bars.slice(a,b+1);while(CLIP.mel.length<CLIP.bars.length)CLIP.mel.push('');
  try{navigator.clipboard&&navigator.clipboard.writeText(barsToText(CLIP.bars)).catch(()=>{});}catch(e){}
  barMsg(`Copied ${rangeText(a,b)}.`);songMsg('');barsMenu(false);renderEditor();
}
// replace bars a..b (b = a-1: nothing) with the given bars and melody, as one undo step
function spliceBars(a,b,bars,mel){
  histMark();
  const raw=rawBars(),n=b-a+1;
  // a "%" right after the change must keep meaning the chord it meant before
  if(raw[b+1]&&raw[b+1].toks.join(' ')==='%')raw[b+1].toks=resolveToks(raw,b+1);
  melFit(raw.length);
  raw.splice(a,n,...bars.map(x=>({label:x.label,toks:[...x.toks]})));
  S.melody.bars.splice(a,n,...mel);melSave();melTimeline=null;
  if(!raw.length)raw.push({label:null,toks:['C']});
  applyChartText(barsToText(raw));
}
function cutBars(){
  if(ED.bar<0)return;
  const [a,b]=selRange();copyBars();
  if(b-a+1>=rawBars().length){barMsg('Can’t cut every bar; copied instead.');return;}
  spliceBars(a,b,[],[]);ED.bar=Math.min(a,rawBars().length-1);SEL.a=SEL.b=null;
  barMsg(`Cut ${rangeText(a,b)}.`);renderGrid();renderEditor();
}
function pasteBars(){
  if(!CLIP.bars||ED.bar<0)return;
  const sel=SEL.a!=null,[a,b]=sel?selRange():[ED.bar+1,ED.bar];
  spliceBars(a,b,CLIP.bars,[...CLIP.mel]);
  ED.bar=a;ED.slot=0;ED.note=null;SEL.a=SEL.b=null;barsMenu(false);
  barMsg(sel?`Replaced with ${CLIP.bars.length} bar${CLIP.bars.length>1?'s':''}.`:`Pasted ${CLIP.bars.length} bar${CLIP.bars.length>1?'s':''} after bar ${a}.`);
  renderGrid();renderEditor();
}
function deleteBars(){
  if(ED.bar<0)return;
  const [a,b]=selRange();
  if(a===b){barsMenu(false);SEL.a=SEL.b=null;return deleteBar();}
  if(b-a+1>=rawBars().length)return;
  const raw=rawBars();
  const keepLabel=raw[a].label&&raw[b+1]&&!raw[b+1].label?raw[a].label:null;
  spliceBars(a,b,[],[]);
  if(keepLabel){const r=rawBars();r[a].label=keepLabel;applyChartText(barsToText(r));}
  ED.bar=Math.min(a,rawBars().length-1);SEL.a=SEL.b=null;barsMenu(false);renderGrid();renderEditor();
}
// the Bars menu: what it acts on, and what's possible
function barsMenu(open){
  const m=$('barsMenu');if(open==null)open=m.hidden;
  m.hidden=!open;$('edBars').setAttribute('aria-expanded',String(open));
  if(!open)return;
  const [a,b]=selRange(),sel=SEL.a!=null,pick=ED.bar<0;
  $('barsWhat').textContent=pick?'The pickup can’t be copied.':sel?`Selected: ${rangeText(a,b)}`:`This bar (${a+1}). Select bars to work on several.`;
  $('mnSelect').textContent=sel?'Clear selection':'Select bars…';
  for(const id of ['mnCopy','mnCut','edDelete','mnLoop'])$(id).disabled=pick;
  $('mnLoop').textContent=`Loop ${rangeText(a,b)}`;
  $('mnPaste').disabled=pick||!CLIP.bars;
  $('mnPaste').textContent=!CLIP.bars?'Paste (nothing copied)':sel?`Paste over ${rangeText(a,b)}`:`Paste after bar ${a+1}`;
  $('edDelete').textContent=`Delete ${rangeText(a,b)}`;
  for(const id of ['mnRepeat','mnEnd1','mnEnd2','mnNoRep'])$(id).disabled=pick;
  const raw=rawBars(),hasRep=!pick&&raw.slice(a,b+1).some(r=>r.rs||r.re||r.end);
  $('mnNoRep').disabled=!hasRep;
  $('mnRepeat').setAttribute('aria-label',`Repeat ${rangeText(a,b)}`);
  $('mnEnd1').setAttribute('aria-label',`Make ${rangeText(a,b)} the 1st ending`);
  $('mnEnd2').setAttribute('aria-label',`Make ${rangeText(a,b)} the 2nd ending`);
  $('mnNoRep').setAttribute('aria-label',`Remove repeat signs and endings from ${rangeText(a,b)}`);
  $('edDelete').disabled=pick||b-a+1>=rawBars().length;
  placeMenu($('barsMenu'),$('edBars'));
  $('mnSelect').focus();
}
// Open a pop-up menu above its button if it fits there, else below; if neither has room it
// takes the bigger side and scrolls. "Room" is what's visible: the screen and any panel that clips.
function placeMenu(m,btn){
  m.classList.remove('down');m.style.maxHeight='';
  let top=0,bottom=innerHeight;
  for(let el=btn.parentElement;el&&el!==document.body;el=el.parentElement){
    const o=getComputedStyle(el);
    if(/(auto|scroll|hidden|clip)/.test(o.overflowY)){const r=el.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
  }
  const b=btn.getBoundingClientRect(),h=m.offsetHeight+8,above=b.top-top,below=bottom-b.bottom;
  if(h<=above)return;
  if(h<=below||below>above)m.classList.add('down');
  const room=Math.max(above,below)-8;
  if(h>room+8)m.style.maxHeight=room+'px';
}

// ---------- Melody entry (bar editor, Melody) ----------
const fmtBeats=b=>{const w=Math.floor(b+1e-6),f=b-w,fr=f>0.7?'¾':f>0.6?'⅔':f>0.4?'½':f>0.3?'⅓':f>0.2?'¼':'';return (w||!fr?String(w):'')+fr;};
function melMsg(t){$('edMelMsg').textContent=t;}
const LEN_NAME={w:'whole',h:'half',q:'quarter',e:'eighth',s:'sixteenth'};
// the selected voice of a bar (1, or 2: its own rhythm, stems down)
const vGet=bar=>splitVoices(melGet(bar))[ED.voice===2?1:0];
function vSet(bar,str){const [a,b]=splitVoices(melGet(bar));melSet(bar,ED.voice===2?joinVoices(isSlashBar(a)?'':a,str):joinVoices(str,b));}
const toksOf=bar=>vGet(bar).split(' ').filter(t=>t&&t!=='/');
const showPitch=p=>p.replace('#','♯').replace(/^([A-G])b/,'$1♭');
function renderMelEditor(){
  const toks=toksOf(ED.bar);
  if(ED.note!=null&&ED.note>=toks.length)ED.note=null;
  if(ED.note==null)ED.insert=false;
  $('edAddEnd').hidden=$('edInsNote').hidden=ED.note==null;
  $('edInsNote').setAttribute('aria-pressed',String(ED.insert));
  // one button per note; the selected one is the one you're changing
  const box=$('edNotes');box.innerHTML='';
  toks.forEach((t,i)=>{
    const n=melTok(t);if(!n)return;
    const b=document.createElement('button');b.type='button';b.className='slot note';
    b.setAttribute('aria-pressed',String(ED.note===i));
    const lab=document.createElement('span');lab.textContent=n.p?n.ps.map(showPitch).join(' '):'Rest';b.appendChild(lab);
    const ic=document.querySelector(`#edLens .len[data-len="${n.d}"] svg`);if(ic){const c=ic.cloneNode(true);c.setAttribute('width','13');c.setAttribute('height','16');b.appendChild(c);}
    if(n.dot||n.tri||n.tie){const x=document.createElement('span');x.className='mod';x.textContent=(n.dot?'.':'')+(n.tri?'³':'')+(n.tie?'‿':'');b.appendChild(x);}
    b.setAttribute('aria-label',`Note ${i+1}: ${n.p?n.ps.map(x=>x.replace(/^([A-G])b/,'$1 flat').replace('#',' sharp')).join(n.ps.length>1?' and ':''):'rest'}${n.ps.length>1?' (chord)':''}, ${n.dot?'dotted ':''}${LEN_NAME[n.d]}${n.tri?' triplet':''}${n.tie?', tied':''}`);
    b.onclick=()=>selectNote(ED.note===i?null:i);
    box.appendChild(b);
  });
  const add=document.createElement('button');add.type='button';add.className='btn small';add.textContent='+ Add';
  add.setAttribute('aria-pressed',String(ED.note==null));add.setAttribute('aria-label','Add notes at the end of the bar');
  add.onclick=()=>selectNote(null);box.appendChild(add);
  for(const b of document.querySelectorAll('#edLens .len'))b.setAttribute('aria-pressed',String(b.dataset.len===ED.len));
  $('edDot').setAttribute('aria-pressed',String(ED.dot));$('edTri').setAttribute('aria-pressed',String(ED.tri));
  const tt=tieTarget();$('edTie').setAttribute('aria-pressed',String(!!(tt&&tt.toks[tt.i].endsWith('~'))));$('edTie').disabled=!tt;
  if(ED.note!=null)$('edRest').setAttribute('aria-label',ED.insert?'Insert a rest':'Make this note a rest');else $('edRest').removeAttribute('aria-label');
  $('edChord').setAttribute('aria-pressed',String(ED.chord));
  if(ED.bar<0)ED.voice=1;
  $('edV1').setAttribute('aria-pressed',String(ED.voice===1));$('edV2').setAttribute('aria-pressed',String(ED.voice===2));$('edV2').disabled=ED.bar<0;
  $('edSlash').setAttribute('aria-pressed',String(isSlashBar(melGet(ED.bar))));$('edSlash').disabled=ED.bar<0;
  const used=melBeats(vGet(ED.bar)),cap=curBpb();
  $('edFill').textContent=`${fmtBeats(used)} of ${cap} beats`;
  $('edRec').setAttribute('aria-label',S.loop?`Record bars ${S.loop.a+1} to ${S.loop.b+1}`:`Record from bar ${Math.max(0,ED.bar)+1}`);
  $('edRec').title=$('edRec').getAttribute('aria-label');hearUI();
  markSelNote();
}
function markSelNote(){
  for(const e of document.querySelectorAll('.staff .selnote'))e.classList.remove('selnote');
  if(ED.open&&ED.part==='melody'&&ED.note!=null)NOT.els.get(ED.bar+':'+ED.voice+':'+ED.note)?.classList.add('selnote');
}
// the note under a tap (x px from the line's left) in bar i, or null if the tap is past the last note
// The note under a tap in bar i (x, y px within the line's staff): {ni, v}. ni null = add at the
// end of voice v (a filler rest, or past the last note). With two voices, height decides too.
function noteAt(i,x,y){
  const hs=NOT.hits.get(i)||[];if(!hs.length)return {ni:null,v:ED.voice};
  const two=hs.some(h=>h.v===2);
  let best=null,bd=1e9;
  for(const h of hs){const d=Math.abs(h.x-x)+(two&&y!=null?0.8*Math.abs(h.y-y):0);if(d<bd){bd=d;best=h;}}
  const own=hs.filter(h=>h.v===best.v);
  if(x>own[own.length-1].x+22)return {ni:null,v:best.v};   // after everything: add at the end
  return {ni:best.ni,v:best.v};                             // a filler rest is null too
}
function setVoice(v){
  if(ED.bar<0)v=1;   // a pickup has one voice
  if(ED.voice===v)return;
  ED.voice=v;ED.note=null;ED.insert=false;STACK.ref=null;
  melMsg(v===2?'Voice 2: its own rhythm, stems down (e.g. a held note under a moving line).':'Voice 1: the melody.');
  renderGrid();renderEditor();
}
// ← → step through the notes, on into the next / previous bar
function stepNote(d){
  const n=toksOf(ED.bar).length,lo=-1,hi=rawBars().length-1;
  if(d>0){
    if(ED.note!=null&&ED.note+1<n)return selectNote(ED.note+1);
    if(ED.note!=null)return selectNote(null);              // past the last note: add at the end
    if(ED.bar<hi){moveBar(1);if(toksOf(ED.bar).length)selectNote(0);}
  }else{
    if(ED.note==null&&n)return selectNote(n-1);
    if(ED.note>0)return selectNote(ED.note-1);
    if(ED.bar>lo){moveBar(-1);const m=toksOf(ED.bar).length;if(m)selectNote(m-1);}
  }
}
// selecting a note shows its length on the length buttons
function selectNote(i){
  ED.note=i;STACK.ref=i==null?null:{bar:ED.bar,i};STACK.held=new Set();
  if(i!=null){const n=melTok(toksOf(ED.bar)[i]);if(n){ED.len=n.d;ED.dot=n.dot;ED.tri=n.tri;}}
  melMsg(i==null?'Adding notes at the end of the bar.':'Tap a key to change this note, or pick a new length.');
  renderMelEditor();
}
function toggleInsert(){
  ED.insert=!ED.insert;STACK.ref=null;
  if(!ED.insert&&ED.note!=null){const n=melTok(toksOf(ED.bar)[ED.note]);if(n){ED.len=n.d;ED.dot=n.dot;ED.tri=n.tri;}}
  melMsg(ED.insert?'Insert: keys (and Rest) add new notes before the selected one, using the room at the end of the bar.':'Insert off: keys change the selected note.');
  renderMelEditor();
}
// The note Tie works on: the selected one, else the last note in the bar (or before it).
function tieTarget(){
  if(ED.note!=null){const t=toksOf(ED.bar);return t[ED.note]&&!t[ED.note].startsWith('r')?{bar:ED.bar,toks:t,i:ED.note}:null;}
  for(let b=ED.bar;b>=Math.max(-1,ED.bar-1);b--){const t=toksOf(b);if(t.length)return t[t.length-1].startsWith('r')?null:{bar:b,toks:t,i:t.length-1};}
  return null;
}
function toggleTie(){
  const tt=tieTarget();if(!tt)return;
  const on=!tt.toks[tt.i].endsWith('~');
  tt.toks[tt.i]=on?tt.toks[tt.i]+'~':tt.toks[tt.i].replace(/~$/,'');
  vSet(tt.bar,tt.toks.join(' '));
  melMsg(on?'Tied to the next note (it can be in the next bar).':'Tie removed.');
  renderGrid();renderEditor();
}
function melAdd(pitch){   // pitch name, or 'r' for a rest; returns {bar,i} of the note it wrote
  const tok=pitch+ED.len+(ED.dot?'.':'')+(ED.tri?'t':''),cap=curBpb();
  if(ED.note!=null&&ED.insert){   // Insert: a new note before the selected one, using the room at the end of the bar
    const toks=toksOf(ED.bar),free=cap-melBeats(toks.join(' ')),nb=melTok(tok).beats;
    if(nb>free+1e-6){melMsg(free>1e-6?`Only ${fmtBeats(free)} beat${Math.abs(free-1)<1e-6?'':'s'} free in this bar. Pick a shorter length, or shorten or delete a note first.`:'This bar is full. Shorten or delete a note first to make room.');return null;}
    toks.splice(ED.note,0,tok);vSet(ED.bar,toks.join(' '));
    const at={bar:ED.bar,i:ED.note};ED.note++;   // stay on the same note, now one further along
    melMsg('Inserted. Keep going, or turn Insert off.');renderGrid();renderEditor();return at;
  }
  if(ED.note!=null&&ED.chord&&pitch!=='r'){   // Chord on: build the selected note up
    STACK.ref={bar:ED.bar,i:ED.note};STACK.held=new Set();melStack(pitch,pitchMidi(pitch));return STACK.ref;
  }
  if(ED.note!=null){   // change the selected note
    const at={bar:ED.bar,i:ED.note};
    const toks=toksOf(ED.bar),old=melTok(toks[ED.note]);
    const tied=old.tie&&pitch!=='r'?'~':'';
    const next=[...toks];next[ED.note]=tok+tied;
    if(melBeats(next.join(' '))>cap+1e-6){melMsg('That won’t fit in this bar.');return null;}
    vSet(ED.bar,next.join(' '));
    ED.note=ED.note+1<toks.length?ED.note+1:null;   // on to the next note, like a notation program
    if(ED.note!=null){const n=melTok(toks[ED.note]);ED.len=n.d;ED.dot=n.dot;ED.tri=n.tri;}
    melMsg(ED.note!=null?`Changed. Now on note ${ED.note+1}.`:'Changed. Back to adding at the end.');
    renderGrid();renderEditor();return at;
  }
  let cur=isSlashBar(melGet(ED.bar))?'':vGet(ED.bar),used=melBeats(cur);const nb=melTok(tok).beats;
  // this bar is already full (e.g. you stayed to finish a chord): carry on in the next bar
  if(used>=cap-1e-6&&ED.bar<rawBars().length-1){ED.bar++;cur=isSlashBar(melGet(ED.bar))?'':vGet(ED.bar);used=melBeats(cur);}
  if(used+nb>cap+1e-6){melMsg(`That won’t fit: ${fmtBeats(cap-used)} beat${Math.abs(cap-used-1)<1e-6?'':'s'} left in this bar.`);return null;}
  vSet(ED.bar,(cur+' '+tok).trim());
  const at={bar:ED.bar,i:toksOf(ED.bar).length-1};
  const full=Math.abs(used+nb-cap)<1e-6,last=rawBars().length-1;
  // a full bar moves on, except while building a chord: you stay to finish it
  if(full&&ED.chord)melMsg('Bar full. Finish the chord, then tap a length to start the next one (it goes in the next bar).');
  else if(full&&ED.bar<last){ED.bar++;melMsg(`${ED.bar===0?'Pickup':'Bar '+ED.bar} is full. On to bar ${ED.bar+1}.`);}
  else melMsg(full?'Last bar done.':'');
  renderGrid();renderEditor();return at;
}
// a new length (or dot / triplet) for the selected note
function setSelLength(){
  if(ED.note==null||ED.insert){renderMelEditor();return;}   // in Insert, lengths are for the new notes
  const toks=toksOf(ED.bar),old=melTok(toks[ED.note]);
  const next=[...toks];next[ED.note]=(old.p||'r')+ED.len+(ED.dot?'.':'')+(ED.tri?'t':'')+(old.tie?'~':'');
  if(melBeats(next.join(' '))>curBpb()+1e-6){melMsg('That’s too long for the space left in this bar.');ED.len=old.d;ED.dot=old.dot;ED.tri=old.tri;renderMelEditor();return;}
  vSet(ED.bar,next.join(' '));melMsg('');renderGrid();renderEditor();
}
function melDel(){
  STACK.ref=null;
  if(ED.note!=null){
    const t=toksOf(ED.bar);t.splice(ED.note,1);vSet(ED.bar,t.join(' '));
    if(ED.note>=t.length)ED.note=null;else{const n=melTok(t[ED.note]);ED.len=n.d;ED.dot=n.dot;ED.tri=n.tri;}
    melMsg('');renderGrid();renderEditor();return;
  }
  let t=toksOf(ED.bar);
  if(!t.length&&ED.bar>-1){ED.bar--;t=toksOf(ED.bar);}
  if(t.length){t.pop();vSet(ED.bar,t.join(' '));}   // the note before keeps its tie
  melMsg('');renderGrid();renderEditor();
}
// ---------- Hearing the melody (no band) ----------
// Uses the playback timeline, so ties are honoured: a note tied into the next bar rings for its
// full length, and a note tied in from before the start sounds at once. Notes go through their own
// gain node so Stop can cut them; the note playing lights up as during playback.
const PREV={on:false,bus:null,q:[],i:0,end:0,raf:0};
function hearRange(a,b){
  hearStop();initAudio();
  const bd=60/S.bpm,t0=ctx.currentTime+0.08,sw=swingNow();
  const when=x=>{const f=x-Math.floor(x+1e-6);return (Math.floor(x+1e-6)+(Math.abs(f-0.5)<1e-3?sw:f))*bd;};
  const bus=ctx.createGain();bus.connect(busKy);
  Object.assign(PREV,{on:true,bus,q:[],i:0,end:t0+(b-a)*bd});
  for(const e of getTimeline().events){
    if(e.midi==null||e.abs>=b-1e-6||e.abs+e.dur<=a+1e-6)continue;
    const from=Math.max(e.abs,a)-a,t=t0+when(from);
    for(const m of e.midis)melVoice(m,t,(e.abs+e.dur-a-from)*bd*0.95,m===e.midi?82:64,bus);
    PREV.q.push({t,e});
  }
  hearUI();PREV.raf=requestAnimationFrame(hearTick);
}
function hearTick(){
  if(!PREV.on)return;
  const now=ctx.currentTime;
  while(PREV.i<PREV.q.length&&PREV.q[PREV.i].t<=now){
    const {e}=PREV.q[PREV.i++];showMel(e);
    const cell=e.wbar<0?PICK:CELLS[e.wbar];
    if(cell&&cell!==curCell){setCur(cell);followLine(cell);}
  }
  if(now>=PREV.end+0.1){hearStop();return;}
  PREV.raf=requestAnimationFrame(hearTick);
}
function hearStop(){
  if(!PREV.on)return;
  PREV.on=false;cancelAnimationFrame(PREV.raf);
  try{PREV.bus.gain.setTargetAtTime(0,ctx.currentTime,0.02);const b=PREV.bus;setTimeout(()=>b.disconnect(),300);}catch(e){}
  if(!P.playing){showMel(null);setCur(null);}
  hearUI();
}
function hearUI(){
  $('edHearAll').setAttribute('aria-pressed',String(PREV.on));
  $('edHearAllLabel').textContent=PREV.on?'Stop':(S.loop?'Hear the loop':'Hear from here');
}
// the first time a written bar is played (Hear works in playing order, like the band)
const playedAt=w=>Math.max(0,(chartSong.played||chartSong).map.indexOf(w));
function hearBar(){
  const tl=getTimeline(),bpb=curBpb(),a=ED.bar<0?-tl.pickupBeats:playedAt(ED.bar)*bpb;
  hearRange(a,ED.bar<0?0:a+bpb);
}
// from the bar you're on to the end of the song (or just the looped bars)
function hearFromHere(){
  if(PREV.on){hearStop();return;}
  const tl=getTimeline(),bpb=curBpb(),pl=chartSong.played||chartSong;
  if(S.loop){const [pa,pb]=loopRange();return hearRange(pa*bpb,(pb+1)*bpb);}
  hearRange(ED.bar<0?-tl.pickupBeats:playedAt(ED.bar)*bpb,pl.map.length*bpb);
}
// ---------- Recording ----------
function recUI(on){document.body.classList.toggle('recording',on);loopHint(on?`Recording bars ${REC.from+1}–${REC.to+1}. Play along; tap Stop when you’re done.`:'');}
function recStart(){
  hearStop();
  const from=S.loop?S.loop.a:Math.max(0,ED.bar),to=S.loop?S.loop.b:chartSong.bars.length-1;
  if(P.playing)stop();
  if(ED.open)closeEditor();
  Object.assign(REC,{on:true,review:false,notes:[],marks:[],from,to,lastBar:null,held:new Map()});
  recUI(true);start(S.loop?0:from,true);
}
function recFinish(){
  REC.on=false;if(P.playing)stop();recUI(false);
  if(!REC.notes.length){songMsg('Nothing was recorded.',true);return;}
  REC.backup=[];for(let b=REC.from;b<=REC.to;b++)REC.backup.push(melGet(b));
  REC.review=true;$('recSnap').value=REC.snap?'snap':'raw';
  recApply();$('recPanel').hidden=false;$('recKeep').focus();
}
function recApply(){
  recTranscribe(!REC.snap).forEach((str,k)=>melSet(REC.from+k,joinVoices(str,melVoice2(REC.backup[k]||''))));
  $('recTitle').textContent=`Take · bars ${REC.from+1}–${REC.to+1}`;
  $('recCount').textContent=`${REC.notes.length} note${REC.notes.length===1?'':'s'}`;
  $('recNote').textContent=REC.snap?'Lined up to the beat (swung eighths). Odd spots? Fix them in the bar editor. Tap Play to hear it with the band.':'Lined up to 16ths and triplets: closer to exactly what you played.';
  renderGrid();
}
function recRestore(){REC.backup.forEach((str,k)=>melSet(REC.from+k,str));}
function recDone(keep){
  if(P.playing)stop();
  if(!keep)recRestore();
  REC.review=false;$('recPanel').hidden=true;renderGrid();
  songMsg(keep?'Melody kept. Save the song to keep it for good.':'','note');
}

// ---------- Keyboard (on screen) ----------
function setTones(ch){
  if(ch===curTones)return;curTones=ch;
  const on=S.tones&&ch;
  for(const k of $('kb').children){
    const pc=((+k.dataset.m-(ch?ch.root:0))%12+12)%12;
    k.dataset.tone=!on?'':ch.guide.includes(pc)?'gt':ch.arp.includes(pc)?'ct':(ch.ext||[]).includes(pc)?'ex':'';
  }
}
function buildKeyboard(){
  const kb=$('kb');kb.innerHTML='';
  const W=kb.clientWidth;if(!W||!kb.clientHeight){$('octlbl').textContent='C'+(S.oct??4);return;}
  const whites=Math.max(7,Math.min(29,Math.floor(W/46)));
  if(S.oct==null)S.oct=whites>=14?3:4;
  const startM=12*(S.oct+1),ww=W/whites;
  const isBlack=m=>[1,3,6,8,10].includes(m%12);
  let wi=0,m=startM;
  while(wi<whites){
    const k=document.createElement('div');k.dataset.m=m;
    if(isBlack(m)){k.className='k b';const bw=ww*0.6;k.style.left=(wi*ww-bw/2)+'px';k.style.width=bw+'px';}
    else{
      k.className='k w';k.style.left=(wi*ww+1)+'px';k.style.width=(ww-2)+'px';
      if(m%12===0){const l=document.createElement('div');l.className='clbl';l.textContent='C'+(m/12-1);k.appendChild(l);}
      wi++;
    }
    const d=document.createElement('div');d.className='dot';k.appendChild(d);
    if(downCount.get(m)>0)k.classList.add('down');
    kb.appendChild(k);m++;
  }
  const last=kb.lastElementChild;if(last&&last.classList.contains('b'))last.remove();
  $('octlbl').textContent='C'+S.oct;
  const ch=curTones;curTones=undefined;setTones(ch);
}
// keyboard height, remembered separately for portrait and landscape; 0 = hidden
function kbMax(){return Math.round(Math.min(420,innerHeight*(MQ_SHORT.matches?0.55:0.5)));}
function kbHeight(){
  const o=orient(),v=S.kbH[o];
  if(v==null)return Math.round(o==='land'?Math.min(130,innerHeight*0.3):Math.min(240,innerHeight*0.3));
  return Math.min(v,kbMax());
}
function applyKbHeight(){
  // entering a melody on a phone: a shorter keyboard leaves room to see the staff
  const h=document.body.classList.contains('melEdit')?Math.min(kbHeight(),150):kbHeight(),kb=$('kb');
  if(kb.style.height!==h+'px'){kb.style.height=h+'px';}
  kb.hidden=h===0;
  $('kbToggle').textContent=h===0?'Show keys':'Hide';
  $('kbToggle').setAttribute('aria-label',h===0?'Show the keyboard':'Hide the keyboard');
  const hd=$('kbHandle');hd.setAttribute('aria-valuenow',String(h));hd.setAttribute('aria-valuemax',String(kbMax()));
  hd.setAttribute('aria-valuetext',h===0?'Keyboard hidden':`${h} pixels`);
  buildKeyboard();
}
function setKbHeight(h,remember=true){
  h=Math.round(Math.max(0,Math.min(kbMax(),h)));if(h<50)h=0;
  const o=orient();if(remember&&h>0)S.kbLast[o]=h;
  S.kbH[o]=h;store.set('kbH',S.kbH);store.set('kbLast',S.kbLast);applyKbHeight();
}
function wireKbHandle(){
  const hd=$('kbHandle');let drag=null;
  hd.addEventListener('pointerdown',e=>{hd.setPointerCapture(e.pointerId);drag={y:e.clientY,h:kbHeight()};e.preventDefault();});
  hd.addEventListener('pointermove',e=>{if(!drag)return;const h=Math.max(0,Math.min(kbMax(),drag.h-(e.clientY-drag.y)));$('kb').hidden=h<50;$('kb').style.height=h+'px';});
  const end=e=>{if(!drag)return;const h=drag.h-(e.clientY-drag.y);drag=null;setKbHeight(h);};
  hd.addEventListener('pointerup',end);hd.addEventListener('pointercancel',()=>{drag=null;applyKbHeight();});
  hd.addEventListener('keydown',e=>{
    const h=kbHeight();
    if(e.key==='ArrowUp'){setKbHeight(h===0?120:h+20);e.preventDefault();}
    else if(e.key==='ArrowDown'){setKbHeight(h-20);e.preventDefault();}
    else if(e.key==='Home'){setKbHeight(0);e.preventDefault();}
    else if(e.key==='End'){setKbHeight(kbMax());e.preventDefault();}
  });
  $('kbToggle').onclick=()=>{const o=orient();setKbHeight(kbHeight()===0?(S.kbLast[o]||(o==='land'?120:220)):0,false);};
}
const active=new Map(),sustained=new Map(),downCount=new Map();
let sustain=false;
function keyAt(x,y){
  const el=document.elementFromPoint(x,y);
  const k=el&&el.closest&&el.closest('.k');
  return k&&$('kb').contains(k)?+k.dataset.m:null;
}
function keyEl(m){return $('kb').querySelector(`[data-m="${m}"]`);}
function markDown(m,d){const n=(downCount.get(m)||0)+(d?1:-1);downCount.set(m,Math.max(0,n));const e=keyEl(m);if(e)e.classList.toggle('down',n>0);}
const SILENT={releaseNow(){}};
function press(id,m,vel=100,silent=false){
  if(!silent)initAudio();
  if(sustained.has(m)){sustained.get(m).releaseNow();sustained.delete(m);}
  const h=silent?SILENT:keyVoice(m,vel);
  active.set(id,{m,h});markDown(m,true);recNoteOn(m);
}
function release(id){
  const a=active.get(id);if(!a)return;active.delete(id);markDown(a.m,false);recNoteOff(a.m);melKeyUp(a.m);
  if(sustain){if(sustained.has(a.m))sustained.get(a.m).releaseNow();sustained.set(a.m,a.h);}
  else a.h.releaseNow();
}
function wireKeyboard(){
  const kb=$('kb');
  kb.addEventListener('pointerdown',e=>{
    e.preventDefault();
    try{kb.setPointerCapture(e.pointerId);}catch(_){}
    const m=keyAt(e.clientX,e.clientY);if(m!=null){press(e.pointerId,m);melKey(m);}
  });
  kb.addEventListener('pointermove',e=>{
    if(!active.has(e.pointerId))return;
    const m=keyAt(e.clientX,e.clientY),a=active.get(e.pointerId);
    if(m!==a.m){release(e.pointerId);if(m!=null)press(e.pointerId,m);}
  });
  const up=e=>release(e.pointerId);
  kb.addEventListener('pointerup',up);kb.addEventListener('pointercancel',up);kb.addEventListener('lostpointercapture',up);
  kb.addEventListener('contextmenu',e=>e.preventDefault());
  // Cancel the browser's touch gestures on the keys (stops Android's long-press buzz).
  for(const ev of ['touchstart','touchmove','touchend'])kb.addEventListener(ev,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
}
// In melody entry a key adds a note. Keys pressed while a key of the last note is still held join
// that note as a chord (they needn't land together, only overlap); with Chord on, taps stack too.
const STACK={ref:null,held:new Set()};
function melKey(m){
  if(!(ED.open&&ED.part==='melody'&&!ED.text&&!REC.on))return;
  const name=midiName(m,S.keySig);
  if(STACK.ref&&(STACK.held.size||ED.chord)){melStack(name,m);return;}
  STACK.ref=melAdd(name);STACK.held=new Set(STACK.ref?[m]:[]);
}
function melKeyUp(m){STACK.held.delete(m);}
// add (or with Chord on, toggle) a pitch in the note at STACK.ref
function melStack(name,m){
  const {bar,i}=STACK.ref,toks=toksOf(bar),n=melTok(toks[i]||'');
  if(!n||!n.p){STACK.ref=null;return melKey(m);}
  let ps=[...n.ps];const has=ps.some(p=>pitchMidi(p)===m);
  if(has&&ED.chord&&!STACK.held.size&&ps.length>1)ps=ps.filter(p=>pitchMidi(p)!==m);   // tap again to take it out
  else if(!has)ps.push(name);
  STACK.held.add(m);
  toks[i]=melJoin(ps,n.d+(n.dot?'.':'')+(n.tri?'t':''))+(n.tie?'~':'');
  vSet(bar,toks.join(' '));renderGrid();renderEditor();
}
function setMelKeys(on){S.melKeys=!!on;store.set('melKeys',S.melKeys);$('cMelKeys').checked=S.melKeys;$('melKeysBtn').setAttribute('aria-pressed',String(S.melKeys));if(!S.melKeys)for(const k of $('kb').querySelectorAll('.mel,.melnext'))k.classList.remove('mel','melnext');}
function setKeySig(k){S.keySig=NOTE_KEYS.includes(k)?k:'C';store.set('keySig',S.keySig);$('keySig').value=S.keySig;renderGrid();}
function setSustain(on){
  sustain=on;$('cSus').checked=sustain;
  if(!sustain){sustained.forEach(h=>h.releaseNow());sustained.clear();}
}
function updateLeslieBtn(){const b=$('leslieBtn'),sp=S.leslieFast?'fast':'slow';b.innerHTML=`<span class="lw">Leslie </span>${sp}`;b.setAttribute('aria-label','Leslie '+sp);b.setAttribute('aria-pressed',String(S.leslieFast));}

// ---------- Trio, mutes, rhythm section ----------
function setTrio(on){
  S.trio=!!on;store.set('trio',S.trio);
  document.body.classList.toggle('trio',S.trio);$('cTrio').checked=S.trio;
  $('mCp').disabled=S.trio;$('mCp').title=S.trio?'Comping is off in trio mode':'';
  $('compBtn').hidden=S.trio;
  applyVolumes();if(!S.trio)buildKeyboard();
}
const MUTE_BTNS={dr:'mDr',bs:'mBs',cp:'mCp'};
const MUTE_NAMES={dr:'Drums',bs:'Bass',cp:'Comping'};
function refreshMute(key){
  const b=$(MUTE_BTNS[key]);b.setAttribute('aria-pressed',String(!S.mute[key]));b.title=`${MUTE_NAMES[key]} ${S.mute[key]?'muted':'on'}. Tap to ${S.mute[key]?'unmute':'mute'}.`;
  if(key==='cp'){const c=$('compBtn');c.setAttribute('aria-pressed',String(!S.mute.cp));c.title=S.trio?'Comping is off in trio mode':`Comping ${S.mute.cp?'off':'on'}`;}
}
function setMute(key,on){S.mute[key]=on;store.set('mute',S.mute);applyVolumes();refreshMute(key);if(key==='cp'&&!on&&S.secMutedComp){S.secMutedComp=false;store.set('secMutedComp',false);}}
// Rhythm-section profile (Swing style). Choosing one also applies its swing ratio and feel,
// and mutes the comping for profiles where you're the pianist (Monk).
function setSection(id,applyDefaults){
  S.section=SECTIONS[id]?id:'std';store.set('section',S.section);$('section').value=S.section;
  if(applyDefaults){
    const X=curSection();setSlider('Swing',X.swingAdj);setFeel(X.feel);
    if(X.compOff&&!S.mute.cp){setMute('cp',true);S.secMutedComp=true;store.set('secMutedComp',true);songMsg('Comping muted: you’re Monk. Turn Comp back on in Sound.','note');}
    else if(!X.compOff&&S.secMutedComp){S.secMutedComp=false;store.set('secMutedComp',false);setMute('cp',false);}
  }
  updateTitle();
}

// ---------- MIDI input (Web MIDI: Chrome/Edge, incl. Android Chrome; not iPhone Safari) ----------
const MIDI={access:null};
function midiStatus(t){$('midiStatus').textContent=t;}
function midiRefresh(){
  const ins=MIDI.access?[...MIDI.access.inputs.values()].filter(i=>i.state==='connected'):[];
  ins.forEach(i=>{i.onmidimessage=midiMessage;});
  midiStatus(ins.length?'Connected: '+ins.map(i=>i.name).join(', '):'No MIDI keyboard found. Plug it in and it will be picked up automatically.');
  $('midiBtn').textContent=MIDI.access?'Connected':'Connect';$('midiBtn').disabled=!!MIDI.access;
}
async function midiConnect(fromUser){
  if(!navigator.requestMIDIAccess){midiStatus('This browser doesn’t support MIDI. It works in Chrome and Edge, including Chrome on Android.');return;}
  try{
    MIDI.access=await navigator.requestMIDIAccess();
    MIDI.access.onstatechange=midiRefresh;midiRefresh();store.set('midiOn',true);
    if(fromUser)initAudio();
  }catch(e){
    let state='unknown';try{state=(await navigator.permissions.query({name:'midi'})).state;}catch(_){}
    const blocked=state!=='granted'&&e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
    midiStatus(blocked
      ?'MIDI access was blocked. Allow MIDI for this site in the browser’s site settings, then try again.'
      :'Couldn’t start MIDI on this device'+(e&&e.message?' ('+e.message+')':'')+'.');
  }
}
function midiMessage(e){
  const [st,d1,d2=0]=e.data,cmd=st&0xf0;
  if(cmd===0x90&&d2>0){press('midi'+d1,d1,d2,!S.midiSound);melKey(d1);}
  else if(cmd===0x80||(cmd===0x90&&d2===0))release('midi'+d1);
  else if(cmd===0xB0&&d1===64)setSustain(d2>=64);                     // sustain pedal
  else if(cmd===0xB0&&d1===1&&S.keyInst==='organ'){                  // mod wheel: Leslie slow/fast
    const f=d2>=64;if(f!==S.leslieFast){S.leslieFast=f;updateLeslieBtn();if(ctx)setLeslie(f);}
  }
}

// ---------- Song settings ----------
// Song messages. Confirmations show fresh each time (blank, then the text, so a repeat save still
// flashes and is announced again) and fade after 4 s. Problems (true) and notes ('note') stay until the next action.
let songMsgTimer=0;
function songMsg(t,sticky=false){
  const el=$('songMsg');clearTimeout(songMsgTimer);
  el.classList.remove('fading');el.textContent='';
  if(!t)return;
  setTimeout(()=>{
    el.textContent=t;el.classList.toggle('problem',sticky===true);
    if(!sticky)songMsgTimer=setTimeout(()=>{el.classList.add('fading');songMsgTimer=setTimeout(()=>{el.textContent='';el.classList.remove('fading');},400);},4000);
  },120);
}
const STYLE_NAMES={swing:'Swing',ballad:'Ballad',waltz:'Jazz waltz (3/4)',bossa:'Bossa nova',samba:'Samba'};
function updateTitle(){
  $('title').textContent=[S.songName||'Untitled',S.composer,STYLE_NAMES[S.style],S.style==='swing'&&S.section!=='std'?curSection().name:''].filter(Boolean).join(' · ');
}
function setSongName(n){S.songName=n;store.set('songName',n);$('songName').value=n;updateTitle();}
function setComposer(n){S.composer=(n||'').trim();store.set('composer',S.composer);$('composer').value=S.composer;updateTitle();}
function setFeel(f){S.bassFeel=['4','2','24'].includes(f)?f:'24';store.set('bassFeel',S.bassFeel);$('bassFeel').value=S.bassFeel;}
function setDynamics(on){S.dynamics=!!on;store.set('dynamics',S.dynamics);$('cDyn').checked=S.dynamics;}
function setStyle(v){
  const prevBpb=curBpb();
  S.style=STYLE_NAMES[v]?v:'swing';store.set('style',S.style);$('style').value=S.style;
  const straight=S.style==='bossa'||S.style==='samba';
  $('styleNote').textContent=straight?'Straight eighths; the Swing slider and drum style don’t apply.':S.style==='ballad'?'Brushes; the drum style setting doesn’t apply.':'';
  $('bassFeel').hidden=!['swing','ballad','waltz'].includes(S.style);$('cDyn').hidden=$('bassFeel').hidden;
  $('section').hidden=S.style!=='swing';
  if(curBpb()!==prevBpb){if(ED.open)closeEditor();clearLoop(true);applyChartText(S.chart);}
  P.bossaComp=null;P.compPlan=null;if(ctx)silenceDrums();updateTitle();
}
const OPEN_LIST=[];   // sl-option values can't hold spaces, so options map to this list
function refreshSongList(){
  const sel=$('openSong');sel.innerHTML='';OPEN_LIST.length=0;
  const add=(text,item)=>{const o=document.createElement('sl-option');o.value='o'+OPEN_LIST.length;o.textContent=text;OPEN_LIST.push(item);sel.appendChild(o);};
  const head=t=>{const s=document.createElement('small');s.textContent=t;sel.appendChild(s);};
  const names=Object.keys(S.songs).sort((a,b)=>a.localeCompare(b));
  head(names.length?'My songs':'My songs (none saved yet)');
  names.forEach(n=>add(n,{song:n}));
  head('Presets');Object.keys(PRESETS).forEach(n=>add(n,{preset:n}));
}
// "typical · 67%": the setting, and where the "and" lands at the current tempo
function swingLabel(adj=S.swingAdj){
  if(adj<=SWING_MIN)return 'straight';
  return (adj===0?'typical':(adj>0?'+':'')+adj)+' \u00b7 '+Math.round(swingPct(S.bpm,adj))+'%';
}
function setSlider(id,val){const s=$('s'+id);s.value=val;s.dispatchEvent(new CustomEvent('sl-input'));}
function saveSong(){
  const name=$('songName').value.trim();
  if(!name){songMsg('Give the song a name first.',true);$('songName').focus();return;}
  if(!chartSong.segs.length){songMsg('Nothing to save: the chart is empty.',true);return;}
  if(S.songs[name]&&name!==S.songName&&!confirm(`Replace the saved “${name}”?`))return;
  S.songs[name]={chart:S.chart,bpm:S.bpm,swingAdj:S.swingAdj,style:S.style,feel:S.bassFeel,dynamics:S.dynamics,section:S.section,saved:Date.now()};
  if(S.composer)S.songs[name].composer=S.composer;
  if(melHas())Object.assign(S.songs[name],{melody:JSON.parse(JSON.stringify(S.melody)),keySig:S.keySig});
  if(!store.set('songs',S.songs)){delete S.songs[name];songMsg('Couldn’t save: this browser is blocking storage.',true);return;}
  delete S.songsDeleted[name];store.set('songsDeleted',S.songsDeleted);songsChanged();
  setSongName(name);refreshSongList();
  songMsg(S.style!=='swing'?`Saved “${name}” (${STYLE_NAMES[S.style].toLowerCase()}, tempo ${S.bpm}).`:`Saved “${name}” (tempo ${S.bpm}, swing ${swingLabel()}).`);
}
function loadChart(chart,name,opts={}){
  if(ED.open)closeEditor();clearLoop(true);
  if(opts.style)setStyle(opts.style);
  S.melody=opts.melody?JSON.parse(JSON.stringify(opts.melody)):{pickup:'',bars:[]};melSave();melTimeline=null;
  S.keySig=NOTE_KEYS.includes(opts.keySig)?opts.keySig:'C';store.set('keySig',S.keySig);$('keySig').value=S.keySig;
  if(REC.review){REC.review=false;$('recPanel').hidden=true;}
  applyChartText(chart);setSongName(name);setComposer(opts.composer||'');
  $('chartWrap').scrollTop=0;   // a different song starts at the top
  queueMicrotask(histReset);
  if(opts.bpm)setBpm(opts.bpm);
  if(opts.swingAdj!=null)setSlider('Swing',opts.swingAdj);else if(opts.swing)setSlider('Swing',swingAdjFrom(opts.swing));
}
function loadSong(name){
  const s=S.songs[name];if(!s)return;
  setStyle(s.style||'swing');
  loadChart(s.chart,name,{bpm:s.bpm,swing:s.swing,swingAdj:s.swingAdj,melody:s.melody,keySig:s.keySig,composer:s.composer});
  setSection(s.section||'std',false);if(s.feel)setFeel(s.feel);if(s.dynamics!=null)setDynamics(s.dynamics);
  songMsg(`Loaded “${name}”.`);
}
function loadPreset(n){
  const pv=PRESETS[n],chart=typeof pv==='string'?pv:pv.chart;
  setStyle(typeof pv==='string'?'swing':pv.style);
  loadChart(chart,n,{bpm:pv.bpm});songMsg(`Loaded the “${n}” preset.`);
}
function newSong(){
  if(!confirm('Start a new song? The current chart is replaced (saved songs aren’t affected).'))return;
  loadChart('| Cmaj7 | % | % | % |','');songMsg('New song. Tap a bar to change its chords.');
}
function deleteSong(){
  const name=$('songName').value.trim();
  if(!S.songs[name]){songMsg('No saved song with that name.',true);return;}
  if(!confirm(`Delete “${name}”?`))return;
  delete S.songs[name];S.songsDeleted[name]=Date.now();store.set('songs',S.songs);store.set('songsDeleted',S.songsDeleted);refreshSongList();songsChanged();
  songMsg(`Deleted “${name}”. The chart stays on screen until you change it.`);
}
function openTextDialog(){
  $('chartText').value=S.chart;$('errs').textContent='';
  if($('sheet').open)$('sheet').hide();
  $('textDlg').show();
}

// ---------- Sliders, output ----------
function bindSlider(id,get,set,fmt){
  const s=$('s'+id),v=$('v'+id);
  const upd=()=>{v.textContent=fmt?fmt(+s.value):s.value;};
  s.value=get();upd();
  if(fmt)s.tooltipFormatter=x=>fmt(+x);
  s.addEventListener('sl-input',()=>{set(+s.value);upd();});
}
const MIX_SLIDERS=[['Dr','dr'],['Bs','bs'],['Cp','cp'],['Ky','ky'],['Rv','rv'],['Cy','cy']];
const dbLabel=x=>x===0?'off':(30*Math.log10(x/100)).toFixed(1)+' dB';
// Each output keeps its own slider positions; switching swaps them in.
function setOutput(o){
  S.output=o==='head'?'head':'phone';store.set('output',S.output);$('output').value=S.output;
  S.vol=S.vols[S.output];
  S.bassSound=S.bassSounds[S.output];$('bassSound').value=S.bassSound;if(ctx)loadBass(S.bassSound);
  for(const [id,k] of MIX_SLIDERS)setSlider(id,S.vol[k]);
  applyVolumes();
}
function setBpm(b){
  S.bpm=Math.max(40,Math.min(320,Math.round(b)));$('bpm').textContent=S.bpm;$('bpm').setAttribute('aria-label',`${S.bpm} beats per minute`);
  $('sTempo').value=S.bpm;$('vTempo').textContent=S.bpm+' bpm';store.set('bpm',S.bpm);
  if($('vSwing'))$('vSwing').textContent=swingLabel();   // the swing follows the tempo
}

// ---------- Space bar, editor keys ----------
function wireKeys(){
  // Space = play/stop. Typing keeps its space; controls reached with Tab keep native Space
  // where Enter can't stand in (switches, radios, selects). Buttons always work with Enter.
  let viaKeyboard=false;
  document.addEventListener('pointerdown',()=>{viaKeyboard=false;},true);
  document.addEventListener('keydown',e=>{if(e.key==='Tab')viaKeyboard=true;},true);
  const deep=()=>{let el=document.activeElement;while(el&&el.shadowRoot&&el.shadowRoot.activeElement)el=el.shadowRoot.activeElement;return el;};
  const spaceIsNative=()=>{
    const host=document.activeElement,el=deep();
    if(!host||host===document.body)return false;
    const tag=(host.tagName||'').toLowerCase();
    if(['sl-input','sl-textarea'].includes(tag)||el.isContentEditable||el.tagName==='TEXTAREA')return true;
    if(el.tagName==='INPUT'&&!['checkbox','radio','range','button'].includes(el.type))return true;
    if(['sl-switch','sl-radio-group','sl-radio-button','sl-select','sl-option','sl-tab','sl-tab-group'].includes(tag)||el.tagName==='SELECT'||(el.tagName==='INPUT'&&(el.type==='checkbox'||el.type==='radio')))return viaKeyboard;
    return false;
  };
  const isSpace=e=>e.code==='Space'||e.key===' ';
  document.addEventListener('keydown',e=>{
    if(!isSpace(e)||e.ctrlKey||e.metaKey||e.altKey||spaceIsNative())return;
    e.preventDefault();e.stopPropagation();
    if(!e.repeat)$('play').click();
  },true);
  document.addEventListener('keyup',e=>{if(isSpace(e)&&!spaceIsNative()){e.preventDefault();e.stopPropagation();}},true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(!$('barsMenu').hidden){barsMenu(false);$('edBars').focus();e.preventDefault();return;}
      if(SEL.a!=null||SEL.picking){clearSelection();e.preventDefault();return;}
      if(LOOP.sel){clearLoop(false);e.preventDefault();}
      else if(ED.open&&!$('textDlg').open){closeEditor();e.preventDefault();}
      return;
    }
    // Ctrl+C / Ctrl+X / Ctrl+V on bars, in the editor (not while typing)
    if(ED.open&&(e.ctrlKey||e.metaKey)&&!e.altKey&&/^[cxv]$/i.test(e.key)){
      const t=(document.activeElement?.tagName||'').toLowerCase();
      if(!['sl-input','sl-textarea','input','textarea'].includes(t)){
        const k=e.key.toLowerCase();if(k==='c')copyBars();else if(k==='x')cutBars();else pasteBars();
        e.preventDefault();return;
      }
    }
    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (not while typing, where the text box has its own undo)
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^[zy]$/i.test(e.key)){
      const t=(document.activeElement?.tagName||'').toLowerCase();
      if(!['sl-input','sl-textarea','input','textarea'].includes(t)){
        const again=e.key.toLowerCase()==='y'||e.shiftKey;
        if(again?redo():undo())e.preventDefault();
        return;
      }
    }
    if(!ED.open||e.ctrlKey||e.metaKey||e.altKey)return;
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(['sl-input','sl-textarea','input','textarea','sl-radio-group','sl-select','sl-range'].includes(tag)||$('keysDlg').open||$('textDlg').open)return;
    if(edKey(e)){e.preventDefault();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&ED.part==='melody'&&!ED.text){melDel();e.preventDefault();return;}   // remove a wrong note
    if(e.key==='Insert'&&ED.part==='melody'&&!ED.text&&ED.note!=null){toggleInsert();e.preventDefault();return;}
    if(ED.part==='melody'&&!ED.text&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){stepNote(e.key==='ArrowLeft'?-1:1);e.preventDefault();}
    else if(e.key==='ArrowLeft'){moveBar(-1);e.preventDefault();}
    else if(e.key==='ArrowRight'){moveBar(1);e.preventDefault();}
  });
}

// Single keys in the bar editor (the ? button / key lists them all). Each presses the matching
// button, so a key does exactly what a tap would, and nothing when that button is off.
const LEN_KEYS={'1':'w','2':'h','4':'q','8':'e','6':'s'};
function edKey(e){
  const k=e.key,mel=ED.part==='melody'&&!ED.text,press=id=>{const b=$(id);if(b&&!b.disabled)b.click();return true;};
  if(k==='?')return showKeys();
  if(k==='b'||k==='B')return press('edInsert');
  if(k==='m'||k==='M')return press(ED.part==='melody'?'edPartCh':'edPartMel');
  if(e.shiftKey&&(k==='ArrowLeft'||k==='ArrowRight')){moveBar(k==='ArrowLeft'?-1:1);return true;}
  if(!mel)return false;
  if(LEN_KEYS[k]){const b=document.querySelector(`#edLens .len[data-len="${LEN_KEYS[k]}"]`);if(b&&!b.disabled)b.click();return true;}
  const id={'.':'edDot','3':'edTri',r:'edRest',t:'edTie',c:'edChord',h:'edHear',H:'edHearAll'}[k.length===1&&k!=='H'?k.toLowerCase():k];
  if(id)return press(id);
  if(k==='v'||k==='V')return press(ED.voice===1?'edV2':'edV1');
  return false;
}
function showKeys(){$('keysDlg').show();return true;}

// ---------- Init ----------
function init(){
  applyTheme();
  $('play').onclick=()=>{P.playing?stop():start();};
  $('slower').onclick=()=>setBpm(S.bpm-5);
  $('faster').onclick=()=>setBpm(S.bpm+5);
  $('panelBtn').onclick=togglePanel;
  $('sheetClose').onclick=()=>$('sheet').hide();
  $('sheet').addEventListener('sl-after-hide',e=>{if(e.target===$('sheet'))$('panelBtn').setAttribute('aria-expanded','false');});
  $('sheet').addEventListener('sl-after-show',e=>{if(e.target===$('sheet'))$('panelBtn').setAttribute('aria-expanded','true');});
  $('loopBtn').onclick=()=>{if(S.loop||LOOP.sel)clearLoop(false);else startLoopSelect();};
  $('grid').addEventListener('click',e=>{
    if(e.target.closest('#addBar')){if(!LOOP.sel)addBarAtEnd();return;}
    const c=e.target.closest('.cell');if(!c)return;
    const i=+c.dataset.bar,raw=i<0?-1:chartSong.src[i];
    if(LOOP.sel){if(i>=0)loopTap(i);return;}
    // choosing the other end of a bar selection (after Select bars…, or Shift+click)
    if(ED.open&&i>=0&&(SEL.picking||e.shiftKey)&&ED.bar>=0){const anchor=SEL.a!=null&&!SEL.picking?(SEL.a===ED.bar?SEL.a:SEL.b):ED.bar;setSelection(anchor,raw);barMsg(`Selected ${rangeText(SEL.a,SEL.b)}. Bars… to copy, cut, paste or delete.`);return;}
    // With the staff showing: a tap on a note selects it; on the staff elsewhere, Melody;
    // on the chord symbols, Chords.
    if($('grid').classList.contains('mel')&&!REC.review){
      const rowEl=c.closest('.sys'),row=rowEl.getBoundingClientRect(),lift=+(rowEl.dataset.lift||0),onStaff=e.clientY>row.top+28;
      if(onStaff){
        const hit=noteAt(i,e.clientX-row.left,e.clientY-row.top-28-lift);
        if(!ED.open||ED.bar!==raw||ED.part!=='melody'){openEditor(raw,'melody');}
        if(raw<0)hit.v=1;
        if(ED.voice!==hit.v){ED.voice=hit.v;renderGrid();}
        selectNote(hit.ni);return;
      }
      if(ED.open&&raw===ED.bar&&ED.part==='melody'){setPart('chords');return;}
      if(!(ED.open&&raw===ED.bar)){openEditor(raw,'chords');return;}
    }
    if(ED.open&&raw===ED.bar)closeEditor();
    else openEditor(raw);
  });
  // bar editor
  $('edDone').onclick=closeEditor;
  $('edText').onclick=()=>{ED.text=!ED.text;renderEditor();if(ED.text)setTimeout(()=>$('edInput').focus(),0);};
  $('edNoteMode').addEventListener('sl-change',e=>{ED.mode=e.target.value;renderEditor();});
  // ♭ / ♯: respells the chord's root (or bass note) if it's on a black key, and the buttons
  const setSpell=sp=>{
    ED.spell=sp;
    const p=chordParts(edChords()[ED.slot]),f=ED.mode==='bass'?'bass':'root';
    if(p&&p[f]&&spellingOf(p[f])&&spellingOf(p[f])!==sp)updateSlot(x=>{x[f]=ENHARMONIC[x[f]]||x[f];});
    else renderEditor();
  };
  $('edFlat').onclick=()=>setSpell('flat');$('edSharp').onclick=()=>setSpell('sharp');
  $('edNoBass').onclick=()=>updateSlot(x=>{x.bass=null;});
  $('edInput').addEventListener('keydown',e=>{if(e.key==='Enter'){applyBarText();e.preventDefault();}});
  $('edInput').addEventListener('sl-change',applyBarText);
  $('edPrev').onclick=()=>moveBar(-1);$('edNext').onclick=()=>moveBar(1);
  $('edPartCh').onclick=()=>setPart('chords');$('edPartMel').onclick=()=>setPart('melody');
  for(const b of document.querySelectorAll('#edLens .len'))b.onclick=()=>{
    if(b.dataset.len!==ED.len)ED.dot=false;   // a new length starts without its dot
    ED.len=b.dataset.len;if(!['q','e'].includes(ED.len))ED.tri=false;
    // building chords: a length starts the next chord
    if(ED.chord&&ED.note==null&&STACK.ref){STACK.ref=null;melMsg('Next chord: tap its notes.');}
    setSelLength();};
  $('edDot').onclick=()=>{ED.dot=!ED.dot;if(ED.dot)ED.tri=false;setSelLength();};
  $('edTri').onclick=()=>{ED.tri=!ED.tri;if(ED.tri){ED.dot=false;if(!['q','e'].includes(ED.len))ED.len='e';}setSelLength();};
  $('edTie').onclick=toggleTie;
  $('edRest').onclick=()=>{STACK.ref=null;melAdd('r');};
  $('edSecName').addEventListener('sl-change',e=>setBarLabel(e.target.value));
  $('edSecName').addEventListener('keydown',e=>{if(e.key==='Enter'){setBarLabel(e.target.value);e.preventDefault();}});
  $('edAddEnd').onclick=()=>selectNote(null);
  $('edV1').onclick=()=>setVoice(1);$('edV2').onclick=()=>setVoice(2);
  $('edInsNote').onclick=toggleInsert;
  $('edSlash').onclick=()=>{
    const on=!isSlashBar(melGet(ED.bar));
    melSet(ED.bar,on?'/':'');ED.note=null;STACK.ref=null;
    if(on&&ED.bar<rawBars().length-1)ED.bar++;   // like a full bar: on to the next one
    melMsg(on?'Slashes: keep time on the chords. Tap a key there to write a melody instead.':'Slashes removed.');
    renderGrid();renderEditor();};
  $('edChord').onclick=()=>{ED.chord=!ED.chord;STACK.ref=ED.chord&&ED.note!=null?{bar:ED.bar,i:ED.note}:null;STACK.held=new Set();
    melMsg(ED.chord?'Chord: tap the notes of a chord; they stack. Tap a length to start the next chord. Tap a note again to take it out.':'');renderMelEditor();};$('edMelDel').onclick=melDel;$('edHear').onclick=hearBar;$('edHearAll').onclick=hearFromHere;$('edRec').onclick=recStart;
  $('recSnap').addEventListener('sl-change',e=>{REC.snap=e.target.value==='snap';recRestore();recApply();});
  $('recKeep').onclick=()=>recDone(true);$('recDiscard').onclick=()=>recDone(false);
  $('recAgain').onclick=()=>{recRestore();REC.review=false;$('recPanel').hidden=true;if(S.loop)recStart();else{ED.bar=REC.from;recStart();}};
  $('edUndo').onclick=undo;$('edRedo').onclick=redo;
  $('edInsert').onclick=insertBar;$('edKeys').onclick=showKeys;$('keysClose').onclick=()=>$('keysDlg').hide();
  // the keys in the tooltips
  for(const [k,l] of Object.entries(LEN_KEYS)){const b=document.querySelector(`#edLens .len[data-len="${l}"]`);if(b)b.title=b.getAttribute('aria-label')+` (${k})`;}
  for(const [id,t] of [['edDot','Dotted (.)'],['edTri','Triplet (3)'],['edRest','Rest (R)'],['edTie','Tie (T)'],['edChord','Chord (C)'],['edHear','Hear this bar (H)'],['edHearAll','Hear from here (Shift+H)']])$(id).title=t;$('edDelete').onclick=deleteBars;
  $('edBars').onclick=e=>{e.stopPropagation();barsMenu();};
  $('mnSelect').onclick=()=>{barsMenu(false);if(SEL.a!=null){clearSelection();return;}SEL.picking=true;barMsg('Tap the last bar of the selection (this bar is the first).');renderEditor();};
  $('mnCopy').onclick=copyBars;$('mnCut').onclick=cutBars;$('mnPaste').onclick=pasteBars;
  $('mnRepeat').onclick=()=>setRepeat('repeat');$('mnEnd1').onclick=()=>setRepeat('end1');
  $('mnEnd2').onclick=()=>setRepeat('end2');$('mnNoRep').onclick=()=>setRepeat('clear');
  $('mnLoop').onclick=()=>{const [a,b]=selRange();barsMenu(false);SEL.a=SEL.b=null;closeEditor();setLoop(a,b);};
  document.addEventListener('pointerdown',e=>{if(!$('barsMenu').hidden&&!e.target.closest('.barsWrap'))barsMenu(false);});
  // song
  refreshSongList();
  $('openSong').addEventListener('sl-change',e=>{
    const it=OPEN_LIST[+String(e.target.value).slice(1)];e.target.value='';
    if(!it)return;if(it.song)loadSong(it.song);else loadPreset(it.preset);
  });
  $('songName').value=S.songName;
  $('songName').addEventListener('sl-change',e=>setSongName(e.target.value.trim()));
  $('composer').value=S.composer;$('composer').addEventListener('sl-change',e=>setComposer(e.target.value));
  $('saveSong').onclick=saveSong;$('newSong').onclick=newSong;$('delSong').onclick=deleteSong;
  $('style').addEventListener('sl-change',e=>setStyle(e.target.value));setStyle(S.style);
  $('section').addEventListener('sl-change',e=>setSection(e.target.value,true));setSection(S.section,false);
  $('bassFeel').addEventListener('sl-change',e=>setFeel(e.target.value));setFeel(S.bassFeel);
  $('cDyn').addEventListener('sl-change',e=>setDynamics(e.target.checked));setDynamics(S.dynamics);
  $('keySig').value=S.keySig;$('keySig').addEventListener('sl-change',e=>setKeySig(e.target.value));
  $('cChartTones').checked=S.chartTones;$('cChartTones').addEventListener('sl-change',e=>{S.chartTones=e.target.checked;store.set('chartTones',S.chartTones);renderGrid();});
  $('cShowMel').checked=S.showMel;$('cShowMel').addEventListener('sl-change',e=>{S.showMel=e.target.checked;store.set('showMel',S.showMel);renderGrid();});
  $('cCount').checked=S.countIn;$('cCount').addEventListener('sl-change',e=>{S.countIn=e.target.checked;store.set('countIn',S.countIn);});
  bindSlider('Tempo',()=>S.bpm,v=>setBpm(v),v=>v+' bpm');
  bindSlider('Swing',()=>S.swingAdj,v=>{S.swingAdj=v;store.set('swingAdj',v);},v=>swingLabel(v));
  $('textBtn').onclick=openTextDialog;
  $('chartText').addEventListener('sl-input',()=>{$('errs').textContent=parseChart($('chartText').value,curBpb()).errors.join(' · ');});
  $('textCancel').onclick=()=>$('textDlg').hide();
  $('textApply').onclick=()=>{
    const t=$('chartText').value,p=parseChart(t,curBpb());
    if(!p.segs.length){$('errs').textContent='That chart has no chords the app understands.';return;}
    if(ED.open)closeEditor();applyChartText(t);$('textDlg').hide();
  };
  // sound
  $('output').addEventListener('sl-change',e=>setOutput(e.target.value));$('output').value=S.output;
  for(const k of ['dr','bs','cp']){refreshMute(k);$(MUTE_BTNS[k]).onclick=()=>setMute(k,!S.mute[k]);}
  $('compBtn').onclick=()=>setMute('cp',!S.mute.cp);
  for(const [id,k] of MIX_SLIDERS)
    bindSlider(id,()=>S.vol[k],v=>{S.vol[k]=v;store.set('vol_'+S.output,S.vol);applyVolumes();},['dr','bs','cp','ky'].includes(k)?dbLabel:null);
  $('resetMix').onclick=()=>{for(const [id,k] of MIX_SLIDERS)setSlider(id,VOL_DEF[k]);songMsg('');};
  $('cTrio').addEventListener('sl-change',e=>setTrio(e.target.checked));setTrio(S.trio);
  $('compInst').value=S.compInst;$('compInst').addEventListener('sl-change',e=>{S.compInst=e.target.value;store.set('compInst',S.compInst);if(ctx)loadKeys(S.compInst);});
  $('bassSound').value=S.bassSound;$('bassSound').addEventListener('sl-change',e=>{S.bassSound=S.bassSounds[S.output]=e.target.value;store.set('bassSound_'+S.output,S.bassSound);if(ctx)loadBass(S.bassSound);});
  $('drumStyle').value=S.drumStyle;$('drumStyle').addEventListener('sl-change',e=>{S.drumStyle=e.target.value;store.set('drumStyle',S.drumStyle);if(ctx)silenceDrums();});
  $('cSmp').checked=S.samples;$('cSmp').addEventListener('sl-change',e=>{S.samples=e.target.checked;store.set('samples',S.samples);});
  $('cTones').checked=S.tones;$('cTones').addEventListener('sl-change',e=>{S.tones=e.target.checked;store.set('tones',S.tones);const c=curTones;curTones=undefined;setTones(c);});
  $('cSus').addEventListener('sl-change',e=>setSustain(e.target.checked));
  setMelKeys(S.melKeys);$('cMelKeys').addEventListener('sl-change',e=>setMelKeys(e.target.checked));$('melKeysBtn').onclick=()=>setMelKeys(!S.melKeys);
  $('cMelPlay').checked=S.melPlay;$('cMelPlay').addEventListener('sl-change',e=>{S.melPlay=e.target.checked;store.set('melPlay',S.melPlay);});
  $('cTrem').checked=S.trem;$('cTrem').addEventListener('sl-change',e=>{S.trem=e.target.checked;store.set('trem',S.trem);applyVolumes();});
  // keyboard strip
  $('keyInst').value=S.keyInst;
  $('keyInst').onchange=e=>{S.keyInst=e.target.value;store.set('keyInst',S.keyInst);if(ctx)loadKeys(S.keyInst);updateKeysLabel();};
  $('leslieBtn').onclick=()=>{S.leslieFast=!S.leslieFast;updateLeslieBtn();if(ctx)setLeslie(S.leslieFast);};
  updateKeysLabel();updateLeslieBtn();
  $('octDn').onclick=()=>{S.oct=Math.max(1,S.oct-1);store.set('oct',S.oct);buildKeyboard();};
  $('octUp').onclick=()=>{S.oct=Math.min(6,S.oct+1);store.set('oct',S.oct);buildKeyboard();};
  // app
  $('theme').value=S.theme;$('theme').addEventListener('sl-change',e=>setTheme(e.target.value));
  MQ_DARK.addEventListener('change',applyTheme);
  initDrive();
  $('midiBtn').onclick=()=>midiConnect(true);
  $('cMidiSnd').checked=S.midiSound;$('cMidiSnd').addEventListener('sl-change',e=>{S.midiSound=e.target.checked;store.set('midiSound',S.midiSound);if(S.midiSound)initAudio();});
  if(store.get('midiOn',false)&&navigator.requestMIDIAccess&&navigator.permissions)
    navigator.permissions.query({name:'midi'}).then(p=>{if(p.state==='granted')midiConnect(false);}).catch(()=>{});
  // MIDI notes don't count as a user gesture, so let any tap or key press wake the audio
  for(const ev of ['pointerdown','keydown'])document.addEventListener(ev,()=>{if(ctx&&ctx.state!=='running')ctx.resume();},true);
  // opening settings syncs songs
  $('panelBtn').addEventListener('click',()=>driveSync(false));
  wireKeys();wireKeyboard();wireKbHandle();
  setBpm(S.bpm);updateTitle();renderGrid();showBeat(null);refreshLoopBtn();
  layout();
  for(const mq of [MQ_WIDE,MQ_SHORT])mq.addEventListener('change',layout);
  let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{layout();layoutLines();},150);});
  requestAnimationFrame(uiLoop);
  new ResizeObserver(()=>{if(ED.open)showSel();}).observe($('chartWrap'));
  if(document.fonts)document.fonts.ready.then(layoutLines);
  queueMicrotask(histReset);   // nothing to undo at startup
}
// Shoelace components are ES modules; wait for them before touching their properties.
const SL_TAGS=['sl-tab-group','sl-tab','sl-tab-panel','sl-range','sl-select','sl-option','sl-switch','sl-radio-group','sl-radio-button','sl-drawer','sl-dialog','sl-input','sl-textarea'];
Promise.race([Promise.all(SL_TAGS.map(t=>customElements.whenDefined(t))),new Promise(r=>setTimeout(r,4000))]).then(init);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
