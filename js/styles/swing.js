// ---------- Swing ----------
// Feel (S.bassFeel): '4' walk, '2' two-feel, '24' two-feel first chorus then walk.
// Dynamics (S.dynamics): intensity builds over choruses and through each chorus; from the
// third chorus the comping sometimes lays out for a chorus ("strolls") to leave space.

// last-bar fills: eighth slot -> velocity
const FILLS=[{5:0.3,6:0.4,7:0.55},{3:0.25,5:0.35,7:0.55},{6:0.45,7:0.6},{4:0.3,5:0.3,6:0.4,7:0.55},{7:0.5}];
const RIDE={0:0.5,2:0.62,3:0.36,4:0.5,6:0.62,7:0.36};
// sparse comping for the two-feel: [eighth slot, length in eighths]
const SPARSE_COMP=[[[0,4]],[[3,3]],[[0,2],[4,2]],[[2,3]],[[7,1]],[[0,3]],[[4,4]],[]];
// ballad comping: long, sustained chords
const BALLAD_COMP=[[[0,8]],[[0,4],[4,4]],[[0,6],[6,2]],[[0,3],[3,5]],[[0,4],[7,1]],[[2,6]]];
// Make sure every chord that starts in this bar gets voiced, whatever the pattern.
function coverPlan(plan,bar,bpb=4){
  const B=bar*bpb,covered=new Set([...plan.keys()].map(s=>hitSeg(song,B*2+s).si));
  for(let b=B;b<B+bpb;b++){const bb=b%song.beats,si=song.segOfBeat[bb];if(song.segs[si].start===bb&&!covered.has(si)){plan.set((b-B)*2,2);covered.add(si);}}
  return plan;
}
const pickPlan=pats=>new Map(pats[Math.floor(Math.random()*pats.length)]);

const chorusOf=gs=>Math.floor(gs/(song.beats*2));
const isTwoFeel=ch=>S.bassFeel==='2'||(S.bassFeel==='24'&&ch===0);

// Two-feel bass: plan one bar of half notes (beats 1 and 3), the next downbeat, and pickups.
// bpb: beats per bar (4, or 3 in a waltz, where the second note falls on beat 3 too)
function planTwo(bar,bpb=4){
  const B=bar*bpb,nb=song.beats,segAt=b=>song.segs[song.segOfBeat[((b%nb)+nb)%nb]];
  const s1=segAt(B),s3=segAt(B+2),sN=segAt(B+bpb);
  const prev=P.lastBass??38,pick=a=>a[Math.floor(Math.random()*a.length)];
  // beat 1: the root on a new chord; on a held chord, vary with the 5th, 3rd or root
  const c1=s1.chord,fresh=s1.start===B||!P.two||P.two.ch!==c1;
  const n1=nearest(fresh?c1.bass:(c1.root+pick([c1.arp[2],c1.arp[1],0]))%12,prev);
  // beat 3: a new chord's root; otherwise mostly the 5th, sometimes the 3rd or a
  // chromatic approach into the next bar's new chord
  let n3;
  const nextNew=sN.start===(B+bpb)%nb&&sN.chord!==s3.chord;
  if(s3.start===B+2)n3=nearest(s3.chord.bass,n1);
  else{
    const r=Math.random(),c=s3.chord;
    if(nextNew&&r<0.22){const tg=nearest(sN.chord.bass,n1);n3=tg+(Math.random()<0.5?1:-1);}
    else if(r<0.42)n3=nearest((c.root+c.arp[1])%12,n1);
    else n3=nearest((c.root+c.arp[2])%12,n1);
    if(n3===n1)n3=nearest((c.root+c.arp[2])%12,n1+7);
  }
  n3=Math.max(BLO,Math.min(BHI,n3));
  const nN=nearest(sN.chord.bass,n3);
  // occasional eighth-note pickups on the "and" of 2 or 4 (dotted quarter + eighth)
  P.two={ch:s3.chord,n1,n3,nN,pk3:Math.random()<0.14,pk7:Math.random()<0.18};
}

// o: style options, e.g. {brushes:true, ballad:true, level:0.8} for the ballad.
// The Swing style also follows the chosen rhythm-section profile (js/sections.js).
function scheduleSwing(gs,t,beatDur,o={}){
  const X=o.ballad?curSectionDefault():curSection(),D=X.drums;
  const beat=Math.floor(gs/2)%song.beats;
  const s8=gs%8, bar=Math.floor(beat/4), nBars=song.bars.length;
  const lastBar=bar===nBars-1, chorus=chorusOf(gs);
  const H=ms=>T(t+rnd(-ms,ms)/1000);               // humanized time
  const br=o.brushes||brushes();
  const hit=br?brushTap:snare;
  // chorus-level dynamics: occasional quiet "drop" choruses, comping laying out
  if(gs%(song.beats*2)===0){
    P.stroll=false;P.drop=false;
    if(S.dynamics&&X.dyn.drop&&chorus>=2&&chorus-(P.lastDrop??-9)>=2&&Math.random()<X.dyn.drop){P.drop=true;P.lastDrop=chorus;}
    else if(S.dynamics&&!isTwoFeel(chorus)&&chorus>=2&&chorus-(P.lastStroll??-9)>=2&&Math.random()<0.3){P.stroll=true;P.lastStroll=chorus;}
  }
  const two=isTwoFeel(chorus)||P.drop;
  const ci=S.dynamics?Math.min(1,X.dyn.start+X.dyn.build*chorus):0.92;
  const inten=ci*(0.9+0.1*bar/Math.max(1,nBars-1))*(two?0.88:1)*(P.drop?0.8:1)*(o.level||1); // builds through each chorus
  // drums
  if(s8===0){
    if(bar===0&&gs>0){crash(H(2),(br?0.16:D.crash)*(two?0.8:1));kick(H(2),0.3);}
    P.fill=lastBar&&nBars>1?FILLS[Math.floor(Math.random()*FILLS.length)]:null;
    P.roll=null;
    if(!br&&!P.drop&&((lastBar&&nBars>1&&Math.random()<D.pressRoll)||(!lastBar&&bar%8===7&&Math.random()<D.pressRollPhrase))){P.roll=true;P.fill=null;}
    P.rideDrop=Math.random()<D.rideDrop?(Math.random()<0.5?3:7):-1;
    P.rideQ=Math.random()<D.rideQuarters;              // a bar of plain quarter notes on the ride
    P.xs4=two&&!br&&Math.random()<0.5;               // two-feel: cross-stick on 4 some bars
    if(bar%2===0&&!two&&!br&&Math.random()<D.crossRhythm)P.xr=gs;  // 2 bars of dotted-quarter accents
  }
  const inXR=P.xr!=null&&gs>=P.xr&&gs<P.xr+16;
  if(br){
    if(s8%2===0)sweep(t,beatDur,0.1*inten*rnd(0.85,1.1));
    if(s8===2||s8===6){brushTap(H(4),0.3*inten*rnd(0.85,1.1));hat(H(4),0.3);}
    if(s8%2===0)kick(H(4),0.07*rnd(0.8,1.2));
    if(s8%2===1&&Math.random()<0.06)brushTap(H(5),0.09*rnd(0.7,1.2));
  }else{
    if(DR.swLast){DR.sweep.gain.setValueAtTime(DR.swLast,t);DR.sweep.gain.linearRampToValueAtTime(0,t+0.2);DR.swLast=0;}
    let rv=RIDE[s8];
    if(P.rideQ&&(s8===3||s8===7))rv=undefined;
    if(s8===P.rideDrop)rv=undefined;
    if(rv===undefined&&!P.rideQ&&(s8===1||s8===5)&&Math.random()<D.rideExtra)rv=0.3;
    if(rv!==undefined)ride(H(3),rv*D.ride*inten*rnd(0.88,1.08));
    if(D.hat==='all'){if(s8%2===0)hat(H(4),D.hatVel*(s8===2||s8===6?1:0.7)*rnd(0.85,1.1));}
    else if(s8===2||s8===6)hat(H(4),D.hatVel*rnd(0.85,1.1));
    if(s8===6&&P.xs4)xstick(H(4),0.3*rnd(0.9,1.1));
    if(s8%2===0)kick(H(4),D.kick*rnd(0.8,1.25));
    if(inXR){if((gs-P.xr)%3===0){if(((gs-P.xr)/3)%2===0)snare(H(4),0.3*inten*rnd(0.9,1.1));else kick(H(4),0.32*rnd(0.9,1.1));}}
    else{
      if(s8%2===1&&Math.random()<D.chatter*inten*(two?0.3:1))snare(H(6),rnd(0.05,0.12));
      for(const [sl,pr,v] of D.accents)if(s8===sl&&!two&&Math.random()<pr)snare(H(4),v*rnd(0.9,1.1));
      if(s8%2===1&&!two&&Math.random()<D.bombs*ci)kick(H(4),D.bombVel);
    }
    // press roll: a crescendo buzz on the snare from beat 3 into the top
    if(P.roll&&s8===4)pressRoll(t,beatDur*1.5,0.08,0.42*inten+0.08);
  }
  if(P.fill&&P.fill[s8])hit(H(4),P.fill[s8]*rnd(0.85,1.1)*(two?0.85:1));
  else if(!P.roll&&!lastBar&&bar%4===3&&s8===7&&Math.random()<D.phraseBomb){hit(H(4),0.28);if(!br)kick(H(4),0.25);}
  // bass, sitting slightly on top of the beat
  const push=X.bass.push/1000;
  if(two){
    if(s8===0)planTwo(bar);
    const p=P.two;let n=null,len=0,vel=0.55;
    if(s8===0){n=p.n1;len=p.pk3?1.4:1.85;vel=0.58;}
    else if(s8===4){n=p.n3;len=p.pk7?1.4:1.85;}
    else if(s8===3&&p.pk3){n=Math.random()<0.6?p.n1:p.n3+(p.n3>p.n1?-1:1);len=0.45;vel=0.42;}
    else if(s8===7&&p.pk7){n=Math.random()<0.5?p.n3:p.nN+(p.nN>p.n3?-1:1);len=0.45;vel=0.42;}
    if(n!==null){
      n=Math.max(BLO,Math.min(BHI,n));
      bassNote(n,T(t-push+rnd(-0.003,0.003)),beatDur*len,vel*rnd(0.92,1.05));
      P.lastBass=n;P.walker.prev=n;P.walker.target=null;   // walking picks up smoothly afterwards
    }
    P.pedal=null;
  }else if(gs%2===0){
    // pedal point: hold one note through the last 2 bars of a 4-bar phrase (Ron Carter-ish)
    if(s8===0&&bar%4===2&&bar+2<=nBars&&Math.random()<X.bass.pedal){
      const tgt=song.segs[song.segOfBeat[((bar+2)*4)%song.beats]].chord;
      const pc=Math.random()<0.6?(tgt.bass+7)%12:song.segs[song.segOfBeat[beat]].chord.bass;
      P.pedal={note:nearest(pc,P.lastBass??40),until:gs+16};   // two bars, counted in absolute eighths
    }
    if(P.pedal&&gs>=P.pedal.until)P.pedal=null;
    let m;
    if(P.pedal){m=P.pedal.note+(s8===4&&Math.random()<0.25&&P.pedal.note+12<=BHI?12:0);P.walker.prev=P.pedal.note;P.walker.target=null;}
    else m=bassForBeat(song,beat,P.walker,X.bass);
    const acc=beat%4===0?1.08:1;
    bassNote(m,T(t-push+rnd(-0.003,0.003)),beatDur*rnd(0.78,0.9),0.55*acc*rnd(0.9,1.06));
    P.lastBass=m;
  }else if(P.lastBass!=null&&Math.random()<X.bass.ghost){
    bassNote(P.lastBass,H(4),0.07,0.22,true); // ghost note
  }
  if(gs%2===0)P.uiQ.push({t,beat,bar,chorus,feel:P.drop?'drop':two?'2-feel':(P.pedal?'pedal':''),stroll:P.stroll});
  // comping, laid back a hair, notes slightly rolled
  if(s8===0){
    if(o.ballad)P.compPlan=coverPlan(pickPlan(BALLAD_COMP),bar);
    else if(two||X.comp.density==='sparse')P.compPlan=coverPlan(pickPlan(SPARSE_COMP),bar);
    else{
      P.compPlan=planCompBar(song,bar,X.comp.density==='busy'||bar>=nBars*0.75||(S.dynamics&&ci>=0.95&&Math.random()<0.3));
      if(X.comp.density==='busy'){   // punchy anticipations on the "and" of 4 and of 2
        if(!P.compPlan.has(7)&&Math.random()<0.45)P.compPlan.set(7,1);
        if(!P.compPlan.has(3)&&!P.compPlan.has(2)&&Math.random()<0.3)P.compPlan.set(3,2);
      }
    }
  }
  if(!P.stroll&&P.compPlan&&P.compPlan.has(s8)){
    const {si,remain}=hitSeg(song,beat*2+(gs%2));
    const len=Math.min(P.compPlan.get(s8),remain);
    const v=compVoicing(song.segs[si].chord,P.compPrev,X.comp.voicing);P.compPrev=v;
    const vel=rnd(0.16,0.24)*inten*X.comp.vel;
    const lay=X.comp.lay/1000,t0=T(t+lay+rnd(-0.006,0.006)),rt=t+len*beatDur/2*0.92;
    v.forEach((m,i)=>compNote(m,t0+i*(o.ballad?rnd(0.012,0.03):rnd(0.002,0.007)),vel*rnd(0.9,1.05)).releaseAt(rt)); // ballad: rolled
  }
}
const curSectionDefault=()=>({...SEC_DEFAULT});
STYLES.swing={schedule:scheduleSwing,straight:false};
// Ballad: brushes, softer, long rolled comping chords; same feel/dynamics options as swing.
const BALLAD_OPT={brushes:true,ballad:true,level:0.8};
STYLES.ballad={schedule:(gs,t,bd)=>scheduleSwing(gs,t,bd,BALLAD_OPT),straight:false};
