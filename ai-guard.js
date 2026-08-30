'use strict';

// FRAME 2.7.3 AI guard.
// Keeps the model focused on the active object and makes recent user facts
// visible even when the backend prompt compacts unknown context fields.
(function(){
  const coreContext=aiContextPayload;
  aiContextPayload=function(){
    const base=coreContext();
    const topic=typeof frameTopic==='function'?frameTopic():'';
    if(!topic||!Array.isArray(base?.objects))return base;

    const parts=String(topic).split('::');
    const objectId=parts[0]||'';
    const orderId=parts[1]||'';
    const object=base.objects.find(x=>String(x?.id||'')===objectId);
    if(!object)return base;

    const focused={...object};
    if(orderId&&Array.isArray(object.orders)){
      const order=object.orders.find(x=>String(x?.id||'')===orderId);
      if(order)focused.orders=[order];
    }

    return {
      ...base,
      current_target:topic,
      conversation_target:typeof frameTopicLabel==='function'?frameTopicLabel():(base.conversation_target||''),
      objects:[focused],
      context_scope:'active_object_only'
    };
  };

  const coreRequest=requestAiBrain;
  requestAiBrain=async function(text){
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

  console.info('[FRAME] 2.7.3 AI guard loaded');
})();
