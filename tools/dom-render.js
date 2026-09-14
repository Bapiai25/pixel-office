'use strict';
/* minimal mock DOM for pixel-office smoke checks */

function parseColor(c){
  if(typeof c!=='string') return [255,0,255,1];
  c=c.trim();
  if(c[0]==='#'){
    let h=c.slice(1);
    if(h.length===3) h=h.split('').map(x=>x+x).join('');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1];
  }
  const m=c.match(/rgba?\(([^)]+)\)/);
  if(m){ const p=m[1].split(',').map(s=>parseFloat(s)); return [p[0]|0,p[1]|0,p[2]|0,p.length>3?p[3]:1]; }
  return [255,0,255,1];
}
function gridOf(el){
  if(!el._grid){ const n=(el._w|0)*(el._h|0); el._grid=n>0?new Float32Array(n*4):null; }
  return el._grid;
}
function at(el,x,y){
  const g=gridOf(el); if(!g) return null;
  if(x<0||y<0||x>=el._w||y>=el._h) return null;
  const i=(y*el._w+x)*4; return [g[i],g[i+1],g[i+2],g[i+3]];
}
function put(el,x,y,c){
  const g=gridOf(el); if(!g) return;
  x=Math.round(x); y=Math.round(y);
  if(x<0||y<0||x>=el._w||y>=el._h) return;
  const i=(y*el._w+x)*4, da=g[i+3], sa=c[3], oa=sa+da*(1-sa);
  if(oa<=0){ g[i]=g[i+1]=g[i+2]=g[i+3]=0; return; }
  g[i]  =(c[0]*sa+g[i]  *da*(1-sa))/oa;
  g[i+1]=(c[1]*sa+g[i+1]*da*(1-sa))/oa;
  g[i+2]=(c[2]*sa+g[i+2]*da*(1-sa))/oa;
  g[i+3]=oa;
}
function makeCtx(el){
  return {
    canvas: el, fillStyle:'#000', strokeStyle:'#000', font:'', imageSmoothingEnabled:false,
    fillRect(x,y,w,h){ const c=parseColor(this.fillStyle);
      x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h);
      for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++) put(el,xx,yy,c); },
    clearRect(x,y,w,h){ const g=gridOf(el); if(!g) return;
      x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h);
      for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++){
        if(xx<0||yy<0||xx>=el._w||yy>=el._h) continue; const i=(yy*el._w+xx)*4;
        g[i]=g[i+1]=g[i+2]=g[i+3]=0; } },
    strokeRect(){},
    fillText(){}, measureText(){ return {width:10}; },
    createLinearGradient(){ return {addColorStop(){}}; },
    drawImage(src,dx,dy,dw,dh){
      if(!src||!src._grid) return;
      const sw=src._w, sh=src._h;
      if(arguments.length<=3){
        for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){ const c=at(src,x,y); if(c&&c[3]>0) put(el,dx+x,dy+y,c); }
      }else{
        dw=dw||sw; dh=dh||sh;
        for(let y=0;y<dh;y++) for(let x=0;x<dw;x++){
          const sx=Math.min(sw-1,Math.floor(x*sw/dw)), sy=Math.min(sh-1,Math.floor(y*sh/dh));
          const c=at(src,sx,sy); if(c&&c[3]>0) put(el,dx+x,dy+y,c);
        }
      }
    }
  };
}
function matches(el,sel){
  sel=String(sel).trim();
  if(sel.indexOf(',')!==-1) return sel.split(',').some(s=>matches(el,s.trim()));
  const cls=sel.split('.').filter(Boolean);
  if(cls.length) return cls.every(c=>el._cls.has(c));
  return el.tag===sel.toUpperCase();
}

function parseInto(el,html){
  const re=/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
  let last=0, m, stack=[el];
  const top=()=>stack[stack.length-1];
  const dec=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#9656;/g,'\u25b6').replace(/&#9881;/g,'\u2699').replace(/&[a-z#0-9]+;/g,'');
  while((m=re.exec(html))){
    const txt=html.slice(last,m.index);
    if(txt){ const tn=makeEl('#text'); tn.textContent=dec(txt); top().appendChild(tn); }
    const tag=m[2].toLowerCase();
    if(m[1]==='/'){
      if(stack.length>1 && top().tag===tag.toUpperCase()) stack.pop();
    }else{
      const ne=makeEl(tag);
      const cm=(m[3].match(/class="([^"]*)"/)||[])[1];
      if(cm) ne.className=cm;
      const im=(m[3].match(/id="([^"]*)"/)||[])[1];
      if(im) ne.id=im;
      const tp=(m[3].match(/type="([^"]*)"/)||[])[1];
      if(tp) ne.type=tp;
      const vl=(m[3].match(/value="([^"]*)"/)||[])[1];
      if(vl) ne.value=vl;
      top().appendChild(ne);
      if(!/^(br|img|input|hr|option)$/.test(tag)) stack.push(ne);
    }
    last=m.index+m[0].length;
  }
  const tail=html.slice(last);
  if(tail){ const tn=makeEl('#text'); tn.textContent=dec(tail); top().appendChild(tn); }
}

function makeEl(tag){
  const el={
    tag: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, attrs: {},
    _cls: new Set(), _text:'', _inner:'', parentNode: null, _ev: {}, value:'', disabled:false,
    addEventListener(ev,fn){ (el._ev[ev]=el._ev[ev]||[]).push(fn); },
    appendChild(ch){ if(ch.parentNode) ch.parentNode.removeChild(ch); el.children.push(ch); ch.parentNode=el; return ch; },
    removeChild(ch){ const i=el.children.indexOf(ch); if(i>=0) el.children.splice(i,1); ch.parentNode=null; return ch; },
    remove(){ if(el.parentNode) el.parentNode.removeChild(el); },
    click(){ (el._ev.click||[]).slice().forEach(f=>f({target:el,stopPropagation(){},preventDefault(){},clientX:0,clientY:0})); },
    getBoundingClientRect(){ return {left:0,top:0,width:448,height:476}; },
    focus(){},
    setAttribute(name,val){ el.attrs[name]=val; },
    querySelector(sel){ const r=el.querySelectorAll(sel); return r[0]||null; },
    querySelectorAll(sel){ const out=[]; (function walk(n){
      if(n!==el&&matches(n,sel)) out.push(n); n.children.forEach(walk); })(el); return out; },
    getContext(){ return el._ctx||(el._ctx=makeCtx(el)); }
  };
  el.classList={
    add(){ for(const c of arguments) el._cls.add(c); },
    remove(){ for(const c of arguments) el._cls.delete(c); },
    contains(c){ return el._cls.has(c); },
    toggle(c,f){ if(f===undefined) f=!el._cls.has(c); if(f) el._cls.add(c); else el._cls.delete(c); return f; }
  };
  Object.defineProperty(el,'className',{
    get(){ return [...el._cls].join(' '); },
    set(v){ el._cls=new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  if(String(tag).toLowerCase()==='canvas'){
    Object.defineProperty(el,'width',{get(){ return el._w||0; },set(v){ el._w=v|0; el._grid=null; el._ctx=null; }});
    Object.defineProperty(el,'height',{get(){ return el._h||0; },set(v){ el._h=v|0; el._grid=null; el._ctx=null; }});
    el._w=0; el._h=0;
  }
  Object.defineProperty(el,'id',{
    get(){ return el._id||''; },
    set(v){ el._id=String(v||''); if(el._id) byId[el._id]=el; }
  });
  Object.defineProperty(el,'innerHTML',{
    get(){ return el._inner; },
    set(v){ el._inner=String(v);
      el.children.length=0;
      el._text=String(v).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#9656;/g,'\u25b6').replace(/&#9881;/g,'\u2699').replace(/&[a-z#0-9]+;/g,'');
      if(v!=='') parseInto(el,v); }
  });
  Object.defineProperty(el,'textContent',{
    get(){ return el._text; },
    set(v){ el._text=String(v); el._inner=String(v); }
  });
  return el;
}

const byId={}, docEls=[];
const document={
  body: makeEl('body'),
  _ev: {},
  addEventListener(ev,fn){ (document._ev[ev]=document._ev[ev]||[]).push(fn); },
  createElement(tag){ const el=makeEl(tag); docEls.push(el); return el; },
  createTextNode(text){ const el=makeEl('#text'); el.textContent=text; return el; },
  getElementById(id){ return byId[id]||null; },
  querySelectorAll(sel){ return docEls.filter(e=>matches(e,sel)); },
  dispatchKey(k){ (document._ev.keydown||[]).forEach(f=>f({key:k,target:{tagName:'DIV'},preventDefault(){}})); }
};

const IDS=['an','ava','bars','bBulletinClear','bData','bDay','bHire','bNewTask','bNight','bReport','bReset','bRun','bScan','bSend','bLoop','bSettings','bSfx','bTour','bulletinList','cCash','cClock','cCoins','cDay','cFeed','cFree','cLoop','cTg','cmdInput','cmdSuggest',
  'cMkt','crewList','divName','hdrSub','law','log','mand','modalRoot','nm','office','ov','payroll','railText',
  'rl','scan','shop','tag','taskBoard','tickerBadge','toasts','viewBody','viewTitle'];
IDS.forEach(id=>{ const el=makeEl(id==='office'||id==='ava'?'canvas':'div'); byId[id]=el; docEls.push(el); });

const timers={ seq:1, map:new Map() };
function fakeSetInterval(fn,ms){ const id=timers.seq++; timers.map.set(id,{fn,ms}); return id; }
function fakeClearInterval(id){ timers.map.delete(id); }
function fakeSetTimeout(fn,ms){ const id=timers.seq++; timers.map.set(id,{fn,ms}); return id; }
function fakeClearTimeout(id){ timers.map.delete(id); }
function fireTimer(id){ const t=timers.map.get(id); if(t){ timers.map.delete(id); t.fn(); } }

let rafQ=[], now=0;
function fakeRaf(cb){ rafQ.push(cb); return rafQ.length; }
function pump(n){ for(let i=0;i<n;i++){ const q=rafQ; rafQ=[]; q.forEach(cb=>cb(now+=33)); } }

const mem={};
const windowObj={
  AudioContext: undefined, webkitAudioContext: undefined, __DESK__: undefined,
  storage: {
    get: async k=>({value: mem[k]||null}),
    set: async (k,v)=>{ mem[k]=v; }
  }
};

const CG_ROWS={
  bitcoin:{id:'bitcoin',symbol:'btc',current_price:77839,price_change_percentage_24h:1.35,
    price_change_percentage_7d_in_currency:2.1,price_change_percentage_30d_in_currency:-3.2,
    high_24h:79200,low_24h:74800,total_volume:3.1e10,market_cap:1.54e12,market_cap_rank:1,
    fully_diluted_valuation:1.63e12,max_supply:21000000,circulating_supply:19800000,
    sparkline_in_7d:{price:[75000,76000,75500,76800,77839,77100,76500,77000,77839]}},
  ethereum:{id:'ethereum',symbol:'eth',current_price:3121,price_change_percentage_24h:-0.4,
    price_change_percentage_7d_in_currency:1.1,price_change_percentage_30d_in_currency:5.5,
    high_24h:3160,low_24h:3050,total_volume:1.8e10,market_cap:3.75e11,market_cap_rank:2,
    fully_diluted_valuation:3.75e11,max_supply:0,circulating_supply:120000000,
    sparkline_in_7d:{price:[3100,3120,3110,3135,3121,3090,3110,3125,3121]}},
  solana:{id:'solana',symbol:'sol',current_price:142.3,price_change_percentage_24h:2.1,
    price_change_percentage_7d_in_currency:-1.2,price_change_percentage_30d_in_currency:8.9,
    high_24h:144,low_24h:136,total_volume:4.2e9,market_cap:6.6e10,market_cap_rank:5,
    fully_diluted_valuation:8.2e10,max_supply:0,circulating_supply:460000000,
    sparkline_in_7d:{price:[138,139,140,141,142.3,141,140.5,141.8,142.3]}}
};

async function fakeFetch(url){
  url=String(url);
  if(url.indexOf('alternative.me')!==-1)
    return {ok:true,status:200,json:async()=>({data:[{value:'57',value_classification:'Greed',timestamp:'1789344000'}]})};
  if(url.indexOf('mempool.space')!==-1)
    return {ok:true,status:200,json:async()=>({fastestFee:4,halfHourFee:3,hourFee:3,economyFee:2,minimumFee:1})};
  if(url.indexOf('geckoterminal')!==-1)
    return {ok:true,status:200,json:async()=>({data:[
      {id:'eth_0xabc',attributes:{name:'SHIB/WETH',base_token_price_usd:'0.00002',price_change_percentage:{h24:'12.5'},volume_usd:{h24:'5000000'}}},
      {id:'sol_0xdef',attributes:{name:'BONK/SOL',base_token_price_usd:'0.00000003',price_change_percentage:{h24:'8.2'},volume_usd:{h24:'3000000'}}}]})};
  if(url.indexOf('pollinations')!==-1)
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:'FREE-LLM: trends read from live context — 2/3 tracked assets up, top pools SHIB/WETH, BONK/SOL.'}}]})};
  if(url.indexOf('coingecko')!==-1){
    const ids=(url.match(/ids=([^&]+)/)||[])[1]||'bitcoin';
    const list=ids.split(',').map(id=>CG_ROWS[id]).filter(Boolean);
    return {ok:true,status:200,json:async()=>list};
  }
  if(url.indexOf('deepseek')!==-1)
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:'TRENDS: RISK ON — 2/3 tracked assets up on 24h live data (CoinGecko).'}}]})};
  if(url.indexOf('anthropic')!==-1)
    return {ok:true,status:200,json:async()=>({content:[{text:'OK'}]})};
  if(url.indexOf('openai')!==-1)
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:'OK'}}]})};
  return {ok:false,status:404,json:async()=>[]};
}

module.exports={ document, byId, docEls, makeEl, windowObj, fakeSetInterval, fakeClearInterval,
  fakeSetTimeout, fakeClearTimeout, fakeRaf, pump, fakeFetch, fireTimer, mem };
