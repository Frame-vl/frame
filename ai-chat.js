'use strict';

// FRAME 2.7.7 AI Chat.
const FRAME_CHAT_KEY='frameAiChatV270';
const FRAME_CHAT_PENDING_KEY='frameAiPendingV270';
const FRAME_CHAT_TOPIC_KEY='frameAiTopicV270';
const FRAME_CHAT_LIMIT=100;
const FRAME_TEST_TRANSCRIPT_KEY='frameAiTestTranscriptV277';
const FRAME_TEST_TRANSCRIPT_FORMAT='FRAME_TEST_TRANSCRIPT';
const FRAME_TEST_TRANSCRIPT_SCHEMA=1;
const FRAME_TEST_TRANSCRIPT_DAYS=7;
const FRAME_TEST_TEXT_LIMIT=12000;
const FRAME_TEST_PAGE_ID=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
let frameVoiceWanted=false,frameComposerWakeWanted=false,frameVoiceRestartTimer=null,frameComposerWakeTimer=null,frameVoiceBase='',frameVoiceWakeLock=null,frameWakeAcquirePromise=null,frameVoiceSession=0,frameThinking=false,frameApplyingDraftId='';
const frameSessionMessageIds=new Set();
let frameChatSession=[],framePendingSession=null,frameTopicSession='';

function frameRetireLegacyAiChatStorage(){for(const key of [FRAME_CHAT_KEY,FRAME_CHAT_PENDING_KEY,FRAME_CHAT_TOPIC_KEY]){try{if(typeof storageRemove==='function')storageRemove(key);else localStorage.removeItem(key)}catch(e){}}}
frameRetireLegacyAiChatStorage();
function frameTestString(value,limit=256){return String(value??'').slice(0,limit)}
function frameTestNumber(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:undefined}
function frameTestActionProjection(action){
  const source=action&&typeof action==='object'?action:{},out={};
  for(const key of ['type','object_id','order_id','work_id','address','customer','order_title','work_name','unit','note'])if(source[key]!==undefined)out[key]=frameTestString(source[key],key==='note'?2000:500);
  for(const key of ['qty','price','amount','progress_pct']){const n=frameTestNumber(source[key]);if(n!==undefined)out[key]=n}
  return out;
}
function frameTestDailyLimitsProjection(value){
  const source=value&&typeof value==='object'?value:{},out={};
  for(const key of ['date','utc_offset','hard_stop_reason'])if(source[key]!==undefined)out[key]=frameTestString(source[key],128);
  for(const key of ['spent_usd','reserved_usd','remaining_usd','budget_usd','calls_used','calls_remaining','call_cap']){const n=frameTestNumber(source[key]);if(n!==undefined)out[key]=n}
  return out;
}
function frameBuildTestTrace(draft,response,roundTripMs,errorCode=''){
  const d=draft&&typeof draft==='object'?draft:{},meta=response?.meta&&typeof response.meta==='object'?response.meta:{},result=response?.result&&typeof response.result==='object'?response.result:{},actions=Array.isArray(result.actions)?result.actions:(Array.isArray(d.actions)?d.actions:[]),trace={
    provider:frameTestString(meta.provider??d.provider,128),model:frameTestString(meta.model??d.model,128),mode:frameTestString(meta.mode??d.mode,64),
    outcome:d.blocked?'blocked':d.clarification?'clarification':d.ok?(actions.length?'proposed':'answer'):'error',
    target_key:frameTestString(d.targetKey,256),target_label:frameTestString(d.targetLabel,1000),
    proposed_actions:actions.map(frameTestActionProjection).filter(x=>x.type).slice(0,30),
    policy_blocked_actions:(Array.isArray(meta.policy_blocked_actions)?meta.policy_blocked_actions:(d.policyBlockedActions||[])).map(x=>frameTestString(x,128)).slice(0,30)
  };
  const numeric={round_trip_ms:roundTripMs,provider_duration_ms:meta.duration_ms,input_tokens:meta.input_tokens,output_tokens:meta.output_tokens,estimated_usd:meta.estimated_usd,confidence:result.confidence??d.confidence};
  for(const [key,value] of Object.entries(numeric)){const n=frameTestNumber(value);if(n!==undefined)trace[key]=n}
  const limits=frameTestDailyLimitsProjection(meta.daily_limits);if(Object.keys(limits).length)trace.daily_limits=limits;
  if(meta.fallback_from)trace.fallback_from=frameTestString(meta.fallback_from,128);
  if(meta.limit_reason)trace.limit_reason=frameTestString(meta.limit_reason,128);
  if(errorCode)trace.error_code=frameTestString(errorCode,128);
  return trace;
}
function frameTestTraceProjection(value){
  const source=value&&typeof value==='object'?value:{},trace={
    provider:frameTestString(source.provider,128),model:frameTestString(source.model,128),mode:frameTestString(source.mode,64),outcome:frameTestString(source.outcome,64),
    target_key:frameTestString(source.target_key,256),target_label:frameTestString(source.target_label,1000),
    proposed_actions:(Array.isArray(source.proposed_actions)?source.proposed_actions:[]).map(frameTestActionProjection).filter(x=>x.type).slice(0,30),
    policy_blocked_actions:(Array.isArray(source.policy_blocked_actions)?source.policy_blocked_actions:[]).map(x=>frameTestString(x,128)).slice(0,30)
  };
  for(const key of ['round_trip_ms','provider_duration_ms','input_tokens','output_tokens','estimated_usd','confidence']){const n=frameTestNumber(source[key]);if(n!==undefined)trace[key]=n}
  const limits=frameTestDailyLimitsProjection(source.daily_limits);if(Object.keys(limits).length)trace.daily_limits=limits;
  for(const key of ['fallback_from','limit_reason','error_code'])if(source[key])trace[key]=frameTestString(source[key],128);
  return trace;
}
function frameTestMessageProjection(message,{expirePending=false}={}){
  if(!message||typeof message!=='object')return null;
  const role=message.role==='user'?'user':message.role==='assistant'?'assistant':'';if(!role)return null;
  const allowed=new Set(['done','pending','applied','cancelled','expired','error']),status=allowed.has(String(message.status||''))?String(message.status):'done';
  const item={id:frameTestString(message.id,128),turn_id:frameTestString(message.turnId??message.turn_id,128),at:frameTestString(message.at,64),role,text:frameTestString(message.text,FRAME_TEST_TEXT_LIMIT),status:expirePending&&status==='pending'?'expired':status};
  const trace=frameTestTraceProjection(message.trace);if(Object.values(trace).some(v=>Array.isArray(v)?v.length:typeof v==='object'?Object.keys(v).length:String(v||'').length))item.trace=trace;
  return item;
}
function frameTestTranscriptRead(){
  let raw;try{raw=JSON.parse(storageGet(FRAME_TEST_TRANSCRIPT_KEY,'')||'null')}catch(e){storageRemove(FRAME_TEST_TRANSCRIPT_KEY);return null}
  if(!raw||raw.format!==FRAME_TEST_TRANSCRIPT_FORMAT||raw.schema_version!==FRAME_TEST_TRANSCRIPT_SCHEMA){if(raw)storageRemove(FRAME_TEST_TRANSCRIPT_KEY);return null}
  const expires=Date.parse(String(raw.expires_at||''));if(Number.isFinite(expires)&&Date.now()>expires){storageRemove(FRAME_TEST_TRANSCRIPT_KEY);return null}
  const stalePage=!!raw.page_id&&raw.page_id!==FRAME_TEST_PAGE_ID;
  return {format:FRAME_TEST_TRANSCRIPT_FORMAT,schema_version:FRAME_TEST_TRANSCRIPT_SCHEMA,app_version:frameTestString(raw.app_version,32),session_id:frameTestString(raw.session_id,128),page_id:FRAME_TEST_PAGE_ID,started_at:frameTestString(raw.started_at,64),updated_at:frameTestString(raw.updated_at,64),expires_at:frameTestString(raw.expires_at,64),active:raw.active===true,topic_key:frameTestString(raw.topic_key,256),topic_label:frameTestString(raw.topic_label,1000),messages:(Array.isArray(raw.messages)?raw.messages:[]).map(x=>frameTestMessageProjection(x,{expirePending:stalePage})).filter(Boolean).slice(-FRAME_CHAT_LIMIT)};
}
function frameTestTranscriptWrite(data){
  if(!data)return;const updated=new Date(),clean={...data,format:FRAME_TEST_TRANSCRIPT_FORMAT,schema_version:FRAME_TEST_TRANSCRIPT_SCHEMA,app_version:typeof VERSION==='string'?VERSION:'',page_id:FRAME_TEST_PAGE_ID,updated_at:updated.toISOString(),expires_at:new Date(updated.getTime()+FRAME_TEST_TRANSCRIPT_DAYS*86400000).toISOString(),messages:(data.messages||[]).map(frameTestMessageProjection).filter(Boolean).slice(-FRAME_CHAT_LIMIT)};
  storageSet(FRAME_TEST_TRANSCRIPT_KEY,JSON.stringify(clean));
}
function frameTestTranscriptActive(){return frameTestTranscriptRead()?.active===true}
function frameTestTranscriptSync(message){
  const data=frameTestTranscriptRead();if(!data?.active)return;const clean=frameTestMessageProjection(message);if(!clean)return;
  const index=data.messages.findIndex(x=>x.id===clean.id);if(index>=0)data.messages[index]=clean;else data.messages.push(clean);
  data.topic_key=frameTestString(frameTopicSession,256);data.topic_label=frameTestString(frameTopicLabel(),1000);frameTestTranscriptWrite(data);
}
function frameStartTestTranscript(){
  let data=frameTestTranscriptRead();const stamp=new Date().toISOString();
  if(!data)data={format:FRAME_TEST_TRANSCRIPT_FORMAT,schema_version:FRAME_TEST_TRANSCRIPT_SCHEMA,app_version:typeof VERSION==='string'?VERSION:'',session_id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():uid(),page_id:FRAME_TEST_PAGE_ID,started_at:stamp,updated_at:stamp,expires_at:stamp,active:true,topic_key:'',topic_label:'',messages:[]};
  data.active=true;data.topic_key=frameTestString(frameTopicSession,256);data.topic_label=frameTestString(frameTopicLabel(),1000);
  for(const message of frameChatMessages()){const clean=frameTestMessageProjection(message);if(!clean)continue;const index=data.messages.findIndex(x=>x.id===clean.id);if(index>=0)data.messages[index]=clean;else data.messages.push(clean)}
  frameTestTranscriptWrite(data);frameUpdateTestButton();toast('Запись тестового диалога включена');
}
function frameStopTestTranscript(){const data=frameTestTranscriptRead();if(!data)return;data.active=false;frameTestTranscriptWrite(data);frameUpdateTestButton();toast('Запись остановлена')}
function frameClearTestTranscript(){storageRemove(FRAME_TEST_TRANSCRIPT_KEY);frameUpdateTestButton();toast('Тестовый диалог удалён')}
function frameTranscriptPayload(){
  const stored=frameTestTranscriptRead(),messages=stored?.messages?.length?stored.messages:frameChatMessages().map(frameTestMessageProjection).filter(Boolean);
  return {format:FRAME_TEST_TRANSCRIPT_FORMAT,schema_version:FRAME_TEST_TRANSCRIPT_SCHEMA,app_version:typeof VERSION==='string'?VERSION:'',exported_at:new Date().toISOString(),session_id:stored?.session_id||'',recording_started_at:stored?.started_at||'',recording_active:stored?.active===true,topic_key:stored?.topic_key||frameTestString(frameTopicSession,256),topic_label:stored?.topic_label||frameTestString(frameTopicLabel(),1000),message_count:messages.length,messages};
}
async function frameExportTestTranscript(){
  const payload=frameTranscriptPayload();if(!payload.messages.length)return toast('Диалог пока пуст');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,13),name=`FRAME-test-dialog-${stamp}.json`,text=JSON.stringify(payload,null,2),file=typeof File==='function'?new File([text],name,{type:'application/json'}):null;
  try{if(file&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'Тестовый диалог FRAME',files:[file]});toast('Диалог передан');return}}catch(e){if(e?.name==='AbortError')return}
  const blob=file||new Blob([text],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Файл диалога подготовлен');
}
function frameUpdateTestButton(){const button=$('frameTestBtn'),active=frameTestTranscriptActive();if(button){button.classList.toggle('active',active);button.innerHTML=`<i></i>${active?'ЗАПИСЬ':'ТЕСТ'}`;button.setAttribute('aria-label',active?'Запись тестового диалога включена':'Открыть тестовый журнал')}}
function frameShowTestTranscript(){
  const data=frameTestTranscriptRead(),count=data?.messages?.length||frameChatMessages().length,active=data?.active===true;
  openSheet(`<div class="sectionTitle"><div><h1>Тестовый диалог</h1><p class="help compact">${active?'Запись включена.':data?'Запись остановлена.':'Запись ещё не включена.'} Сохраняются до 100 сообщений только на этом устройстве и удаляются через 7 дней.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="frameTestSummary">Записано сообщений: <strong>${count}</strong></div><div class="frameTestActions">${active?'<button id="frameExportTestBtn" class="btn primary">Поделиться файлом</button><button id="frameStopTestBtn" class="btn ghost">Остановить запись</button>':`<button id="frameStartTestBtn" class="btn primary">${data?'Продолжить запись':'Начать запись'}</button>${count?'<button id="frameExportTestBtn" class="btn ghost">Поделиться текущим файлом</button>':''}`} ${data?'<button id="frameClearTestBtn" class="btn ghost dangerText">Удалить тестовый диалог</button>':''}</div><p class="help compact">В файл попадут сообщения, модель, задержка, стоимость и статусы предложенных действий. Токен и адрес сервера не сохраняются.</p>`);
  if($('frameStartTestBtn'))$('frameStartTestBtn').onclick=()=>{frameStartTestTranscript();if(typeof closeSheet==='function')closeSheet()};
  if($('frameExportTestBtn'))$('frameExportTestBtn').onclick=frameExportTestTranscript;
  if($('frameStopTestBtn'))$('frameStopTestBtn').onclick=()=>{frameStopTestTranscript();if(typeof closeSheet==='function')closeSheet()};
  if($('frameClearTestBtn'))$('frameClearTestBtn').onclick=()=>{if(confirm('Удалить записанный тестовый диалог?')){frameClearTestTranscript();if(typeof closeSheet==='function')closeSheet()}};
}
frameTestTranscriptRead();
function frameChatMessages(){return frameChatSession.slice()}
function frameProviderChatMessages(){return frameChatMessages().filter(x=>frameSessionMessageIds.has(String(x?.id||'')))}
function frameSaveChat(items){frameChatSession=(items||[]).slice(-FRAME_CHAT_LIMIT)}
function frameAddChat(message){const items=frameChatMessages(),item={id:uid(),at:now(),role:'assistant',status:'done',...message};frameSessionMessageIds.add(String(item.id));items.push(item);frameSaveChat(items);frameTestTranscriptSync(item);return item}
function frameUpdateChat(id,patch){const items=frameChatMessages(),i=items.findIndex(x=>x.id===id);if(i<0)return null;items[i]={...items[i],...patch};frameSaveChat(items);frameTestTranscriptSync(items[i]);return items[i]}
function frameSavePending(draft){framePendingSession=draft||null}
function frameDraftPolicyError(d){try{const error=typeof aiFieldSafeDraftError==='function'?String(aiFieldSafeDraftError(d)||''):'';if(error)return error;if(aiEffectiveMode(d?.mode)==='field_safe'&&Array.isArray(d.actions)&&d.actions.length&&!String(d.targetLabel||'').trim())return 'FRAME заблокировал старый план без зафиксированной цели. Ничего не применено.';return ''}catch(e){return 'FRAME не смог проверить безопасность плана. Ничего не применено.'}}
function frameRestorePending(){if(aiDraft?.ok){if(!frameDraftPolicyError(aiDraft))return aiDraft;aiDraft=null;frameClearPending()}const d=framePendingSession;if(d?.ok){if(frameDraftPolicyError(d)){frameClearPending();return null}aiDraft=d;return d}return null}
function frameClearPending(){framePendingSession=null}
function frameChatTime(v){try{return new Date(v).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function frameTopic(){return frameTopicSession}
function frameSetTopic(key=''){if(key&&aiTargetByKey(key)){frameTopicSession=key;routeState.aiTarget=key;const data=frameTestTranscriptRead();if(data?.active){data.topic_key=frameTestString(key,256);data.topic_label=frameTestString(frameTopicLabel(),1000);frameTestTranscriptWrite(data)}}}
const FRAME_TARGET_GENERIC=new Set(['монтаж','работа','работы','работам','готова','готов','поставь','поставить','процент','процентов']);
function frameWorkTargetScore(order,text=''){const tokens=aiTokens(text).filter(x=>x.length>=4&&!FRAME_TARGET_GENERIC.has(x));let best=0;for(const row of order?.works||[]){const name=aiNorm(row.name),nameTokens=aiTokens(name);let score=0;for(const token of tokens){if(name.includes(token))score+=3;else if(nameTokens.some(x=>x.startsWith(token)||token.startsWith(x)))score+=2}best=Math.max(best,score)}return best}
function frameDetectTarget(text=''){const norm=aiNorm(text),tokens=aiTokens(norm),addingWork=/(?:добавь|добавить|допработ|новая\\s+работа)/.test(norm);let best='',bestScore=0,tied=false;for(const x of aiAllTargets()){const hay=aiNorm(`${x.object.contact.address} ${x.object.contact.name} ${x.order.title}`);let score=0;for(const token of tokens){if(token.length>=4&&hay.includes(token))score+=2}for(const p of aiNorm(x.object.contact.address).split(' ')){const s=aiStem(p);if(s.length>=5&&norm.includes(s))score+=4}if(!addingWork)score+=frameWorkTargetScore(x.order,norm);if(score>bestScore){bestScore=score;best=x.key;tied=false}else if(score===bestScore&&score>0&&best!==x.key)tied=true}return bestScore>=3&&!tied?best:''}
function frameTopicLabel(){const t=aiTargetByKey(frameTopic());return t?(t.object.contact.address||t.order.title||''):''}
function frameTargetLabel(key=''){const t=aiTargetByKey(String(key||''));if(!t)return '';return [t.object?.contact?.address,t.order?.title].map(x=>String(x||'').trim()).filter(Boolean).join(' · ')}
function frameAttachTargetSnapshot(d){if(d?.ok&&aiEffectiveMode(d.mode)==='field_safe'&&Array.isArray(d.actions)&&d.actions.length)d.targetLabel=frameTargetLabel(d.targetKey);return d}
function framePlanHtml(d){if(!d?.actions?.length)return '';const target=aiEffectiveMode(d.mode)==='field_safe'&&d.targetLabel?`<div class="frameChatPlanRow frameChatPlanTarget"><span>Объект: <strong>${esc(d.targetLabel)}</strong></span></div>`:'';return `<div class="frameChatPlan">${target}${d.actions.map(a=>`<div class="frameChatPlanRow"><span>${esc(aiBrainActionSummary(a))}</span></div>`).join('')}</div>`}
function framePendingControls(m){return `<div class="frameChatActions"><button class="btn primary" data-chat-apply="${esc(m.id)}">Применить</button><button class="btn ghost" data-chat-cancel="${esc(m.id)}">Отмена</button></div>`}
function frameThinkingHtml(){return frameThinking?`<article class="frameChatMessage fromFrame frameThinking"><div class="frameChatBubble"><div class="frameThinkingRow"><span>FRAME думает</span><i></i><i></i><i></i></div></div></article>`:''}
function frameChatHtml(){const items=frameChatMessages();const body=!items.length?`<div class="frameChatWelcome"><span class="frameChatOrb">✦</span><div><strong>FRAME</strong><p>Скажите, что произошло. Я сама найду объект и продолжу разговор в его контексте.</p></div></div>`:items.map(m=>{const p=m.role==='assistant'&&m.status==='pending'&&m.draft,s=m.status==='applied'?'✓ Применено':m.status==='cancelled'?'Отменено':'';return `<article class="frameChatMessage ${m.role==='user'?'fromUser':'fromFrame'} ${p?'hasPlan':''}"><div class="frameChatBubble"><small class="frameChatTime">${esc(frameChatTime(m.at))}</small><div class="frameChatText">${esc(m.text||'')}</div>${p?framePlanHtml(m.draft):''}${p?framePendingControls(m):''}${s?`<div class="frameChatStatus ${m.status}">${s}${m.status==='applied'?` <button type="button" data-chat-undo>Отменить</button>`:''}</div>`:''}</div></article>`}).join('');return body+frameThinkingHtml()}
function frameScrollChat(){requestAnimationFrame(()=>{const x=$('frameChatFeed');if(x)x.scrollTop=x.scrollHeight})}
function frameRefreshChat(){const f=$('frameChatFeed');if(f)f.innerHTML=frameChatHtml();frameBindChatActions();frameScrollChat()}
function frameCancelPending(id=''){const d=frameRestorePending();if(d)aiRevokeDraftAuthorization(d);if(id)frameUpdateChat(id,{status:'cancelled',draft:null});else if(d?.chatId)frameUpdateChat(d.chatId,{status:'cancelled',draft:null});aiDraft=null;frameClearPending();frameRefreshChat()}
function frameBindChatActions(){$$('[data-chat-apply]').forEach(b=>{const d=frameRestorePending();if(!d||d.chatId!==b.dataset.chatApply||!aiBindDisplayedDraftApply(b,d,async authorization=>{if(frameApplyingDraftId)return toast('FRAME уже применяет этот план');frameApplyingDraftId=d.chatId;b.disabled=true;$$('[data-chat-cancel]').forEach(x=>x.disabled=true);try{aiDraft=d;await applyAiDraft(authorization)}finally{frameApplyingDraftId=''}})){b.disabled=true;b.title='Этот план уже не активен'}});$$('[data-chat-cancel]').forEach(b=>b.onclick=()=>frameCancelPending(b.dataset.chatCancel));$$('[data-chat-undo]').forEach(b=>b.onclick=undoLastAiAction)}

const frameCoreContextPayload=aiContextPayload;
aiContextPayload=function(){const topic=frameTopic();if(topic)routeState.aiTarget=topic;const base=frameCoreContextPayload();const conversation=frameProviderChatMessages().slice(-24).map(m=>({role:m.role==='user'?'user':'assistant',content:String(m.text||''),status:m.status||'done'}));return {...base,current_target:topic||'',conversation_target:frameTopicLabel(),conversation,conversation_rules:['The conversation_target is locked until the user explicitly names another object.','Pronouns like this object, here, these works and considering the above always refer to conversation_target.','Recent user facts in conversation are newer than stored progress until actions are applied.','Never switch to another object/order merely because it exists in context.']}}

checkAiBrain=async function({toastResult=true}={}){const base=aiServerUrl(),token=aiServerToken(),current=()=>base===aiServerUrl()&&token===aiServerToken();if(!base){aiRecordAuthenticatedHealth('',{url:base,authenticated:false});aiBrainStatus={ok:false,message:'Адрес не задан'};return aiBrainStatus}try{const d=await aiBrainFetch('/health',{method:'GET'},{base,token});if(!current())return aiBrainStatus||{ok:false,message:'Настройки AI Brain изменились'};const healthMode=String(d.mode||d.detail?.mode||''),fieldVerified=aiRecordAuthenticatedHealth(healthMode,{url:base,authenticated:!!token&&!!d.ok}),ok=!!d.ok&&(!aiConfiguredFieldSafe(base)||fieldVerified);aiBrainStatus={ok,provider:d.provider||'',model:d.model||'',mode:healthMode,detail:d.detail||{},message:ok?'Готов к работе':aiConfiguredFieldSafe(base)?'Безопасный режим сервера не подтверждён':'AI Brain пока не готов'};if(toastResult)toast(ok?'FRAME на связи':aiBrainStatus.message);return aiBrainStatus}catch(e){if(!current())return aiBrainStatus||{ok:false,message:'Настройки AI Brain изменились'};aiRecordAuthenticatedHealth('',{url:base,authenticated:false});aiBrainStatus={ok:false,message:String(e?.message||e)};if(toastResult)toast('FRAME не может связаться с AI Brain');return aiBrainStatus}finally{if(route==='ai')requestAnimationFrame(frameRenderConnectionDot)}};
function frameRenderConnectionDot(){const d=$('frameConnectionDot');if(d)d.className=`frameConnectionDot ${aiBrainStatus?.ok?'ok':aiBrainStatus?'bad':'wait'}`}
renderAiView=function(){frameRestorePending();const mic=!!(window.SpeechRecognition||window.webkitSpeechRecognition),recording=frameTestTranscriptActive();return `<section class="frameChatView"><header class="frameChatTop"><button class="frameChatBack" type="button" data-go="dashboard" aria-label="Назад">‹</button><div class="frameChatTitle">FRAME <i id="frameConnectionDot" class="frameConnectionDot ${aiBrainStatus?.ok?'ok':aiBrainStatus?'bad':'wait'}"></i></div><button id="frameTestBtn" class="frameTestButton ${recording?'active':''}" type="button" aria-label="${recording?'Запись тестового диалога включена':'Открыть тестовый журнал'}"><i></i>${recording?'ЗАПИСЬ':'ТЕСТ'}</button></header><main id="frameChatFeed" class="frameChatFeed">${frameChatHtml()}</main><footer class="frameChatComposer"><button id="frameAttachBtn" class="frameComposerIcon" type="button">＋</button><textarea id="aiCommandInput" rows="1" placeholder="Сообщение FRAME"></textarea><button id="aiMicBtn" class="frameComposerIcon mic" type="button" ${mic?'':'disabled'}>🎙️</button><button id="aiAnalyzeBtn" class="frameSendBtn" type="button">↑</button></footer></section>`}
function frameAutoGrowInput(){const i=$('aiCommandInput');if(i){i.style.height='auto';i.style.height=Math.min(132,i.scrollHeight)+'px'}}
function frameShowAttachMenu(){openSheet(`<div class="sectionTitle"><div><h1>Добавить</h1><p class="help compact">Фото, чек и файлы подключим здесь.</p></div><button class="sheetCloseIcon" data-close-sheet>×</button></div>`)}

function frameHardClearComposer(){frameVoiceBase='';const i=$('aiCommandInput');if(i){i.value='';i.style.height='auto'}}
analyzeAiInput=async function(){const input=$('aiCommandInput'),text=String(input?.value||'').trim();if(!text)return toast('Сначала скажите или напишите сообщение');frameStopVoice(false);frameVoiceSession++;frameHardClearComposer();const detected=frameDetectTarget(text);if(detected)frameSetTopic(detected);else if(frameTopic())routeState.aiTarget=frameTopic();const old=frameRestorePending();if(old?.chatId){aiRevokeDraftAuthorization(old);frameUpdateChat(old.chatId,{status:'cancelled',draft:null})}aiDraft=null;frameClearPending();const turnId=uid(),started=performance.now();frameAddChat({role:'user',text,status:'done',turnId});frameThinking=true;frameRefreshChat();aiAnalyzing=true;const btn=$('aiAnalyzeBtn');if(btn){btn.disabled=true;btn.textContent='…'}try{let draft,response=null;if(aiServerUrl()){response=await requestAiBrain(text);draft=brainDraftFromResponse(text,response)}else draft=parseAiCommand(text,frameTopic()||routeState.aiTarget);if(draft?.targetKey&&aiTargetByKey(draft.targetKey)){const explicit=frameDetectTarget(text);if(explicit)frameSetTopic(explicit);else if(frameTopic())draft.targetKey=frameTopic()}frameAttachTargetSnapshot(draft);const policyError=frameDraftPolicyError(draft);if(policyError)draft={...draft,ok:false,source:'brain',blocked:true,error:policyError,text};const trace=frameBuildTestTrace(draft,response,Math.round(performance.now()-started));if(draft?.ok&&draft.type==='read_answer')frameAddChat({role:'assistant',text:draft.summary,status:'done',turnId,trace});else if(draft?.ok){const m=frameAddChat({role:'assistant',text:draft.summary||'Проверьте изменение.',status:'pending',draft,turnId,trace});draft.chatId=m.id;m.draft.chatId=m.id;frameUpdateChat(m.id,{draft:m.draft});aiDraft=draft;frameSavePending(draft)}else frameAddChat({role:'assistant',text:draft?.error||'Нужно уточнение.',status:'done',turnId,trace})}catch(e){console.error(e);frameAddChat({role:'assistant',text:'Не удалось связаться с AI Brain. Проверьте компьютер и туннель.',status:'error',turnId,trace:frameBuildTestTrace(null,null,Math.round(performance.now()-started),'request_failed')})}finally{frameThinking=false;aiAnalyzing=false;frameHardClearComposer();if(btn){btn.disabled=false;btn.textContent='↑'}frameRefreshChat()}}

async function frameAcquireWakeLock(){if(!('wakeLock' in navigator)||document.visibilityState!=='visible'||frameVoiceWakeLock)return frameVoiceWakeLock;if(frameWakeAcquirePromise)return frameWakeAcquirePromise;frameWakeAcquirePromise=(async()=>{try{const lock=await navigator.wakeLock.request('screen');if(document.visibilityState!=='visible'||(!frameVoiceWanted&&!frameComposerWakeWanted)){try{await lock.release()}catch(e){}return null}frameVoiceWakeLock=lock;lock.addEventListener('release',()=>{if(frameVoiceWakeLock===lock)frameVoiceWakeLock=null});return lock}catch(e){return null}finally{frameWakeAcquirePromise=null}})();return frameWakeAcquirePromise}
async function frameReleaseWakeLock(){try{if(frameWakeAcquirePromise)await frameWakeAcquirePromise;if(document.visibilityState==='visible'&&(frameVoiceWanted||frameComposerWakeWanted))return frameVoiceWakeLock;const lock=frameVoiceWakeLock;frameVoiceWakeLock=null;await lock?.release()}catch(e){}finally{if(document.visibilityState!=='visible'||(!frameVoiceWanted&&!frameComposerWakeWanted))frameVoiceWakeLock=null}}
function frameRefreshWakeLock(){if(frameVoiceWanted||frameComposerWakeWanted)frameAcquireWakeLock();else frameReleaseWakeLock()}
function frameComposerWake(active){clearTimeout(frameComposerWakeTimer);frameComposerWakeTimer=null;if(active){frameComposerWakeWanted=true;frameRefreshWakeLock();return}frameComposerWakeTimer=setTimeout(()=>{const input=$('aiCommandInput');frameComposerWakeWanted=!!(input&&document.activeElement===input);frameRefreshWakeLock()},250)}
function frameVoiceButton(active){const b=$('aiMicBtn');if(!b)return;b.classList.toggle('recording',!!active);b.textContent=active?'■':'🎙️'}
function frameStartRecognition(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){frameVoiceWanted=false;frameVoiceButton(false);frameRefreshWakeLock();toast('Распознавание речи недоступно');return}if(!frameVoiceWanted||document.visibilityState!=='visible')return;const session=frameVoiceSession;const rec=new SR();aiRecognition=rec;rec.lang='ru-RU';rec.interimResults=true;rec.continuous=true;let committed='';rec.onresult=e=>{if(session!==frameVoiceSession||!frameVoiceWanted)return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=(e.results[i][0]?.transcript||'').trim();if(e.results[i].isFinal&&t)committed+=(committed?' ':'')+t;else if(t)interim+=(interim?' ':'')+t}const input=$('aiCommandInput');if(input){input.value=[frameVoiceBase,committed,interim].filter(Boolean).join(' ').trim();frameAutoGrowInput()}};rec.onerror=e=>{if(session!==frameVoiceSession)return;const code=String(e?.error||'');if(['not-allowed','service-not-allowed','audio-capture'].includes(code)){frameVoiceWanted=false;frameVoiceButton(false);frameRefreshWakeLock();toast(code==='not-allowed'?'Разрешите микрофон для FRAME':'Микрофон недоступен')}};rec.onend=()=>{if(session!==frameVoiceSession)return;aiRecognition=null;const i=$('aiCommandInput');if(i&&frameVoiceWanted)frameVoiceBase=i.value.trim();if(frameVoiceWanted&&document.visibilityState==='visible'){clearTimeout(frameVoiceRestartTimer);frameVoiceRestartTimer=setTimeout(frameStartRecognition,220)}else frameVoiceButton(false)};try{rec.start();frameVoiceButton(true)}catch(e){if(session!==frameVoiceSession)return;aiRecognition=null;frameVoiceRestartTimer=setTimeout(frameStartRecognition,350)}}
function frameStopVoice(keepText=true){frameVoiceWanted=false;frameVoiceSession++;clearTimeout(frameVoiceRestartTimer);frameVoiceRestartTimer=null;const old=aiRecognition;aiRecognition=null;try{old?.abort?.()}catch(e){try{old?.stop()}catch(_){}}if(!keepText)frameVoiceBase='';frameVoiceButton(false);frameRefreshWakeLock()}
function frameLeaveAi(){clearTimeout(frameComposerWakeTimer);frameComposerWakeTimer=null;frameComposerWakeWanted=false;frameStopVoice(true);frameReleaseWakeLock()}
startAiVoice=async function(){if(frameVoiceWanted){frameStopVoice(true);return}frameVoiceSession++;const input=$('aiCommandInput');frameVoiceBase=input?.value?.trim()||'';frameVoiceWanted=true;await frameAcquireWakeLock();frameStartRecognition()}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){if(frameVoiceWanted){try{aiRecognition?.stop()}catch(e){}}frameReleaseWakeLock()}else{frameRefreshWakeLock();if(frameVoiceWanted&&!aiRecognition)frameStartRecognition()}});

bindAiResult=function(){frameBindChatActions()};bindAiView=function(){frameRestorePending();if($('aiAnalyzeBtn'))$('aiAnalyzeBtn').onclick=analyzeAiInput;if($('aiMicBtn'))$('aiMicBtn').onclick=startAiVoice;if($('frameAttachBtn'))$('frameAttachBtn').onclick=frameShowAttachMenu;if($('frameTestBtn'))$('frameTestBtn').onclick=frameShowTestTranscript;const input=$('aiCommandInput');if(input){input.addEventListener('focus',()=>frameComposerWake(true));input.addEventListener('blur',()=>frameComposerWake(false));input.addEventListener('input',()=>{frameAutoGrowInput();frameComposerWake(document.activeElement===input)});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();analyzeAiInput()}})}frameHardClearComposer();frameBindChatActions();frameScrollChat();frameRenderConnectionDot();frameUpdateTestButton();if(aiServerUrl()&&!aiBrainStatus)checkAiBrain({toastResult:false})};
const frameCoreApplyAiDraft=applyAiDraft;applyAiDraft=async function(authorizationToken=''){const d=frameRestorePending()||aiDraft,id=d?.chatId||'',policyError=frameDraftPolicyError(d);if(policyError){if(id)frameUpdateChat(id,{status:'cancelled',text:policyError,draft:null});if(d)aiRevokeDraftAuthorization(d);aiDraft=null;frameClearPending();toast(policyError);if(route==='ai')render();return false}if(d)aiDraft=d;const applied=await frameCoreApplyAiDraft(authorizationToken);if(id&&applied===true){frameUpdateChat(id,{status:'applied',draft:null});frameClearPending();if(route==='ai')render()}else if(id&&authorizationToken){frameUpdateChat(id,{status:'cancelled',draft:null});frameClearPending();aiDraft=null;if(route==='ai')render()}return applied===true};
console.info('[FRAME] 2.7.7 AI Chat loaded');
