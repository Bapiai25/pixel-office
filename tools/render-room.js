'use strict';
const fs=require('fs'), vm=require('vm');
const D=require('./dom-render.js');
const html=fs.readFileSync('pixel-office.html','utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const sb={ window:D.windowObj, document:D.document, fetch:D.fakeFetch,
  requestAnimationFrame:D.fakeRaf, cancelAnimationFrame(){},
  setInterval:D.fakeSetInterval, clearInterval:D.fakeClearInterval,
  setTimeout:D.fakeSetTimeout, clearTimeout:D.fakeClearTimeout, console };
vm.runInNewContext(js,sb,{timeout:9000});
function flush(n){ return new Promise(r=>{ let i=0; (function f(){ if(++i>n) return r(); setImmediate(f); })(); }); }
function bmp(path,w,h,rgb){
  const rowSize=Math.ceil(w*3/4)*4, size=54+rowSize*h, b=Buffer.alloc(size);
  b.write('BM',0); b.writeUInt32LE(size,2); b.writeUInt32LE(54,10);
  b.writeUInt32LE(40,14); b.writeInt32LE(w,18); b.writeInt32LE(h,22);
  b.writeUInt16LE(1,26); b.writeUInt16LE(24,28); b.writeUInt32LE(rowSize*h,34);
  for(let y=0;y<h;y++){ const srcRow=(h-1-y)*w*3;
    for(let x=0;x<w;x++){ const o=54+y*rowSize+x*3, s=srcRow+x*3;
      b[o]=rgb[s+2]; b[o+1]=rgb[s+1]; b[o+2]=rgb[s]; } }
  fs.writeFileSync(path,b);
}
(async function(){
  await flush(6);
  const DESK=sb.window.__DESK__;
  D.byId['office'].width=DESK.RW; D.byId['office'].height=DESK.RH;
  D.byId['ava'].width=96; D.byId['ava'].height=112;
  /* put a few desks to work so work poses + monitors light up */
  ['marketintel','technical','quant'].forEach(id=>{
    const t=DESK.createTask('Screening the live tape for '+id,'',true);
    t.assignedTo=id; t.status='working'; t.kind='market';
    const u=DESK.units[id]; if(u){ u.busy=true; u.taskId=t.id; u.mode='work'; }
  });
  D.pump(6);
  const cv=D.byId['office'];
  const SC=2, W=cv._w*SC, H=cv._h*SC;
  const px=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const sx=Math.floor(x/SC), sy=Math.floor(y/SC), s=(sy*cv._w+sx)*4, o=(y*W+x)*3;
    if(cv._grid[s+3]<0.4){ px[o]=0x08; px[o+1]=0x0c; px[o+2]=0x14; continue; }
    px[o]=cv._grid[s]; px[o+1]=cv._grid[s+1]; px[o+2]=cv._grid[s+2];
  }
  bmp('previews/office-room.bmp',W,H,px);
  console.log('room rendered: '+W+'x'+H);
})();
