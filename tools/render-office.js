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
  const list=DESK.ordered().map(a=>[a.id,a]);
  list.push(['boss',DESK.D2.BOSS]);
  const SC=4, CW=20*2, CH=24*2, GAP=8;   /* sprite grid 40x48, 4x zoom */
  const cols=7, rows=Math.ceil(list.length/cols);
  const W=GAP+cols*(CW*SC+GAP), H=GAP+rows*(CH*SC+GAP);
  const px=Buffer.alloc(W*H*3);
  for(let i=0;i<W*H;i++){ px[i*3]=0x0b; px[i*3+1]=0x10; px[i*3+2]=0x19; }
  list.forEach(([id,a],i)=>{
    const cv=DESK.spriteOf(a,'idle','s',0);
    const x0=GAP+(i%cols)*(CW*SC+GAP), y0=GAP+Math.floor(i/cols)*(CH*SC+GAP);
    for(let y=0;y<CH;y++) for(let x=0;x<CW;x++){
      const s=(y*cv._w+x)*4;
      if(cv._grid[s+3]<0.4) continue;
      for(let dy=0;dy<SC;dy++) for(let dx=0;dx<SC;dx++){
        const o=((y0+y*SC+dy)*W+(x0+x*SC+dx))*3;
        px[o]=cv._grid[s]; px[o+1]=cv._grid[s+1]; px[o+2]=cv._grid[s+2];
      }
    }
    /* frame */
    for(let x=-1;x<=CW*SC;x++){ for(const yy of [y0-1,y0+CH*SC]){ const o=(yy*W+x0+x)*3; if(o>0&&o<px.length-3){ px[o]=0x28; px[o+1]=0x32; px[o+2]=0x4a; } } }
    for(let y=-1;y<=CH*SC;y++){ for(const xx of [x0-1,x0+CW*SC]){ const o=((y0+y)*W+xx)*3; if(o>0&&o<px.length-3){ px[o]=0x28; px[o+1]=0x32; px[o+2]=0x4a; } } }
  });
  bmp('previews/office-cast.bmp',W,H,px);
  console.log('cast sheet: '+list.length+' characters -> '+W+'x'+H);
  console.log('order: '+list.map(x=>x[0]).join(', '));
})();
