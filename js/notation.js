// ---------- Staff notation (VexFlow, loaded on first use) ----------
// Each line of the chart gets one SVG staff under its chord buttons. Bar widths come from the
// notation's minimum width (or the chords', whichever is wider), then lines are justified.
const NOT={vf:null,loading:null,els:new Map(),hits:new Map(),cur:null};   // hits: bar -> [{ni, x, y, v}] note centres (px in the line), voice
function notationScale(){return document.body.classList.contains('wide')?0.85:document.body.classList.contains('short')?0.6:0.7;}
const STAFF_UNITS=100,STAFF_TOP=30;   // VexFlow units: staff lines at 30..70, room for ledger lines and stems
function loadNotation(){
  if(NOT.vf)return Promise.resolve(NOT.vf);
  if(!NOT.loading)NOT.loading=new Promise((res,rej)=>{
    const s=document.createElement('script');s.src='vendor/vexflow/vexflow-bravura.js?v='+APP_V;
    s.onload=()=>{NOT.vf=window.Vex&&window.Vex.Flow;NOT.vf?res(NOT.vf):rej(new Error('VexFlow missing'));};
    s.onerror=()=>{NOT.loading=null;rej(new Error('Couldn’t load the notation library'));};
    document.head.appendChild(s);
  });
  return NOT.loading;
}
const VF_DUR={w:'w',h:'h',q:'q',e:'8',s:'16'};
const vfKey=p=>p[0].toLowerCase()+p.slice(1,-1)+'/'+p.slice(-1);
// VexFlow notes for one voice. dir: 0 = stems by pitch (one voice), 1 = up (voice 1), -1 = down (voice 2).
// fill: complete the bar with filler rests (not for a pickup).
function vfVoice(list,fill,dir){
  const VF=NOT.vf,ns=[...list],notes=[],tuplets=[],meta=[];
  if(fill){const used=ns.reduce((s,n)=>s+n.beats,0);for(const d of fillRests(used,curBpb())){const r=melTok('r'+d);r.filler=true;ns.push(r);}}
  let tri=[],triBeats=0,at=0;
  const flush=()=>{if(tri.length>1)tuplets.push(new VF.Tuplet(tri,{num_notes:3,notes_occupied:2,location:dir>0?VF.Tuplet.LOCATION_TOP:VF.Tuplet.LOCATION_BOTTOM}));tri=[];triBeats=0;};
  ns.forEach((n,ni)=>{
    const whole=!n.p&&n.d==='w'&&ns.length===1;   // a whole-bar rest sits in the middle of the bar
    // with two voices, rests move up (voice 1) or down (voice 2) out of each other's way
    const restKey=dir>0?(whole?'f/5':'d/5'):dir<0?(whole?'d/4':'f/4'):(whole?'d/5':'b/4');
    const opts={keys:n.p?n.ps.map(vfKey):[restKey],duration:VF_DUR[n.d]+(n.p?'':'r'),dots:n.dot?1:0,align_center:whole};
    if(dir){opts.stem_direction=dir;opts.auto_stem=false;}else opts.auto_stem=true;
    const sn=new VF.StaveNote(opts);
    if(n.dot)VF.Dot.buildAndAttach([sn],{all:true});
    notes.push(sn);meta.push({n,start:at,ni,filler:!!n.filler});at+=n.beats;
    if(n.tri){tri.push(sn);triBeats+=n.beats;if(Math.abs(triBeats-Math.round(triBeats))<1e-6&&triBeats>0)flush();}
    else flush();
  });
  flush();
  const voice=new VF.Voice({num_beats:curBpb(),beat_value:4}).setMode(VF.Voice.Mode.SOFT);
  if(notes.length)voice.addTickables(notes);
  return {notes,voice,tuplets,meta,dir};
}
// VexFlow voices for one bar's melody string: one voice, or two (stems up / down)
function vfBar(str,fill=true){
  const VF=NOT.vf;
  if(isSlashBar(str)){   // rhythm slashes: one slash per beat on the middle line, no stems
    const notes=[],meta=[];
    for(let k=0;k<curBpb();k++){
      const sn=new VF.StaveNote({keys:['b/4'],duration:'q',type:'s'});
      if(sn.setStemStyle)sn.setStemStyle({strokeStyle:'transparent',fillStyle:'transparent'});
      notes.push(sn);meta.push({n:{beats:1,d:'q',p:null},start:k,ni:k,filler:true,slash:true});
    }
    const voice=new VF.Voice({num_beats:curBpb(),beat_value:4}).setMode(VF.Voice.Mode.SOFT);voice.addTickables(notes);
    return {voices:[{notes,voice,tuplets:[],meta,dir:0,v:1}]};
  }
  const two=melNotesV(str,2).length>0;
  const voices=[Object.assign(vfVoice(melNotesV(str,1),fill,two?1:0),{v:1})];
  if(two)voices.push(Object.assign(vfVoice(melNotesV(str,2),fill,-1),{v:2}));
  const live=voices.filter(x=>x.notes.length).map(x=>x.voice);
  if(live.length)VF.Accidental.applyAccidentals(live,S.keySig);
  return {voices};
}
// Beaming, lead-sheet style: in 4/4 eighths beam by half bar (beats 1-2, 3-4), never across the
// middle; any half bar with sixteenths or triplets beams beat by beat; in 3/4 the bar beams as one.
// Rests and notes longer than an eighth break a beam. Returns groups of note indices.
function beamGroups(ns,starts){
  const bpb=curBpb(),win=bpb===4?2:bpb,out=[];
  const beamable=n=>n.p&&(n.d==='e'||n.d==='s');
  const windows=new Map();
  ns.forEach((n,i)=>{const w=Math.floor(starts[i]/win+1e-6);if(!windows.has(w))windows.set(w,[]);windows.get(w).push(i);});
  for(const idx of windows.values()){
    const fine=idx.some(i=>ns[i].d==='s'||ns[i].tri);
    const parts=new Map();
    for(const i of idx){const k=fine?Math.floor(starts[i]+1e-6):0;if(!parts.has(k))parts.set(k,[]);parts.get(k).push(i);}
    for(const part of parts.values()){
      let run=[];
      for(const i of part){if(beamable(ns[i]))run.push(i);else{if(run.length>1)out.push(run);run=[];}}
      if(run.length>1)out.push(run);
    }
  }
  return out;
}
// width (px) a bar's melody needs
function notationMinWidth(str,bar){
  const VF=NOT.vf;if(bar<0&&!melNotes(str).length&&!isSlashBar(str))return 44;
  const b=vfBar(str,bar>=0),live=b.voices.filter(x=>x.notes.length);
  const w=live.length?new VF.Formatter().joinVoices(live.map(x=>x.voice)).preCalculateMinTotalWidth(live.map(x=>x.voice)):0;
  // comfortable spacing grows with duration (as engravers do), plus room for accidentals
  const ideal=Math.max(0,...b.voices.map(x=>x.meta.reduce((s,m)=>s+12+12*Math.sqrt(m.n.beats)+(m.n.p&&/[#b]/.test(m.n.p.slice(1))?8:0),0)));
  return (Math.max(w,ideal)+22)*notationScale();
}
// width (px) of clef + key signature (+ time signature on the first line)
function notationHeadWidth(first){
  const VF=NOT.vf,plain=new VF.Stave(0,0,400),st=new VF.Stave(0,0,400);
  st.addClef('treble').addKeySignature(S.keySig);if(first)st.addTimeSignature(curBpb()+'/4');
  return (st.getNoteStartX()-plain.getNoteStartX())*notationScale();
}
// Draw one line's staff. items: [{el, bar}] in order; first: first line of the chart.
// tie every note of a chord (first or last may be null: a tie running off / into the line)
function drawTie(c,first,last){
  const n=Math.min(first?first.getKeys().length:99,last?last.getKeys().length:99),ix=[...Array(n).keys()];
  new NOT.vf.StaveTie({first_note:first,last_note:last,first_indices:ix,last_indices:ix}).setContext(c).draw();
}
// per voice: a tie to the next bar in this line / into the next line
const TIES={1:{pending:null,carry:false},2:{pending:null,carry:false}};
function drawStaffRow(row,items,first){
  const VF=NOT.vf,K=notationScale();
  const box=document.createElement('div');box.className='staff';box.setAttribute('aria-hidden','true');
  const W=row.clientWidth,H=Math.round(STAFF_UNITS*K);
  box.style.width=W+'px';box.style.height=H+'px';row.appendChild(box);
  const r=new VF.Renderer(box,VF.Renderer.Backends.SVG);r.resize(W,H);
  const c=r.getContext();c.scale(K,K);c.setFillStyle('currentColor');c.setStrokeStyle('currentColor');
  for(const v of [1,2]){if(first)TIES[v].carry=false;TIES[v].pending=null;}
  items.forEach((it,j)=>{
    const x=it.el.offsetLeft/K,w=it.el.offsetWidth/K;
    const st=new VF.Stave(x,STAFF_TOP-40,w);
    if(j===0){st.addClef('treble').addKeySignature(S.keySig);if(first)st.addTimeSignature(curBpb()+'/4');}
    else st.setBegBarType(VF.Barline.type.NONE);
    const rp=(chartSong.reps||[])[it.bar]||{};
    if(rp.rs)st.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
    if(rp.re)st.setEndBarType(VF.Barline.type.REPEAT_END);
    else if(it.bar===chartSong.bars.length-1)st.setEndBarType(VF.Barline.type.END);
    else if(chartSong.labels[it.bar+1])st.setEndBarType(VF.Barline.type.DOUBLE);   // end of a section
    st.setContext(c).draw();
    const str=melGet(it.bar),b=vfBar(str,it.bar>=0),live=b.voices.filter(x=>x.notes.length);
    const chords=it.el.querySelectorAll('.chd');
    if(!live.length){
      // no melody here: chords spread by beats across the bar
      const x0=st.getNoteStartX()*K-it.el.offsetLeft,x1=(st.getNoteEndX()-8)*K-it.el.offsetLeft;
      chords.forEach(ch=>{ch.style.left=Math.round(x0+(+ch.dataset.beat/curBpb())*(x1-x0))+'px';});
      for(const v of [1,2]){if(TIES[v].pending){drawTie(c,TIES[v].pending,null);TIES[v].pending=null;}TIES[v].carry=false;}
      return;
    }
    const beams=[];
    for(const vb of live)for(const g of beamGroups(vb.meta.map(m=>m.n),vb.meta.map(m=>m.start)))beams.push(new VF.Beam(g.map(i=>vb.notes[i]),!vb.dir));
    new VF.Formatter().joinVoices(live.map(x=>x.voice)).formatToStave(live.map(x=>x.voice),st);
    for(const vb of live)vb.voice.draw(c,st);
    beams.forEach(x=>x.setContext(c).draw());
    for(const vb of live)vb.tuplets.forEach(x=>x.setContext(c).draw());
    if(!NOT.hits.has(it.bar))NOT.hits.set(it.bar,[]);
    for(const vb of b.voices){
      const T=TIES[vb.v];
      vb.meta.forEach((m,i)=>{
        const sn=vb.notes[i];
        // ties, within the line and from the previous bar
        if(i===0&&T.pending){drawTie(c,T.pending,m.n.p&&!m.filler?sn:null);T.pending=null;}
        if(i===0&&T.carry){if(m.n.p&&!m.filler)drawTie(c,null,sn);T.carry=false;}
        if(m.n.tie){   // filler rests don't count: a tie at the end of what you wrote goes on to the next bar
          const nm=vb.meta[i+1],nx=nm&&!nm.filler?vb.notes[i+1]:null;
          if(nx&&nm.n.p)drawTie(c,sn,nx);
          else if(!nx)T.pending=sn;
        }
        // where the note sits, for tapping it; a filler rest (ni null) means "add at the end"
        const hx=((sn.getNoteHeadBeginX()+sn.getNoteHeadEndX())/2)*K;
        const ys=sn.getYs?sn.getYs():[STAFF_TOP+20],hy=(ys.reduce((a,y)=>a+y,0)/ys.length)*K;
        NOT.hits.get(it.bar).push({ni:m.filler?null:m.ni,x:hx,y:hy,v:vb.v});
        if(m.filler)return;
        const el=sn.getSVGElement&&sn.getSVGElement();
        if(el){NOT.els.set(it.bar+':'+vb.v+':'+m.ni,el);toneHeads(el,m.n.midis,it.bar,m.start);
          if(NOT.tbar===it.bar){el.classList.add('tcur');(NOT.tmarked||(NOT.tmarked=[])).push(el);}}
      });
      if(!vb.notes.length){if(T.pending){drawTie(c,T.pending,null);T.pending=null;}T.carry=false;}
    }
    // chord symbols sit over the note on their beat (or between notes), anchored on the notes
    // you wrote in either voice (not filler rests); with none, spread by beats
    const x0=st.getNoteStartX()*K-it.el.offsetLeft,end=(st.getNoteEndX()-6)*K-it.el.offsetLeft;
    const xs=[];
    for(const vb of live)vb.meta.forEach((m,i)=>{if(!m.filler||m.slash)xs.push({beat:m.start,x:vb.notes[i].getAbsoluteX()*K-it.el.offsetLeft});});
    xs.sort((a,b)=>a.beat-b.beat);
    if(!xs.length)xs.push({beat:0,x:x0});
    const xAt=beat=>{
      let lo=xs[0],hi=null;for(const p of xs){if(p.beat<=beat+1e-6)lo=p;else{hi=p;break;}}
      if(Math.abs(lo.beat-beat)<1e-6||beat<lo.beat)return lo.x;
      const hb=hi?hi.beat:curBpb(),hx=hi?hi.x:end;
      return lo.x+(beat-lo.beat)/(hb-lo.beat)*(hx-lo.x);
    };
    chords.forEach(ch=>{ch.style.left=Math.round(xAt(+ch.dataset.beat)-2)+'px';});
  });
  // never let two chord symbols touch: push a crowded one right
  items.forEach(it=>{
    let right=-1e9;
    for(const ch of it.el.querySelectorAll('.chd')){const l=parseFloat(ch.style.left)||0;if(l<right+6){ch.style.left=Math.round(right+6)+'px';}right=parseFloat(ch.style.left)+ch.offsetWidth;}
  });
  // ties running off the end of the line
  for(const v of [1,2]){const T=TIES[v];if(T.pending){drawTie(c,T.pending,null);T.pending=null;T.carry=true;}}
  fitStaffRow(row,box,H);
}
// Make room for what the notation actually reaches: high notes and up-stems (forced up in a two-
// voice bar) would run into the chord symbols, low down-stems into the next line. The line moves
// down (--lift) and/or grows (--drop) just enough; lines that fit stay compact.
const STAFF_Y=28,TONES_H=19;
const chordBottom=()=>37+(S.chartTones?TONES_H:0);   // px from the line's top: chord text ends; the staff box starts
function fitStaffRow(row,box,H){
  row.style.removeProperty('--lift');row.style.removeProperty('--drop');
  const bt=box.getBoundingClientRect();let top=1e9,bot=-1e9;
  for(const el of box.querySelectorAll('svg path,svg rect,svg text,svg line')){
    const r=el.getBoundingClientRect();if(!r.width&&!r.height)continue;
    top=Math.min(top,r.top-bt.top);bot=Math.max(bot,r.bottom-bt.top);
  }
  if(top>1e8)return;
  const lift=Math.max(0,Math.ceil(chordBottom()-STAFF_Y-top)),drop=Math.max(0,Math.ceil(bot-H+2));
  if(lift)row.style.setProperty('--lift',lift+'px');
  if(drop)row.style.setProperty('--drop',drop+'px');
  row.dataset.lift=lift;
}
// The chord sounding at a beat of a bar (a bar with no chord of its own carries the last one on).
function chordAt(bar,beat){
  for(let b=bar;b>=0;b--){
    const cs=chartSong.bars[b]||[];let hit=null;
    for(const x of cs)if(b<bar||x.beat<=beat+1e-6)hit=x;
    if(hit)return hit.t;
  }
  return null;
}
// Mark each notehead with what it is in the chord at that moment (3rd/7th, chord tone, extension);
// the colours only show in the bar being played (.tcur).
function toneHeads(el,midis,bar,beat){
  if(!S.chartTones||!midis||!midis.length||bar<0)return;
  const sym=chordAt(bar,beat),ch=sym&&parseChord(sym);if(!ch)return;
  const tones=new Map(chordToneNames(sym).map(t=>[t.i,t.tone]));
  const heads=el.querySelectorAll('.vf-notehead');
  [...midis].sort((a,b)=>a-b).forEach((m,k)=>{const t=tones.get(((m-ch.root)%12+12)%12);if(t&&heads[k])heads[k].dataset.tone=t;});
}
function markToneBar(bar){
  for(const el of NOT.tmarked||[])el.classList.remove('tcur');
  NOT.tmarked=[];NOT.tbar=bar;
  if(bar==null)return;
  for(const [k,el] of NOT.els)if(k.startsWith(bar+':')){el.classList.add('tcur');NOT.tmarked.push(el);}
}
// highlight the note being played
function markNote(bar,ni,v=1){
  if(NOT.cur){NOT.cur.classList.remove('cur');NOT.cur=null;}
  const el=bar==null?null:NOT.els.get(bar+':'+v+':'+ni);
  if(el){el.classList.add('cur');NOT.cur=el;}
}
