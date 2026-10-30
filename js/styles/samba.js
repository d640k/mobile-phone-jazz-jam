// ---------- Samba ----------
// Cut time: each 4/4 bar is one 2/4 samba bar, so our eighths are the samba sixteenths.
// Closed hi-hat on every sixteenth (accenting the last one of each beat), cross-stick on the
// 2-bar samba clave, surdo-style kick on 1 and 2 with soft pickups.
// Bass: root (dotted eighth), fifth (sixteenth), fifth (quarter), the classic samba figure.
const SAMBA_CLAVE=[0,3,6,10,12];
const SAMBA_KICK={0:0.2,3:0.1,4:0.26,7:0.1};
const SAMBA_HAT=[0.26,0.16,0.22,0.32,0.26,0.16,0.22,0.32];
const SAMBA_COMP=[                         // short, syncopated stabs over 2 bars
  [[0,1],[2,1],[5,1],[7,1],[10,1],[13,1]],
  [[2,1],[3,1],[6,1],[9,1],[11,1],[14,1]],
  [[0,1],[3,1],[6,1],[8,1],[11,1],[14,1]],
  [[1,1],[3,1],[6,1],[9,1],[12,2]],
];
function sambaFifth(r){return r-5>=BLO?r-5:r+7;}  // the fifth below, surdo-style
function scheduleSamba(gs,t,beatDur){
  const beat=Math.floor(gs/2)%song.beats,s8=gs%8,s16=gs%16,bar=Math.floor(beat/4);
  const H=ms=>T(t+rnd(-ms,ms)/1000);
  if(DR.swLast){DR.sweep.gain.setValueAtTime(DR.swLast,t);DR.sweep.gain.linearRampToValueAtTime(0,t+0.2);DR.swLast=0;}
  // drums
  chh(H(2),SAMBA_HAT[s8]*rnd(0.9,1.08));
  if(SAMBA_CLAVE.includes(s16))xstick(H(2),0.42*rnd(0.9,1.08));
  if(SAMBA_KICK[s8])kick(H(2),SAMBA_KICK[s8]*rnd(0.85,1.1));
  // bass
  const si=song.segOfBeat[beat],seg=song.segs[si],ch=seg.chord;
  const starts=gs%2===0&&seg.start===beat;
  let bn=null,len=0,vel=0;
  if(s8===0||((s8===2||s8===6)&&starts)){bn=bossaRoot(ch);len=s8===0?1.2:0.9;vel=0.52;}
  else if(s8===4&&starts){bn=bossaRoot(ch);len=1.6;vel=0.58;}
  else if(s8===3||s8===4){const r=P.bRoot??bossaRoot(ch);bn=sambaFifth(r);len=s8===3?0.4:1.6;vel=s8===3?0.4:0.58;}
  if(bn!==null){bassNote(bn,T(t-0.002),beatDur*len,vel*rnd(0.92,1.05));P.lastBass=bn;}
  if(gs%2===0)P.uiQ.push({t,beat,bar,chorus:Math.floor(gs/(song.beats*2))});
  // comping
  if(s16===0||!P.bossaComp)P.bossaComp=s16===0?planBossa(song,bar,SAMBA_COMP):null;
  if(P.bossaComp&&P.bossaComp.has(s16)){
    const {si:csi,remain}=hitSeg(song,beat*2+(gs%2));
    const l=Math.min(P.bossaComp.get(s16),remain);
    const v=voicingFor(song.segs[csi].chord,P.compPrev);P.compPrev=v;
    const cv=rnd(0.15,0.2),t0=T(t+rnd(0,0.005)),rt=t+l*beatDur/2*0.7;
    v.forEach((m,i)=>compNote(m,t0+i*rnd(0.001,0.003),cv*rnd(0.92,1.05)).releaseAt(rt));
  }
}
STYLES.samba={schedule:scheduleSamba,straight:true};
