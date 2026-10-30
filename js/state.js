// ---------- State & storage ----------
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
  bpm:store.get('bpm',140),swing:store.get('swing',62),
  output:store.get('output','phone'),
  vols:{phone:Object.assign({},VOL_DEF,store.get('vol',{}),store.get('vol_phone',{})),
        head:Object.assign({},VOL_DEF,store.get('vol_head',{}))},
  drumStyle:store.get('drumStyle','auto'),samples:store.get('samples',true),bassSounds:{phone:store.get('bassSound_phone',store.get('samplesBass',true)?'room':'synth'),head:store.get('bassSound_head','studio')},trem:store.get('trem',false),
  mute:store.get('mute',{dr:false,bs:false,cp:false}),
  countIn:store.get('countIn',true),tones:store.get('tones',true),
  oct:store.get('oct',null),
  songName:store.get('songName',''),keyInst:store.get('keyInst','piano'),compInst:store.get('compInst','rhodes'),trio:store.get('trio',false),midiSound:store.get('midiSound',false),leslieFast:false,style:store.get('style','swing'),bassFeel:store.get('bassFeel','24'),dynamics:store.get('dynamics',true),
  songs:store.get('songs',{}), // name -> {chart,bpm,swing,saved}
};
S.vol=S.vols[S.output];S.bassSound=S.bassSounds[S.output];
// beats per bar for each style (default 4)
const STYLE_BPB={waltz:3};
const curBpb=()=>STYLE_BPB[S.style]||4;
let song=parseChart(S.chart,curBpb());
