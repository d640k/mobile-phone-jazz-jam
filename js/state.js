// ---------- State & storage ----------
// ---------- Swing that follows the tempo ----------
// Where the "and" lands (% of the beat) for the drummers in 1,204 piano-trio recordings of the
// Jazz Trio Database (Cheston et al. 2024, MIT licence): heavy at slow tempos, near straight when
// it's fast. Median per tempo band: [bpm, %].
const SWING_CURVE=[[115,72.3],[145,72.1],[175,69.7],[205,66.7],[235,63.0],[265,59.1],[300,57.1]];
const SWING_MIN=-12,SWING_MAX=8;   // the Swing slider: points lighter/heavier than typical; the minimum = straight
function swingTypical(bpm){
  const C=SWING_CURVE;if(bpm<=C[0][0])return C[0][1];
  for(let i=1;i<C.length;i++)if(bpm<=C[i][0]){const [a,x]=C[i-1],[b,y]=C[i];return x+(y-x)*(bpm-a)/(b-a);}
  return C[C.length-1][1];
}
// the swing in use, as a fraction of the beat
function swingPct(bpm,adj){return adj<=SWING_MIN?50:Math.max(50,Math.min(78,swingTypical(bpm)+adj));}
// songs saved before swing followed the tempo kept a fixed %, where 62 was the default
function swingAdjFrom(pct){return Math.max(SWING_MIN,Math.min(SWING_MAX,pct<=50?SWING_MIN:Math.round(pct-62)));}
const APP_V='50';   // keep in step with ?v= in index.html and the cache name in sw.js
// Mix defaults (slider positions) and per-output voicing: bus trims and bass EQ.
// "phone" was tuned by ear on a phone speaker; "head" (headphones/speakers) is calibrated
// to the same perceived balance using K-weighted loudness.
const VOL_DEF={dr:70,bs:85,cp:55,ky:80,rv:35,cy:50};
const OUT_PROFILE={
  phone:{dr:0.9,bs:0.6,cp:1.05,ky:1,bLo:5,bMid:4,bMk:0.7,mst:1},
  head:{dr:0.95,bs:0.08,cp:0.85,ky:1,bLo:0,bMid:0,bMk:1,mst:1.17},
};
const store={get(k,d){try{const v=localStorage.getItem('jj_'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('jj_'+k,JSON.stringify(v));return true;}catch(e){return false;}}};
const S={
  chart:store.get('chart',PRESETS["Blues in F"]),
  bpm:store.get('bpm',140),swingAdj:store.get('swingAdj',store.get('swing',null)!=null?swingAdjFrom(store.get('swing')):0),
  output:store.get('output','phone'),
  vols:{phone:Object.assign({},VOL_DEF,store.get('vol',{}),store.get('vol_phone',{})),
        head:Object.assign({},VOL_DEF,store.get('vol_head',{}))},
  drumStyle:store.get('drumStyle','auto'),samples:store.get('samples',true),bassSounds:{phone:store.get('bassSound_phone',store.get('samplesBass',true)?'room':'synth'),head:store.get('bassSound_head','studio')},trem:store.get('trem',false),
  mute:store.get('mute',{dr:false,bs:false,cp:false}),
  countIn:store.get('countIn',true),tones:store.get('tones',true),
  oct:store.get('oct',null),
  songName:store.get('songName',''),composer:store.get('composer',''),keyInst:store.get('keyInst','piano'),compInst:store.get('compInst','rhodes'),trio:store.get('trio',false),midiSound:store.get('midiSound',false),leslieFast:false,style:store.get('style','swing'),loop:null,bassFeel:store.get('bassFeel','24'),section:store.get('section','std'),secMutedComp:store.get('secMutedComp',false),dynamics:store.get('dynamics',true),
  songs:store.get('songs',{}), // name -> {chart,bpm,swing,saved}
  songsDeleted:store.get('songsDeleted',{}), // name -> deleted-at (for Drive sync)
  theme:store.get('theme','system'),panelOpen:store.get('panelOpen',true),
  kbH:store.get('kbH',{}),kbLast:store.get('kbLast',{}),   // keyboard height per orientation (port/land); 0 = hidden
  melody:Object.assign({pickup:'',bars:[]},store.get('melody',{})),keySig:store.get('keySig','C'),
  showMel:store.get('showMel',true),chartTones:store.get('chartTones',true),melKeys:store.get('melKeys',true),melPlay:store.get('melPlay',false),
};
S.vol=S.vols[S.output];S.bassSound=S.bassSounds[S.output];
// beats per bar for each style (default 4)
const STYLE_BPB={waltz:3};
const curBpb=()=>STYLE_BPB[S.style]||4;
let song=parseChart(S.chart,curBpb());
let chartSong=song;   // the whole chart; `song` is what's playing (the chart or a loop of it)
