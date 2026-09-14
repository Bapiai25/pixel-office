'use strict';
const fs=require('fs'), vm=require('vm');
const D=require('./dom-play.js');
const file=process.argv[2]||'pixel-play-space.html';
const html=fs.readFileSync(file,'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];

const sb={ window:D.windowObj, document:D.document, fetch:D.fakeFetch,
  requestAnimationFrame:D.fakeRaf, cancelAnimationFrame(){},
  setInterval:D.fakeSetInterval, clearInterval:D.fakeClearInterval,
  setTimeout:D.fakeSetTimeout, clearTimeout:D.fakeClearTimeout, console };
vm.runInNewContext(js,sb,{timeout:8000});

let pass=0, fail=0;
function assert(cond,msg){
  if(cond){ pass++; console.log('  ok  '+msg); }
  else{ fail++; console.log('FAIL  '+msg); }
}
function flush(n){ return new Promise(r=>{ let i=0; (function f(){ if(++i>n) return r(); setImmediate(f); })(); }); }

async function main(){
  await flush(4); /* let init + fetch microtasks settle */
  const SP=sb.window.__SPACE__;
  assert(SP && SP.state, '__SPACE__ exported with state');
  if(!SP){ console.log('pass '+pass+' fail '+fail); return; }
  const state=SP.state, doc=D.document, ov=doc.getElementById('ov');
  const propTiles=()=>ov.querySelectorAll('.tile').filter(t=>t._cls.has('prop'));

  assert(doc.getElementById('bTour')!==null, 'AUTO-TOUR button present');
  assert(ov.querySelectorAll('.zlabel').length===7, '7 zone labels on overlay');
  assert(propTiles().length===6, '6 prop tiles after boot');
  assert(state.tour===null && state.tourIdx===0, 'tour off at boot');

  /* tour on */
  doc.getElementById('bTour').click();
  assert(!!state.tour, 'click bTour -> tour timer running');
  assert(state.tourIdx===1, 'first tour step ran');
  const z0=SP.ZONES[0];
  assert(state.you.tx===z0.x && state.you.ty===z0.y, 'visitor walks to first zone '+z0.id);
  const zl=ov.querySelectorAll('.zlabel');
  const lit=zl.filter(l=>l.style.opacity===1).length;
  const dim=zl.filter(l=>l.style.opacity===0.45).length;
  assert(lit===1 && dim===6, 'exactly one zone label lit ('+lit+' lit / '+dim+' dim)');

  /* tour off */
  doc.getElementById('bTour').click();
  assert(state.tour===null, 'second click stops tour');
  assert(doc.getElementById('bTour')._cls.has('on')===false, 'bTour .on cleared');

  /* keyboard */
  doc.dispatchKey('t');
  assert(!!state.tour, 'key t starts tour');
  doc.dispatchKey('t');
  assert(state.tour===null, 'key t again stops tour');

  /* prop tiles */
  const juke=propTiles().filter(t=>t.title==='Jukebox')[0];
  assert(!!juke, 'jukebox tile found');
  if(juke){
    juke.click();
    assert(state.party===true, 'jukebox click starts MUSIC');
    juke.click();
    assert(state.party===false, 'jukebox click again stops MUSIC');
  }
  const pool=propTiles().filter(t=>t.title.indexOf('Pool')!==-1)[0];
  assert(!!pool, 'pool table tile found');
  if(pool){
    const tx0=state.you.tx, ty0=state.you.ty;
    pool.click();
    assert(state.you.tx===196 && state.you.ty===250, 'pool click walks visitor to the table');
  }
  const sofa=propTiles().filter(t=>t.title.indexOf('Sofa')!==-1)[0];
  if(sofa){ sofa.click(); assert(state.you.tx===66 && state.you.ty===168, 'sofa click walks visitor over'); }
  const coffee=propTiles().filter(t=>t.title.indexOf('Coffee')!==-1)[0];
  if(coffee){ coffee.click(); assert(state.you.tx===286 && state.you.ty===190, 'coffee click walks visitor over'); }

  /* plates rebuild keeps props */
  SP.refreshPlates();
  assert(propTiles().length===6, 'prop tiles survive refreshPlates rebuild');

  /* frames run clean */
  let crash=null;
  try{ D.pump(12); }catch(e){ crash=e; }
  assert(!crash, '12 animation frames run without error'+(crash?' — '+crash.message:''));
  assert(state.team.length>=6, 'starter team spawned ('+state.team.length+')');

  console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
}
main().catch(e=>{ console.error('HARNESS ERROR',e); process.exit(2); });
