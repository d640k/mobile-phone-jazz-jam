// ---------- Scheduler ----------
const P={playing:false,step:0,nextTime:0,timer:null,countSteps:0,walker:null,compPrev:null,compPlan:null,uiQ:[]};
// fromBar: start part-way through the chart (recording "from bar N"); count:true forces a count-in.
function start(fromBar=0,count=false){
  if(!chartSong.segs.length){openSheet();return;}
  initAudio();
  song=loopSong();P.pending=null;
  P.playing=true;P.step=0;P.nextTime=ctx.currentTime+0.08;
  // the pickup plays at the end of the count-in (or alone, just before bar 1, without one)
  const pb=getTimeline().pickupBeats;
  P.pickup=!S.loop&&fromBar===0&&pb>0;
  P.counting=S.countIn||count;
  P.countSteps=P.counting?Math.max(song.bpb*2,Math.ceil(pb*2)):P.pickup?Math.ceil(pb*2):0;
  P.startStep=S.loop?0:fromBar*song.bpb*2;P.walker=makeWalker();P.compPrev=null;P.compPlan=null;P.two=null;P.stroll=false;P.lastStroll=-9;P.drop=false;P.lastDrop=-9;P.pedal=null;P.xr=null;P.roll=null;P.lastBass=null;P.bossaComp=null;P.bRoot=null;P.uiQ=[];
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
    const sw=(STYLES[S.style]||{}).straight?0.5:S.swing/100;
    P.nextTime+=(P.step%2===1?(1-sw):sw)*beatDur;
    P.step++;
  }
}
// Grooves register themselves in STYLES (see js/styles/). straight:true = even eighths.
const STYLES={};
function scheduleStep(s,t,beatDur){
  const sw=(STYLES[S.style]||{}).straight?0.5:S.swing/100,audible=S.melPlay||REC.review;
  if(s<P.countSteps){
    if(P.counting&&s%2===0){click(t,s===0);P.uiQ.push({t,count:s/2+1});}
    if(P.pickup)scheduleMelodyStep(s,(s-P.countSteps)/2,-1,t,beatDur,sw,audible);
    return;
  }
  let gs=s-P.countSteps+(P.startStep||0);
  if(!song.beats)return;
  // a loop change takes effect on the next downbeat
  if(P.pending&&gs%(song.bpb*2)===0){
    song=P.pending.song;P.countSteps=s-P.pending.bar*song.bpb*2;P.startStep=0;gs=s-P.countSteps;P.pending=null;
    P.compPlan=null;P.bossaComp=null;P.two=null;P.fill=null;P.roll=null;P.pedal=null;P.xr=null;P.walker.target=null;
  }
  const q=P.uiQ.length;
  (STYLES[S.style]||STYLES.swing).schedule(gs,t,beatDur);
  for(let i=q;i<P.uiQ.length;i++)P.uiQ[i].song=song;   // the display needs to know which song (chart or loop)
  // melody: where this step is in the chart
  const sb=(gs/2)%song.beats,sBar=Math.floor(sb/song.bpb),bar=song.loopLen?(sBar%song.loopLen)+song.offset:sBar,within=sb-sBar*song.bpb;
  scheduleMelodyStep(s,bar*song.bpb+within,bar,t,beatDur,sw,audible);
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
    let last=null,mel=null;
    while(P.uiQ.length&&P.uiQ[0].t<=now){const e=P.uiQ.shift();if(e.mel)mel=e;else last=e;}
    if(last)showBeat(last);
    if(mel)showMel(mel.mel);
  }
  requestAnimationFrame(uiLoop);
}
