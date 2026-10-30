// ---------- Jazz waltz (3/4) ----------
// Ride "1, 2, 2&, 3", hi-hat on 2, feathered kick on 1 (or brushes). Bass: in the two-feel,
// a half note on 1 and a quarter on 3 with the odd pickup; walking = three quarters a bar.
// Uses the swing Feel and Dynamics settings.
const W_RIDE={0:0.52,2:0.6,3:0.34,4:0.56};
const W_COMP=[[[0,2],[3,2]],[[2,2],[4,2]],[[1,2],[4,1]],[[3,3]],[[0,3]],[[5,1]],[[2,1],[4,2]],[[0,1],[3,1],[5,1]]];
const W_SPARSE=[[[0,6]],[[0,4]],[[3,3]],[[2,4]],[[5,1]]];
const W_FILLS=[{3:0.3,4:0.4,5:0.55},{4:0.4,5:0.55},{1:0.25,3:0.35,5:0.55}];
function scheduleWaltz(gs,t,beatDur){
  const beat=Math.floor(gs/2)%song.beats,s6=gs%6,bar=Math.floor(beat/3),nBars=song.bars.length;
  const lastBar=bar===nBars-1,chorus=chorusOf(gs),two=isTwoFeel(chorus);
  const H=ms=>T(t+rnd(-ms,ms)/1000),br=brushes(),hit=br?brushTap:snare;
  if(gs%(song.beats*2)===0){
    P.stroll=false;
    if(S.dynamics&&!two&&chorus>=2&&chorus-(P.lastStroll??-9)>=2&&Math.random()<0.3){P.stroll=true;P.lastStroll=chorus;}
  }
  const ci=S.dynamics?Math.min(1,0.8+0.07*chorus):0.92;
  const inten=ci*(0.9+0.1*bar/Math.max(1,nBars-1))*(two?0.88:1);
  // drums
  if(s6===0){
    if(bar===0&&gs>0){crash(H(2),(br?0.16:0.28)*(two?0.8:1));kick(H(2),0.28);}
    P.fill=lastBar&&nBars>1?W_FILLS[Math.floor(Math.random()*W_FILLS.length)]:null;
  }
  if(br){
    if(s6%2===0)sweep(t,beatDur,0.1*inten*rnd(0.85,1.1));
    if(s6===2||s6===4)brushTap(H(4),(s6===2?0.28:0.2)*inten*rnd(0.85,1.1));
    if(s6===2)hat(H(4),0.3);
    if(s6===0)kick(H(4),0.08*rnd(0.8,1.2));
  }else{
    if(DR.swLast){DR.sweep.gain.setValueAtTime(DR.swLast,t);DR.sweep.gain.linearRampToValueAtTime(0,t+0.2);DR.swLast=0;}
    const rv=W_RIDE[s6];
    if(rv!==undefined)ride(H(3),rv*inten*rnd(0.88,1.08));
    if(s6===2)hat(H(4),0.42*rnd(0.85,1.1));
    if(s6===4&&Math.random()<0.25)hat(H(4),0.25);
    if(s6===0)kick(H(4),0.1*rnd(0.8,1.25));
    if(s6%2===1&&Math.random()<0.1*inten*(two?0.3:1))snare(H(6),rnd(0.05,0.12));
  }
  if(P.fill&&P.fill[s6])hit(H(4),P.fill[s6]*rnd(0.85,1.1)*(two?0.85:1));
  // bass, slightly on top of the beat
  if(two){
    if(s6===0)planTwo(bar,3);
    const p=P.two;let n=null,len=0,vel=0.55;
    if(s6===0){n=p.n1;len=p.pk3?1.4:1.85;vel=0.58;}
    else if(s6===4){n=p.n3;len=p.pk7?0.55:0.9;}
    else if(s6===3&&p.pk3){n=Math.random()<0.6?p.n1:p.n3+(p.n3>p.n1?-1:1);len=0.45;vel=0.42;}
    else if(s6===5&&p.pk7){n=p.nN+(p.nN>p.n3?-1:1);len=0.45;vel=0.42;}
    if(n!==null){
      n=Math.max(BLO,Math.min(BHI,n));
      bassNote(n,T(t-0.004+rnd(-0.003,0.003)),beatDur*len,vel*rnd(0.92,1.05));
      P.lastBass=n;P.walker.prev=n;P.walker.target=null;
    }
  }else if(gs%2===0){
    const m=bassForBeat(song,beat,P.walker);
    bassNote(m,T(t-0.004+rnd(-0.003,0.003)),beatDur*rnd(0.78,0.9),0.55*(beat%3===0?1.08:1)*rnd(0.9,1.06));
    P.lastBass=m;
  }else if(P.lastBass!=null&&Math.random()<0.06){
    bassNote(P.lastBass,H(4),0.07,0.22,true);
  }
  if(gs%2===0)P.uiQ.push({t,beat,bar,chorus,feel:two?'2-feel':'',stroll:P.stroll});
  // comping on waltz figures
  if(s6===0)P.compPlan=coverPlan(pickPlan(two?W_SPARSE:W_COMP),bar,3);
  if(!P.stroll&&P.compPlan&&P.compPlan.has(s6)){
    const {si,remain}=hitSeg(song,beat*2+(gs%2));
    const len=Math.min(P.compPlan.get(s6),remain);
    const v=voicingFor(song.segs[si].chord,P.compPrev);P.compPrev=v;
    const vel=rnd(0.16,0.24)*inten;
    const t0=T(t+rnd(0.002,0.014)),rt=t+len*beatDur/2*0.92;
    v.forEach((m,i)=>compNote(m,t0+i*rnd(0.002,0.007),vel*rnd(0.9,1.05)).releaseAt(rt));
  }
}
STYLES.waltz={schedule:scheduleWaltz,straight:false,bpb:3};
