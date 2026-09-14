'use strict';
const fs=require('fs'), vm=require('vm');
const D=require('./dom-office.js');
const html=fs.readFileSync(process.argv[2]||'pixel-office.html','utf8');
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
  await flush(5);
  const DESK=sb.window.__DESK__;
  assert(DESK && DESK.state, '__DESK__ exported with state');
  if(!DESK){ console.log('RESULT: '+pass+' passed, '+fail+' failed'); return; }
  const state=DESK.state, doc=D.document;

  /* defaults */
  assert(state.llm && state.llm.provider==='free' && state.llm.medium==='both', 'llm defaults: FREE (keyless) / both');
  assert(DESK.MARKET.fng && DESK.MARKET.fng.value===57, 'Fear & Greed auto-connected (57/Greed)');
  assert(DESK.MARKET.fees && DESK.MARKET.fees.fastest===4, 'mempool fees auto-connected (4 sat/vB)');
  assert(DESK.MARKET.trending && DESK.MARKET.trending.rows.length===2, 'trending pools auto-connected (2 rows)');
  assert(DESK.MARKET.free.online.length===3 && DESK.MARKET.free.offline.length===0, 'all 3 free sources online');
  assert(doc.getElementById('cFree').textContent.indexOf('FREE APIS: 3/3')!==-1, 'free-apis chip shows 3/3');
  assert(Array.isArray(state.bulletin), 'bulletin array exists');

  /* settings modal */
  doc.getElementById('bSettings').click();
  assert(!!doc.getElementById('llmProvider'), 'settings modal has provider select');
  assert(doc.getElementById('llmMedium').value==='both', 'medium select defaults to both');
  assert(!!doc.getElementById('llmKey_deepseek') && !!doc.getElementById('llmKey_claude') && !!doc.getElementById('llmKey_openai'), 'three key inputs present');
  assert(!!doc.getElementById('llmTest') && !!doc.getElementById('llmApply') && !!doc.getElementById('llmDone'), 'test/apply/done buttons present');

  /* UI apply: mode + medium + key */
  doc.getElementById('llmKey_deepseek').value='test-key-123';
  doc.getElementById('llmProvider').value='deepseek';
  doc.getElementById('llmModel').value='deepseek-chat';
  doc.getElementById('llmMedium').value='bulletin';
  doc.getElementById('llmApply').click();
  assert(state.llm.keys.deepseek==='test-key-123', 'apply stored the deepseek key');
  assert(state.llm.medium==='bulletin', 'apply stored medium=bulletin');
  assert(Object.keys(state.agents).every(id=>state.agents[id].provider==='deepseek'), 'apply stamped provider on all desks');
  assert(Object.keys(state.agents).every(id=>state.agents[id].apiKey==='test-key-123'), 'apply stamped key on all desks');

  /* test connection (mocked deepseek) */
  doc.getElementById('llmTest').click();
  await flush(4);
  const st=doc.getElementById('llmStatus');
  assert(st.textContent.indexOf('OK —')!==-1, 'test connection reports OK: '+st.textContent.slice(0,40));
  doc.getElementById('llmDone').click();
  assert(doc.getElementById('modalRoot').children.length===0, 'SAVE & CLOSE shuts the modal');

  /* go offline for the local-answer flow */
  state.llm.keys={deepseek:'',claude:'',openai:''};
  DESK.applyLLM();

  /* alias + routing */
  assert(DESK.routeDesk('btc latest price give me','BTC')==='marketintel', 'price query routes to marketintel');
  assert(DESK.routeDesk('what are the current trends',null)==='marketintel', 'trends query routes to marketintel');
  assert(DESK.routeDesk('check whales for accumulation',null)==='whale', 'whale query routes to whale desk');
  assert(DESK.routeDesk('is this token a scam',null)==='security', 'scam query routes to security desk');

  /* boss query: BCS typo → BTC price via marketintel, live-data answer */
  const q1=DESK.bossQuery('BCS, latest price, give me');
  assert(!!q1 && q1.assignedTo==='marketintel', 'boss query created a task on the marketintel desk');
  assert(DESK.units.marketintel.busy===true, 'marketintel unit flagged busy (working)');
  const t1=q1.timer;
  assert(t1!==null, 'work timer armed');
  D.fireTimer(t1);
  await flush(5);
  assert(q1.status==='done' && !!q1.reply, 'task finished with a reply');
  assert(q1.reply.indexOf('LIVE DATA')!==-1, 'offline reply carries live-data label');
  assert(q1.reply.indexOf('BTC')!==-1 && q1.reply.indexOf('$77,839')!==-1, 'offline reply quotes the live BTC price');
  assert(state.priceHover && state.priceHover.sym==='BTC', 'price tag hovering with BTC');
  assert(state.bulletin.length===1, 'bulletin has 1 post');
  assert(state.bulletin[0].text===q1.reply, 'bulletin post is the price answer');

  /* trends → market kind + bulletin (medium=bulletin: no agent bubble) */
  const q2=DESK.bossQuery('Hey, what are the current trends?');
  assert(!!q2 && q2.assignedTo==='marketintel', 'trends query routed to marketintel');
  assert(q2.kind==='market', 'trends task classified as market');
  D.fireTimer(q2.timer);
  await flush(5);
  assert(q2.status==='done' && !!q2.reply, 'trends task finished');
  assert(/regime/i.test(q2.reply), 'trends reply mentions regime');
  assert(state.bulletin.length===2, 'bulletin has 2 posts');
  assert(state.bulletin[0].text===q2.reply, 'newest bulletin post is the trends answer');

  /* LLM mode: key present → provider answer lands on the bulletin */
  state.llm.keys.deepseek='test-k';
  state.llm.provider='deepseek'; state.llm.model='deepseek-chat';
  DESK.applyLLM();
  assert(state.agents.marketintel.apiKey==='test-k', 'applyLLM gives the desk its provider key');
  const q3=DESK.bossQuery('what are the current trends now');
  D.fireTimer(q3.timer);
  await flush(6);
  assert(q3.status==='done' && !!q3.reply, 'LLM query finished');
  assert(q3.reply.indexOf('TRENDS: RISK ON')!==-1, 'LLM reply came from the mocked provider');
  assert(state.bulletin[0].text===q3.reply, 'LLM answer on the bulletin');

  /* canned command also lands on the bulletin */
  DESK.runCommand('Market update');
  await flush(4);
  assert(state.bulletin.length===4, 'canned command posted to bulletin');

  /* free LLM mode: keyless desks answer through the free tier */
  state.llm.keys={deepseek:'',claude:'',openai:''};
  DESK.autoFreeMode();
  assert(state.llm.provider==='free' && state.agents.marketintel.provider==='free', 'autoFreeMode switches keyless desks to FREE');
  const q4=DESK.bossQuery('what are the current trends now');
  D.fireTimer(q4.timer);
  await flush(6);
  assert(q4.status==='done' && q4.reply.indexOf('FREE-LLM')!==-1, 'free LLM answered the desk');
  assert(state.bulletin[0].text===q4.reply, 'free-LLM answer on the bulletin');

  /* trending command quotes real free data */
  DESK.runCommand('Find trending coins');
  await flush(4);
  assert(state.bulletin.length===6 && state.bulletin[0].text.indexOf('SHIB/WETH')!==-1, 'trending command quotes GeckoTerminal pools');

  /* self-learning loop */
  const nmi=state.agents.marketintel;
  assert(nmi.stats.tasks>=3, 'desk counted its finished tasks ('+nmi.stats.tasks+')');
  DESK.rateAnswer('marketintel',true,{kind:'market',title:'trends test'});
  assert(nmi.stats.rated===1 && nmi.stats.good===1 && nmi.lessons.length===1, 'GOOD rating recorded + lesson learned');
  DESK.rateAnswer('marketintel',false,{kind:'market',title:'trends test'});
  assert(nmi.stats.bad===1 && /uncertainty/.test(nmi.lessons[0].text), 'FLAG rating writes an uncertainty lesson');
  const dc=DESK.deskContext(nmi,'market');
  assert(dc.indexOf('YOUR LEARNING MEMORY')!==-1 && dc.indexOf('YOUR TRACK RECORD')!==-1, 'desk context carries memory + track record');
  const pos=DESK.openTrade('BTC','long',100,{id:'marketintel',task:'T1'});
  assert(!!pos && pos.adv && pos.adv.id==='marketintel', 'paper trade attributed to the advising desk');
  DESK.closeTrade(pos.id);
  assert(nmi.stats.wins+nmi.stats.losses===1, 'closed trade credited a win/loss to the desk');
  assert(nmi.lessons.length>=2, 'trade outcome written as a lesson');
  DESK.officeDigest();
  assert(state.officeMemory.length===1 && /Most-confirmed desk/.test(state.officeMemory[0].text), 'daily learning digest written');

  /* training-data capture + export */
  assert(state.training.length>=4, 'answers captured as training records ('+state.training.length+')');
  const rec0=state.training[0];
  assert(rec0.system.indexOf('YOUR CHARTER')!==-1 && rec0.reply && rec0.desk==='marketintel', 'record has system/user/reply + desk');
  const lines=DESK.trainingJSONL();
  const parsed=lines.split('\n').map(l=>JSON.parse(l));
  assert(parsed.length===state.training.length && parsed[0].messages.length===3 && parsed[0].metadata.desk==='marketintel', 'JSONL parses: 3-role messages + metadata');
  assert(/good|bad/.test(parsed.filter(x=>x.metadata.rating).map(x=>x.metadata.rating).join('')), 'ratings recorded in metadata');
  assert(parsed.some(x=>x.metadata.trade_pnl!==null), 'trade P&L recorded in metadata');

  /* per-character looks */
  const L=DESK.LOOKS;
  assert(L && state.agents.orchestrator.style.indexOf('strawhat')!==-1, 'Luffy wears the straw hat');
  assert(state.agents.technical.weapon==='sword' && state.agents.technical.hair==='#3ea23e', 'Zoro green hair + sword');
  assert(state.agents.tokenomics.coverEye==='right' && state.agents.tokenomics.hair==='#f2c14e', 'Sanji blond, one eye covered');
  assert(state.agents.dex===undefined, 'bench desks not hired yet');
  const bdx=DESK.BENCH.filter(b=>b.id==='dex')[0];
  const chopper=DESK.mkAgent(bdx);
  assert(chopper.horns===true && chopper.blush===true, 'Chopper (bench) gets horns + blush on hire');
  assert(state.agents.unlock===undefined && DESK.mkAgent(DESK.BENCH.filter(b=>b.id==='unlock')[0]).mask==='skull', 'Brook skull face on hire');
  assert(state.agents.committee.beard==='white' && state.agents.committee.skin==='#e8e4d8', 'Elders white beard + pale skin');
  assert(state.agents.whale.fang===true && state.agents.whale.style.indexOf('bald')!==-1, 'Jinbe bald + fang');
  assert(DESK.D2.BOSS.style.indexOf('slickback')!==-1, 'boss has a distinct look');
  const outs=new Set(Object.keys(state.agents).map(id=>state.agents[id].outfit));
  assert(outs.size>=14, 'at least 14 distinct outfits ('+outs.size+')');

  /* frame() with price hover + busy dots runs clean */
  state.priceHover={id:'marketintel',sym:'BTC',price:'77,839.00',chg:'+1.35%',until:Date.now()+99999};
  DESK.units.marketintel.busy=true; DESK.units.marketintel.mode='work';
  let crash=null;
  try{ D.pump(12); }catch(e){ crash=e; }
  assert(!crash, '12 frames with hover tag + working dots'+(crash?' — '+crash.message:''));
  assert(state.priceHover!==null, 'price hover survived frames');

  /* NAKAMA-style port: prop tiles + auto-tour */
  const ov2=doc.getElementById('ov');
  const propTiles=()=>ov2.querySelectorAll('.tile').filter(t=>t._cls.has('prop'));
  assert(propTiles().length===6, '6 prop tiles over the lounge props');
  doc.getElementById('bTour').click();
  assert(!!state.tour && state.tourIdx===1, 'AUTO-TOUR started');
  assert(DESK.units.you.tx===36 && DESK.units.you.ty===DESK.LOUNGE_Y+14, 'CIO walks to the espresso machine');
  const zls=ov2.querySelectorAll('.zlabel');
  assert(zls.length===1 && zls[0].style.opacity===1, 'lounge label lit during lounge stop');
  const boards=ov2.querySelectorAll('.banner').filter(b=>b.textContent==='MARKET BOARD');
  assert(boards.length===1 && boards[0].style.opacity===0.45, 'market board dimmed during lounge stop');
  doc.getElementById('bTour').click();
  assert(state.tour===null, 'second click stops the tour');
  const jt=propTiles().filter(t=>t.title==='Jukebox')[0];
  assert(!!jt, 'jukebox prop tile found');
  jt.click();
  assert(state.jukebox===true, 'jukebox tile toggles MUSIC');
  doc.dispatchKey('t');
  assert(!!state.tour, 'key t starts the tour');
  doc.dispatchKey('t');
  assert(state.tour===null, 'key t stops the tour');
  let crash2=null;
  try{ D.pump(10); }catch(e){ crash2=e; }
  assert(!crash2, 'frames with tour movement run clean'+(crash2?' — '+crash2.message:''));

  /* front SEND button runs the boss order */
  doc.getElementById('cmdInput').value='BTC latest price';
  doc.getElementById('bSend').click();
  assert(state.tasks.length>0 && state.tasks[0].title==='BTC latest price', 'front SEND button runs the boss order');

  /* live clock */
  DESK.renderClock();
  const clk=doc.getElementById('cClock');
  assert(/LIVE TIME \d{2}:\d{2}:\d{2}/.test(clk.textContent), 'live clock ticks: '+clk.textContent);

  /* bulletin clear */
  doc.getElementById('bBulletinClear').click();
  assert(state.bulletin.length===0, 'CLEAR empties the bulletin');

  console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
}
main().catch(e=>{ console.error('HARNESS ERROR',e); process.exit(2); });
