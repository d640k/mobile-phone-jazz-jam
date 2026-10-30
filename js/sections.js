// ---------- Rhythm sections (profiles for the Swing style) ----------
// Each profile is plain data read by js/styles/swing.js. Anything left out falls back to
// SEC_DEFAULT. These are "in the style of" sketches built from well-documented traits,
// not transcriptions.
const SEC_DEFAULT={
  name:'Standard',swing:62,feel:'24',compOff:false,
  drums:{
    ride:1,rideDrop:0.25,rideExtra:0.05,rideQuarters:0, // ride level, dropped/extra skip notes, plain-quarter bars
    hat:'24',hatVel:0.42,                               // hi-hat foot: '24' or 'all' (every beat)
    chatter:0.12,kick:0.09,bombs:0.025,bombVel:0.4,     // snare comping, kick feathering, kick "bombs"
    accents:[],                                         // per-bar snare accents: [eighth slot, chance, velocity]
    phraseBomb:0.3,                                     // snare(+kick) setup on the last "and" of a 4-bar phrase
    pressRoll:0,pressRollPhrase:0,                      // crescendo roll into a new chorus / 8-bar phrase
    crossRhythm:0,                                      // chance per 2 bars of dotted-quarter accents
    crash:0.3,
  },
  bass:{chrom:3,fifth:1.2,step:1.5,ct:1,leap:0,pedal:0,ghost:0.07,push:4}, // push = ms ahead of the beat
  comp:{voicing:'rootless',density:'normal',vel:1,lay:8},                  // lay = ms behind the beat
  dyn:{start:0.8,build:0.07,drop:0},                                        // drop = chance of a quiet "drop" chorus
};
const SECTIONS={
  std:{},
  // Monk quartet, Rouse years (Frankie Dunlop / Ben Riley; John Ore / Larry Gales).
  // You're Monk, so comping is off. Steady, chord-tone walking; crisp snare accents placed
  // around the phrase and the odd "bomb" into the next phrase.
  monk:{
    name:'Monk quartet (Rouse years)',swing:64,feel:'4',compOff:true,
    drums:{chatter:0.08,accents:[[7,0.16,0.34],[3,0.1,0.28],[5,0.07,0.26],[4,0.05,0.3]],phraseBomb:0.4,bombs:0.03,bombVel:0.45},
    bass:{chrom:1.6,ct:2,step:1.8,ghost:0.04,push:2},
    comp:{voicing:'monk',density:'sparse',vel:1.05,lay:4},
    dyn:{start:0.86,build:0.04},
  },
  // Jazz Messengers (Art Blakey). Heavy hi-hat on 2 and 4, driving ride, bombs, and the press
  // roll into the top of the chorus. Punchy, busier comping. Starts hot.
  blakey:{
    name:'Blue Note (Blakey)',swing:66,feel:'24',
    drums:{ride:1.1,hatVel:0.6,chatter:0.16,bombs:0.06,bombVel:0.5,phraseBomb:0.45,pressRoll:0.75,pressRollPhrase:0.25,crash:0.36,kick:0.1},
    bass:{chrom:3.2,push:5},
    comp:{density:'busy',vel:1.0,lay:6},
    dyn:{start:0.92,build:0.04},
  },
  // Miles Davis quintet c. 1964 (Tony Williams, Ron Carter, Herbie Hancock). Hi-hat on every
  // beat, a looser ride, cross-rhythms; wide leaps and pedal points in the bass; sparse
  // fourths comping; occasional sudden "drop" choruses.
  miles64:{
    name:"Miles '64 (Tony / Ron / Herbie)",swing:58,feel:'24',
    drums:{hat:'all',hatVel:0.4,rideDrop:0.4,rideExtra:0.14,rideQuarters:0.2,chatter:0.14,crossRhythm:0.16,bombs:0.04,phraseBomb:0.2},
    bass:{leap:0.15,pedal:0.22,chrom:2.6,push:6},
    comp:{voicing:'quartal',density:'sparse',vel:1.1,lay:10},
    dyn:{start:0.82,build:0.06,drop:0.22},
  },
};
// merged profile for the current selection
function curSection(){
  const p=SECTIONS[S.section]||{};
  return{...SEC_DEFAULT,...p,drums:{...SEC_DEFAULT.drums,...p.drums},bass:{...SEC_DEFAULT.bass,...p.bass},
    comp:{...SEC_DEFAULT.comp,...p.comp},dyn:{...SEC_DEFAULT.dyn,...p.dyn}};
}
