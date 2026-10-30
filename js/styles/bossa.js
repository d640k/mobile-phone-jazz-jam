// ---------- Bossa nova ----------
const CLAVE=[0,3,6,10,13];                  // cross-stick: 2-bar bossa clave on straight eighths
const BOSSA_KICK={0:0.18,3:0.1,4:0.16,7:0.1};  // soft: felt more than heard
const BOSSA_COMP=[                          // 2-bar comping cycles: [eighth slot 0-15, length in eighths]
  [[0,2],[3,2],[6,2],[10,2],[13,2]],
  [[0,1],[2,2],[5,2],[9,2],[12,1],[14,2]],
  [[0,3],[3,2],[7,2],[10,3],[14,2]],
  [[2,2],[5,3],[8,2],[11,2],[13,2]],
];
function planBossa(song,bar,pats=BOSSA_COMP){
  const plan=new Map();
  for(const [s,d] of pats[Math.floor(Math.random()*pats.length)])plan.set(s,d);
  const B=bar*4,covered=new Set([...plan.keys()].map(s=>hitSeg(song,B*2+s).si));
  for(let b=B;b<B+8;b++){                   // make sure every chord in the 2 bars gets voiced
    const bb=b%song.beats,si=song.segOfBeat[bb];
    if(song.segs[si].start!==bb||covered.has(si))continue;
    const st=(b-B)*2;
    if(st>0&&!plan.has(st-1))plan.set(st-1,3);else plan.set(st,2);
    covered.add(si);
  }
  return plan;
}
function bossaRoot(ch){
  let r=nearest(ch.bass,P.bRoot??38);
  if(r>45)r-=12;if(r<BLO)r+=12;
  P.bRoot=r;return r;
}
function bossaFifth(r){return r+7<=45?r+7:r-5;}
function scheduleBossa(gs,t,beatDur){
  const beat=Math.floor(gs/2)%song.beats,s8=gs%8,s16=gs%16,bar=Math.floor(beat/4);
  const H=ms=>T(t+rnd(-ms,ms)/1000);
  if(DR.swLast){DR.sweep.gain.setValueAtTime(DR.swLast,t);DR.sweep.gain.linearRampToValueAtTime(0,t+0.2);DR.swLast=0;}
  // drums: closed hi-hat eighths, cross-stick clave, soft kick
  chh(H(3),(s8%2===0?0.4:0.3)*rnd(0.88,1.08));
  if(CLAVE.includes(s16))xstick(H(3),0.45*rnd(0.9,1.08));
  if(BOSSA_KICK[s8])kick(H(3),BOSSA_KICK[s8]*rnd(0.85,1.1));
  // bass: root (dotted quarter) + fifth (eighth), twice a bar; new chords get their root
  const si=song.segOfBeat[beat],seg=song.segs[si],ch=seg.chord;
  const starts=gs%2===0&&seg.start===beat;
  let bn=null,len=0,vel=0;
  if(s8===0||((s8===2||s8===4||s8===6)&&starts)){bn=bossaRoot(ch);len=s8===2||s8===6?0.9:1.45;vel=s8===0?0.56:0.5;}
  else if(s8===3||s8===7){const r=P.bRoot??bossaRoot(ch);bn=s8===3?bossaFifth(r):r;len=0.45;vel=0.4;}
  else if(s8===4){bn=bossaFifth(P.bRoot??bossaRoot(ch));len=1.45;vel=0.48;}
  if(bn!==null){bassNote(bn,T(t-0.002),beatDur*len,vel*rnd(0.92,1.05));P.lastBass=bn;}
  if(gs%2===0)P.uiQ.push({t,beat,bar,chorus:Math.floor(gs/(song.beats*2))});
  // comping: syncopated 2-bar cycle, anticipating chord changes
  if(s16===0||!P.bossaComp)P.bossaComp=s16===0?planBossa(song,bar):null;
  if(P.bossaComp&&P.bossaComp.has(s16)){
    const {si:csi,remain}=hitSeg(song,beat*2+(gs%2));
    const l=Math.min(P.bossaComp.get(s16),remain);
    const v=voicingFor(song.segs[csi].chord,P.compPrev);P.compPrev=v;
    const cv=rnd(0.15,0.21),t0=T(t+rnd(0,0.006)),rt=t+l*beatDur/2*0.85;
    v.forEach((m,i)=>compNote(m,t0+i*rnd(0.001,0.004),cv*rnd(0.92,1.05)).releaseAt(rt));
  }
}
STYLES.bossa={schedule:scheduleBossa,straight:true};
