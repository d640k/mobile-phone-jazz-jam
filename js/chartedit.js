// ---------- Chart editing (no DOM) ----------
// The chart text stays the stored format (saving, Drive sync, presets). Editing works on
// splitChart() bars and writes text back with barsToText().

// raw bars -> chart text, 4 bars a line; a labelled bar starts a new line with "[label]"
function barsToText(raw){
  const lines=[];let cur=[];
  for(const b of raw){if((b.label||cur.length===4)&&cur.length){lines.push(cur);cur=[];}cur.push(b);}
  if(cur.length)lines.push(cur);
  return lines.map(l=>(l[0].label?`[${l[0].label}] `:'')+'| '+l.map(b=>b.toks.join(' ')).join(' | ')+' |').join('\n');
}
// a bar's chord tokens with "%" resolved to the bar it repeats
function resolveToks(raw,i){
  for(let j=i;j>=0;j--){const t=raw[j].toks;if(!(t.length===1&&t[0]==='%'))return [...t];}
  return [];
}

// ----- one chord symbol <-> picker parts {root, q, ext[], bass} -----
const PICK_ROOTS=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
// the root buttons, spelled with flats or with sharps
const ROOTS_FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const ROOTS_SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONIC={'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb','Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'};
const spellingOf=n=>n&&n.length===2?(n[1]==='#'?'sharp':'flat'):null;
// [label shown, quality token]
const PICK_QUALS=[['maj',''],['maj7','maj7'],['6','6'],['7','7'],['sus','7sus4'],['alt','7alt'],['m','m'],['m7','m7'],['m6','m6'],['mΔ','m(maj7)'],['m7♭5','m7b5'],['dim7','dim7']];
const PICK_EXTS=['b5','#5','b9','9','#9','11','#11','13','b13'];
// quality spellings people type -> [quality token, implied extensions]
const Q_FORMS=[
  ['m(maj7)','m(maj7)',[]],['mMaj7','m(maj7)',[]],['m(Maj7)','m(maj7)',[]],['mmaj7','m(maj7)',[]],['-maj7','m(maj7)',[]],
  ['m9b5','m7b5',['9']],['m7b5','m7b5',[]],['ø7','m7b5',[]],['ø','m7b5',[]],['-7b5','m7b5',[]],
  ['maj13','maj7',['9','13']],['maj9','maj7',['9']],['maj7','maj7',[]],['Maj7','maj7',[]],['M7','maj7',[]],['Δ7','maj7',[]],['Δ','maj7',[]],['^7','maj7',[]],
  ['m13','m7',['9','13']],['m11','m7',['9','11']],['m9','m7',['9']],['m7','m7',[]],['-7','m7',[]],['mi7','m7',[]],['min7','m7',[]],
  ['m69','m6',['9']],['m6','m6',[]],['-6','m6',[]],
  ['dim7','dim7',[]],['o7','dim7',[]],['°7','dim7',[]],['dim','dim7',[]],['o','dim7',[]],
  ['7sus4','7sus4',[]],['9sus4','7sus4',['9']],['7sus','7sus4',[]],['sus4','7sus4',[]],['sus','7sus4',[]],
  ['7alt','7alt',[]],['alt','7alt',[]],
  ['13','7',['9','13']],['11','7',['9','11']],['9','7',['9']],['69','6',['9']],['6/9','6',['9']],['7','7',[]],['6','6',[]],
  ['m','m',[]],['-','m',[]],['aug','aug',[]],['+','aug',[]],
  ['','',[]],
];
function chordParts(tok){
  const m=/^([A-G][b#]?)(.*)$/.exec(tok||'');if(!m)return null;
  let rest=m[2],bass=null;
  const sl=/^(.*)\/([A-G][b#]?)$/.exec(rest);
  if(sl&&sl[1]!=='6'){rest=sl[1];bass=sl[2];}
  rest=rest.replace(/[()]/g,'');
  for(const [form,q,ext] of Q_FORMS){
    if(!rest.startsWith(form.replace(/[()]/g,'')))continue;
    const tail=rest.slice(form.replace(/[()]/g,'').length);
    const found=tail.match(/b5|#5|b9|#9|#11|b13|9|11|13/g)||[];
    if(found.join('')!==tail)continue;                        // something we can't show as buttons
    return {root:m[1],q,ext:[...new Set([...ext,...found])],bass};
  }
  return {root:m[1],q:null,ext:[],bass,raw:tok};               // unknown: shown as text, picker overwrites
}
function chordFromParts(p){
  if(!p.q&&p.raw)return p.raw;
  let q=p.q??'';const ext=PICK_EXTS.filter(x=>p.ext.includes(x));
  const has=x=>ext.includes(x),drop=(...xs)=>xs.forEach(x=>{const i=ext.indexOf(x);if(i>=0)ext.splice(i,1);});
  // m7 + b5 is m7b5 (half-diminished); with a 9 it's written m9b5
  if(q==='m7'&&has('b5')){q='m7b5';drop('b5');}
  if(q==='m7b5'&&has('9')){q='m9b5';drop('9');}
  // fold natural extensions into the usual spelling: C7+9 -> C9, Cm7+9+11 -> Cm11, C7+13 -> C13
  if(['7','maj7','m7'].includes(q)&&has('13')){q=q.replace('7','13');drop('13','9','11');}
  else if(['7','m7'].includes(q)&&has('11')&&!has('#11')){q=q.replace('7','11');drop('11','9');}
  else if(['7','maj7','m7'].includes(q)&&has('9')){q=q.replace('7','9');drop('9');}
  else if(q==='7sus4'&&has('9')){q='9sus4';drop('9');}
  else if(q==='6'&&has('9')){q='69';drop('9');}
  else if(q==='m6'&&has('9')){q='m69';drop('9');}
  return p.root+q+ext.join('')+(p.bass&&p.bass!==p.root?'/'+p.bass:'');
}
