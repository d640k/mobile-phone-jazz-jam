// Sampled instruments: drums, bass, keyboard (piano/Rhodes), and the synthesized B3 organ.
// ---------- Drum samples (Virtuosity Drums, CC0; see drums/README.md) ----------
// files: name -> peak dB of that layer. Velocity picks the closest-sounding layer, then fine-tunes its gain.
const SMP_DEF={
  ride:{K:0.91,trim:-10,files:{"ride_v1_1":-19.4,"ride_v1_2":-19.2,"ride_v1_3":-17.5,"ride_v2_1":-3.9,"ride_v2_2":-7.9,"ride_v2_3":-6.6,"ride_v3_1":-2.3,"ride_v3_2":-1.0,"ride_v3_3":-2.0}},
  kick:{K:0.79,trim:-8,files:{"kick_v1_1":-24.4,"kick_v1_2":-22.8,"kick_v2_1":-13.4,"kick_v2_2":-13.6,"kick_v3_1":-1.4,"kick_v3_2":-1.0}},
  snare:{K:1.0,trim:-9,files:{"snare_1":-25.3,"snare_2":-18.9,"snare_3":-12.6,"snare_4":-8.1,"snare_5":-1.0}},
  hat:{K:0.95,trim:-18,files:{"hat_v1_1":-8.4,"hat_v1_2":-8.4,"hat_v2_1":-1.0,"hat_v2_2":-1.9}},
  crash:{K:1.67,trim:-12,files:{"crash_v2":-10.7,"crash_v3":-1.0}},
  chh:{K:1.6,trim:-18,files:{"chh_v1_1":-16.5,"chh_v1_2":-13.3,"chh_v2_1":-3.4,"chh_v2_2":-3.9,"chh_v3_1":-2.0,"chh_v3_2":-1.0}},
  xstick:{K:1.11,trim:-14,files:{"xstick_1":-20.6,"xstick_2":-9.3,"xstick_3":-1.0}}
};
const SMP={},SMP_OUT={};const SG=2.8;
function useS(inst){return S.samples&&SMP[inst]&&SMP[inst].length>0;}
function onsetOf(buf){
  const d=buf.getChannelData(0),n=Math.min(d.length,Math.floor(buf.sampleRate*0.2));
  let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(d[i]));
  for(let i=0;i<n;i++)if(Math.abs(d[i])>pk*0.02)return Math.max(0,i/buf.sampleRate-0.0005);
  return 0;
}
function loadSamples(){
  for(const [inst,d] of Object.entries(SMP_DEF)){
    SMP[inst]=[];
    for(const [name,db] of Object.entries(d.files)){
      fetch('drums/'+name+'.mp3').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();})
        .then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no)))
        .then(buf=>{SMP[inst].push({buf,db,off:onsetOf(buf)});})
        .catch(()=>{}); // missing or undecodable: that piece keeps its synth sound
    }
  }
}
function playSmp(inst,t,v){
  const d=SMP_DEF[inst],tgt=20*Math.log10(Math.max(1e-4,v*d.K));
  let best=null,bd=1e9;
  for(const s of SMP[inst]){const dd=Math.abs(s.db-tgt)+Math.random()*1.5;if(dd<bd){bd=dd;best=s;}}
  const g=Math.min(2,Math.max(0.3,Math.pow(10,(tgt-best.db)/20)))*Math.pow(10,d.trim/20)*SG;
  const src=ctx.createBufferSource();src.buffer=best.buf;
  const gn=ctx.createGain();gn.gain.value=g;
  src.connect(gn);gn.connect(SMP_OUT[inst]);src.start(t,best.off);
}

// ---------- Bass samples ----------
// room:   VSCO 2 CE solo contrabass pizzicato (CC0; bass/README.md), recorded with room sound
// studio: MusyngKite SoundFont acoustic bass (CC BY-SA 3.0; bass2/README.md), dry and even
// def: MIDI note -> [[file, measured tuning offset in cents], ...]
const BASS_SETS={
  room:{dir:'bass',gain:7,def:{"28":[["bass_28_1",-4],["bass_28_2",2]],"30":[["bass_30_1",-10],["bass_30_2",-8]],"31":[["bass_31_1",-12],["bass_31_2",-15]],"34":[["bass_34_1",-1],["bass_34_2",0]],"36":[["bass_36_1",-11],["bass_36_2",-8]],"38":[["bass_38_1",4],["bass_38_2",-2]],"40":[["bass_40_1",-1],["bass_40_2",12]],"42":[["bass_42_1",-14],["bass_42_2",-13]],"44":[["bass_44_1",-22],["bass_44_2",-12]],"45":[["bass_45_1",31],["bass_45_2",27]],"49":[["bass_49_1",3],["bass_49_2",6]],"52":[["bass_52_1",1],["bass_52_2",-1]],"56":[["bass_56_1",-6],["bass_56_2",1]]}},
  studio:{dir:'bass2',gain:6.6,def:{"28":[["mk_28",5]],"29":[["mk_29",5]],"30":[["mk_30",6]],"31":[["mk_31",6]],"32":[["mk_32",6]],"33":[["mk_33",6]],"34":[["mk_34",12]],"35":[["mk_35",11]],"36":[["mk_36",11]],"37":[["mk_37",3]],"38":[["mk_38",3]],"39":[["mk_39",3]],"40":[["mk_40",3]],"41":[["mk_41",-1]],"42":[["mk_42",-1]],"43":[["mk_43",-1]],"44":[["mk_44",-7]],"45":[["mk_45",-6]],"46":[["mk_46",-6]],"47":[["mk_47",-6]],"48":[["mk_48",4]],"49":[["mk_49",4]],"50":[["mk_50",4]],"51":[["mk_51",-8]],"52":[["mk_52",-7]],"53":[["mk_53",-7]],"54":[["mk_54",-6]],"55":[["mk_55",-6]],"56":[["mk_56",-5]]}},
};
const BASS={};
function bassReady(k){const B=BASS[k];return !!B&&B.loaded===B.total;}
function useB(){return bassReady(S.bassSound);}
function loadBass(k){
  if(!BASS_SETS[k]||BASS[k])return;
  const set=BASS_SETS[k],B=BASS[k]={map:{},loaded:0,total:Object.values(set.def).reduce((a,v)=>a+v.length,0)};
  for(const [m,files] of Object.entries(set.def)){
    B.map[m]=[];
    for(const [name,c] of files){
      fetch(set.dir+'/'+name+'.mp3').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();})
        .then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no)))
        .then(buf=>{B.map[m].push({buf,c,off:onsetOf(buf)});B.loaded++;})
        .catch(()=>{}); // if any file is missing, the synth bass is used
    }
  }
}
function bassSmp(m,t,dur,v,dead){
  const B=BASS[S.bassSound],set=BASS_SETS[S.bassSound];
  let best=null,bd=99;
  for(const k in B.map){const d=Math.abs(m-k)+(+k>m?0.1:0);if(d<bd&&B.map[k].length){bd=d;best=+k;}}
  const arr=B.map[best],s=arr[Math.floor(Math.random()*arr.length)];
  const src=ctx.createBufferSource();src.buffer=s.buf;
  src.playbackRate.value=Math.pow(2,(m-best-s.c/100)/12);
  const g=ctx.createGain();
  g.gain.setValueAtTime(v*set.gain,t);g.gain.setTargetAtTime(0,t+dur,dead?0.012:0.05); // damp when the next note comes
  let node=src;
  if(dead){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=500;src.connect(f);node=f;}
  node.connect(g);g.connect(busBs);
  src.start(t,s.off);src.stop(t+dur+0.4);
}

// ---------- Keyboard instruments (what you play) ----------
// Sampled: Salamander Grand Piano (CC BY 3.0) and jRhodes3d (CC BY-NC 4.0); see keys/README.md.
// notes: MIDI -> loudness correction in dB (evens out the recordings)
const KEYS_DEF={
  piano:{rel:0.09,gain:1.35,notes:{"21":-2.3,"24":-1.2,"27":-1.7,"30":-1.4,"33":-0.1,"36":-0.6,"39":-1.0,"42":-1.6,"45":-0.6,"48":-1.4,"51":-1.8,"54":3.2,"57":3.5,"60":-4.1,"63":-0.5,"66":-1.7,"69":0.1,"72":4.4,"75":1.7,"78":-1.7,"81":1.3,"84":-0.0,"87":0.2,"90":2.0,"93":4.0,"96":2.5,"99":8.0,"102":6.4,"105":4.8,"108":7.7}},
  rhodes:{rel:0.06,gain:0.53,notes:{"29":-0.3,"35":-1.1,"40":-0.5,"45":0.2,"50":-0.4,"55":0.4,"59":1.6,"62":0.3,"65":-2.4,"71":-0.1,"76":-1.6,"81":3.6,"86":1.6,"91":4.6,"96":8.0}},
};
const KEYS={};
function keysReady(inst){const K=KEYS[inst];return !!K&&K.loaded===K.total;}
function loadKeys(inst){
  if(!KEYS_DEF[inst]||KEYS[inst])return;
  const d=KEYS_DEF[inst],K=KEYS[inst]={map:{},loaded:0,total:Object.keys(d.notes).length};
  for(const [m,db] of Object.entries(d.notes)){
    fetch('keys/'+inst+'_'+m+'.mp3').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();})
      .then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no)))
      .then(buf=>{K.map[m]={buf,off:onsetOf(buf),g:Math.pow(10,db/20)};K.loaded++;updateKeysLabel();})
      .catch(()=>{});
  }
}
const velGain=vel=>Math.pow(vel/100,1.6);   // MIDI velocity -> gain (touch = 100 = unity)
// One sampled note: nearest recording, pitch-shifted; softer = quieter and darker.
function sampNote(inst,m,vel,t,bus,trim=1){
  const K=KEYS[inst],d=KEYS_DEF[inst];
  let best=null,bd=99;for(const k in K.map){const dd=Math.abs(m-k);if(dd<bd){bd=dd;best=+k;}}
  const s=K.map[best];
  const src=ctx.createBufferSource();src.buffer=s.buf;src.playbackRate.value=Math.pow(2,(m-best)/12);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,1200*Math.pow(2,vel/127*4));
  const g=ctx.createGain();g.gain.value=s.g*d.gain*velGain(vel)*trim;src.connect(lp);lp.connect(g);g.connect(bus);src.start(t,s.off);
  return{src,g,d};
}
// Comping voice (scheduled): sampled Rhodes/piano when chosen and loaded, else the synth EP.
// v is on the synth-EP scale (0.32 = a normal touch).
const COMP_TRIM={rhodes:1.45,piano:1.17};  // level-matched to the synth EP comping
function compNote(m,t,v){
  const k=S.compInst;
  if((k==='rhodes'||k==='piano')&&keysReady(k)){
    const {src,g,d}=sampNote(k,m,Math.max(1,Math.min(127,v/0.32*100)),t,busCp,COMP_TRIM[k]);
    return{releaseAt(rt){g.gain.setTargetAtTime(0,rt,d.rel);src.stop(rt+d.rel*10);}};
  }
  return epNote(m,t,v,busCp);
}
function sampVoice(inst,m,vel=100){
  const t=ctx.currentTime,{src,g,d}=sampNote(inst,m,vel,t,busKy);
  let done=false;
  return{releaseNow(){if(done)return;done=true;const n=ctx.currentTime;g.gain.cancelScheduledValues(n);g.gain.setValueAtTime(g.gain.value,n);g.gain.setTargetAtTime(0,n,d.rel);src.stop(n+d.rel*10);}};
}
// Hammond-style organ: drawbars 888000000, 3rd-harmonic percussion (single trigger), key click,
// mild tube drive and a two-rotor Leslie.
const DRAWBARS=[[0.5,8],[1,8],[1.5,8]];   // [harmonic ratio, drawbar 0-8]: 16', 8', 5 1/3'
const ORG={held:0};
function initOrgan(){
  ORG.in=ctx.createGain();ORG.in.gain.value=1;
  const pre=ctx.createGain();pre.gain.value=1.6;
  const drive=ctx.createWaveShaper();const n=1024,c=new Float32Array(n);
  for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(1.6*x)/Math.tanh(1.6);}drive.curve=c;
  const post=ctx.createGain();post.gain.value=0.9;
  ORG.in.connect(pre);pre.connect(drive);drive.connect(post);
  const merger=ctx.createChannelMerger(2);merger.connect(busKy);
  const rotor=(type,dDepth,aDepth,speeds,gain)=>{
    const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=800;post.connect(f);
    const lfo=ctx.createOscillator();lfo.frequency.value=speeds[0];lfo.start();
    const mk=(sign)=>{
      const dl=ctx.createDelay(0.02);dl.delayTime.value=0.004;
      const dm=ctx.createGain();dm.gain.value=sign*dDepth;lfo.connect(dm);dm.connect(dl.delayTime);
      const a=ctx.createGain();a.gain.value=(1-aDepth)*gain;
      const am=ctx.createGain();am.gain.value=sign*aDepth*gain;lfo.connect(am);am.connect(a.gain);
      f.connect(dl);dl.connect(a);return a;
    };
    mk(1).connect(merger,0,0);mk(-1).connect(merger,0,1);
    return{lfo,speeds};
  };
  ORG.horn=rotor('highpass',0.00035,0.35,[0.83,6.7],1);
  ORG.drum=rotor('lowpass',0.00015,0.12,[0.67,5.8],1);
  setLeslie(S.leslieFast);
}
function setLeslie(fast){
  if(!ORG.horn)return;const n=ctx.currentTime;
  ORG.horn.lfo.frequency.setTargetAtTime(ORG.horn.speeds[fast?1:0],n,fast?0.35:0.6);   // horn spins up fast
  ORG.drum.lfo.frequency.setTargetAtTime(ORG.drum.speeds[fast?1:0],n,fast?1.2:1.6);    // drum is heavier
}
function organVoice(m){
  const t=ctx.currentTime,f=mtof(m),out=ctx.createGain();out.connect(ORG.in);
  const oscs=[];
  for(const [r,lvl] of DRAWBARS){
    if(!lvl||f*r>11000)continue;
    const o=ctx.createOscillator();o.frequency.value=f*r;
    const g=ctx.createGain();g.gain.value=Math.pow(10,(lvl-8)*3/20)*0.07;
    o.connect(g);g.connect(out);o.start(t);oscs.push(o);
  }
  out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(1,t+0.004);
  if(ORG.held===0&&f*3<11000){       // percussion only when no other key is held (like a real B3)
    const o=ctx.createOscillator();o.frequency.value=f*3;
    const g=ctx.createGain();g.gain.setValueAtTime(0.09,t);g.gain.setTargetAtTime(0,t,0.09);
    o.connect(g);g.connect(out);o.start(t);o.stop(t+0.9);
  }
  const kc=ctx.createBufferSource();kc.buffer=noiseBuf;
  const kf=ctx.createBiquadFilter();kf.type='bandpass';kf.frequency.value=2800;kf.Q.value=0.8;
  const kg=ctx.createGain();kg.gain.setValueAtTime(0.05,t);kg.gain.setTargetAtTime(0,t,0.003);
  kc.connect(kf);kf.connect(kg);kg.connect(out);kc.start(t,Math.random());kc.stop(t+0.03);
  ORG.held++;
  let done=false;
  return{releaseNow(){
    if(done)return;done=true;ORG.held=Math.max(0,ORG.held-1);
    const n=ctx.currentTime;out.gain.cancelScheduledValues(n);out.gain.setValueAtTime(out.gain.value,n);out.gain.linearRampToValueAtTime(0,n+0.012);
    oscs.forEach(o=>o.stop(n+0.05));
  }};
}
function keyVoice(m,vel=100){
  const k=S.keyInst;
  if(k==='organ'&&ORG.in)return organVoice(m);          // organs ignore velocity
  if((k==='piano'||k==='rhodes')&&keysReady(k))return sampVoice(k,m,vel);
  return epNote(m,ctx.currentTime,0.32*Math.pow(vel/100,1.2),busKy);   // synth EP (also the fallback while samples load)
}
function updateKeysLabel(){
  const k=S.keyInst,loading=(k==='piano'||k==='rhodes')&&ctx&&!keysReady(k);
  $('keyInst').title=loading?'Loading samples…':'';
  $('leslieBtn').hidden=k!=='organ';
}
