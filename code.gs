/*** =====================================================================
 *   AI TOOLKIT  v4  "JARVIS"   —   Code.gs
 *   JavaScript (Google Apps Script).  Everything here is free.
 *
 *   NEW IN v4
 *   · An agent loop: think → use a tool → look → decide → repeat
 *   · A real Contacts tab you can see and edit
 *   · Gmail triage: read, rank, summarise, draft
 *   · Telegram: talk to your sheet from your phone
 *   · Model auto-discovery and self-healing (from v3)
 *   ===================================================================== */

var STORE='AI_KEYS_V1', PROFILE='AI_PROFILE_V1', STATS='AI_STATS_V1',
    EXTRA='AI_EXTRA_PROVIDERS', TG='AI_TELEGRAM_V1', MEMO='AI_MEMORY_V1';
var COOLDOWN_SECONDS=65, MAX_PHOTO_BYTES=7000, MODEL_CACHE_SECONDS=21600;
var CONTACTS_SHEET='Contacts', AGENT_MAX_STEPS=8;

/* =====================================================================
   1. PROVIDERS — base URLs only, never a model name
   ===================================================================== */
var BOOK = {
  gemini:      { label:'Google Gemini', shape:'google', prefix:'AIza', free:true,
                 base:'https://generativelanguage.googleapis.com/v1beta',
                 get:'aistudio.google.com/apikey' },
  groq:        { label:'Groq', shape:'openai', prefix:'gsk_', free:true,
                 base:'https://api.groq.com/openai/v1', get:'console.groq.com/keys' },
  openrouter:  { label:'OpenRouter', shape:'openai', prefix:'sk-or-', free:true,
                 base:'https://openrouter.ai/api/v1', get:'openrouter.ai/keys' },
  cerebras:    { label:'Cerebras', shape:'openai', prefix:'csk-', free:true,
                 base:'https://api.cerebras.ai/v1', get:'cloud.cerebras.ai' },
  nvidia:      { label:'NVIDIA NIM', shape:'openai', prefix:'nvapi-', free:true,
                 base:'https://integrate.api.nvidia.com/v1', get:'build.nvidia.com' },
  together:    { label:'Together AI', shape:'openai', prefix:'tgp_', free:true,
                 base:'https://api.together.xyz/v1', get:'api.together.ai' },
  huggingface: { label:'Hugging Face', shape:'openai', prefix:'hf_', free:true,
                 base:'https://router.huggingface.co/v1', get:'huggingface.co/settings/tokens' },
  mistral:     { label:'Mistral', shape:'openai', prefix:'', free:true,
                 base:'https://api.mistral.ai/v1', get:'console.mistral.ai' },
  deepseek:    { label:'DeepSeek', shape:'openai', prefix:'sk-', free:false,
                 base:'https://api.deepseek.com/v1', get:'platform.deepseek.com' },
  openai:      { label:'OpenAI', shape:'openai', prefix:'sk-proj-', free:false,
                 base:'https://api.openai.com/v1', get:'platform.openai.com' },

  /* ---- added after the field test ---- */
  fireworks:   { label:'Fireworks AI', shape:'openai', prefix:'fw_', free:true,
                 base:'https://api.fireworks.ai/inference/v1',
                 get:'fireworks.ai/account/api-keys' },
  chutes:      { label:'Chutes AI', shape:'openai', prefix:'cpk_', free:true,
                 base:'https://llm.chutes.ai/v1', get:'chutes.ai' },
  sambanova:   { label:'SambaNova', shape:'openai', prefix:'', free:true,
                 base:'https://api.sambanova.ai/v1', get:'cloud.sambanova.ai' },
  nebius:      { label:'Nebius AI Studio', shape:'openai', prefix:'', free:true,
                 base:'https://api.studio.nebius.com/v1', get:'studio.nebius.com' },
  deepinfra:   { label:'DeepInfra', shape:'openai', prefix:'', free:true,
                 base:'https://api.deepinfra.com/v1/openai', get:'deepinfra.com/dash/api_keys' },
  hyperbolic:  { label:'Hyperbolic', shape:'openai', prefix:'', free:true,
                 base:'https://api.hyperbolic.xyz/v1', get:'app.hyperbolic.xyz' },
  scaleway:    { label:'Scaleway', shape:'openai', prefix:'', free:true,
                 base:'https://api.scaleway.ai/v1', get:'console.scaleway.com' },
  cohere:      { label:'Cohere', shape:'openai', prefix:'', free:true,
                 base:'https://api.cohere.ai/compatibility/v1', get:'dashboard.cohere.com/api-keys' },
  ai21:        { label:'AI21 Labs', shape:'openai', prefix:'', free:true,
                 base:'https://api.ai21.com/studio/v1', get:'studio.ai21.com' },
  ollama:      { label:'Ollama Cloud', shape:'openai', prefix:'', free:true,
                 base:'https://ollama.com/v1', get:'ollama.com' },
  cloudflare:  { label:'Cloudflare Workers AI', shape:'openai', prefix:'', free:true,
                 base:'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1',
                 needsAccount:true, get:'dash.cloudflare.com/profile/api-tokens' },
  ovh:         { label:'OVH AI Endpoints', shape:'openai', prefix:'', free:true,
                 base:'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
                 get:'endpoints.ai.cloud.ovh.net' },

  /* ---- more permanent free tiers ---- */
  github:      { label:'GitHub Models', shape:'openai', prefix:'github_pat_', free:true,
                 base:'https://models.github.ai/inference',
                 get:'github.com/settings/tokens' },
  nscale:      { label:'Nscale', shape:'openai', prefix:'', free:true,
                 base:'https://inference.api.nscale.com/v1', get:'console.nscale.com' },
  siliconflow: { label:'SiliconFlow', shape:'openai', prefix:'', free:true,
                 base:'https://api.siliconflow.com/v1', get:'siliconflow.com' },
  zai:         { label:'Z.AI (Zhipu)', shape:'openai', prefix:'', free:true,
                 base:'https://api.z.ai/api/paas/v4', get:'z.ai' },
  modelscope:  { label:'ModelScope', shape:'openai', prefix:'', free:true,
                 base:'https://api-inference.modelscope.cn/v1', get:'modelscope.cn' },
  llm7:        { label:'LLM7 (no key needed)', shape:'openai', prefix:'', free:true,
                 base:'https://api.llm7.io/v1', get:'llm7.io' }
};

/* Cloudflare needs an account id in the address. Paste it as accountid:token */
function splitAccountKey(raw, force){
  var s=String(raw||'').trim();
  var i=s.indexOf(':');
  if(i<1) return { account:'', key:s };
  /* When we already know this company needs an account, split on the first colon.
     When guessing, insist on a longer left side so we do not mangle an ordinary key. */
  if(!force && i<8) return { account:'', key:s };
  return { account:s.slice(0,i).trim(), key:s.slice(i+1).trim() };
}
function withAccount(base, account){
  return String(base).split('{account}').join(String(account||''));
}

function detectProvider(key){
  var k=String(key||'').trim(), best='', len=-1;
  for(var id in BOOK){ var p=BOOK[id].prefix;
    if(p && k.indexOf(p)===0 && p.length>len){ best=id; len=p.length; } }
  return best;
}
function baseFor(b, account){
  return b.needsAccount ? withAccount(b.base, account) : b.base;
}
function chatUrl(b,model,key,account){ return b.shape==='google'
  ? b.base+'/models/'+model+':generateContent?key='+key
  : baseFor(b,account)+'/chat/completions'; }
function modelsUrl(b,key,account){ return b.shape==='google'
  ? b.base+'/models?key='+key : baseFor(b,account)+'/models'; }

/* =====================================================================
   2. MODEL DISCOVERY
   ===================================================================== */
var BAD_WORDS=['whisper','embed','tts','audio','rerank','guard','moderation','image',
  'vision','video','dall','stable','flux','safety','bge','clip','ocr','transcribe'];
var GOOD_HINTS=['instruct','chat','versatile','flash','turbo','oss','small','mini'];

var NEVER=-1000;   // a hard no. Anything above this is usable if nothing better exists.

function scoreModel(id, info){
  var m=String(id).toLowerCase(), s=0;
  for(var i=0;i<BAD_WORDS.length;i++) if(m.indexOf(BAD_WORDS[i])!==-1) return NEVER;
  if(info){
    if(info.free===true)  s+=60;   // a free model beats a clever one every time
    if(info.free===false) s-=45;   // paid: try it only when nothing free is left
    if(info.declared===true) s+=25; // the company itself says this one can chat
  }
  if(m.indexOf(':free')!==-1) s+=40;
  if(m.indexOf('free')!==-1)  s+=20;
  for(var g=0;g<GOOD_HINTS.length;g++) if(m.indexOf(GOOD_HINTS[g])!==-1) s+=6;
  if(m.indexOf('llama')!==-1) s+=12;
  if(m.indexOf('gpt-oss')!==-1) s+=12;
  if(m.indexOf('qwen')!==-1) s+=8;
  if(m.indexOf('mistral')!==-1) s+=8;
  if(m.indexOf('gemma')!==-1) s+=6;
  if(m.indexOf('flash-lite')!==-1) s+=14;
  if(m.indexOf('2.5')!==-1) s+=6;
  if(m.indexOf('3.3')!==-1) s+=6;
  if(m.indexOf('preview')!==-1) s-=8;
  if(m.length>60) s-=5;
  return s;
}
function pickBestModel(ids, exclude, meta){
  var skip={}, ex=exclude||[], mt=meta||{};
  for(var e=0;e<ex.length;e++) skip[ex[e]]=true;
  var b='', bs=NEVER;   // start at the floor, so even a last-resort model can win
  for(var i=0;i<ids.length;i++){
    if(skip[ids[i]]) continue;
    var s=scoreModel(ids[i], mt[ids[i]]);
    if(s<=NEVER) continue;                      // whisper, embeddings, image models
    if(s>bs){ bs=s; b=ids[i]; } }
  return b; }

/* Models proven not to work on this key — never chosen again. */
function badModels(keyId){ var m=readJson('AI_BADMODELS',{}); return m[keyId]||[]; }
function markBadModel(keyId, model){
  if(!model) return;
  var m=readJson('AI_BADMODELS',{}), l=m[keyId]||[];
  if(l.indexOf(model)===-1) l.push(model);
  if(l.length>25) l=l.slice(-25);
  m[keyId]=l; writeJson('AI_BADMODELS',m); }
function clearBadModels(keyId){ var m=readJson('AI_BADMODELS',{}); delete m[keyId]; writeJson('AI_BADMODELS',m); }

function fetchModelList(pid,key,account){
  var b=BOOK[pid]; if(!b) return { ok:false, why:'Unknown company.' };
  var opts={ method:'get', muteHttpExceptions:true };
  if(b.shape!=='google') opts.headers={ Authorization:'Bearer '+key };
  var res,body;
  try{ res=UrlFetchApp.fetch(modelsUrl(b,key,account),opts); body=res.getContentText(); }
  catch(e){ return { ok:false, why:'Could not reach '+b.label+'.' }; }
  if(res.getResponseCode()!==200) return { ok:false,
    why:b.label+' would not list its models ('+res.getResponseCode()+'). Usually a bad key.' };
  var d; try{ d=JSON.parse(body); }catch(e){ return { ok:false, why:'Its model list was unreadable.' }; }

  var ids=[], meta={};

  if(b.shape==='google'){
    var arr=d.models||[];
    for(var i=0;i<arr.length;i++){
      var m=arr[i]||{}, meth=m.supportedGenerationMethods||m.supportedActions||[];
      var name=String(m.name||'').replace('models/','');
      if(!name) continue;
      // Google states what each model can do. Keep only the ones that can chat.
      if(meth.length){ if(meth.indexOf('generateContent')===-1) continue; }
      else if(name.indexOf('gemini')!==0 && name.indexOf('gemma')!==0) continue;
      ids.push(name); meta[name]={ free:true, chat:true };
    }
  } else {
    var a2=(d instanceof Array)?d:(d.data||d.models||[]);
    for(var j=0;j<a2.length;j++){
      var it=a2[j]||{}, id=String(it.id||it.name||'');
      if(!id) continue;

      /* Some companies describe what a model can do. Use it when it is there.
         Mistral says capabilities.completion_chat. Trust that above everything. */
      var caps=it.capabilities||null;
      if(caps && caps.completion_chat===false) continue;

      /* Only DROP a model whose type is clearly not for chatting.
         Never require the word "chat" — Mistral labels its chat models "base". */
      var ty=String(it.type||'').toLowerCase();
      if(ty && /embed|image|audio|video|moderation|rerank|speech|vision|code_completion/.test(ty)) continue;

      // OpenRouter states the input and output types. We need text in, text out.
      var arch=it.architecture||{};
      var modality=String(arch.modality||'');
      if(modality && modality.indexOf('text->text')===-1 && modality.indexOf('->text')===-1) continue;
      if(arch.output_modalities && arch.output_modalities.join &&
         arch.output_modalities.join(',').indexOf('text')===-1) continue;

      // Is it free? Some companies price every model, so we can simply read it.
      // free stays UNDEFINED unless the company actually tells us. Silence is not "paid".
      var free;
      if(id.indexOf(':free')!==-1) free=true;
      var pr=it.pricing||{};
      if(pr.prompt!==undefined){
        var cost=Number(pr.prompt);
        if(!isNaN(cost)) free=(cost===0);
      }
      var knownChat = !!(caps && caps.completion_chat===true);
      ids.push(id); meta[id]={ free:free, chat:true, declared:knownChat };
    }
  }
  if(!ids.length) return { ok:false, why:b.label+' returned no chat models on this key.' };
  return { ok:true, models:ids, meta:meta };
}

function discoverModel(k,force){
  var ck='models_'+k.id, c=CacheService.getScriptCache(), bad=badModels(k.id);
  if(!force){
    var hit=c.get(ck);
    if(hit){ try{
      var saved=JSON.parse(hit);
      var ids=saved.ids||saved, meta=saved.meta||{};
      if(ids.length) return { ok:true, models:ids, meta:meta, chosen:pickBestModel(ids,bad,meta) };
    }catch(e){} }
  }
  var r=fetchModelList(k.provider,k.key,k.account);
  if(!r.ok) return r;
  var keep=r.models.slice(0,150), km={};
  for(var i=0;i<keep.length;i++) if(r.meta[keep[i]]) km[keep[i]]=r.meta[keep[i]];
  try{ c.put(ck, JSON.stringify({ ids:keep, meta:km }), MODEL_CACHE_SECONDS); }catch(e){}
  return { ok:true, models:r.models, meta:r.meta, chosen:pickBestModel(r.models,bad,r.meta) };
}

function healAllKeys(){
  var l=loadKeys(), rep=[];
  for(var i=0;i<l.length;i++){ var k=l[i];
    clearBadModels(k.id);   // give every model a fresh chance
    if(!BOOK[k.provider]){ rep.push({ nickname:k.nickname, ok:false, note:'Unknown company.' }); continue; }
    var d=discoverModel(k,true);
    if(!d.ok){ rep.push({ nickname:k.nickname, ok:false, note:d.why }); continue; }
    if(!d.chosen){ rep.push({ nickname:k.nickname, ok:false, note:'No usable chat model.' }); continue; }
    l[i].model=d.chosen; l[i].models=d.models.slice(0,60);
    storeKeys(l);
    var probe=tryOnce(l[i],'Reply with the single word: OK',true);
    if(probe.ok){
      var used=probe.healed||l[i].model;
      if(probe.healed){ l[i].model=probe.healed; }
      rep.push({ nickname:k.nickname, ok:true,
        note:'working on '+used+'  ('+d.models.length+' available)' });
    } else {
      rep.push({ nickname:k.nickname, ok:false, note:probe.why }); } }
  storeKeys(l); return rep;
}

/* =====================================================================
   3. STORAGE + VAULT
   ===================================================================== */
function readJson(n,f){ var r=PropertiesService.getScriptProperties().getProperty(n);
  if(!r) return f; try{ var v=JSON.parse(r); return (v===null||v===undefined)?f:v; }catch(e){ return f; } }
function writeJson(n,v){ PropertiesService.getScriptProperties().setProperty(n,JSON.stringify(v)); }
function loadKeys(){ var v=readJson(STORE,[]); return (v instanceof Array)?v:[]; }
function storeKeys(l){ writeJson(STORE,l||[]); }
function loadExtraProviders(){ var e=readJson(EXTRA,{}); for(var id in e) if(!BOOK[id]) BOOK[id]=e[id]; }

/* Ids must be unique. Date.now() alone collides when several are added quickly,
   which would make two keys share a rest bench and a score. */
var _idSeq=0;
function newKeyId(){
  _idSeq=(_idSeq+1)%100000;
  return 'k'+Date.now().toString(36)+'-'+_idSeq+'-'+Math.floor(Math.random()*1e6).toString(36);
}

function addKey(nickname,key,providerId){
  loadExtraProviders();
  var raw=String(key||'').trim();
  if(!raw) return { ok:false, why:'That was empty — paste the key itself.' };

  /* Cloudflare style: accountid:token */
  var mustSplit = !!(providerId && BOOK[providerId] && BOOK[providerId].needsAccount);
  var split=splitAccountKey(raw, mustSplit);
  var clean=raw, account='';
  if(mustSplit){
    if(!split.account || !split.key) return { ok:false,
      why:BOOK[providerId].label+' needs your account id too. Paste it as  accountid:token' };
    clean=split.key; account=split.account;
  } else if(split.account && !detectProvider(raw)){
    clean=split.key; account=split.account;       // might be Cloudflare, we will find out
  }

  var pid=providerId||detectProvider(clean);
  var how='';
  if(!pid){
    var id=identifyKey(clean, account);
    if(!id.ok) return { ok:false, why:id.why };
    pid=id.provider; how=id.how;
  }
  if(!BOOK[pid]) return { ok:false, why:'I do not know that company.' };
  if(BOOK[pid].needsAccount && !account) return { ok:false,
    why:BOOK[pid].label+' needs your account id too. Paste it as  accountid:token' };

  var l=loadKeys();
  for(var i=0;i<l.length;i++) if(l[i].key===clean) return { ok:false, why:'You already added that key.' };
  var o={ id:newKeyId(),
    nickname:String(nickname||'').trim()||(BOOK[pid].label+' '+(l.length+1)),
    provider:pid, model:'', models:[], key:clean, account:account,
    enabled:true, wins:0, fails:0 };
  var d=discoverModel(o,true);
  if(!d.ok) return { ok:false, why:d.why };
  if(!d.chosen) return { ok:false, why:BOOK[pid].label+' offered no usable chat model.' };
  o.model=d.chosen; o.models=d.models.slice(0,60);
  l.push(o); storeKeys(l);
  return { ok:true, count:l.length, company:BOOK[pid].label, model:d.chosen,
           available:d.models.length, identified:how };
}
/* If a key was filed under the wrong company, work it out again properly. */
function reidentifyKey(id){
  var l=loadKeys(), found=null, idx=-1;
  for(var i=0;i<l.length;i++) if(l[i].id===id){ found=l[i]; idx=i; }
  if(!found) return { ok:false, why:'I could not find that key.' };

  var was=BOOK[found.provider]?BOOK[found.provider].label:found.provider;
  var r=identifyKey(found.key, found.account);
  if(!r.ok) return { ok:false, why:r.why };
  if(r.provider===found.provider)
    return { ok:true, changed:false, company:was, why:'It really is '+was+'.' };

  l[idx].provider=r.provider;
  l[idx].model=''; l[idx].models=[];
  l[idx].nickname=BOOK[r.provider].label+' (was filed as '+was+')';
  storeKeys(l);
  clearBadModels(id);
  var d=discoverModel(l[idx],true);
  if(d.ok&&d.chosen){ l[idx].model=d.chosen; l[idx].models=d.models.slice(0,60); storeKeys(l); }
  return { ok:true, changed:true, from:was, company:BOOK[r.provider].label, model:l[idx].model };
}

function removeKey(id){ var l=loadKeys(),o=[]; for(var i=0;i<l.length;i++) if(l[i].id!==id) o.push(l[i]);
  storeKeys(o); return { ok:true, count:o.length }; }
function toggleKey(id){ var l=loadKeys(); for(var i=0;i<l.length;i++) if(l[i].id===id) l[i].enabled=!l[i].enabled;
  storeKeys(l); return { ok:true }; }
function setKeyModel(id,m){ var l=loadKeys(),f=false;
  for(var i=0;i<l.length;i++) if(l[i].id===id&&String(m||'').trim()){ l[i].model=String(m).trim(); f=true; }
  if(f) storeKeys(l); return { ok:f }; }
function listKeysForUI(){ loadExtraProviders();
  var l=loadKeys(),o=[];
  for(var i=0;i<l.length;i++){ var k=l[i], b=BOOK[k.provider];
    o.push({ id:k.id, nickname:k.nickname, company:b?b.label:k.provider,
      model:k.model||'(none yet)', choices:(k.models||[]).length,
      masked:String(k.key).slice(0,6)+'••••'+String(k.key).slice(-4),
      enabled:k.enabled!==false, resting:isResting(k.id), wins:k.wins||0, fails:k.fails||0 }); }
  return o; }
/* No recognisable prefix? Try each unprefixed company until one accepts the key.
   Costs one small request per candidate and only runs when we cannot tell. */
function identifyKey(key, account){
  var clean=String(key||'').trim();
  if(!clean) return { ok:false, why:'That was empty.' };

  var guess=detectProvider(clean);
  if(guess) return { ok:true, provider:guess, how:'from the key prefix' };

  var candidates=[];
  for(var id in BOOK){
    if(BOOK[id].prefix) continue;                 // prefixed ones were already ruled out
    if(BOOK[id].needsAccount && !account) continue;
    candidates.push(id);
  }
  var tried=[], catalogueOnly=[], rejected=[];
  for(var i=0;i<candidates.length;i++){
    var pid=candidates[i];
    tried.push(BOOK[pid].label);
    var r=fetchModelList(pid, clean, account);
    if(!r.ok || !r.models.length) continue;

    /* A catalogue that opens is NOT proof the key is theirs — several publish it
       to anyone. Send one tiny chat request and see if the key is actually accepted. */
    var model=pickBestModel(r.models,[],r.meta);
    if(!model) continue;
    var probe={ id:'probe', provider:pid, model:model, key:clean, account:account, nickname:BOOK[pid].label };
    var req=buildRequest(probe,'Hi');
    var code=0, body='';
    try{ var res=UrlFetchApp.fetch(req.url,req.options); code=res.getResponseCode(); body=res.getContentText(); }
    catch(e){ continue; }

    if(code===200) return { ok:true, provider:pid, how:'by asking them', tried:tried };

    /* Rate limited or out of credit still proves the key belongs to them. */
    var d=diagnose(code, BOOK[pid].label, body);
    if(d.kind==='rest'||d.kind==='billing'||d.kind==='temporary')
      return { ok:true, provider:pid, how:'by asking them', tried:tried, note:d.msg };

    if(code===401||code===403){ rejected.push(BOOK[pid].label); continue; }
    catalogueOnly.push(BOOK[pid].label);         /* odd, but remember it */
  }

  if(rejected.length||catalogueOnly.length){
    var who=rejected.concat(catalogueOnly);
    return { ok:false, tried:tried,
      why:'The key was not accepted by any of them. '+who.join(', ')+
          ' let me see their model list but then rejected the key, so it is not theirs. '+
          'Pick the right company from the list.' };
  }
  return { ok:false, why:'I tried '+tried.length+' companies and none accepted that key. '+
           'Pick the company from the list.', tried:tried };
}

function providerChoices(){ var o=[]; for(var id in BOOK)
  o.push({ id:id, label:BOOK[id].label, free:BOOK[id].free, get:BOOK[id].get,
    prefix:BOOK[id].prefix||'', needsAccount:BOOK[id].needsAccount===true });
  return o; }
function restKey(id,s){ CacheService.getScriptCache().put('rest_'+id,'1',s||COOLDOWN_SECONDS); }
function isResting(id){ return CacheService.getScriptCache().get('rest_'+id)!==null; }


/* =====================================================================
   3b. WHICH SHEET AM I WORKING ON?
   Inside the spreadsheet there is an "active" sheet and an "active"
   selection. In a deployed web app there is neither — so we remember
   the spreadsheet, and let you choose a working tab and range.
   ===================================================================== */
var BOUND='AI_BOUND_SS', WORKSET='AI_WORKSET';

function rememberSheet(){
  try{
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    if(ss){ PropertiesService.getScriptProperties().setProperty(BOUND, ss.getId()); return ss.getId(); }
  }catch(e){}
  return '';
}

function SS(){
  var ss=null;
  try{ ss=SpreadsheetApp.getActiveSpreadsheet(); }catch(e){}
  if(ss) return ss;
  var id=PropertiesService.getScriptProperties().getProperty(BOUND);
  if(id){ try{ return SpreadsheetApp.openById(id); }catch(e){} }
  return null;
}

function getWorkset(){ var w=readJson(WORKSET,{}); return { tab:w.tab||'', range:w.range||'' }; }

function setWorkset(tab, range){
  var ss=SS();
  if(!ss) return { ok:false, why:'I have lost track of the spreadsheet. Open the sheet and use the menu once.' };
  var t=String(tab||'').trim();
  if(t && !ss.getSheetByName(t)) return { ok:false, why:'There is no tab called "'+t+'".' };
  var r=String(range||'').trim().toUpperCase();
  if(r && !/^[A-Z]+\d*(:[A-Z]+\d*)?$/.test(r))
    return { ok:false, why:'That does not look like a range. Try something like A1:H61.' };
  writeJson(WORKSET,{ tab:t, range:r });
  return { ok:true, tab:t, range:r };
}

function SH(){
  var live=null;
  try{ live=SpreadsheetApp.getActiveSheet(); }catch(e){}
  if(live) return live;
  var ss=SS(); if(!ss) return null;
  var w=getWorkset();
  if(w.tab){ var picked=ss.getSheetByName(w.tab); if(picked) return picked; }
  /* Never land on the toolkit's own bookkeeping — pick a real data tab. */
  var all=ss.getSheets();
  for(var i=0;i<all.length;i++)
    if(!isInternalTab(all[i].getName()) && all[i].getLastRow()>1) return all[i];
  for(var j=0;j<all.length;j++)
    if(!isInternalTab(all[j].getName())) return all[j];
  return all.length?all[0]:null;
}

function RG(){
  var live=null;
  try{ live=SpreadsheetApp.getActiveRange(); }catch(e){}
  if(live) return live;
  var sh=SH(); if(!sh) return null;
  var w=getWorkset();
  if(w.range){ try{ return sh.getRange(w.range); }catch(e){} }
  try{
    var lastRow=sh.getLastRow(), lastCol=sh.getLastColumn();
    if(lastRow<1||lastCol<1) return null;
    return sh.getRange(1,1,Math.min(lastRow,300),Math.min(lastCol,20));
  }catch(e){ return null; }
}

function worksetInfo(){
  var ss=SS();
  if(!ss) return { ok:false, why:'I have lost track of the spreadsheet. '+
    'Open the sheet, use 🤖 AI Toolkit once, then come back.' };
  var w=getWorkset(), tabs=[], all=ss.getSheets();
  for(var i=0;i<all.length && i<25;i++)
    tabs.push({ name:all[i].getName(), rows:all[i].getLastRow(), cols:all[i].getLastColumn() });
  var live=false;
  try{ live=!!SpreadsheetApp.getActiveRange(); }catch(e){}
  var sh=SH(), using='';
  if(sh){ var rg=RG(); using=sh.getName()+(rg?('!'+rg.getA1Notation()):''); }
  return { ok:true, name:ss.getName(), url:ss.getUrl(), tabs:tabs,
           tab:w.tab, range:w.range, live:live, using:using };
}

/* =====================================================================
   4. ENGINE
   ===================================================================== */
function buildRequest(k,prompt){
  var b=BOOK[k.provider];
  if(b.shape==='google') return { url:chatUrl(b,k.model,k.key,k.account),
    options:{ method:'post', contentType:'application/json',
      payload:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] }), muteHttpExceptions:true } };
  return { url:chatUrl(b,k.model,k.key,k.account),
    options:{ method:'post', contentType:'application/json',
      headers:{ Authorization:'Bearer '+k.key },
      payload:JSON.stringify({ model:k.model, messages:[{ role:'user', content:prompt }] }),
      muteHttpExceptions:true } };
}
function readReply(k,body){
  var d; try{ d=JSON.parse(body); }catch(e){ return { ok:false, why:'the reply was not readable' }; }
  var t=null;
  if(BOOK[k.provider].shape==='google'){
    if(d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts&&d.candidates[0].content.parts[0])
      t=d.candidates[0].content.parts[0].text;
  } else if(d.choices&&d.choices[0]&&d.choices[0].message) t=d.choices[0].message.content;
  if(t===null||t===undefined||String(t).trim()===''){
    var w='the reply had no text in it';
    if(d.error&&d.error.message) w=String(d.error.message).slice(0,140);
    return { ok:false, why:w }; }
  return { ok:true, text:String(t).trim() };
}
/* Providers explain themselves in the body. We were throwing that away. */
function errorMessage(body){
  var raw=String(body||'');
  if(!raw) return '';
  var d=null; try{ d=JSON.parse(raw); }catch(e){}
  if(d){
    if(d.error){
      if(typeof d.error==='string') return d.error.slice(0,200);
      if(d.error.message) return String(d.error.message).slice(0,200);
      if(d.error.code)    return String(d.error.code).slice(0,200);
    }
    if(d.message) return String(d.message).slice(0,200);
    if(d.detail){
      if(typeof d.detail==='string') return d.detail.slice(0,200);
      try{ return JSON.stringify(d.detail).slice(0,200); }catch(e){}
    }
    if(d.errors && d.errors.length && d.errors[0].message)
      return String(d.errors[0].message).slice(0,200);
    return '';                 /* it was JSON, but it explained nothing */
  }
  return raw.replace(/\s+/g,' ').slice(0,200);
}

/* Is this complaint about the MODEL, or about the request itself?
   Getting this wrong makes us retire every model for no reason. */
/* Out of credit is not a broken key and not a broken model.
   It arrives as 400, 402, 403 or 404 depending on the company. */
function isBillingComplaint(msg){
  var m=String(msg||'').toLowerCase();
  return /payment required|insufficient|no credits|out of credit|credit balance|quota exceeded|exceeded your current quota|billing|top ?up|add credits|purchase|upgrade your plan|free trial.*(expired|ended)|subscription (required|expired)/.test(m);
}

function isModelComplaint(msg){
  var m=String(msg||'').toLowerCase();
  return /model|not_?found|does not exist|unsupported|deprecat|decommission|unavailable|no such/.test(m);
}

function diagnose(code,who,body){
  if(code===200) return { kind:'ok' };
  var why=errorMessage(body);

  /* 402 means "this model needs credit". Somewhere like OpenRouter has a free
     model right below it, so walk the list before giving up. */
  if(code===402) return { kind:'model',
    msg:who+': that model needs credit (402). Trying a free one.', detail:why };

  /* Any other mention of money is a dead end — retrying will never fix it. */
  if(isBillingComplaint(why)) return { kind:'billing',
    msg:who+': this account has no credit left.'+(why?(' It said: '+why+'.'):'')+
        ' Add credit, or switch this key off.', detail:why };

  if(code===429){
    /* On a router, "provider returned error" means the free model behind it is
       struggling — another model will usually work straight away. */
    if(/provider returned error|upstream|no (available )?(provider|endpoint)|overloaded|capacity/i.test(why))
      return { kind:'model',
        msg:who+': the model behind it is busy (429). It said: '+why+'. Trying another model.',
        detail:why };
    return { kind:'rest',
      msg:who+' is rate limited (429). Resting it.'+(why?(' It said: '+why):'') };
  }
  if(code>=500)  return { kind:'temporary',
    msg:who+' had a server problem ('+code+').'+(why?(' It said: '+why):'') };
  if(code===401||code===403) return { kind:'permanent',
    msg:who+': key rejected ('+code+').'+(why?(' It said: '+why+'.'):'')+
        ' Check for a stray space, or the wrong company.' };
  if(code===404) return { kind:'model',
    msg:who+': that model is gone (404).'+(why?(' It said: '+why):''), detail:why };
  if(code===400){
    /* A 400 can mean "no such model" OR "your request was malformed".
       Only walk the model list when the provider actually blamed the model. */
    if(isModelComplaint(why)) return { kind:'model',
      msg:who+': model rejected (400). It said: '+why, detail:why };
    return { kind:'permanent',
      msg:who+' rejected the request (400): '+(why||'no reason given')+
          '  — this is not a model problem, so I did not try others.', detail:why };
  }
  return { kind:'permanent',
    msg:who+': code '+code+(why?('. It said: '+why):'.'), detail:why };
}

function callAI(prompt,onlyId){
  loadExtraProviders();
  if(!prompt||!String(prompt).trim()) return 'BUG: nothing to send.';
  var all=loadKeys();
  if(!all.length) return 'NO KEYS YET — open the Keys tab and add one.';
  var usable=[], resting=0;
  for(var i=0;i<all.length;i++){ var k=all[i];
    if(k.enabled===false) continue;
    if(onlyId&&k.id!==onlyId) continue;
    if(!BOOK[k.provider]) continue;
    if(isResting(k.id)){ resting++; continue; }
    usable.push(k); }
  if(!usable.length) return resting
    ? 'ALL KEYS ARE RESTING — wait about a minute, or add another key.'
    : 'NO KEY AVAILABLE — every key is off.';
  var start=Math.floor(Math.random()*usable.length), first='';
  for(var n=0;n<usable.length;n++){
    var key=usable[(start+n)%usable.length];
    var out=tryOnce(key,prompt,true);
    if(out.ok){ scoreKey(key.id,true); return out.text; }
    if(out.rest) restKey(key.id);
    scoreKey(key.id,false);
    if(!first) first=out.why; }
  return 'ALL KEYS FAILED → '+first;
}

function tryOnce(key,prompt,allowHeal){
  var who=key.nickname;
  if(!key.model){ var d0=discoverModel(key,true);
    if(!d0.ok||!d0.chosen) return { ok:false, why:who+': '+(d0.why||'no usable model.') };
    setKeyModel(key.id,d0.chosen); key.model=d0.chosen; }
  var req=buildRequest(key,prompt), res,code,body;
  try{ res=UrlFetchApp.fetch(req.url,req.options); code=res.getResponseCode(); body=res.getContentText(); }
  catch(e){ return { ok:false, why:who+': could not be reached.' }; }
  var d=diagnose(code,who,body);
  if(d.kind==='ok'){ var p=readReply(key,body);
    return p.ok?{ ok:true, text:p.text }:{ ok:false, why:who+': '+p.why }; }
  if(d.kind==='billing') return { ok:false, why:d.msg, billing:true };

  if(d.kind==='model'&&allowHeal){
    // This model does not work on this key. Remember that, then try the next best.
    markBadModel(key.id, key.model);
    var fresh=discoverModel(key,true);
    if(!fresh.ok) return { ok:false, why:who+': '+fresh.why };

    var tried=[key.model], lastWhy=d.detail||'';
    for(var attempt=0; attempt<5; attempt++){
      var next=pickBestModel(fresh.models, badModels(key.id), fresh.meta);
      if(!next){
        if(isBillingComplaint(lastWhy)) return { ok:false, billing:true,
          why:who+': this account has no credit left. It said: '+lastWhy+
              '. Add credit, or switch this key off.' };
        return { ok:false,
          why:who+': none of its '+fresh.models.length+' models accepted the request. '+
              'Last reason: '+(lastWhy||'no reason given')+'. (Tried: '+tried.join(', ')+')' }; }
      setKeyModel(key.id,next); key.model=next; tried.push(next);

      var again=buildRequest(key,prompt), r2,c2,b2;
      try{ r2=UrlFetchApp.fetch(again.url,again.options); c2=r2.getResponseCode(); b2=r2.getContentText(); }
      catch(e2){ return { ok:false, why:who+': could not be reached.' }; }

      var d2=diagnose(c2,who,b2);
      if(d2.kind==='ok'){
        var p2=readReply(key,b2);
        if(p2.ok) return { ok:true, text:p2.text, healed:next };
        lastWhy=p2.why; markBadModel(key.id,next); continue; }
      if(d2.kind==='billing') return { ok:false, why:d2.msg, billing:true };
      if(d2.kind==='model'){ lastWhy=d2.detail||d2.msg; markBadModel(key.id,next); continue; }
      return { ok:false, why:d2.msg, rest:(d2.kind==='rest') };
    }
    return { ok:false, why:who+': none of the '+tried.length+' models I tried worked. '+
      'Last reason: '+(lastWhy||'no reason given')+'. (Tried: '+tried.join(', ')+')' }; }
  return { ok:false, why:d.msg, rest:(d.kind==='rest') };
}
function scoreKey(id,won){ var l=loadKeys(),c=false;
  for(var i=0;i<l.length;i++) if(l[i].id===id){
    if(won) l[i].wins=(l[i].wins||0)+1; else l[i].fails=(l[i].fails||0)+1; c=true; }
  if(c) storeKeys(l); }
function looksBroken(a){ a=String(a||'');
  return a.indexOf('NO KEY')===0||a.indexOf('ALL KEYS')===0||a.indexOf('BUG')===0; }
function testAllKeys(){ loadExtraProviders();
  var l=loadKeys(),o=[];
  for(var i=0;i<l.length;i++){ var k=l[i];
    if(k.enabled===false){ o.push({ nickname:k.nickname, status:'off', note:'Switched off' }); continue; }
    if(!BOOK[k.provider]){ o.push({ nickname:k.nickname, status:'failed', note:'Unknown company' }); continue; }
    var t0=Date.now(), r=tryOnce(k,'Reply with the single word: OK',true);
    if(r.ok){
      o.push({ nickname:k.nickname, status:'working',
        note:((Date.now()-t0)/1000).toFixed(1)+'s · '+(r.healed?('healed → '+r.healed):k.model) });
    } else if(r.billing || isBillingComplaint(r.why)){
      o.push({ nickname:k.nickname, status:'nocredit', note:r.why });
    } else {
      o.push({ nickname:k.nickname, status:'failed', note:r.why });
    } }
  return o; }

/* A plain-English verdict on the whole fleet. */
function keyReport(){
  var rows=testAllKeys(), working=[], nocredit=[], broken=[], off=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(r.status==='working') working.push(r.nickname);
    else if(r.status==='nocredit') nocredit.push(r.nickname);
    else if(r.status==='off') off.push(r.nickname);
    else broken.push(r.nickname);
  }
  var verdict;
  if(!rows.length) verdict='No keys yet. Add one.';
  else if(working.length>=2) verdict='You are in good shape — '+working.length+' keys working.';
  else if(working.length===1) verdict='One key working. That is enough, but add a second so it can fail over.';
  else verdict='Nothing is working. Add a free Gemini or Groq key.';

  var notes=[];
  if(nocredit.length) notes.push(nocredit.length+' out of credit ('+nocredit.join(', ')+
    ') — these are paid accounts with no balance, not broken keys. Switch them off or add credit.');
  if(broken.length) notes.push(broken.length+' with a real problem ('+broken.join(', ')+').');
  if(off.length) notes.push(off.length+' switched off.');

  return { ok:true, rows:rows, verdict:verdict, working:working.length,
           nocredit:nocredit.length, broken:broken.length, notes:notes };
}

/* =====================================================================
   5. PROFILE + MEMORY
   ===================================================================== */
function getProfile(){
  var p=readJson(PROFILE,{}), s=readJson(STATS,{asks:0,rows:0,days:[]});
  return { name:p.name||'', photo:p.photo||'', tone:p.tone||'friendly',
    greeting:buildGreeting(p.name||''), asks:s.asks||0, rows:s.rows||0,
    streak:streakLength(s.days||[]), hasName:!!p.name }; }
function saveProfile(name,photo,tone){
  var p=readJson(PROFILE,{}), c=String(name||'').trim().slice(0,40);
  if(c) p.name=c;
  if(tone==='friendly'||tone==='brief'||tone==='formal') p.tone=tone;
  if(photo==='REMOVE') p.photo='';
  else if(photo){
    if(String(photo).indexOf('data:image/')!==0) return { ok:false, why:'That did not look like an image.' };
    if(String(photo).length>MAX_PHOTO_BYTES) return { ok:false, why:'That picture is too large.' };
    p.photo=String(photo); }
  writeJson(PROFILE,p); return { ok:true, profile:getProfile() }; }
function buildGreeting(name){
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var h=Number(Utilities.formatDate(new Date(),tz,'H'));
  var part=h<5?'Still up':h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Working late';
  return name?(part+', '+name):part; }
function noteActivity(kind,n){
  var s=readJson(STATS,{asks:0,rows:0,days:[]});
  if(kind==='ask') s.asks=(s.asks||0)+1;
  if(kind==='rows') s.rows=(s.rows||0)+(n||0);
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  s.days=s.days||[]; if(s.days[s.days.length-1]!==today) s.days.push(today);
  if(s.days.length>60) s.days=s.days.slice(-60);
  writeJson(STATS,s); }
function streakLength(d){ if(!d||!d.length) return 0; var r=1;
  for(var i=d.length-1;i>0;i--){ if(Math.round((new Date(d[i])-new Date(d[i-1]))/86400000)===1) r++; else break; }
  return r; }
function remember(line){ var m=readJson(MEMO,[]);
  m.push({ when:new Date().toISOString().slice(0,10), what:String(line).slice(0,160) });
  if(m.length>25) m=m.slice(-25); writeJson(MEMO,m); }
function recall(){ var m=readJson(MEMO,[]), o=[];
  for(var i=Math.max(0,m.length-6);i<m.length;i++) o.push(m[i].when+': '+m[i].what);
  return o.join('\n'); }

/* =====================================================================
   6. THE CONTACTS TAB — visible, editable, the single source of truth
   ===================================================================== */
var CONTACT_HEADERS=['Name','Email','Phone','Role','Company','Tags','Notes','Last contacted'];

function ensureContactsSheet(){
  var ss=SS(), sh=ss.getSheetByName(CONTACTS_SHEET);
  if(!sh){
    sh=ss.insertSheet(CONTACTS_SHEET);
    sh.getRange(1,1,1,CONTACT_HEADERS.length).setValues([CONTACT_HEADERS])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    var w=[170,230,150,150,170,150,300,140];
    for(var i=0;i<w.length;i++) sh.setColumnWidth(i+1,w[i]);
  }
  return sh;
}

function readContacts(){
  var sh=ensureContactsSheet(), last=sh.getLastRow();
  if(last<2) return [];
  var vals=sh.getRange(2,1,last-1,CONTACT_HEADERS.length).getValues(), out=[];
  for(var i=0;i<vals.length;i++){
    var r=vals[i];
    var name=String(r[0]||'').trim(), email=String(r[1]||'').trim(), phone=String(r[2]||'').trim();
    if(!name&&!email&&!phone) continue;
    out.push({ row:i+2, name:name||email||phone, email:email, phone:phone,
      role:String(r[3]||'').trim(), company:String(r[4]||'').trim(),
      tags:String(r[5]||'').trim(), notes:String(r[6]||'').trim(),
      last:String(r[7]||'').trim() });
  }
  return out;
}

function validEmail(e){ return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e||'').trim()); }

function normalisePhone(p){
  var d=String(p||'').replace(/[^0-9+]/g,'');
  if(d.indexOf('+')>0) d=d.replace(/\+/g,'');
  if(d.indexOf('0')===0 && d.length>=9) d='+254'+d.slice(1);   // Kenyan default
  return d;
}

/* Paste any messy blob of names, emails and numbers. */
function parseContactBlob(text){
  var raw=String(text||'');
  if(!raw.trim()) return { ok:false, why:'Paste something first.' };

  var emailRe=/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  var phoneRe=/(?:\+?\d[\d\s\-()]{7,}\d)/g;
  var lines=raw.split(/[\n\r]+/), found=[];

  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    var emails=line.match(emailRe)||[];
    var phones=(line.replace(emailRe,' ').match(phoneRe)||[]);
    if(!emails.length && !phones.length) continue;

    var leftover=line.replace(emailRe,' ').replace(phoneRe,' ')
      .replace(/[<>,;|"']/g,' ').replace(/\s+/g,' ').trim();
    leftover=leftover.replace(/^[-–—:•*\d.\s]+/,'').trim();

    var n=Math.max(emails.length, phones.length);
    for(var j=0;j<n;j++){
      found.push({ name:(n===1?leftover:''),
        email:emails[j]||'', phone:phones[j]?normalisePhone(phones[j]):'' });
    }
  }

  /* also catch emails on lines with nothing else */
  var all=raw.match(emailRe)||[];
  for(var a=0;a<all.length;a++){
    var seen=false;
    for(var f=0;f<found.length;f++) if(found[f].email===all[a]) seen=true;
    if(!seen) found.push({ name:'', email:all[a], phone:'' });
  }

  var clean=[];
  for(var c=0;c<found.length;c++){
    var it=found[c];
    if(it.email && !validEmail(it.email)) it.email='';
    if(!it.email && !it.phone) continue;
    if(!it.name){
      it.name = it.email
        ? it.email.split('@')[0].replace(/[._\-]+/g,' ').replace(/\b\w/g,function(m){return m.toUpperCase();})
        : it.phone;
    }
    clean.push(it);
  }
  return { ok:true, found:clean };
}

function addContactsFromText(text, tag){
  var p=parseContactBlob(text);
  if(!p.ok) return p;
  if(!p.found.length) return { ok:false, why:'I found no emails or phone numbers in that.' };

  var sh=ensureContactsSheet(), existing=readContacts();
  var haveE={}, haveP={};
  for(var e=0;e<existing.length;e++){
    if(existing[e].email) haveE[existing[e].email.toLowerCase()]=true;
    if(existing[e].phone) haveP[existing[e].phone]=true; }

  var rows=[], added=[], skipped=[];
  for(var i=0;i<p.found.length;i++){
    var c=p.found[i];
    var dupe=(c.email&&haveE[c.email.toLowerCase()])||(!c.email&&c.phone&&haveP[c.phone]);
    if(dupe){ skipped.push(c.name); continue; }
    if(c.email) haveE[c.email.toLowerCase()]=true;
    if(c.phone) haveP[c.phone]=true;
    rows.push([c.name, c.email, c.phone, '', '', String(tag||'').trim(), '', '']);
    added.push(c.name);
  }
  if(rows.length){
    var startRow=Math.max(sh.getLastRow(),1)+1;   // never overwrite the header row
    sh.getRange(startRow,1,rows.length,CONTACT_HEADERS.length).setValues(rows);
  }
  return { ok:true, added:added, skipped:skipped, total:readContacts().length };
}

function deleteContactRow(row){
  var sh=ensureContactsSheet();
  var r=Number(row);
  if(!(r>1)) return { ok:false, why:'That is not a contact row.' };
  sh.deleteRow(r);
  return { ok:true };
}

function stampContacted(emails){
  var sh=ensureContactsSheet(), list=readContacts();
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  for(var i=0;i<list.length;i++)
    if(emails.indexOf(list[i].email)!==-1) sh.getRange(list[i].row,8).setValue(today);
}

/* Who should receive this? Optional tag filter. */
function recipients(tag){
  var all=readContacts(), out=[];
  var t=String(tag||'').trim().toLowerCase();
  for(var i=0;i<all.length;i++){
    if(!all[i].email) continue;
    if(t && all[i].tags.toLowerCase().indexOf(t)===-1) continue;
    out.push(all[i]); }
  return out;
}

/* =====================================================================
   7. SHEET HELPERS
   ===================================================================== */
function selectionAsTable(){
  var rg=RG();
  if(!rg) return { rows:0, text:'', label:'' };
  var v=rg.getValues(), lines=[];
  for(var r=0;r<v.length;r++){ var line=v[r].join(' | ').trim();
    if(line.replace(/\|/g,'').trim()) lines.push(line); }
  return { rows:lines.length, text:lines.join('\n'), label:rg.getA1Notation() };
}

function rangeAsTable(a1){
  try{
    var rg=SH().getRange(a1), v=rg.getValues(), lines=[];
    for(var r=0;r<v.length;r++) lines.push(v[r].join(' | '));
    return { ok:true, rows:lines.length, text:lines.join('\n').slice(0,9000), label:a1 };
  }catch(e){ return { ok:false, why:'I could not read '+a1 }; }
}

function askSelection(question){
  if(!question||!String(question).trim()) return { ok:false, text:'Type a question first.' };
  var t=selectionAsTable();
  if(!t.rows) return { ok:false, text:'Highlight some cells in the sheet first.' };

  var p=getProfile();
  var style = p.tone==='brief'  ? 'Answer in under 40 words.'
            : p.tone==='formal' ? 'Answer formally, under 150 words.'
                                : 'Answer warmly and plainly, under 150 words.';

  var a=callAI(
    getPrompt('analyst')+'\n\n'+
    (p.name?('You are helping '+p.name+'.\n'):'')+
    'YOU MAY, and should: count rows, add up groups, compare them, rank them, '+
    'find the most or least common, spot patterns, and summarise. '+
    'Working things out from the rows shown is analysis, not invention — do it.\n'+
    'Do NOT reply NOT IN THE DATA just because the answer needs counting or judgement.\n'+
    'If the first row looks like column headings, treat it as the headings.\n'+style+'\n\n'+
    'QUESTION: '+question+'\n\n'+
    'TABLE — '+t.rows+' rows from '+t.label+':\n'+t.text);

  if(!looksBroken(a)){ noteActivity('ask'); remember('Asked: '+question);
    logIt('question',question.slice(0,120)); }
  return { ok:true, text:a, rows:t.rows, label:t.label,
           refused:(String(a).toUpperCase().indexOf('NOT IN THE DATA')!==-1) };
}

function writeBelowSelection(text){
  var rg=RG();
  if(!rg) return { ok:false, why:'Highlight something first.' };
  var sh=rg.getSheet(), row=rg.getLastRow()+2, col=rg.getColumn();
  sh.getRange(row,col).setValue('AI ANALYSIS — '+new Date().toLocaleString());
  sh.getRange(row+1,col).setValue(text);
  return { ok:true, where:sh.getRange(row+1,col).getA1Notation() };
}

function fillColumn(instruction,srcCol,tgtCol,firstRow,lastRow){
  if(!instruction||!String(instruction).trim()) return { ok:false, why:'Write an instruction first.' };
  var sh=SH();
  var first=Number(firstRow)||2, last=Number(lastRow)||sh.getLastRow();
  if(last<first) return { ok:false, why:'The last row is above the first row.' };
  var src=sh.getRange(srcCol+first+':'+srcCol+last).getValues();
  var tgt=sh.getRange(tgtCol+first+':'+tgtCol+last).getValues();
  snapshot(tgtCol+first+':'+tgtCol+last,'fill '+tgtCol);
  var done=0,skipped=0,stopped='';
  for(var i=0;i<src.length;i++){
    var txt=String(src[i][0]||'').trim();
    if(!txt){ skipped++; continue; }
    if(String(tgt[i][0]||'').trim()){ skipped++; continue; }
    var a=callAI(instruction+'\n\nINPUT:\n'+txt);
    sh.getRange(tgtCol+(first+i)).setValue(a); done++;
    if(String(a).indexOf('ALL KEYS')===0||String(a).indexOf('NO KEY')===0){ stopped=a; break; }
    if(done%10===0) SpreadsheetApp.flush(); }
  if(done){ noteActivity('rows',done); logIt('filled column',done+' rows in '+tgtCol); }
  return { ok:true, done:done, skipped:skipped, stopped:stopped };
}

function buildSummary(sourceCol,targetName){
  var sh=SH(), col=String(sourceCol||'F').toUpperCase();
  var last=sh.getLastRow();
  if(last<2) return { ok:false, why:'There is no data to summarise.' };
  var vals=sh.getRange(col+'2:'+col+last).getValues(), counts={}, total=0;
  for(var i=0;i<vals.length;i++){ var v=String(vals[i][0]||'').trim();
    if(!v) continue; counts[v]=(counts[v]||0)+1; total++; }
  if(!total) return { ok:false, why:'Column '+col+' is empty. Fill it first.' };
  var pairs=[]; for(var k in counts) pairs.push([k,counts[k]]);
  pairs.sort(function(a,b){ return b[1]-a[1]; });
  var name=String(targetName||'Summary').slice(0,40);
  var ss=SS(), out=ss.getSheetByName(name);
  if(out) out.clear(); else out=ss.insertSheet(name);
  var rows=[['Value','Count','Share']];
  for(var p=0;p<pairs.length;p++) rows.push([pairs[p][0],pairs[p][1],pairs[p][1]/total]);
  rows.push(['TOTAL',total,1]);
  out.getRange(1,1,rows.length,3).setValues(rows);
  out.getRange(1,1,1,3).setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
  out.getRange(2,3,rows.length-1,1).setNumberFormat('0.0%');
  out.setFrozenRows(1);
  return { ok:true, sheet:name, groups:pairs.length, total:total };
}

function buildPivot(rowField,valueField,targetName){
  var src=SH(), last=src.getLastRow(), lastCol=src.getLastColumn();
  if(last<2) return { ok:false, why:'There is no data to pivot.' };
  var heads=src.getRange(1,1,1,lastCol).getValues()[0];
  var r=heads.indexOf(rowField)+1, v=heads.indexOf(valueField)+1;
  if(!r) return { ok:false, why:'No column called "'+rowField+'".' };
  if(!v) return { ok:false, why:'No column called "'+valueField+'".' };
  var name=String(targetName||'Pivot').slice(0,40);
  var ss=SS(), out=ss.getSheetByName(name);
  if(out) ss.deleteSheet(out);
  out=ss.insertSheet(name);
  var t=out.getRange('A1').createPivotTable(src.getRange(1,1,last,lastCol));
  t.addRowGroup(r);
  t.addPivotValue(v, SpreadsheetApp.PivotTableSummarizeFunction.COUNTA);
  return { ok:true, sheet:name };
}

/* =====================================================================
   8. EMAIL OUT
   ===================================================================== */
function emailQuotaLeft(){ try{ return MailApp.getRemainingDailyQuota(); }catch(e){ return -1; } }

function sendReport(subject,focus,tag,attachCsv){
  var team=recipients(tag);
  if(!team.length) return { ok:false,
    why: tag ? 'Nobody on the Contacts tab is tagged "'+tag+'".' : 'No contacts with an email yet.' };
  var t=selectionAsTable();
  if(!t.rows) return { ok:false, why:'Highlight the cells you want reported on.' };

  var body=callAI(getPrompt('reporter')+'\n'+
    (focus?('Focus on: '+focus+'\n'):'')+'\nTABLE:\n'+t.text);
  if(looksBroken(body)) return { ok:false, why:body };

  var p=getProfile(), ss=SS();
  var subj=String(subject||'').trim()||('Report from '+ss.getName());
  var sent=[], failed=[], emails=[];
  for(var i=0;i<team.length;i++){
    var m=team[i];
    var text='Hi '+(m.name.split(' ')[0]||'there')+',\n\n'+body+
      '\n\n—\nPrepared by '+(p.name||'the sheet owner')+' from '+t.rows+' rows ('+t.label+').\n'+
      'Open the sheet: '+ss.getUrl()+'\n'+
      'Written by AI from the data shown. Please sanity-check before acting.';
    try{
      var opts={ name:'AI Toolkit' };
      if(attachCsv) opts.attachments=[Utilities.newBlob(t.text.replace(/ \| /g,','),'text/csv','data.csv')];
      MailApp.sendEmail(m.email, subj, text, opts);
      sent.push(m.name); emails.push(m.email);
    }catch(e){ failed.push(m.name+' — '+e.message); }
  }
  if(emails.length) stampContacted(emails);
  remember('Emailed '+sent.length+' people: '+subj);
  logIt('emailed',sent.length+' people — '+subj);
  return { ok:true, sent:sent, failed:failed, preview:body, quota:emailQuotaLeft() };
}

function whatsappLinks(message,tag){
  var all=readContacts(), out=[], txt=String(message||'').slice(0,900);
  var t=String(tag||'').trim().toLowerCase();
  for(var i=0;i<all.length;i++){
    var c=all[i];
    if(!c.phone) continue;
    if(t && c.tags.toLowerCase().indexOf(t)===-1) continue;
    out.push({ name:c.name, url:'https://wa.me/'+c.phone.replace(/[^0-9]/g,'')+
      '?text='+encodeURIComponent(txt) }); }
  return out;
}

/* =====================================================================
   9. GMAIL IN
   ===================================================================== */
function gmailUnread(maxThreads){
  var n=Math.max(1,Math.min(20,Number(maxThreads)||10));
  var threads;
  try{ threads=GmailApp.search('is:unread in:inbox', 0, n); }
  catch(e){ return { ok:false, why:'I could not read Gmail: '+e.message }; }
  if(!threads.length) return { ok:true, count:0, items:[], text:'Nothing unread. Inbox is clear.' };

  var items=[], lines=[];
  for(var i=0;i<threads.length;i++){
    var m=threads[i].getMessages()[0];
    var it={ id:threads[i].getId(), from:m.getFrom(), subject:m.getSubject(),
      when:Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(),'dd MMM HH:mm'),
      snippet:String(m.getPlainBody()||'').replace(/\s+/g,' ').slice(0,400) };
    items.push(it);
    lines.push((i+1)+'. FROM: '+it.from+'\n   SUBJECT: '+it.subject+'\n   '+it.snippet);
  }
  return { ok:true, count:items.length, items:items, text:lines.join('\n\n') };
}

function triageInbox(maxThreads){
  var box=gmailUnread(maxThreads);
  if(!box.ok) return box;
  if(!box.count) return { ok:true, text:'Nothing unread. Inbox is clear.', count:0 };

  var p=getProfile();
  var out=callAI('You are '+(p.name||'the user')+"'s assistant. Below are unread emails.\n"+
    'For EACH one give one line: number, sender name only, what they want in under 12 words, '+
    'and one of NOW / TODAY / LATER / IGNORE.\n'+
    'Then a final line beginning "FIRST:" naming the one to deal with first and why, in under 20 words.\n'+
    'Plain text. Use only what is shown.\n\n'+box.text);
  if(looksBroken(out)) return { ok:false, why:out };
  remember('Triaged '+box.count+' unread emails');
  return { ok:true, text:out, count:box.count };
}

function draftReply(threadIndex, instruction){
  var box=gmailUnread(20);
  if(!box.ok) return box;
  var i=Number(threadIndex)-1;
  if(!(i>=0&&i<box.items.length)) return { ok:false, why:'There is no email number '+threadIndex+'.' };
  var it=box.items[i], p=getProfile();

  var body=callAI('Write a reply to this email.\n'+
    'From: '+it.from+'\nSubject: '+it.subject+'\nTheir message: '+it.snippet+'\n\n'+
    'Instruction from '+(p.name||'the user')+': '+(instruction||'a short, polite, helpful reply')+'\n'+
    'Rules: under 120 words, plain text, no markdown. Promise nothing specific. '+
    'Sign off as '+(p.name||'me')+'. Invent no facts.');
  if(looksBroken(body)) return { ok:false, why:body };

  try{ GmailApp.getThreadById(it.id).createDraftReply(body); }
  catch(e){ return { ok:false, why:'I wrote it but could not save the draft: '+e.message }; }
  return { ok:true, to:it.from, subject:it.subject, text:body };
}

function inboxToSheet(maxThreads){
  var box=gmailUnread(maxThreads);
  if(!box.ok) return box;
  if(!box.count) return { ok:false, why:'Nothing unread to save.' };
  var ss=SS(), name='Inbox';
  var sh=ss.getSheetByName(name);
  if(!sh){ sh=ss.insertSheet(name);
    sh.getRange(1,1,1,4).setValues([['When','From','Subject','Preview']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1); }
  var rows=[];
  for(var i=0;i<box.items.length;i++){ var it=box.items[i];
    rows.push([it.when,it.from,it.subject,it.snippet.slice(0,300)]); }
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,rows.length,4).setValues(rows);
  return { ok:true, added:rows.length, sheet:name };
}

/* =====================================================================
   10. TELEGRAM — your assistant in your pocket
   ===================================================================== */
function saveTelegram(token, chatId){
  var t=String(token||'').trim();
  if(t && !/^\d{6,}:[A-Za-z0-9_\-]{20,}$/.test(t))
    return { ok:false, why:'That does not look like a BotFather token.' };
  var cfg=readJson(TG,{});
  if(t) cfg.token=t;
  if(String(chatId||'').trim()) cfg.chat=String(chatId).trim();
  writeJson(TG,cfg);
  return { ok:true, hasToken:!!cfg.token, hasChat:!!cfg.chat };
}
function telegramConfig(){ var c=readJson(TG,{});
  return { hasToken:!!c.token, hasChat:!!c.chat, chat:c.chat||'' }; }

function telegramSend(text, chatId){
  var c=readJson(TG,{});
  if(!c.token) return { ok:false, why:'No Telegram token saved yet.' };
  var to=chatId||c.chat;
  if(!to) return { ok:false, why:'No chat id yet. Message your bot once, then press Find my chat.' };
  try{
    var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/sendMessage',{
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({ chat_id:to, text:String(text).slice(0,4000) }) });
    if(res.getResponseCode()!==200)
      return { ok:false, why:'Telegram said '+res.getResponseCode()+': '+res.getContentText().slice(0,120) };
    return { ok:true };
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
}

/* Find the chat id after the user messages the bot once */
function telegramFindChat(){
  var c=readJson(TG,{});
  if(!c.token) return { ok:false, why:'Save your token first.' };
  try{
    var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/getUpdates',
      { muteHttpExceptions:true });
    var d=JSON.parse(res.getContentText());
    if(!d.ok) return { ok:false, why:'Telegram rejected the token.' };
    var ups=d.result||[];
    if(!ups.length) return { ok:false, why:'Send your bot any message first, then press this again.' };
    var last=ups[ups.length-1];
    var chat=(last.message&&last.message.chat&&last.message.chat.id)||'';
    if(!chat) return { ok:false, why:'No chat found in the latest update.' };
    c.chat=String(chat); writeJson(TG,c);
    return { ok:true, chat:String(chat) };
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
}

/* Point Telegram at this web app so messages arrive instantly */
function telegramSetWebhook(webAppUrl){
  var c=readJson(TG,{});
  if(!c.token) return { ok:false, why:'Save your token first.' };
  var u=String(webAppUrl||'').trim();
  if(u.indexOf('https://')!==0) return { ok:false, why:'Paste your web app URL (it starts with https://).' };
  try{
    var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/setWebhook',{
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({ url:u }) });
    var d=JSON.parse(res.getContentText());
    if(!d.ok) return { ok:false, why:d.description||'Telegram refused the webhook.' };
    c.webhook=u; writeJson(TG,c);
    return { ok:true };
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
}

/* Telegram posts here when someone messages the bot */

/* =====================================================================
   42. HANDLE EACH MESSAGE EXACTLY ONCE
   Telegram resends an update if the webhook is slow to answer — and our
   agent can take twenty seconds. That is why one tap produced a stream
   of identical menus. The cure is to remember what we have already
   handled, and to claim it BEFORE doing any work.
   ===================================================================== */

function claimOnce(kind, id, seconds){
  if(!id && id!==0) return true;                 /* nothing to dedupe on — let it through */
  var key='seen_'+kind+'_'+String(id);
  var c=CacheService.getScriptCache();
  try{
    if(c.get(key)) return false;                 /* we have handled this already */
    c.put(key,'1', Math.max(60, Math.min(21600, seconds||900)));
    return true;
  }catch(e){ return true; }                      /* cache trouble: better to answer than to go silent */
}

/* A second net: the same person sending the same words twice in a few
   seconds is a double tap, not two questions. */
function looksLikeARepeat(chat, text){
  var t=String(text||'').trim().toLowerCase().slice(0,80);
  if(!t) return false;
  var key='echo_'+String(chat)+'_'+simpleHash(t);
  var c=CacheService.getScriptCache();
  try{
    if(c.get(key)) return true;
    c.put(key,'1',6);
    return false;
  }catch(e){ return false; }
}

function simpleHash(s){
  var h=0, str=String(s||'');
  for(var i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0; }
  return String(Math.abs(h));
}

/* A very short guard against a genuine double-tap producing two identical
   messages. Deliberately brief — the real duplicate protection is claimOnce
   above, and this must never swallow an answer the user actually asked for. */
var SEND_GUARD_SECONDS=3;
function sendOnce(text, chat, buttons, seconds){
  var key='sent_'+String(chat||'me')+'_'+simpleHash(String(text||'').slice(0,120));
  var c=CacheService.getScriptCache();
  try{
    if(c.get(key)) return { ok:true, skipped:true };
    c.put(key,'1', Math.max(2, seconds||SEND_GUARD_SECONDS));
  }catch(e){}
  return tgSend(text, chat, buttons);
}

/* Throw away anything Telegram is still holding for us. */
function clearBacklog(){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { ok:false, why:'No token saved.' };
  var url=cfg.webhook||readJson(WEBAPP,{}).url||'';
  try{
    /* Dropping pending updates requires re-setting the webhook. */
    UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+
      '/deleteWebhook?drop_pending_updates=true',{ muteHttpExceptions:true });
    if(url){
      var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+'/setWebhook',{
        method:'post', contentType:'application/json', muteHttpExceptions:true,
        payload:JSON.stringify({ url:url, drop_pending_updates:true }) });
      var d=JSON.parse(res.getContentText());
      if(!d.ok) return { ok:false, why:d.description||'Telegram refused to reconnect.' };
    }
    logIt('telegram','Cleared the backlog');
    return { ok:true, reconnected:!!url,
      say:url ? 'Backlog cleared and the webhook is back on.'
              : 'Backlog cleared. Press Connect everything to hook it up again.' };
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
}

function doPost(e){
  var reply=ContentService.createTextOutput('ok');
  var chat='';
  try{
    if(!e||!e.postData||!e.postData.contents){ logIt('telegram','empty POST arrived'); return reply; }

    var up;
    try{ up=JSON.parse(e.postData.contents); }
    catch(err){ logIt('telegram','unreadable POST'); return reply; }

    /* CLAIM IT FIRST. Telegram retries slow webhooks, so this line is what
       stops one tap becoming ten identical menus. */
    if(up.update_id!==undefined && !claimOnce('u', up.update_id)){
      logIt('telegram','ignored a repeat of update '+up.update_id);
      return reply;
    }

    /* ---- somebody tapped a button ---- */
    if(up.callback_query){
      var cq=up.callback_query;
      var cqChat=String(cq.message&&cq.message.chat&&cq.message.chat.id||'');
      var cfgA=readJson(TG,{});
      if(cfgA.chat && cqChat!==String(cfgA.chat)){ tgAck(cq.id,'Private'); return reply; }
      /* A tapped button can also arrive twice. */
      if(!claimOnce('cb', cq.id)){ tgAck(cq.id); return reply; }
      var note='';
      try{ note=handleTap(cq.data, cqChat); }
      catch(err2){ logIt('telegram tap error', String(err2&&err2.message||err2).slice(0,160));
        sendOnce('That button broke: '+String(err2&&err2.message||err2).slice(0,200), cqChat,
          [[{ label:'🏠 Menu', code:'menu' }]]); }
      tgAck(cq.id, note);
      return reply;
    }

    var msg=up.message||up.edited_message||up.channel_post;
    if(!msg){ logIt('telegram','update with no message'); return reply; }

    chat=String(msg.chat&&msg.chat.id||'');
    var text=String(msg.text||msg.caption||'').trim();
    if(!chat) return reply;

    if(!text){ sendOnce('I can only read text at the moment. Try /menu.', chat, replyButtons()); return reply; }

    var cfg=readJson(TG,{});
    if(cfg.chat && chat!==String(cfg.chat)){ sendOnce('This assistant is private.', chat); return reply; }
    if(!cfg.chat){ cfg.chat=chat; writeJson(TG,cfg); }

    logIt('telegram in', text.slice(0,120));
    var lower=text.toLowerCase();

    /* ---- are we already in the middle of something? ----
       This comes FIRST, and deliberately before the echo guard: inside a
       conversation "skip", "yes" and "7" are perfectly normal repeats. */
    var mid=continueFlow(text, chat);
    if(mid && !mid.none){
      saveTurn('you',text,'',0,'telegram');
      saveTurn('assistant',mid.say,'guided',0,'telegram');
      sendOnce(mid.say, chat, mid.inFlow?null:replyButtons(), 1);
      return reply;
    }

    /* Outside a conversation, the same words twice in seconds is a double tap. */
    if(looksLikeARepeat(chat, text)){
      logIt('telegram','ignored a double-tap: '+text.slice(0,60));
      return reply;
    }

    if(text==='/cancel'||lower==='cancel'){
      sendOnce(cancelFlow(chat).say, chat);
      return reply;
    }

    if(text==='/start'||lower==='menu'||text==='/menu'||lower==='hi'||lower==='hello'||lower==='hey'){
      saveTurn('you',text,'',0,'telegram');
      var f=sheetFacts();
      var hello=(text==='/start')
        ? ('👋 '+buildGreeting(getProfile().name)+'. I am your assistant.')
        : ('👋 '+buildGreeting(getProfile().name)+'.');
      var line=f.ok ? ('\n\nI can see "'+f.name+'" — '+f.tabCount+' tabs, '+f.totalRows+
                       ' rows of data.') : '';
      var welcome=hello+line+'\n\nWhat would you like to do?';
      saveTurn('assistant',welcome,'menu',0,'telegram');
      sendOnce(welcome, chat, menuMain());
      return reply;
    }
    if(text==='/can'||/^what can you do/i.test(text)){
      sendOnce('Here is what I can do — just say any of these:\n\n'+capabilitiesText(), chat);
      return reply;
    }
    if(text==='/help'){
      sendOnce('Just talk to me in plain English.\n\n'+
        'Try: "add a contact" · "how many rows?" · "which branch is worst?"\n\n'+
        '/can — everything I can do\n/menu — the buttons\n/sheets — pick a tab\n'+
        '/status — is everything working?\n/cancel — stop what we are in the middle of', chat);
      return reply;
    }
    if(text==='/sheets'||lower==='sheets'||lower==='my sheets'){
      var m=menuTabs(); sendOnce(m.text, chat, m.buttons); return reply;
    }
    if(text==='/status'){
      var keys=loadKeys(), ready=0;
      for(var k=0;k<keys.length;k++) if(keys[k].enabled!==false && !isResting(keys[k].id)) ready++;
      var ws=worksetInfo();
      sendOnce('Keys ready: '+ready+' of '+keys.length+'\n'+
        'Sheet: '+(ws.ok?ws.name:'not connected')+'\n'+
        'Reading: '+(ws.ok?(ws.using||'nothing yet'):'—'), chat);
      return reply;
    }
    if(text==='/where'){
      var w=worksetInfo();
      sendOnce(w.ok ? ('I am reading '+(w.using||'nothing yet')+' in "'+w.name+'".') : w.why, chat);
      return reply;
    }

    /* ---- something that needs a few details? start a conversation ---- */
    var intent=detectIntent(text);
    if(intent){
      var began=startFlow(intent, chat);
      if(began.ok){
        saveTurn('you',text,'',0,'telegram');
        saveTurn('assistant',began.say,'guided',0,'telegram');
        sendOnce(began.say, chat);
        return reply;
      }
    }

    /* ---- something we can simply do, with no guessing ---- */
    var straight=runDirect(text);
    if(straight){
      saveTurn('you',text,'',0,'telegram');
      tgTyping(chat);
      if(straight.say) sendOnce(straight.say, chat, null, 2);
      var answer=straight.ok ? straight.answer : straight.why;
      saveTurn('assistant',answer,'direct: '+straight.tool,straight.seconds||0,'telegram');
      sendOnce(bestEffort(answer, text), chat, nextButtons(answer, text));
      return reply;
    }

    /* ---- something we can answer instantly, with no AI at all ---- */
    var quick=fastAnswer(text);
    if(quick){
      saveTurn('you',text,'',0,'telegram');
      saveTurn('assistant',quick,'instant',0,'telegram');
      sendOnce(quick, chat);
      return reply;
    }

    /* ---- anything else goes to the agent ---- */
    tgTyping(chat);
    sendOnce(thinkingLine(text), chat, null, 2);

    var out=null, failed='';
    try{ out=runAgentTimed(text,'telegram'); }
    catch(err3){ failed=String(err3 && err3.message || err3); }

    if(failed){
      logIt('telegram error', failed.slice(0,200));
      sendOnce('Something broke while I was working on that:\n'+failed.slice(0,300),
        chat, replyButtons());
      return reply;
    }
    /* Buttons only where they help — not under every single answer. */
    var finalText=(out&&out.ok&&out.answer)
      ? withReceipt(bestEffort(out.answer, text), out.trail)
      : ((out&&out.why) || 'I could not work that out. Try /menu.');
    sendOnce(finalText, chat, nextButtons(finalText, text));

  }catch(fatal){
    try{ logIt('telegram fatal', String(fatal && fatal.message || fatal).slice(0,200)); }catch(e3){}
    try{ if(chat) sendOnce('I hit an unexpected error: '+
      String(fatal && fatal.message || fatal).slice(0,250), chat); }catch(e4){}
  }
  return reply;
}

/* =====================================================================
   10b. IS THE WEB APP ACTUALLY REACHABLE?
   Telegram cannot tell you why it failed. This can.
   ===================================================================== */
function checkWebApp(url){
  var u=String(url||'').trim() || readJson(WEBAPP,{}).url || '';
  if(!u) return { ok:false, why:'No web app link saved yet.' };
  if(u.indexOf('/exec')===-1)
    return { ok:false, why:'That link must end in /exec. A /dev link only works while you are signed in.' };

  var notes=[], verdict='', fine=false;

  /* A GET tells us whether the deployment is public at all. */
  var getCode=0, getBody='';
  try{
    var g=UrlFetchApp.fetch(u,{ muteHttpExceptions:true, followRedirects:false });
    getCode=g.getResponseCode(); getBody=String(g.getContentText()||'').slice(0,400);
  }catch(e){ return { ok:false, why:'I could not reach that link at all: '+e.message }; }

  if(getCode===200){ notes.push('The link opens.'); }
  else if(getCode===302||getCode===301){
    notes.push('The link redirects to a sign-in page ('+getCode+').');
    verdict='Your deployment is set to "Only myself". Telegram cannot sign in, so it can never '+
            'deliver a message. Change Access to Anyone and deploy a NEW VERSION.';
  } else if(getCode===403||getCode===401){
    notes.push('The link refused us ('+getCode+').');
    verdict='Access is restricted. Set "Who has access" to Anyone, then deploy a new version.';
  } else {
    notes.push('The link answered '+getCode+'.');
  }

  /* A POST is exactly what Telegram does. */
  var postCode=0;
  try{
    var p=UrlFetchApp.fetch(u,{ method:'post', contentType:'application/json',
      payload:JSON.stringify({ ping:true }), muteHttpExceptions:true, followRedirects:false });
    postCode=p.getResponseCode();
  }catch(e){ notes.push('A POST failed outright: '+e.message); }

  if(postCode===200){ notes.push('It accepts POSTs — this is what Telegram sends.'); fine=true; }
  else if(postCode===302||postCode===301||postCode===401||postCode===403){
    notes.push('POST was turned away ('+postCode+').');
    if(!verdict) verdict='Telegram cannot POST to it. Access must be Anyone.';
  } else if(postCode){ notes.push('POST answered '+postCode+'.'); }

  if(fine && !verdict) verdict='This link is reachable and accepts messages.';
  return { ok:fine, code:getCode, postCode:postCode, notes:notes, verdict:verdict, url:u };
}

/* Everything at once, in plain English. */
function telegramDiagnose(){
  var cfg=readJson(TG,{});
  var lines=[], fix=[];

  if(!cfg.token){ return { ok:false, lines:['No bot token saved.'],
    fix:['Message @BotFather, send /newbot, paste the token here.'] }; }

  var s=telegramStatus();
  lines.push(s.botName ? ('Bot: '+s.botName+' — the token works.') : 'The token was rejected.');
  if(!s.botName) fix.push('Get a fresh token from @BotFather.');

  lines.push(s.hasChat ? ('Chat id: '+s.chat) : 'No chat id saved.');
  if(!s.hasChat) fix.push('Message your bot, then press Find my chat (disconnect the webhook first).');

  lines.push(s.hooked ? ('Webhook: '+(s.webApp||'set')) : 'Webhook: not set.');
  if(!s.hooked) fix.push('Paste your /exec link and press Connect everything.');

  if(s.pending){
    lines.push('⚠ '+s.pending+' messages are queued and undelivered.');
    fix.push('Telegram is trying but your web app is not answering — see below.');
  }
  if(s.lastError){
    lines.push('⚠ Telegram last said: '+s.lastError);
    if(/wrong response|timeout|failed to resolve|connection/i.test(s.lastError))
      fix.push('That means your web app did not answer. Redeploy a NEW VERSION with Access: Anyone.');
  }

  if(s.webApp){
    var w=checkWebApp(s.webApp);
    for(var i=0;i<(w.notes||[]).length;i++) lines.push(w.notes[i]);
    if(w.verdict) lines.push('→ '+w.verdict);
    if(!w.ok){
      fix.push('Deploy → Manage deployments → Edit → New version, Access: Anyone.');
      if(w.code===302||w.postCode===302||w.code===403){
        fix.push('If your Google Workspace will not allow "Anyone" — many company '+
          'domains block it — press "Check every minute instead". That needs no '+
          'public web app at all.');
      }
    }
  }

  var keys=loadKeys(), ready=0;
  for(var k=0;k<keys.length;k++) if(keys[k].enabled!==false) ready++;
  lines.push('AI keys enabled: '+ready);
  if(!ready) fix.push('Add an AI key, or it has nothing to answer with.');

  var ws=worksetInfo();
  lines.push(ws.ok ? ('Sheet: '+ws.name+' — reading '+(ws.using||'nothing yet'))
                   : 'Sheet: not connected.');
  if(!ws.ok) fix.push('Open the spreadsheet and use 🤖 AI Toolkit → Connect this sheet to the web app.');

  return { ok:fix.length===0, lines:lines, fix:fix };
}

/* =====================================================================
   11. THE WEB
   ===================================================================== */
function stripHtml(html){
  var s=String(html||'');
  /* Feeds arrive with their tags escaped (&lt;p&gt;). Decode first, then strip,
     otherwise the tags reappear as visible text. */
  if(s.indexOf('&lt;')!==-1 || s.indexOf('&amp;lt;')!==-1){
    s=s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  }
  s=s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
     .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ')
     .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi,'\n').replace(/<[^>]+>/g,' ');
  s=s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
     .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  return s.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}

function readWebPage(url,question){
  var u=String(url||'').trim();
  if(u.indexOf('http')!==0) return { ok:false, why:'Paste a full link starting with https://' };
  var res,html;
  try{ res=UrlFetchApp.fetch(u,{ muteHttpExceptions:true, followRedirects:true,
    headers:{ 'User-Agent':'Mozilla/5.0 (compatible; SheetsAIToolkit/1.0)' } });
    html=res.getContentText(); }
  catch(e){ return { ok:false, why:'Could not open that page.' }; }
  if(res.getResponseCode()!==200) return { ok:false, why:'That page answered with '+res.getResponseCode()+'.' };
  var text=stripHtml(html);
  if(text.length<80) return { ok:false, why:'That page had almost no readable text (it may need JavaScript).' };
  var a=callAI('Read the page text below and answer using ONLY it. If the answer is not there, '+
    'reply exactly: NOT ON THAT PAGE. Under 150 words.\n\nQUESTION: '+
    (question||'Summarise the main points.')+'\n\nPAGE ('+u+'):\n'+text.slice(0,12000));
  if(looksBroken(a)) return { ok:false, why:a };
  return { ok:true, text:a, chars:text.length, url:u };
}

/* =====================================================================
   12. THE TOOLBOX — everything the agent is allowed to use
   ===================================================================== */
var TOOLS = {
  read_selection: { need:[], what:'read the cells the user highlighted',
    run:function(){ var t=selectionAsTable();
      if(!t.rows) return 'Nothing is highlighted.';
      return t.rows+' rows from '+t.label+'. You may count and compare these.\n'+
             t.text.slice(0,6000); } },

  read_range: { need:['range'], what:'read a range like A1:H20',
    run:function(a){ var r=rangeAsTable(a.range);
      return r.ok?('Rows from '+r.label+':\n'+r.text):r.why; } },

  sheet_info: { need:[], what:'see tab names, headers and row counts',
    run:function(){ var ss=SS(), sh=ss.getSheets(), out=[];
      for(var i=0;i<sh.length&&i<12;i++){ var s=sh[i], lr=s.getLastRow(), lc=s.getLastColumn();
        var h=(lr>=1&&lc>=1)?s.getRange(1,1,1,Math.min(lc,10)).getValues()[0].join(' | '):'';
        out.push(s.getName()+' — '+lr+' rows, headers: '+h); }
      return out.join('\n'); } },

  write_cell: { need:['a1','value'], what:'put a value in one cell',
    run:function(a){ SH().getRange(a.a1).setValue(a.value);
      return 'Wrote to '+a.a1+'.'; } },

  fill_column: { need:['instruction','source','target'], what:'run an instruction down a column',
    run:function(a){ var r=fillColumn(a.instruction,String(a.source).toUpperCase(),
        String(a.target).toUpperCase(),a.first,a.last);
      return r.ok?('Filled '+r.done+' rows, skipped '+r.skipped+'. '+(r.stopped||'')):r.why; } },

  summarise_column: { need:['column'], what:'count every value in a column into a Summary tab',
    run:function(a){ var r=buildSummary(a.column,a.name);
      return r.ok?('Summary built in "'+r.sheet+'": '+r.groups+' groups, '+r.total+' rows.'):r.why; } },

  make_pivot: { need:['row','value'], what:'build a pivot table',
    run:function(a){ var r=buildPivot(a.row,a.value,a.name);
      return r.ok?('Pivot built in "'+r.sheet+'".'):r.why; } },

  format_range: { need:['range'], what:'bold or colour a range',
    run:function(a){ var rg=SH().getRange(a.range);
      if(a.bold) rg.setFontWeight('bold');
      var c=String(a.colour||a.color||'');
      if(/^#[0-9a-fA-F]{6}$/.test(c)) rg.setBackground(c);
      return 'Formatted '+a.range+'.'; } },

  list_contacts: { need:[], what:'see everyone on the Contacts tab',
    run:function(){ var c=readContacts();
      if(!c.length) return 'The Contacts tab is empty.';
      var l=[]; for(var i=0;i<c.length&&i<40;i++)
        l.push(c[i].name+' — '+(c[i].email||'no email')+(c[i].phone?' — '+c[i].phone:'')+
               (c[i].tags?' ['+c[i].tags+']':''));
      return c.length+' contacts:\n'+l.join('\n'); } },

  add_contacts: { need:['text'], what:'add contacts from pasted text',
    run:function(a){ var r=addContactsFromText(a.text,a.tag);
      return r.ok?('Added '+r.added.length+' ('+r.added.join(', ')+'). Skipped '+r.skipped.length+' duplicates.'):r.why; } },

  email_report: { need:[], what:'email a report on the highlighted rows to contacts',
    run:function(a){ var r=sendReport(a.subject,a.focus,a.tag,false);
      return r.ok?('Emailed '+r.sent.length+' people: '+r.sent.join(', ')+'. '+
        (r.failed.length?('Could not reach '+r.failed.length+'.'):'')):r.why; } },

  inbox_triage: { need:[], what:'read and rank unread emails',
    run:function(a){ var r=triageInbox(a.count||10); return r.ok?r.text:r.why; } },

  draft_reply: { need:['number'], what:'draft a Gmail reply to email number N',
    run:function(a){ var r=draftReply(a.number,a.instruction);
      return r.ok?('Draft saved for "'+r.subject+'":\n'+r.text):r.why; } },

  read_web: { need:['url'], what:'read a web page and answer from it',
    run:function(a){ var r=readWebPage(a.url,a.question); return r.ok?r.text:r.why; } },

  telegram_message: { need:['text'], what:'send a Telegram message',
    run:function(a){ var r=telegramSend(a.text); return r.ok?'Telegram sent.':r.why; } },

  set_reminder: { need:['hour'], what:'set a daily emailed summary at an hour',
    run:function(a){ var r=setDailyReminder(a.hour); return 'Daily summary set for '+r.hour+':00.'; } },

  generate_data: { need:['what'], what:'invent rows of data and write them into the sheet',
    run:function(a){ var r=generateData(a.what,a.rows,a.sheet);
      return r.ok?('Created '+r.rows+' rows and '+r.columns+' columns in "'+r.sheet+'".'):r.why; } },

  enrich_batch: { need:['instruction','source','target'],
    what:'fill a column fast — many rows per request (use this instead of fill_column for big jobs)',
    run:function(a){ var r=enrichBatch(a.instruction,String(a.source).toUpperCase(),
        String(a.target).toUpperCase(),a.first,a.last,a.chunk);
      return r.ok?('Filled '+r.done+' of '+r.asked+' rows in '+r.calls+' requests. '+(r.stopped||r.note||'')):r.why; } },

  clean_column: { need:['column'], what:'tidy messy spellings in a column into one clean version each',
    run:function(a){ var r=cleanColumn(a.column,a.rule);
      return r.ok?('Cleaned '+r.changed+' cells across '+r.values+' different values.'):r.why; } },

  split_column: { need:['source','fields','target'],
    what:'pull structured fields out of a messy column into new columns',
    run:function(a){ var r=splitColumn(String(a.source).toUpperCase(),a.fields,
        String(a.target).toUpperCase(),a.first,a.last);
      return r.ok?('Split '+r.done+' rows into: '+r.fields.join(', ')):r.why; } },

  find_duplicates: { need:['column'], what:'find and highlight repeated values in a column',
    run:function(a){ var r=findDuplicates(a.column);
      if(!r.ok) return r.why;
      return r.count?('Found '+r.count+' duplicates, highlighted in red. Rows: '+r.rows.join(', ')):r.note; } },

  make_chart: { need:['range'], what:'draw a column, bar, line or pie chart from a range',
    run:function(a){ var r=makeChart(a.range,a.kind,a.title);
      return r.ok?('Added a '+r.kind+' chart from '+r.range+'.'):r.why; } },

  write_formula: { need:['a1','goal'], what:'write a real spreadsheet formula into a cell',
    run:function(a){ var r=writeFormula(a.a1,a.goal);
      return r.ok?('Put this in '+r.cell+':  '+r.formula):r.why; } },

  sort_range: { need:['range','column'], what:'sort a range by a column',
    run:function(a){ var r=sortRange(a.range,a.column,a.ascending);
      return r.ok?('Sorted '+r.range+'.'):r.why; } },

  undo_last: { need:[], what:'undo the last change I made to the sheet',
    run:function(){ var r=undoLast();
      return r.ok?('Undone — '+r.restored+' is back to how it was.'):r.why; } },

  news: { need:['topic'], what:'search world news headlines on a topic',
    run:function(a){ var r=newsSearch(a.topic,a.limit||6);
      if(!r.ok) return r.why;
      if(a.save) feedToSheet(r.items,a.save,'news: '+a.topic);
      return r.items.map(function(x){ return '· '+x.title+(x.when?(' ('+x.when+')'):''); }).join('\n'); } },

  tech_news: { need:['topic'], what:'search Hacker News for technical stories',
    run:function(a){ var r=hnSearch(a.topic,a.limit||6);
      return r.ok?r.items.map(function(x){ return '· '+x.title+' ['+x.summary+']'; }).join('\n'):r.why; } },

  read_feed: { need:['url'], what:'read any RSS or Atom feed',
    run:function(a){ var r=readFeed(a.url,a.limit||8);
      if(!r.ok) return r.why;
      if(a.save) feedToSheet(r.items,a.save,a.url);
      return r.items.map(function(x){ return '· '+x.title; }).join('\n'); } },

  reddit: { need:['sub'], what:'read the latest posts from a subreddit',
    run:function(a){ var r=redditFeed(a.sub,a.limit||6);
      return r.ok?r.items.map(function(x){ return '· '+x.title; }).join('\n'):r.why; } },

  wikipedia: { need:['term'], what:'get a short factual summary of a subject',
    run:function(a){ var r=wikiSummary(a.term); return r.ok?(r.title+': '+r.text):r.why; } },

  weather: { need:['lat','lon'], what:'get the weather for a place',
    run:function(a){ var r=weatherFor(a.lat,a.lon,a.place); return r.ok?r.text:r.why; } },

  exchange_rate: { need:['from','to'], what:'get a currency exchange rate',
    run:function(a){ var r=exchangeRate(a.from,a.to); return r.ok?r.text:r.why; } },

  import_table: { need:['url'], what:'pull a table off a web page into a tab',
    run:function(a){ var r=importTable(a.url,a.table);
      if(!r.ok) return r.why;
      var ss=SS();
      var nm=String(a.sheet||'Imported').slice(0,40);
      var sh=ss.getSheetByName(nm); if(sh) sh.clear(); else sh=ss.insertSheet(nm);
      var width=0;
      for(var i=0;i<r.rows.length;i++) width=Math.max(width,r.rows[i].length);
      var grid=r.rows.map(function(row){
        var out=row.slice(); while(out.length<width) out.push(''); return out; });
      sh.getRange(1,1,grid.length,width).setValues(grid);
      sh.getRange(1,1,1,width).setFontWeight('bold');
      return 'Imported '+grid.length+' rows into "'+nm+'".'; } },

  swarm_research: { need:['topic'],
    what:'send a team of agents to research a topic properly (slow but thorough)',
    run:function(a){ var r=swarm(a.topic,a.agents||6,a.urls,true);
      return r.ok?(r.report+'\n\n['+r.worked+' of '+r.agents+' agents · saved to "'+r.sheet+'"]'):r.why; } },

  my_day: { need:[], what:'read the calendar for today',
    run:function(a){ var r=myDay(a.offset||0); return r.ok?(r.text||'Nothing booked.'):r.why; } },

  what_was_i_doing: { need:[], what:'recall what the user was working on recently',
    run:function(a){ var r=whatWasIDoing(a.days===undefined?1:a.days); return r.text; } },

  my_brief: { need:[], what:'build the full personal brief',
    run:function(a){ var r=personalBrief({ topic:a.topic }); return r.ok?r.text:r.why; } },

  save_prompt: { need:['name','goal'], what:'invent and save a reusable instruction',
    run:function(a){ var r=inventPrompt(a.name,a.goal);
      return r.ok?('Saved "'+r.name+'" to the Prompts tab:\n'+r.text):r.why; } },

  improve_prompt: { need:['name'], what:'rewrite a saved instruction so it stops going wrong',
    run:function(a){ var r=improvePrompt(a.name,a.problem);
      return r.ok?('Improved "'+r.name+'". New version:\n'+r.after):r.why; } },

  schedule_job: { need:['job','hour'],
    what:'schedule morningBrief, scheduledBrief or watchSheet at an hour',
    run:function(a){ var r=addJob(a.job,a.hour,a.everyDays);
      return r.ok?('Scheduled '+r.job+' for '+r.hour+':00.'):r.why; } },

  share_sheet: { need:['email'], what:'share this spreadsheet with someone',
    run:function(a){ var r=shareWith(a.email,a.canEdit===true);
      return r.ok?('Shared with '+r.email+' as '+r.role+'.'):r.why; } },

  look_at_picture: { need:['url'], what:'look at a picture from a link and answer about it',
    run:function(a){ var r=readImageUrl(a.url,a.question); return r.ok?r.text:r.why; } },

  picture_in_drive: { need:['file'], what:'look at a picture stored in Google Drive',
    run:function(a){ var r=readImageFromDrive(a.file,a.question); return r.ok?r.text:r.why; } },

  use_connector: { need:['name'], what:'call one of the services on the Connectors tab',
    run:function(a){ var r=callConnector(a.name,a.args||a);
      return r.ok?(r.name+' replied:\n'+r.text.slice(0,2500)):r.why; } },

  add_connector: { need:['name','url'], what:'add a new web service to the Connectors tab',
    run:function(a){ var r=addConnector(a.name,a.what,a.method,a.url,a.needs,a.header);
      return r.ok?('Added the connector "'+r.name+'". You now have '+r.total+'.'):r.why; } },

  make_picture: { need:['prompt'], what:'generate a picture and put it in the sheet',
    run:function(a){ var r=a.toDrive ? imageToDrive(a.prompt,a.width,a.height,a.style)
                                     : imageIntoSheet(a.prompt,a.width,a.height,a.style);
      return r.ok ? ('Made it. '+(r.link?('Saved: '+r.link):('Placed at '+r.where))) : r.why; } },

  write_document: { need:['title'], what:'write a real Google Doc',
    run:function(a){ var r=makeDoc(a.title,a.brief,a.style);
      return r.ok?('Wrote "'+r.title+'" ('+r.words+' words): '+r.link):r.why; } },

  make_slides: { need:['title'], what:'build a Google Slides deck',
    run:function(a){ var r=makeSlides(a.title,a.brief,a.slides);
      return r.ok?('Built '+r.slides+' slides: '+r.link):r.why; } },

  write_code: { need:['request'], what:'write code in any language and save it to Drive',
    run:function(a){ var r=writeCodeFile(a.request,a.language,a.filename);
      return r.ok?(r.language+', '+r.lines+' lines'+(r.link?(': '+r.link):'')+'\n\n'+r.code):r.why; } },

  export_pdf: { need:[], what:'save this spreadsheet as a PDF in Drive',
    run:function(){ var r=sheetToPdf(); return r.ok?('Saved: '+r.link):r.why; } },

  plan_video: { need:['topic'], what:'write a video script, shot list and storyboard frames',
    run:function(a){ var r=makeVideoPlan(a.topic,a.seconds,a.frames!==false);
      return r.ok?('Planned '+r.shots+' shots in "'+r.sheet+'"'+
        (r.frames?(' with '+r.frames+' storyboard frames'):'')+'. '+r.note):r.why; } },

  compare_models: { need:['question'], what:'ask several AI companies the same thing and judge them',
    run:function(a){ var r=compareModels(a.question,a.count);
      if(!r.ok) return r.why;
      return r.results.map(function(x){
        return x.company+' ('+x.seconds+'s): '+x.answer.slice(0,300); }).join('\n\n')+
        (r.verdict?('\n\nVERDICT: '+r.verdict):''); } },

  run_workflow: { need:['name'], what:'run a saved workflow from the Workflows tab',
    run:function(a){ var r=runWorkflow(a.name);
      return r.ok?('Ran "'+r.name+'": '+r.steps.length+' steps in '+r.seconds+'s'+
        (r.failed?(', '+r.failed+' failed'):'')):r.why; } },

  save_workflow: { need:['name','steps'], what:'save a sequence of jobs to run again later',
    run:function(a){ var r=saveWorkflow(a.name,a.what,a.steps);
      return r.ok?('Saved "'+r.name+'" with '+r.steps+' steps.'):r.why; } },

  describe_sheet: { need:[], what:'see every tab, its columns, row counts and sample rows',
    run:function(){ return sheetBriefing(true); } },

  count_rows: { need:[], what:'count the rows in every tab — exact, no guessing',
    run:function(){ var f=sheetFacts();
      if(!f.ok) return f.why;
      return f.name+' has '+f.tabCount+' tabs and '+f.totalRows+' data rows in total:\n'+
        f.tabs.map(function(t){ return '· '+t.name+': '+t.rows+' rows, '+t.cols+' columns'; }).join('\n'); } },

  profile_tab: { need:[], what:'work out what every column actually contains — no guessing',
    run:function(a){ var p=profileTab(a.tab,300);
      if(!p.ok) return p.why;
      return p.tab+': '+p.rows+' rows, '+p.columnCount+' columns\n'+
        p.columns.map(function(c){
          return '· '+c.letter+' "'+c.name+'" — '+c.type+', '+c.complete+'% filled, '+
            c.unique+' distinct'+(c.max!==undefined?(', '+c.min+'–'+c.max):''); }).join('\n')+
        '\n\n'+profileNotes(p).join('\n'); } },

  what_to_do: { need:[], what:'suggest what is genuinely worth doing with a tab',
    run:function(a){ var w=whatToDoWith(a.tab);
      if(!w.ok) return w.why;
      return w.tab+' — '+w.rows+' rows\n\n'+w.notes.join('\n')+'\n\nWorth doing:\n'+
        w.ideas.map(function(i){ return i.icon+' '+i.title+' — '+i.why; }).join('\n'); } },

  find_outliers: { need:['column'], what:'find rows well outside the normal range — real maths, not a guess',
    run:function(a){ var r=findOutliers(a.tab,a.column);
      if(!r.ok) return r.why;
      var out='Column '+r.column+' of '+r.tab+': '+r.counted+' numbers, median '+r.median+
        ', normal range '+r.normalFrom+' to '+r.normalTo+'.\n';
      if(!r.count) return out+'Nothing is unusual.';
      if(r.high.length) out+='Unusually high: '+
        r.high.map(function(x){ return 'row '+x.row+' ('+x.value+')'; }).join(', ')+'\n';
      if(r.low.length) out+='Unusually low: '+
        r.low.map(function(x){ return 'row '+x.row+' ('+x.value+')'; }).join(', ');
      return out; } },

  compare_groups: { need:['column'], what:'count and rank the groups in a column — exact figures',
    run:function(a){ var r=compareGroups(a.tab,a.column,a.value);
      if(!r.ok) return r.why;
      return r.total+' rows across '+r.distinct+' groups:\n'+
        r.groups.map(function(g){ return '· '+g.name+': '+g.count+' ('+g.share+'%)'+
          (g.average!==undefined?(', averaging '+g.average):''); }).join('\n')+
        '\n\n'+r.notes.join(' '); } },

  find_trend: { need:['dateColumn'], what:'see whether things are rising or falling over time',
    run:function(a){ var r=trendOver(a.tab,a.dateColumn,a.valueColumn);
      return r.ok?r.note:r.why; } },

  cross_tabs: { need:['tabA','columnA','tabB','columnB'],
    what:'match two tabs on a shared column and show what is missing from each',
    run:function(a){ var r=crossTabs(a.tabA,a.columnA,a.tabB,a.columnB);
      if(!r.ok) return r.why;
      var out=r.note+'\n';
      if(r.missingFromB.length) out+='\nOnly in '+r.tabA+': '+
        r.missingFromB.map(function(x){ return x.key; }).slice(0,12).join(', ');
      if(r.missingFromA.length) out+='\nOnly in '+r.tabB+': '+
        r.missingFromA.map(function(x){ return x.key; }).slice(0,12).join(', ');
      return out; } },

  today: { need:[], what:'get the exact date, time and day right now',
    run:function(){ var n=rightNow();
      return 'Today is '+n.date+'. The time is '+n.time+' in '+n.zone+'.'; } },

  new_tab: { need:['name'], what:'create a new tab',
    run:function(a){ var ss=SS(), n=String(a.name).slice(0,40);
      if(ss.getSheetByName(n)) return 'A tab called '+n+' already exists.';
      ss.insertSheet(n); return 'Created the tab '+n+'.'; } }
};

function riskyList(){
  var l=[]; for(var n in RISKY) if(RISKY[n].confirm) l.push(n);
  return l.join(', ');
}

function toolMenu(){
  var l=[];
  for(var n in TOOLS){
    var need=TOOLS[n].need.length?(' — needs: '+TOOLS[n].need.join(', ')):'';
    l.push(n+' : '+TOOLS[n].what+need); }
  return l.join('\n');
}

/* =====================================================================
   13. THE AGENT LOOP — think, act, look, decide, repeat
   ===================================================================== */
function rightNow(){
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var d=new Date();
  return { date:Utilities.formatDate(d,tz,'EEEE, d MMMM yyyy'),
           time:Utilities.formatDate(d,tz,'HH:mm'),
           iso:Utilities.formatDate(d,tz,'yyyy-MM-dd'), zone:tz };
}


/* =====================================================================
   38. SHEET INTELLIGENCE
   The assistant was replying "how can I help?" because it had no idea
   what was in front of it. Now it is told, before every request.
   ===================================================================== */

function sheetBriefing(force){
  var cache=CacheService.getScriptCache(), key='brief_v2';
  if(!force){ var hit=cache.get(key); if(hit) return hit; }

  var ss=SS();
  if(!ss) return 'No spreadsheet is connected yet.';

  var all=ss.getSheets(), lines=[], total=0;
  lines.push('SPREADSHEET: "'+ss.getName()+'"');

  var skipped=0;
  for(var i=0;i<all.length && i<20;i++){
    var sh=all[i], rows=sh.getLastRow(), cols=sh.getLastColumn();
    if(isInternalTab(sh.getName())){ skipped++; continue; }
    total+=Math.max(0,rows-1);
    if(rows<1||cols<1){ lines.push('· "'+sh.getName()+'" — empty'); continue; }

    var head='';
    try{ head=sh.getRange(1,1,1,Math.min(cols,12)).getValues()[0]
      .filter(function(x){ return String(x).trim(); }).join(' | '); }catch(e){}

    lines.push('· "'+sh.getName()+'" — '+Math.max(0,rows-1)+' data rows, '+cols+' columns'+
      (head?('\n    columns: '+head):''));

    if(rows>=2){
      try{
        var sample=sh.getRange(2,1,Math.min(2,rows-1),Math.min(cols,8)).getValues();
        for(var s=0;s<sample.length;s++){
          var line=sample[s].map(function(v){ return String(v).slice(0,40); }).join(' | ');
          if(line.replace(/\|/g,'').trim()) lines.push('    e.g. '+line.slice(0,180));
        }
      }catch(e){}
    }
  }
  lines.push('TOTAL DATA ROWS ACROSS ALL TABS: '+total);
  if(skipped) lines.push('('+skipped+' more tabs are the toolkit\'s own bookkeeping — '+
    'contacts, prompts, logs. Do not mention them unless asked.)');

  var w=getWorkset();
  if(w.tab) lines.push('Currently focused on the tab "'+w.tab+'"'+(w.range?(', range '+w.range):'')+'.');

  var out=lines.join('\n').slice(0,3500);
  try{ cache.put(key,out,300); }catch(e){}
  return out;
}

/* Tabs the toolkit made for itself. Real people do not want to browse these. */
var INTERNAL_TABS=['Journal','Chat log','_Undo','Prompts','Connectors','Workflows',
  'Inbox','Feed','Feedback','Summary','Pivot','From picture','Imported'];
function isInternalTab(name){
  var n=String(name||'');
  for(var i=0;i<INTERNAL_TABS.length;i++) if(n===INTERNAL_TABS[i]) return true;
  return n.indexOf('_')===0 || n.indexOf('Research ')===0 || n.indexOf('Video ')===0;
}

function sheetFacts(){
  var ss=SS();
  if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var all=ss.getSheets(), tabs=[], hidden=[], total=0;
  for(var i=0;i<all.length;i++){
    var nm=all[i].getName(), r=Math.max(0,all[i].getLastRow()-1);
    if(isInternalTab(nm)){ hidden.push(nm); continue; }
    total+=r;
    tabs.push({ name:nm, rows:r, cols:all[i].getLastColumn() });
  }
  return { ok:true, name:ss.getName(), tabs:tabs, tabCount:tabs.length,
           totalRows:total, internal:hidden.length, internalNames:hidden };
}

function runAgent(request, source){
  if(!request||!String(request).trim()) return { ok:false, why:'Tell me what you need.' };
  if(!loadKeys().length) return { ok:false, why:'No keys yet. Add one in the Keys tab.' };

  var p=getProfile(), trail=[], notes=[];
  var ss=SS();
  var rg=RG();

  var now=rightNow();
  var head='You are '+(p.name?p.name+"'s":'a')+' assistant. You live inside a Google Sheet '+
    'and you can see exactly what is in it.\n\n'+

    'WHAT IS IN THE SPREADSHEET RIGHT NOW\n'+sheetBriefing()+'\n\n'+

    'HOW TO DECIDE WHAT TO DO\n'+
    '- Asked about THEIR data, tabs, rows, email, contacts or calendar: answer from the '+
    'briefing above if it is already there, otherwise USE A TOOL. Never guess a number.\n'+
    '- Asked the date, the time or the day: it is given below. Just answer it.\n'+
    '- A greeting or small talk: reply warmly in one line, then name ONE specific thing '+
    'you could do with the data you can actually see.\n'+
    '- General knowledge, advice or an explanation: just answer.\n\n'+

    'NEVER:\n'+
    '- Never reply with only a generic offer of help such as "How can I help you today?" '+
    'when you were asked something specific. Answer the question that was asked.\n'+
    '- Never say you cannot see the sheet. You can — it is described above.\n'+
    '- Never invent a figure. Use the briefing, or a tool.\n\n'+

    'Each reply must be JSON ONLY, one of:\n'+
    '{"thought":"why","tool":"tool_name","args":{...}}\n'+
    '{"answer":"your final reply to the user"}\n\n'+
    'TOOLS YOU MAY USE (the ones most likely to help here):\n'+
    relevantTools(request,20).menu+connectorMenu()+'\n\n'+
    'BEFORE ANYTHING IRREVERSIBLE\n'+
    'These tools reach outside the sheet or cannot be taken back: '+riskyList()+'.\n'+
    'For those, do NOT run them straight away. First reply with an answer that says '+
    'exactly what you are about to do, to whom, and how many, and ends with a question '+
    'asking them to confirm. Only run it if they have already said yes in this conversation.\n\n'+
    'Rules:\n'+
    '- One tool per step. You will see the result, then decide the next step.\n'+
    '- When you have enough, reply with {"answer":...}. Under 120 words, plain text.\n'+
    '- If a tool fails twice, stop and say so honestly.\n\n'+
    'CONTEXT\n'+
    'Today is '+now.date+'. The time is '+now.time+' ('+now.zone+').\n'+
    'Highlighted: '+(rg?rg.getA1Notation():'nothing — use the focused tab above')+'\n'+
    (recall()?('Recent history:\n'+recall()+'\n'):'')+
    (recentThread(6)?(recentThread(6)+'\n'):'')+
    (source==='telegram'?'They are on their phone — keep it short and specific.\n':'')+
    '\nREQUEST: '+request;

  for(var step=0; step<AGENT_MAX_STEPS; step++){
    var prompt=head+'\n\nSTEPS SO FAR:\n'+(notes.length?notes.join('\n'):'(none yet)')+
               '\n\nYour next JSON:';
    var raw=callAI(prompt);
    if(looksBroken(raw)) return { ok:false, why:raw, trail:trail };

    var move=parseMove(raw);
    if(!move.ok){
      notes.push('Your last reply was not valid JSON. Reply with JSON only.');
      trail.push({ step:step+1, note:'unreadable reply, asked again' });
      continue;
    }
    if(move.answer!==null && move.answer!==undefined){
      var tidy=polish(move.answer, request);
      var honest=withReceipt(tidy.text, trail);
      remember(request.slice(0,80)+' → '+String(honest).slice(0,60));
      return { ok:true, answer:honest, trail:trail, steps:step+1,
               quality:{ clean:tidy.clean && honest===tidy.text, problems:tidy.problems },
               overclaimed: honest!==tidy.text };
    }

    var name=String(move.tool||'');
    if(!TOOLS[name]){
      notes.push('Tool "'+name+'" does not exist. Choose from the list.');
      trail.push({ step:step+1, tool:name, result:'refused — not a real tool' });
      continue;
    }

    var missing=[];
    for(var m=0;m<TOOLS[name].need.length;m++){
      var f=TOOLS[name].need[m];
      if(move.args[f]===undefined||move.args[f]==='') missing.push(f); }
    if(missing.length){
      notes.push('Tool '+name+' needs: '+missing.join(', ')+'. Try again with those.');
      trail.push({ step:step+1, tool:name, result:'missing '+missing.join(', ') });
      continue;
    }

    var result;
    try{ result=String(TOOLS[name].run(move.args)); }
    catch(err){ result='That tool failed: '+err.message; }

    trail.push({ step:step+1, tool:name, thought:move.thought||'', result:result.slice(0,220) });
    notes.push('STEP '+(step+1)+' — used '+name+'\nRESULT: '+result.slice(0,2500));
  }

  var wrap=callAI('Summarise what happened for the user in under 80 words, plain text. '+
    'Be honest that you ran out of steps.\n\n'+notes.join('\n').slice(0,4000));
  return { ok:true, answer:looksBroken(wrap)?'I ran out of steps before finishing.':wrap,
           trail:trail, steps:AGENT_MAX_STEPS, ranOut:true };
}

function parseMove(raw){
  var t=String(raw||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  var a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a===-1||b===-1||b<a) return { ok:false };
  try{
    var o=JSON.parse(t.slice(a,b+1));
    if(o.answer!==undefined&&o.answer!==null)
      return { ok:true, answer:String(o.answer).slice(0,1500) };
    return { ok:true, answer:null, tool:o.tool, thought:o.thought||'',
             args:(o.args&&typeof o.args==='object')?o.args:{} };
  }catch(e){ return { ok:false }; }
}

/* =====================================================================
   14. REMINDERS
   ===================================================================== */
function setDailyReminder(hour){
  clearReminders();
  var h=Math.max(0,Math.min(23,Number(hour)||8));
  ScriptApp.newTrigger('scheduledBrief').timeBased().everyDays(1).atHour(h).create();
  return { ok:true, hour:h };
}
function clearReminders(){
  var tr=ScriptApp.getProjectTriggers(), n=0;
  for(var i=0;i<tr.length;i++) if(tr[i].getHandlerFunction()==='scheduledBrief'){
    ScriptApp.deleteTrigger(tr[i]); n++; }
  return { ok:true, removed:n };
}
function listReminders(){
  var o=[], tr=ScriptApp.getProjectTriggers();
  for(var i=0;i<tr.length;i++) if(tr[i].getHandlerFunction()==='scheduledBrief')
    o.push({ id:tr[i].getUniqueId() });
  return o;
}
function scheduledBrief(){
  var ss=SS(), sh=ss.getSheets()[0];
  var last=Math.min(sh.getLastRow(),200), lc=Math.min(sh.getLastColumn(),10);
  if(last<2) return;
  var v=sh.getRange(1,1,last,lc).getValues();
  var body=callAI('Write a short daily summary from this table. Use ONLY the table. '+
    'Headline, 3 bullets, one recommended action. Plain text, under 180 words.\n\n'+
    v.map(function(r){ return r.join(' | '); }).join('\n').slice(0,9000));
  if(looksBroken(body)) return;
  var team=recipients('');
  for(var i=0;i<team.length;i++){
    try{ MailApp.sendEmail(team[i].email,'Daily summary — '+ss.getName(),
      body+'\n\nOpen the sheet: '+ss.getUrl(),{ name:'AI Toolkit' }); }catch(e){} }
  telegramSend('☀️ Daily brief\n\n'+body);
}


/* =====================================================================
   16. SUPERPOWERS  —  making data, not just reading it
   Every one of these can be undone.
   ===================================================================== */

var UNDO_SHEET='_Undo';

/* Photograph a range before we change it. */
function snapshot(a1, label){
  try{
    var sh=SH();
    var rg=sh.getRange(a1);
    var ss=SS();
    var u=ss.getSheetByName(UNDO_SHEET);
    if(!u){ u=ss.insertSheet(UNDO_SHEET); u.hideSheet(); }
    u.getRange(1,1,1,5).setValues([[ 'when','sheet','range','label','values' ]]);
    u.getRange(2,1,1,5).setValues([[ new Date().toISOString(), sh.getName(), a1,
      String(label||''), JSON.stringify(rg.getValues()).slice(0,45000) ]]);
    return true;
  }catch(e){ return false; }
}

function undoLast(){
  var ss=SS(), u=ss.getSheetByName(UNDO_SHEET);
  if(!u) return { ok:false, why:'Nothing to undo yet.' };
  var row;
  try{ row=u.getRange(2,1,1,5).getValues()[0]; }catch(e){ return { ok:false, why:'Nothing to undo yet.' }; }
  if(!row||!row[2]) return { ok:false, why:'Nothing to undo yet.' };
  var target=ss.getSheetByName(row[1]);
  if(!target) return { ok:false, why:'That tab is gone.' };
  var vals; try{ vals=JSON.parse(row[4]); }catch(e){ return { ok:false, why:'The saved copy was unreadable.' }; }
  if(!vals||!vals.length) return { ok:false, why:'The saved copy was empty.' };
  target.getRange(row[2]).setValues(vals);
  u.getRange(2,1,1,5).clearContent();
  return { ok:true, restored:row[2], label:row[3] };
}

/* ---------- MAKE DATA OUT OF NOTHING ---------- */
function generateData(what, howMany, targetSheet){
  var n=Math.max(1,Math.min(200,Number(howMany)||20));
  if(!what||!String(what).trim()) return { ok:false, why:'Tell me what to generate.' };

  var raw=callAI(
    'Produce '+n+' rows of data: '+what+'\n\n'+
    'Reply with JSON ONLY, no explanation, no code fences, in this exact shape:\n'+
    '{"headers":["Col A","Col B"],"rows":[["v1","v2"],["v1","v2"]]}\n'+
    'Rules: between 2 and 8 columns. Every row must have the same number of values '+
    'as there are headers. Realistic, varied, plausible values. No commentary.');
  if(looksBroken(raw)) return { ok:false, why:raw };

  var t=String(raw).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  var a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a===-1||b===-1) return { ok:false, why:'It did not return usable data. Try describing it more simply.' };
  var d; try{ d=JSON.parse(t.slice(a,b+1)); }
  catch(e){ return { ok:false, why:'It did not return usable data. Try describing it more simply.' }; }

  var heads=d.headers, rows=d.rows;
  if(!(heads instanceof Array)||!(rows instanceof Array)||!heads.length||!rows.length)
    return { ok:false, why:'It returned an empty table.' };

  var width=heads.length, clean=[];
  for(var i=0;i<rows.length && i<n;i++){
    var r=rows[i];
    if(!(r instanceof Array)) continue;
    var row=[];
    for(var j=0;j<width;j++) row.push(r[j]===undefined||r[j]===null?'':r[j]);
    clean.push(row);
  }
  if(!clean.length) return { ok:false, why:'None of its rows matched the headings.' };

  var ss=SS();
  var name=String(targetSheet||'').trim().slice(0,40);
  var sh;
  if(name){ sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name); else sh.clear(); }
  else { sh=SH(); }

  var start=name?1:(Math.max(sh.getLastRow(),0)+2);
  sh.getRange(start,1,1,width).setValues([heads])
    .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
  sh.getRange(start+1,1,clean.length,width).setValues(clean);
  if(name) sh.setFrozenRows(1);
  return { ok:true, rows:clean.length, columns:width, sheet:sh.getName(), startRow:start };
}

/* ---------- FILL MANY ROWS IN ONE REQUEST ---------- */
function enrichBatch(instruction, sourceCol, targetCol, firstRow, lastRow, chunk){
  if(!instruction||!String(instruction).trim()) return { ok:false, why:'Write an instruction first.' };
  var sh=SH();
  var first=Number(firstRow)||2, last=Number(lastRow)||sh.getLastRow();
  if(last<first) return { ok:false, why:'The last row is above the first row.' };
  var size=Math.max(3,Math.min(25,Number(chunk)||12));

  var src=sh.getRange(sourceCol+first+':'+sourceCol+last).getValues();
  var tgt=sh.getRange(targetCol+first+':'+targetCol+last).getValues();

  snapshot(targetCol+first+':'+targetCol+last,'enrich '+targetCol);

  var todo=[];
  for(var i=0;i<src.length;i++){
    var txt=String(src[i][0]||'').trim();
    if(!txt) continue;
    if(String(tgt[i][0]||'').trim()) continue;
    todo.push({ row:first+i, text:txt });
  }
  if(!todo.length) return { ok:true, done:0, skipped:src.length, note:'Everything was already filled.' };

  var done=0, stopped='';
  for(var s=0;s<todo.length;s+=size){
    var batch=todo.slice(s,s+size), lines=[];
    for(var k=0;k<batch.length;k++) lines.push((k+1)+'. '+batch[k].text.replace(/\n/g,' ').slice(0,400));

    var out=callAI(instruction+'\n\n'+
      'Below are '+batch.length+' numbered items. Answer EVERY one.\n'+
      'Reply with exactly '+batch.length+' lines, each as: number|answer\n'+
      'No heading, no blank lines, no extra words.\n\n'+lines.join('\n'));

    if(looksBroken(out)){ stopped=out; break; }

    var got={}, ls=String(out).split(/\r?\n/);
    for(var L=0;L<ls.length;L++){
      var m=/^\s*(\d+)\s*[|.\):-]\s*(.+)$/.exec(ls[L]);
      if(m) got[Number(m[1])]=m[2].trim();
    }
    for(var q=0;q<batch.length;q++){
      var ans=got[q+1];
      if(ans===undefined) continue;                 // never write a guess into the wrong row
      sh.getRange(targetCol+batch[q].row).setValue(ans);
      done++;
    }
    SpreadsheetApp.flush();
  }
  if(done) noteActivity('rows',done);
  return { ok:true, done:done, asked:todo.length, stopped:stopped,
           calls:Math.ceil(todo.length/size) };
}

/* ---------- TIDY A MESSY COLUMN ---------- */
function cleanColumn(col, rule){
  var sh=SH(), c=String(col||'A').toUpperCase();
  var last=sh.getLastRow();
  if(last<2) return { ok:false, why:'There is nothing to clean.' };
  var vals=sh.getRange(c+'2:'+c+last).getValues();

  var uniq={}, list=[];
  for(var i=0;i<vals.length;i++){ var v=String(vals[i][0]||'').trim();
    if(v && !uniq[v]){ uniq[v]=true; list.push(v); } }
  if(!list.length) return { ok:false, why:'Column '+c+' is empty.' };
  if(list.length>150) return { ok:false, why:'Too many different values ('+list.length+') to clean safely.' };

  var out=callAI('Below is a list of messy values from one spreadsheet column.\n'+
    (rule?('Rule: '+rule+'\n'):'')+
    'Group the ones that mean the same thing and choose one clean spelling for each group.\n'+
    'Reply with one line per value, exactly as: original|clean\n'+
    'Keep the original text on the left exactly as given. No heading, no extra words.\n\n'+
    list.join('\n'));
  if(looksBroken(out)) return { ok:false, why:out };

  var map={}, ls=String(out).split(/\r?\n/);
  for(var L=0;L<ls.length;L++){
    var p=ls[L].split('|');
    if(p.length>=2){ var from=p[0].trim(), to=p.slice(1).join('|').trim();
      if(from && to) map[from]=to; } }

  snapshot(c+'2:'+c+last,'clean '+c);
  var changed=0, fresh=[];
  for(var r=0;r<vals.length;r++){
    var was=String(vals[r][0]||'').trim();
    var now=(was && map[was]!==undefined)?map[was]:vals[r][0];
    if(was && map[was]!==undefined && map[was]!==was) changed++;
    fresh.push([now]);
  }
  sh.getRange(c+'2:'+c+last).setValues(fresh);
  return { ok:true, changed:changed, values:list.length };
}

/* ---------- SPLIT ONE MESSY COLUMN INTO SEVERAL ---------- */
function splitColumn(sourceCol, fields, targetCol, firstRow, lastRow){
  var wanted=String(fields||'').split(',').map(function(x){ return x.trim(); })
             .filter(function(x){ return x; });
  if(wanted.length<2) return { ok:false, why:'Name at least two fields, comma separated.' };
  if(wanted.length>6) return { ok:false, why:'Six fields at most.' };

  var sh=SH();
  var first=Number(firstRow)||2, last=Number(lastRow)||sh.getLastRow();
  var src=sh.getRange(sourceCol+first+':'+sourceCol+last).getValues();
  var startCol=targetCol.toUpperCase().charCodeAt(0)-64;

  sh.getRange(first-1>0?first-1:1, startCol, 1, wanted.length)
    .setValues([wanted]).setFontWeight('bold');

  var done=0;
  for(var s=0;s<src.length;s+=10){
    var batch=[], rows=[];
    for(var i=s;i<Math.min(s+10,src.length);i++){
      var txt=String(src[i][0]||'').trim();
      if(!txt) continue;
      rows.push(first+i); batch.push((batch.length+1)+'. '+txt.slice(0,300));
    }
    if(!batch.length) continue;

    var out=callAI('From each numbered line below, pull out these fields: '+wanted.join(', ')+'\n'+
      'Reply with one line per item, exactly as: number|'+wanted.join('|')+'\n'+
      'If a field is not present write NONE. No heading, no extra words.\n\n'+batch.join('\n'));
    if(looksBroken(out)) return { ok:false, why:out, done:done };

    var ls=String(out).split(/\r?\n/);
    for(var L=0;L<ls.length;L++){
      var m=/^\s*(\d+)\s*\|(.+)$/.exec(ls[L]);
      if(!m) continue;
      var idx=Number(m[1])-1;
      if(idx<0||idx>=rows.length) continue;
      var parts=m[2].split('|');
      var row=[];
      for(var f=0;f<wanted.length;f++) row.push((parts[f]||'').trim());
      sh.getRange(rows[idx], startCol, 1, wanted.length).setValues([row]);
      done++;
    }
  }
  return { ok:true, done:done, fields:wanted };
}

/* ---------- FIND DUPLICATES ---------- */
function findDuplicates(col){
  var sh=SH(), c=String(col||'A').toUpperCase();
  var last=sh.getLastRow();
  if(last<2) return { ok:false, why:'There is nothing to check.' };
  var vals=sh.getRange(c+'2:'+c+last).getValues();
  var seen={}, dupes=[];
  for(var i=0;i<vals.length;i++){
    var v=String(vals[i][0]||'').trim().toLowerCase();
    if(!v) continue;
    if(seen[v]) dupes.push({ row:i+2, value:vals[i][0] });
    else seen[v]=i+2;
  }
  if(!dupes.length) return { ok:true, count:0, note:'No duplicates in column '+c+'.' };
  for(var d=0;d<dupes.length;d++) sh.getRange(c+dupes[d].row).setBackground('#FBEDED');
  return { ok:true, count:dupes.length, rows:dupes.slice(0,25).map(function(x){ return x.row; }) };
}

/* ---------- A REAL CHART ---------- */
function makeChart(range, kind, titleText){
  var sh=SH();
  var rg; try{ rg=sh.getRange(range); }catch(e){ return { ok:false, why:'I could not read '+range }; }
  var b=sh.newChart();
  var k=String(kind||'column').toLowerCase();
  if(k.indexOf('pie')!==-1) b=b.asPieChart();
  else if(k.indexOf('line')!==-1) b=b.asLineChart();
  else if(k.indexOf('bar')!==-1) b=b.asBarChart();
  else b=b.asColumnChart();
  var chart=b.addRange(rg).setPosition(2,7,0,0)
    .setOption('title', String(titleText||'Chart')).build();
  sh.insertChart(chart);
  return { ok:true, kind:k, range:range };
}

/* ---------- LET IT WRITE A SPREADSHEET FORMULA ---------- */
function writeFormula(a1, whatItShouldDo){
  if(!a1||!whatItShouldDo) return { ok:false, why:'I need a cell and a description.' };
  var sh=SH();
  var heads='';
  try{ heads=sh.getRange(1,1,1,Math.min(sh.getLastColumn(),12)).getValues()[0].join(' | '); }catch(e){}

  var out=callAI('Write ONE Google Sheets formula. Reply with the formula only — '+
    'no explanation, no code fences, starting with =.\n'+
    'Sheet headings (row 1): '+heads+'\nLast row with data: '+sh.getLastRow()+'\n\n'+
    'It should: '+whatItShouldDo);
  if(looksBroken(out)) return { ok:false, why:out };

  var f=String(out).replace(/```/g,'').trim().split('\n')[0].trim();
  if(f.indexOf('=')!==0) return { ok:false, why:'It did not return a formula: '+f.slice(0,80) };
  snapshot(a1,'formula');
  sh.getRange(a1).setFormula(f);
  return { ok:true, cell:a1, formula:f };
}

/* ---------- SORT ---------- */
function sortRange(range, columnNumber, ascending){
  var sh=SH();
  try{
    snapshot(range,'sort');
    sh.getRange(range).sort({ column:Number(columnNumber)||1,
      ascending: ascending===false?false:true });
    return { ok:true, range:range };
  }catch(e){ return { ok:false, why:'I could not sort '+range+': '+e.message }; }
}

/* =====================================================================
   17. THE FORMULA, MENU AND WEB APP
   ===================================================================== */
function ASK(instruction,input){
  if(!instruction||!String(instruction).trim())
    return 'BUG: point this at the cell holding your instruction.';
  return callAI(String(instruction)+'\n\nINPUT:\n'+
    ((input===undefined||input===null)?'':String(input)));
}

function onOpen(){
  rememberSheet();
  SpreadsheetApp.getUi().createMenu('🤖 AI Toolkit')
    .addItem('Open the drawer (narrow)','openDrawer')
    .addItem('Open BIG (you can still click cells)','openBig')
    .addItem('Open FULL SCREEN','openHuge')
    .addSeparator()
    .addItem('Hands-free tips','handsFreeHelp')
    .addSeparator()
    .addItem('Connect this sheet to the web app','menuBind')
    .addItem('Set up my Contacts tab','ensureContactsSheet')
    .addItem('Set up my Prompts tab','ensurePromptSheet')
    .addItem('Test all my keys','menuTestKeys')
    .addItem('Repair my models','menuHeal')
    .addToUi();
}
function openDrawer(){
  rememberSheet();
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutputFromFile('Drawer').setTitle('AI Toolkit').setWidth(400));
}
function menuTestKeys(){
  var r=testAllKeys(), l=[];
  if(!r.length){ SpreadsheetApp.getUi().alert('No keys yet.'); return; }
  for(var i=0;i<r.length;i++) l.push(r[i].nickname+' — '+r[i].status+' — '+r[i].note);
  SpreadsheetApp.getUi().alert('Key check\n\n'+l.join('\n'));
}
function menuHeal(){
  var r=healAllKeys(), l=[];
  for(var i=0;i<r.length;i++) l.push((r[i].ok?'✓ ':'✗ ')+r[i].nickname+' — '+r[i].note);
  SpreadsheetApp.getUi().alert('Model repair\n\n'+(l.join('\n')||'No keys yet.'));
}
function handsFreeHelp(){
  var v=getVoiceSettings();
  SpreadsheetApp.getUi().alert(
    'Hands-free\n\n'+
    'Say "'+v.wake+'" then your request. For example:\n'+
    '  "'+v.wake+', what is urgent today?"\n\n'+
    'Microphones are blocked inside spreadsheet dialogs.\n'+
    'For hands-free you need the web app in its own tab:\n'+
    'Deploy > New deployment > Web app > Execute as Me > Access: Only myself.\n'+
    'Open that link, allow the microphone once, and press the headphones.');
}

function menuBind(){
  var id=rememberSheet();
  SpreadsheetApp.getUi().alert(id
    ? 'Connected. The web app will now work on this spreadsheet.'
    : 'I could not read the spreadsheet id. Try again from inside the sheet.');
}

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Drawer').setTitle('AI Toolkit')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}


/* =====================================================================
   18. THE OUTSIDE WORLD  —  free data, no keys, no accounts
   Every source here is open. Nothing below needs a login.
   ===================================================================== */

function httpGet(url, label){
  try{
    var res=UrlFetchApp.fetch(url,{ muteHttpExceptions:true, followRedirects:true,
      headers:{ 'User-Agent':'Mozilla/5.0 (compatible; SheetsAIToolkit/1.0)',
                'Accept':'application/json, application/xml, text/html, */*' } });
    var code=res.getResponseCode();
    if(code!==200) return { ok:false, why:(label||'That source')+' answered '+code+'.' };
    return { ok:true, body:res.getContentText() };
  }catch(e){ return { ok:false, why:'Could not reach '+(label||'that source')+'.' }; }
}

/* ---- RSS and Atom, without needing a library ---- */
function parseFeed(xml, limit){
  var out=[], n=Math.max(1,Math.min(30,limit||10));

  /* Try Google's proper XML reader first. Fall back to plain text if the feed is malformed. */
  try{
    var doc=XmlService.parse(xml), root=doc.getRootElement();
    var items=[];
    var channel=root.getChild('channel');
    if(channel) items=channel.getChildren('item');
    if(!items.length){
      var atom=XmlService.getNamespace('http://www.w3.org/2005/Atom');
      items=root.getChildren('entry',atom);
      for(var a=0;a<items.length && out.length<n;a++){
        var e=items[a];
        var linkEl=e.getChild('link',atom);
        out.push({ title:txtOf(e.getChild('title',atom)),
          link: linkEl?String(linkEl.getAttribute('href')?linkEl.getAttribute('href').getValue():''):'',
          when: txtOf(e.getChild('updated',atom))||txtOf(e.getChild('published',atom)),
          summary: stripHtml(txtOf(e.getChild('summary',atom))).slice(0,300) });
      }
      if(out.length) return out;
    }
    for(var i=0;i<items.length && out.length<n;i++){
      var it=items[i];
      out.push({ title:txtOf(it.getChild('title')), link:txtOf(it.getChild('link')),
        when:txtOf(it.getChild('pubDate')),
        summary:stripHtml(txtOf(it.getChild('description'))).slice(0,300) });
    }
    if(out.length) return out;
  }catch(e){ /* fall through */ }

  var blocks=String(xml).split(/<item[\s>]|<entry[\s>]/i);
  for(var b=1;b<blocks.length && out.length<n;b++){
    var chunk=blocks[b];
    out.push({ title:stripHtml(pick(chunk,'title')),
      link:stripHtml(pick(chunk,'link'))||linkAttr(chunk),
      when:stripHtml(pick(chunk,'pubDate'))||stripHtml(pick(chunk,'updated')),
      summary:stripHtml(pick(chunk,'description')).slice(0,300) });
  }
  return out;
}
function txtOf(el){ try{ return el?String(el.getText()):''; }catch(e){ return ''; } }
function pick(s,tag){
  var m=new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i').exec(s);
  return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,''):'';
}
function linkAttr(s){ var m=/<link[^>]*href=["']([^"']+)["']/i.exec(s); return m?m[1]:''; }

function readFeed(url, limit){
  var r=httpGet(url,'that feed');
  if(!r.ok) return { ok:false, why:r.why };
  var items=parseFeed(r.body, limit);
  if(!items.length) return { ok:false, why:'That link did not look like a news feed.' };
  return { ok:true, items:items };
}

/* ---- News, from Google's open RSS ---- */
function newsSearch(topic, limit){
  var t=String(topic||'').trim();
  if(!t) return { ok:false, why:'What should I search the news for?' };
  return readFeed('https://news.google.com/rss/search?q='+
    encodeURIComponent(t)+'&hl=en-KE&gl=KE&ceid=KE:en', limit||8);
}

/* ---- Hacker News, for anything technical ---- */
function hnSearch(topic, limit){
  var n=Math.max(1,Math.min(20,limit||8));
  var r=httpGet('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage='+n+
    '&query='+encodeURIComponent(String(topic||'')),'Hacker News');
  if(!r.ok) return { ok:false, why:r.why };
  var d; try{ d=JSON.parse(r.body); }catch(e){ return { ok:false, why:'Hacker News sent something unreadable.' }; }
  var hits=d.hits||[], out=[];
  for(var i=0;i<hits.length;i++){
    out.push({ title:hits[i].title||'', link:hits[i].url||('https://news.ycombinator.com/item?id='+hits[i].objectID),
      when:(hits[i].created_at||'').slice(0,10), points:hits[i].points||0,
      summary:'' + (hits[i].points||0) + ' points, ' + (hits[i].num_comments||0) + ' comments' });
  }
  return out.length ? { ok:true, items:out } : { ok:false, why:'Nothing found on Hacker News.' };
}

/* ---- Reddit, also open RSS ---- */
function redditFeed(sub, limit){
  var s=String(sub||'').replace(/[^A-Za-z0-9_]/g,'');
  if(!s) return { ok:false, why:'Which subreddit?' };
  return readFeed('https://www.reddit.com/r/'+s+'/.rss', limit||8);
}

/* ---- Wikipedia, for a quick grounded definition ---- */
function wikiSummary(term){
  var t=String(term||'').trim();
  if(!t) return { ok:false, why:'What should I look up?' };
  var r=httpGet('https://en.wikipedia.org/api/rest_v1/page/summary/'+
    encodeURIComponent(t.replace(/\s+/g,'_')),'Wikipedia');
  if(!r.ok) return { ok:false, why:'Wikipedia has no page for "'+t+'".' };
  var d; try{ d=JSON.parse(r.body); }catch(e){ return { ok:false, why:'Wikipedia sent something unreadable.' }; }
  if(!d.extract) return { ok:false, why:'Wikipedia has no summary for "'+t+'".' };
  return { ok:true, title:d.title, text:d.extract,
    link:(d.content_urls&&d.content_urls.desktop)?d.content_urls.desktop.page:'' };
}

/* ---- Weather, free and keyless ---- */
function weatherFor(lat, lon, place){
  var la=Number(lat), lo=Number(lon);
  if(isNaN(la)||isNaN(lo)) return { ok:false, why:'I need a latitude and longitude.' };
  var r=httpGet('https://api.open-meteo.com/v1/forecast?latitude='+la+'&longitude='+lo+
    '&current=temperature_2m,precipitation,weather_code'+
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'+
    '&timezone=auto&forecast_days=2','the weather service');
  if(!r.ok) return { ok:false, why:r.why };
  var d; try{ d=JSON.parse(r.body); }catch(e){ return { ok:false, why:'The weather reply was unreadable.' }; }
  var c=d.current||{}, day=d.daily||{};
  return { ok:true, place:place||(''+la+', '+lo),
    now:c.temperature_2m, rain:c.precipitation,
    high:(day.temperature_2m_max||[])[0], low:(day.temperature_2m_min||[])[0],
    rainChance:(day.precipitation_probability_max||[])[0],
    text:(place||'There')+': '+c.temperature_2m+'°C now, high '+(day.temperature_2m_max||[])[0]+
         '°, low '+(day.temperature_2m_min||[])[0]+'°, '+
         ((day.precipitation_probability_max||[])[0]||0)+'% chance of rain.' };
}

/* ---- Exchange rates, free and keyless ---- */
function exchangeRate(from, to){
  var f=String(from||'USD').toUpperCase().slice(0,3), t=String(to||'KES').toUpperCase().slice(0,3);
  var r=httpGet('https://api.frankfurter.app/latest?from='+f+'&to='+t,'the currency service');
  if(!r.ok) return { ok:false, why:r.why };
  var d; try{ d=JSON.parse(r.body); }catch(e){ return { ok:false, why:'The rate reply was unreadable.' }; }
  var rate=(d.rates||{})[t];
  if(rate===undefined) return { ok:false, why:'No rate for '+f+' to '+t+'.' };
  return { ok:true, from:f, to:t, rate:rate, date:d.date,
    text:'1 '+f+' = '+rate+' '+t+' (as at '+d.date+')' };
}

/* ---- Anything with a table on the page ---- */
function importTable(url, whichTable){
  var r=httpGet(url,'that page');
  if(!r.ok) return { ok:false, why:r.why };
  var tables=String(r.body).match(/<table[\s\S]*?<\/table>/gi)||[];
  if(!tables.length) return { ok:false, why:'That page has no tables in it.' };
  var idx=Math.max(0,Math.min(tables.length-1,(Number(whichTable)||1)-1));
  var rows=tables[idx].match(/<tr[\s\S]*?<\/tr>/gi)||[];
  var out=[];
  for(var i=0;i<rows.length && i<200;i++){
    var cells=rows[i].match(/<t[hd][\s\S]*?<\/t[hd]>/gi)||[];
    var row=[];
    for(var c=0;c<cells.length && c<20;c++) row.push(stripHtml(cells[c]).trim());
    if(row.join('').trim()) out.push(row);
  }
  if(!out.length) return { ok:false, why:'That table was empty.' };
  return { ok:true, rows:out, tables:tables.length };
}

/* Put fetched items into a tab so they become data, not just an answer. */
function feedToSheet(items, tabName, sourceLabel){
  var ss=SS();
  var name=String(tabName||'Feed').slice(0,40);
  var sh=ss.getSheetByName(name);
  if(!sh){ sh=ss.insertSheet(name);
    sh.getRange(1,1,1,5).setValues([['Fetched','Source','Title','When','Link']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1); }
  var stamp=new Date();
  var rows=[];
  for(var i=0;i<items.length;i++)
    rows.push([stamp, sourceLabel||'', items[i].title||'', items[i].when||'', items[i].link||'']);
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,rows.length,5).setValues(rows);
  return { ok:true, added:rows.length, sheet:name };
}

/* =====================================================================
   19. THE PROMPT LIBRARY  —  prompts live in a sheet, not in the code
   You can edit them. The AI can improve them. Nothing is hardcoded.
   ===================================================================== */

var PROMPT_SHEET='Prompts';

/* The starting set. These are only defaults — the sheet always wins. */
var DEFAULT_PROMPTS = {
  analyst:
    'You are a careful data analyst. THE TABLE IS YOUR ONLY SOURCE.\n'+
    'You MAY count, add up, compare, rank and summarise — that is analysis, not invention.\n'+
    'Reply exactly "NOT IN THE DATA" only when the question is about something absent from the table.\n'+
    'Never state a figure you cannot get from the rows shown.',
  classifier:
    'Classify the input into exactly one of the categories given.\n'+
    'Reply with one word only. If it fits none of them, reply UNCLEAR.',
  reporter:
    'Write a short business report from the data.\n'+
    'One-line headline, then 3 to 5 bullet findings, then one recommended action.\n'+
    'Plain text, no markdown symbols, under 200 words. Use only what you were given.',
  emailer:
    'Write a warm, professional reply under 120 words. Plain text.\n'+
    'Apologise where it is warranted. Promise nothing specific. Invent no facts.',
  researcher:
    'Answer using ONLY the notes provided. If they do not answer it, reply "NOT IN THE SOURCES".\n'+
    'Be specific. Prefer numbers and names that appear in the notes. Under 70 words.',
  briefer:
    'Write a short morning brief. Warm, direct, no filler.\n'+
    'Lead with the single most important thing. Then at most 5 short lines.\n'+
    'End with one suggested first action. Plain text.',
  planner:
    'Break the topic into distinct angles that together give full coverage.\n'+
    'Each angle must be genuinely different from the others. One per line, no numbering.',
  critic:
    'Review the findings below. Name anything unsupported, contradictory or missing.\n'+
    'Be brief and specific. If it is sound, say so in one line.'
};

function ensurePromptSheet(){
  var ss=SS(), sh=ss.getSheetByName(PROMPT_SHEET);
  if(!sh){
    sh=ss.insertSheet(PROMPT_SHEET);
    sh.getRange(1,1,1,4).setValues([['Name','Prompt','Notes','Updated']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,150); sh.setColumnWidth(2,620);
    sh.setColumnWidth(3,220); sh.setColumnWidth(4,120);
    var rows=[];
    for(var k in DEFAULT_PROMPTS) rows.push([k, DEFAULT_PROMPTS[k], 'built in', '']);
    sh.getRange(2,1,rows.length,4).setValues(rows);
    sh.getRange(2,2,rows.length,1).setWrap(true);
  }
  return sh;
}

function allPrompts(){
  var sh=ensurePromptSheet(), last=sh.getLastRow();
  if(last<2) return {};
  var vals=sh.getRange(2,1,last-1,4).getValues(), out={};
  for(var i=0;i<vals.length;i++){
    var n=String(vals[i][0]||'').trim(), p=String(vals[i][1]||'').trim();
    if(n&&p) out[n]={ prompt:p, notes:String(vals[i][2]||''), row:i+2 };
  }
  return out;
}

/* Read a prompt by name. Falls back to the built-in, then to whatever you pass. */
function getPrompt(name, fallback){
  try{
    var all=allPrompts();
    if(all[name]) return all[name].prompt;
  }catch(e){}
  return DEFAULT_PROMPTS[name] || fallback || '';
}

function savePrompt(name, text, notes){
  var n=String(name||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
  if(!n) return { ok:false, why:'Give the prompt a short name.' };
  if(!String(text||'').trim()) return { ok:false, why:'The prompt is empty.' };
  var sh=ensurePromptSheet(), all=allPrompts();
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var when=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  if(all[n]){
    sh.getRange(all[n].row,2,1,3).setValues([[String(text), String(notes||''), when]]);
    return { ok:true, name:n, updated:true };
  }
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,4)
    .setValues([[n, String(text), String(notes||''), when]]);
  return { ok:true, name:n, updated:false };
}

/* Ask the AI to write a new prompt for a goal, and file it. */
function inventPrompt(name, goal){
  if(!goal||!String(goal).trim()) return { ok:false, why:'What should the prompt achieve?' };
  var out=callAI(
    'Write an instruction that will be given to an AI every time it does this job:\n'+
    goal+'\n\n'+
    'Rules for the instruction you write:\n'+
    '- state the role, the task, the exact output format, and what it must NOT do\n'+
    '- include an escape hatch: what to reply when it cannot answer honestly\n'+
    '- plain text, no markdown, under 120 words\n'+
    'Reply with the instruction ONLY — no preamble, no quotes around it.');
  if(looksBroken(out)) return { ok:false, why:out };
  var text=String(out).replace(/```/g,'').trim();
  var saved=savePrompt(name||('prompt_'+Date.now()), text, 'written by AI for: '+goal.slice(0,80));
  if(!saved.ok) return saved;
  return { ok:true, name:saved.name, text:text };
}

/* Ask the AI to improve an existing prompt, using a real example of it going wrong. */
function improvePrompt(name, whatWentWrong){
  var all=allPrompts(), cur=all[name]?all[name].prompt:DEFAULT_PROMPTS[name];
  if(!cur) return { ok:false, why:'There is no prompt called "'+name+'".' };
  var out=callAI(
    'Here is an instruction currently given to an AI:\n\n'+cur+'\n\n'+
    'It went wrong like this: '+(whatWentWrong||'it was vague and the output varied')+'\n\n'+
    'Rewrite it so that problem cannot happen again. Keep everything that already works. '+
    'Keep it under 140 words, plain text. Reply with the rewritten instruction ONLY.');
  if(looksBroken(out)) return { ok:false, why:out };
  var text=String(out).replace(/```/g,'').trim();
  savePrompt(name, text, 'improved: '+String(whatWentWrong||'').slice(0,60));
  return { ok:true, name:name, before:cur, after:text };
}

function resetPrompt(name){
  if(!DEFAULT_PROMPTS[name]) return { ok:false, why:'"'+name+'" has no built-in version.' };
  savePrompt(name, DEFAULT_PROMPTS[name], 'reset to built in');
  return { ok:true, name:name };
}

/* =====================================================================
   20. THE JOURNAL  —  so it can tell you what you were doing yesterday
   ===================================================================== */

var LOG_SHEET='Journal';

function ensureLogSheet(){
  var ss=SS(), sh=ss.getSheetByName(LOG_SHEET);
  if(!sh){
    sh=ss.insertSheet(LOG_SHEET);
    sh.getRange(1,1,1,4).setValues([['When','Day','What','Detail']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange('A2:B').setNumberFormat('@');
    sh.setColumnWidth(1,150); sh.setColumnWidth(2,110);
    sh.setColumnWidth(3,180); sh.setColumnWidth(4,520);
    sh.hideSheet();
  }
  return sh;
}

function logIt(what, detail){
  try{
    var sh=ensureLogSheet();
    var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
    var now=new Date();
    sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,4).setValues([[
      Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm'),
      Utilities.formatDate(now,tz,'yyyy-MM-dd'),
      String(what||'').slice(0,60),
      String(detail||'').slice(0,400)
    ]]);
    /* keep it from growing forever */
    if(sh.getLastRow()>900) sh.deleteRows(2,300);
    return true;
  }catch(e){ return false; }
}

function readJournal(daysBack){
  var sh=ensureLogSheet(), last=sh.getLastRow();
  if(last<2) return { ok:true, days:{}, lines:[], count:0 };
  var take=Math.min(last-1,400);
  var vals=sh.getRange(last-take+1,1,take,4).getValues();
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var cutoff=new Date(); cutoff.setDate(cutoff.getDate()-(Number(daysBack)||7));
  var cut=Utilities.formatDate(cutoff,tz,'yyyy-MM-dd');
  var days={}, lines=[];
  for(var i=0;i<vals.length;i++){
    var day=String(vals[i][1]||'');
    if(day<cut) continue;
    if(!days[day]) days[day]=[];
    days[day].push({ when:vals[i][0], what:vals[i][2], detail:vals[i][3] });
    lines.push(vals[i][0]+' — '+vals[i][2]+(vals[i][3]?(': '+vals[i][3]):''));
  }
  return { ok:true, days:days, lines:lines, count:lines.length };
}

function daysAgoKey(n){
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var d=new Date(); d.setDate(d.getDate()-(Number(n)||0));
  return Utilities.formatDate(d,tz,'yyyy-MM-dd');
}

function whatWasIDoing(daysBack){
  var back=Number(daysBack); if(isNaN(back)) back=1;
  var j=readJournal(Math.max(back+1,2));
  var key=daysAgoKey(back);
  var entries=j.days[key]||[];
  var label = back===0?'today' : back===1?'yesterday' : (back+' days ago');
  if(!entries.length) return { ok:true, text:'Nothing recorded for '+label+'.', count:0 };

  var lines=[];
  for(var i=0;i<entries.length;i++)
    lines.push(entries[i].when.slice(-5)+' — '+entries[i].what+
      (entries[i].detail?(': '+entries[i].detail):''));

  var out=callAI(getPrompt('briefer')+'\n\n'+
    'Summarise what this person did '+label+'. Group similar things. '+
    'Under 90 words. Then one line: what looks unfinished.\n\n'+lines.join('\n'));
  if(looksBroken(out)) return { ok:true, text:lines.join('\n'), count:entries.length, raw:true };
  return { ok:true, text:out, count:entries.length };
}

/* =====================================================================
   21. YOUR DIARY  —  free, built into Apps Script
   ===================================================================== */
function myDay(dayOffset){
  var d=new Date(); d.setDate(d.getDate()+(Number(dayOffset)||0));
  var start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0);
  var end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59);
  var events;
  try{ events=CalendarApp.getDefaultCalendar().getEvents(start,end); }
  catch(e){ return { ok:false, why:'I could not read your calendar: '+e.message }; }
  if(!events.length) return { ok:true, count:0, text:'Nothing in your calendar.' };
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  var lines=[];
  for(var i=0;i<events.length && i<15;i++){
    var ev=events[i];
    lines.push(Utilities.formatDate(ev.getStartTime(),tz,'HH:mm')+' — '+ev.getTitle());
  }
  return { ok:true, count:events.length, text:lines.join('\n'), items:lines };
}

function nextFreeSlot(hoursNeeded){
  var need=Math.max(1,Math.min(8,Number(hoursNeeded)||2));
  var day=myDay(0);
  if(!day.ok) return day;
  return { ok:true, text:'You have '+day.count+' things booked today. '+
    'Ask me to look at tomorrow if today is full.\n'+(day.text||''), need:need };
}

/* =====================================================================
   22. THE BRIEFING  —  everything in one place
   ===================================================================== */
function personalBrief(options){
  var o=options||{};
  var p=getProfile(), now=rightNow(), parts=[], sources=[];

  parts.push('TIME: '+now.date+', '+now.time);

  if(o.calendar!==false){
    var cal=myDay(0);
    if(cal.ok && cal.count){ parts.push('CALENDAR TODAY:\n'+cal.text); sources.push('calendar'); }
  }

  if(o.journal!==false){
    var y=whatWasIDoing(1);
    if(y.count){ parts.push('YESTERDAY:\n'+y.text); sources.push('journal'); }
  }

  if(o.inbox!==false){
    var box=gmailUnread(6);
    if(box.ok && box.count){
      var short=[];
      for(var i=0;i<box.items.length;i++) short.push(box.items[i].from+' — '+box.items[i].subject);
      parts.push('UNREAD EMAIL ('+box.count+'):\n'+short.join('\n'));
      sources.push('inbox');
    }
  }

  if(o.news!==false){
    var topic=String(o.topic||'artificial intelligence');
    var nw=newsSearch(topic,5);
    if(nw.ok){
      var heads=[];
      for(var n=0;n<nw.items.length;n++) heads.push(nw.items[n].title);
      parts.push('NEWS ON '+topic.toUpperCase()+':\n'+heads.join('\n'));
      sources.push('news');
    }
  }

  if(o.sheet!==false){
    try{
      var sh=SS().getSheets()[0];
      var lastRow=Math.min(sh.getLastRow(),40), lastCol=Math.min(sh.getLastColumn(),8);
      if(lastRow>1){
        var v=sh.getRange(1,1,lastRow,lastCol).getValues();
        parts.push('YOUR SHEET ("'+sh.getName()+'", first rows):\n'+
          v.map(function(r){ return r.join(' | '); }).join('\n').slice(0,2500));
        sources.push('sheet');
      }
    }catch(e){}
  }

  if(o.weather && o.lat && o.lon){
    var w=weatherFor(o.lat,o.lon,o.place);
    if(w.ok){ parts.push('WEATHER: '+w.text); sources.push('weather'); }
  }

  if(!sources.length) return { ok:false, why:'I had nothing to brief you on yet.' };

  var text=callAI(getPrompt('briefer')+'\n\n'+
    'Write the brief for '+(p.name||'the user')+'. Start with a natural greeting for the time of day.\n'+
    'Cover, in this order and only if there is something worth saying: anything urgent, '+
    'the calendar, unfinished work from yesterday, email that needs a reply, and one relevant headline.\n'+
    'End with one line beginning "First thing: ".\n'+
    'Under 160 words. Plain text, no markdown, no bullets with symbols.\n\n'+
    parts.join('\n\n'));
  if(looksBroken(text)) return { ok:false, why:text };

  logIt('brief','Delivered a personal brief using: '+sources.join(', '));
  return { ok:true, text:text, sources:sources };
}

/* Short enough to be spoken aloud when the drawer opens. */
function spokenGreeting(){
  var p=getProfile(), now=rightNow();
  var bits=[buildGreeting(p.name)+'.'];
  try{
    var cal=myDay(0);
    if(cal.ok&&cal.count) bits.push('You have '+cal.count+' thing'+(cal.count>1?'s':'')+' booked today.');
  }catch(e){}
  try{
    var box=gmailUnread(20);
    if(box.ok&&box.count) bits.push(box.count+' unread email'+(box.count>1?'s':'')+'.');
  }catch(e){}
  if(p.streak>1) bits.push('That is '+p.streak+' days in a row.');
  return { ok:true, text:bits.join(' '), name:p.name, time:now.time };
}

/* =====================================================================
   23. THE SWARM  —  many small agents, each with one job
   They divide the topic, work separately, criticise each other,
   and one of them writes the final brief.
   ===================================================================== */

var SWARM_MAX=20;

/* Spread the work across DIFFERENT keys, so no single provider carries it. */
function keyForWorker(index){
  var live=[], all=loadKeys();
  for(var i=0;i<all.length;i++){
    if(all[i].enabled===false) continue;
    if(!BOOK[all[i].provider]) continue;
    if(isResting(all[i].id)) continue;
    live.push(all[i].id);
  }
  if(!live.length) return null;
  return live[index % live.length];
}

function swarm(topic, howMany, urls, writeTab){
  if(!topic||!String(topic).trim()) return { ok:false, why:'Give me a topic to work on.' };
  if(!loadKeys().length) return { ok:false, why:'No keys yet. Add one in the Keys tab.' };
  var n=Math.max(2,Math.min(SWARM_MAX,Number(howMany)||6));
  var trail=[];

  /* ---------- 1. THE PLANNER splits the work ---------- */
  var plan=callAI(getPrompt('planner')+'\n\n'+
    'Topic: '+topic+'\n'+
    'Produce exactly '+n+' angles. Each on its own line, in the form:\n'+
    'ROLE :: the question that role must answer\n'+
    'Roles should be varied, for example: historian, sceptic, numbers person, '+
    'practitioner, risk analyst, local expert, customer, competitor watcher.');
  if(looksBroken(plan)) return { ok:false, why:plan };

  var jobs=[], lines=String(plan).split(/\r?\n/);
  for(var L=0;L<lines.length && jobs.length<n;L++){
    var raw=lines[L].replace(/^[-*\d.\s]+/,'').trim();
    if(!raw) continue;
    var bits=raw.split('::');
    if(bits.length>=2){
      var role=bits[0].trim().slice(0,40), q=bits.slice(1).join('::').trim();
      if(role && q.length>5) jobs.push({ role:role, question:q });
    } else if(raw.length>12){
      jobs.push({ role:'Analyst '+(jobs.length+1), question:raw });
    }
  }
  if(jobs.length<2) return { ok:false, why:'I could not split that topic up. Try describing it differently.' };
  trail.push('Planner split the topic into '+jobs.length+' roles');

  /* ---------- 2. GATHER the shared evidence once ---------- */
  var notes=[], gathered=[];

  var sel=selectionAsTable();
  if(sel.rows){ notes.push('FROM THE SHEET ('+sel.label+'):\n'+sel.text.slice(0,5000));
                gathered.push(sel.rows+' rows from your sheet'); }

  var list=String(urls||'').split(/[\s,;]+/).filter(function(u){ return u.indexOf('http')===0; });
  for(var u=0;u<list.length && u<3;u++){
    var page=readWebPage(list[u],'Summarise everything relevant to: '+topic);
    if(page.ok){ notes.push('FROM '+list[u]+':\n'+page.text); gathered.push(list[u]); }
  }

  var news=newsSearch(topic,6);
  if(news.ok){
    var heads=[];
    for(var h=0;h<news.items.length;h++)
      heads.push('· '+news.items[h].title+(news.items[h].when?(' ('+news.items[h].when+')'):''));
    notes.push('RECENT HEADLINES:\n'+heads.join('\n'));
    gathered.push('news headlines');
  }

  var wiki=wikiSummary(topic);
  if(wiki.ok){ notes.push('BACKGROUND (Wikipedia):\n'+wiki.text); gathered.push('Wikipedia'); }

  if(!notes.length) return { ok:false,
    why:'I found nothing to work from. Highlight some rows, or give me a link.' };
  trail.push('Gathered evidence from: '+gathered.join(', '));

  var evidence=notes.join('\n\n').slice(0,9000);

  /* ---------- 3. THE WORKERS, one question each ---------- */
  var findings=[];
  for(var w=0;w<jobs.length;w++){
    var keyId=keyForWorker(w);
    var answer=callAI(
      'You are the '+jobs[w].role+' on a research team.\n'+
      getPrompt('researcher')+'\n\n'+
      'Your question: '+jobs[w].question+'\n\n'+
      'EVIDENCE:\n'+evidence, keyId||undefined);
    if(looksBroken(answer)){
      findings.push({ role:jobs[w].role, question:jobs[w].question,
        answer:'(this worker could not run: '+answer+')', failed:true });
    } else {
      findings.push({ role:jobs[w].role, question:jobs[w].question, answer:answer });
    }
  }
  var worked=0;
  for(var f=0;f<findings.length;f++) if(!findings[f].failed) worked++;
  if(!worked) return { ok:false, why:'Every worker failed. Check your keys.' };
  trail.push(worked+' of '+findings.length+' workers reported back');

  var packed=findings.map(function(x){
    return x.role+' — '+x.question+'\n'+x.answer; }).join('\n\n');

  /* ---------- 4. THE CRITIC ---------- */
  var critique=callAI(getPrompt('critic')+'\n\nFINDINGS:\n'+packed.slice(0,9000));
  if(looksBroken(critique)) critique='';
  if(critique) trail.push('A critic reviewed the findings');

  /* ---------- 5. THE WRITER ---------- */
  var report=callAI(
    'Write a research brief on: '+topic+'\n'+
    'Use ONLY the findings below. Structure:\n'+
    'a one-line headline; then 5 short findings; then "Still unknown:" with one line; '+
    'then "What I would do next:" with one line.\n'+
    'Plain text, no markdown symbols, under 260 words.\n\n'+
    'FINDINGS:\n'+packed.slice(0,8000)+
    (critique?('\n\nA REVIEWER SAID:\n'+critique.slice(0,1200)):''));
  var degraded=false;
  if(looksBroken(report)){
    /* The writer could not run — usually every key is resting. Do not throw away
       work that is already done. Hand back the findings as they stand. */
    degraded=true;
    var kept=[];
    for(var g=0;g<findings.length;g++)
      if(!findings[g].failed) kept.push(findings[g].role+': '+findings[g].answer);
    report='(I could not write the final brief — '+report+')\n\n'+
           'Here is what the team found:\n\n'+kept.join('\n\n');
    trail.push('Writer unavailable — returned the raw findings instead');
  } else {
    trail.push('Final brief written');
  }

  /* ---------- 6. WRITE IT DOWN ---------- */
  var where='';
  if(writeTab!==false){
    var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
    var name=('Research '+Utilities.formatDate(new Date(),tz,'dd MMM HH:mm')).slice(0,40);
    var ss=SS();
    if(ss.getSheetByName(name)) name=(name+' b').slice(0,40);
    var sh=ss.insertSheet(name);
    sh.getRange(1,1).setValue('RESEARCH: '+topic).setFontWeight('bold').setFontSize(14);
    sh.getRange(2,1).setValue('Sources: '+gathered.join('; '));
    sh.getRange(3,1).setValue(jobs.length+' agents · '+worked+' reported back');
    sh.getRange(5,1).setValue(report).setWrap(true);
    sh.getRange(7,1,1,3).setValues([['Role','Question','What they found']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    var rows=findings.map(function(x){ return [x.role,x.question,x.answer]; });
    sh.getRange(8,1,rows.length,3).setValues(rows);
    sh.getRange(8,1,rows.length,3).setWrap(true);
    if(critique) sh.getRange(8+rows.length+1,1).setValue('REVIEWER: '+critique).setWrap(true);
    sh.setColumnWidth(1,170); sh.setColumnWidth(2,320); sh.setColumnWidth(3,620);
    sh.setFrozenRows(7);
    where=name;
  }

  logIt('research','Swarm of '+jobs.length+' on: '+topic.slice(0,60));
  return { ok:true, report:report, findings:findings, critique:critique, degraded:degraded,
           agents:jobs.length, worked:worked, sources:gathered, trail:trail, sheet:where };
}

/* =====================================================================
   24. TRIGGERS  —  managed from inside the app
   ===================================================================== */
var JOBS = {
  scheduledBrief:  'A summary of your sheet, emailed and sent to Telegram',
  morningBrief:    'Your full personal brief: calendar, yesterday, inbox, news',
  watchSheet:      'Checks your sheet and only speaks up if something looks wrong'
};

function listJobs(){
  var out=[], tr=ScriptApp.getProjectTriggers();
  for(var i=0;i<tr.length;i++){
    var fn=tr[i].getHandlerFunction();
    if(JOBS[fn]) out.push({ id:tr[i].getUniqueId(), job:fn, what:JOBS[fn] });
  }
  return out;
}

function addJob(job, hour, everyDays){
  if(!JOBS[job]) return { ok:false, why:'I do not know a job called "'+job+'".' };
  removeJob(job);
  var h=Math.max(0,Math.min(23,Number(hour)||8));
  var d=Math.max(1,Math.min(7,Number(everyDays)||1));
  ScriptApp.newTrigger(job).timeBased().everyDays(d).atHour(h).create();
  logIt('schedule','Set "'+job+'" for '+h+':00 every '+d+' day(s)');
  return { ok:true, job:job, hour:h, everyDays:d };
}

function removeJob(job){
  var tr=ScriptApp.getProjectTriggers(), n=0;
  for(var i=0;i<tr.length;i++)
    if(tr[i].getHandlerFunction()===job){ ScriptApp.deleteTrigger(tr[i]); n++; }
  return { ok:true, removed:n };
}

function removeAllJobs(){
  var tr=ScriptApp.getProjectTriggers(), n=0;
  for(var i=0;i<tr.length;i++)
    if(JOBS[tr[i].getHandlerFunction()]){ ScriptApp.deleteTrigger(tr[i]); n++; }
  return { ok:true, removed:n };
}

/* The scheduled personal brief */
function morningBrief(){
  var b=personalBrief({ topic:'artificial intelligence' });
  if(!b.ok) return;
  telegramSend('☀️ ' + b.text);
  var team=recipients('me');
  for(var i=0;i<team.length;i++){
    try{ MailApp.sendEmail(team[i].email,'Your morning brief',b.text,{ name:'AI Toolkit' }); }catch(e){}
  }
  if(!team.length){
    try{ MailApp.sendEmail(Session.getActiveUser().getEmail(),'Your morning brief',b.text,
      { name:'AI Toolkit' }); }catch(e){}
  }
}

/* Only speaks up when something is actually wrong */
function watchSheet(){
  var sh=SS().getSheets()[0];
  var last=Math.min(sh.getLastRow(),120), lc=Math.min(sh.getLastColumn(),8);
  if(last<2) return;
  var v=sh.getRange(1,1,last,lc).getValues();
  var out=callAI(
    'Look at the table below. Reply with the single word NOTHING if there is no problem.\n'+
    'Otherwise reply with at most 3 short lines naming what looks wrong, urgent or unusual. '+
    'Use only what is in the table. No preamble.\n\n'+
    v.map(function(r){ return r.join(' | '); }).join('\n').slice(0,7000));
  if(looksBroken(out)) return;
  if(String(out).trim().toUpperCase().indexOf('NOTHING')===0) return;
  telegramSend('👀 Something to look at:\n\n'+out);
  logIt('watch','Flagged something in the sheet');
}

/* =====================================================================
   25. SHARING  —  hand the sheet to someone
   ===================================================================== */
function shareWith(email, canEdit){
  var e=String(email||'').trim();
  if(!validEmail(e)) return { ok:false, why:'That email does not look right.' };
  try{
    var f=DriveApp.getFileById(SS().getId());
    if(canEdit===true) f.addEditor(e); else f.addViewer(e);
    logIt('share','Shared with '+e+(canEdit?' (can edit)':' (view only)'));
    return { ok:true, email:e, role:canEdit?'editor':'viewer',
      link:SS().getUrl() };
  }catch(err){ return { ok:false, why:'I could not share it: '+err.message }; }
}

function shareLink(){
  return { ok:true, url:SS().getUrl() };
}


/* =====================================================================
   26. EYES  —  reading pictures
   Gemini reads images natively. Other companies use the OpenAI shape.
   ===================================================================== */

function visionKey(){
  var all=loadKeys();
  /* Prefer Google — its free tier reads images without extra setup. */
  for(var i=0;i<all.length;i++){
    var k=all[i];
    if(k.enabled===false||isResting(k.id)) continue;
    if(k.provider==='gemini') return k;
  }
  for(var j=0;j<all.length;j++){
    var m=all[j];
    if(m.enabled===false||isResting(m.id)) continue;
    if(BOOK[m.provider] && BOOK[m.provider].shape==='openai') return m;
  }
  return null;
}

function buildVisionRequest(k, prompt, base64, mime){
  var b=BOOK[k.provider];
  if(b.shape==='google'){
    return { url:chatUrl(b,k.model,k.key,k.account),
      options:{ method:'post', contentType:'application/json', muteHttpExceptions:true,
        payload:JSON.stringify({ contents:[{ parts:[
          { text:prompt },
          { inline_data:{ mime_type:mime||'image/jpeg', data:base64 } }
        ]}]}) } };
  }
  return { url:chatUrl(b,k.model,k.key,k.account),
    options:{ method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{ Authorization:'Bearer '+k.key },
      payload:JSON.stringify({ model:k.model, messages:[{ role:'user', content:[
        { type:'text', text:prompt },
        { type:'image_url', image_url:{ url:'data:'+(mime||'image/jpeg')+';base64,'+base64 } }
      ]}]}) } };
}

function askImage(base64, mime, question){
  var data=String(base64||'');
  if(data.indexOf('data:')===0){                 // strip a data URL if one was passed
    var comma=data.indexOf(',');
    var head=data.slice(0,comma);
    var m=/data:([^;]+)/.exec(head);
    if(m) mime=m[1];
    data=data.slice(comma+1);
  }
  if(!data) return { ok:false, why:'No picture came through.' };
  if(data.length>7000000) return { ok:false, why:'That picture is too big. Try a smaller one.' };

  var k=visionKey();
  if(!k) return { ok:false, why:'No key available to read pictures. Add a Google Gemini key — its free tier reads images.' };

  var q=String(question||'').trim()||'Describe everything you can see in this picture, briefly.';
  var req=buildVisionRequest(k,q,data,mime||'image/jpeg');
  var res,code,body;
  try{ res=UrlFetchApp.fetch(req.url,req.options); code=res.getResponseCode(); body=res.getContentText(); }
  catch(e){ return { ok:false, why:'Could not reach '+k.nickname+'.' }; }

  if(code!==200){
    var d=diagnose(code,k.nickname,body);
    if(d.kind==='rest') restKey(k.id);
    if(d.kind==='model' || code===400 || code===404) return { ok:false,
      why:k.nickname+' could not read the picture — that model may not handle images. '+
          'A Google Gemini key is the reliable one for this.'+
          (d.detail?(' It said: '+d.detail):'') };
    return { ok:false, why:d.msg };
  }
  var parsed=readReply(k,body);
  if(!parsed.ok) return { ok:false, why:k.nickname+': '+parsed.why };
  scoreKey(k.id,true);
  logIt('read a picture', q.slice(0,80));
  return { ok:true, text:parsed.text, by:k.nickname };
}

/* Grab a picture from a link and read it. */
function readImageUrl(url, question){
  var u=String(url||'').trim();
  if(u.indexOf('http')!==0) return { ok:false, why:'Paste a full image link starting with https://' };
  var res;
  try{ res=UrlFetchApp.fetch(u,{ muteHttpExceptions:true, followRedirects:true }); }
  catch(e){ return { ok:false, why:'Could not download that image.' }; }
  if(res.getResponseCode()!==200) return { ok:false, why:'That link answered '+res.getResponseCode()+'.' };
  var blob=res.getBlob(), type=blob.getContentType()||'image/jpeg';
  if(String(type).indexOf('image')!==0) return { ok:false, why:'That link is not a picture.' };
  return askImage(Utilities.base64Encode(blob.getBytes()), type, question);
}

/* Read a picture already sitting in your Drive. */
function readImageFromDrive(fileIdOrName, question){
  var id=String(fileIdOrName||'').trim();
  if(!id) return { ok:false, why:'Which file?' };
  var file=null;
  try{ file=DriveApp.getFileById(id); }
  catch(e){
    try{ var it=DriveApp.getFilesByName(id); if(it.hasNext()) file=it.next(); }catch(e2){}
  }
  if(!file || typeof file.getBlob!=='function')
    return { ok:false, why:'I could not find "'+id+'" in your Drive.' };
  var blob;
  try{ blob=file.getBlob(); }
  catch(e){ return { ok:false, why:'I could not open "'+id+'".' }; }
  var type=blob.getContentType()||'image/jpeg';
  if(String(type).indexOf('image')!==0) return { ok:false, why:'"'+file.getName()+'" is not a picture.' };
  return askImage(Utilities.base64Encode(blob.getBytes()), type, question);
}

/* Turn a photographed table into real rows. */
function imageToTable(base64, mime, tabName){
  var r=askImage(base64, mime,
    'This picture contains a table or a list. Read every row.\n'+
    'Reply with JSON ONLY, no fences, in this shape:\n'+
    '{"headers":["Col A","Col B"],"rows":[["v1","v2"]]}\n'+
    'Use the headings shown in the picture. If a cell is unreadable put "?". '+
    'If there is no table at all, reply {"headers":[],"rows":[]}.');
  if(!r.ok) return r;

  var t=String(r.text).replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  var a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a===-1) return { ok:false, why:'I could not turn that picture into a table.' };
  var d; try{ d=JSON.parse(t.slice(a,b+1)); }
  catch(e){ return { ok:false, why:'I could not turn that picture into a table.' }; }

  var heads=d.headers||[], rows=d.rows||[];
  if(!heads.length||!rows.length) return { ok:false, why:'I could not see a table in that picture.' };

  var width=heads.length, grid=[];
  for(var i=0;i<rows.length && i<300;i++){
    if(!(rows[i] instanceof Array)) continue;
    var row=[];
    for(var j=0;j<width;j++) row.push(rows[i][j]===undefined?'':rows[i][j]);
    grid.push(row);
  }
  if(!grid.length) return { ok:false, why:'None of the rows matched the headings.' };

  var ss=SS();
  var name=String(tabName||'From picture').slice(0,40);
  var sh=ss.getSheetByName(name);
  if(sh) sh.clear(); else sh=ss.insertSheet(name);
  sh.getRange(1,1,1,width).setValues([heads])
    .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
  sh.getRange(2,1,grid.length,width).setValues(grid);
  sh.setFrozenRows(1);
  logIt('picture to table', grid.length+' rows into '+name);
  return { ok:true, rows:grid.length, columns:width, sheet:name };
}

/* =====================================================================
   27. THE TRANSCRIPT  —  every conversation, kept in a sheet
   ===================================================================== */
var CHAT_SHEET='Chat log';

function ensureChatSheet(){
  var ss=SS(), sh=ss.getSheetByName(CHAT_SHEET);
  if(!sh){
    sh=ss.insertSheet(CHAT_SHEET);
    sh.getRange(1,1,1,7).setValues([['When','Session','Who','Message','Tools used','Seconds','Where']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    /* Keep the timestamp as text — otherwise Sheets turns it into a Date
       and the clock disappears from the conversation view. */
    sh.getRange('A2:A').setNumberFormat('@');
    sh.setColumnWidth(1,140); sh.setColumnWidth(2,110); sh.setColumnWidth(3,80);
    sh.setColumnWidth(4,560); sh.setColumnWidth(5,220); sh.setColumnWidth(6,80);
  }
  return sh;
}

/* A timestamp we can always read a clock out of, however Sheets stored it. */
function readWhen(v){
  if(v instanceof Date){
    var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
    return Utilities.formatDate(v,tz,'yyyy-MM-dd HH:mm:ss');
  }
  return String(v||'');
}

function sessionId(){
  var c=CacheService.getScriptCache(), id=c.get('session_id');
  if(!id){ id='s'+Date.now().toString(36); c.put('session_id',id,3600); }
  return id;
}

function saveTurn(who, message, tools, seconds, where){
  try{
    var sh=ensureChatSheet();
    var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
    sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,7).setValues([[
      Utilities.formatDate(new Date(),tz,'yyyy-MM-dd HH:mm:ss'),
      sessionId(), String(who||''), String(message||'').slice(0,3000),
      String(tools||''), Number(seconds||0), String(where||'')
    ]]);
    if(sh.getLastRow()>1200) sh.deleteRows(2,400);
    return true;
  }catch(e){ return false; }
}

function chatHistory(limit){
  var sh=ensureChatSheet(), last=sh.getLastRow();
  if(last<2) return { ok:true, turns:[] };
  var n=Math.max(1,Math.min(60,Number(limit)||20));
  var start=Math.max(2,last-n+1);
  var vals=sh.getRange(start,1,last-start+1,7).getValues(), out=[];
  for(var i=0;i<vals.length;i++){
    out.push({ when:readWhen(vals[i][0]), session:String(vals[i][1]), who:String(vals[i][2]),
      text:String(vals[i][3]), tools:String(vals[i][4]),
      seconds:Number(vals[i][5])||0, where:String(vals[i][6]) });
  }
  return { ok:true, turns:out };
}

function clearHistory(){
  var sh=ensureChatSheet(), last=sh.getLastRow();
  if(last>1) sh.deleteRows(2,last-1);
  return { ok:true };
}

/* What was said just before, so the assistant keeps the thread. */
function recentThread(turns){
  var h=chatHistory(Number(turns)||6);
  if(!h.turns.length) return '';
  var sid=sessionId(), lines=[];
  for(var i=0;i<h.turns.length;i++){
    if(h.turns[i].session!==sid) continue;
    lines.push((h.turns[i].who==='you'?'They said':'You replied')+': '+
               h.turns[i].text.slice(0,300));
  }
  return lines.length?('EARLIER IN THIS CONVERSATION:\n'+lines.join('\n')):'';
}

/* =====================================================================
   28. CONNECTORS  —  add any web service without touching the code
   This is MCP by hand: a tool announces its name, what it does,
   what it needs, and where it lives. The agent then just uses it.
   ===================================================================== */
var CONNECTOR_SHEET='Connectors';

function ensureConnectorSheet(){
  var ss=SS(), sh=ss.getSheetByName(CONNECTOR_SHEET);
  if(!sh){
    sh=ss.insertSheet(CONNECTOR_SHEET);
    sh.getRange(1,1,1,6).setValues([['Name','What it does','Method','URL template','Needs','Header']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,150); sh.setColumnWidth(2,300);
    sh.setColumnWidth(3,80);  sh.setColumnWidth(4,420);
    sh.setColumnWidth(5,180); sh.setColumnWidth(6,220);
    sh.getRange(2,1,2,6).setValues([
      ['dog_fact','Get a random fact about dogs','GET',
       'https://dogapi.dog/api/v2/facts','',''],
      ['country','Look up a country by name','GET',
       'https://restcountries.com/v3.1/name/{name}?fields=name,capital,population,currencies','name','']
    ]);
  }
  return sh;
}

function listConnectors(){
  var sh=ensureConnectorSheet(), last=sh.getLastRow();
  if(last<2) return [];
  var vals=sh.getRange(2,1,last-1,6).getValues(), out=[];
  for(var i=0;i<vals.length;i++){
    var name=String(vals[i][0]||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    var url=String(vals[i][3]||'').trim();
    if(!name||url.indexOf('https://')!==0) continue;
    out.push({ name:name, what:String(vals[i][1]||''),
      method:(String(vals[i][2]||'GET').toUpperCase()==='POST')?'POST':'GET',
      url:url, needs:String(vals[i][4]||'').split(',').map(function(x){ return x.trim(); })
        .filter(function(x){ return x; }),
      header:String(vals[i][5]||'').trim(), row:i+2 });
  }
  return out;
}

function addConnector(name, what, method, url, needs, header){
  var n=String(name||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
  if(!n) return { ok:false, why:'Give the connector a short name.' };
  if(String(url||'').indexOf('https://')!==0) return { ok:false, why:'The URL must start with https://' };
  var sh=ensureConnectorSheet(), all=listConnectors();
  for(var i=0;i<all.length;i++) if(all[i].name===n)
    return { ok:false, why:'A connector called "'+n+'" already exists.' };
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,6).setValues([[
    n, String(what||''), (String(method||'GET').toUpperCase()==='POST')?'POST':'GET',
    String(url), String(needs||''), String(header||'') ]]);
  return { ok:true, name:n, total:listConnectors().length };
}

function removeConnector(name){
  var sh=ensureConnectorSheet(), all=listConnectors();
  for(var i=0;i<all.length;i++)
    if(all[i].name===String(name||'').trim().toLowerCase()){ sh.deleteRow(all[i].row); return { ok:true }; }
  return { ok:false, why:'No connector called "'+name+'".' };
}

function callConnector(name, args){
  var all=listConnectors(), found=null;
  for(var i=0;i<all.length;i++) if(all[i].name===String(name||'').toLowerCase()) found=all[i];
  if(!found) return { ok:false, why:'No connector called "'+name+'". Check the Connectors tab.' };

  var url=found.url, a=args||{};
  for(var n=0;n<found.needs.length;n++){
    var field=found.needs[n];
    if(a[field]===undefined||a[field]==='')
      return { ok:false, why:'"'+found.name+'" needs: '+found.needs.join(', ') };
    url=url.split('{'+field+'}').join(encodeURIComponent(String(a[field])));
  }
  if(url.indexOf('{')!==-1) url=url.replace(/\{[^}]+\}/g,'');

  var opts={ method:found.method.toLowerCase(), muteHttpExceptions:true };
  if(found.header){
    var bits=found.header.split(':');
    if(bits.length>=2){ var hs={}; hs[bits[0].trim()]=bits.slice(1).join(':').trim(); opts.headers=hs; }
  }
  if(found.method==='POST'){ opts.contentType='application/json'; opts.payload=JSON.stringify(a); }

  var res,body;
  try{ res=UrlFetchApp.fetch(url,opts); body=res.getContentText(); }
  catch(e){ return { ok:false, why:'Could not reach '+found.name+'.' }; }
  if(res.getResponseCode()!==200)
    return { ok:false, why:found.name+' answered '+res.getResponseCode()+': '+String(body).slice(0,120) };

  logIt('connector', found.name);
  return { ok:true, name:found.name, text:String(body).slice(0,6000) };
}

/* The connectors join the tool list automatically. */
function connectorMenu(){
  var all=listConnectors();
  if(!all.length) return '';
  var lines=[];
  for(var i=0;i<all.length;i++){
    lines.push('use_connector (name: "'+all[i].name+'") : '+all[i].what+
      (all[i].needs.length?(' — needs: '+all[i].needs.join(', ')):''));
  }
  return '\nCONNECTORS your user has added:\n'+lines.join('\n');
}

/* =====================================================================
   29. A BIGGER WINDOW
   Sidebars are locked narrow by Google. A modeless dialog is wide,
   and you can still click cells while it is open.
   ===================================================================== */
function openBig(){
  rememberSheet();
  var page=HtmlService.createHtmlOutputFromFile('Drawer')
    .setWidth(1150).setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(page,'AI Toolkit');
}
function openHuge(){
  rememberSheet();
  var page=HtmlService.createHtmlOutputFromFile('Drawer')
    .setWidth(1450).setHeight(880);
  SpreadsheetApp.getUi().showModalDialog(page,'AI Toolkit');
}

/* =====================================================================
   30. A TIMED, REMEMBERED AGENT RUN  —  what the drawer actually calls
   ===================================================================== */
function runAgentTimed(request, source){
  var t0=Date.now();
  saveTurn('you', request, '', 0, source||'drawer');

  var out=runAgent(request, source);

  var secs=Math.round((Date.now()-t0)/100)/10;
  var toolsUsed=[];
  if(out && out.trail) for(var i=0;i<out.trail.length;i++)
    if(out.trail[i].tool) toolsUsed.push(out.trail[i].tool);

  saveTurn('assistant', (out&&out.ok)?out.answer:(out.why||'failed'),
           toolsUsed.join(' → '), secs, source||'drawer');

  if(out) { out.seconds=secs; out.tools=toolsUsed; }
  return out;
}



/* =====================================================================
   37. TELEGRAM, PROPERLY  —  one button, in the right order
   ===================================================================== */

/* Everything the Telegram tab needs, in one call. */
function telegramStatus(){
  var cfg=readJson(TG,{});
  var out={ hasToken:!!cfg.token, hasChat:!!cfg.chat, chat:cfg.chat||'',
            webApp:cfg.webhook||readJson(WEBAPP,{}).url||'', hooked:false,
            botName:'', pending:0, lastError:'' };
  if(!cfg.token) return out;

  /* Ask Telegram who this bot is — proves the token works. */
  try{
    var me=UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+'/getMe',
      { muteHttpExceptions:true });
    var d=JSON.parse(me.getContentText());
    if(d.ok&&d.result){ out.botName='@'+(d.result.username||d.result.first_name||'bot'); }
    else { out.lastError='Telegram rejected the token.'; return out; }
  }catch(e){ out.lastError='Could not reach Telegram.'; return out; }

  /* And whether it is pointed at our web app. */
  try{
    var wh=UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+'/getWebhookInfo',
      { muteHttpExceptions:true });
    var w=JSON.parse(wh.getContentText());
    if(w.ok&&w.result){
      out.hooked=!!w.result.url;
      if(w.result.url) out.webApp=w.result.url;
      out.pending=Number(w.result.pending_update_count)||0;
      if(w.result.last_error_message) out.lastError=w.result.last_error_message;
    }
  }catch(e){}
  return out;
}

/* One button: save the URL, grab the chat id while we still can, then hook it up. */
function connectTelegram(webAppUrl){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { ok:false, why:'Save your BotFather token first.' };

  var u=String(webAppUrl||'').trim();
  if(u.indexOf('https://script.google.com/')!==0)
    return { ok:false, why:'That should be your web app link, starting https://script.google.com/' };
  if(u.indexOf('/exec')===-1)
    return { ok:false, why:'That link should end in /exec. Copy it from Deploy → Web app.' };

  var steps=[];

  /* STEP 1 — the chat id, BEFORE the webhook. Once a webhook is set,
     getUpdates goes quiet, so this is the only moment we can read it. */
  if(!cfg.chat){
    var found=telegramFindChat();
    if(found.ok){ steps.push('Found your chat ('+found.chat+')'); cfg=readJson(TG,{}); }
    else return { ok:false, steps:steps,
      why:'Message your bot once in Telegram, then press this again. '+
          '(I need your chat id before I connect the webhook — after that it is hidden.)' };
  } else {
    steps.push('Chat already known ('+cfg.chat+')');
  }

  /* STEP 2 — point Telegram at the web app. */
  var set=telegramSetWebhook(u);
  if(!set.ok) return { ok:false, steps:steps, why:set.why };
  steps.push('Webhook connected');

  /* STEP 3 — prove it end to end. */
  var hello=tgSend('✅ Connected. Tap a button, or just talk to me.', cfg.chat, menuMain());
  if(!hello.ok) return { ok:false, steps:steps,
    why:'The webhook is set but I could not message you: '+hello.why };
  steps.push('Test message sent');

  writeJson(WEBAPP,{ url:u });
  logIt('telegram','Connected the bot to '+u.slice(0,60));
  return { ok:true, steps:steps, chat:cfg.chat, url:u,
           say:'Check your phone — you should have a message from your bot.' };
}

/* Unhook it, so Find my chat works again. */
function disconnectTelegram(){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { ok:false, why:'No token saved.' };
  try{
    UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+'/deleteWebhook',
      { muteHttpExceptions:true });
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
  cfg.webhook=''; writeJson(TG,cfg);
  return { ok:true, say:'Unhooked. Find my chat will work again.' };
}

/* Send something from the drawer. */
function telegramSay(text){
  var t=String(text||'').trim();
  if(!t) return { ok:false, why:'Type a message first.' };
  var r=telegramSend(t);
  if(r.ok) saveTurn('assistant', t, 'sent by hand', 0, 'telegram');
  return r.ok ? { ok:true, sent:t } : r;
}

/* Just the Telegram side of the conversation. */
function telegramConversation(limit){
  var h=chatHistory(Math.max(4,Math.min(60,Number(limit)||24)));
  var out=[];
  for(var i=0;i<h.turns.length;i++)
    if(h.turns[i].where==='telegram'||h.turns[i].where==='voice'&&false) out.push(h.turns[i]);
  var only=[];
  for(var j=0;j<h.turns.length;j++) if(h.turns[j].where==='telegram') only.push(h.turns[j]);
  return { ok:true, turns:only, total:only.length };
}

/* =====================================================================
   31. HANDS-FREE  —  settings for talking to it like a person
   ===================================================================== */
var VOICE='AI_VOICE_V1', WEBAPP='AI_WEBAPP_V1';

function getVoiceSettings(){
  var v=readJson(VOICE,{});
  return {
    wake: v.wake || 'jarvis',
    handsFree: v.handsFree===true,
    autoSpeak: v.autoSpeak!==false,
    rate: Number(v.rate)||1.02,
    lang: v.lang || 'en-KE',
    needWake: v.needWake!==false,
    webApp: readJson(WEBAPP,{}).url || ''
  };
}

function saveVoiceSettings(s){
  var v=readJson(VOICE,{}), o=s||{};
  if(o.wake!==undefined){
    var w=String(o.wake).trim().toLowerCase().replace(/[^a-z ]/g,'').slice(0,20);
    if(w.length>=2) v.wake=w;
  }
  if(o.handsFree!==undefined) v.handsFree=(o.handsFree===true);
  if(o.autoSpeak!==undefined) v.autoSpeak=(o.autoSpeak===true);
  if(o.needWake!==undefined)  v.needWake=(o.needWake===true);
  if(o.rate!==undefined){
    var r=Number(o.rate);
    if(!isNaN(r)) v.rate=Math.max(0.6,Math.min(1.6,r));
  }
  if(o.lang!==undefined){
    var l=String(o.lang).trim().slice(0,10);
    if(/^[a-z]{2}(-[A-Z]{2})?$/.test(l)) v.lang=l;
  }
  writeJson(VOICE,v);
  return { ok:true, settings:getVoiceSettings() };
}

function saveWebAppUrl(url){
  var u=String(url||'').trim();
  if(u && u.indexOf('https://')!==0) return { ok:false, why:'That should start with https://' };
  writeJson(WEBAPP,{ url:u });
  return { ok:true, url:u };
}

/* Short answers when spoken, long answers when read. */
function speakableAnswer(text){
  var t=String(text||'').replace(/[*_#`>]/g,'').replace(/\s+\n/g,'\n').trim();
  if(t.length<=420) return t;
  var cut=t.slice(0,420);
  var stop=Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if(stop>180) cut=cut.slice(0,stop+1);
  return cut+' There is more on screen.';
}

/* One call for hands-free: run it, and hand back something worth saying aloud. */
function talkTo(request, source){
  var out=runAgentTimed(request, source||'voice');
  if(!out) return { ok:false, why:'Something went wrong.', say:'Something went wrong.' };
  var text = out.ok ? out.answer : (out.why||'I could not do that.');
  out.say = speakableAnswer(text);
  return out;
}


/* =====================================================================
   32. MAKING THINGS  —  pictures, documents, slides, code
   Everything here is free. Where something is not possible for free,
   it says so plainly rather than pretending.
   ===================================================================== */

/* ---------- PICTURES ----------
   Pollinations serves images with no key and no account at all.
   If you have a Cloudflare or Together key we use that instead — better quality. */
function makeImage(prompt, width, height, style){
  var p=String(prompt||'').trim();
  if(!p) return { ok:false, why:'Describe the picture you want.' };
  var w=Math.max(256,Math.min(1536,Number(width)||1024));
  var h=Math.max(256,Math.min(1536,Number(height)||1024));
  var full=p+(style?(', '+style):'');

  var url='https://image.pollinations.ai/prompt/'+encodeURIComponent(full)+
    '?width='+w+'&height='+h+'&nologo=true&seed='+Math.floor(Math.random()*100000);

  var res;
  try{ res=UrlFetchApp.fetch(url,{ muteHttpExceptions:true, followRedirects:true }); }
  catch(e){ return { ok:false, why:'Could not reach the picture service.' }; }
  if(res.getResponseCode()!==200)
    return { ok:false, why:'The picture service answered '+res.getResponseCode()+'.' };

  var blob=res.getBlob();
  if(String(blob.getContentType()||'').indexOf('image')!==0)
    return { ok:false, why:'That did not come back as a picture.' };

  logIt('made a picture', p.slice(0,80));
  return { ok:true, blob:blob, url:url, prompt:full, width:w, height:h };
}

/* Put it straight into the sheet, where you are standing. */
function imageIntoSheet(prompt, width, height, style){
  var r=makeImage(prompt,width,height,style);
  if(!r.ok) return r;
  var sh=SH();
  var rg=RG();
  var row=rg?rg.getRow():1, col=rg?rg.getColumn():1;
  try{
    sh.insertImage(r.blob.setName(String(prompt).slice(0,40)+'.png'), col, row);
  }catch(e){ return { ok:false, why:'I made it but could not place it: '+e.message, url:r.url }; }
  return { ok:true, where:'row '+row+', column '+col, url:r.url, prompt:r.prompt };
}

/* Or keep it in Drive and hand you a link. */
function imageToDrive(prompt, width, height, style){
  var r=makeImage(prompt,width,height,style);
  if(!r.ok) return r;
  try{
    var file=DriveApp.createFile(r.blob.setName(String(prompt).slice(0,50)+'.png'));
    return { ok:true, name:file.getName(), link:file.getUrl(), url:r.url };
  }catch(e){ return { ok:false, why:'I made it but could not save it: '+e.message, url:r.url }; }
}

/* ---------- DOCUMENTS ----------
   Real Google Docs, written and formatted by the AI. */
function makeDoc(title, brief, style){
  var t=String(title||'').trim();
  if(!t) return { ok:false, why:'What should the document be called?' };

  var written=callAI(
    'Write a document titled "'+t+'".\n'+
    (brief?('It should cover: '+brief+'\n'):'')+
    (style?('Tone: '+style+'\n'):'')+
    'Structure it with clear section headings.\n'+
    'Mark each heading with ## at the start of its line. Everything else is plain paragraphs.\n'+
    'No markdown other than ##. No bullet symbols other than a leading "- ".\n'+
    'Between 300 and 700 words.');
  if(looksBroken(written)) return { ok:false, why:written };

  var doc, body;
  try{ doc=DocumentApp.create(t); body=doc.getBody(); }
  catch(e){ return { ok:false, why:'I could not create the document: '+e.message }; }

  body.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.TITLE);
  var lines=String(written).split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(!line) continue;
    if(line.indexOf('##')===0){
      body.appendParagraph(line.replace(/^#+\s*/,''))
          .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    } else if(line.indexOf('- ')===0){
      body.appendListItem(line.slice(2)).setGlyphType(DocumentApp.GlyphType.BULLET);
    } else {
      body.appendParagraph(line);
    }
  }
  doc.saveAndClose();
  logIt('wrote a document', t);
  return { ok:true, title:t, link:doc.getUrl(), id:doc.getId(), words:String(written).split(/\s+/).length };
}

/* Turn any document into a PDF sitting in Drive. */
function docToPdf(docId){
  try{
    var file=DriveApp.getFileById(docId);
    var pdf=DriveApp.createFile(file.getAs('application/pdf'));
    return { ok:true, name:pdf.getName(), link:pdf.getUrl() };
  }catch(e){ return { ok:false, why:'I could not make the PDF: '+e.message }; }
}

/* The sheet itself, as a PDF. */
function sheetToPdf(){
  try{
    var ss=SS();
    var pdf=DriveApp.createFile(DriveApp.getFileById(ss.getId()).getAs('application/pdf'));
    return { ok:true, name:pdf.getName(), link:pdf.getUrl() };
  }catch(e){ return { ok:false, why:'I could not export the sheet: '+e.message }; }
}

/* ---------- SLIDES ---------- */
function makeSlides(title, brief, howMany){
  var t=String(title||'').trim();
  if(!t) return { ok:false, why:'What should the deck be called?' };
  var n=Math.max(3,Math.min(15,Number(howMany)||6));

  var raw=callAI(
    'Plan a '+n+'-slide presentation titled "'+t+'".'+
    (brief?(' It should cover: '+brief):'')+'\n'+
    'Reply with JSON ONLY, no fences:\n'+
    '{"slides":[{"title":"Slide title","points":["point one","point two","point three"]}]}\n'+
    'Exactly '+n+' slides. Two to four short points each. No point longer than 12 words.');
  if(looksBroken(raw)) return { ok:false, why:raw };

  var txt=String(raw).replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  var a=txt.indexOf('{'), b=txt.lastIndexOf('}');
  if(a===-1) return { ok:false, why:'It did not return a usable plan.' };
  var d; try{ d=JSON.parse(txt.slice(a,b+1)); }
  catch(e){ return { ok:false, why:'It did not return a usable plan.' }; }
  var slides=d.slides||[];
  if(!slides.length) return { ok:false, why:'It returned an empty deck.' };

  var deck;
  try{ deck=SlidesApp.create(t); }
  catch(e){ return { ok:false, why:'I could not create the deck: '+e.message }; }

  var first=deck.getSlides()[0];
  first.getShapes()[0].getText().setText(t);
  if(first.getShapes().length>1)
    first.getShapes()[1].getText().setText(brief||('Prepared '+rightNow().date));

  var made=0;
  for(var i=0;i<slides.length && i<15;i++){
    var s=slides[i]||{};
    if(!s.title) continue;
    var sl=deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
    var shapes=sl.getShapes();
    shapes[0].getText().setText(String(s.title).slice(0,90));
    var pts=(s.points instanceof Array)?s.points:[];
    if(shapes.length>1) shapes[1].getText().setText(pts.join('\n'));
    made++;
  }
  deck.saveAndClose();
  logIt('made slides', t+' ('+made+' slides)');
  return { ok:true, title:t, slides:made, link:deck.getUrl(), id:deck.getId() };
}

/* ---------- CODE, IN ANY LANGUAGE ---------- */
function writeCodeFile(request, language, filename){
  if(!request||!String(request).trim()) return { ok:false, why:'Describe what the code should do.' };
  var lang=String(language||'javascript').trim();

  var out=callAI(
    'Write '+lang+' code that does this:\n'+request+'\n\n'+
    'Rules: complete and runnable, not a fragment. '+
    'A short comment above each section explaining it in plain English. '+
    'Handle the obvious error cases. '+
    'Reply with the code ONLY — no prose, no markdown fences.');
  if(looksBroken(out)) return { ok:false, why:out };

  var code=String(out).replace(/^```[a-z]*\s*/i,'').replace(/```\s*$/,'').trim();

  var ext={ javascript:'js', typescript:'ts', python:'py', java:'java', 'c#':'cs',
    csharp:'cs', php:'php', ruby:'rb', go:'go', rust:'rs', swift:'swift', kotlin:'kt',
    sql:'sql', html:'html', css:'css', bash:'sh', shell:'sh', r:'r', 'c++':'cpp',
    c:'c', dart:'dart', scala:'scala', perl:'pl', lua:'lua', 'apps script':'gs'
  }[lang.toLowerCase()] || 'txt';

  var name=String(filename||'').trim() || ('generated-'+Date.now()+'.'+ext);
  if(name.indexOf('.')===-1) name=name+'.'+ext;

  try{
    var file=DriveApp.createFile(name, code, 'text/plain');
    logIt('wrote code', lang+' — '+name);
    return { ok:true, language:lang, name:file.getName(), link:file.getUrl(),
             lines:code.split('\n').length, code:code.slice(0,4000) };
  }catch(e){
    return { ok:true, language:lang, name:name, link:'', code:code.slice(0,4000),
             lines:code.split('\n').length, note:'I could not save it to Drive, but here it is.' };
  }
}

/* ---------- VIDEO ----------
   There is no free video generation API. Rather than pretend, we build the
   two things that are genuinely useful and genuinely free: a script, and a
   storyboard whose frames are real generated pictures. */
function makeVideoPlan(topic, seconds, makeFrames){
  var t=String(topic||'').trim();
  if(!t) return { ok:false, why:'What should the video be about?' };
  var secs=Math.max(15,Math.min(180,Number(seconds)||45));
  var shots=Math.max(3,Math.min(10,Math.round(secs/8)));

  var raw=callAI(
    'Plan a '+secs+'-second video about: '+t+'\n'+
    'Reply with JSON ONLY, no fences:\n'+
    '{"hook":"the first line, spoken","shots":[{"seconds":8,"say":"what the narrator says",'+
    '"see":"what is on screen, described so an artist could draw it"}],"cta":"closing line"}\n'+
    'Exactly '+shots+' shots. Spoken lines under 25 words each.');
  if(looksBroken(raw)) return { ok:false, why:raw };

  var txt=String(raw).replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  var a=txt.indexOf('{'), b=txt.lastIndexOf('}');
  if(a===-1) return { ok:false, why:'It did not return a usable plan.' };
  var d; try{ d=JSON.parse(txt.slice(a,b+1)); }
  catch(e){ return { ok:false, why:'It did not return a usable plan.' }; }
  var list=d.shots||[];
  if(!list.length) return { ok:false, why:'It returned no shots.' };

  var ss=SS();
  var name=('Video '+t).slice(0,40);
  var sh=ss.getSheetByName(name);
  if(sh) sh.clear(); else sh=ss.insertSheet(name);

  sh.getRange(1,1).setValue('VIDEO PLAN: '+t).setFontWeight('bold').setFontSize(14);
  sh.getRange(2,1).setValue('Hook: '+(d.hook||''));
  sh.getRange(3,1,1,4).setValues([['Shot','Seconds','Narrator says','What is on screen']])
    .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');

  var rows=[];
  for(var i=0;i<list.length;i++)
    rows.push([i+1, list[i].seconds||8, list[i].say||'', list[i].see||'']);
  sh.getRange(4,1,rows.length,4).setValues(rows);
  sh.getRange(4,3,rows.length,2).setWrap(true);
  sh.getRange(4+rows.length+1,1).setValue('Closing: '+(d.cta||''));
  sh.setColumnWidth(1,60); sh.setColumnWidth(2,80);
  sh.setColumnWidth(3,380); sh.setColumnWidth(4,380);
  sh.setFrozenRows(3);

  var frames=0;
  if(makeFrames){
    for(var f=0;f<list.length && f<6;f++){
      var img=makeImage(list[f].see||t, 768, 432, 'cinematic still, clean composition');
      if(!img.ok) continue;
      try{ sh.insertImage(img.blob.setName('shot'+(f+1)+'.png'), 5, 4+f); frames++; }catch(e){}
    }
  }

  logIt('planned a video', t+' ('+rows.length+' shots)');
  return { ok:true, topic:t, seconds:secs, shots:rows.length, frames:frames, sheet:sh.getName(),
    note:'There is no free API that renders finished video. This gives you the script, '+
         'the shot list and the frames — drop them into CapCut, Canva or Clipchamp, all free.' };
}


/* =====================================================================
   33. COMPARE  —  ask several companies the same thing at once
   ===================================================================== */
function compareModels(question, howMany){
  var q=String(question||'').trim();
  if(!q) return { ok:false, why:'What should I ask them?' };
  var n=Math.max(2,Math.min(5,Number(howMany)||3));

  var live=[], all=loadKeys();
  for(var i=0;i<all.length;i++){
    var k=all[i];
    if(k.enabled===false||!BOOK[k.provider]||isResting(k.id)) continue;
    live.push(k);
  }
  if(live.length<2) return { ok:false,
    why:'I need at least two working keys to compare. You have '+live.length+'.' };

  var results=[];
  for(var j=0;j<live.length && j<n; j++){
    var t0=Date.now();
    var out=callAI(q, live[j].id);
    results.push({
      company: BOOK[live[j].provider].label,
      nickname: live[j].nickname,
      model: live[j].model,
      seconds: Math.round((Date.now()-t0)/100)/10,
      answer: looksBroken(out) ? ('(failed) '+out) : out,
      failed: looksBroken(out),
      words: looksBroken(out) ? 0 : String(out).split(/\s+/).length
    });
  }

  var worked=[];
  for(var w=0;w<results.length;w++) if(!results[w].failed) worked.push(results[w]);
  if(!worked.length) return { ok:false, why:'None of them managed to answer.' };

  var verdict='';
  if(worked.length>1){
    var packed=worked.map(function(r,idx){
      return '--- ANSWER '+(idx+1)+' (from '+r.company+') ---\n'+r.answer.slice(0,1200); }).join('\n\n');
    var judged=callAI(
      'Several AI models answered the same question. Judge them.\n'+
      'QUESTION: '+q+'\n\n'+packed+'\n\n'+
      'Reply in under 70 words: which answer is best and why, and anything they disagree on. '+
      'Refer to them by number. Plain text.');
    if(!looksBroken(judged)) verdict=judged;
  }

  logIt('compared models', q.slice(0,70));
  return { ok:true, question:q, results:results, verdict:verdict, tried:results.length };
}

/* =====================================================================
   34. WORKFLOWS  —  save a sequence of jobs and run it again
   ===================================================================== */
var FLOW_SHEET='Workflows';

function ensureFlowSheet(){
  var ss=SS(), sh=ss.getSheetByName(FLOW_SHEET);
  if(!sh){
    sh=ss.insertSheet(FLOW_SHEET);
    sh.getRange(1,1,1,5).setValues([['Name','What it does','Steps (one per line)','Last run','Runs']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1,170); sh.setColumnWidth(2,260);
    sh.setColumnWidth(3,520); sh.setColumnWidth(4,140);
    sh.getRange(2,1,2,5).setValues([
      ['morning_check','Classify new rows then tell me what is urgent',
       'Fill column F from column E using the classify instruction\nWhat is the most urgent row?','',0],
      ['weekly_report','Summarise and email the team',
       'Summarise column F\nEmail the team a report on the highlighted rows','',0]
    ]);
    sh.getRange(2,3,2,1).setWrap(true);
  }
  return sh;
}

function listWorkflows(){
  var sh=ensureFlowSheet(), last=sh.getLastRow();
  if(last<2) return [];
  var vals=sh.getRange(2,1,last-1,5).getValues(), out=[];
  for(var i=0;i<vals.length;i++){
    var name=String(vals[i][0]||'').trim();
    var steps=String(vals[i][2]||'').split(/\r?\n/)
      .map(function(s){ return s.trim(); }).filter(function(s){ return s; });
    if(!name||!steps.length) continue;
    out.push({ name:name, what:String(vals[i][1]||''), steps:steps,
      last:String(vals[i][3]||''), runs:Number(vals[i][4])||0, row:i+2 });
  }
  return out;
}

function saveWorkflow(name, what, steps){
  var n=String(name||'').trim().toLowerCase().replace(/[^a-z0-9_ ]/g,'').replace(/\s+/g,'_');
  if(!n) return { ok:false, why:'Give the workflow a short name.' };
  var list=(steps instanceof Array) ? steps
    : String(steps||'').split(/\r?\n/).map(function(s){ return s.trim(); });
  list=list.filter(function(s){ return s; });
  if(!list.length) return { ok:false, why:'A workflow needs at least one step.' };
  if(list.length>10) return { ok:false, why:'Ten steps is the most I will run in one go.' };

  var sh=ensureFlowSheet(), all=listWorkflows();
  for(var i=0;i<all.length;i++) if(all[i].name===n){
    sh.getRange(all[i].row,2,1,2).setValues([[String(what||''), list.join('\n')]]);
    return { ok:true, name:n, steps:list.length, updated:true };
  }
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,5)
    .setValues([[n, String(what||''), list.join('\n'), '', 0]]);
  return { ok:true, name:n, steps:list.length, updated:false };
}

function deleteWorkflow(name){
  var sh=ensureFlowSheet(), all=listWorkflows();
  for(var i=0;i<all.length;i++) if(all[i].name===String(name||'').toLowerCase()){
    sh.deleteRow(all[i].row); return { ok:true }; }
  return { ok:false, why:'No workflow called "'+name+'".' };
}

function runWorkflow(name){
  var all=listWorkflows(), flow=null;
  for(var i=0;i<all.length;i++) if(all[i].name===String(name||'').toLowerCase()) flow=all[i];
  if(!flow) return { ok:false, why:'No workflow called "'+name+'". Check the Workflows tab.' };

  var t0=Date.now(), done=[], failed=0;
  for(var s=0;s<flow.steps.length;s++){
    var r=runAgent(flow.steps[s],'workflow');
    var line=(r&&r.ok)?r.answer:((r&&r.why)||'failed');
    if(!r||!r.ok) failed++;
    done.push({ step:s+1, ask:flow.steps[s], result:String(line).slice(0,400),
                ok:!!(r&&r.ok), tools:(r&&r.trail)?r.trail.map(function(x){ return x.tool; }).join(' → '):'' });
    if(Date.now()-t0>280000) {                    /* Apps Script gives us six minutes */
      done.push({ step:s+2, ask:'(stopped)', result:'Ran out of time. Run it again to continue.',
                  ok:false, tools:'' });
      break;
    }
  }

  var sh=ensureFlowSheet();
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  sh.getRange(flow.row,4,1,2).setValues([[
    Utilities.formatDate(new Date(),tz,'yyyy-MM-dd HH:mm'), flow.runs+1 ]]);

  logIt('ran a workflow', flow.name+' ('+done.length+' steps)');
  return { ok:true, name:flow.name, steps:done, failed:failed,
           seconds:Math.round((Date.now()-t0)/100)/10 };
}

/* Turn what you just did into a saved workflow. */
function workflowFromHistory(name, howManyTurns){
  var h=chatHistory(Number(howManyTurns)||6);
  var asks=[];
  for(var i=0;i<h.turns.length;i++)
    if(h.turns[i].who==='you' && h.turns[i].text) asks.push(h.turns[i].text);
  if(!asks.length) return { ok:false, why:'Nothing in the conversation to save yet.' };
  return saveWorkflow(name, 'Saved from your conversation', asks.slice(-8));
}

/* =====================================================================
   35. STARTERS  —  things worth trying, ready to run
   ===================================================================== */
var TEMPLATES = [
  { id:'classify', icon:'🏷️', title:'Sort messy text into categories',
    what:'Reads a column of free text and files each row under one label.',
    ask:'Fill column F from column E: classify into Delivery, Price, Quality, Staff. One word. If none fit, reply UNCLEAR.' },
  { id:'urgent', icon:'🚨', title:'Find what is urgent',
    what:'Reads what you highlighted and tells you what to deal with first.',
    ask:'Look at what I highlighted and tell me the three things that need attention first, and why.' },
  { id:'summary', icon:'📊', title:'Summarise a column',
    what:'Counts every value, sorts by frequency, builds a Summary tab.',
    ask:'Summarise column F into a tab called Summary.' },
  { id:'brief', icon:'☀️', title:'Brief me on my day',
    what:'Calendar, yesterday, unread email and one headline.',
    ask:'Give me my full brief for today.' },
  { id:'report', icon:'📧', title:'Email the team a report',
    what:'Writes a headline, findings and a recommended action, then sends it.',
    ask:'Write a report on the rows I highlighted and email it to my contacts.' },
  { id:'research', icon:'🐝', title:'Send a research team out',
    what:'Several agents take different angles, a critic reviews, one writes it up.',
    ask:'Send six agents to research this properly and save it to a tab.' },
  { id:'picture', icon:'🎨', title:'Draw something',
    what:'Generates a real picture into your sheet. No key needed.',
    ask:'Make a picture of a busy Nairobi street market at golden hour.' },
  { id:'doc', icon:'📄', title:'Write a document',
    what:'A real Google Doc with headings and sections.',
    ask:'Write a document called "Delivery Review" covering the problems in my sheet.' },
  { id:'deck', icon:'📽️', title:'Build a slide deck',
    what:'A real Google Slides presentation.',
    ask:'Build a six-slide deck about the findings in my sheet.' },
  { id:'clean', icon:'🧹', title:'Tidy messy spellings',
    what:'Groups values that mean the same thing into one clean version.',
    ask:'Clean column D so the branch names are all spelt the same way.' },
  { id:'inbox', icon:'📥', title:'Triage my inbox',
    what:'Ranks unread email and names what to do first.',
    ask:'What in my inbox needs my attention today?' },
  { id:'compare', icon:'⚖️', title:'Ask three AIs the same thing',
    what:'Runs your question across different companies and judges the answers.',
    ask:'' },
  { id:'news', icon:'🌍', title:'What is happening',
    what:'Live headlines on any topic, saved to a tab if you want.',
    ask:'What is new in artificial intelligence this week?' },
  { id:'chart', icon:'📈', title:'Draw a chart',
    what:'A real chart from a range in your sheet.',
    ask:'Summarise column F and then draw a pie chart of the result.' },
  { id:'video', icon:'🎬', title:'Plan a video',
    what:'Script, shot list and storyboard pictures.',
    ask:'Plan a 45-second video about the delivery problem in my sheet, with storyboard frames.' },
  { id:'data', icon:'✨', title:'Invent test data',
    what:'Generates realistic rows so you have something to work with.',
    ask:'Generate 25 rows of realistic Kenyan customer complaints with branch and date.' }
];

function templates(){ return TEMPLATES; }

/* =====================================================================
   36. THE DASHBOARD  —  one call, everything the home screen needs
   ===================================================================== */
function dashboard(){
  var p=getProfile(), now=rightNow();
  var keys=listKeysForUI();
  var ready=0, resting=0, off=0;
  for(var i=0;i<keys.length;i++){
    if(!keys[i].enabled) off++;
    else if(keys[i].resting) resting++;
    else ready++;
  }

  var wins=0, fails=0;
  for(var j=0;j<keys.length;j++){ wins+=keys[j].wins; fails+=keys[j].fails; }

  var recent=[];
  try{
    var h=chatHistory(6);
    for(var r=h.turns.length-1;r>=0 && recent.length<4;r--)
      if(h.turns[r].who==='you') recent.push(h.turns[r].text.slice(0,70));
  }catch(e){}

  var tabs=[];
  try{
    var sheets=SS().getSheets();
    for(var s=0;s<sheets.length && s<14;s++)
      tabs.push({ name:sheets[s].getName(), rows:sheets[s].getLastRow() });
  }catch(e){}

  var flows=[];
  try{
    var fl=listWorkflows();
    for(var f=0;f<fl.length && f<6;f++)
      flows.push({ name:fl[f].name, what:fl[f].what, steps:fl[f].steps.length, runs:fl[f].runs });
  }catch(e){}

  var jobs=[];
  try{ jobs=listJobs(); }catch(e){}

  var tg={ hasToken:false, hasChat:false };
  try{ tg=telegramConfig(); }catch(e){}

  return { ok:true,
    name:p.name, photo:p.photo, greeting:p.greeting,
    date:now.date, time:now.time,
    asks:p.asks, rows:p.rows, streak:p.streak,
    keys:{ total:keys.length, ready:ready, resting:resting, off:off, wins:wins, fails:fails },
    recent:recent, tabs:tabs, workflows:flows, jobs:jobs.length,
    telegram:tg.hasChat, health:(ready>=2?'good':(ready===1?'thin':'none')) };
}

/* What would be sensible to do next? */
function suggestNext(lastAnswer, lastAsk){
  var a=String(lastAnswer||'').toLowerCase();
  var out=[];
  if(/not in the data/.test(a)) out.push('Highlight more rows, including the header');
  if(/summar/i.test(String(lastAsk||''))) out.push('Draw a chart of that');
  if(/branch|worst|problem|complaint/.test(a)) out.push('Email the team a report on this');
  if(/urgent|danger|safety|gas|fire/.test(a)) out.push('Draft a reply to the most urgent one');
  if(/\d/.test(a)) out.push('Write it into the sheet');
  out.push('Explain that in simpler terms');
  out.push('What should I do about it?');
  var seen={}, clean=[];
  for(var i=0;i<out.length && clean.length<4;i++)
    if(!seen[out[i]]){ seen[out[i]]=true; clean.push(out[i]); }
  return clean;
}


/* =====================================================================
   39. TELEGRAM THAT TALKS BACK  —  buttons, menus, and a guided flow
   Telegram lets a bot attach buttons to a message. Tapping one sends a
   tiny code back, so the whole thing can be a conversation rather than
   a command line.
   ===================================================================== */

/* Send a message, optionally with buttons under it.
   buttons = [ [ {label:'Do this', code:'x'} , … ], [ … ] ]   */
function tgSend(text, chat, buttons){
  var c=readJson(TG,{});
  if(!c.token) return { ok:false, why:'No Telegram token saved yet.' };
  var to=chat||c.chat;
  if(!to) return { ok:false, why:'No chat id yet.' };

  var body={ chat_id:to, text:String(text).slice(0,4000) };
  if(buttons && buttons.length){
    var rows=[];
    for(var r=0;r<buttons.length;r++){
      var row=[];
      for(var b=0;b<buttons[r].length;b++){
        var btn=buttons[r][b];
        if(!btn||!btn.label) continue;
        row.push({ text:String(btn.label).slice(0,40),
                   callback_data:String(btn.code||'x').slice(0,60) });
      }
      if(row.length) rows.push(row);
    }
    if(rows.length) body.reply_markup={ inline_keyboard:rows };
  }
  try{
    var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/sendMessage',{
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify(body) });
    if(res.getResponseCode()!==200)
      return { ok:false, why:'Telegram said '+res.getResponseCode()+': '+
        String(res.getContentText()).slice(0,120) };
    return { ok:true };
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
}

/* Stop the little spinner on a tapped button. */
/* Telegram shows "typing…" when we tell it to. Free, and exactly the right signal. */
function tgTyping(chat){
  var c=readJson(TG,{});
  if(!c.token) return;
  var to=chat||c.chat;
  if(!to) return;
  try{
    UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/sendChatAction',{
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({ chat_id:to, action:'typing' }) });
  }catch(e){}
}

/* Something honest to say while a slow job runs. */
var THINKING = [
  'Reading your sheet…', 'Working through it…', 'Checking the numbers…',
  'Having a look…', 'One moment…', 'Counting…'
];
function thinkingLine(request){
  var s=String(request||'').toLowerCase();
  if(/email|send/.test(s)) return 'Writing it, then I will check who it goes to…';
  if(/research|investigate/.test(s)) return 'Sending the team out — this one takes a minute…';
  if(/picture|image|draw|logo/.test(s)) return 'Drawing it…';
  if(/summar|count|group/.test(s)) return 'Counting them up…';
  if(/urgent|risk|problem/.test(s)) return 'Reading through for anything urgent…';
  if(/inbox|email/.test(s)) return 'Reading your inbox…';
  return THINKING[Math.floor(Math.random()*THINKING.length)];
}

function tgAck(id, note){
  var c=readJson(TG,{});
  if(!c.token||!id) return;
  try{
    UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/answerCallbackQuery',{
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({ callback_query_id:id, text:String(note||'').slice(0,180) }) });
  }catch(e){}
}

/* ---------- THE MENUS ---------- */
function menuMain(){
  return [
    [ { label:'📊 My sheets', code:'sheets' }, { label:'☀️ Brief me', code:'brief' } ],
    [ { label:'📥 My inbox', code:'inbox' },  { label:'🌍 AI news',  code:'news' } ],
    [ { label:'📅 Today',    code:'today' },  { label:'⚡ My flows', code:'flows' } ],
    [ { label:'❓ Just ask me anything', code:'freeform' } ]
  ];
}

function menuTabs(){
  var f=sheetFacts();
  if(!f.ok) return { text:f.why, buttons:[[{ label:'⬅ Menu', code:'menu' }]] };
  var rows=[], line=[];
  for(var i=0;i<f.tabs.length && i<12;i++){
    line.push({ label:f.tabs[i].name.slice(0,22)+' ('+f.tabs[i].rows+')', code:'tab|'+i });
    if(line.length===2){ rows.push(line); line=[]; }
  }
  if(line.length) rows.push(line);
  rows.push([{ label:'⬅ Menu', code:'menu' }]);
  return { text:'📊 "'+f.name+'" has '+f.tabCount+' tabs and '+f.totalRows+
    ' rows of data.\n\nWhich one shall we look at?', buttons:rows };
}

/* Describe one tab, then offer what to do with it. */
function describeTab(index){
  var f=sheetFacts();
  if(!f.ok) return { text:f.why, buttons:[[{ label:'⬅ Menu', code:'menu' }]] };
  var i=Number(index);
  if(!(i>=0 && i<f.tabs.length))
    return { text:'I cannot find that tab any more.', buttons:[[{ label:'📊 Sheets', code:'sheets' }]] };

  var ss=SS(), sh=ss.getSheetByName(f.tabs[i].name);
  var rows=sh.getLastRow(), cols=sh.getLastColumn();
  var head=[], sample=[];
  try{ head=sh.getRange(1,1,1,Math.min(cols,10)).getValues()[0]
    .filter(function(x){ return String(x).trim(); }); }catch(e){}
  try{
    if(rows>=2){
      var v=sh.getRange(2,1,Math.min(2,rows-1),Math.min(cols,6)).getValues();
      for(var s=0;s<v.length;s++)
        sample.push(v[s].map(function(x){ return String(x).slice(0,28); }).join(' | '));
    }
  }catch(e){}

  /* Remember which tab they picked, so the next tap knows. */
  setWorkset(f.tabs[i].name,'');

  var text='📄 '+f.tabs[i].name+'\n'+
    Math.max(0,rows-1)+' rows · '+cols+' columns\n\n'+
    (head.length?('Columns:\n· '+head.join('\n· ')+'\n\n'):'')+
    (sample.length?('For example:\n'+sample.join('\n')+'\n\n'):'')+
    'What shall I do with it?';

  return { text:text, buttons:[
    [ { label:'🔎 What stands out?', code:'act|'+i+'|standout' },
      { label:'📈 Summarise it',     code:'act|'+i+'|summary' } ],
    [ { label:'🚨 Anything urgent?',  code:'act|'+i+'|urgent' },
      { label:'🧮 Count things',      code:'act|'+i+'|count' } ],
    [ { label:'📧 Email a report',    code:'act|'+i+'|email' },
      { label:'📊 Draw a chart',      code:'act|'+i+'|chart' } ],
    [ { label:'💬 Ask my own question', code:'ask|'+i },
      { label:'⬅ Sheets',              code:'sheets' } ]
  ]};
}

/* Turn a tapped action into a plain-English request for the agent. */
function actionRequest(tabName, action){
  var m={
    standout: 'Look at the tab "'+tabName+'" and tell me the three things that stand out most. Be specific and use real numbers from it.',
    summary:  'Summarise the tab "'+tabName+'" in five short lines. Use real figures from the data.',
    urgent:   'Look at the tab "'+tabName+'" and tell me anything urgent, risky or that needs attention today. If nothing is urgent, say so plainly.',
    count:    'Count the values in the most useful column of the tab "'+tabName+'" and tell me the breakdown, biggest first.',
    email:    'Write a short report on the tab "'+tabName+'" and email it to my contacts.',
    chart:    'Summarise the most useful column of the tab "'+tabName+'" and then draw a chart of the result.'
  };
  return m[action] || ('Tell me about the tab "'+tabName+'".');
}

/* ---------- WHAT A TAPPED BUTTON DOES ---------- */
function handleTap(code, chat){
  var parts=String(code||'').split('|');
  var what=parts[0];

  if(what==='menu'){
    var f=sheetFacts();
    sendOnce('What would you like?'+(f.ok?('\n\nI can see "'+f.name+'" — '+f.tabCount+
      ' tabs, '+f.totalRows+' rows.'):''), chat, menuMain());
    return 'Menu';
  }

  if(what==='sheets'){
    var m=menuTabs();
    sendOnce(m.text, chat, m.buttons);
    return 'Your sheets';
  }

  if(what==='tab'){
    var d=describeTab(parts[1]);
    sendOnce(d.text, chat, d.buttons);
    return 'Opened';
  }

  if(what==='ask'){
    var f2=sheetFacts(), name=(f2.ok&&f2.tabs[Number(parts[1])])?f2.tabs[Number(parts[1])].name:'that tab';
    sendOnce('Go ahead — ask me anything about "'+name+'".\n\n'+
      'For example:\n· which branch is worst?\n· how many say UNCLEAR?\n'+
      '· what should I fix first?', chat,
      [[{ label:'⬅ Back', code:'tab|'+parts[1] }]]);
    return 'Ask away';
  }

  if(what==='act'){
    var f3=sheetFacts();
    var idx=Number(parts[1]);
    var tabName=(f3.ok&&f3.tabs[idx])?f3.tabs[idx].name:'';
    if(!tabName){ sendOnce('I lost track of that tab.', chat, menuMain()); return 'Lost it'; }
    setWorkset(tabName,'');
    sendOnce('Working on it…', chat);
    var out=runAgentTimed(actionRequest(tabName, parts[2]), 'telegram');
    sendOnce((out&&out.ok&&out.answer)||((out&&out.why)||'That did not work.'), chat,
      [[{ label:'⬅ Back to '+tabName.slice(0,16), code:'tab|'+idx },
        { label:'🏠 Menu', code:'menu' }]]);
    return 'Done';
  }

  if(what==='brief'||what==='inbox'||what==='news'||what==='today'||what==='flows'){
    var ask={ brief:'Give me my full brief for today.',
              inbox:'What in my inbox needs my attention?',
              news:'What is new in artificial intelligence this week?',
              today:'What is today\'s date and what is in my calendar?',
              flows:'List my saved workflows.' }[what];
    sendOnce('One moment…', chat);
    var r=runAgentTimed(ask,'telegram');
    sendOnce((r&&r.ok&&r.answer)||((r&&r.why)||'That did not work.'), chat,
      [[{ label:'🏠 Menu', code:'menu' }]]);
    return 'Done';
  }

  if(what==='q'){
    var phrase=parts.slice(1).join('|');
    sendOnce('One moment…', chat, null, 2);
    var straight=runDirect(phrase);
    if(straight){
      sendOnce(bestEffort(straight.ok?straight.answer:straight.why, phrase), chat,
        nextButtons(straight.answer||'', phrase));
      return 'Done';
    }
    var r=runAgentTimed(phrase,'telegram');
    var txt=(r&&r.ok&&r.answer)?bestEffort(r.answer,phrase):((r&&r.why)||'That did not work.');
    sendOnce(txt, chat, nextButtons(txt, phrase));
    return 'Done';
  }

  if(what==='freeform'){
    sendOnce('Ask me anything — about your sheet, your inbox, the news, or just a question.\n\n'+
      'Type /menu any time to see the buttons again.', chat,
      [[{ label:'🏠 Menu', code:'menu' }]]);
    return 'Ask away';
  }

  sendOnce('I did not understand that button.', chat, menuMain());
  return 'Unknown';
}

/* A friendly nudge attached to ordinary answers, so the menu is never far away. */
function replyButtons(){
  return [[ { label:'🏠 Menu', code:'menu' }, { label:'📊 My sheets', code:'sheets' } ]];
}

/* After an answer, offer the one or two things worth doing next —
   chosen from what the answer actually said, as the drawer does. */
function nextButtons(answer, asked){
  var a=String(answer||'').toLowerCase();
  var q=String(asked||'').toLowerCase();
  var row=[];

  if(/not in the data|could not find|cannot tell/.test(a))
    row.push({ label:'📊 Pick a tab', code:'sheets' });
  else if(/\b(branch|branches|group|groups|category|categories|complaints?)\b/.test(a) && /\d/.test(a))
    row.push({ label:'📈 Chart that', code:'q|draw a chart' });
  else if(/\burgent\b|\brisk\b|\bsafety\b|\bdanger|\bimmediately\b/.test(a))
    row.push({ label:'📧 Email the team', code:'q|email the team a report' });
  else if(/summar|count|total|rows/.test(a))
    row.push({ label:'🔎 What stands out?', code:'q|what stands out in my data?' });

  if(/contact/.test(q)) row.push({ label:'➕ Add another', code:'q|add a contact' });
  if(row.length<2) row.push({ label:'🏠 Menu', code:'menu' });
  return [row.slice(0,2)];
}


/* =====================================================================
   40. THE KEY WIZARD
   Nobody can log into these sites for you — they all have two-factor
   and CAPTCHA, and storing your passwords would be reckless. What we
   CAN do is remove every other bit of friction: know which ones you are
   missing, open the right page, take a whole pile of keys at once, and
   work out who each one belongs to.
   ===================================================================== */

var SIGNUP = {
  gemini:      { label:'Google Gemini', free:'~1,500 requests a day', minutes:2, star:true,
                 url:'https://aistudio.google.com/apikey',
                 steps:['Sign in with your normal Google account',
                        'Click Create API key',
                        'Choose "Create in a new project"',
                        'Copy the key — it starts with AIza'],
                 note:'Start here. Best free volume, and the only one that reads pictures well.' },
  groq:        { label:'Groq', free:'30 a minute, 1,000 a day', minutes:2, star:true,
                 url:'https://console.groq.com/keys',
                 steps:['Sign in with Google or GitHub','Click Create API Key','Copy it immediately'],
                 note:'The fastest replies of any free tier. It shows the key ONCE.' },
  cerebras:    { label:'Cerebras', free:'1M tokens a day', minutes:2,
                 url:'https://cloud.cerebras.ai',
                 steps:['Sign up free','Open API Keys','Create one'],
                 note:'Resets daily. If it says payment required, try again tomorrow.' },
  openrouter:  { label:'OpenRouter', free:'the :free models', minutes:2,
                 url:'https://openrouter.ai/keys',
                 steps:['Sign in','Create Key'],
                 note:'One key, dozens of models. Free models rotate monthly.' },
  github:      { label:'GitHub Models', free:'tied to your GitHub account', minutes:3,
                 url:'https://github.com/settings/tokens',
                 steps:['Generate new token (classic)','No scopes needed','Copy it'],
                 note:'You probably already have a GitHub account.' },
  nvidia:      { label:'NVIDIA NIM', free:'evaluation credits', minutes:3,
                 url:'https://build.nvidia.com',
                 steps:['Sign up','Pick any model','Click Get API Key'] },
  cloudflare:  { label:'Cloudflare Workers AI', free:'10,000 neurons a day', minutes:4,
                 url:'https://dash.cloudflare.com/profile/api-tokens',
                 steps:['Create Token → Workers AI template',
                        'Copy the token',
                        'Also copy your Account ID from the dashboard URL',
                        'Paste them here as  accountid:token'],
                 note:'The only one that needs two pieces.' },
  cohere:      { label:'Cohere', free:'trial keys, rate limited', minutes:2,
                 url:'https://dashboard.cohere.com/api-keys',
                 steps:['Sign up','Copy the trial key'] },
  huggingface: { label:'Hugging Face', free:'monthly credit', minutes:2,
                 url:'https://huggingface.co/settings/tokens',
                 steps:['New token','Read access is enough','Copy it'] },
  mistral:     { label:'Mistral', free:'the Experiment tier', minutes:3,
                 url:'https://console.mistral.ai',
                 steps:['Sign up','Enable the free Experiment plan','Create an API key'] },
  together:    { label:'Together AI', free:'free models', minutes:2,
                 url:'https://api.together.ai',
                 steps:['Sign up','Copy the key from the dashboard'] },
  chutes:      { label:'Chutes AI', free:'shared free gateway', minutes:2,
                 url:'https://chutes.ai', steps:['Sign up','Create a key'] },
  scaleway:    { label:'Scaleway', free:'free tier', minutes:4,
                 url:'https://console.scaleway.com', steps:['Sign up','Generative APIs → API keys'] },
  ollama:      { label:'Ollama Cloud', free:'free tier', minutes:2,
                 url:'https://ollama.com', steps:['Sign in','Create a key'] },
  llm7:        { label:'LLM7', free:'no signup at all', minutes:1,
                 url:'https://llm7.io', steps:['Copy the public key from the page'],
                 note:'No account needed. A useful last-resort backstop.' }
};

/* Which ones do you already have, and which are worth getting next? */
function keyWizard(){
  var have={}, keys=loadKeys();
  for(var i=0;i<keys.length;i++) have[keys[i].provider]=(have[keys[i].provider]||0)+1;

  var got=[], missing=[];
  for(var id in SIGNUP){
    var s=SIGNUP[id];
    var row={ id:id, label:s.label, free:s.free, minutes:s.minutes, url:s.url,
              steps:s.steps, note:s.note||'', star:!!s.star, count:have[id]||0 };
    if(have[id]) got.push(row); else missing.push(row);
  }
  /* Best first: the starred ones, then the quickest. */
  missing.sort(function(a,b){
    if(a.star!==b.star) return a.star?-1:1;
    return a.minutes-b.minutes;
  });

  var ready=0;
  for(var k=0;k<keys.length;k++)
    if(keys[k].enabled!==false && !isResting(keys[k].id)) ready++;

  var advice;
  if(!keys.length) advice='Start with Google Gemini, then Groq. Four minutes and you are running.';
  else if(ready<2) advice='One working key is enough to try things, but a second means it can '+
    'carry on when the first hits its limit. '+(missing.length?('Try '+missing[0].label+' next.'):'');
  else if(ready<4) advice='You are in good shape. Adding '+(missing[0]?missing[0].label:'one more')+
    ' would give you comfortable headroom.';
  else advice='Plenty of headroom. You will hit Apps Script\'s six-minute limit before the AI limits.';

  return { ok:true, have:got, missing:missing, total:keys.length, ready:ready,
           advice:advice, next:missing.length?missing[0]:null };
}

/* Paste everything you collected, in any order, all at once. */
function bulkAddKeys(blob){
  var text=String(blob||'');
  if(!text.trim()) return { ok:false, why:'Paste your keys first — one per line is fine.' };

  /* Pull out anything that could be a key: long, no spaces. */
  var found=[], seen={};
  var chunks=text.split(/[\s,;]+/);
  for(var i=0;i<chunks.length;i++){
    var t=chunks[i].trim().replace(/^["'<]|["'>,.]$/g,'');
    if(t.length<16) continue;
    if(t.indexOf('http')===0) continue;
    if(t.indexOf('@')!==-1 && t.indexOf(':')===-1) continue;   /* an email, not a key */
    if(seen[t]) continue;
    seen[t]=true;
    found.push(t);
  }
  if(!found.length) return { ok:false,
    why:'I could not see anything key-shaped in that. Keys are long strings with no spaces.' };

  var added=[], failed=[], already=0;
  for(var f=0;f<found.length && f<25;f++){
    var r=addKey('', found[f], '');
    if(r.ok){ added.push({ key:found[f].slice(0,8)+'…', company:r.company, model:r.model }); }
    else if(/already added/.test(r.why||'')){ already++; }
    else failed.push({ key:found[f].slice(0,8)+'…', why:r.why });
  }
  logIt('keys','Bulk added '+added.length+' keys');
  return { ok:true, added:added, failed:failed, already:already, scanned:found.length,
           total:loadKeys().length };
}

/* A one-line verdict on the whole fleet, for the wizard header. */
function keyHealthLine(){
  var w=keyWizard();
  if(!w.total) return { level:'none', text:'No keys yet — nothing will work until you add one.' };
  if(w.ready===0) return { level:'none', text:'You have '+w.total+' keys but none are usable right now.' };
  if(w.ready===1) return { level:'thin', text:'One key working. Add a second so it can fail over.' };
  if(w.ready<4)   return { level:'ok', text:w.ready+' keys working — comfortable.' };
  return { level:'great', text:w.ready+' keys working — plenty of headroom.' };
}

/* =====================================================================
   41. THE DATA PROFILER
   Real analysis with no AI at all: what each column actually contains,
   how complete it is, what is unusual. Instant, free, and always right.
   ===================================================================== */

function guessType(values){
  var n=0, dates=0, nums=0, emails=0, phones=0, bools=0, money=0, long=0;
  for(var i=0;i<values.length;i++){
    var v=values[i];
    if(v===''||v===null||v===undefined) continue;
    n++;
    if(v instanceof Date){ dates++; continue; }
    var s=String(v).trim();
    if(/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s)){ emails++; continue; }
    if(/^\+?[\d\s\-()]{9,}$/.test(s)){ phones++; continue; }
    if(/^(yes|no|true|false|y|n)$/i.test(s)){ bools++; continue; }
    if(/^[A-Za-z]{2,4}?\s?[\d,]+\.?\d*$/.test(s) && /\d/.test(s) &&
       /(ksh|kes|usd|\$|£|€)/i.test(s)){ money++; continue; }
    if(!isNaN(Number(s.replace(/,/g,''))) && s!==''){ nums++; continue; }
    if(/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)){ dates++; continue; }
    if(s.length>60) long++;
  }
  if(!n) return 'empty';
  var most=Math.max(dates,nums,emails,phones,bools,money,long);
  if(most<n*0.5) return 'mixed text';
  if(most===dates) return 'date';
  if(most===emails) return 'email';
  if(most===phones) return 'phone';
  if(most===bools) return 'yes/no';
  if(most===money) return 'money';
  if(most===nums) return 'number';
  if(most===long) return 'long text';
  return 'text';
}

function profileTab(tabName, maxRows){
  var ss=SS();
  if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var sh=tabName ? ss.getSheetByName(String(tabName)) : SH();
  if(!sh) return { ok:false, why:'There is no tab called "'+tabName+'".' };

  var lastRow=sh.getLastRow(), lastCol=sh.getLastColumn();
  if(lastRow<2) return { ok:false, why:'"'+sh.getName()+'" has no data rows yet.' };

  var cap=Math.min(lastRow-1, Math.max(20, Number(maxRows)||500));
  var heads=sh.getRange(1,1,1,lastCol).getValues()[0];
  var body=sh.getRange(2,1,cap,lastCol).getValues();

  var cols=[];
  for(var c=0;c<lastCol && c<25;c++){
    var name=String(heads[c]||'').trim() || ('Column '+String.fromCharCode(65+c));
    var vals=[], filled=0, counts={}, uniq=0;
    var min=null, max=null, sum=0, numCount=0, shortest=9999, longest=0;

    for(var r=0;r<body.length;r++){
      var v=body[r][c];
      vals.push(v);
      var s=(v===null||v===undefined)?'':String(v).trim();
      if(!s) continue;
      filled++;
      if(counts[s]===undefined){ counts[s]=0; uniq++; }
      counts[s]++;
      shortest=Math.min(shortest,s.length); longest=Math.max(longest,s.length);
      var num=Number(s.replace(/[,\s]/g,''));
      if(!isNaN(num) && s!==''){ numCount++; sum+=num;
        if(min===null||num<min) min=num;
        if(max===null||num>max) max=num; }
    }

    var pairs=[];
    for(var k in counts) pairs.push([k,counts[k]]);
    pairs.sort(function(a,b){ return b[1]-a[1]; });

    var col={ letter:String.fromCharCode(65+c), name:name, type:guessType(vals),
      filled:filled, blank:body.length-filled,
      complete:Math.round((filled/body.length)*100),
      unique:uniq, top:pairs.slice(0,5).map(function(p){ return { value:p[0].slice(0,40), count:p[1] }; }) };

    if(numCount>filled*0.6 && numCount>0){
      col.min=min; col.max=max; col.average=Math.round((sum/numCount)*100)/100;
    }
    if(filled && uniq===filled) col.looksUnique=true;
    if(filled && uniq<=Math.max(2,Math.round(filled*0.15))) col.looksCategorical=true;
    if(longest) col.shortest=shortest===9999?0:shortest, col.longest=longest;
    cols.push(col);
  }

  return { ok:true, tab:sh.getName(), rows:lastRow-1, sampled:cap,
           columns:cols, columnCount:cols.length };
}

/* Turn the profile into things worth pointing out — still no AI. */
function profileNotes(p){
  if(!p||!p.ok) return [];
  var notes=[];
  for(var i=0;i<p.columns.length;i++){
    var c=p.columns[i];
    if(c.complete===0){ notes.push('"'+c.name+'" is completely empty.'); continue; }
    if(c.complete<70) notes.push('"'+c.name+'" is only '+c.complete+'% filled — '+c.blank+' blanks.');
    if(c.looksUnique && c.filled>3) notes.push('"'+c.name+'" is unique on every row — an id.');
    if(c.looksCategorical && c.top.length)
      notes.push('"'+c.name+'" is a category with '+c.unique+' values. Most common: '+
        c.top[0].value+' ('+c.top[0].count+').');
    if(c.type==='money'||c.type==='number'){
      if(c.max!==undefined && c.min!==undefined)
        notes.push('"'+c.name+'" runs from '+c.min+' to '+c.max+', averaging '+c.average+'.');
    }
    if(c.type==='long text') notes.push('"'+c.name+'" is free text — good for classifying or summarising.');
    if(c.type==='email') notes.push('"'+c.name+'" holds emails — I can add these to your contacts.');
    if(c.type==='phone') notes.push('"'+c.name+'" holds phone numbers.');
  }
  return notes.slice(0,10);
}

/* What is actually worth doing with this tab? */
function whatToDoWith(tabName){
  var p=profileTab(tabName,300);
  if(!p.ok) return { ok:false, why:p.why };
  var ideas=[];

  var freeText=null, category=null, money=null, dates=null, emails=null;
  for(var i=0;i<p.columns.length;i++){
    var c=p.columns[i];
    if(!freeText && (c.type==='long text'||(c.type==='mixed text'&&c.longest>40))) freeText=c;
    if(!category && c.looksCategorical && c.unique>1) category=c;
    if(!dates && c.type==='date') dates=c;
    if(!emails && c.type==='email') emails=c;

    /* A numeric column is only interesting if it is a MEASURE, not a row number.
       An id counts up one per row; a real figure has spread. */
    if((c.type==='money'||c.type==='number') && c.max!==undefined){
      if(c.looksUnique && c.max-c.min <= p.rows) continue;      /* 1,2,3… — that is an id */
      if(/^(id|no|num|number|row|#|s\/?n|serial|index)$/i.test(String(c.name).trim())) continue;
      var spread=c.max-c.min;
      if(!money || spread > (money.max-money.min)) money=c;      /* keep the widest */
    }
  }

  if(freeText) ideas.push({ icon:'🏷️', title:'Classify "'+freeText.name+'"',
    why:'It is free text — sorting it into categories is where the AI earns its keep.',
    ask:'Fill the next empty column from column '+freeText.letter+
        ': classify each row into a short category. One word. If none fit, reply UNCLEAR.' });

  if(category) ideas.push({ icon:'📈', title:'Count "'+category.name+'"',
    why:'It has only '+category.unique+' different values — a natural breakdown.',
    ask:'Summarise column '+category.letter+' into a tab called Summary, then tell me what stands out.' });

  if(category && freeText) ideas.push({ icon:'🔍', title:'Compare across "'+category.name+'"',
    why:'You can see which group has the worst problems.',
    ask:'Group the rows by column '+category.letter+
        ' and tell me which group has the most problems, with numbers.' });

  if(money) ideas.push({ icon:'💰', title:'Look at "'+money.name+'"',
    why:'It runs from '+money.min+' to '+money.max+'.',
    ask:'Look at column '+money.letter+
        ' and tell me the total, the average, and anything unusual.' });

  if(dates) ideas.push({ icon:'📅', title:'Look for a trend over "'+dates.name+'"',
    why:'You have dates, so you can see change over time.',
    ask:'Look at the dates in column '+dates.letter+
        ' and tell me whether things are getting better or worse.' });

  if(emails) ideas.push({ icon:'👥', title:'Add these people to Contacts',
    why:'"'+emails.name+'" holds real email addresses.',
    ask:'Add the email addresses in column '+emails.letter+' to my contacts.' });

  var thin=[];
  for(var j=0;j<p.columns.length;j++)
    if(p.columns[j].complete>0 && p.columns[j].complete<70) thin.push(p.columns[j].name);
  if(thin.length) ideas.push({ icon:'🧹', title:'Fill the gaps',
    why:thin.slice(0,3).join(', ')+' '+(thin.length>1?'are':'is')+' patchy.',
    ask:'Which rows are missing data, and can you fill in what is obvious?' });

  /* This one always earns its place, so it is added last and kept. */
  var urgent={ icon:'🚨', title:'Anything urgent?',
    why:'Worth asking before anything else.',
    ask:'Read this tab and tell me anything urgent, risky or unusual. If nothing is, say so.' };

  /* Two suggestions always earn their place, whatever else is competing. */
  var reserved=[];
  for(var g=0;g<ideas.length;g++) if(ideas[g].icon==='🧹') reserved.push(ideas[g]);
  var rest=[];
  for(var h=0;h<ideas.length;h++) if(ideas[h].icon!=='🧹') rest.push(ideas[h]);

  var picked=rest.slice(0,5);   /* the data-driven ones */
  picked=picked.concat(reserved);
  picked.push(urgent);

  return { ok:true, tab:p.tab, rows:p.rows, columns:p.columnCount,
           notes:profileNotes(p), ideas:picked, profile:p };
}


/* =====================================================================
   43. GUARDRAILS  —  know what a job will cost before you start it,
   and never do something irreversible without asking.
   ===================================================================== */

/* Things that leave the sheet, cost real money, or cannot be undone. */
var RISKY = {
  email_report:   { why:'sends real email to real people',      confirm:true },
  share_sheet:    { why:'gives someone access to your data',    confirm:true },
  telegram_message:{ why:'sends a message to your phone',       confirm:false },
  draft_reply:    { why:'writes a draft into your Gmail',       confirm:false },
  fill_column:    { why:'writes into many rows',                confirm:false, heavy:true },
  enrich_batch:   { why:'writes into many rows',                confirm:false, heavy:true },
  clean_column:   { why:'rewrites existing values',             confirm:true, undoable:true },
  split_column:   { why:'writes into several new columns',      confirm:false, heavy:true },
  sort_range:     { why:'reorders your rows',                   confirm:true, undoable:true },
  generate_data:  { why:'adds rows to your sheet',              confirm:false },
  make_pivot:     { why:'replaces a tab if one exists',         confirm:true },
  schedule_job:   { why:'sets something to run every day',      confirm:true },
  run_workflow:   { why:'runs several steps in a row',          confirm:true, heavy:true }
};

function isRisky(tool){ return !!RISKY[tool]; }
function riskNote(tool){
  var r=RISKY[tool];
  if(!r) return '';
  return r.why + (r.undoable?' — you can undo it':'') + (r.confirm?'. I will ask first.':'');
}

/* How big is this job, honestly? */
function estimateWork(kind, args){
  var a=args||{}, out={ rows:0, requests:0, seconds:0, warnings:[], ok:true };

  if(kind==='fill_column'||kind==='enrich_batch'){
    var first=Number(a.first)||2, last=Number(a.last)||0;
    if(!last){
      var sh=SH();
      last=sh?sh.getLastRow():first;
    }
    out.rows=Math.max(0,last-first+1);
    out.requests = (kind==='enrich_batch') ? Math.ceil(out.rows/12) : out.rows;
    out.seconds  = Math.round(out.requests * (kind==='enrich_batch'?4:2.5));
    if(out.seconds>300){
      out.warnings.push('That is longer than Apps Script allows in one go (6 minutes). '+
        'It will stop partway — press it again and it carries on from where it stopped.');
    }
    if(kind==='fill_column' && out.rows>20){
      out.warnings.push('Fill FAST would do this in about '+Math.ceil(out.rows/12)+
        ' requests instead of '+out.rows+'.');
    }
    var keys=loadKeys(), ready=0;
    for(var k=0;k<keys.length;k++) if(keys[k].enabled!==false && !isResting(keys[k].id)) ready++;
    if(ready && out.requests>ready*25){
      out.warnings.push('With '+ready+' key'+(ready>1?'s':'')+
        ' you will probably hit a rate limit. Adding another would help.');
    }
    if(!ready) { out.ok=false; out.warnings.push('No keys are usable right now.'); }
  }

  else if(kind==='swarm'){
    var agents=Math.max(2,Math.min(20,Number(a.agents)||6));
    out.requests=agents+4;
    out.seconds=Math.round(out.requests*5);
    out.rows=0;
    if(agents>10) out.warnings.push(agents+' agents is a lot. Six usually says as much.');
    if(out.seconds>300) out.warnings.push('This may run past the six-minute limit. Try fewer agents.');
  }

  else if(kind==='email_report'){
    var team=recipients(a.tag||'');
    out.rows=team.length;
    out.requests=1;
    out.seconds=8;
    if(!team.length){ out.ok=false; out.warnings.push('Nobody on your Contacts tab has an email.'); }
    var left=emailQuotaLeft();
    if(left>=0 && team.length>left){
      out.ok=false;
      out.warnings.push('You can only send '+left+' more emails today.');
    }
  }

  else if(kind==='workflow'){
    var steps=Number(a.steps)||1;
    out.requests=steps*3;
    out.seconds=steps*20;
    if(out.seconds>280) out.warnings.push('This may not finish in one run. It will stop and tell you.');
  }

  else { out.requests=1; out.seconds=6; }

  out.text=describeWork(out, kind);
  return out;
}

function describeWork(e, kind){
  var bits=[];
  if(e.rows) bits.push(e.rows+(kind==='email_report'?' people':' rows'));
  if(e.requests) bits.push(e.requests+' request'+(e.requests>1?'s':''));
  if(e.seconds) bits.push('about '+(e.seconds<60 ? (e.seconds+' seconds')
    : (Math.round(e.seconds/60)+' minute'+(e.seconds>=120?'s':''))));
  return bits.join(' · ');
}

/* Hold a risky action until the person says yes. */
function proposeAction(tool, args, plain){
  var id='p'+Date.now().toString(36)+Math.floor(Math.random()*999);
  var pending=readJson('AI_PENDING',{});
  pending[id]={ tool:tool, args:args||{}, plain:plain||'', at:Date.now() };
  /* keep only the last few */
  var keys=[];
  for(var k in pending) keys.push([k,pending[k].at]);
  keys.sort(function(a,b){ return b[1]-a[1]; });
  var trimmed={};
  for(var i=0;i<keys.length && i<5;i++) trimmed[keys[i][0]]=pending[keys[i][0]];
  writeJson('AI_PENDING',trimmed);
  return { ok:true, id:id, tool:tool, why:riskNote(tool), plain:plain||'' };
}

function confirmAction(id){
  var pending=readJson('AI_PENDING',{});
  var p=pending[id];
  if(!p) return { ok:false, why:'That has expired. Ask me again.' };
  delete pending[id]; writeJson('AI_PENDING',pending);
  if(Date.now()-p.at > 900000) return { ok:false, why:'That was more than fifteen minutes ago. Ask me again.' };

  var tool=TOOLS[p.tool];
  if(!tool) return { ok:false, why:'That action no longer exists.' };
  var result;
  try{ result=String(tool.run(p.args)); }
  catch(e){ return { ok:false, why:'It failed: '+e.message }; }
  logIt('confirmed', p.tool);
  return { ok:true, tool:p.tool, result:result };
}

function cancelAction(id){
  var pending=readJson('AI_PENDING',{});
  delete pending[id]; writeJson('AI_PENDING',pending);
  return { ok:true };
}

function listPending(){
  var pending=readJson('AI_PENDING',{}), out=[];
  for(var id in pending){
    if(Date.now()-pending[id].at>900000) continue;
    out.push({ id:id, tool:pending[id].tool, plain:pending[id].plain,
               why:riskNote(pending[id].tool),
               minutesAgo:Math.round((Date.now()-pending[id].at)/60000) });
  }
  return out;
}

/* =====================================================================
   44. DID THAT HELP?
   A quiet feedback loop. Every thumbs-down is a chance to improve the
   instruction that produced it.
   ===================================================================== */
var FEEDBACK_SHEET='Feedback';

function ensureFeedbackSheet(){
  var ss=SS();
  if(!ss) return null;
  var sh=ss.getSheetByName(FEEDBACK_SHEET);
  if(!sh){
    sh=ss.insertSheet(FEEDBACK_SHEET);
    sh.getRange(1,1,1,6).setValues([['When','Helpful','What I asked','What it said','Why not','Where']])
      .setFontWeight('bold').setBackground('#13294B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange('A2:A').setNumberFormat('@');
    sh.setColumnWidth(1,140); sh.setColumnWidth(3,300);
    sh.setColumnWidth(4,340); sh.setColumnWidth(5,220);
    sh.hideSheet();
  }
  return sh;
}

function recordFeedback(helpful, asked, answered, why, where){
  var sh=ensureFeedbackSheet();
  if(!sh) return { ok:false, why:'No spreadsheet connected.' };
  var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
  sh.getRange(Math.max(sh.getLastRow(),1)+1,1,1,6).setValues([[
    Utilities.formatDate(new Date(),tz,'yyyy-MM-dd HH:mm'),
    helpful?'yes':'no',
    String(asked||'').slice(0,300),
    String(answered||'').slice(0,600),
    String(why||'').slice(0,200),
    String(where||'drawer')
  ]]);
  if(sh.getLastRow()>500) sh.deleteRows(2,200);
  logIt('feedback', (helpful?'👍 ':'👎 ')+String(asked||'').slice(0,60));
  return { ok:true, helpful:!!helpful };
}

function feedbackSummary(){
  var sh=ensureFeedbackSheet();
  if(!sh||sh.getLastRow()<2) return { ok:true, total:0, good:0, bad:0, rate:null, recent:[] };
  var last=sh.getLastRow(), take=Math.min(last-1,200);
  var vals=sh.getRange(last-take+1,1,take,6).getValues();
  var good=0, bad=0, recent=[];
  for(var i=0;i<vals.length;i++){
    if(String(vals[i][1]).toLowerCase()==='yes') good++; else bad++;
    if(String(vals[i][1]).toLowerCase()==='no' && recent.length<8)
      recent.push({ asked:String(vals[i][2]), why:String(vals[i][4]) });
  }
  var total=good+bad;
  return { ok:true, total:total, good:good, bad:bad,
           rate: total?Math.round((good/total)*100):null, recent:recent };
}

/* Read the complaints and rewrite the instruction that caused them. */
function learnFromFeedback(promptName){
  var f=feedbackSummary();
  if(!f.total) return { ok:false, why:'No feedback recorded yet.' };
  if(!f.recent.length) return { ok:false, why:'Nothing has been marked unhelpful — nothing to learn from.' };

  var complaints=f.recent.map(function(r){
    return '· asked: "'+r.asked+'"'+(r.why?('  — they said: '+r.why):''); }).join('\n');

  var name=String(promptName||'analyst');
  var current=getPrompt(name);
  var out=callAI(
    'Here is an instruction currently given to an AI:\n\n'+current+'\n\n'+
    'These are recent times its answers were marked unhelpful:\n'+complaints+'\n\n'+
    'Rewrite the instruction so those specific problems cannot happen again. '+
    'Keep everything that already works. Under 140 words, plain text. '+
    'Reply with the rewritten instruction ONLY.');
  if(looksBroken(out)) return { ok:false, why:out };

  var text=String(out).replace(/```/g,'').trim();
  savePrompt(name, text, 'rewritten from '+f.recent.length+' complaints');
  return { ok:true, name:name, before:current, after:text, learnedFrom:f.recent.length };
}

/* A gentle nudge when things are not going well. */
function satisfactionCheck(){
  var f=feedbackSummary();
  if(f.total<4) return { ok:true, show:false };
  if(f.rate===null || f.rate>=70) return { ok:true, show:false, rate:f.rate };
  return { ok:true, show:true, rate:f.rate,
    message:'Only '+f.rate+'% of answers have been marked helpful. '+
      'I can rewrite my own instructions using what went wrong.',
    action:'learn' };
}


/* =====================================================================
   45. CHECK ITS OWN WORKING
   The most dangerous answer is a confident wrong number. So after the
   AI answers a question about your data, we go back to the data and
   check every figure it quoted actually appears there.
   ===================================================================== */

/* Pull the checkable claims out of an answer: figures, percentages, names. */
function claimsIn(text){
  var s=String(text||'');
  var nums=[], pcts=[], caps=[];

  var numRe=/\b\d[\d,]*(?:\.\d+)?\b/g, m;
  while((m=numRe.exec(s))!==null){
    var raw=m[0], clean=raw.replace(/,/g,'');
    var n=Number(clean);
    if(isNaN(n)) continue;
    var before=s.slice(Math.max(0,m.index-2), m.index);
    var after=s.slice(m.index+raw.length, m.index+raw.length+1);
    if(after==='%'){ pcts.push(n); continue; }
    nums.push({ raw:raw, value:n });
  }

  var pctRe=/(\d[\d.]*)\s*(?:%|per ?cent)/gi;
  while((m=pctRe.exec(s))!==null) pcts.push(Number(m[1]));

  /* Capitalised words that look like names from the data.
     Position is no help — a name is often the first word of a sentence —
     so instead we rule out the ordinary English words that get capitalised. */
  var COMMON=('the this that there these those it if in on at for and but so we you '+
    'yes no both all most some none each every however overall based looking across '+
    'given with from only one two three four five six seven eight nine ten '+
    'monday tuesday wednesday thursday friday saturday sunday '+
    'january february march april may june july august september october november december '+
    'not nothing they their them your our its his her about after before during since '+
    'here when what which who why how also then than more less best worst first last '+
    'branch branches row rows column columns total average count data sheet tab '+
    'yes overall summary answer note').split(' ');
  var isCommon={};
  for(var w0=0;w0<COMMON.length;w0++) isCommon[COMMON[w0]]=true;

  var words=s.split(/[^A-Za-z0-9'\-]+/);
  for(var i=0;i<words.length;i++){
    var w=words[i];
    if(w.length<3) continue;
    if(!/^[A-Z][a-z]{2,}$/.test(w)) continue;
    if(isCommon[w.toLowerCase()]) continue;
    if(caps.indexOf(w)===-1) caps.push(w);
  }

  return { numbers:nums, percents:pcts, names:caps.slice(0,12) };
}

/* Does the source actually contain this? Numbers may be sums or counts,
   so a figure is "supported" if it appears, OR is a plausible total. */
function checkClaims(answer, source){
  var c=claimsIn(answer);
  var src=String(source||'');
  var flat=src.replace(/,/g,'');

  var unsupported=[], supported=0, derived=0;

  /* Every number in the source, so we can test sums and counts. */
  var srcNums=[], m, re=/\b\d+(?:\.\d+)?\b/g;
  while((m=re.exec(flat))!==null) srcNums.push(Number(m[0]));
  var total=0;
  for(var s2=0;s2<srcNums.length;s2++) total+=srcNums[s2];
  var lines=src.split(/\r?\n/).filter(function(l){ return l.trim(); }).length;

  for(var i=0;i<c.numbers.length;i++){
    var n=c.numbers[i].value;
    if(flat.indexOf(String(n))!==-1){ supported++; continue; }
    if(n===lines || n===lines-1 || n===srcNums.length){ derived++; continue; }   /* a count */
    if(Math.abs(n-total)<Math.max(1,total*0.01)){ derived++; continue; }         /* a sum */
    if(n<=lines && n===Math.round(n)){ derived++; continue; }                    /* a subtotal */
    unsupported.push(c.numbers[i].raw);
  }

  var namesMissing=[];
  var lower=src.toLowerCase();
  for(var j=0;j<c.names.length;j++){
    if(lower.indexOf(c.names[j].toLowerCase())===-1) namesMissing.push(c.names[j]);
  }

  var checked=c.numbers.length+c.names.length;
  return {
    checked: checked,
    supported: supported,
    derived: derived,
    unsupportedNumbers: unsupported.slice(0,6),
    unknownNames: namesMissing.slice(0,6),
    clean: unsupported.length===0 && namesMissing.length===0,
    confidence: checked===0 ? 'nothing to check'
      : (unsupported.length===0 && namesMissing.length===0) ? 'every figure checks out'
      : (unsupported.length+namesMissing.length===1) ? 'one thing I could not find'
      : (unsupported.length+namesMissing.length)+' things I could not find'
  };
}

/* Ask, then check, then fix if needed. */
function askAndVerify(question, tries){
  var first=askSelection(question);
  if(!first.ok) return first;
  if(looksBroken(first.text)) return first;

  var t=selectionAsTable();
  var check=checkClaims(first.text, t.text);
  first.check=check;

  if(check.clean || !Number(tries||1)){
    first.verified=true;
    return first;
  }

  /* Something did not add up. Hand it back and ask for a corrected answer. */
  var problems=[];
  if(check.unsupportedNumbers.length)
    problems.push('these figures do not appear in the data: '+check.unsupportedNumbers.join(', '));
  if(check.unknownNames.length)
    problems.push('these names do not appear in the data: '+check.unknownNames.join(', '));

  var second=callAI(
    getPrompt('analyst')+'\n\n'+
    'You answered a question about a table and something did not check out:\n'+
    problems.join('\n')+'\n\n'+
    'Answer again using ONLY figures and names that genuinely appear in the table below. '+
    'If you cannot support a claim, leave it out or say you cannot tell. '+
    'Under 130 words.\n\n'+
    'QUESTION: '+question+'\n\nTABLE:\n'+t.text);

  if(looksBroken(second)) { first.verified=false; return first; }

  var recheck=checkClaims(second, t.text);
  return { ok:true, text:second, rows:t.rows, label:t.label,
           verified:true, corrected:true,
           check:recheck, firstAttempt:first.text,
           note:'I checked my first answer against the data, found '+
                check.confidence+', and answered again.' };
}

/* =====================================================================
   46. DEEPER ANALYSIS  —  arithmetic the AI cannot get wrong,
   because it is done in code.
   ===================================================================== */

function numbersFrom(sh, col, first, last){
  var vals=sh.getRange(col+first+':'+col+last).getValues();
  var out=[];
  for(var i=0;i<vals.length;i++){
    var v=vals[i][0];
    if(v===''||v===null||v===undefined) continue;
    var n=Number(String(v).replace(/[,\s]/g,''));
    if(!isNaN(n)) out.push({ row:first+i, value:n });
  }
  return out;
}

function quantile(sorted, q){
  if(!sorted.length) return 0;
  var pos=(sorted.length-1)*q, base=Math.floor(pos), rest=pos-base;
  if(sorted[base+1]!==undefined) return sorted[base]+rest*(sorted[base+1]-sorted[base]);
  return sorted[base];
}

/* Outliers, the proper way: anything well outside the middle half. */
function findOutliers(tabName, col){
  var ss=SS(); if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var sh=tabName?ss.getSheetByName(String(tabName)):SH();
  if(!sh) return { ok:false, why:'There is no tab called "'+tabName+'".' };
  var c=String(col||'').toUpperCase();
  if(!/^[A-Z]{1,2}$/.test(c)) return { ok:false, why:'Which column? Give me a letter like D.' };

  var last=sh.getLastRow();
  if(last<4) return { ok:false, why:'Too few rows to judge what is unusual.' };

  var pts=numbersFrom(sh,c,2,last);
  if(pts.length<4) return { ok:false, why:'Column '+c+' does not hold enough numbers.' };

  var vals=pts.map(function(p){ return p.value; }).sort(function(a,b){ return a-b; });
  var q1=quantile(vals,0.25), q3=quantile(vals,0.75), iqr=q3-q1;
  var lowCut=q1-1.5*iqr, highCut=q3+1.5*iqr;

  var high=[], low=[];
  for(var i=0;i<pts.length;i++){
    if(pts[i].value>highCut) high.push(pts[i]);
    else if(pts[i].value<lowCut) low.push(pts[i]);
  }
  high.sort(function(a,b){ return b.value-a.value; });
  low.sort(function(a,b){ return a.value-b.value; });

  var sum=0; for(var s=0;s<vals.length;s++) sum+=vals[s];
  return { ok:true, tab:sh.getName(), column:c, counted:pts.length,
    median:quantile(vals,0.5), q1:q1, q3:q3,
    normalFrom:Math.round(lowCut*100)/100, normalTo:Math.round(highCut*100)/100,
    average:Math.round((sum/vals.length)*100)/100,
    high:high.slice(0,8), low:low.slice(0,8),
    count:high.length+low.length };
}

/* Which group is worst — counted, not guessed. */
function compareGroups(tabName, groupCol, valueCol){
  var ss=SS(); if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var sh=tabName?ss.getSheetByName(String(tabName)):SH();
  if(!sh) return { ok:false, why:'There is no tab called "'+tabName+'".' };
  var g=String(groupCol||'').toUpperCase();
  if(!/^[A-Z]{1,2}$/.test(g)) return { ok:false, why:'Which column holds the groups?' };

  var last=sh.getLastRow();
  if(last<2) return { ok:false, why:'No data rows.' };

  var groups=sh.getRange(g+'2:'+g+last).getValues();
  var vals=null;
  if(valueCol && /^[A-Z]{1,2}$/.test(String(valueCol).toUpperCase()))
    vals=sh.getRange(String(valueCol).toUpperCase()+'2:'+String(valueCol).toUpperCase()+last).getValues();

  var by={}, total=0;
  for(var i=0;i<groups.length;i++){
    var key=String(groups[i][0]||'').trim();
    if(!key) continue;
    if(!by[key]) by[key]={ name:key, count:0, sum:0, numbers:0 };
    by[key].count++; total++;
    if(vals){
      var n=Number(String(vals[i][0]).replace(/[,\s]/g,''));
      if(!isNaN(n)){ by[key].sum+=n; by[key].numbers++; }
    }
  }

  var rows=[];
  for(var k in by){
    var b=by[k];
    b.share=Math.round((b.count/total)*1000)/10;
    if(b.numbers) b.average=Math.round((b.sum/b.numbers)*100)/100;
    rows.push(b);
  }
  rows.sort(function(a,b){ return b.count-a.count; });

  var notes=[];
  if(rows.length){
    notes.push(rows[0].name+' has the most, with '+rows[0].count+' of '+total+
      ' ('+rows[0].share+'%).');
    if(rows.length>1 && rows[0].count > rows[1].count*2)
      notes.push('That is more than double the next one ('+rows[1].name+', '+rows[1].count+').');
    var evenShare=100/rows.length;
    if(rows[0].share > evenShare*1.8)
      notes.push('If they were evenly spread each would be about '+
        Math.round(evenShare)+'%, so '+rows[0].name+' really does stand out.');
    if(vals && rows[0].average!==undefined){
      var byAvg=rows.slice().sort(function(a,b){ return (b.average||0)-(a.average||0); });
      if(byAvg[0].name!==rows[0].name)
        notes.push('By value though, '+byAvg[0].name+' is highest, averaging '+byAvg[0].average+'.');
    }
  }

  return { ok:true, tab:sh.getName(), groupColumn:g, total:total,
           groups:rows.slice(0,15), distinct:rows.length, notes:notes };
}

/* Are things getting better or worse? */
function trendOver(tabName, dateCol, valueCol){
  var ss=SS(); if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var sh=tabName?ss.getSheetByName(String(tabName)):SH();
  if(!sh) return { ok:false, why:'There is no tab called "'+tabName+'".' };
  var d=String(dateCol||'').toUpperCase();
  if(!/^[A-Z]{1,2}$/.test(d)) return { ok:false, why:'Which column holds the dates?' };

  var last=sh.getLastRow();
  if(last<4) return { ok:false, why:'Too few rows to see a trend.' };

  var dates=sh.getRange(d+'2:'+d+last).getValues();
  var vals=null;
  if(valueCol && /^[A-Z]{1,2}$/.test(String(valueCol).toUpperCase()))
    vals=sh.getRange(String(valueCol).toUpperCase()+'2:'+String(valueCol).toUpperCase()+last).getValues();

  var byDay={}, order=[];
  for(var i=0;i<dates.length;i++){
    var raw=dates[i][0];
    if(raw===''||raw===null||raw===undefined) continue;
    var key='';
    if(raw instanceof Date){
      var tz; try{ tz=Session.getScriptTimeZone(); }catch(e){ tz='Africa/Nairobi'; }
      key=Utilities.formatDate(raw,tz,'yyyy-MM-dd');
    } else {
      var m=/^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
      if(!m) continue;
      key=m[1];
    }
    if(!byDay[key]){ byDay[key]={ day:key, count:0, sum:0, numbers:0 }; order.push(key); }
    byDay[key].count++;
    if(vals){
      var n=Number(String(vals[i][0]).replace(/[,\s]/g,''));
      if(!isNaN(n)){ byDay[key].sum+=n; byDay[key].numbers++; }
    }
  }
  order.sort();
  if(order.length<3) return { ok:false, why:'I need at least three different dates to see a trend.' };

  var series=order.map(function(k){ return byDay[k]; });
  var half=Math.floor(series.length/2);
  var firstHalf=0, secondHalf=0;
  for(var a=0;a<half;a++) firstHalf+=series[a].count;
  for(var b=series.length-half;b<series.length;b++) secondHalf+=series[b].count;

  var change = firstHalf ? Math.round(((secondHalf-firstHalf)/firstHalf)*100) : 0;
  var direction = Math.abs(change)<10 ? 'steady' : (change>0?'rising':'falling');

  var busiest=series.slice().sort(function(a,b){ return b.count-a.count; })[0];

  return { ok:true, tab:sh.getName(), days:series.length,
    from:order[0], to:order[order.length-1],
    firstHalf:firstHalf, secondHalf:secondHalf, changePercent:change,
    direction:direction, busiest:busiest,
    series:series.slice(0,40),
    note:'Across '+series.length+' days, the second half had '+secondHalf+
      ' against '+firstHalf+' in the first — '+direction+
      (direction==='steady'?'':(' by about '+Math.abs(change)+'%'))+
      '. Busiest day: '+busiest.day+' with '+busiest.count+'.' };
}

/* Match two tabs on a shared column, and show what is missing on each side. */
function crossTabs(tabA, colA, tabB, colB){
  var ss=SS(); if(!ss) return { ok:false, why:'No spreadsheet connected.' };
  var a=ss.getSheetByName(String(tabA)), b=ss.getSheetByName(String(tabB));
  if(!a) return { ok:false, why:'There is no tab called "'+tabA+'".' };
  if(!b) return { ok:false, why:'There is no tab called "'+tabB+'".' };
  var ca=String(colA||'').toUpperCase(), cb=String(colB||'').toUpperCase();
  if(!/^[A-Z]{1,2}$/.test(ca)||!/^[A-Z]{1,2}$/.test(cb))
    return { ok:false, why:'I need a column letter for each side, like A and B.' };

  var la=a.getLastRow(), lb=b.getLastRow();
  if(la<2||lb<2) return { ok:false, why:'One of those tabs has no data.' };

  function keys(sh,col,last){
    var v=sh.getRange(col+'2:'+col+last).getValues(), map={}, order=[];
    for(var i=0;i<v.length;i++){
      var k=String(v[i][0]||'').trim().toLowerCase();
      if(!k) continue;
      if(!map[k]){ map[k]={ key:String(v[i][0]).trim(), rows:[] }; order.push(k); }
      map[k].rows.push(i+2);
    }
    return { map:map, order:order };
  }
  var A=keys(a,ca,la), B=keys(b,cb,lb);

  var both=[], onlyA=[], onlyB=[];
  for(var i=0;i<A.order.length;i++){
    var k=A.order[i];
    if(B.map[k]) both.push({ key:A.map[k].key, inA:A.map[k].rows.length, inB:B.map[k].rows.length });
    else onlyA.push({ key:A.map[k].key, rows:A.map[k].rows.slice(0,5) });
  }
  for(var j=0;j<B.order.length;j++){
    if(!A.map[B.order[j]]) onlyB.push({ key:B.map[B.order[j]].key, rows:B.map[B.order[j]].rows.slice(0,5) });
  }

  return { ok:true,
    tabA:a.getName(), tabB:b.getName(),
    inBoth:both.length, onlyInA:onlyA.length, onlyInB:onlyB.length,
    matched:both.slice(0,20), missingFromB:onlyA.slice(0,20), missingFromA:onlyB.slice(0,20),
    note:both.length+' match, '+onlyA.length+' are only in "'+a.getName()+'", and '+
      onlyB.length+' are only in "'+b.getName()+'".' };
}


/* =====================================================================
   47. GUIDED CONVERSATIONS
   "Can you add a contact person" should not be answered with a wall of
   buttons. It should start a conversation: one question at a time,
   validated as you go, cancellable at any point.
   ===================================================================== */

var FLOW_KEY='AI_FLOW';

/* Each flow is a short list of questions with a way to check the answer. */
var FLOWS = {
  add_contact: {
    title:'Adding a contact',
    opener:'Right — let us add someone. One thing at a time.',
    steps:[
      { field:'name',  ask:'What is their name?',
        check:function(v){ return v.length>=2 ? '' : 'That is a bit short — what is their full name?'; } },
      { field:'email', ask:'What is their email? (or say skip)', optional:true,
        check:function(v){ return validEmail(v) ? '' :
          'That does not look like an email. Try again, or say skip.'; } },
      { field:'phone', ask:'And a phone number? (or say skip)', optional:true,
        check:function(v){ return String(v).replace(/[^0-9]/g,'').length>=7 ? '' :
          'That does not look like a phone number. Try again, or say skip.'; } },
      { field:'tag',   ask:'Any tag, so you can email just this group? (or say skip)', optional:true,
        check:function(){ return ''; } }
    ],
    finish:function(a){
      if(!a.email && !a.phone)
        return { ok:false, why:'I need at least an email or a phone number. Nothing was saved.' };
      var sh=ensureContactsSheet();
      var startRow=Math.max(sh.getLastRow(),1)+1;
      sh.getRange(startRow,1,1,CONTACT_HEADERS.length).setValues([[
        a.name, a.email||'', a.phone?normalisePhone(a.phone):'', '', '', a.tag||'', '', '' ]]);
      logIt('contact added', a.name);
      return { ok:true, say:'✅ Saved '+a.name+
        (a.email?(' — '+a.email):'')+(a.phone?(' — '+normalisePhone(a.phone)):'')+
        (a.tag?('  ['+a.tag+']'):'')+'.\n\nThey are on your Contacts tab now.' };
    }
  },

  add_key: {
    title:'Adding an AI key',
    opener:'Let us get you another key.',
    steps:[
      { field:'key', ask:'Paste the key. I will work out which company it is from.',
        check:function(v){ return v.length>=16 ? '' :
          'That looks too short for a key. Paste the whole thing.'; } }
    ],
    finish:function(a){
      var r=addKey('', a.key, '');
      return r.ok
        ? { ok:true, say:'✅ '+r.company+' added, using '+r.model+'. You now have '+r.count+' keys.' }
        : { ok:false, why:r.why };
    }
  },

  email_team: {
    title:'Emailing your contacts',
    opener:'I can email your contacts a report on what you are looking at.',
    steps:[
      { field:'subject', ask:'What should the subject line be?',
        check:function(v){ return v.length>=3 ? '' : 'A few more words for the subject, please.'; } },
      { field:'tag', ask:'Just one group, or everyone? (type a tag, or say everyone)',
        optional:true, check:function(){ return ''; } },
      { field:'confirm', ask:'', confirm:true,
        build:function(a){
          var who=recipients(a.tag&&a.tag.toLowerCase()!=='everyone'?a.tag:'');
          if(!who.length) return null;
          return 'That will email '+who.length+' '+(who.length===1?'person':'people')+
            ' — '+who.map(function(x){ return x.name; }).slice(0,6).join(', ')+
            '.\n\nShall I send it? (yes or no)';
        } }
    ],
    finish:function(a){
      var tag=(a.tag&&a.tag.toLowerCase()!=='everyone')?a.tag:'';
      var r=sendReport(a.subject,'',tag,false);
      return r.ok
        ? { ok:true, say:'✅ Sent to '+r.sent.length+': '+r.sent.join(', ') }
        : { ok:false, why:r.why };
    }
  },

  schedule: {
    title:'Setting a daily job',
    opener:'I can run something for you every day.',
    steps:[
      { field:'job', ask:'Which one — your morning brief, a sheet summary, or a problem watch?',
        check:function(v){
          var s=String(v).toLowerCase();
          if(/brief|morning/.test(s)||/summar/.test(s)||/watch|problem/.test(s)) return '';
          return 'Say brief, summary, or watch.';
        },
        clean:function(v){
          var s=String(v).toLowerCase();
          if(/summar/.test(s)) return 'scheduledBrief';
          if(/watch|problem/.test(s)) return 'watchSheet';
          return 'morningBrief';
        } },
      { field:'hour', ask:'At what hour? (0 to 23, so 7 means seven in the morning)',
        check:function(v){
          var n=Number(String(v).replace(/[^0-9]/g,''));
          return (!isNaN(n) && n>=0 && n<=23) ? '' : 'Give me a number between 0 and 23.';
        },
        clean:function(v){ return Number(String(v).replace(/[^0-9]/g,'')); } }
    ],
    finish:function(a){
      var r=addJob(a.job, a.hour, 1);
      return r.ok
        ? { ok:true, say:'✅ Set. It will run every day at '+r.hour+':00.' }
        : { ok:false, why:r.why };
    }
  }
};

/* ---------- what someone is trying to do, without asking the AI ---------- */
function detectIntent(text){
  var s=String(text||'').toLowerCase().trim();
  if(!s) return '';

  /* Plurals matter. "can we add contacts" was falling straight through
     to the agent because \bcontact\b does not match "contacts". */
  var WANT=/\b(add|new|create|save|register|enter|record|capture)\b/;
  var LETS=/\b(can (we|you|i)|i want to|i'?d like to|let'?s|please|help me)\b/;

  if(/\b(contacts?|persons?|people|colleagues?|someone|somebody)\b/.test(s)
     && (WANT.test(s) || (LETS.test(s) && /\bcontacts?\b/.test(s)))) return 'add_contact';

  if(/\b(api ?keys?|keys?)\b/.test(s) && WANT.test(s)) return 'add_key';

  if(/\b(emails?|send)\b/.test(s) && /\b(team|contacts?|report|everyone|colleagues?)\b/.test(s))
    return 'email_team';

  if(/\b(schedule|every ?day|daily|each morning|remind me every)\b/.test(s)) return 'schedule';

  return '';
}

/* ---------- where we are in a conversation ---------- */
function flowState(who){
  var all=readJson(FLOW_KEY,{});
  return all[String(who||'me')]||null;
}
function setFlowState(who, state){
  var all=readJson(FLOW_KEY,{});
  if(state) all[String(who||'me')]=state; else delete all[String(who||'me')];
  writeJson(FLOW_KEY,all);
}

function startFlow(name, who){
  var f=FLOWS[name];
  if(!f) return { ok:false, why:'I do not know how to do that yet.' };
  var state={ flow:name, at:0, answers:{}, started:Date.now() };
  setFlowState(who, state);
  return { ok:true, inFlow:true, title:f.title,
    say:f.opener+'\n\n'+f.steps[0].ask+'\n\n(say cancel at any point)' };
}

function cancelFlow(who){
  var s=flowState(who);
  setFlowState(who,null);
  return { ok:true, say: s ? 'Stopped. Nothing was saved.' : 'There was nothing to stop.' };
}

/* The heart of it: take the next answer, check it, move on or finish. */
function continueFlow(text, who){
  var state=flowState(who);
  if(!state) return { ok:false, none:true };

  var f=FLOWS[state.flow];
  if(!f){ setFlowState(who,null); return { ok:false, none:true }; }

  /* An abandoned conversation should not linger. */
  if(Date.now()-state.started > 1800000){
    setFlowState(who,null);
    return { ok:true, inFlow:false, say:'That was a while ago, so I let it go. Start again when you like.' };
  }

  var said=String(text||'').trim();
  var lower=said.toLowerCase();

  if(/^(cancel|stop|forget it|never ?mind|quit)$/.test(lower)) return cancelFlow(who);

  var step=f.steps[state.at];

  /* A confirmation step: yes or no, nothing else. */
  if(step && step.confirm){
    if(/^(y|yes|yeah|yep|ok|okay|go|send|do it|sawa)$/.test(lower)){
      setFlowState(who,null);
      var done=f.finish(state.answers);
      return { ok:done.ok, inFlow:false, say: done.ok?done.say:('❌ '+done.why) };
    }
    if(/^(n|no|nope|cancel|stop)$/.test(lower)){
      setFlowState(who,null);
      return { ok:true, inFlow:false, say:'Fine — nothing sent.' };
    }
    return { ok:true, inFlow:true, say:'Just yes or no, please.' };
  }

  if(/^(skip|none|no|n\/a|nothing)$/.test(lower)){
    if(!step.optional) return { ok:true, inFlow:true, say:'I do need that one. '+step.ask };
    state.answers[step.field]='';
  } else {
    var problem = step.check ? step.check(said) : '';
    if(problem) return { ok:true, inFlow:true, say:problem };
    state.answers[step.field]= step.clean ? step.clean(said) : said;
  }

  state.at++;

  /* Skip a confirmation whose summary cannot be built (nobody to email, say). */
  while(state.at < f.steps.length && f.steps[state.at].confirm){
    var summary=f.steps[state.at].build ? f.steps[state.at].build(state.answers) : null;
    if(summary===null){
      setFlowState(who,null);
      return { ok:false, inFlow:false, say:'❌ There is nobody to send that to. Add a contact first.' };
    }
    setFlowState(who,state);
    return { ok:true, inFlow:true, say:summary };
  }

  if(state.at >= f.steps.length){
    setFlowState(who,null);
    var result=f.finish(state.answers);
    return { ok:result.ok, inFlow:false, say: result.ok?result.say:('❌ '+result.why) };
  }

  setFlowState(who,state);
  var next=f.steps[state.at];
  var progress='('+(state.at+1)+' of '+f.steps.length+') ';
  return { ok:true, inFlow:true, say:progress+next.ask };
}

/* ---------- instant answers that never need the agent ---------- */
function fastAnswer(text){
  var s=String(text||'').toLowerCase().trim().replace(/[?!.]+$/,'');
  if(!s) return '';

  if(/^(how many (rows|records|entries)|row count|count (the )?rows)/.test(s)
     || /how many rows.*(sheet|have|there)/.test(s)){
    var f=sheetFacts();
    if(!f.ok) return '';
    return f.name+' has '+f.totalRows+' rows of data across '+f.tabCount+' tabs:\n'+
      f.tabs.map(function(t){ return '· '+t.name+': '+t.rows; }).join('\n');
  }
  if(/^(what|which) (is )?(the )?(date|day)( is it)?( today)?$/.test(s)
     || /^today'?s? date$/.test(s) || /^what is today$/.test(s)){
    var n=rightNow();
    return 'It is '+n.date+', '+n.time+'.';
  }
  if(/^(what|which) tabs|list (my )?tabs|what sheets/.test(s)){
    var f2=sheetFacts();
    if(!f2.ok) return '';
    return f2.tabCount+' tabs:\n'+f2.tabs.map(function(t){
      return '· '+t.name+' — '+t.rows+' rows, '+t.cols+' columns'; }).join('\n');
  }
  if(/^(how many|list|show) (my )?(keys|api keys)/.test(s)){
    var keys=loadKeys(), ready=0;
    for(var i=0;i<keys.length;i++) if(keys[i].enabled!==false && !isResting(keys[i].id)) ready++;
    return ready+' of '+keys.length+' keys are ready right now.';
  }
  if(/^(how many|list|show) (my )?contacts/.test(s)){
    var c=readContacts();
    if(!c.length) return 'You have no contacts yet. Say "add a contact" and I will walk you through it.';
    return c.length+' contacts:\n'+c.slice(0,12).map(function(x){
      return '· '+x.name+(x.email?(' — '+x.email):''); }).join('\n');
  }
  return '';
}


/* =====================================================================
   48. TELEGRAM WITHOUT A PUBLIC WEB APP
   A webhook needs a deployment that ANYONE can reach. On a Workspace
   domain that is often blocked by policy, and Telegram gets a 302.
   So: stop waiting to be called, and go and fetch instead. A trigger
   asks Telegram for new messages every minute. Nothing is public.
   ===================================================================== */

var POLL_OFFSET='AI_TG_OFFSET';

function pollingOn(){
  var tr=ScriptApp.getProjectTriggers();
  for(var i=0;i<tr.length;i++) if(tr[i].getHandlerFunction()==='pollTelegram') return true;
  return false;
}

function enablePolling(){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { ok:false, why:'Save your bot token first.' };

  /* A webhook and polling cannot both be on — Telegram forbids it. */
  try{
    UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+
      '/deleteWebhook?drop_pending_updates=false',{ muteHttpExceptions:true });
  }catch(e){ return { ok:false, why:'Could not reach Telegram.' }; }
  cfg.webhook=''; writeJson(TG,cfg);

  disablePolling();
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  logIt('telegram','Switched to polling every minute');
  return { ok:true, say:'Switched over. No public web app needed.\n\n'+
    'I now hold a line open to Telegram, so replies usually come back in a few seconds.' };
}

function disablePolling(){
  var tr=ScriptApp.getProjectTriggers(), n=0;
  for(var i=0;i<tr.length;i++)
    if(tr[i].getHandlerFunction()==='pollTelegram'){ ScriptApp.deleteTrigger(tr[i]); n++; }
  return { ok:true, removed:n };
}

/* Runs on the trigger. Fetches anything new and feeds it through doPost. */
function pollTelegram(){
  noteHeartbeat();
  var cfg=readJson(TG,{});
  if(!cfg.token) return;

  /* Long polling. Instead of asking "anything new?" once a minute and hanging up,
     we hold the line open for 25 seconds at a time. Telegram answers the moment
     something arrives, so replies feel immediate rather than up to a minute late. */
  var started=Date.now(), rounds=0;
  while(Date.now()-started < 50000 && rounds < 4){
    rounds++;
    var offset=Number(PropertiesService.getScriptProperties().getProperty(POLL_OFFSET))||0;
    var res, body;
    try{
      res=UrlFetchApp.fetch('https://api.telegram.org/bot'+cfg.token+
        '/getUpdates?timeout=25&limit=10'+(offset?('&offset='+offset):''),
        { muteHttpExceptions:true });
      body=res.getContentText();
    }catch(e){ return; }

    var d; try{ d=JSON.parse(body); }catch(e){ return; }
    if(!d.ok) return;
    if(!d.result || !d.result.length) continue;      /* nothing yet — hold on again */

    var highest=offset;
    for(var i=0;i<d.result.length;i++){
      var up=d.result[i];
      if(up.update_id>=highest) highest=up.update_id+1;
      try{ doPost({ postData:{ contents:JSON.stringify(up) } }); }
      catch(e){ logIt('telegram poll error', String(e&&e.message||e).slice(0,150)); }
    }
    PropertiesService.getScriptProperties().setProperty(POLL_OFFSET, String(highest));
    noteHeartbeat();
  }
}

/* Which way is it working right now? */
function deliveryMode(){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { mode:'none', why:'No token yet.' };
  if(pollingOn()) return { mode:'polling',
    why:'Holding a line open to Telegram. Nothing public is needed, and replies usually '+
        'come back within a few seconds.' };
  if(cfg.webhook) return { mode:'webhook',
    why:'Telegram calls your web app the moment you send something. Instant, but the '+
        'deployment must be reachable by Anyone.' };
  return { mode:'none', why:'Not connected either way.' };
}

/* =====================================================================
   49. HOW IT REPLIES
   A correct answer wrapped in waffle is a worse answer. Everything the
   assistant says now passes through here first.
   ===================================================================== */

var WAFFLE = [
  /^(certainly|sure|of course|absolutely|great question)[,!.]?\s*/i,
  /^(i'?d be happy to|i'?m happy to|let me help you with that)[,.]?\s*/i,
  /^(as an ai( language model)?|i am an ai)[,.]?\s*/i,
  /^(based on (the )?(data|information) (provided|given|you shared))[,.]?\s*/i,
  /^(here'?s|here is) (what i found|a summary|the answer)[:.]?\s*/i,
  /^(thank you for|thanks for) (your |the )?(question|asking)[,.]?\s*/i,
  /\b(i hope this helps|hope that helps|let me know if you need anything else|feel free to ask)[!.]?\s*$/i,
  /\b(is there anything else (i can help( you)? with|you'?d like)\??)\s*$/i,
  /^(sure thing|no problem)[,!.]?\s*/i
];

function trimWaffle(text){
  var s=String(text||'').trim();
  var before=s;
  for(var pass=0;pass<3;pass++){
    for(var i=0;i<WAFFLE.length;i++) s=s.replace(WAFFLE[i],'');
    s=s.trim();
    if(s===before) break;
    before=s;
  }
  /* A stripped opener can leave a lowercase start. */
  if(s && /^[a-z]/.test(s)) s=s.charAt(0).toUpperCase()+s.slice(1);
  return s.trim();
}

/* Markdown symbols read badly in Telegram and out loud. */
function plainText(text){
  return String(text||'')
    .replace(/\*\*(.+?)\*\*/g,'$1')
    .replace(/\*(.+?)\*/g,'$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g,'$1')
    .replace(/^#{1,6}\s*/gm,'')
    .replace(/^\s*[-*]\s+/gm,'· ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

/* Is this reply actually any use? */
function replyProblems(text, asked){
  var s=String(text||'').trim();
  var out=[];
  if(!s) { out.push('empty'); return out; }

  if(s.length<3) out.push('too short to mean anything');
  if(/^(how can i help|what would you like|how may i assist)/i.test(s))
    out.push('a generic offer of help instead of an answer');
  if(/\bas an ai\b/i.test(s)) out.push('talks about being an AI');
  if(/\bi (cannot|can'?t) (see|access|read) (your|the) (sheet|data|spreadsheet)\b/i.test(s))
    out.push('claims it cannot see the sheet');
  if(s.length>1400) out.push('far too long');

  /* A question with a number in it deserves a number back. */
  var wantsNumber=/\bhow many\b|\bhow much\b|\bcount\b|\btotal\b/i.test(String(asked||''));
  if(wantsNumber && !/\d/.test(s)) out.push('was asked for a number and gave none');

  var wantsWhich=/\bwhich\b|\bwho\b|\bwhat is the (worst|best|biggest|most)\b/i.test(String(asked||''));
  if(wantsWhich && /\bit depends\b/i.test(s) && s.length<80)
    out.push('dodged a direct question');

  return out;
}

/* The single place every answer passes through. */
function polish(text, asked, forVoice){
  var s=plainText(trimWaffle(text));

  if(forVoice){
    s=s.replace(/https?:\/\/\S+/g,'a link, which is on screen');
    if(s.length>420){
      var cut=s.slice(0,420);
      var stop=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('! '),cut.lastIndexOf('? '));
      s=(stop>180?cut.slice(0,stop+1):cut)+' There is more on screen.';
    }
  }

  var problems=replyProblems(s, asked);
  return { text:s, problems:problems, clean:problems.length===0,
           shortened: String(text||'').length - s.length };
}

/* An answer may CLAIM it did something. Check the trail and correct it if not. */
var ACTION_CLAIMS = [
  { claim:/\b(sent|emailed|e-?mailed|delivered|dispatched)\b/i,
    tools:['email_report','email_team'],
    ifNot:'I did not actually send anything — nothing left the sheet.' },
  { claim:/\b(shared|given access)\b/i, tools:['share_sheet'],
    ifNot:'I did not actually share it.' },
  { claim:/\b(scheduled|set (it )?to run)\b/i, tools:['schedule_job','set_reminder'],
    ifNot:'I did not actually schedule anything.' },
  { claim:/\b(saved|added).{0,20}\b(contact|contacts)\b/i, tools:['add_contacts'],
    ifNot:'I did not actually add anyone to your Contacts tab.' }
];

function checkActionClaims(answer, trail){
  var used={};
  for(var i=0;i<(trail||[]).length;i++){
    var step=trail[i];
    if(!step||!step.tool) continue;
    /* A tool that reported a problem does not count as having done the thing. */
    var r=String(step.result||'');
    var failed=/^(There (is|are) no|No |I could not|Nobody|That did not|Could not|❌)/i.test(r)
      || /\b(no recipients|nobody|not sent|failed)\b/i.test(r);
    if(!failed) used[step.tool]=r;
  }

  var corrections=[];
  for(var c2=0;c2<ACTION_CLAIMS.length;c2++){
    var rule=ACTION_CLAIMS[c2];
    if(!rule.claim.test(String(answer||''))) continue;
    var did=false;
    for(var t=0;t<rule.tools.length;t++) if(used[rule.tools[t]]) did=true;
    if(!did) corrections.push(rule.ifNot);
  }
  return corrections;
}

/* Put the real receipt in front of the user, whatever the model said. */
function withReceipt(answer, trail){
  var wrong=checkActionClaims(answer, trail);
  if(!wrong.length) return String(answer||'');
  return String(answer||'')+'\n\n⚠ '+wrong.join(' ')+
    '\n\nSay "email the team a report" and I will walk you through it properly.';
}

/* When a reply is genuinely poor, say so rather than passing it on. */
function bestEffort(text, asked){
  var p=polish(text, asked);
  if(p.clean || !p.text) return p.text || 'I could not work that out. Try asking it a different way.';

  if(p.problems.indexOf('a generic offer of help instead of an answer')!==-1)
    return p.text+'\n\n(I did not really answer that — try asking it another way, '+
      'or say /sheets to pick a tab first.)';
  if(p.problems.indexOf('was asked for a number and gave none')!==-1)
    return p.text+'\n\n(I could not give you a firm number. Try "count the groups in column B".)';
  return p.text;
}


/* =====================================================================
   50. GO STRAIGHT THERE
   A weak free model asked to pick from sixty-four tools will often pick
   badly. So for the things people actually say, we skip the guessing
   and call the tool directly. No AI decision, no wasted seconds.
   ===================================================================== */

var DIRECT = [
  { test:/\b(draw|make|create|generate)\b.*\b(picture|image|photo|logo|illustration|poster)\b/i,
    tool:'make_picture',
    args:function(t){ return { prompt:strip(t,/\b(draw|make|create|generate)\b\s*(me\s*)?(a|an|the)?\s*(picture|image|photo|logo|illustration|poster)\s*(of|showing|for)?\s*/i) }; },
    say:'Drawing that…' },

  { test:/\b(pivot|pivot table)\b/i, tool:'make_pivot',
    args:function(t,c){ return { row:c.groupCol||'', value:c.idCol||'' }; },
    say:'Building a pivot…' },

  { test:/\b(chart|graph|plot)\b/i, tool:'make_chart',
    args:function(t,c){ return { range:c.range||'', kind:/pie/i.test(t)?'pie':(/line/i.test(t)?'line':'column'),
      title:'Chart' }; },
    say:'Drawing a chart…' },

  { test:/\b(count|breakdown|break ?down)\b.*\b(groups?|branch(es)?|categor(y|ies)|each)\b/i,
    tool:'compare_groups',
    args:function(t,c){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t);
      return { column:m?m[1].toUpperCase():(c.groupCol||'') }; },
    say:'Counting the groups…' },

  { test:/\b(summar|break ?down)\w*\b.*\bcolumn\s+([A-Z])\b/i, tool:'summarise_column',
    args:function(t){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t); return { column:m?m[1].toUpperCase():'F' }; },
    say:'Counting them up…' },

  { test:/\bhow many\b.*\b(groups?|branch(es)?|categor(y|ies)|each)\b/i,
    tool:'compare_groups',
    args:function(t,c){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t);
      return { column:m?m[1].toUpperCase():(c.groupCol||'') }; },
    say:'Counting the groups…' },

  { test:/\b(outlier|unusual|strange|odd|anomal)\w*\b/i, tool:'find_outliers',
    args:function(t,c){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t);
      return { column:m?m[1].toUpperCase():(c.numberCol||'') }; },
    say:'Looking for the unusual…' },

  { test:/\b(trend|over time|getting (better|worse)|rising|falling)\b/i, tool:'find_trend',
    args:function(t,c){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t);
      return { dateColumn:m?m[1].toUpperCase():(c.dateCol||'') }; },
    say:'Looking across the dates…' },

  { test:/\b(write|draft|create|make)\b.*\b(document|doc|report file|word)\b/i, tool:'write_document',
    args:function(t){ return { title:strip(t,/\b(write|draft|create|make)\b\s*(me\s*)?(a|an|the)?\s*(document|doc)\s*(called|titled|about|on)?\s*/i)||'Report' }; },
    say:'Writing it…' },

  { test:/\b(slide|deck|presentation|powerpoint)\b/i, tool:'make_slides',
    args:function(t){ return { title:strip(t,/\b(make|build|create|write)\b\s*(me\s*)?(a|an|the)?\s*(slide ?deck|deck|presentation|slides)\s*(about|on|for)?\s*/i)||'Presentation' }; },
    say:'Building the deck…' },

  { test:/\b(write|generate)\b.*\b(code|script|function|program)\b/i, tool:'write_code',
    args:function(t){ return { request:t,
      language:(/python/i.test(t)?'python':/apps ?script/i.test(t)?'apps script':
                /sql/i.test(t)?'sql':/html/i.test(t)?'html':'javascript') }; },
    say:'Writing the code…' },

  { test:/\b(video|storyboard|script for a video)\b/i, tool:'plan_video',
    args:function(t){ return { topic:strip(t,/\b(plan|make|create|write)\b\s*(me\s*)?(a|an|the)?\s*(video|video plan)\s*(about|on|for)?\s*/i)||'my data' }; },
    say:'Planning the video…' },

  { test:/\b(research|dig into|investigate|look into)\b/i, tool:'swarm_research',
    args:function(t){ return { topic:strip(t,/\b(research|dig into|investigate|look into)\b\s*/i), agents:5 }; },
    say:'Sending the team out — this takes a minute or two…' },

  { test:/\b(news|headlines)\b|\bwhat(?:'s| is| are)?\s+(?:new|happening|the latest)\b/i, tool:'news',
    args:function(t){ var m=/\b(?:about|on|in)\s+(.{3,50})$/i.exec(t.replace(/[?.!]+$/,''));
      return { topic:m?m[1]:'artificial intelligence' }; },
    say:'Fetching the headlines…' },

  { test:/\b(weather)\b/i, tool:'weather',
    args:function(){ return { lat:-1.03, lon:37.07, place:'Thika' }; },
    say:'Checking…' },

  { test:/\b(look ?up|wikipedia|what is a|who is)\b/i, tool:'wikipedia',
    args:function(t){ return { term:strip(t,/\b(look ?up|wikipedia|what is a|what is|who is)\b\s*/i) }; },
    say:'Looking it up…' },

  { test:/\b(brief me|my brief|morning brief)\b/i, tool:'my_brief',
    args:function(){ return {}; }, say:'Pulling it together…' },

  { test:/\b(inbox|unread|my email)\b/i, tool:'inbox_triage',
    args:function(){ return { count:10 }; }, say:'Reading your inbox…' },

  { test:/\b(clean|tidy)\b.*\bcolumn\s+([A-Z])\b/i, tool:'clean_column',
    args:function(t){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t); return { column:m?m[1].toUpperCase():'A' }; },
    say:'Tidying it up…' },

  { test:/\b(duplicate|repeated|same twice)\w*\b/i, tool:'find_duplicates',
    args:function(t,c){ var m=/\bcolumn\s+([A-Z])\b/i.exec(t);
      return { column:m?m[1].toUpperCase():(c.idCol||'A') }; },
    say:'Looking for repeats…' },

  { test:/\b(describe|what'?s in|what is in|show me)\b.*\b(sheet|tab|data)\b/i,
    tool:'describe_sheet', args:function(){ return {}; }, say:'Having a look…' },

  { test:/^(?:add|save)\s+.+[,;].+@.+/i, tool:'add_contacts',
    args:function(t){ return { text:strip(t,/^(?:add|save)\s+/i) }; },
    say:'Adding them…' },

  { test:/\b(undo|take that back|revert)\b/i, tool:'undo_last',
    args:function(){ return {}; }, say:'Putting it back…' }
];

function strip(text, re){
  return String(text||'').replace(re,'').replace(/[?.!]+$/,'').trim();
}

/* Which columns are worth guessing at, if the request did not say? */
function columnHints(){
  try{
    var sh=SH();
    if(!sh) return {};
    var p=profileTab(sh.getName(),200);
    if(!p.ok) return {};
    var out={ range:'' };
    for(var i=0;i<p.columns.length;i++){
      var c=p.columns[i];
      if(!out.groupCol && c.looksCategorical && c.unique>1) out.groupCol=c.name;
      if(!out.idCol && c.looksUnique) out.idCol=c.name;
      if(!out.numberCol && (c.type==='number'||c.type==='money') && !c.looksUnique) out.numberCol=c.letter;
      if(!out.dateCol && c.type==='date') out.dateCol=c.letter;
    }
    out.range='A1:B'+Math.min(p.rows+1,30);
    return out;
  }catch(e){ return {}; }
}

/* Is this something we can just do, without asking the model to choose? */
function directCommand(text){
  var t=String(text||'').trim();
  if(t.length<3) return null;
  var hints=null;
  for(var i=0;i<DIRECT.length;i++){
    if(!DIRECT[i].test.test(t)) continue;
    var tool=TOOLS[DIRECT[i].tool];
    if(!tool) continue;
    if(!hints) hints=columnHints();
    return { tool:DIRECT[i].tool, args:DIRECT[i].args(t,hints), say:DIRECT[i].say };
  }
  return null;
}

function runDirect(text){
  var d=directCommand(text);
  if(!d) return null;
  var t0=Date.now();
  var result;
  try{ result=String(TOOLS[d.tool].run(d.args)); }
  catch(e){ return { ok:false, tool:d.tool, why:'That did not work: '+e.message }; }

  /* A tool can fail politely by returning its reason. Do not dress that up as success. */
  var failed=/^(There is no|No spreadsheet|I could not|That does not|Which column|Column [A-Z] is|Too few|Give me|None of|No data)/i.test(result)
    || /^Column [A-Z] is empty/i.test(result);
  logIt('direct', d.tool);
  return { ok:!failed, tool:d.tool, answer:result, why:failed?result:'', say:d.say,
           seconds:Math.round((Date.now()-t0)/100)/10, direct:true };
}

/* =====================================================================
   51. A SMALLER MENU FOR A SMALLER MODEL
   Showing sixty-four tools to a free model is asking for a bad choice.
   Rank them against the request and show the twenty that could matter.
   ===================================================================== */
var ALWAYS_SHOW=['read_selection','describe_sheet','count_rows','today',
                 'what_to_do','write_cell','undo_last'];

function toolScore(name, words){
  var meta=TOOLS[name];
  if(!meta) return -1;
  var hay=(name+' '+meta.what).toLowerCase().replace(/_/g,' ');
  var score=0;
  for(var i=0;i<words.length;i++){
    var w=words[i];
    if(w.length<3) continue;
    if(hay.indexOf(w)!==-1) score+=3;
    else if(w.length>4 && hay.indexOf(w.slice(0,4))!==-1) score+=1;
  }
  return score;
}

function relevantTools(request, howMany){
  var want=Math.max(8,Math.min(64,Number(howMany)||20));
  var words=String(request||'').toLowerCase().split(/[^a-z]+/);
  var scored=[];
  for(var name in TOOLS) scored.push({ name:name, score:toolScore(name,words) });
  scored.sort(function(a,b){ return b.score-a.score; });

  var picked={}, list=[];
  for(var a=0;a<ALWAYS_SHOW.length;a++)
    if(TOOLS[ALWAYS_SHOW[a]] && !picked[ALWAYS_SHOW[a]]){ picked[ALWAYS_SHOW[a]]=true; list.push(ALWAYS_SHOW[a]); }
  for(var s=0;s<scored.length && list.length<want;s++)
    if(!picked[scored[s].name]){ picked[scored[s].name]=true; list.push(scored[s].name); }

  var lines=[];
  for(var i=0;i<list.length;i++){
    var need=TOOLS[list[i]].need.length?(' — needs: '+TOOLS[list[i]].need.join(', ')):'';
    lines.push(list[i]+' : '+TOOLS[list[i]].what+need);
  }
  return { names:list, menu:lines.join('\n'), of:Object.keys(TOOLS).length };
}

/* A plain list of what it can actually do, with examples. */
function whatCanIDo(){
  return [
    { group:'Your data', examples:[
      'summarise column F','count the groups in column B','find outliers in column D',
      'is the trend getting worse?','find duplicates in column A','clean column D',
      'classify column E into categories' ] },
    { group:'Make things', examples:[
      'draw a picture of a matatu at sunset','make a pivot','draw a pie chart',
      'write a document about our delivery problems','build a six slide deck',
      'write python code to clean a CSV','plan a 45 second video' ] },
    { group:'People and email', examples:[
      'add a contact','email the team a report','what needs my attention in email?',
      'share this sheet with ann@x.com' ] },
    { group:'The outside world', examples:[
      'what is new in AI?','look up retrieval augmented generation',
      'research whether we should open in Nakuru','what is the weather?' ] },
    { group:'Every day', examples:[
      'brief me','what was I doing yesterday?','schedule a morning brief at 7',
      'how many rows do I have?','undo that' ] }
  ];
}

function capabilitiesText(){
  return whatCanIDo().map(function(g){
    return g.group.toUpperCase()+'\n'+g.examples.map(function(e){ return '· '+e; }).join('\n');
  }).join('\n\n');
}


/* =====================================================================
   52. FIX IT FOR ME
   Too many moving parts: the token, the chat id, the deployment, the
   webhook, the trigger, and whether the trigger has ever actually been
   allowed to run. This works through them in order and fixes what it can.
   ===================================================================== */

var HEARTBEAT='AI_TG_HEARTBEAT';

function noteHeartbeat(){
  PropertiesService.getScriptProperties().setProperty(HEARTBEAT, String(Date.now()));
}
function heartbeatAge(){
  var v=Number(PropertiesService.getScriptProperties().getProperty(HEARTBEAT))||0;
  if(!v) return -1;
  return Math.round((Date.now()-v)/1000);
}

/* Prove a message can actually reach the phone. */
function telegramSelfTest(){
  var cfg=readJson(TG,{});
  if(!cfg.token) return { ok:false, step:'token', why:'No bot token saved.' };
  if(!cfg.chat)  return { ok:false, step:'chat',  why:'No chat id yet — message your bot once.' };

  var stamp=Utilities.formatDate(new Date(),
    (function(){ try{ return Session.getScriptTimeZone(); }catch(e){ return 'Africa/Nairobi'; } }()),
    'HH:mm:ss');
  var r=tgSend('🔎 Self-test at '+stamp+' — if you can read this, sending works.', cfg.chat);
  if(!r.ok) return { ok:false, step:'send', why:r.why };
  return { ok:true, step:'send', say:'Sent. If that arrived, the bot can reach you — '+
    'the only question left is whether YOUR messages reach IT.' };
}

/* The whole chain, in order, fixing what it can. */
function fixTelegram(webAppUrl){
  var steps=[], cfg=readJson(TG,{});

  /* 1 — the token */
  if(!cfg.token) return { ok:false, steps:steps,
    why:'No bot token yet. Message @BotFather, send /newbot, and paste the token in the box above.' };
  var s=telegramStatus();
  if(!s.botName) return { ok:false, steps:steps,
    why:'Telegram rejected that token. Get a fresh one from @BotFather.' };
  steps.push('Token works — '+s.botName);

  /* 2 — the chat id */
  if(!cfg.chat){
    var found=telegramFindChat();
    if(!found.ok) return { ok:false, steps:steps,
      why:'Message your bot once in Telegram, then press this again. I need to see a message '+
          'from you before I can reply to you.' };
    steps.push('Found your chat ('+found.chat+')');
    cfg=readJson(TG,{});
  } else steps.push('Chat id known ('+cfg.chat+')');

  /* 3 — can it reach you at all? */
  var out=telegramSelfTest();
  if(!out.ok) return { ok:false, steps:steps, why:'I cannot send to you: '+out.why };
  steps.push('Sending works — check your phone');

  /* 4 — can your messages reach it? */
  var url=String(webAppUrl||'').trim() || s.webApp || readJson(WEBAPP,{}).url || '';
  var webhookWorks=false;

  if(url && url.indexOf('/exec')!==-1){
    var check=checkWebApp(url);
    if(check.ok){
      var setw=telegramSetWebhook(url);
      if(setw.ok){
        webhookWorks=true;
        disablePolling();
        writeJson(WEBAPP,{ url:url });
        steps.push('Webhook connected — replies will be instant');
      } else steps.push('Telegram refused the webhook: '+setw.why);
    } else {
      steps.push('Your web app turned Telegram away'+(check.code?(' ('+check.code+')'):'')+
        ' — that is a deployment setting, not something I can change');
    }
  } else {
    steps.push('No usable web app link');
  }

  /* 5 — fall back to fetching, which needs nothing public */
  if(!webhookWorks){
    var poll=enablePolling();
    if(!poll.ok) return { ok:false, steps:steps, why:'And I could not switch to checking either: '+poll.why };
    steps.push('Switched to checking every minute instead');

    /* A trigger that has never been allowed to run is a silent failure.
       Run it once here, which both proves it and records a heartbeat. */
    try{ pollTelegram(); noteHeartbeat(); steps.push('Ran the check once to prove it works'); }
    catch(e){ return { ok:false, steps:steps,
      why:'The check could not run: '+e.message+'\n\nOpen the Apps Script editor, choose '+
          'pollTelegram from the dropdown and press Run once, to approve it.' }; }
  }

  logIt('telegram','Ran the full fix');
  return { ok:true, steps:steps, mode:webhookWorks?'webhook':'polling',
    say: webhookWorks
      ? 'Done. Message your bot — it should reply within seconds.'
      : 'Done. Message your bot — the reply will arrive within a minute.\n\n'+
        'If nothing comes back at all, open the Apps Script editor, pick pollTelegram '+
        'from the function dropdown and press Run once. That approves the timer.' };
}

/* Is the every-minute check actually running? */
function pollHealth(){
  if(!pollingOn()) return { ok:false, running:false, why:'Checking every minute is not switched on.' };
  var age=heartbeatAge();
  if(age<0) return { ok:false, running:false,
    why:'The timer is set but has never run. Open the Apps Script editor, choose '+
        'pollTelegram from the dropdown and press Run once to approve it.' };
  if(age>240) return { ok:false, running:false, age:age,
    why:'The timer last ran '+Math.round(age/60)+' minutes ago, so it has stalled. '+
        'Run pollTelegram once from the editor to restart it.' };
  return { ok:true, running:true, age:age,
    say:'Checking every minute — last ran '+age+' seconds ago.' };
}

/* offline testing only */
if(typeof module!=='undefined'){ module.exports={ BOOK,TOOLS,detectProvider,providerChoices,
  chatUrl,modelsUrl,baseFor,newKeyId,splitAccountKey,identifyKey,scoreModel,pickBestModel,fetchModelList,discoverModel,healAllKeys,
  addKey,reidentifyKey,removeKey,toggleKey,setKeyModel,badModels,markBadModel,clearBadModels,fetchModelList,loadKeys,storeKeys,listKeysForUI,buildRequest,readReply,
  diagnose,errorMessage,isModelComplaint,isBillingComplaint,keyReport,callAI,tryOnce,ASK,testAllKeys,getProfile,saveProfile,buildGreeting,remember,recall,
  ensureContactsSheet,readContacts,parseContactBlob,addContactsFromText,deleteContactRow,
  recipients,normalisePhone,validEmail,stampContacted,
  selectionAsTable,rangeAsTable,askSelection,writeBelowSelection,fillColumn,buildSummary,buildPivot,
  sendReport,whatsappLinks,emailQuotaLeft,gmailUnread,triageInbox,draftReply,inboxToSheet,
  saveTelegram,telegramConfig,telegramSend,telegramFindChat,telegramSetWebhook,doPost,
  stripHtml,readWebPage,toolMenu,runAgent,parseMove,rightNow,snapshot,undoLast,generateData,enrichBatch,cleanColumn,splitColumn,findDuplicates,makeChart,writeFormula,sortRange,
  setDailyReminder,clearReminders,listReminders,scheduledBrief,restKey,isResting,
  httpGet,parseFeed,readFeed,newsSearch,hnSearch,redditFeed,wikiSummary,weatherFor,exchangeRate,
  importTable,feedToSheet,
  DEFAULT_PROMPTS,ensurePromptSheet,allPrompts,getPrompt,savePrompt,inventPrompt,improvePrompt,resetPrompt,
  ensureLogSheet,logIt,readJournal,daysAgoKey,whatWasIDoing,myDay,nextFreeSlot,personalBrief,spokenGreeting,
  swarm,keyForWorker,JOBS,listJobs,addJob,removeJob,removeAllJobs,morningBrief,watchSheet,
  shareWith,shareLink,
  visionKey,buildVisionRequest,askImage,readImageUrl,readImageFromDrive,imageToTable,
  ensureChatSheet,sessionId,saveTurn,chatHistory,clearHistory,recentThread,
  ensureConnectorSheet,listConnectors,addConnector,removeConnector,callConnector,connectorMenu,
  openBig,openHuge,runAgentTimed,
  getVoiceSettings,saveVoiceSettings,saveWebAppUrl,speakableAnswer,talkTo,
  makeImage,imageIntoSheet,imageToDrive,makeDoc,docToPdf,sheetToPdf,makeSlides,
  writeCodeFile,makeVideoPlan,
  SS,SH,RG,rememberSheet,getWorkset,setWorkset,worksetInfo,
  claimOnce,looksLikeARepeat,simpleHash,sendOnce,clearBacklog,
  tgTyping,THINKING,thinkingLine,ACTION_CLAIMS,checkActionClaims,withReceipt,
  nextButtons,
  tgSend,tgAck,menuMain,menuTabs,describeTab,actionRequest,handleTap,replyButtons,
  DIRECT,strip,columnHints,directCommand,runDirect,toolScore,relevantTools,
  whatCanIDo,capabilitiesText,
  noteHeartbeat,heartbeatAge,telegramSelfTest,fixTelegram,pollHealth,
  pollingOn,enablePolling,disablePolling,pollTelegram,deliveryMode,
  WAFFLE,trimWaffle,plainText,replyProblems,polish,bestEffort,
  FLOWS,detectIntent,flowState,setFlowState,startFlow,continueFlow,cancelFlow,fastAnswer,
  claimsIn,checkClaims,askAndVerify,numbersFrom,quantile,findOutliers,compareGroups,
  trendOver,crossTabs,
  RISKY,isRisky,riskNote,riskyList,estimateWork,describeWork,proposeAction,confirmAction,
  cancelAction,listPending,ensureFeedbackSheet,recordFeedback,feedbackSummary,
  learnFromFeedback,satisfactionCheck,
  SIGNUP,keyWizard,bulkAddKeys,keyHealthLine,guessType,profileTab,profileNotes,whatToDoWith,
  isInternalTab,checkWebApp,telegramDiagnose,sheetBriefing,sheetFacts,readWhen,
  telegramStatus,connectTelegram,disconnectTelegram,telegramSay,telegramConversation,
  compareModels,ensureFlowSheet,listWorkflows,saveWorkflow,deleteWorkflow,runWorkflow,
  workflowFromHistory,TEMPLATES,templates,dashboard,suggestNext }; }