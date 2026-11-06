// ---------- Staff notation (VexFlow, loaded on first use) ----------
// Each line of the chart gets one SVG staff under its chord buttons. Bar widths come from the
// notation's minimum width (or the chords', whichever is wider), then lines are justified.
const NOT={vf:null,loading:null,els:new Map(),cur:null};
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
// VexFlow notes for one bar's melody string
function vfBar(str){
  const VF=NOT.vf,ns=melNotes(str),notes=[],tuplets=[],meta=[];
  let tri=[],triBeats=0,at=0;
  const flush=()=>{if(tri.length>1)tuplets.push(new VF.Tuplet(tri,{num_notes:3,notes_occupied:2}));tri=[];triBeats=0;};
  ns.forEach((n,ni)=>{
    const sn=new VF.StaveNote({keys:n.p?n.ps.map(vfKey):['b/4'],duration:VF_DUR[n.d]+(n.p?'':'r'),dots:n.dot?1:0,auto_stem:true});
    if(n.dot)VF.Dot.buildAndAttach([sn],{all:true});
    notes.push(sn);meta.push({n,start:at,ni});at+=n.beats;
    if(n.tri){tri.push(sn);triBeats+=n.beats;if(Math.abs(triBeats-Math.round(triBeats))<1e-6&&triBeats>0)flush();}
    else flush();
  });
  flush();
  const voice=new VF.Voice({num_beats:curBpb(),beat_value:4}).setMode(VF.Voice.Mode.SOFT);
  if(notes.length){voice.addTickables(notes);VF.Accidental.applyAccidentals([voice],S.keySig);}
  return {notes,voice,tuplets,meta};
}
// width (px) a bar's melody needs
function notationMinWidth(str){
  const VF=NOT.vf;if(!melNotes(str).length)return 44;
  const b=vfBar(str);
  const w=new VF.Formatter().joinVoices([b.voice]).preCalculateMinTotalWidth([b.voice]);
  return (w+26)*notationScale();
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
let tiePending=null,tieCarry=false;   // tie to the next bar in this line / into the next line
function drawStaffRow(row,items,first){
  const VF=NOT.vf,K=notationScale();
  const box=document.createElement('div');box.className='staff';box.setAttribute('aria-hidden','true');
  const W=row.clientWidth,H=Math.round(STAFF_UNITS*K);
  box.style.width=W+'px';box.style.height=H+'px';row.appendChild(box);
  const r=new VF.Renderer(box,VF.Renderer.Backends.SVG);r.resize(W,H);
  const c=r.getContext();c.scale(K,K);c.setFillStyle('currentColor');c.setStrokeStyle('currentColor');
  if(first)tieCarry=false;
  tiePending=null;
  items.forEach((it,j)=>{
    const x=it.el.offsetLeft/K,w=it.el.offsetWidth/K;
    const st=new VF.Stave(x,STAFF_TOP-40,w);
    if(j===0){st.addClef('treble').addKeySignature(S.keySig);if(first)st.addTimeSignature(curBpb()+'/4');}
    else st.setBegBarType(VF.Barline.type.NONE);
    if(it.bar===chartSong.bars.length-1)st.setEndBarType(VF.Barline.type.END);
    st.setContext(c).draw();
    const str=melGet(it.bar),b=vfBar(str);
    const chords=it.el.querySelectorAll('.chd');
    if(!b.notes.length){
      // no melody here: chords spread by beats across the bar
      const x0=st.getNoteStartX()*K-it.el.offsetLeft,x1=(st.getNoteEndX()-8)*K-it.el.offsetLeft;
      chords.forEach(ch=>{ch.style.left=Math.round(x0+(+ch.dataset.beat/curBpb())*(x1-x0))+'px';});
      if(tiePending){drawTie(c,tiePending,null);tiePending=null;}
      tieCarry=false;return;
    }
    const beams=VF.Beam.generateBeams(b.notes,{groups:[new VF.Fraction(2,8)]});
    new VF.Formatter().joinVoices([b.voice]).formatToStave([b.voice],st);
    b.voice.draw(c,st);
    beams.forEach(x=>x.setContext(c).draw());
    b.tuplets.forEach(x=>x.setContext(c).draw());
    // ties, within the line and from the previous bar
    b.meta.forEach((m,i)=>{
      const sn=b.notes[i];
      if(i===0&&tiePending){drawTie(c,tiePending,m.n.p?sn:null);tiePending=null;}
      if(i===0&&tieCarry){if(m.n.p)drawTie(c,null,sn);tieCarry=false;}
      if(m.n.tie){
        const nx=b.notes[i+1];
        if(nx&&b.meta[i+1].n.p)drawTie(c,sn,nx);
        else if(!nx)tiePending=sn;
      }
      const el=sn.getSVGElement&&sn.getSVGElement();
      if(el)NOT.els.set(it.bar+':'+m.ni,el);
    });
    // chord symbols sit over the note on their beat (or between notes)
    const xs=b.meta.map((m,i)=>({beat:m.start,x:b.notes[i].getAbsoluteX()*K-it.el.offsetLeft}));
    const end=(st.getNoteEndX()-6)*K-it.el.offsetLeft;
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
  // a tie running off the end of the line
  if(tiePending){drawTie(c,tiePending,null);tiePending=null;tieCarry=true;}
}
// highlight the note being played
function markNote(bar,ni){
  if(NOT.cur){NOT.cur.classList.remove('cur');NOT.cur=null;}
  const el=bar==null?null:NOT.els.get(bar+':'+ni);
  if(el){el.classList.add('cur');NOT.cur=el;}
}
