'use strict';

// FRAME 2.7 AI Chat surface. The 2.6.2 data/action engine stays intact.
const FRAME_CHAT_KEY='frameAiChatV270';
const FRAME_CHAT_PENDING_KEY='frameAiPendingV270';
const FRAME_CHAT_TOPIC_KEY='frameAiTopicV270';
const FRAME_CHAT_LIMIT=100;
let frameVoiceWanted=false;
let frameVoiceRestartTimer=null;
let frameVoiceText='';

function frameChatMessages(){try{const x=JSON.parse(storageGet(FRAME_CHAT_KEY,'[]')||'[]');return Array.isArray(x)?x:[]}catch(e){return []}}
function frameSaveChat(items){storageSet(FRAME_CHAT_KEY,JSON.stringify((items||[]).slice(-FRAME_CHAT_LIMIT)))}
function frameAddChat(message){const items=frameChatMessages(),item={id:uid(),at:now(),role:'assistant',status:'done',...message};items.push(item);frameSaveChat(items);return item}
function frameUpdateChat(id,patch){const items=frameChatMessages(),i=items.findIndex(x=>x.id===id);if(i<0)return null;items[i]={...items[i],...patch};frameSaveChat(items);return items[i]}
function frameSavePending(draft){if(!draft){storageSet(FRAME_CHAT_PENDING_KEY,'');return}try{storageSet(FRAME_CHAT_PENDING_KEY,JSON.stringify(draft))}catch(e){console.warn('AI pending save',e)}}
function frameRestorePending(){if(aiDraft?.ok)return aiDraft;try{const raw=storageGet(FRAME_CHAT_PENDING_KEY,'');if(!raw)return null;const d=JSON.parse(raw);if(d?.ok){aiDraft=d;return d}}catch(e){}return null}
function frameClearPending(){storageSet(FRAME_CHAT_PENDING_KEY,'')}
function frameChatTime(value){try{return new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function frameTopic(){return storageGet(FRAME_CHAT_TOPIC_KEY,'')||''}
function frameSetTopic(key=''){storageSet(FRAME_CHAT_TOPIC_KEY,key||'');if(key)routeState.aiTarget=key}
function frameDetectTarget(text=''){
  const norm=aiNorm(text);let best='',scoreBest=0;
  for(const x of aiAllTargets()){
    const hay=aiNorm(`${x.object.contact.address} ${x.object.contact.name} ${x.order.title}`);let score=0;
    for(const token of aiTokens(norm)){if(token.length>=4&&hay.includes(token))score+=2}
    for(const part of aiNorm(x.object.contact.address).split(' ')){const stem=aiStem(part);if(stem.length>=5&&norm.includes(stem))score+=3}
    if(score>scoreBest){scoreBest=score;best=x.key}
  }
  return scoreBest>=3?best:'';
}
function frameTopicLabel(){const t=aiTargetByKey(frameTopic());return t?(t.object.contact.address||t.order.title||'Текущий объект'):''}
function framePlanHtml(draft){if(!draft?.actions?.length)return '';return `<div class="frameChatPlan">${draft.actions.map(a=>`<div class="frameChatPlanRow ${a.type==='delete_work'?'dangerPlan':''}"><span>${esc(aiBrainActionSummary(a))}</span></div>`).join('')}</div>`}
function framePendingControls(message){const destructive=(message.draft?.actions||[]).some(a=>a.type==='delete_work');return `<div class="frameChatActions"><button class="btn ${destructive?'danger':'primary'}" data-chat-apply="${esc(message.id)}">${destructive?'Подтвердить':'Применить'}</button><button class="btn ghost" data-chat-cancel="${esc(message.id)}">Отмена</button></div>`}
function frameChatHtml(){
  const items=frameChatMessages();
  if(!items.length)return `<div class="frameChatWelcome"><span class="frameChatOrb">✦</span><div><strong>FRAME</strong><p>Напишите или надиктуйте, что произошло. Я сама найду объект, пойму контекст разговора и перед записью покажу изменение.</p></div></div>`;
  return items.map(m=>{
    const pending=m.role==='assistant'&&m.status==='pending'&&m.draft;
    const status=m.status==='applied'?'✓ Применено':m.status==='cancelled'?'Отменено':'';
    return `<article class="frameChatMessage ${m.role==='user'?'fromUser':'fromFrame'} ${pending?'hasPlan':''}"><div class="frameChatBubble"><small class="frameChatTime">${esc(frameChatTime(m.at))}</small><div class="frameChatText">${esc(m.text||'')}</div>${pending?framePlanHtml(m.draft):''}${pending?framePendingControls(m):''}${status?`<div class="frameChatStatus ${m.status}">${status}${m.status==='applied'?` <button type="button" data-chat-undo>Отменить</button>`:''}</div>`:''}</div></article>`;
  }).join('');
}
function frameScrollChat(){requestAnimationFrame(()=>{const x=$('frameChatFeed');if(x)x.scrollTop=x.scrollHeight})}
function frameCancelPending(messageId=''){const draft=frameRestorePending();if(messageId)frameUpdateChat(messageId,{status:'cancelled'});else if(draft?.chatId)frameUpdateChat(draft.chatId,{status:'cancelled'});aiDraft=null;frameClearPending();if(route==='ai'){const feed=$('frameChatFeed');if(feed)feed.innerHTML=frameChatHtml();frameBindChatActions();frameScrollChat()}}
function frameBindChatActions(){
  $$('[data-chat-apply]').forEach(b=>b.onclick=async()=>{const draft=frameRestorePending();if(!draft||draft.chatId!==b.dataset.chatApply){toast('Этот план уже не активен');return}aiDraft=draft;await applyAiDraft()});
  $$('[data-chat-cancel]').forEach(b=>b.onclick=()=>frameCancelPending(b.dataset.chatCancel));
  $$('[data-chat-undo]').forEach(b=>b.onclick=undoLastAiAction);
}

const frameCoreContextPayload=aiContextPayload;
aiContextPayload=function(){
  const topic=frameTopic();if(topic)routeState.aiTarget=topic;
  const base=frameCoreContextPayload();
  const conversation=frameChatMessages().slice(-18).map(m=>({role:m.role==='user'?'user':'assistant',content:String(m.text||''),status:m.status||'done'}));
  return {...base,current_target:topic||'',conversation,conversation_target:frameTopicLabel()};
};

checkAiBrain=async function({toastResult=true}={}){
  const base=aiServerUrl();if(!base){aiBrainStatus={ok:false,message:'Адрес не задан'};if(toastResult)toast('AI Brain не настроен');return aiBrainStatus}
  try{const data=await aiBrainFetch('/health',{method:'GET'});aiBrainStatus={ok:!!data.ok,provider:data.provider||'',model:data.model||'',detail:data.detail||{},message:data.ok?'Готов к работе':'Модель не готова'};if(toastResult)toast(data.ok?'FRAME на связи':'AI Brain пока не готов');return aiBrainStatus}
  catch(e){aiBrainStatus={ok:false,message:String(e?.message||e)};if(toastResult)toast('FRAME не может связаться с AI Brain');return aiBrainStatus}
  finally{if(route==='ai')requestAnimationFrame(frameRenderConnectionDot)}
};
function frameRenderConnectionDot(){const dot=$('frameConnectionDot');if(!dot)return;dot.className=`frameConnectionDot ${aiBrainStatus?.ok?'ok':aiBrainStatus?'bad':'wait'}`;dot.title=aiBrainStatus?.ok?'AI Brain онлайн':aiBrainStatus?.message||'Проверяем связь'}

renderAiView=function(){
  frameRestorePending();
  if(routeState.aiTarget&&aiTargetByKey(routeState.aiTarget))frameSetTopic(routeState.aiTarget);
  return `<section class="frameChatView">
    <header class="frameChatTop"><button class="frameChatBack" type="button" data-go="dashboard" aria-label="Назад">‹</button><div class="frameChatTitle">FRAME <i id="frameConnectionDot" class="frameConnectionDot ${aiBrainStatus?.ok?'ok':aiBrainStatus?'bad':'wait'}"></i></div></header>
    <main id="frameChatFeed" class="frameChatFeed">${frameChatHtml()}</main>
    <footer class="frameChatComposer">
      <button id="frameAttachBtn" class="frameComposerIcon" type="button" aria-label="Добавить">＋</button>
      <textarea id="aiCommandInput" rows="1" placeholder="Сообщение FRAME"></textarea>
      <button id="aiMicBtn" class="frameComposerIcon mic" type="button" aria-label="Диктовать">🎙️</button>
      <button id="aiAnalyzeBtn" class="frameSendBtn" type="button" aria-label="Отправить">↑</button>
    </footer>
  </section>`;
};

function frameRefreshChat(){const feed=$('frameChatFeed');if(feed)feed.innerHTML=frameChatHtml();frameBindChatActions();frameScrollChat()}
function frameAutoGrowInput(){const input=$('aiCommandInput');if(!input)return;input.style.height='auto';input.style.height=Math.min(132,input.scrollHeight)+'px'}
function frameShowAttachMenu(){openSheet(`<div class="sectionTitle"><div><h1>Добавить</h1><p class="help compact">Вложения подключим следующим шагом.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="backupNote">Сейчас чат работает с текстом и диктовкой. Фото, чек и файл добавим сюда без загромождения основного экрана.</div>`)}

analyzeAiInput=async function(){
  const input=$('aiCommandInput'),text=String(input?.value||'').trim();if(!text){toast('Сначала скажите или напишите сообщение');return}
  frameStopVoice(false);
  const detected=frameDetectTarget(text);if(detected)frameSetTopic(detected);else if(frameTopic())routeState.aiTarget=frameTopic();
  const old=frameRestorePending();if(old?.chatId)frameUpdateChat(old.chatId,{status:'cancelled'});aiDraft=null;frameClearPending();
  frameAddChat({role:'user',text,status:'done'});if(input){input.value='';frameAutoGrowInput()}frameRefreshChat();
  aiAnalyzing=true;const btn=$('aiAnalyzeBtn');if(btn){btn.disabled=true;btn.textContent='…'}
  try{
    let draft;
    if(aiServerUrl()){
      const response=await requestAiBrain(text);draft=brainDraftFromResponse(text,response);
      if(!draft?.ok){const deterministic=parseAiCommand(text,frameTopic()||routeState.aiTarget);if(deterministic?.ok){draft=deterministic;draft.summary=deterministic.summary}}
    }else draft=parseAiCommand(text,frameTopic()||routeState.aiTarget);
    if(draft?.targetKey&&aiTargetByKey(draft.targetKey))frameSetTopic(draft.targetKey);
    if(draft?.ok&&draft.type==='read_answer')frameAddChat({role:'assistant',text:draft.summary,provider:draft.provider,model:draft.model,status:'done'});
    else if(draft?.ok){const m=frameAddChat({role:'assistant',text:draft.summary||'Проверьте изменение.',provider:draft.provider,model:draft.model,status:'pending',draft});draft.chatId=m.id;m.draft.chatId=m.id;frameUpdateChat(m.id,{draft:m.draft});aiDraft=draft;frameSavePending(draft)}
    else frameAddChat({role:'assistant',text:draft?.error||'Нужно уточнение.',status:'done'});
  }catch(e){console.error('FRAME AI Brain',e);frameAddChat({role:'assistant',text:'Не удалось связаться с AI Brain. Проверьте компьютер и туннель.',status:'done'});aiDraft=null}
  finally{aiAnalyzing=false;if(btn){btn.disabled=false;btn.textContent='↑'}frameRefreshChat()}
};

function frameVoiceButton(active=false){const b=$('aiMicBtn');if(!b)return;b.classList.toggle('recording',active);b.textContent=active?'■':'🎙️';b.setAttribute('aria-label',active?'Остановить диктовку':'Диктовать')}
function frameStartRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Распознавание речи недоступно');return}
  if(!frameVoiceWanted||document.visibilityState!=='visible')return;
  const rec=new SR();aiRecognition=rec;rec.lang='ru-RU';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
  let finalPart='';
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalPart+=(finalPart?' ':'')+t.trim();else interim+=(interim?' ':'')+t.trim()}const input=$('aiCommandInput');if(input){const base=frameVoiceText.trim();input.value=[base,finalPart.trim(),interim.trim()].filter(Boolean).join(' ');frameAutoGrowInput()}};
  rec.onerror=e=>{const code=String(e?.error||'');if(['not-allowed','service-not-allowed','audio-capture'].includes(code)){frameVoiceWanted=false;frameVoiceButton(false);toast(code==='not-allowed'?'Разрешите микрофон для FRAME в Safari':'Микрофон сейчас недоступен')}else if(code!=='aborted'&&code!=='no-speech')console.warn('FRAME speech',code)};
  rec.onend=()=>{aiRecognition=null;const input=$('aiCommandInput');if(input)frameVoiceText=input.value.trim();if(frameVoiceWanted&&document.visibilityState==='visible'){clearTimeout(frameVoiceRestartTimer);frameVoiceRestartTimer=setTimeout(frameStartRecognition,180)}else frameVoiceButton(false)};
  try{rec.start();frameVoiceButton(true)}catch(e){console.warn('speech start',e);aiRecognition=null;clearTimeout(frameVoiceRestartTimer);frameVoiceRestartTimer=setTimeout(frameStartRecognition,300)}
}
function frameStopVoice(keepText=true){frameVoiceWanted=false;clearTimeout(frameVoiceRestartTimer);frameVoiceRestartTimer=null;try{aiRecognition?.stop()}catch(e){}aiRecognition=null;if(keepText)frameVoiceText=$('aiCommandInput')?.value?.trim()||frameVoiceText;frameVoiceButton(false)}
startAiVoice=function(){
  if(frameVoiceWanted){frameStopVoice(true);return}
  const input=$('aiCommandInput');frameVoiceText=input?.value?.trim()||'';frameVoiceWanted=true;frameStartRecognition();
};

document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'&&frameVoiceWanted){try{aiRecognition?.stop()}catch(e){}}else if(document.visibilityState==='visible'&&frameVoiceWanted&&!aiRecognition)frameStartRecognition()});

bindAiResult=function(){frameBindChatActions()};
bindAiView=function(){
  frameRestorePending();
  if($('aiAnalyzeBtn'))$('aiAnalyzeBtn').onclick=analyzeAiInput;
  if($('aiMicBtn'))$('aiMicBtn').onclick=startAiVoice;
  if($('frameAttachBtn'))$('frameAttachBtn').onclick=frameShowAttachMenu;
  const input=$('aiCommandInput');if(input){input.addEventListener('input',frameAutoGrowInput);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();analyzeAiInput()}});frameAutoGrowInput()}
  frameBindChatActions();frameScrollChat();frameRenderConnectionDot();if(aiServerUrl()&&!aiBrainStatus)checkAiBrain({toastResult:false});
};

const frameCoreApplyAiDraft=applyAiDraft;
applyAiDraft=async function(){const d=frameRestorePending()||aiDraft,chatId=d?.chatId||'';if(d)aiDraft=d;await frameCoreApplyAiDraft();if(chatId&&!aiDraft){frameUpdateChat(chatId,{status:'applied'});frameClearPending();if(route==='ai')render()}};

console.info('[FRAME] 2.7 minimalist AI Chat loaded');
