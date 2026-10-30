// ---------- Presets ----------
const PRESETS={
  "ii–V–I in C":"| Dm7 | G7 | Cmaj7 | Cmaj7 |\n| Dm7 | G7 | Cmaj7 | A7 |",
  "Major ii–V–I, all keys (descending whole steps)":"| Dm7 | G7 | Cmaj7 | % |\n| Cm7 | F7 | Bbmaj7 | % |\n| Bbm7 | Eb7 | Abmaj7 | % |\n| Abm7 | Db7 | Gbmaj7 | % |\n| F#m7 | B7 | Emaj7 | % |\n| Em7 | A7 | Dmaj7 | % |",
  "Minor ii–V–i in C":"| Dø | G7b9 | Cm6 | % |",
  "Blues in F":"| F7 | Bb7 | F7 | Cm7 F7 |\n| Bb7 | Bdim7 | F7 | D7 |\n| Gm7 | C7 | F7 D7 | Gm7 C7 |",
  "Blues in Bb":"| Bb7 | Eb7 | Bb7 | Fm7 Bb7 |\n| Eb7 | Edim7 | Bb7 | G7 |\n| Cm7 | F7 | Bb7 G7 | Cm7 F7 |",
  "Minor blues in C":"| Cm7 | Fm7 | Cm7 | Cm7 |\n| Fm7 | Fm7 | Cm7 | Cm7 |\n| Ab7 | G7alt | Cm7 | Dø G7alt |",
  "Rhythm changes A section (Bb)":"| Bbmaj7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 |\n| Fm7 Bb7 | Ebmaj7 Edim7 | Dm7 G7 | Cm7 F7 |",
  "Autumn-style minor progression (Gm)":"[A] | Cm7 | F7 | Bbmaj7 | Ebmaj7 |\n| Am7b5 | D7 | Gm6 | % |\n[B] | Am7b5 | D7 | Gm6 | % |\n| Cm7 | F7 | Bbmaj7 | Ebmaj7 |\n| Am7b5 | D7 | Gm7 C7 | Fm7 Bb7 |\n| Ebmaj7 | Am7b5 D7 | Gm6 | % |",
  "Modal vamp (D dorian / Eb dorian)":"| Dm7 | % | % | % |\n| % | % | % | % |\n| Ebm7 | % | % | % |\n| Dm7 | % | % | % |",
  "Ballad: Eb major with turnarounds":{style:"ballad",bpm:66,chart:"| Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7b9 | Fm7 Bb7 |\n| Ebmaj7 Eb7 | Abmaj7 Db7 | Gm7 C7b9 | Fm7 Bb7 |"},
  "Jazz waltz: Bb major (3/4)":{style:"waltz",bpm:160,chart:"| Bbmaj7 | Gm7 | Cm7 | F7 |\n| Dm7 | G7b9 | Cm7 | F7 |\n| Bbmaj7 | Bb7 | Ebmaj7 | Ebm6 |\n| Dm7 | G7b9 | Cm7 F7 | Bbmaj7 |"},
  "Samba: D minor":{style:"samba",bpm:210,chart:"| Dm7 | % | Em7b5 | A7b9 |\n| Dm7 | % | Em7b5 | A7b9 |\n| Gm7 | C7 | Fmaj7 | Bbmaj7 |\n| Em7b5 | A7b9 | Dm7 | Em7b5 A7b9 |"},
  "Bossa: 16-bar minor (Cm)":{style:"bossa",bpm:140,chart:"| Cm7 | % | Fm7 | % |\n| Dø | G7b9 | Cm7 | % |\n| Ebm7 | Ab7 | Dbmaj7 | % |\n| Dø | G7b9 | Cm7 | Dø G7b9 |"},
  "Bossa: major with turnaround (F)":{style:"bossa",bpm:130,chart:"| Fmaj7 | % | Gm7 | C7 |\n| Fmaj7 | Bbmaj7 | Am7 D7b9 | Gm7 C7 |"},
  "Bossa: ii–V–I in C":{style:"bossa",bpm:130,chart:"| Dm7 | G7 | Cmaj7 | % |\n| Dm7 | G7 | Cmaj7 | A7b9 |"},
};
