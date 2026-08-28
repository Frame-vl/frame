'use strict';

// FRAME AI Chat overlay for the 2.6.2 core. Keeps the proven data/action engine intact
// and replaces only the AI interaction surface with a persistent conversation.
const FRAME_CHAT_KEY='frameAiChatV262Chat1';
const FRAME_CHAT_PENDING_KEY='frameAiPendingV262Chat1';
const FRAME_CHAT_LIMIT=80;

function frameChatMessages(){
  try{const x=JSON.parse(storageGet(FRAME_CHAT_KEY,'[]')||'[]');return Array.isArray(x)?x:[]}catch(e){return []}
}
function frameSaveChat(items){storageSet(FRAME_CHAT_KEY,JSON.stringify((items||[]).slice(-FRAME_CHAT_LIMIT)))}
function frameAddChat(message){const items=frameChatMessages(),item={id:uid(),at:now(),role:'assistant',status:'done',...message};items.push(item);frameSaveChat(items);return item}
function frameUpdateChat(id,patch){const items=frameChatMessages(),i=items.findIndex(x=>x.id===id);if(i<0)return null;items[i]={...items[i],...patch};frameSaveChat(items);return items[i]}
function frameSavePending(draft){if(!draft){storageSet(FRAME_CHAT_PENDING_KEY,'');return}try{storageSet(FRAME_CHAT_PENDING_KEY,JSON.stringify(draft))}catch(e){console.warn('AI pending save',e)}}
function frameRestorePending(){if(aiDraft?.ok)return aiDraft;try{const raw=storageGet(FRAME_CHAT_PENDING_KEY,'');if(!raw)return null;const d=JSON.parse(raw);if(d?.ok){aiDraft=d;return d}}catch(e){}return null}
function frameClearPending(){storageSet(FRAME_CHAT_PENDING_KEY,'')}
function frameChatTime(value){try{return new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function framePlanHtml(draft){if(!draft?.actions?.length)return '';return `<div class="frameChatPlan">${draft.actions.map((a,i)=>`<div class="frameChatPlanRow ${a.type==='delete_work'?'dangerPlan':''}"><b>${i+1}</b><span>${esc(aiBrainActionSummary(a))}</span></div>`).join('')}</div>`}
function framePendingControls(message){const destructive=(message.draft?.actions||[]).some(a=>a.type==='delete_work');return `<div class="frameChatActions"><button class="btn ${destructive?'danger':'primary'}" data-chat-apply="${esc(message.id)}">${destructive?'⚠️ Подтвердить':'✓ Применить'}</button><button class="btn ghost" data-chat-cancel="${esc(message.id)}">Отмена</button></div>`}
function frameChatHtml(){
  const items=frameChatMessages();
  if(!items.length)return `<div class="frameChatWelcome"><span class="frameChatOrb">✦</span><div><strong>FRAME на связи</strong><p>Напишите обычным языком. Можно спросить про объект или попросить изменить данные. Перед записью изменений FRAME покажет, что именно собирается сделать.</p></div></div>`;
  return items.map(m=>{
    const meta=m.role==='assistant'&&m.provider?[m.provider,m.model].filter(Boolean).join(' · '):'';
    const pending=m.role==='assistant'&&m.status==='pending'&&m.draft;
    const status=m.status==='applied'?'✓ Применено':m.status==='cancelled'?'Отменено':'';
    return `<article class="frameChatMessage ${m.role==='user'?'fromUser':'fromFrame'} ${pending?'hasPlan':''}"><div class="frameChatBubble"><div class="frameChatWho">${m.role==='user'?'Вы':'FRAME'}<small>${esc(frameChatTime(m.at))}</small></div><div class="frameChatText">${esc(m.text||'')}</div>${pending?framePlanHtml(m.draft):''}${pending?framePendingControls(m):''}${status?`<div class="frameChatStatus ${m.status}">${status}</div>`:''}${meta?`<small class="aiMeta">${esc(meta)}</small>`:''}</div></article>`;
  }).join('');
}
function frameScrollChat(){requestAnimationFrame(()=>{const x=$('frameChatFeed');if(x)x.scrollTop=x.scrollHeight})}
function frameCancelPending(messageId=''){
  const draft=frameRestorePending();
  if(messageId)frameUpdateChat(messageId,{status:'cancelled'});
  else if(draft?.chatId)frameUpdateChat(draft.chatId,{status:'cancelled'});
  aiDraft=null;frameClearPending();
  if(route==='ai'){const feed=$('frameChatFeed');if(feed)feed.innerHTML=frameChatHtml();frameBindChatActions();frameScrollChat()}
}
function frameBindChatActions(){
  $$('[data-chat-apply]').forEach(b=>b.onclick=async()=>{const draft=frameRestorePending();if(!draft||draft.chatId!==b.dataset.chatApply){toast('Этот план уже не активен');return}aiDraft=draft;await applyAiDraft()});
  $$('[data-chat-cancel]').forEach(b=>b.onclick=()=>frameCancelPending(b.dataset.chatCancel));
}

// Provider-neutral health wording. The server may be GigaChat, Ollama or another provider.
checkAiBrain=async function({toastResult=true}={}){
  const base=aiServerUrl();
  if(!base){aiBrainStatus={ok:false,message:'Адрес не задан'};if(toastResult)toast('Сначала укажите адрес AI Brain');return aiBrainStatus}
  try{
    const data=await aiBrainFetch('/health',{method:'GET'});
    aiBrainStatus={ok:!!data.ok,provider:data.provider||'',model:data.model||'',detail:data.detail||{},message:data.ok?'Готов к работе':'AI Brain отвечает, но модель не готова'};
    if(toastResult)toast(data.ok?`AI Brain подключён · ${data.model||data.provider||'готов'}`:'AI Brain отвечает, но модель пока не готова');
    return aiBrainStatus;
  }catch(e){aiBrainStatus={ok:false,message:String(e?.message||e)};if(toastResult)toast('AI Brain недоступен: '+aiBrainStatus.message);return aiBrainStatus}
  finally{if(route==='ai')requestAnimationFrame(()=>{const el=$('aiBrainState');if(el)el.innerHTML=aiBrainStateHtml()})}
};

renderAiView=function(){
  frameRestorePending();
  const targets=aiAllTargets(),selected=routeState.aiTarget||aiDefaultTargetKey();
  routeState.aiTarget=targets.some(x=>x.key===selected)?selected:(targets[0]?.key||'');
  const mic=!!(window.SpeechRecognition||window.webkitSpeechRecognition),server=aiServerUrl();
  return `<section class="view aiView frameChatView">
    <div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Главная</button></div>
    <div class="card frameChatHero">
      <div class="sectionTitle"><div><div class="aiBadge">SOLO · AI CHAT</div><h1>FRAME</h1><p class="help compact">Рабочий чат по объектам, работам и деньгам.</p></div><button id="clearAiChatBtn" class="btn ghost small">Очистить чат</button></div>
      <div id="aiBrainState" class="aiInlineState">${aiBrainStateHtml()}<button id="openAiSettingsBtn" class="btn ghost small">Настроить</button></div>
      <label class="frameChatTarget">Контекст<select id="aiTargetSelect"><option value="">Без привязки</option>${targets.map(x=>`<option value="${esc(x.key)}" ${x.key===routeState.aiTarget?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>
    </div>
    <div class="card frameChatCard"><div id="frameChatFeed" class="frameChatFeed">${frameChatHtml()}</div></div>
    <div class="card frameChatComposerCard">
      <div class="aiComposer"><textarea id="aiCommandInput" rows="3" placeholder="Напишите FRAME, что произошло или что нужно сделать"></textarea><div class="aiComposerActions"><button id="aiMicBtn" class="btn ghost" ${mic?'':'disabled'}>${mic?'🎙️ Сказать':'🎙️ Микрофон недоступен'}</button><button id="aiAnalyzeBtn" class="btn primary" ${aiAnalyzing?'disabled':''}>${aiAnalyzing?'🧠 Думаю…':'✨ Отправить'}</button></div></div>
      <div class="aiChips"><button data-ai-example="Что сейчас по текущему заказу: что выполнено, что к закрытию и сколько денег висит?">? Сводка</button><button data-ai-example="Электромонтаж выполнен полностью, кроме монтажа механизмов розеток и выключателей">✓ Выполнение</button><button data-ai-example="Заказчик всё возместил за материалы">₽ Возмещение</button><button data-ai-example="Получил от заказчика весь остаток по этому заказу">＋ Оплата</button></div>
      <p class="aiPrivacy">${server?'Изменения записываются только после кнопки «Применить». История чата остаётся на этом устройстве.':'Подключение AI Brain находится в Настройки → Система / AI.'}</p>
    </div>
    <div class="card"><div class="sectionTitle"><div><h2>Последние изменения</h2><p class="help compact">Применённые AI-пакеты можно откатить.</p></div><button id="undoAiBtn" class="btn ghost small" ${aiLogs().some(x=>!x.undone)?'':'disabled'}>↶ Отменить</button></div><div id="aiHistory" class="aiHistory">${aiHistoryHtml()}</div></div>
  </section>`;
};

analyzeAiInput=async function(){
  const input=$('aiCommandInput'),text=String(input?.value||'').trim();
  if(!text){toast('Сначала скажите или напишите сообщение');return}
  const old=frameRestorePending();if(old?.chatId)frameUpdateChat(old.chatId,{status:'cancelled'});aiDraft=null;frameClearPending();
  frameAddChat({role:'user',text,status:'done'});if(input)input.value='';
  const feed=$('frameChatFeed');if(feed)feed.innerHTML=frameChatHtml();frameScrollChat();
  aiAnalyzing=true;const btn=$('aiAnalyzeBtn');if(btn){btn.disabled=true;btn.textContent='🧠 Думаю…'}
  try{
    let draft;
    if(aiServerUrl()){
      const response=await requestAiBrain(text);draft=brainDraftFromResponse(text,response);
      if(!draft?.ok){const deterministic=parseAiCommand(text,routeState.aiTarget);if(deterministic?.ok){draft=deterministic;draft.summary=`${deterministic.summary} · локальная страховка`}}
    }else draft=parseAiCommand(text,routeState.aiTarget);
    if(draft?.targetKey&&draft.source!=='brain'&&draft.targetKey!==routeState.aiTarget){routeState.aiTarget=draft.targetKey;const select=$('aiTargetSelect');if(select)select.value=draft.targetKey}
    if(draft?.ok&&draft.type==='read_answer'){
      frameAddChat({role:'assistant',text:draft.summary,provider:draft.provider,model:draft.model,status:'done'});aiDraft=null;
    }else if(draft?.ok){
      const m=frameAddChat({role:'assistant',text:draft.summary||'Проверьте предложенные изменения.',provider:draft.provider,model:draft.model,status:'pending',draft});draft.chatId=m.id;m.draft.chatId=m.id;frameUpdateChat(m.id,{draft:m.draft});aiDraft=draft;frameSavePending(draft);
    }else{
      frameAddChat({role:'assistant',text:draft?.error||'Нужно уточнение.',provider:draft?.provider,model:draft?.model,status:'done'});aiDraft=null;
    }
  }catch(e){console.error('FRAME AI Brain',e);frameAddChat({role:'assistant',text:`AI Brain не ответил: ${String(e?.message||e)}. Проверьте компьютер, AI-сервер и туннель.`,status:'done'});aiDraft=null}
  finally{aiAnalyzing=false;if(btn){btn.disabled=false;btn.textContent='✨ Отправить'}const x=$('frameChatFeed');if(x)x.innerHTML=frameChatHtml();frameBindChatActions();frameScrollChat()}
};

bindAiResult=function(){frameBindChatActions()};
bindAiView=function(){
  frameRestorePending();
  const select=$('aiTargetSelect');if(select)select.onchange=e=>{routeState.aiTarget=e.target.value};
  if($('aiAnalyzeBtn'))$('aiAnalyzeBtn').onclick=analyzeAiInput;
  if($('aiMicBtn'))$('aiMicBtn').onclick=startAiVoice;
  if($('openAiSettingsBtn'))$('openAiSettingsBtn').onclick=()=>navigate('settings',{tab:'system'});
  if($('clearAiChatBtn'))$('clearAiChatBtn').onclick=()=>{if(!confirm('Очистить историю чата FRAME на этом устройстве?'))return;frameSaveChat([]);aiDraft=null;frameClearPending();render()};
  $$('[data-ai-example]').forEach(b=>b.onclick=()=>{const i=$('aiCommandInput');if(i){i.value=b.dataset.aiExample;i.focus()}});
  if($('undoAiBtn'))$('undoAiBtn').onclick=undoLastAiAction;
  const input=$('aiCommandInput');if(input)input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();analyzeAiInput()}});
  frameBindChatActions();frameScrollChat();if(aiServerUrl()&&!aiBrainStatus)checkAiBrain({toastResult:false});
};

// Keep the proven action engine, but reflect successful application back into chat.
const frameCoreApplyAiDraft=applyAiDraft;
applyAiDraft=async function(){
  const d=frameRestorePending()||aiDraft,chatId=d?.chatId||'';
  if(d)aiDraft=d;
  await frameCoreApplyAiDraft();
  if(chatId&&!aiDraft){frameUpdateChat(chatId,{status:'applied'});frameClearPending();if(route==='ai')render()}
};

console.info('[FRAME] AI Chat overlay loaded');
