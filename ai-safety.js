'use strict';

// FRAME AI mutation safety. All state in this module is page-session only.
(function initFrameAiSafety(global){
  const FIELD_PATH='/frame-field';
  const FIELD_EDGE_SUFFIXES=Object.freeze(['.trycloudflare.com','.pinggy.link','.pinggy.online','.pinggy.io']);
  const ALLOWED_FIELD_ACTIONS=new Set(['create_object','create_order','update_object','update_order','add_work','set_work_progress','add_note','create_document']);
  const AUDIT_LABELS=Object.freeze({brain_batch:'Пакет изменений FRAME AI',payment:'Оплата',expense:'Расход',purchase:'Покупка',work_add:'Новая работа',work_complete:'Прогресс работы',order_note:'Заметка',create_object:'Новый объект',create_order:'Новый заказ',update_object:'Изменение объекта',update_order:'Изменение заказа',add_work:'Новая работа',delete_work:'Удаление работы',update_work:'Изменение работы',set_work_progress:'Прогресс работы',add_payment:'Оплата',add_expense:'Расход',add_purchase:'Покупка',add_note:'Заметка',reimburse_purchase:'Возмещение',create_document:'Новый документ'});
  const authorizationByDraft=new Map();
  const consumedDrafts=new Set();
  let verifiedFieldCredential='';

  function configuredUrl(value){
    if(value!==undefined)return String(value||'').trim().replace(/\/$/,'');
    try{return String(global.aiServerUrl?.()||'').trim().replace(/\/$/,'')}catch(e){return ''}
  }
  function normalizedUrl(value){
    const raw=configuredUrl(value);
    if(!raw)return '';
    try{return new URL(raw,global.location?.href||'https://frame.invalid/').href.replace(/\/$/,'')}catch(e){return ''}
  }
  function configuredFieldSafe(value){
    const raw=configuredUrl(value);
    if(!raw)return false;
    try{
      const url=new URL(raw,global.location?.href||'https://frame.invalid/');
      return url.pathname.replace(/\/+$/,'')===FIELD_PATH||(
        url.protocol==='https:'&&FIELD_EDGE_SUFFIXES.some(suffix=>url.hostname.toLowerCase().endsWith(suffix))
      );
    }catch(e){return false}
  }
  function effectiveMode(providerMode=''){return configuredFieldSafe()?'field_safe':String(providerMode||'')}
  function credentialKey(url){let token='';try{token=String(global.aiServerToken?.()||'')}catch(e){}return `${normalizedUrl(url)}\n${token}`}
  function recordAuthenticatedHealth(mode,{url,authenticated=false}={}){
    const current=credentialKey(url);
    verifiedFieldCredential='';
    if(configuredFieldSafe(url)&&authenticated&&String(mode||'')==='field_safe')verifiedFieldCredential=current;
    return !configuredFieldSafe(url)||verifiedFieldCredential===current;
  }
  function fieldHealthVerified(){const current=credentialKey();return configuredFieldSafe()&&!!normalizedUrl()&&verifiedFieldCredential===current}
  function blockedTypes(mode,actions){
    if(effectiveMode(mode)!=='field_safe')return [];
    return [...new Set((Array.isArray(actions)?actions:[]).map(a=>String(a?.type||'')).filter(t=>!ALLOWED_FIELD_ACTIONS.has(t)).map(t=>t||'unknown'))];
  }
  // JavaScript's `\b` is ASCII-only even with /u, so use explicit Cyrillic-safe edges.
  const MUTATION_INTENT_RE=/(?:^|[^a-zа-яё0-9_])(?:создай|создать|создавай|добавь|добавить|запиши|записать|измени|изменить|поменяй|поменять|обнови|обновить|удали|удалить|отметь|отметить|поставь|поставить|закрой|закрыть|заведи|завести|оформи|оформить|подготовь|подготовить|сформируй|сформировать|составь|составить|сгенерируй|сгенерировать|внеси|внести|сохрани|сохранить)(?=$|[^a-zа-яё0-9_])/i;
  const DOCUMENT_INTENT_RE=/(?:^|[^a-zа-яё0-9_])(?:сделай|сформируй|сформировать|подготовь|подготовить|оформи|оформить|создай|создать|заведи|завести|составь|составить|сгенерируй|сгенерировать)(?=$|[^a-zа-яё0-9_])[^.!?]{0,100}(?:^|[^a-zа-яё0-9_])(?:карточк|объект|заказ|документ|акт|сч[её]т|договор|кп|альбом|переч)[а-яёa-z]*/i;
  const SUCCESS_CLAIM_RE=/(?:^|[^a-zа-яё0-9_])(?:создан(?:а|о|ы)?|добавлен(?:а|о|ы)?|записан(?:а|о|ы)?|измен[её]н(?:а|о|ы)?|обновл[её]н(?:а|о|ы)?|удал[её]н(?:а|о|ы)?|оформлен(?:а|о|ы)?|подготовлен(?:а|о|ы)?|сформирован(?:а|о|ы)?|составлен(?:а|о|ы)?|сгенерирован(?:а|о|ы)?|учт[её]н(?:а|о|ы)?|установлен(?:а|о|ы)?|выполнен(?:а|о|ы)?|сохран[её]н(?:а|о|ы)?|примен[её]н(?:а|о|ы)?|готов(?:а|о|ы)?|сделано)(?=$|[^a-zа-яё0-9_])|(?:^|[^a-zа-яё0-9_])вот\s+(?:ссылка|карточк|документ)/i;
  function falseSuccessClaim(text,summary,meta={}){const source=String(text||''),mutation=meta.mutation_intent===true||MUTATION_INTENT_RE.test(source)||DOCUMENT_INTENT_RE.test(source);return !!(meta.truth_guard_error||meta.truthful_plan_guard)||(mutation&&SUCCESS_CLAIM_RE.test(String(summary||'')))}
  function targetGraphError(d){
    const actions=Array.isArray(d?.actions)?d.actions:[],expected=String(d?.targetKey||'').split('|'),newObjects=new Set(),newOrders=new Map();let root='';
    const acceptRoot=value=>{if(!value)return false;if(!root){root=value;return true}return root===value};
    for(const action of actions){
      const kind=String(action?.type||''),objectId=String(action?.object_id||''),orderId=String(action?.order_id||'');
      if(kind==='create_object'){
        if(!objectId.startsWith('@new_object_')||!orderId.startsWith('@new_order_')||newObjects.has(objectId)||newOrders.has(orderId))return 'FRAME заблокировал создание без уникальных безопасных временных ссылок.';
        if(!acceptRoot(`new:${objectId}`))return 'FRAME заблокировал пакет для нескольких объектов.';
        newObjects.add(objectId);newOrders.set(orderId,objectId);continue;
      }
      if(kind==='create_order'){
        const validObject=newObjects.has(objectId)||(expected[0]&&objectId===expected[0]);
        if(!validObject||!orderId.startsWith('@new_order_')||newOrders.has(orderId))return 'FRAME заблокировал новый заказ с неподтверждённой целью.';
        const objectRoot=newObjects.has(objectId)?`new:${objectId}`:`existing:${objectId}`;
        if(!acceptRoot(objectRoot))return 'FRAME заблокировал пакет для нескольких объектов.';
        newOrders.set(orderId,objectId);continue;
      }
      if(kind==='update_object'){
        if(!(newObjects.has(objectId)||(expected[0]&&objectId===expected[0])))return 'FRAME заблокировал изменение неподтверждённого объекта.';
        if(!acceptRoot(newObjects.has(objectId)?`new:${objectId}`:`existing:${objectId}`))return 'FRAME заблокировал пакет для нескольких объектов.';
        continue;
      }
      const newTarget=newOrders.get(orderId)===objectId&&(newObjects.has(objectId)||(expected[0]&&objectId===expected[0])),existingTarget=expected.length===2&&expected[0]&&expected[1]&&objectId===expected[0]&&orderId===expected[1];
      if(!newTarget&&!existingTarget)return 'FRAME заблокировал изменение: цель ответа не совпала с выбранным объектом.';
      if(!acceptRoot(newObjects.has(objectId)?`new:${objectId}`:`existing:${objectId}`))return 'FRAME заблокировал пакет для нескольких объектов.';
    }
    return '';
  }
  function draftError(d){
    if(effectiveMode(d?.mode)!=='field_safe')return '';
    const actions=Array.isArray(d?.actions)?d.actions:[];
    if(!actions.length){
      if(d?.ok&&d?.type&&d.type!=='read_answer')return 'FRAME заблокировал план без проверяемого списка действий. Ничего не применено.';
      return '';
    }
    if(d?.type!=='brain_batch')return 'FRAME заблокировал план с неподдерживаемой формой действия. Ничего не применено.';
    if(!String(d?.targetLabel||'').trim())return 'FRAME заблокировал план без видимой зафиксированной цели. Ничего не применено.';
    if(configuredFieldSafe()&&(!fieldHealthVerified()||d?.fieldSafeHealthVerified!==true))return 'FRAME не применил план: безопасный режим сервера не подтверждён авторизованной проверкой. Ничего не применено.';
    if(blockedTypes(d?.mode,actions).length)return 'FRAME заблокировал весь пакет изменений в безопасном режиме. Ничего не применено.';
    const documents=actions.filter(action=>String(action?.type||'')==='create_document');
    if(documents.length){
      if(documents.length!==1||actions.length!==1)return 'FRAME заблокировал смешанный пакет с документом. Документ подтверждается отдельно.';
      const action=documents[0],type=String(action.document_type||''),closureId=String(action.closure_id||'');
      if(!['proposal','worklist','act'].includes(type))return 'FRAME заблокировал неподдерживаемый вид документа.';
      if(type==='proposal'&&closureId)return 'FRAME заблокировал КП с посторонним закрытием.';
      const target=typeof global.aiTargetByKey==='function'?global.aiTargetByKey(String(d.targetKey||'')):null;
      if(!target||String(action.object_id||'')!==String(target.object?.id||'')||String(action.order_id||'')!==String(target.order?.id||''))return 'FRAME заблокировал документ для неподтверждённого заказа.';
      if(type!=='proposal'&&closureId&&!(target.order?.workClosures||[]).some(item=>String(item.id||'')===closureId))return 'FRAME заблокировал документ по неизвестному закрытию.';
      if(type!=='proposal'&&!closureId){const ready=Number(global.orderWorkProgress?.(target.order)?.ready||0);if(!(ready>.009))return 'FRAME заблокировал документ: нет выполненного объёма для закрытия.';}
    }
    const graphError=targetGraphError(d);if(graphError)return graphError+' Ничего не применено.';
    return '';
  }
  function draftFromResponse(text,response,targetKey='',targetLabel=''){
    const r=response?.result||{},meta=response?.meta||{},mode=effectiveMode(meta.mode),actions=Array.isArray(r.actions)?r.actions:[];
    const sources=(Array.isArray(meta.web_sources)?meta.web_sources:[]).map(x=>({title:String(x?.title||'Источник').slice(0,200),url:String(x?.url||'').slice(0,2000)})).filter(x=>/^https?:\/\//i.test(x.url)).slice(0,8);
    const common={text,provider:meta.provider,model:meta.model,confidence:r.confidence||0,mode,confirmationRequired:actions.length>0||meta.confirmation_required===true,policyBlockedActions:Array.isArray(meta.policy_blocked_actions)?meta.policy_blocked_actions:[],fieldSafeHealthVerified:configuredFieldSafe()?fieldHealthVerified():false,sources};
    if(r.needs_clarification)return {ok:false,source:'brain',clarification:true,error:r.clarification||'Нужно уточнение.',...common};
    if(!actions.length&&falseSuccessClaim(text,r.summary,meta))return {ok:false,source:'brain',blocked:true,error:'FRAME не получил подтверждённого действия. Ничего не изменено — скажите команду ещё раз.',actions:[],...common};
    if(!actions.length&&String(r.summary||'').trim())return {ok:true,type:'read_answer',source:'brain',summary:String(r.summary).trim(),actions:[],targetKey,...common};
    if(!actions.length)return {ok:false,source:'brain',error:'AI Brain не предложил действий и не дал ответа.',...common};
    const created=actions.find(a=>String(a?.type||'')==='create_object'),visibleTarget=created?[created.address,created.customer_name].map(x=>String(x||'').trim()).filter(Boolean).join(' · '):String(targetLabel||'');
    const candidate={ok:true,type:'brain_batch',source:'brain',actions,summary:r.summary||`${actions.length} действий`,targetKey,targetLabel:visibleTarget,...common};
    const error=draftError(candidate);
    return error?{ok:false,source:'brain',blocked:true,actions:[],error,blockedTypes:blockedTypes(mode,actions),...common}:candidate;
  }
  function canonical(value){
    if(value===null)return 'null';
    if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
    if(typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    if(typeof value==='number'&&!Number.isFinite(value))return JSON.stringify(String(value));
    if(value===undefined)return 'undefined';
    return JSON.stringify(value);
  }
  function signature(draft){try{return canonical(draft)}catch(e){return ''}}
  function draftId(draft){return String(draft?.chatId||'')}
  function randomToken(){try{return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}catch(e){return `${Date.now()}-${Math.random().toString(36).slice(2)}`}}
  function armDisplayedDraft(draft){
    const id=draftId(draft),sig=signature(draft);
    if(!id||!sig||!draft?.ok||draft.type==='read_answer'||draftError(draft)||consumedDrafts.has(id))return null;
    const old=authorizationByDraft.get(id);
    if(old)return old.state==='displayed'&&old.signature===sig?old:null;
    const token=randomToken();
    const record={token,signature:sig,state:'displayed'};
    authorizationByDraft.set(id,record);
    return record;
  }
  function trustedApplyActivation(event){
    if(event instanceof global.Event&&event.isTrusted)return true;
    try{return global.FRAME_AI_TEST_ALLOW_SYNTHETIC_APPLY===true&&global.location?.protocol==='file:'&&/\/tests\/ai\/(?:ui|executor)-harness\.html$/i.test(decodeURI(global.location.pathname||''))}catch(e){return false}
  }
  function bindDisplayedDraftApply(button,draft,onAuthorized){
    if(!(button instanceof global.HTMLElement)||typeof onAuthorized!=='function')return false;
    const record=armDisplayedDraft(draft);
    if(!record)return false;
    let settled=false;
    global.EventTarget.prototype.addEventListener.call(button,'click',event=>{
      if(settled||!trustedApplyActivation(event)){event.preventDefault();return}
      const id=draftId(draft),current=authorizationByDraft.get(id);
      if(!current||current!==record||current.state!=='displayed'||current.signature!==signature(draft)){event.preventDefault();return}
      settled=true;
      current.state='authorized';
      onAuthorized(current.token);
    });
    return true;
  }
  function consumeDraftAuthorization(draft,token){
    const id=draftId(draft),record=authorizationByDraft.get(id);
    if(!record||record.state!=='authorized'||record.token!==String(token||'')||record.signature!==signature(draft))return false;
    authorizationByDraft.delete(id);
    consumedDrafts.add(id);
    return true;
  }
  function consumeAuthorizedDraft(draft,token){const error=draftError(draft);if(error)return {ok:false,error};if(!consumeDraftAuthorization(draft,token))return {ok:false,error:'Этот план не был подтверждён кнопкой «Применить» или уже использован'};return {ok:true,error:''}}
  function revokeDraftAuthorization(draft){const id=draftId(draft);if(!id)return;authorizationByDraft.delete(id);consumedDrafts.add(id)}
  function sanitizeAuditEntries(items){
    return (Array.isArray(items)?items:[]).map(item=>{const source=item&&typeof item==='object'?item:{},rawType=String(source.type||''),type=Object.prototype.hasOwnProperty.call(AUDIT_LABELS,rawType)?rawType:'unknown',actionTypes=[...new Set((Array.isArray(source.actionTypes)?source.actionTypes:[]).map(x=>String(x||'')).filter(x=>Object.prototype.hasOwnProperty.call(AUDIT_LABELS,x)&&x!=='brain_batch'))],targetKey=String(source.targetKey||'').replace(/[^a-z0-9._:@|\-]/gi,'').slice(0,256),clean={id:String(source.id||'').slice(0,128),at:String(source.at||'').slice(0,64),undone:source.undone===true,undoPending:source.undoPending===true,type,targetKey,summary:actionTypes.length?`FRAME AI: ${actionTypes.map(x=>AUDIT_LABELS[x]).join(', ')}`:(AUDIT_LABELS[type]||'Изменение FRAME AI'),undo:source.undo&&typeof source.undo==='object'?source.undo:{}};if(actionTypes.length)clean.actionTypes=actionTypes;return clean});
  }

  const api=Object.freeze({FIELD_PATH,configuredFieldSafe,effectiveMode,recordAuthenticatedHealth,fieldHealthVerified,blockedTypes,draftError,draftFromResponse,bindDisplayedDraftApply,consumeDraftAuthorization,consumeAuthorizedDraft,revokeDraftAuthorization,sanitizeAuditEntries});
  const expose=(name,value)=>Object.defineProperty(global,name,{value,writable:false,configurable:false});
  expose('FrameAiSafety',api);
  expose('aiConfiguredFieldSafe',configuredFieldSafe);
  expose('aiEffectiveMode',effectiveMode);
  expose('aiRecordAuthenticatedHealth',recordAuthenticatedHealth);
  expose('aiFieldSafeHealthVerified',fieldHealthVerified);
  expose('aiFieldSafeBlockedTypes',blockedTypes);
  expose('aiFieldSafeDraftError',draftError);
  expose('aiSafeDraftFromResponse',draftFromResponse);
  expose('aiBindDisplayedDraftApply',bindDisplayedDraftApply);
  expose('aiConsumeDraftAuthorization',consumeDraftAuthorization);
  expose('aiConsumeAuthorizedDraft',consumeAuthorizedDraft);
  expose('aiRevokeDraftAuthorization',revokeDraftAuthorization);
  expose('aiSanitizeAuditEntries',sanitizeAuditEntries);
})(window);
