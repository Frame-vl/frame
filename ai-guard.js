'use strict';

// FRAME 2.7.4 AI guard.
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
    return /(?:^|\b)(?:нет\b|поправк|я\s+ошиб|ошибся|ошиблась|наоборот|вс[её]-?таки|отмен[аи]\s+предыдущ)/i.test(String(text||''));
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

    const parts=String(topic).split('|');
    const objectId=parts[0]||'';
    const orderId=parts[1]||'';
    const object=base.objects.find(x=>String(x?.id||'')===objectId);
    if(!object)return base;

    const focused={...object};
    if(orderId&&Array.isArray(object.orders)){
      const order=object.orders.find(x=>String(x?.id||'')===orderId);
      if(order)focused.orders=[order];
    }

    const messages=typeof frameChatMessages==='function'?frameChatMessages():[];
    const recentUsers=reconcileRecentUserStatements(messages,'');

    return {
      ...base,
      current_target:topic,
      conversation_target:typeof frameTopicLabel==='function'?frameTopicLabel():(base.conversation_target||''),
      objects:[focused],
      recent_user_facts:recentUsers,
      context_scope:'active_order_only',
      conversation_rules:[
        'The active object is authoritative until the user explicitly names another object.',
        'Recent user statements are newer than stored progress until the user applies changes.',
        'When the user explicitly corrects a fact, the newest correction replaces the older conflicting fact.',
        'Never switch to an object that is absent from the supplied objects list.',
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
      meta:{provider:'FRAME deterministic guard',model:'2.7.4'}
    };
  }

  const coreRequest=requestAiBrain;
  requestAiBrain=async function(text){
    const guarded=deterministicAddWork(text);
    if(guarded)return guarded;

    const original=String(text||'').trim();
    const target=typeof frameTopicLabel==='function'?frameTopicLabel():'';
    const messages=typeof frameChatMessages==='function'?frameChatMessages():[];
    const recentUsers=reconcileRecentUserStatements(messages,original);

    const internal=[
      '[FRAME INTERNAL CONTEXT]',
      target?`Active object: ${target}`:'',
      'Rules:',
      '- The active object is authoritative until the user explicitly names another object.',
      '- Recent user statements are newer than stored progress until the user applies changes.',
      '- The newest explicit correction replaces an older conflicting fact.',
      '- For an explicit create/add/update/delete request, return structured actions, not prose only.',
      '- For an add-work request, return an add_work action with quantity, unit price and total when they are stated.',
      recentUsers.length?'Recent authoritative user statements:':'',
      ...recentUsers.map(x=>`- ${x}`),
      '[CURRENT USER REQUEST]',
      original
    ].filter(Boolean).join('\n');

    return coreRequest(internal);
  };

  window.frameDeterministicAddWork=deterministicAddWork;
  window.frameReconcileRecentUserStatements=reconcileRecentUserStatements;
  console.info('[FRAME] 2.7.4 AI guard loaded');
})();
