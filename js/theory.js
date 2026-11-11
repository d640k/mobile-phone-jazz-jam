// Music theory: chord symbols, chart parsing, walking bass, comping voicings and rhythms. No audio or DOM.
/*CORE-START*/
// ---------- Chord parsing ----------
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const acc=a=>a==='#'||a==='♯'?1:(a==='b'||a==='♭'?-1:0);
const KINDS={
  maj7:{arp:[0,4,7,11],guide:[4,11],comp:[4,11,2,7],scale:[0,2,4,5,7,9,11]},
  maj6:{arp:[0,4,7,9],guide:[4,9],comp:[4,9,2,7],scale:[0,2,4,5,7,9,11]},
  m7:{arp:[0,3,7,10],guide:[3,10],comp:[3,10,2,7],scale:[0,2,3,5,7,9,10]},
  m6:{arp:[0,3,7,9],guide:[3,9],comp:[3,9,2,7],scale:[0,2,3,5,7,9,11]},
  mmaj7:{arp:[0,3,7,11],guide:[3,11],comp:[3,11,2,7],scale:[0,2,3,5,7,9,11]},
  m7b5:{arp:[0,3,6,10],guide:[3,10],comp:[3,10,6,5],scale:[0,2,3,5,6,8,10]},
  dim:{arp:[0,3,6,9],guide:[3,9],comp:[0,3,6,9],scale:[0,2,3,5,6,8,9,11]},
  dom:{arp:[0,4,7,10],guide:[4,10],comp:[4,10,2,9],scale:[0,2,4,5,7,9,10]},
  sus:{arp:[0,5,7,10],guide:[5,10],comp:[5,10,2,9],scale:[0,2,4,5,7,9,10]},
  aug:{arp:[0,4,8,10],guide:[4,10],comp:[4,8,10,2],scale:[0,2,4,6,8,10]},
};
function classify(raw){
  const q=raw.replace(/[()\s]/g,'');
  let kind;
  if(/^[øØ]/.test(q)||/^(min|mi|m|-)(7|9|11)?b5/.test(q)) kind='m7b5';
  else if(/^(dim|o|°)/.test(q)) kind='dim';
  else if(/^(maj|Maj|MAJ|Δ|\^|M(?!in|i))/.test(q)) kind=/6/.test(q)?'maj6':'maj7';
  else if(/^(min|Min|mi|Mi|m|-)/.test(q)){
    const r=q.replace(/^(min|Min|mi|Mi|m|-)/,'');
    if(/^(maj|Maj|M|Δ|\^)/.test(r)) kind='mmaj7';
    else if(/6/.test(r)) kind='m6';
    else if(/7|9|11|13/.test(r)) kind='m7';
    else if(r==='') kind='m6';
    else return null;
  }
  else if(/sus/.test(q)) kind='sus';
  else if(/^(\+|aug)/.test(q)) kind='aug';
  else if(/6/.test(q)&&!/7/.test(q)) kind='maj6';
  else if(/^(add9|add2|2)$/.test(q)) kind='maj6';
  else if(/7|9|11|13|alt/.test(q)) kind='dom';
  else if(q===''||/^(add9|add2|2)$/.test(q)) kind='maj6';
  else return null;
  const k=KINDS[kind];
  const c={kind,arp:[...k.arp],guide:[...k.guide],comp:[...k.comp],scale:[...k.scale]};
  if(kind==='maj7'&&/#11/.test(q)) c.comp=[4,11,2,6];
  if(kind==='dom'){
    if(/alt/.test(q)){c.comp=[4,10,3,8];c.scale=[0,1,3,4,6,8,10];c.arp=[0,4,8,10];}
    else{
      const b9=/b9/.test(q),s9=/#9/.test(q),b13=/b13|#5|\+5/.test(q),s11=/#11/.test(q);
      if(b9){c.comp[2]=1;c.scale=[0,1,3,4,6,7,9,10];}
      if(s9){if(b9)c.comp[3]=3;else c.comp[2]=3;c.scale=[0,1,3,4,6,8,10];}
      if(b13){if(!(b9&&s9))c.comp[3]=8;if(!b9&&!s9)c.scale=[0,2,4,6,8,10];}
      if(/#5|\+5/.test(q))c.arp=[0,4,8,10];                  // #5 replaces the 5th
      else if(/b5/.test(q)){c.arp=[0,4,6,10];c.comp[3]=6;}   // b5 replaces the 5th
      if(s11&&!b13){c.comp[3]=6;c.scale=[0,2,4,6,7,9,10];}
    }
  }
  // Extensions/alterations written in (or implied by) the symbol, for the key dots.
  const has=re=>re.test(q),nat=n=>new RegExp('(^|[^b#])'+n+'(?!\\d)').test(q);
  const ext=[];
  if(has(/alt/))ext.push(1,3,6,8);
  if(has(/b9/))ext.push(1);
  if(has(/#9/))ext.push(3);
  // A 13 (or 11) implies the 9, unless it's written as an added note: 7(13), 7add13, m7(11).
  // Then the chord has no 9 at all, and the comping leaves it out too.
  const added=/\((?:add)?1[13]\)|add1[13]/.test(raw)&&!nat('9');
  if(added)c.noNine=true;
  if(nat('9')||has(/add[29]|^2$/)||((nat('11')||nat('13'))&&!has(/[b#]9|alt/)&&!added))ext.push(2);
  if(nat('11'))ext.push(5);
  if(has(/#11/))ext.push(6);
  if(nat('13'))ext.push(9);
  if(has(/b13/))ext.push(8);
  c.ext=[...new Set(ext)].filter(i=>!c.arp.includes(i));
  // A careful pianist plays the extension that's written: a written 13 (or a minor 11)
  // takes the place of the 5th in the comping voicing; a natural 11 on a dominant is a 9sus sound.
  if(kind==='maj7'||kind==='m7'){
    const i5=c.comp.indexOf(7);
    if(nat('13')&&i5>=0)c.comp[i5]=9;
    else if(kind==='m7'&&nat('11')&&i5>=0)c.comp[i5]=5;
    else if(kind==='maj7'&&nat('13'))c.comp=[...c.comp.filter(i=>i!==2),9];
  }
  if(kind==='dom'&&nat('11')&&!has(/#11|[b#]9|alt|b13|#5|b5/))c.comp=[5,10,2,9];
  return c;
}
// The chord's notes spelled from its root, the way they'd be written: chord tones low to high, then
// the extensions in the symbol. Gb7 → Gb Bb Db Fb. A double flat/sharp reads as its plain note.
// Each is {name, i (semitones above the root), tone: 'gt' guide | 'ct' chord tone | 'ex' extension}.
function chordToneNames(sym){
  const ch=parseChord(sym),r=/^([A-G])([#b♯♭]?)/.exec(sym||'');
  if(!ch||!r)return [];
  const L='CDEFGAB';
  const degArp={0:1,2:2,3:3,4:3,5:4,6:5,7:5,8:5,9:ch.kind==='dim'?7:6,10:7,11:7};
  const degExt={1:2,2:2,3:2,5:4,6:4,8:6,9:6};
  const spell=(letter,flat)=>{
    const li=L.indexOf(letter);let clean=true;
    const name=(i,deg)=>{
      const pc=(ch.root+i)%12,l=L[(li+deg-1)%7];
      let d=((pc-NOTE[l])%12+12)%12;if(d>6)d-=12;
      if(Math.abs(d)>1){clean=false;return (flat?ROOT_FLAT:ROOT_SHARP)[pc];}
      return l+(d<0?'\u266d':d>0?'\u266f':'');
    };
    const out=[...ch.arp].sort((a,b)=>a-b).map(i=>({name:name(i,degArp[i]),i,tone:ch.guide.includes(i)?'gt':'ct'}));
    for(const i of [...(ch.ext||[])].sort((a,b)=>a-b))out.push({name:name(i,degExt[i]),i,tone:'ex'});
    return {out,clean};
  };
  const flat=/[b♭]/.test(r[2])||(r[1]==='F'&&!r[2]);
  const a=spell(r[1],flat);if(a.clean||!r[2])return a.out;
  // Gbm7 would need a B double-flat: spell it as F#m7 instead, if that comes out clean
  const alt=(r[2].match(/[b♭]/)?ROOT_SHARP:ROOT_FLAT)[ch.root][0];
  const b=spell(alt,!flat);return b.clean?b.out:a.out;
}
const ROOT_FLAT=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const ROOT_SHARP=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function parseChord(sym){
  const r=/^([A-G])([#b♯♭]?)(.*)$/.exec(sym);
  if(!r) return null;
  const root=(NOTE[r[1]]+acc(r[2])+12)%12;
  let rest=r[3],bass=root;
  const sl=rest.lastIndexOf('/');
  if(sl>=0){
    const b=/^([A-G])([#b♯♭]?)$/.exec(rest.slice(sl+1));
    if(b){bass=(NOTE[b[1]]+acc(b[2])+12)%12;rest=rest.slice(0,sl);}
  }
  const q=classify(rest);
  if(!q) return null;
  return Object.assign({sym,root,bass},q);
}
// ---------- Chart parsing ----------
// Returns {bars:[[display tokens]], segs:[{chord,start,len}], segOfBeat:[], beats, errors}
// bpb = beats per bar (4, or 3 for a waltz)
const BAR_SPLITS={4:[[4],[2,2],[2,1,1],[1,1,1,1]],3:[[3],[2,1],[1,1,1]]};
// The chart text as raw bars: [{label, toks, rs, re, end}]. "[A]" labels attach to the next bar.
// Repeats are written as on paper: "|:" starts a repeat (rs), ":|" ends one (re), and "1." / "2."
// at the start of a bar begins that ending (end). Shared by parseChart and the chart editor, so
// bar indexes always agree.
function splitChart(text){
  const out=[];let label=null,rsNext=false;
  for(const part of text.replace(/\[([^\]]*)\]/g,'|\u00a7$1|').split(/[|\n]/)){
    const s=part.trim();if(!s)continue;
    if(s[0]==='\u00a7'){label=s.slice(1).trim()||null;continue;}
    const toks=s.split(/\s+/).filter(Boolean);let rs=false,re=false,end=null;
    if(toks[0][0]===':'){rs=true;toks[0]=toks[0].slice(1);if(!toks[0])toks.shift();}
    const L=toks.length-1;
    if(L>=0&&toks[L].endsWith(':')){re=true;toks[L]=toks[L].slice(0,-1);if(!toks[L])toks.pop();}
    if(toks.length&&/^[1-9]\.$/.test(toks[0])){end=+toks[0][0];toks.shift();}
    if(!toks.length){                       // a repeat sign with no chords: it belongs to a neighbour
      if(re&&out.length)out[out.length-1].re=true;
      if(rs)rsNext=true;
      continue;
    }
    out.push({label,toks,rs:rs||rsNext,re,end});label=null;rsNext=false;
  }
  return out;
}
// The order bars are played in, following repeats and endings (each repeat is played twice).
// reps: [{rs,re,end}] per bar; labels: section labels (an ending stops at a new section).
function playOrder(reps,labels=[]){
  const n=reps.length,order=[];
  // an ending runs to its ":|", or up to the next ending, repeat or section
  const regionEnd=i=>{let j=i;while(j<n-1&&!reps[j].re&&!reps[j+1].end&&!reps[j+1].rs&&!labels[j+1])j++;return j;};
  let i=0,start=0,pass=1,endPass=1,jumped=false,guard=0;
  while(i<n&&guard++<5000){
    const r=reps[i];
    if(r.rs&&!jumped){start=i;pass=1;endPass=1;}
    jumped=false;
    if(r.end&&r.end!==endPass){i=regionEnd(i)+1;continue;}
    order.push(i);
    if(r.re&&pass<2){pass++;endPass=pass;i=start;jumped=true;continue;}
    if(r.re){start=i+1;pass=1;}       // done; the endings after it still count as pass 2
    i++;
  }
  return order;
}
// Where each ending's bracket starts and how far it reaches, for drawing: [{num, first, last, closed}]
function endingMarks(reps,labels=[]){
  const n=reps.length,out=[];let len1=1;
  for(let i=0;i<n;i++){
    if(!reps[i].end)continue;
    let j=i;while(j<n-1&&!reps[j].re&&!reps[j+1].end&&!reps[j+1].rs&&!labels[j+1]&&(reps[i].end===1||j-i+1<len1))j++;
    if(reps[i].end===1)len1=j-i+1;
    for(let k=i;k<=j;k++)out[k]={num:reps[i].end,first:k===i,last:k===j,closed:k===j&&!!reps[j].re};
    i=j;
  }
  return out;
}
function parseChart(text,bpb=4){
  const errors=[];
  const raw=splitChart(text);
  const bars=[],segs=[],segOfBeat=[],labels=[],src=[],reps=[];
  let prevTokens=null,lastChord=null;
  for(let ri=0;ri<raw.length;ri++){
    const rb=raw[ri].toks.join(' ');
    let toks=[...raw[ri].toks];
    let display=toks;
    if(toks.length===1&&toks[0]==='%'){
      if(!prevTokens){errors.push('“%” with no bar before it');continue;}
      toks=prevTokens;display=['%'];
    }
    if(toks.length>bpb){errors.push(`Too many chords in bar: ${rb}`);toks=toks.slice(0,bpb);}
    const n=toks.length;
    const lens=BAR_SPLITS[bpb][n-1];
    const barStart=bars.length*bpb;
    let beat=barStart;
    toks.forEach((t,i)=>{
      if(t==='/'||t==='%'){
        if(!segs.length){errors.push('Chart starts with “/”');return;}
        segs[segs.length-1].len+=lens[i];
      }else{
        let ch=parseChord(t);
        if(!ch){errors.push(`Don't know “${t}”`);ch=lastChord;}
        if(!ch) return;
        lastChord=ch;
        segs.push({chord:ch,start:beat,len:lens[i]});
      }
      for(let j=0;j<lens[i];j++)segOfBeat[beat+j]=segs.length-1;
      beat+=lens[i];
    });
    if(segOfBeat[barStart]===undefined) continue;
    bars.push(display);labels.push(raw[ri].label);src.push(ri);   // src: index into splitChart()
    reps.push({rs:!!raw[ri].rs,re:!!raw[ri].re,end:raw[ri].end||null});
    prevTokens=toks;
  }
  // Lead-sheet display: the chords actually sounding in each bar (so % shows real chords).
  // A bar that only holds the previous chord is blank; a held chord before a change is dimmed.
  // The first bar of a section always names its chord (readers jump to sections).
  const symAt=b=>segs[segOfBeat[b]].chord.sym;
  for(let i=0;i<bars.length;i++){
    const d=[];let prev=null;
    for(let b=i*bpb;b<i*bpb+bpb;b++){const sy=symAt(b);if(sy!==prev){d.push({t:sy,dim:false,beat:b-i*bpb});prev=sy;}}
    d.forEach((x,j)=>{x.len=(j+1<d.length?d[j+1].beat:bpb)-x.beat;});
    // a repeat or an ending is jumped to: it always names its chord too
    const held=i>0&&!labels[i]&&!reps[i].rs&&!reps[i].end&&d[0].t===symAt(i*bpb-1);
    bars[i]=held?(d.length===1?[]:(d[0].dim=true,d)):d;
  }
  const song={bars,segs,segOfBeat,beats:bars.length*bpb,bpb,errors,labels,src,reps};
  // map: played bar -> written bar. Without repeats the song plays as written; with them,
  // song.played is the tune in playing order (what the band follows).
  const order=playOrder(reps,labels);
  if(order.length===bars.length&&order.every((b,k)=>b===k)){song.map=order;song.played=song;}
  else{song.map=bars.map((_,k)=>k);song.played=songFromBars(song,order);}
  song.endings=endingMarks(reps,labels);
  return song;
}
// ---------- Walking bass ----------
const BLO=31,BHI=52;
function nearest(pc,ref){
  let best=null;
  for(let m=BLO;m<=BHI;m++) if(m%12===pc&&(best===null||Math.abs(m-ref)<Math.abs(best-ref))) best=m;
  return best;
}
function wpick(items){ // [[value,weight]]
  const tot=items.reduce((a,b)=>a+b[1],0);
  let r=Math.random()*tot;
  for(const [v,w] of items){if((r-=w)<=0)return v;}
  return items[items.length-1][0];
}
function makeWalker(){return {prev:null,target:null};}
// Bass profile weights (rhythm-section profiles change these):
// chrom: chromatic approach into the next chord; fifth/step: other approaches;
// ct: preference for chord tones mid-bar; leap: chance of a wide leap (6th/octave) mid-bar.
const BASS_DEFAULT={chrom:3,fifth:1.2,step:1.5,ct:1,leap:0};
function bassForBeat(song,b,W,bp=BASS_DEFAULT){
  const si=song.segOfBeat[b],seg=song.segs[si];
  const p=b-seg.start,r=seg.len-p;
  const nseg=song.segs[(si+1)%song.segs.length];
  const prev=W.prev??40;
  let note;
  if(p===0){
    note=(W.target!=null&&W.target%12===seg.chord.bass)?W.target:nearest(seg.chord.bass,prev);
    W.target=null;
  }else{
    const tgt=nearest(nseg.chord.bass,prev);
    const ch=seg.chord;
    const inScale=m=>ch.scale.includes(((m-ch.root)%12+12)%12);
    const isCT=m=>ch.arp.includes(((m-ch.root)%12+12)%12);
    const ok=m=>m>=BLO&&m<=BHI&&m!==prev;
    if(r===1){
      const opts=[];
      [tgt-1,tgt+1].forEach(m=>ok(m)&&opts.push([m,bp.chrom]));
      const fifth=tgt+7<=BHI?tgt+7:tgt-5; if(ok(fifth)&&fifth%12!==prev%12)opts.push([fifth,bp.fifth]);
      [tgt-2,tgt+2].forEach(m=>ok(m)&&inScale(m)&&opts.push([m,bp.step]));
      note=opts.length?wpick(opts):tgt+1;
      W.target=tgt;
    }else if(bp.leap&&Math.random()<bp.leap){
      // wide leap to a chord tone a 6th to an octave away
      const c=[];for(let m=BLO;m<=BHI;m++){const d=Math.abs(m-prev);if(d>=8&&d<=12&&isCT(m))c.push([m,1]);}
      note=c.length?wpick(c):nearest(ch.root,prev);
    }else{
      let dir=tgt>prev?1:tgt<prev?-1:(Math.random()<.5?1:-1);
      if(Math.random()<0.15)dir=-dir;
      const cands=d=>{const c=[];for(let i=1;i<=5;i++){const m=prev+d*i;if(!ok(m)||!inScale(m))continue;if(r===2&&m===tgt)continue;c.push([m,isCT(m)?(p===2?6:3)*bp.ct:1]);}return c;};
      let c=cands(dir); if(!c.length)c=cands(-dir);
      note=c.length?wpick(c):nearest(ch.arp[1]!=null?(ch.root+ch.arp[2])%12:ch.root,prev);
    }
  }
  W.prev=note;
  return note;
}
// ---------- Comping voicings ----------
function perms(a){if(a.length<=1)return[a];const o=[];a.forEach((x,i)=>{for(const p of perms(a.slice(0,i).concat(a.slice(i+1))))o.push([x,...p]);});return o;}
// Voicing types: 'rootless' (default, 3-7 plus colours), 'quartal' (stacked 4ths from the
// chord scale, Herbie/McCoy-ish), 'monk' (guide tones plus a half-step rub).
function voicingCands(ch,type){
  // major chords stack from lydian (#11) so the natural 4th never lands on a maj7
  const sc=(ch.kind==='maj7'||ch.kind==='maj6'?ch.scale.map(i=>i===5?6:i):ch.scale).map(i=>(ch.root+i)%12);
  if(type==='quartal'){
    const out=[];
    for(const st of [ch.guide[0],ch.guide[1],2,ch.arp[2]]){
      for(let base=50;base<=62;base++){
        if(base%12!==(ch.root+st)%12)continue;
        const v=[base];
        while(v.length<4){const l=v[v.length-1];const n=sc.includes((l+5)%12)?l+5:sc.includes((l+6)%12)?l+6:null;if(n===null||v.some(x=>x%12===n%12))break;v.push(n);}
        if(v.length>=3&&v.some(n=>ch.guide.includes(((n-ch.root)%12+12)%12)))out.push(v);
      }
    }
    if(out.length)return out;
  }
  let pcs=[...new Set(ch.comp.map(i=>(ch.root+i)%12))];
  if(type==='monk'){
    const g=ch.guide.map(i=>(ch.root+i)%12);
    const alt=ch.arp.includes(8)||ch.comp.includes(1)||ch.comp.includes(3);
    const rub=ch.kind==='dom'&&alt?[1,8]:ch.kind==='dom'||ch.kind==='aug'?[6,7]:ch.kind==='maj7'||ch.kind==='maj6'?[11,12]:ch.kind==='m7b5'?[5,6]:ch.kind==='dim'?[2,3]:[2,3];
    pcs=[...new Set([...g,...rub.map(i=>(ch.root+i)%12)])];
  }
  const out=[];
  for(const p of perms(pcs)){
    for(let base=48;base<=62;base++){
      if(base%12!==p[0])continue;
      const v=[base];
      for(let i=1;i<p.length;i++){let n=v[i-1]+1;while(n%12!==p[i])n++;v.push(n);}
      if(v[v.length-1]>75||v[v.length-1]-base>14)continue;
      if(type!=='monk'&&v[1]-v[0]===1)v.penalty=4;
      out.push(v);
    }
  }
  return out;
}
// opts.center: target average pitch; opts.lowSecond: penalize 1-2 semitone gaps below this pitch
function voicingFor(ch,prev,type='rootless',opts={}){
  const center=opts.center??62;
  let best=null,bs=Infinity;
  for(const v of voicingCands(ch,type)){
    {
      let s=v.penalty||0;
      if(prev)for(let i=0;i<v.length;i++)s+=Math.abs(v[i]-prev[Math.min(i,prev.length-1)]);
      const avg=v.reduce((a,b)=>a+b,0)/v.length;
      s+=Math.abs(avg-center)*0.7;
      if(opts.lowSecond)for(let i=1;i<v.length;i++)if(v[i]-v[i-1]<=2&&v[i-1]<opts.lowSecond)s+=6;
      s+=Math.random()*0.6;
      if(s<bs){bs=s;best=v;}
    }
  }
  // a chord written without its 9 (7(13)): the 9 in the voicing becomes the root
  if(best&&ch.noNine){const r=((ch.root%12)+12)%12;best=[...new Set(best.map(m=>((m-r)%12+12)%12===2?m-2:m))].sort((a,b)=>a-b);}
  return best;
}
// Comping rhythm patterns: [eighth-note slot 0-7, length in eighths]
const COMP_PATTERNS=[
  [[0,2],[3,3]],[[1,1],[4,3]],[[3,2],[7,1]],[[0,1],[2,1],[5,2]],
  [[2,2],[5,1]],[[0,4]],[[1,2],[6,2]],[[3,4]],[[7,1]],[[0,2],[4,2]],[[2,1],[3,2],[7,1]]
];
// Which segment a hit at global eighth gs belongs to (offbeats before a change anticipate it)
function hitSeg(song,gs){
  const beat=Math.floor(gs/2)%song.beats;
  const si=song.segOfBeat[beat];
  if(gs%2===1){
    const nb=(beat+1)%song.beats, ns=song.segOfBeat[nb];
    if(ns!==si) return {si:ns,remain:1+song.segs[ns].len*2};
  }
  const seg=song.segs[si];
  return {si,remain:(seg.start+seg.len-beat)*2-(gs%2)};
}
function planCompBar(song,bar,busy){
  const plan=new Map();
  if(!busy&&Math.random()<0.08)return plan;
  const pool=busy&&Math.random()<0.5?COMP_PATTERNS.filter(p=>p.length>=2):COMP_PATTERNS;
  for(const [s,d] of pool[Math.floor(Math.random()*pool.length)])plan.set(s,d);
  const B=bar*4;
  const covered=new Set([...plan.keys()].map(s=>hitSeg(song,B*2+s).si));
  for(let b=B;b<B+4;b++){
    const si=song.segOfBeat[b];
    if(song.segs[si].start!==b||covered.has(si))continue;
    const st=(b-B)*2;
    if(st>0&&!plan.has(st-1)&&Math.random()<0.4)plan.set(st-1,3);else plan.set(st,2);
    covered.add(si);
  }
  return plan;
}
// A playable sub-song made of bars a..b (inclusive). It wraps to its own start, so the
// walking bass, fills and chorus count all treat it as the whole tune. Short loops are
// repeated until they fill at least minBars, so fills and dynamics happen once per
// 16-ish bars instead of every pass. loopLen = bars in one pass of the loop.
// src = the written song; a..b = positions in its playing order (src.played).
function sliceSong(src,a,b,minBars=16){
  const pl=src.played||src,list=pl.map.slice(a,b+1),n=list.length,reps=Math.max(1,Math.ceil(minBars/n));
  const all=[],pidx=[];for(let r=0;r<reps;r++)for(let k=a;k<=b;k++){all.push(pl.map[k]);pidx.push(k);}
  return Object.assign(songFromBars(src,all),{loopLen:n,pidx});   // pidx: played bar -> place in the whole tune's order
}
// A song made of written bars in the given order (repeats unrolled, or a loop).
// map: played bar -> written bar.
function songFromBars(src,list){
  const bpb=src.bpb,segs=[],segOfBeat=[];let last=-1,y=0;
  for(const wb of list)for(let x=wb*bpb;x<(wb+1)*bpb;x++,y++){
    const si=src.segOfBeat[x];
    if(si!==last){segs.push({chord:src.segs[si].chord,start:y,len:0});last=si;}
    segs[segs.length-1].len++;segOfBeat.push(segs.length-1);
  }
  return{bars:list.map(b=>src.bars[b]),segs,segOfBeat,beats:y,bpb,errors:[],map:[...list]};
}
/*CORE-END*/
