// ---------- Google Drive sync (saved songs) ----------
// Same Google Cloud OAuth client as Talk Board: both apps are served from d640k.github.io.
// Scope drive.file = the app can only see files it created. Songs live in one file,
// "Jazz Jam songs.json", tagged with appProperties {jazzjam:'songs'}.
// Merge: per song, the newest save wins; deletions are kept as timestamps so a song
// deleted on one device doesn't come back from another.
const GOOGLE={clientId:'51388586652-87th3555dcca5qvdfi0eqv8jid2dsqov.apps.googleusercontent.com'};
const DAPI='https://www.googleapis.com/drive/v3',DUP='https://www.googleapis.com/upload/drive/v3';
const G={token:null,exp:0,client:null,ready:null,timer:null,busy:false,state:'',err:'',dirtyAt:0,
  on:store.get('driveOn',false),fileId:store.get('driveFile',null),ver:store.get('driveVer',null),at:store.get('driveAt',0)};
{const t=store.get('driveTok',null);if(t&&t.exp>Date.now()+60000){G.token=t.t;G.exp=t.exp;}}

function gLoad(){
  if(!G.ready)G.ready=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
    s.onload=()=>{G.client=google.accounts.oauth2.initTokenClient({client_id:GOOGLE.clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:()=>{}});res();};
    s.onerror=()=>{G.ready=null;rej(new Error('Couldn’t load Google sign-in. Check your connection.'));};document.head.appendChild(s);});
  return G.ready;
}
// Tokens last an hour. Getting a new one opens a popup, which browsers only allow right after a tap.
async function gTok(interactive){
  if(G.token&&Date.now()<G.exp-60000)return G.token;
  if(!interactive)throw new Error('auth');
  await gLoad();
  return new Promise((res,rej)=>{
    G.client.callback=r=>{if(r.error){rej(new Error('auth'));return;}
      G.token=r.access_token;G.exp=Date.now()+r.expires_in*1000;store.set('driveTok',{t:G.token,exp:G.exp});res(G.token);};
    G.client.error_callback=()=>rej(new Error('auth'));
    G.client.requestAccessToken({prompt:G.on?'':'consent'});
  });
}
async function gfetch(url,opts={}){
  const t=await gTok(false);
  const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+t}});
  if(r.status===401){G.token=null;throw new Error('auth');}
  if(r.status===404)throw new Error('gone');
  if(!r.ok)throw new Error('Google Drive error '+r.status);
  return r;
}
// stable JSON (sorted keys) so "did anything change?" comparisons are reliable
const canon=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function mergeSongs(rs,rd){
  const deleted={...(rd||{})};
  for(const [n,t] of Object.entries(S.songsDeleted))deleted[n]=Math.max(deleted[n]||0,t);
  const songs={};
  for(const src of [rs||{},S.songs])for(const [n,s] of Object.entries(src))
    if(!songs[n]||(s.saved||0)>(songs[n].saved||0))songs[n]=s;
  for(const [n,t] of Object.entries(deleted))if(songs[n]&&(songs[n].saved||0)<=t)delete songs[n];
  // forget deletions after a year
  const cut=Date.now()-365*864e5;for(const n of Object.keys(deleted))if(deleted[n]<cut)delete deleted[n];
  return{songs,deleted};
}
async function findSongsFile(){
  const q=encodeURIComponent("appProperties has { key='jazzjam' and value='songs' } and trashed=false");
  const r=await (await gfetch(`${DAPI}/files?q=${q}&orderBy=modifiedTime desc&fields=files(id)&pageSize=10`)).json();
  return r.files&&r.files[0]?r.files[0].id:null;
}
async function uploadSongs(){
  const body=JSON.stringify({app:'jazzjam-songs',version:1,songs:S.songs,deleted:S.songsDeleted});
  const meta=G.fileId?{}:{name:'Jazz Jam songs.json',mimeType:'application/json',appProperties:{jazzjam:'songs'}};
  const bd='jj'+Math.random().toString(36).slice(2);
  const r=await gfetch(`${DUP}/files${G.fileId?'/'+G.fileId:''}?uploadType=multipart&fields=id,version`,{method:G.fileId?'PATCH':'POST',
    headers:{'Content-Type':`multipart/related; boundary=${bd}`},
    body:`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${bd}--`});
  const j=await r.json();G.fileId=j.id;G.ver=j.version;
}
async function driveSync(interactive){
  if(G.busy||(!G.on&&!interactive))return;
  G.busy=true;setDrive('syncing');
  const started=Date.now();
  try{
    if(interactive)await gTok(true);
    if(!G.on){G.on=true;store.set('driveOn',true);G.dirtyAt=Date.now();}
    if(!G.fileId)G.fileId=await findSongsFile();
    let remote=null;
    if(G.fileId){
      try{
        const m=await (await gfetch(`${DAPI}/files/${G.fileId}?fields=version,trashed`)).json();
        if(m.trashed)throw new Error('gone');
        if(m.version!==G.ver){remote=await (await gfetch(`${DAPI}/files/${G.fileId}?alt=media`)).json();G.ver=m.version;}
      }catch(e){if(e.message!=='gone')throw e;G.fileId=null;G.ver=null;}   // file deleted in Drive: make a new one
    }
    let changed=!G.fileId||G.dirtyAt>=(G.at||0);
    if(remote){
      const before=canon(S.songs),m=mergeSongs(remote.songs,remote.deleted);
      S.songs=m.songs;S.songsDeleted=m.deleted;store.set('songs',S.songs);store.set('songsDeleted',S.songsDeleted);
      if(canon(S.songs)!==before)refreshSongList();
      changed=canon({s:S.songs,d:S.songsDeleted})!==canon({s:remote.songs||{},d:remote.deleted||{}});
    }
    if(changed)await uploadSongs();
    G.at=Date.now();if(G.dirtyAt<started)G.dirtyAt=0;
    store.set('driveFile',G.fileId);store.set('driveVer',G.ver);store.set('driveAt',G.at);
    G.err='';setDrive('ok');
  }catch(e){G.err=e.message;setDrive(e.message==='auth'?'auth':'error');}
  finally{G.busy=false;}
}
// call after a song is saved or deleted
function songsChanged(){G.dirtyAt=Date.now();if(!G.on)return;clearTimeout(G.timer);G.timer=setTimeout(()=>driveSync(false),3000);}
function driveOff(){
  try{if(window.google&&G.token)google.accounts.oauth2.revoke(G.token);}catch(e){}
  G.on=false;G.token=null;store.set('driveOn',false);store.set('driveTok',null);
  setDrive('');
}
function agoText(t){const m=Math.round((Date.now()-t)/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;}
function setDrive(s){
  G.state=s;const st=$('driveStatus'),b=$('driveBtn'),off=$('driveOff');if(!st)return;
  off.hidden=!G.on;
  if(!G.on){st.textContent='Saved songs are only on this device.';b.textContent='Sync with Google Drive';return;}
  st.textContent={syncing:'Syncing with Google Drive…',ok:`☁ Synced with Google Drive ${agoText(G.at)}.`,
    auth:'Google sign-in expired. Tap Reconnect to keep syncing.',
    error:`Sync failed: ${G.err}. It will try again.`}[s]||`☁ Google Drive sync is on.`;
  b.textContent=s==='auth'?'Reconnect':'Sync now';
}
function initDrive(){
  $('driveBtn').onclick=()=>driveSync(true);
  $('driveOff').onclick=()=>{if(confirm('Stop syncing songs on this device? Your songs stay here and in Google Drive.'))driveOff();};
  setDrive(G.on?(G.token?'':'auth'):'');
  if(G.on&&G.token)driveSync(false);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')driveSync(false);});
}
