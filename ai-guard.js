'use strict';

// FRAME 2.7.3 AI guard.
// Focuses the model on the locked order and routes obvious add-work commands deterministically.
(function(){
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
    const recentUsers=messages
      .filter(m=>m?.role==='user'&&String(m?.text||'').trim())
      .slice(-8)
      .map(m=>String(m.text).trim());

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

    const key=(typeof frameTopic==='function'&&frameTopic())||routeState.aiTarget||aiDefaultTargetKey();
    const target=aiTargetByKey(key);
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
      meta:{provider:'FRAME deterministic guard',model:'2.7.3'}
    };
  }

  const coreRequest=requestAiBrain;
  requestAiBrain=async function(text){
    const guarded=deterministicAddWork(text);
    if(guarded)return guarded;

    const original=String(text||'').trim();
    const target=typeof frameTopicLabel==='function'?frameTopicLabel():'';
    const messages=typeof frameChatMessages==='function'?frameChatMessages():[];
    const recentUsers=messages
      .filter(m=>m?.role==='user'&&String(m?.text||'').trim())
      .map(m=>String(m.text).trim())
      .filter((x,i,a)=>!(i===a.length-1&&x===original))
      .slice(-8);

    const internal=[
      '[FRAME INTERNAL CONTEXT]',
      target?`Active object: ${target}`:'',
      'Rules:',
      '- The active object is authoritative until the user explicitly names another object.',
      '- Recent user statements are newer than stored progress until the user applies changes.',
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
  console.info('[FRAME] 2.7.3 AI guard loaded');
})();
