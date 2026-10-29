// ---------- Swing ----------
// last-bar fills: eighth slot -> velocity
const FILLS=[{5:0.3,6:0.4,7:0.55},{3:0.25,5:0.35,7:0.55},{6:0.45,7:0.6},{4:0.3,5:0.3,6:0.4,7:0.55},{7:0.5}];
const RIDE={0:0.5,2:0.62,3:0.36,4:0.5,6:0.62,7:0.36};
function scheduleSwing(gs,t,beatDur){
  const beat=Math.floor(gs/2)%song.beats;
  const s8=gs%8, bar=Math.floor(beat/4), nBars=song.bars.length;
  const lastBar=bar===nBars-1;
  const inten=0.82+0.18*(bar/Math.max(1,nBars-1)); // builds through each chorus
  const H=ms=>T(t+rnd(-ms,ms)/1000);               // humanized time
  const br=brushes();
  const hit=br?brushTap:snare;
  // drums
  if(s8===0){
    if(bar===0&&gs>0){crash(H(2),br?0.16:0.3);kick(H(2),0.3);}
    P.fill=lastBar&&nBars>1?FILLS[Math.floor(Math.random()*FILLS.length)]:null;
    P.rideDrop=Math.random()<0.25?(Math.random()<0.5?3:7):-1;
  }
  if(br){
    if(s8%2===0)sweep(t,beatDur,0.1*inten*rnd(0.85,1.1));
    if(s8===2||s8===6){brushTap(H(4),0.3*inten*rnd(0.85,1.1));hat(H(4),0.3);}
    if(s8%2===0)kick(H(4),0.07*rnd(0.8,1.2));
    if(s8%2===1&&Math.random()<0.06)brushTap(H(5),0.09*rnd(0.7,1.2));
  }else{
    if(DR.swLast){DR.sweep.gain.setValueAtTime(DR.swLast,t);DR.sweep.gain.linearRampToValueAtTime(0,t+0.2);DR.swLast=0;}
    let rv=RIDE[s8];
    if(s8===P.rideDrop)rv=undefined;
    if(rv===undefined&&(s8===1||s8===5)&&Math.random()<0.05)rv=0.3;
    if(rv!==undefined)ride(H(3),rv*inten*rnd(0.88,1.08));
    if(s8===2||s8===6)hat(H(4),0.42*rnd(0.85,1.1));
    if(s8%2===0)kick(H(4),0.09*rnd(0.8,1.25));
    if(s8%2===1&&Math.random()<0.12*inten)snare(H(6),rnd(0.05,0.12));
    if(s8%2===1&&Math.random()<0.025)kick(H(4),0.4);
  }
  if(P.fill&&P.fill[s8])hit(H(4),P.fill[s8]*rnd(0.85,1.1));
  else if(!lastBar&&bar%4===3&&s8===7&&Math.random()<0.3){hit(H(4),0.28);if(!br)kick(H(4),0.25);}
  // bass, sitting slightly on top of the beat
  if(gs%2===0){
    const m=bassForBeat(song,beat,P.walker);
    const acc=beat%4===0?1.08:1;
    bassNote(m,T(t-0.004+rnd(-0.003,0.003)),beatDur*rnd(0.78,0.9),0.55*acc*rnd(0.9,1.06));
    P.lastBass=m;
    P.uiQ.push({t,beat,bar});
  }else if(P.lastBass!=null&&Math.random()<0.07){
    bassNote(P.lastBass,H(4),0.07,0.22,true); // ghost note
  }
  // comping, laid back a hair, notes slightly rolled
  if(s8===0)P.compPlan=planCompBar(song,bar,bar>=nBars*0.75);
  if(P.compPlan&&P.compPlan.has(s8)){
    const {si,remain}=hitSeg(song,beat*2+(gs%2));
    const len=Math.min(P.compPlan.get(s8),remain);
    const v=voicingFor(song.segs[si].chord,P.compPrev);P.compPrev=v;
    const vel=rnd(0.16,0.24)*inten;
    const t0=T(t+rnd(0.002,0.014)),rt=t+len*beatDur/2*0.92;
    v.forEach((m,i)=>compNote(m,t0+i*rnd(0.002,0.007),vel*rnd(0.9,1.05)).releaseAt(rt));
  }
}
STYLES.swing={schedule:scheduleSwing,straight:false};
