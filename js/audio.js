// ---------- Audio ----------
let ctx,master,busDr,busBs,busCp,busKy,revIn,revOut,epTrem,noiseBuf;
const DR={swLast:0};
const mtof=m=>440*Math.pow(2,(m-69)/12);
const rnd=(a,b)=>a+Math.random()*(b-a);
const T=x=>Math.max(x,ctx.currentTime+0.001);
function makePan(p){if(ctx.createStereoPanner){const n=ctx.createStereoPanner();n.pan.value=p;return n;}return ctx.createGain();}
// Generated room impulse: filtered noise with an exponential tail that darkens over time.
function makeIR(sec,rt){
  const sr=ctx.sampleRate,len=Math.floor(sr*sec),pre=Math.floor(sr*0.012),buf=ctx.createBuffer(2,len,sr);
  for(let c=0;c<2;c++){
    const d=buf.getChannelData(c);let y=0;
    for(let i=pre;i<len;i++){
      const t=(i-pre)/sr,k=Math.max(0.06,0.8-t*0.55);
      y+=k*((Math.random()*2-1)-y);
      d[i]=y*Math.exp(-6.9*t/rt);
    }
    for(let r=0;r<7;r++){const i=pre+Math.floor(sr*rnd(0.003,0.045));d[i]+=rnd(-0.5,0.5)*(1-r/9);}
  }
  return buf;
}
function initAudio(){
  if(ctx){if(ctx.state!=='running')ctx.resume();return;}
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}
  const AC=window.AudioContext||window.webkitAudioContext;
  try{ctx=new AC({latencyHint:'interactive'});}catch(e){ctx=new AC();}
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-14;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=0.006;comp.release.value=0.2;
  master=ctx.createGain();master.gain.value=1.3;
  master.connect(comp);comp.connect(ctx.destination);
  // reverb send/return
  revIn=ctx.createGain();
  const revHp=ctx.createBiquadFilter();revHp.type='highpass';revHp.frequency.value=200;
  const conv=ctx.createConvolver();conv.buffer=makeIR(2.4,1.6);
  revOut=ctx.createGain();
  revIn.connect(revHp);revHp.connect(conv);conv.connect(revOut);revOut.connect(master);
  // electric-piano auto-pan tremolo
  const lfo=ctx.createOscillator();lfo.frequency.value=4.3;epTrem=ctx.createGain();epTrem.gain.value=0;lfo.connect(epTrem);lfo.start();
  const mk=(send,pan,trem)=>{
    const g=ctx.createGain(),p=makePan(pan),s=ctx.createGain();s.gain.value=send;
    g.connect(p);p.connect(master);p.connect(s);s.connect(revIn);
    if(trem&&p.pan)epTrem.connect(p.pan);
    return g;
  };
  busDr=mk(0.2,0);
  // bass: presence EQ + gentle compression so it reads on small phone speakers
  const bsOut=mk(0.06,0);busBs=ctx.createGain();
  const bLo=ctx.createBiquadFilter();bLo.type='peaking';bLo.frequency.value=240;bLo.Q.value=0.9;DR.bLo=bLo;
  const bMid=ctx.createBiquadFilter();bMid.type='peaking';bMid.frequency.value=800;bMid.Q.value=1;DR.bMid=bMid;
  const bCmp=ctx.createDynamicsCompressor();bCmp.threshold.value=-20;bCmp.knee.value=8;bCmp.ratio.value=3;bCmp.attack.value=0.004;bCmp.release.value=0.15;
  const bMk=ctx.createGain();DR.bassMakeup=bMk;
  busBs.connect(bLo);bLo.connect(bMid);bMid.connect(bCmp);bCmp.connect(bMk);bMk.connect(bsOut);
  busBs.tap=bsOut;
busCp=mk(0.3,-0.2,true);const kyOut=mk(0.25,0.1,true);busKy=ctx.createGain();
  const kyLim=ctx.createDynamicsCompressor();kyLim.threshold.value=-6;kyLim.knee.value=3;kyLim.ratio.value=12;kyLim.attack.value=0.001;kyLim.release.value=0.12;
  busKy.connect(kyLim);kyLim.connect(kyOut);busKy.tap=kyOut;
  // shared noise + metallic sources for cymbals and brushes
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
  const nd=noiseBuf.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  const nz=ctx.createBufferSource();nz.buffer=noiseBuf;nz.loop=true;nz.start();
  const metal=ctx.createGain();metal.gain.value=0.09;
  [263,400,531,588,678,743,903,1087].forEach(f=>{const o=ctx.createOscillator();o.type='square';o.frequency.value=f;o.connect(metal);o.start();});
  const nzc=ctx.createGain();nzc.gain.value=0.16;nz.connect(nzc);
  const vca=(pan)=>{const g=ctx.createGain();g.gain.value=0;const p=makePan(pan);g.connect(p);p.connect(busDr);return g;};
  // ride: smooth wash + soft stick ping, through a dip at the harsh 3-4 kHz zone and a tone control
  const rBP=ctx.createBiquadFilter();rBP.type='bandpass';rBP.frequency.value=5200;rBP.Q.value=0.35;
  const rHP=ctx.createBiquadFilter();rHP.type='highpass';rHP.frequency.value=2200;
  const sh=ctx.createOscillator();sh.frequency.value=0.21;const shg=ctx.createGain();shg.gain.value=700;sh.connect(shg);shg.connect(rBP.frequency);sh.start();
  const mlow=ctx.createGain();mlow.gain.value=0.4;metal.connect(mlow);
  mlow.connect(rBP);nzc.connect(rBP);rBP.connect(rHP);
  DR.wash=ctx.createGain();DR.wash.gain.value=0;rHP.connect(DR.wash);
  const ping=ctx.createGain();ping.gain.value=0.16;
  [1610,2330,3110,4020].forEach((f,i)=>{const o=ctx.createOscillator();o.frequency.value=f;const g=ctx.createGain();g.gain.value=1/(i+1.5);o.connect(g);g.connect(ping);o.start();});
  DR.ping=ctx.createGain();DR.ping.gain.value=0;ping.connect(DR.ping);
  const dip=ctx.createBiquadFilter();dip.type='peaking';dip.frequency.value=3400;dip.Q.value=1.2;dip.gain.value=-5;
  DR.rideLP=ctx.createBiquadFilter();DR.rideLP.type='lowpass';DR.rideLP.Q.value=0.5;
  const rPan=makePan(0.3);
  DR.wash.connect(dip);DR.ping.connect(dip);dip.connect(DR.rideLP);DR.rideLP.connect(rPan);rPan.connect(busDr);
  // hi-hat foot chick
  const hHP=ctx.createBiquadFilter();hHP.type='highpass';hHP.frequency.value=7000;
  const hBP=ctx.createBiquadFilter();hBP.type='bandpass';hBP.frequency.value=9500;hBP.Q.value=0.8;
  metal.connect(hHP);nzc.connect(hHP);hHP.connect(hBP);
  DR.hat=vca(-0.35);hBP.connect(DR.hat);
  // crash
  const cHP=ctx.createBiquadFilter();cHP.type='highpass';cHP.frequency.value=3800;
  const nzx=ctx.createGain();nzx.gain.value=0.35;nz.connect(nzx);
  DR.crashLP=ctx.createBiquadFilter();DR.crashLP.type='lowpass';DR.crashLP.Q.value=0.5;
  metal.connect(cHP);nzx.connect(cHP);cHP.connect(DR.crashLP);
  DR.crash=vca(-0.4);DR.crashLP.connect(DR.crash);
  // brush sweep
  const swBP=ctx.createBiquadFilter();swBP.type='bandpass';swBP.frequency.value=3000;swBP.Q.value=0.6;
  nz.connect(swBP);DR.swF=swBP.frequency;
  DR.sweep=vca(-0.1);swBP.connect(DR.sweep);
  // sample outputs: ride shares the tone control (but skips the synth's harsh-band dip)
  DR.crashSLP=ctx.createBiquadFilter();DR.crashSLP.type='lowpass';DR.crashSLP.Q.value=0.5;
  const out=(pan,via)=>{const p=makePan(pan);p.connect(busDr);if(via){via.connect(p);return via;}return p;};
  SMP_OUT.ride=DR.rideLP;SMP_OUT.crash=out(-0.4,DR.crashSLP);
  SMP_OUT.kick=out(0);SMP_OUT.snare=out(-0.1);SMP_OUT.hat=out(-0.35);SMP_OUT.chh=out(-0.35);SMP_OUT.xstick=out(-0.1);
  loadSamples();loadBass(S.bassSound);initOrgan();loadKeys(S.keyInst);loadKeys(S.compInst);
  applyVolumes();
  const sb=ctx.createBufferSource();sb.buffer=ctx.createBuffer(1,1,22050);sb.connect(ctx.destination);sb.start(0);
  if(ctx.state!=='running')ctx.resume();
}
function applyVolumes(){
  if(!ctx)return;
  const v=(x,m)=>m?0:Math.pow(x/100,1.5);
  const O=OUT_PROFILE[S.output];
  busDr.gain.value=v(S.vol.dr,S.mute.dr)*O.dr;
  busBs.gain.value=v(S.vol.bs,S.mute.bs)*O.bs;
  busCp.gain.value=S.trio?0:v(S.vol.cp,S.mute.cp)*O.cp;
  busKy.gain.value=v(S.vol.ky,false)*O.ky;
  master.gain.value=1.3*O.mst;DR.bLo.gain.value=O.bLo;DR.bMid.gain.value=O.bMid;DR.bassMakeup.gain.value=O.bMk;
  revOut.gain.value=Math.pow(S.vol.rv/100,1.2)*1.6;
  epTrem.gain.value=S.trem?0.55:0;
  const lp=3000*Math.pow(2,S.vol.cy/100*2.74); // 3 kHz (dark) .. 20 kHz (open)
  DR.rideLP.frequency.value=lp;DR.crashLP.frequency.value=DR.crashSLP.frequency.value=Math.min(20000,lp*1.3);
}
function brushes(){return S.drumStyle==='brushes'||(S.drumStyle!=='ride'&&S.bpm<110);}
function ride(t,v){
  if(useS('ride')){playSmp('ride',t,v);return;}
  DR.ping.gain.setValueAtTime(v,t);DR.ping.gain.setTargetAtTime(0,t+0.002,0.035);
  DR.wash.gain.setTargetAtTime(v*1.15,t,0.004);DR.wash.gain.setTargetAtTime(0,t+0.012,0.55);
}
function hat(t,v){if(useS('hat')){playSmp('hat',t,v);return;}DR.hat.gain.setValueAtTime(v,t);DR.hat.gain.setTargetAtTime(0,t+0.001,0.02);}
function crash(t,v){if(useS('crash')){playSmp('crash',t,v);return;}DR.crash.gain.setValueAtTime(v,t);DR.crash.gain.setTargetAtTime(0,t+0.005,0.85);}
// one brush stroke across a beat: swells then fades, with the pitch of the swish moving
function sweep(t,dur,v){
  const g=DR.sweep.gain;
  g.setValueAtTime(DR.swLast,t);g.linearRampToValueAtTime(v,t+dur*0.4);g.linearRampToValueAtTime(v*0.3,t+dur*0.98);
  DR.swLast=v*0.3;
  DR.swF.setValueAtTime(rnd(2100,2500),t);DR.swF.linearRampToValueAtTime(rnd(3400,4000),t+dur*0.55);DR.swF.linearRampToValueAtTime(2600,t+dur*0.98);
}
function silenceDrums(){
  if(!ctx)return;const n=ctx.currentTime;
  for(const g of [DR.sweep.gain,DR.wash.gain,DR.ping.gain,DR.crash.gain]){g.cancelScheduledValues(n);g.setTargetAtTime(0,n,0.08);}
  DR.swLast=0;
}
function noiseHit(t,v,type,freq,q,tau,pan){
  const n=ctx.createBufferSource();n.buffer=noiseBuf;
  const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
  const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.003);g.gain.setTargetAtTime(0,t+0.004,tau);
  n.connect(f);f.connect(g);g.connect(busDr);n.start(t,Math.random()*1.5);n.stop(t+tau*6+0.05);
}
function tone(t,v,f0,f1,tau){
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+tau*2);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.003);g.gain.setTargetAtTime(0,t+0.004,tau);
  o.connect(g);g.connect(busDr);o.start(t);o.stop(t+tau*6+0.05);
}
function snare(t,v){if(useS('snare')){playSmp('snare',t,v);return;}noiseHit(t,v,'bandpass',1900,0.6,0.07);tone(t,v*0.5,190,165,0.04);}
function chh(t,v){if(useS('chh')){playSmp('chh',t,v);return;}DR.hat.gain.setValueAtTime(v*0.8,t);DR.hat.gain.setTargetAtTime(0,t+0.001,0.03);}
function xstick(t,v){if(useS('xstick')){playSmp('xstick',t,v);return;}noiseHit(t,v*0.6,'bandpass',3200,1.2,0.02);tone(t,v*0.5,1700,1550,0.025);}
function brushTap(t,v){noiseHit(t,v,'bandpass',2200,0.7,0.08);tone(t,v*0.25,185,170,0.035);}
function kick(t,v){if(useS('kick')){playSmp('kick',t,v);return;}tone(t,v,105,48,0.09);}
function click(t,accent){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=accent?2100:1500;
  g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.04);
  o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+0.05);
}
// upright-ish bass: pluck transient, slight pitch settle, woody body, natural decay
function bassNote(m,t,dur,v,dead){
  if(useB()){bassSmp(m,t,dur,v,dead);return;}
  const f=mtof(m);
  const o1=ctx.createOscillator();o1.type='sawtooth';
  const o2=ctx.createOscillator();o2.type='triangle';
  for(const o of [o1,o2]){o.frequency.setValueAtTime(f*1.012,t);o.frequency.exponentialRampToValueAtTime(f,t+0.04);}
  const g1=ctx.createGain();g1.gain.value=0.3;
  const flt=ctx.createBiquadFilter();flt.type='lowpass';flt.Q.value=0.9;
  flt.frequency.setValueAtTime(dead?700:2000,t);flt.frequency.setTargetAtTime(dead?250:420,t,dead?0.015:0.05);
  const body=ctx.createBiquadFilter();body.type='peaking';body.frequency.value=110;body.Q.value=1;body.gain.value=4;
  const g=ctx.createGain();
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.004);
  g.gain.setTargetAtTime(v*0.35,t+0.006,dead?0.025:0.3);g.gain.setTargetAtTime(0,t+dur,0.04);
  o1.connect(g1);g1.connect(flt);o2.connect(flt);flt.connect(body);body.connect(g);g.connect(busBs);
  o1.start(t);o2.start(t);o1.stop(t+dur+0.3);o2.stop(t+dur+0.3);
  // finger pluck click
  const n=ctx.createBufferSource();n.buffer=noiseBuf;
  const nf=ctx.createBiquadFilter();nf.type='bandpass';nf.frequency.value=1200;nf.Q.value=1.2;
  const ng=ctx.createGain();ng.gain.setValueAtTime(v*(dead?0.5:0.3),t);ng.gain.setTargetAtTime(0,t+0.001,0.008);
  n.connect(nf);nf.connect(ng);ng.connect(busBs);n.start(t,Math.random()*1.5);n.stop(t+0.08);
}
// electric piano: FM tine, brighter and barkier when played harder
function epNote(m,t,v,bus){
  const f=mtof(m),vn=Math.min(1.3,v/0.32);
  const car=ctx.createOscillator();car.frequency.value=f;
  const mod=ctx.createOscillator();mod.frequency.value=f;
  const mg=ctx.createGain();mg.gain.setValueAtTime(f*(0.4+1.5*vn*vn),t);mg.gain.setTargetAtTime(f*0.12,t,0.18);
  mod.connect(mg);mg.connect(car.frequency);
  const tine=ctx.createOscillator();tine.frequency.value=Math.min(f*7,9000);
  const tg=ctx.createGain();tg.gain.setValueAtTime(v*0.06*vn,t);tg.gain.setTargetAtTime(0,t,0.02);tine.connect(tg);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1500+2800*vn;lp.Q.value=0.3;
  const amp=ctx.createGain();
  amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(v,t+0.003);amp.gain.setTargetAtTime(v*0.3,t+0.004,1.2);
  car.connect(lp);lp.connect(amp);tg.connect(amp);amp.connect(bus);
  car.start(t);mod.start(t);tine.start(t);tine.stop(t+0.25);
  let done=false;
  const stopAt=st=>{if(done)return;done=true;car.stop(st);mod.stop(st);};
  return{
    releaseAt(rt){amp.gain.setTargetAtTime(0,rt,0.07);stopAt(rt+0.6);},
    releaseNow(){if(done)return;const n=ctx.currentTime;amp.gain.cancelScheduledValues(n);amp.gain.setValueAtTime(amp.gain.value,n);amp.gain.setTargetAtTime(0,n,0.08);stopAt(n+0.6);}
  };
}
