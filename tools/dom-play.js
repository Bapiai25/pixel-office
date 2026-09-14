'use strict';
/* minimal mock DOM for pixel-play-space smoke checks */

function ctxProxy(){
  return new Proxy(function(){}, {
    get(t,k){ if(k==='canvas') return byId['world']; return ctxProxy(); },
    set(){ return true; },
    apply(){ return undefined; }
  });
}

function makeEl(tag){
  const el={
    tag: String(tag).toUpperCase(), children: [], style: {}, dataset: {},
    _cls: new Set(), _text:'', _inner:'', parentNode: null, _ev: {},
    addEventListener(ev,fn){ (el._ev[ev]=el._ev[ev]||[]).push(fn); },
    appendChild(ch){ if(ch.parentNode) ch.parentNode.removeChild(ch); el.children.push(ch); ch.parentNode=el; return ch; },
    removeChild(ch){ const i=el.children.indexOf(ch); if(i>=0) el.children.splice(i,1); ch.parentNode=null; return ch; },
    remove(){ if(el.parentNode) el.parentNode.removeChild(el); },
    click(){ (el._ev.click||[]).slice().forEach(f=>f({target:el,stopPropagation(){},preventDefault(){},clientX:0,clientY:0})); },
    getBoundingClientRect(){ return {left:0,top:0,width:480,height:664}; },
    focus(){},
    querySelector(sel){ return el.querySelectorAll(sel)[0]||null; },
    querySelectorAll(sel){ return matchAll(el,sel); },
    getContext(){ return ctxProxy(); }
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
  Object.defineProperty(el,'innerHTML',{
    get(){ return el._inner; },
    set(v){ el._inner=String(v);
      if(v===''){ el.children.length=0; }
      el._text=String(v).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&[a-z#0-9]+;/g,''); }
  });
  Object.defineProperty(el,'textContent',{
    get(){ return el._text; },
    set(v){ el._text=String(v); el._inner=String(v); }
  });
  return el;
}

function matchAll(root,sel){
  const out=[];
  const cls=String(sel).split('.').filter(Boolean);
  (function walk(n){
    if(n!==root && cls.every(c=>n._cls.has(c))) out.push(n);
    n.children.forEach(walk);
  })(root);
  return out;
}

const byId={}, docEls=[];
const document={
  body: makeEl('body'),
  _ev: {},
  addEventListener(ev,fn){ (document._ev[ev]=document._ev[ev]||[]).push(fn); },
  createElement(tag){ const el=makeEl(tag); docEls.push(el); return el; },
  getElementById(id){ return byId[id]||null; },
  querySelectorAll(sel){ const cls=String(sel).split('.').filter(Boolean); return docEls.filter(e=>cls.every(c=>e._cls.has(c))); },
  dispatchKey(k){ (document._ev.keydown||[]).forEach(f=>f({key:k,target:{tagName:'DIV'},preventDefault(){}})); }
};

const IDS=['an','ava','bars','bDay','bInvite','bNight','bParty','bReset','bRoam','bScan','bSfx','bTour',
  'cMood','crewList','decorCount','divName','growBar','growLabel','growthLog','hdrSub','law','log','mand',
  'modalRoot','nm','ov','railText','rl','scan','tag','tickerBadge','toasts','viewBody','viewTitle','world','zoneList'];
IDS.forEach(id=>{ const el=makeEl(id==='world'?'canvas':'div'); byId[id]=el; docEls.push(el); });

const timers={ seq:1, map:new Map() };
function fakeSetInterval(fn,ms){ const id=timers.seq++; timers.map.set(id,{fn,ms}); return id; }
function fakeClearInterval(id){ timers.map.delete(id); }
function fakeSetTimeout(fn,ms){ const id=timers.seq++; timers.map.set(id,{fn,ms}); return id; }
function fakeClearTimeout(id){ timers.map.delete(id); }
function fireTimer(id){ const t=timers.map.get(id); if(t){ timers.map.delete(id); t.fn(); } }

let rafQ=[], now=0;
function fakeRaf(cb){ rafQ.push(cb); return rafQ.length; }
function pump(n){ for(let i=0;i<n;i++){ const q=rafQ; rafQ=[]; q.forEach(cb=>cb(now+=33)); } }

async function fakeFetch(url){
  if(String(url).indexOf('coingecko')!==-1){
    return { ok:true, status:200, json:async()=>[
      {id:'bitcoin',current_price:77839,price_change_percentage_24h:1.35},
      {id:'ethereum',current_price:3121,price_change_percentage_24h:-0.4},
      {id:'solana',current_price:142,price_change_percentage_24h:2.1}] };
  }
  return { ok:false, status:404, json:async()=>[] };
}

const windowObj={ AudioContext:undefined, webkitAudioContext:undefined, __SPACE__:undefined };

module.exports={ document, byId, docEls, makeEl, windowObj, fakeSetInterval, fakeClearInterval,
  fakeSetTimeout, fakeClearTimeout, fakeRaf, pump, fakeFetch, fireTimer };
