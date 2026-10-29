// ---------- UI ----------
const $=id=>document.getElementById(id);
let curCell=null,curTones=null;
function renderGrid(){
  const g=$('grid');g.innerHTML='';
  song.bars.forEach((b,i)=>{
    const c=document.createElement('div');c.className='cell';c.dataset.bar=i;
    b.forEach(x=>{const s=document.createElement('span');if(x.dim)s.className='rep';s.textContent=x.t;c.appendChild(s);});
    g.appendChild(c);
  });
  curCell=null;
}
function showBeat(ev){
  if(!ev){$('cur').textContent=song.segs[0]?song.segs[0].chord.sym:'—';$('next').textContent='';$('pos').textContent='';
    if(curCell)curCell.classList.remove('cur');curCell=null;setTones(null);return;}
  if(ev.count){$('cur').textContent=String(ev.count);$('next').textContent=song.segs[0]?'→ '+song.segs[0].chord.sym:'';$('pos').textContent='count-in';return;}
  const si=song.segOfBeat[ev.beat],seg=song.segs[si];
  const nseg=song.segs[(si+1)%song.segs.length];
  $('cur').textContent=seg.chord.sym;
  $('next').textContent=nseg!==seg?'→ '+nseg.chord.sym:'';
  $('pos').textContent=`bar ${ev.bar+1}/${song.bars.length} · beat ${ev.beat%4+1}`;
  const cell=$('grid').children[ev.bar];
  if(cell!==curCell){if(curCell)curCell.classList.remove('cur');if(cell){cell.classList.add('cur');if(ev.beat%4===0)cell.scrollIntoView({block:'nearest'});}curCell=cell;}
  setTones(seg.chord);
}
function setTones(ch){
  if(ch===curTones)return;curTones=ch;
  const on=S.tones&&ch;
  for(const k of $('kb').children){
    const pc=((+k.dataset.m-(ch?ch.root:0))%12+12)%12;
    k.dataset.tone=!on?'':ch.guide.includes(pc)?'gt':ch.arp.includes(pc)?'ct':(ch.ext||[]).includes(pc)?'ex':'';
  }
}
// keyboard
function buildKeyboard(){
  const kb=$('kb');kb.innerHTML='';
  const W=kb.clientWidth,H=kb.clientHeight;
  const whites=Math.max(7,Math.min(29,Math.floor(W/46)));
  if(S.oct==null)S.oct=whites>=14?3:4;
  const startM=12*(S.oct+1);
  const ww=W/whites;
  const isBlack=m=>[1,3,6,8,10].includes(m%12);
  let wi=0,m=startM;
  while(wi<whites){
    const k=document.createElement('div');k.dataset.m=m;
    if(isBlack(m)){
      k.className='k b';const bw=ww*0.6;k.style.left=(wi*ww-bw/2)+'px';k.style.width=bw+'px';
    }else{
      k.className='k w';k.style.left=(wi*ww)+'px';k.style.width=ww+'px';
      if(m%12===0){const l=document.createElement('div');l.className='lbl';l.textContent='C'+(m/12-1);k.appendChild(l);}
      wi++;
    }
    const d=document.createElement('div');d.className='dot';k.appendChild(d);
    if(typeof downCount!=='undefined'&&downCount.get(m)>0)k.classList.add('down'); // keep held keys lit across rebuilds
    kb.appendChild(k);m++;
  }
  // drop a trailing black key hanging off the right edge
  const last=kb.lastElementChild;if(last&&last.classList.contains('b'))last.remove();
  $('octlbl').textContent='C'+S.oct;
  const ch=curTones;curTones=undefined;setTones(ch);
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
  active.set(id,{m,h});markDown(m,true);
}
function release(id){
  const a=active.get(id);if(!a)return;active.delete(id);markDown(a.m,false);
  if(sustain){if(sustained.has(a.m))sustained.get(a.m).releaseNow();sustained.set(a.m,a.h);}
  else a.h.releaseNow();
}
// Trio mode: bass + drums only, on-screen keyboard hidden, bigger chart (for practising on a real piano).
function setTrio(on){
  S.trio=!!on;store.set('trio',S.trio);
  document.body.classList.toggle('trio',S.trio);$('trioBtn').classList.toggle('on',S.trio);
  $('mCp').disabled=S.trio;$('mCp').title=S.trio?'Comping is off in trio mode':'';
  applyVolumes();if(!S.trio)buildKeyboard();
}
function setSustain(on){
  sustain=on;$('susBtn').classList.toggle('on',sustain);
  if(!sustain){sustained.forEach(h=>h.releaseNow());sustained.clear();}
}
function updateLeslieBtn(){$('leslieBtn').textContent='Leslie: '+(S.leslieFast?'fast':'slow');$('leslieBtn').classList.toggle('on',S.leslieFast);}
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
  if(cmd===0x90&&d2>0)press('midi'+d1,d1,d2,!S.midiSound);
  else if(cmd===0x80||(cmd===0x90&&d2===0))release('midi'+d1);
  else if(cmd===0xB0&&d1===64)setSustain(d2>=64);                     // sustain pedal
  else if(cmd===0xB0&&d1===1&&S.keyInst==='organ'){                  // mod wheel: Leslie slow/fast
    const f=d2>=64;if(f!==S.leslieFast){S.leslieFast=f;updateLeslieBtn();if(ctx)setLeslie(f);}
  }
}
function wireKeyboard(){
  const kb=$('kb');
  kb.addEventListener('pointerdown',e=>{
    e.preventDefault();
    try{kb.setPointerCapture(e.pointerId);}catch(_){}
    const m=keyAt(e.clientX,e.clientY);if(m!=null)press(e.pointerId,m);
  });
  kb.addEventListener('pointermove',e=>{
    if(!active.has(e.pointerId))return;
    const m=keyAt(e.clientX,e.clientY),a=active.get(e.pointerId);
    if(m!==a.m){release(e.pointerId);if(m!=null)press(e.pointerId,m);}
  });
  const up=e=>release(e.pointerId);
  kb.addEventListener('pointerup',up);kb.addEventListener('pointercancel',up);kb.addEventListener('lostpointercapture',up);
  kb.addEventListener('contextmenu',e=>e.preventDefault());
  // Cancel the browser's touch gestures on the keys. On Android this stops the long-press
  // detection (and its haptic buzz); pointer events, which do the playing, still arrive.
  for(const ev of ['touchstart','touchmove','touchend'])kb.addEventListener(ev,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
}
// sheet
function openSheet(){
  $('chartText').value=S.chart;$('errs').textContent=song.errors.join(' · ');
  $('songName').value=S.songName;songMsg('');refreshSongList();
  $('sheet').hidden=false;
}
function closeSheet(){
  setSongName($('songName').value.trim());
  S.chart=$('chartText').value;store.set('chart',S.chart);
  song=parseChart(S.chart);renderGrid();
  if(!P.playing)showBeat(null);
  if(song.errors.length){$('errs').textContent=song.errors.join(' · ');}
  if(!song.segs.length){stop();}
  $('sheet').hidden=true;
}
// saved songs (stored in this browser's localStorage)
function songMsg(t){$('songMsg').textContent=t;}
function updateTitle(){$('title').textContent=[S.songName,S.style==='bossa'?'Bossa nova':''].filter(Boolean).join(' · ');}
function setSongName(n){S.songName=n;store.set('songName',n);updateTitle();}
function setStyle(v){
  S.style=v==='bossa'?'bossa':'swing';store.set('style',S.style);$('style').value=S.style;
  $('styleNote').textContent=S.style==='bossa'?'Straight eighths; the Swing slider and drum style don’t apply.':'';
  P.bossaComp=null;P.compPlan=null;if(ctx)silenceDrums();updateTitle();
}
function refreshSongList(){
  const sel=$('mySongs'),names=Object.keys(S.songs).sort((a,b)=>a.localeCompare(b));
  sel.innerHTML='';
  const o0=document.createElement('option');o0.value='';o0.textContent=names.length?`My songs (${names.length})…`:'My songs (none yet)';sel.appendChild(o0);
  names.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});
}
function setSlider(id,val){const s=$('s'+id);s.value=val;s.dispatchEvent(new Event('input'));}
function saveSong(){
  const name=$('songName').value.trim();
  if(!name){songMsg('Give the song a name first.');$('songName').focus();return;}
  const chart=$('chartText').value;
  if(!parseChart(chart).segs.length){songMsg('Nothing to save: the chart is empty.');return;}
  if(S.songs[name]&&name!==S.songName&&!confirm(`Replace the saved “${name}”?`))return;
  S.songs[name]={chart,bpm:S.bpm,swing:S.swing,style:S.style,saved:Date.now()};
  if(!store.set('songs',S.songs)){delete S.songs[name];songMsg('Couldn’t save: this browser is blocking storage.');return;}
  setSongName(name);refreshSongList();
  songMsg(S.style==='bossa'?`Saved “${name}” (bossa nova, tempo ${S.bpm}).`:`Saved “${name}” (tempo ${S.bpm}, swing ${S.swing}%).`);
}
function loadSong(name){
  const s=S.songs[name];if(!s)return;
  $('chartText').value=s.chart;$('songName').value=name;
  if(s.bpm)setSlider('Tempo',s.bpm);
  if(s.swing)setSlider('Swing',s.swing);
  setStyle(s.style||'swing');
  $('errs').textContent=parseChart(s.chart).errors.join(' · ');
  songMsg(`Loaded “${name}”. Tap Done to play it.`);
}
function deleteSong(){
  const name=$('songName').value.trim();
  if(!S.songs[name]){songMsg('No saved song with that name.');return;}
  if(!confirm(`Delete “${name}”?`))return;
  delete S.songs[name];store.set('songs',S.songs);refreshSongList();
  songMsg(`Deleted “${name}”. The chart stays in the editor until you change it.`);
}
function bindSlider(id,get,set,fmt){
  const s=$('s'+id),v=$('v'+id);
  const upd=()=>{v.textContent=fmt?fmt(+s.value):s.value;};
  s.value=get();upd();
  s.addEventListener('input',()=>{set(+s.value);upd();});
}
const MIX_SLIDERS=[['Dr','dr'],['Bs','bs'],['Cp','cp'],['Ky','ky'],['Rv','rv'],['Cy','cy']];
const dbLabel=x=>x===0?'off':(30*Math.log10(x/100)).toFixed(1)+' dB';
// Each output keeps its own slider positions; switching swaps them in.
function setOutput(o){
  S.output=o==='head'?'head':'phone';store.set('output',S.output);$('output').value=S.output;
  S.vol=S.vols[S.output];
  S.bassSound=S.bassSounds[S.output];$('bassSound').value=S.bassSound;if(ctx)loadBass(S.bassSound);
  for(const [id,k] of MIX_SLIDERS){const el=$('s'+id);el.value=S.vol[k];el.dispatchEvent(new Event('input'));}
  applyVolumes();
}
function setBpm(b){S.bpm=Math.max(40,Math.min(320,b));$('bpm').textContent=S.bpm;$('sTempo').value=S.bpm;$('vTempo').textContent=S.bpm;store.set('bpm',S.bpm);}
function init(){
  $('play').onclick=()=>{P.playing?stop():start();};
  $('slower').onclick=()=>setBpm(S.bpm-5);
  $('faster').onclick=()=>setBpm(S.bpm+5);
  const muteBtn=(id,key)=>{const b=$(id);const r=()=>{b.classList.toggle('on',!S.mute[key]);b.classList.toggle('muted',S.mute[key]);};r();
    b.onclick=()=>{S.mute[key]=!S.mute[key];store.set('mute',S.mute);applyVolumes();r();};};
  muteBtn('mDr','dr');muteBtn('mBs','bs');muteBtn('mCp','cp');
  $('trioBtn').onclick=()=>setTrio(!S.trio);setTrio(S.trio);
  $('chartBtn').onclick=openSheet;$('done').onclick=closeSheet;
  const sel=$('preset');
  Object.keys(PRESETS).forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});
  sel.onchange=()=>{
    if(sel.value){
      const pv=PRESETS[sel.value],chart=typeof pv==='string'?pv:pv.chart;
      $('chartText').value=chart;$('songName').value=sel.value;songMsg('');
      setStyle(typeof pv==='string'?'swing':pv.style);if(pv.bpm)setSlider('Tempo',pv.bpm);
      $('errs').textContent=parseChart(chart).errors.join(' · ');
    }
    sel.value='';
  };
  $('style').onchange=e=>setStyle(e.target.value);setStyle(S.style);
  $('output').value=S.output;$('output').onchange=e=>setOutput(e.target.value);
  $('resetMix').onclick=()=>{for(const [id,k] of MIX_SLIDERS)setSlider(id,VOL_DEF[k]);songMsg('Mix reset to the defaults for '+(S.output==='phone'?'phone speaker.':'headphones / speakers.'));};
  const ms=$('mySongs');ms.onchange=()=>{if(ms.value)loadSong(ms.value);ms.value='';};
  $('saveSong').onclick=saveSong;$('delSong').onclick=deleteSong;
  refreshSongList();updateTitle();
  $('chartText').addEventListener('input',()=>{$('errs').textContent=parseChart($('chartText').value).errors.join(' · ');});
  bindSlider('Tempo',()=>S.bpm,v=>setBpm(v));
  bindSlider('Swing',()=>S.swing,v=>{S.swing=v;store.set('swing',v);},v=>v===50?'straight':v+'%');
  for(const [id,k] of MIX_SLIDERS)
    bindSlider(id,()=>S.vol[k],v=>{S.vol[k]=v;store.set('vol_'+S.output,S.vol);applyVolumes();},['dr','bs','cp','ky'].includes(k)?dbLabel:null);
  $('drumStyle').value=S.drumStyle;$('drumStyle').onchange=e=>{S.drumStyle=e.target.value;store.set('drumStyle',S.drumStyle);if(ctx)silenceDrums();};
  $('cSmp').checked=S.samples;$('cSmp').onchange=e=>{S.samples=e.target.checked;store.set('samples',S.samples);};
  $('compInst').value=S.compInst;$('compInst').onchange=e=>{S.compInst=e.target.value;store.set('compInst',S.compInst);if(ctx)loadKeys(S.compInst);};
  $('bassSound').value=S.bassSound;$('bassSound').onchange=e=>{S.bassSound=S.bassSounds[S.output]=e.target.value;store.set('bassSound_'+S.output,S.bassSound);if(ctx)loadBass(S.bassSound);};
  $('cTrem').checked=S.trem;$('cTrem').onchange=e=>{S.trem=e.target.checked;store.set('trem',S.trem);applyVolumes();};
  $('cCount').checked=S.countIn;$('cCount').onchange=e=>{S.countIn=e.target.checked;store.set('countIn',S.countIn);};
  $('tonesBtn').classList.toggle('on',S.tones);
  $('tonesBtn').onclick=()=>{S.tones=!S.tones;store.set('tones',S.tones);$('tonesBtn').classList.toggle('on',S.tones);const c=curTones;curTones=undefined;setTones(c);};
  $('keyInst').value=S.keyInst;
  $('keyInst').onchange=e=>{S.keyInst=e.target.value;store.set('keyInst',S.keyInst);if(ctx)loadKeys(S.keyInst);updateKeysLabel();};
  $('leslieBtn').onclick=()=>{S.leslieFast=!S.leslieFast;updateLeslieBtn();if(ctx)setLeslie(S.leslieFast);};
  updateKeysLabel();
  $('susBtn').onclick=()=>setSustain(!sustain);
  $('midiBtn').onclick=()=>midiConnect(true);
  $('cMidiSnd').checked=S.midiSound;$('cMidiSnd').onchange=e=>{S.midiSound=e.target.checked;store.set('midiSound',S.midiSound);if(S.midiSound)initAudio();};
  // reconnect automatically if MIDI was allowed before
  if(store.get('midiOn',false)&&navigator.requestMIDIAccess&&navigator.permissions)
    navigator.permissions.query({name:'midi'}).then(p=>{if(p.state==='granted')midiConnect(false);}).catch(()=>{});
  // MIDI notes don't count as a user gesture, so let any tap or key press wake the audio
  for(const ev of ['pointerdown','keydown'])document.addEventListener(ev,()=>{if(ctx&&ctx.state!=='running')ctx.resume();},true);
  $('octDn').onclick=()=>{S.oct=Math.max(1,S.oct-1);store.set('oct',S.oct);buildKeyboard();};
  $('octUp').onclick=()=>{S.oct=Math.min(6,S.oct+1);store.set('oct',S.oct);buildKeyboard();};
  setBpm(S.bpm);renderGrid();showBeat(null);buildKeyboard();wireKeyboard();
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(buildKeyboard,150);});
  requestAnimationFrame(uiLoop);
}
init();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
