// ---------- Scheduler ----------
const P={playing:false,step:0,nextTime:0,timer:null,countSteps:0,walker:null,compPrev:null,compPlan:null,uiQ:[]};
// fromBar: start part-way through the chart (recording "from bar N"); count:true forces a count-in.
function start(fromBar=0,count=false){
  if(typeof hearStop==='function')hearStop();
  if(!chartSong.segs.length){openSheet();return;}
  initAudio();
  // a performance: the head, solo choruses (S.solos of them, or until Out; 0 = keep going),
  // the head out, then stop. A loop just loops.
  P.form=S.loop?null:{phase:'head',solos:S.solos||0,done:0,out:false};P.chorusBase=0;P.ending=false;
  song=loopSong();P.pending=null;
  P.playing=true;P.step=0;P.nextTime=ctx.currentTime+0.08;
  // the pickup plays at the end of the count-in (or alone, just before bar 1, without one)
  const pb=getTimeline().pickupBeats;
  P.pickup=!S.loop&&fromBar===0&&pb>0;
  P.counting=S.countIn||count;
  P.countSteps=P.counting?Math.max(song.bpb*2,Math.ceil(pb*2)):P.pickup?Math.ceil(pb*2):0;
  // fromBar is a written bar: start from the first time it's played
  P.startStep=S.loop?0:Math.max(0,song.map.indexOf(fromBar))*song.bpb*2;P.walker=makeWalker();P.compPrev=null;P.compPlan=null;P.two=null;P.stroll=false;P.lastStroll=-9;P.drop=false;P.lastDrop=-9;P.pedal=null;P.xr=null;P.roll=null;P.lastBass=null;P.bossaComp=null;P.bRoot=null;P.uiQ=[];
  P.timer=setInterval(tick,25);tick();
  setPlayUI(true);
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').then(l=>P.lock=l).catch(()=>{});}catch(e){}
}
function stop(){
  P.playing=false;clearInterval(P.timer);P.uiQ=[];silenceDrums();song=chartSong;P.pending=null;
  if(REC.on){REC.on=false;recFinish();}
  showMel(null);
  setPlayUI(false);
  try{P.lock&&P.lock.release();}catch(e){}
  showBeat(null);
}
function tick(){
  const beatDur=60/S.bpm;
  while(P.nextTime<ctx.currentTime+0.12){
    scheduleStep(P.step,P.nextTime,beatDur);
    const sw=swingNow();
    P.nextTime+=(P.step%2===1?(1-sw):sw)*beatDur;
    P.step++;
  }
}
// What comes after this chorus: solos after the head (the set number, or until Out), then the
// head out, then the end (null).
function nextPart(f){
  if(f.phase==='out')return null;
  if(f.phase==='solo')f.done++;
  const solosDone=f.out||(f.solos&&f.done>=f.solos);
  f.phase=solosDone?'out':'solo';
  return f.phase;
}
// the performance is over: let the last notes ring, then stop
function finishAt(t){setTimeout(()=>{if(P.playing&&P.ending)stop();},Math.max(0,(t-ctx.currentTime)*1000)+1600);}
function swingNow(){return (STYLES[S.style]||{}).straight?0.5:swingPct(S.bpm,S.swingAdj)/100;}
// Grooves register themselves in STYLES (see js/styles/). straight:true = even eighths.
const STYLES={};
function scheduleStep(s,t,beatDur){
  const sw=swingNow(),audible=S.melPlay||REC.review;
  if(s<P.countSteps){
    if(P.counting&&s%2===0){click(t,s===0);P.uiQ.push({t,count:s/2+1});}
    if(P.pickup)scheduleMelodyStep(s,(s-P.countSteps)/2,-1,t,beatDur,sw,audible);
    return;
  }
  let gs=s-P.countSteps+(P.startStep||0);
  if(!song.beats||P.ending)return;
  // the end of a chorus: on to the next part of the performance
  if(P.form&&!P.pending&&gs>0&&gs%(song.beats*2)===0){
    const next=nextPart(P.form);
    if(!next){P.ending=true;finishAt(t);return;}
    song=formSong(chartSong,next);P.countSteps=s;P.startStep=0;gs=0;P.chorusBase+=1;
    P.compPlan=null;P.bossaComp=null;P.two=null;P.fill=null;P.roll=null;P.pedal=null;P.xr=null;P.walker.target=null;
  }
  // a loop change takes effect on the next downbeat
  if(P.pending&&gs%(song.bpb*2)===0){
    song=P.pending.song;P.countSteps=s-P.pending.bar*song.bpb*2;P.startStep=0;gs=s-P.countSteps;P.pending=null;
    P.compPlan=null;P.bossaComp=null;P.two=null;P.fill=null;P.roll=null;P.pedal=null;P.xr=null;P.walker.target=null;
  }
  const q=P.uiQ.length;
  (STYLES[S.style]||STYLES.swing).schedule(gs,t,beatDur);
  for(let i=q;i<P.uiQ.length;i++){P.uiQ[i].song=song;P.uiQ[i].part=P.form&&{...P.form};}   // the display needs to know which song (chart, loop or part)
  // melody: where this step is in the chart
  const sb=(gs/2)%song.beats,sBar=Math.floor(sb/song.bpb),bar=song.map[sBar%song.map.length],within=sb-sBar*song.bpb;
  // the melody follows the playing order (so a tie reaches whichever bar comes next: after a
  // repeat, that's the 2nd ending); bar stays the written bar for recording and the display
  const pbar=song.pidx?song.pidx[sBar%song.pidx.length]:sBar;
  // in a performance with a set number of solos, the melody plays on the heads only (you solo)
  const mAud=audible&&!(P.form&&P.form.solos&&P.form.phase==='solo');
  scheduleMelodyStep(s,pbar*song.bpb+within,pbar,t,beatDur,sw,mAud,song.pidx?null:song);
  if(s%2===0&&REC.on){
    if(bar!==REC.lastBar){
      if(REC.lastBar===REC.to||(REC.lastBar!=null&&bar<REC.lastBar)){const wait=Math.max(0,(t-ctx.currentTime)*1000);setTimeout(()=>recFinish(),wait);REC.on=false;}
      REC.lastBar=bar;
    }
    if(REC.on)recMark(t,bar,within,beatDur,sw);
  }
}
function uiLoop(){
  if(P.playing&&ctx){
    const now=ctx.currentTime;
    let last=null;const mel=[];
    while(P.uiQ.length&&P.uiQ[0].t<=now){const e=P.uiQ.shift();if(e.mel)mel.push(e);else last=e;}
    if(last)showBeat(last);
    for(const e of mel)showMel(e.mel);
  }
  requestAnimationFrame(uiLoop);
}
