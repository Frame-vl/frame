'use strict';

// FRAME 2.7.8 AI guard.
// Focuses the model on the locked order, routes obvious add-work commands deterministically,
// and removes superseded facts after explicit user corrections.
(function(){
  const STOP_WORDS=new Set(['работа','работы','готова','готов','выполнена','выполнен','сейчас','только','этот','этому','этого','объект','объекта','пока','ещё','еще','полностью','уже','теперь','поправка','ошибся','ошиблась','наоборот','установлен','установлена','сделан','сделана']);

  function currentTarget(){
    const key=(typeof frameTopic==='function'&&frameTopic())||routeState.aiTarget||aiDefaultTargetKey();
    return aiTargetByKey(key);
  }

  function tokenStems(text){
    return aiNorm(String(text||''))
      .split(/[^a-zа-яё0-9]+/i)
      .map(x=>x.trim())
      .filter(x=>x.length>=4&&!STOP_WORDS.has(x))
      .map(x=>x.slice(0,6));
  }

  function workSubjects(text,target){
    const stems=new Set(tokenStems(text));
    const works=Array.isArray(target?.order?.works)?target.order.works:[];
    const subjects=[];
    for(const work of works){
      const workStems=tokenStems(work?.name||'');
      if(workStems.some(s=>[...stems].some(m=>m.startsWith(s)||s.startsWith(m))))subjects.push(String(work?.id||work?.name||''));
    }
    return subjects;
  }

  function isExplicitCorrection(text){
    return /(?:^|[^a-zа-яё0-9])(?:нет(?=$|[^a-zа-яё0-9])|поправк|я\s+ошиб|ошибся|ошиблась|наоборот|вс[её]-?таки|отмен[аи]\s+предыдущ)/i.test(String(text||''));
  }

  function reconcileRecentUserStatements(messages,original){
    const target=currentTarget();
    const rows=(Array.isArray(messages)?messages:[])
      .filter(m=>m?.role==='user'&&String(m?.text||'').trim())
      .map(m=>String(m.text).trim())
      .filter((x,i,a)=>!(i===a.length-1&&x===String(original||'').trim()))
      .slice(-12);

    const kept=[];
    for(const text of rows){
      const subjects=workSubjects(text,target);
      if(isExplicitCorrection(text)&&subjects.length){
        for(let i=kept.length-1;i>=0;i--){
          const priorSubjects=workSubjects(kept[i],target);
          if(priorSubjects.some(x=>subjects.includes(x)))kept.splice(i,1);
        }
      }
      kept.push(text);
    }
    return kept.slice(-8);
  }

  const coreContext=aiContextPayload;
  aiContextPayload=function(){
    const base=coreContext();
    const topic=typeof frameTopic==='function'?frameTopic():'';
    if(!topic||!Array.isArray(base?.objects))return base;

    const messages=typeof frameProviderChatMessages==='function'?frameProviderChatMessages():[];
    // analyzeAiInput stores the current user bubble before this payload is
    // built. Exclude that newest utterance here: it already travels in `text`
    // and a question ending in «или нет?» must not erase the preceding fact
    // as though it were itself a correction.
    const newestUser=[...(Array.isArray(messages)?messages:[])].reverse().find(m=>m?.role==='user'&&String(m?.text||'').trim());
    const recentUsers=reconcileRecentUserStatements(messages,newestUser?.text||'');

    return {
      ...base,
      current_target:topic,
      conversation_target:typeof frameTopicLabel==='function'?frameTopicLabel():(base.conversation_target||''),
      objects:base.objects,
      recent_user_facts:recentUsers,
      context_scope:'all_objects_with_active_target',
      conversation_rules:[
        'The active object is a fallback only; an explicit object or unique work in the current phrase wins.',
        'Recent user statements are newer than stored progress until the user applies changes.',
        'When the user explicitly corrects a fact, the newest correction replaces the older conflicting fact.',
        'Duplicate work names across objects require clarification and no action.',
        'For an explicit create/add/update/delete request, return structured actions, not prose only.'
      ]
    };
  };

  function cleanWorkName(name){
    return String(name||'')
      .replace(/^(?:ещ[её]\s+)?работ[ау]?\s*[:\-]?\s*/i,'')
      .trim()||'Новая работа';
  }

  function deterministicAddWork(text){
    const original=String(text||'').trim();
    const norm=aiNorm(original);
    // A configured field endpoint is authoritative; never synthesize a local
    // mutation in front of it or after it fails.
    if(typeof aiConfiguredFieldSafe==='function'&&aiConfiguredFieldSafe())return null;
    if(/(?:нов[a-zа-яё0-9_]*\s+объект|созда[a-zа-яё0-9_]*\s+(?:нов[a-zа-яё0-9_]*\s+)?объект|нов[a-zа-яё0-9_]*\s+квартир|нов[a-zа-яё0-9_]*\s+заказчик)/.test(norm))return null;
    if(!/(?:добавь|добавить|допработ|новая\s+работа)/.test(norm))return null;
    const parsed=aiParseWorkAdd(original);
    if(!parsed||parseNum(parsed.price)<=0)return null;

    const target=currentTarget();
    if(!target)return null;

    const quantity=parseNum(parsed.qty)>0?parseNum(parsed.qty):1;
    const unitPrice=parseNum(parsed.price);
    const name=cleanWorkName(parsed.name);
    const unit=String(parsed.unit||'компл.');
    const total=quantity*unitPrice;
    const action={
      type:'add_work',
      object_id:target.object.id,
      order_id:target.order.id,
      work_name:name,
      qty:quantity,
      unit,
      price:unitPrice,
      total
    };
    return {
      result:{
        actions:[action],
        summary:`Добавить работу «${name}» · ${quantity} ${unit} × ${money(unitPrice)} = ${money(total)}`,
        needs_clarification:false,
        confidence:1,
        clarification:''
      },
      meta:{provider:'FRAME deterministic guard',model:'2.7.8',mode:typeof aiEffectiveMode==='function'?aiEffectiveMode(''):'',confirmation_required:true}
    };
  }

  const coreRequest=requestAiBrain;
  requestAiBrain=async function(text){
    const guarded=deterministicAddWork(text);
    if(guarded)return guarded;

    const original=String(text||'').trim();
    // Keep the mutation parser's input limited to the current utterance.
    // History, target and rules already travel in aiContextPayload(). Repeating
    // an older command in `text` can otherwise turn a later read-only question
    // into the same mutation again.
    return coreRequest(original);
  };

  window.frameDeterministicAddWork=deterministicAddWork;
  window.frameReconcileRecentUserStatements=reconcileRecentUserStatements;
  console.info('[FRAME] 2.7.8 AI guard loaded');
})();
