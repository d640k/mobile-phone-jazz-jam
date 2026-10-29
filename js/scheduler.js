// ---------- Scheduler ----------
const P={playing:false,step:0,nextTime:0,timer:null,countSteps:0,walker:null,compPrev:null,compPlan:null,uiQ:[]};
function start(){
  if(!song.segs.length){openSheet();return;}
  initAudio();
  P.playing=true;P.step=0;P.nextTime=ctx.currentTime+0.08;
  P.countSteps=S.countIn?8:0;P.walker=makeWalker();P.compPrev=null;P.compPlan=null;P.two=null;P.stroll=false;P.lastStroll=-9;P.lastBass=null;P.bossaComp=null;P.bRoot=null;P.uiQ=[];
  P.timer=setInterval(tick,25);tick();
  $('play').textContent='Stop';$('play').classList.add('playing');
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').then(l=>P.lock=l).catch(()=>{});}catch(e){}
}
function stop(){
  P.playing=false;clearInterval(P.timer);P.uiQ=[];silenceDrums();
  $('play').textContent='Play';$('play').classList.remove('playing');
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
  if(s<P.countSteps){
    if(s%2===0){click(t,s===0);P.uiQ.push({t,count:s/2+1});}
    return;
  }
  const gs=s-P.countSteps;
  if(!song.beats)return;
  (STYLES[S.style]||STYLES.swing).schedule(gs,t,beatDur);
}
function uiLoop(){
  if(P.playing&&ctx){
    const now=ctx.currentTime;
    let last=null;
    while(P.uiQ.length&&P.uiQ[0].t<=now)last=P.uiQ.shift();
    if(last)showBeat(last);
  }
  requestAnimationFrame(uiLoop);
}
