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
  if(nat('9')||has(/add[29]|^2$/)||((nat('11')||nat('13'))&&!has(/[b#]9|alt/)))ext.push(2);
  if(nat('11'))ext.push(5);
  if(has(/#11/))ext.push(6);
  if(nat('13'))ext.push(9);
  if(has(/b13/))ext.push(8);
  c.ext=[...new Set(ext)].filter(i=>!c.arp.includes(i));
  return c;
}
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
function parseChart(text){
  const errors=[];
  const clean=text.replace(/\[[^\]]*\]/g,' ');
  const rawBars=clean.split(/[|\n]/).map(s=>s.trim()).filter(s=>s.length);
  const bars=[],segs=[],segOfBeat=[];
  let prevTokens=null,lastChord=null;
  for(const rb of rawBars){
    let toks=rb.split(/\s+/).filter(Boolean);
    let display=toks;
    if(toks.length===1&&toks[0]==='%'){
      if(!prevTokens){errors.push('“%” with no bar before it');continue;}
      toks=prevTokens;display=['%'];
    }
    if(toks.length>4){errors.push(`Too many chords in bar: ${rb}`);toks=toks.slice(0,4);}
    const n=toks.length;
    const lens=n===1?[4]:n===2?[2,2]:n===3?[2,1,1]:[1,1,1,1];
    const barStart=bars.length*4;
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
    bars.push(display);
    prevTokens=toks;
  }
  // Lead-sheet display: the chords actually sounding in each bar (so % shows real chords).
  // A bar that only holds the previous chord is blank; a held chord before a change is dimmed.
  const symAt=b=>segs[segOfBeat[b]].chord.sym;
  for(let i=0;i<bars.length;i++){
    const d=[];let prev=null;
    for(let b=i*4;b<i*4+4;b++){const sy=symAt(b);if(sy!==prev){d.push({t:sy,dim:false});prev=sy;}}
    const held=i>0&&d[0].t===symAt(i*4-1);
    bars[i]=held?(d.length===1?[]:(d[0].dim=true,d)):d;
  }
  return {bars,segs,segOfBeat,beats:bars.length*4,errors};
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
function bassForBeat(song,b,W){
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
      [tgt-1,tgt+1].forEach(m=>ok(m)&&opts.push([m,3]));
      const fifth=tgt+7<=BHI?tgt+7:tgt-5; if(ok(fifth)&&fifth%12!==prev%12)opts.push([fifth,1.2]);
      [tgt-2,tgt+2].forEach(m=>ok(m)&&inScale(m)&&opts.push([m,1.5]));
      note=opts.length?wpick(opts):tgt+1;
      W.target=tgt;
    }else{
      let dir=tgt>prev?1:tgt<prev?-1:(Math.random()<.5?1:-1);
      if(Math.random()<0.15)dir=-dir;
      const cands=d=>{const c=[];for(let i=1;i<=5;i++){const m=prev+d*i;if(!ok(m)||!inScale(m))continue;if(r===2&&m===tgt)continue;c.push([m,isCT(m)?(p===2?6:3):1]);}return c;};
      let c=cands(dir); if(!c.length)c=cands(-dir);
      note=c.length?wpick(c):nearest(ch.arp[1]!=null?(ch.root+ch.arp[2])%12:ch.root,prev);
    }
  }
  W.prev=note;
  return note;
}
// ---------- Comping voicings ----------
function perms(a){if(a.length<=1)return[a];const o=[];a.forEach((x,i)=>{for(const p of perms(a.slice(0,i).concat(a.slice(i+1))))o.push([x,...p]);});return o;}
function voicingFor(ch,prev){
  const pcs=[...new Set(ch.comp.map(i=>(ch.root+i)%12))];
  let best=null,bs=Infinity;
  for(const p of perms(pcs)){
    for(let base=48;base<=62;base++){
      if(base%12!==p[0])continue;
      const v=[base];
      for(let i=1;i<p.length;i++){let n=v[i-1]+1;while(n%12!==p[i])n++;v.push(n);}
      const top=v[v.length-1];
      if(top>75||top-base>14)continue;
      let s=0;
      if(prev)for(let i=0;i<v.length;i++)s+=Math.abs(v[i]-prev[Math.min(i,prev.length-1)]);
      const avg=v.reduce((a,b)=>a+b,0)/v.length;
      s+=Math.abs(avg-62)*0.7;
      if(v[1]-v[0]===1)s+=4;
      s+=Math.random()*0.6;
      if(s<bs){bs=s;best=v;}
    }
  }
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
/*CORE-END*/
