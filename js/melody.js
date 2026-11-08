// ---------- Melody ----------
// Stored beside the chart, one string per bar: S.melody = {pickup:'C5e D5e', bars:['F5q D5e C5e A4h', ...]}.
// A note is a pitch (C4, Eb5, F#4) or r for a rest, then its length: w h q e s (whole .. sixteenth),
// then optional . (dotted), t (triplet), ~ (tied to the next note). "Bb4q." "re" "C5et" "G4h~"
// A chord joins pitches with +, low to high: "D4+F4+Bb4q".
// A second voice (its own rhythm, stems down) follows " & ": "F5e G5e A5e Bb5e C6h & A4h F4h".
const MEL_LEN={w:4,h:2,q:1,e:0.5,s:0.25};
const MEL_RE=/^(r|[A-G][#b]?\d(?:\+[A-G][#b]?\d)*)([whqes])(\.?)(t?)(~?)$/;
const PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function pitchMidi(p){const m=/^([A-G])([#b]?)(\d)$/.exec(p);return 12*(+m[3]+1)+PC[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);}
function melTok(t){
  const m=MEL_RE.exec(t);if(!m)return null;
  let b=MEL_LEN[m[2]];if(m[3])b*=1.5;if(m[4])b*=2/3;
  const p=m[1]==='r'?null:m[1],ps=p?p.split('+').sort((x,y)=>pitchMidi(x)-pitchMidi(y)):[],midis=ps.map(pitchMidi);
  // midi: the top note (the melody); midis: every note of a chord
  return {tok:t,p:p&&ps.join('+'),ps,midis,midi:p?midis[midis.length-1]:null,d:m[2],dot:!!m[3],tri:!!m[4],tie:!!m[5]&&!!p,beats:b};
}
// the token for a note with these pitches (sorted low to high), or a rest
function melJoin(ps,len){return (ps.length?[...new Set(ps)].sort((x,y)=>pitchMidi(x)-pitchMidi(y)).join('+'):'r')+len;}
// Rests that complete a bar after its last note (shown, never stored or played). Finish the
// current beat first (a sixteenth/eighth, or triplet eighths), then whole beats: a whole-bar rest
// for an empty bar, half rests on beats 1 and 3 in 4/4, otherwise quarters.
function fillRests(used,bpb){
  const out=[],eps=1e-6;let p=used;
  if(p>=bpb-eps)return out;
  const f=p-Math.floor(p+eps);
  if(f>eps){
    const k=Math.round(f*3);
    if(Math.abs(f-k/3)<1e-3&&k>0&&k<3){for(let j=k;j<3;j++)out.push('et');}
    else{const rem=1-f;if(Math.abs((rem*4)%2-1)<1e-3)out.push('s');if(rem>=0.5-eps)out.push('e');}
    p=Math.ceil(p-eps);
  }
  if(p<eps&&!out.length)return ['w'];
  while(p<bpb-eps){
    if(bpb===4&&p%2===0&&p+2<=bpb){out.push('h');p+=2;}
    else{out.push('q');p+=1;}
  }
  return out;
}
// the two voices of a bar's string, and back
function splitVoices(str){const i=(str||'').indexOf('&');return i<0?[(str||'').trim(),'']:[str.slice(0,i).trim(),str.slice(i+1).trim()];}
function joinVoices(v1,v2){v1=(v1||'').trim();v2=(v2||'').trim();return v2?(v1+' & '+v2).trim():v1;}
const melVoice2=str=>splitVoices(str)[1];
function melNotesV(str,v){return melNotesRaw(splitVoices(str)[v===2?1:0]);}
function melNotes(str){return melNotesRaw(splitVoices(str)[0]);}   // voice 1
function melNotesRaw(str){return (str||'').split(/\s+/).filter(Boolean).map(melTok).filter(Boolean);}
function melBeats(str){return melNotes(str).reduce((s,n)=>s+n.beats,0);}
// key signatures offered for notation, and how black keys are spelled in each
const NOTE_KEYS=['C','F','Bb','Eb','Ab','Db','G','D','A','E','B'];
const SHARP_KEYS=['G','D','A','E','B'];
function midiName(m,key){
  const names=SHARP_KEYS.includes(key)?['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']:['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  return names[((m%12)+12)%12]+(Math.floor(m/12)-1);
}
const melHas=()=>!!(S.melody.pickup||S.melody.bars.some(Boolean));
function melSave(){store.set('melody',S.melody);}
// keep one melody entry per chart bar
function melFit(n){const b=S.melody.bars;while(b.length<n)b.push('');if(b.length>n&&!b.slice(n).some(Boolean))b.length=n;}
function melGet(i){return i<0?S.melody.pickup:(S.melody.bars[i]||'');}
// A bar written as just "/" shows rhythm slashes (one per beat): no melody, keep time.
const isSlashBar=str=>(str||'').trim()==='/';
function melSet(i,str){histMark();if(!isSlashBar(str))str=(str||'').split(' ').filter(t=>t&&t!=='/').join(' ');if(i<0)S.melody.pickup=str;else{melFit(i+1);S.melody.bars[i]=str;}melSave();melTimeline=null;}
function melInsertBar(i){histMark();melFit(i);S.melody.bars.splice(i,0,'');melSave();melTimeline=null;}
function melDeleteBar(i){histMark();S.melody.bars.splice(i,1);melSave();melTimeline=null;}
const melCap=i=>i<0?curBpb():curBpb();   // a pickup can be up to a full bar long

// ---- playback timeline: ties merged, positions in beats from the start of bar 1 ----
let melTimeline=null;
function getTimeline(){
  if(melTimeline)return melTimeline;
  const bpb=curBpb(),out=[],hold={1:null,2:null};   // ties carry on per voice
  const push=(barIdx,list,base,v)=>{
    let at=0;
    list.forEach((n,ni)=>{
      const abs=base+at,h=hold[v];
      if(h&&n.p&&n.midis.join()===h.midis.join()){h.dur+=n.beats;if(!n.tie)hold[v]=null;}   // continues a tied note
      else{hold[v]=null;const e={abs,dur:n.beats,midi:n.midi,midis:n.midis,bar:barIdx,ni,start:at,voice:v};out.push(e);if(n.tie)hold[v]=e;}
      at+=n.beats;
    });
  };
  const pk=melNotes(S.melody.pickup),pb=pk.reduce((s,n)=>s+n.beats,0);
  push(-1,pk,-pb,1);
  S.melody.bars.forEach((s,i)=>{push(i,melNotesV(s,1),i*bpb,1);push(i,melNotesV(s,2),i*bpb,2);});
  out.sort((a,b)=>a.abs-b.abs||a.voice-b.voice);
  melTimeline={events:out,pickupBeats:pb,byBar:new Map()};
  for(const e of out){if(!melTimeline.byBar.has(e.bar))melTimeline.byBar.set(e.bar,[]);melTimeline.byBar.get(e.bar).push(e);}
  return melTimeline;
}
// scheduled melody note on the keyboard instrument (used for "Play the melody" and "Hear this bar")
function melVoice(m,t,dur,vel=82,bus=busKy){
  const k=S.keyInst;
  if((k==='piano'||k==='rhodes')&&keysReady(k)){
    const {src,g,d}=sampNote(k,m,vel,t,bus);
    const rt=t+dur;g.gain.setTargetAtTime(0,rt,d.rel);src.stop(rt+d.rel*10);return;
  }
  epNote(m,t,0.3*Math.pow(vel/100,1.2),bus).releaseAt(t+dur);
}
// Schedule the melody notes that start inside one eighth-note step.
// beatPos: position of the step in beats, relative to bar 1 of the chart (negative during the count-in);
// t: the step's time; odd steps start at the swung off-beat.
function scheduleMelodyStep(s,beatPos,bar,t,beatDur,sw,audible){
  const tl=getTimeline();
  const list=tl.byBar.get(bar);if(!list)return;
  const barStart=bar<0?-tl.pickupBeats:bar*curBpb();
  const within=beatPos-barStart,beatStart=s%2?t-sw*beatDur:t,beat0=Math.floor(within+1e-6);
  for(const e of list){
    if(e.start<within-1e-6||e.start>=within+0.5-1e-6)continue;
    const fb=e.start-beat0,tt=beatStart+(Math.abs(fb-0.5)<1e-3?sw:fb)*beatDur;
    if(audible)for(const m of e.midis)melVoice(m,tt,Math.max(0.08,e.dur*beatDur*0.92),e.voice===2?60:m===e.midi?82:64);
    P.uiQ.push({t:tt,mel:e});
  }
}

// ---------- Recording a take ----------
// While recording, every key you play is timestamped; beat marks from the scheduler map time to bars.
// Stop -> the take is lined up to the beat and written into those bars (Keep / Try again / Discard).
const REC={on:false,review:false,notes:[],marks:[],from:0,to:0,backup:null,snap:true,held:new Map()};
function recNoteOn(m){if(!REC.on||!ctx)return;const n={m,t:ctx.currentTime,off:null};REC.notes.push(n);REC.held.set(m,n);}
function recNoteOff(m){if(!REC.on||!ctx)return;const n=REC.held.get(m);if(n){n.off=ctx.currentTime;REC.held.delete(m);}}
function recMark(t,bar,beat,beatDur,sw){if(REC.on)REC.marks.push({t,bar,beat,beatDur,sw});}
// time -> {bar, beat (fractional, in that bar)}
function recWhere(x){
  const M=REC.marks;if(!M.length)return null;
  let i=0;while(i+1<M.length&&M[i+1].t<=x)i++;
  const k=M[i];return {bar:k.bar,beat:k.beat+(x-k.t)/k.beatDur,sw:k.sw};
}
// snap a beat fraction (0..1) to the grid: swung eighths, or for "as played" 16ths and triplets too
// Snap: the beat or the swung off-beat (written as a plain eighth). As played: 16ths and triplets.
function recSnap(f,sw,fine){
  const c=fine?[0,0.25,1/3,0.5,2/3,0.75,1]:[0,sw,1];
  let best=0,bd=9;for(const x of c){const d=Math.abs(f-x);if(d<bd){bd=d;best=x;}}
  return !fine&&best===sw?0.5:best;
}
// Build bar strings from the recorded notes for bars REC.from..REC.to.
function recTranscribe(fine){
  const bpb=curBpb(),from=REC.from,to=REC.to,slots=new Map();   // per bar: per beat: {tri, cells[]}
  const beatInfo=(bar,beat)=>{const k=bar+':'+beat;if(!slots.has(k))slots.set(k,{tri:false,cells:new Map()});return slots.get(k);};
  // onsets
  const ons=[];
  for(const n of REC.notes){
    const w=recWhere(n.t);if(!w)continue;
    let bar=w.bar,beat=Math.floor(w.beat),f=recSnap(w.beat-beat,w.sw,fine);
    if(f>=1){f=0;beat++;}if(beat>=bpb){beat-=bpb;bar++;}
    if(bar<from||bar>to)continue;
    const off=n.off!=null?recWhere(n.off):null;
    ons.push({bar,beat,f,m:n.m,end:off?(off.bar-bar)*bpb+off.beat:null});
    if(Math.abs(f-1/3)<1e-6||Math.abs(f-2/3)<1e-6)beatInfo(bar,beat).tri=true;
  }
  ons.sort((a,b)=>(a.bar-b.bar)||(a.beat-b.beat)||(a.f-b.f));
  // one note per slot (the highest if you played a chord)
  const pos=o=>o.bar*bpb+o.beat+o.f;
  const uniq=[];for(const o of ons){const u=uniq[uniq.length-1];if(u&&Math.abs(pos(u)-pos(o))<1e-6){if(o.m>u.m)uniq[uniq.length-1]=o;}else uniq.push(o);}
  // each note lasts until the next one, or until you let go (then a rest)
  const total=(to+1)*bpb;
  const segs=[];   // {a,b,m} in absolute beats
  uniq.forEach((o,i)=>{
    const a=pos(o),next=i+1<uniq.length?pos(uniq[i+1]):total;
    let b=next;
    if(o.end!=null){const rel=o.bar*bpb+o.end;const gap=next-rel;if(gap>=0.5-1e-6)b=Math.max(a+0.25,Math.round(rel*4)/4);}
    segs.push({a,b:Math.min(b,next),m:o.m});
  });
  // write each bar: walk beat by beat, emitting notes, ties and rests
  const key=S.keySig,out=[];
  for(let bar=from;bar<=to;bar++){
    const toks=[];
    for(let beat=0;beat<bpb;beat++){
      const A=bar*bpb+beat,tri=(slots.get(bar+':'+beat)||{}).tri;
      const unit=tri?1/3:(fine?0.25:0.5),n=Math.round(1/unit);
      // which segment covers each slot of this beat
      const cells=[];for(let k=0;k<n;k++){const x=A+k*unit+1e-6;const sg=segs.find(s=>s.a<=x&&s.b>x);cells.push(sg||null);}
      let k=0;
      while(k<n){
        const sg=cells[k];let j=k+1;while(j<n&&cells[j]===sg)j++;
        const len=(j-k)*unit,startsHere=sg&&Math.abs(sg.a-(A+k*unit))<1e-6;
        const continues=sg&&!startsHere;
        toks.push({len,sg,cont:continues,tri});
        k=j;
      }
    }
    // merge whole beats of the same held note (e.g. q + q -> h) and write tokens
    const isInt=x=>Math.abs(x-Math.round(x))<1e-6;
    const merged=[];
    for(const t of toks){
      const p=merged[merged.length-1];
      if(p&&!t.tri&&!p.tri&&t.sg&&t.sg===p.sg&&t.cont&&isInt(p.at)&&isInt(p.at+p.len)){p.len+=t.len;continue;}
      if(p&&!t.tri&&!p.tri&&!t.sg&&!p.sg&&isInt(p.at)&&isInt(p.at+p.len)){p.len+=t.len;continue;}
      merged.push({...t,at:merged.reduce((s,x)=>s+x.len,0)});
    }
    const strs=[];
    merged.forEach((t,i)=>{
      const nextT=merged[i+1];
      const tieOut=t.sg&&((nextT&&nextT.sg===t.sg&&nextT.cont)||(!nextT&&t.sg.b>(bar+1)*bpb+1e-6));
      const name=t.sg?midiName(t.sg.m,key):'r';
      for(const [L,tk] of melPieces(t.len,t.tri)){strs.push(name+tk+(t.sg?'~':''));}
      // only the last piece keeps the tie if the note goes on; inner pieces always tie
      if(t.sg&&!tieOut)strs[strs.length-1]=strs[strs.length-1].replace(/~$/,'');
    });
    out.push(strs.join(' '));
  }
  return out;
}
// split a length (beats) into note values
function melPieces(len,tri){
  if(tri){const n=Math.round(len*3),r=[];let k=n;while(k>=2){r.push([2/3,'qt']);k-=2;}if(k)r.push([1/3,'et']);return r;}
  const vals=[[4,'w'],[3,'h.'],[2,'h'],[1.5,'q.'],[1,'q'],[0.75,'e.'],[0.5,'e'],[0.25,'s']],r=[];
  let left=len;
  while(left>1e-6){const v=vals.find(([b])=>b<=left+1e-6);if(!v)break;r.push(v);left-=v[0];}
  return r;
}
