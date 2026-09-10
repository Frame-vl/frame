#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse,hashlib,json,shutil

BUILD='2.8.13'
CACHE='2813'
EXPECTED={
 'app.js':'fd882be552a4e56bca5752c0ecfe6d1aef91613f57a5a264c1396df652847740',
 'ai-chat.js':'b0ffae8517388a5c804668f729194936e62eaa914cb6c4d3db7c5942bca494a1',
 'index.html':'90b774d28091dda3b56769a03410841f2738eb72f939d2d887ba2b0f42b479ae',
 'sw.js':'9cee9dafa455e011ab77647a51dba4478a334fc2730e3883047023d66cfb40e3',
 'manifest.webmanifest':'f2ff6ccbe8c6bffb12d1dcf4065327af147222b705e129fc8166f5a2dbd52541',
 'version-fix.js':'c9ccaae968c2ee66c661150188ccb43c5d0353e893b3a3eb5cccd0012f664266',
 'refresh.html':'63ecd73f60e219c74bc01b30067993922e257c684cbe96482087c3c3285a7e991',
}

def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected one anchor, found {n}')
    return text.replace(old,new,1)

def write(p,text): p.write_bytes(text.replace('\r\n','\n').encode('utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def build(src:Path,out:Path):
    for name,expected in EXPECTED.items():
        actual=sha(src/name)
        if actual!=expected: raise RuntimeError(f'refuse production drift {name}: {actual}')
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(src,out,ignore=shutil.ignore_patterns('.git','audit'))

    app=out/'app.js'; chat=out/'ai-chat.js'; index=out/'index.html'; sw=out/'sw.js'; manifest=out/'manifest.webmanifest'; vf=out/'version-fix.js'; refresh=out/'refresh.html'

    a=app.read_text(encoding='utf-8')
    a=once(a,"const VERSION='2.8.12';",f"const VERSION='{BUILD}';",'app version')
    a=once(a,"const reloadKey='frameSwControllerReloadV2812';",f"const reloadKey='frameSwControllerReloadV{CACHE}';",'sw reload key')
    a=once(a,"navigator.serviceWorker.register('./sw.js?v=2812'",f"navigator.serviceWorker.register('./sw.js?v={CACHE}'",'sw register version')
    helper="""async function frameDeleteObjectFromChat(objectId){
  const id=String(objectId||''),object=objects.find(o=>o.id===id);
  if(!object)return {ok:false,error:'Объект уже не найден.'};
  const label=object.contact?.address||object.contact?.name||'Объект',topicKey=typeof frameTopic==='function'?String(frameTopic()||''):'',routeKey=String(routeState.aiTarget||'');
  await dbDelete(id);
  objects=objects.filter(o=>o.id!==id);
  mirrorBackup();
  if(currentObjectId===id){currentObjectId='';currentOrderId=''}
  if(topicKey.startsWith(id+'|')&&typeof frameSetTopic==='function')frameSetTopic('');
  if(routeKey.startsWith(id+'|'))routeState.aiTarget='';
  editorState={key:'',snapshot:null,dirty:false};
  return {ok:true,objectId:id,label};
}
"""
    a=once(a,'function updateOrderPricingLive(){',helper+'function updateOrderPricingLive(){','shared object delete helper')
    old="$('deleteObjectBtn').onclick=async()=>{if(!confirm('Удалить объект вместе со всеми заказами?'))return;await dbDelete(object.id);objects=objects.filter(o=>o.id!==object.id);mirrorBackup();currentObjectId='';currentOrderId='';if(typeof frameSetTopic==='function')frameSetTopic('');editorState={key:'',snapshot:null,dirty:false};commitNavigate('ai');toast('Объект удалён')};"
    new="$('deleteObjectBtn').onclick=async()=>{if(!confirm('Удалить объект вместе со всеми заказами?'))return;const result=await frameDeleteObjectFromChat(object.id);if(!result.ok)return toast(result.error||'Объект не удалён');commitNavigate('ai');toast('Объект удалён')};"
    a=once(a,old,new,'manual delete uses shared helper')
    write(app,a)

    c=chat.read_text(encoding='utf-8')
    c=once(c,"frameMutationClarificationSession='';","frameMutationClarificationSession='',frameObjectDeleteSession=null;",'delete session state')
    gate=r"""
function frameObjectDeleteRequest(text=''){
  const norm=aiNorm(text);
  return /(?:^|\s)(?:удал\w*|снес\w*|убер\w*)(?:\s|$)/.test(norm)&&/(?:объект|карточк)/.test(norm);
}
function frameObjectDeleteAffirm(text=''){
  const norm=aiNorm(text).replace(/[!?.,]+/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:да|ага|угу|подтверждаю|точно|да точно|да уверен|да уверена|да удалить|да удаляй|удали|удаляй)$/.test(norm);
}
function frameObjectDeleteReject(text=''){
  const norm=aiNorm(text).replace(/[!?.,]+/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:нет|не надо|не удаляй|отмена|отмени|стоп|оставь|оставить)$/.test(norm);
}
function frameObjectDeleteNamedObject(text=''){
  const tokens=frameOpenIdentityTokens(text).filter(token=>! /^(?:удал|снес|убер|полност|вообще|навсегд|целик|совсем)/.test(token)),numbers=(aiNorm(text).match(/\d+[a-zа-я]?/g)||[]);
  if(!tokens.length)return {hadIdentity:false,objectId:'',ambiguous:false};
  const seen=new Map();for(const target of aiAllTargets())if(!seen.has(String(target.object?.id||'')))seen.set(String(target.object.id),target.object);
  const scored=[];
  for(const object of seen.values()){
    const hay=aiNorm(`${object.contact?.address||''} ${object.contact?.name||''}`),objectTokens=aiTokens(hay),hits=tokens.filter(token=>hay.includes(token)||objectTokens.some(value=>value.startsWith(token)||token.startsWith(value))).length,addressNumbers=aiNorm(object.contact?.address||'').match(/\d+[a-zа-я]?/g)||[];
    if(!hits)continue;if(numbers.length&&addressNumbers.length&&!numbers.some(value=>addressNumbers.includes(value)))continue;
    scored.push({id:String(object.id),score:hits+(numbers.some(value=>addressNumbers.includes(value))?4:0)});
  }
  const best=Math.max(0,...scored.map(item=>item.score)),matches=scored.filter(item=>item.score===best);
  return {hadIdentity:true,objectId:matches.length===1?matches[0].id:'',ambiguous:matches.length>1};
}
function frameObjectDeleteTarget(text=''){
  const named=frameObjectDeleteNamedObject(text);
  if(named.ambiguous)return {error:'Нашла несколько похожих объектов. Назови точный адрес объекта, который нужно удалить.'};
  if(named.hadIdentity&&!named.objectId)return {error:'Не смогла однозначно найти такой объект. Назови его точный адрес.'};
  let objectId=named.objectId;
  if(!objectId&&/(?:этот|этого|текущ\w*|данн\w*)\s+(?:же\s+)?(?:объект|карточк)/.test(aiNorm(text))){const target=aiTargetByKey(frameTopic()||routeState.aiTarget);objectId=String(target?.object?.id||'')}
  if(!objectId)return {error:'Какой именно объект удалить? Назови точный адрес или скажи «удали этот объект», когда он выбран в чате.'};
  const target=aiAllTargets().find(item=>String(item.object?.id||'')===objectId),object=target?.object;
  if(!object)return {error:'Этот объект уже не найден.'};
  const label=[object.contact?.address,object.contact?.name].map(v=>String(v||'').trim()).filter(Boolean).join(' · ')||'Объект';
  return {objectId,label};
}
function frameObjectDeleteDecision(text=''){
  if(frameObjectDeleteSession&&Date.now()>Number(frameObjectDeleteSession.expiresAt||0))frameObjectDeleteSession=null;
  if(frameObjectDeleteSession){
    const current={...frameObjectDeleteSession};
    if(frameObjectDeleteReject(text)){frameObjectDeleteSession=null;return {handled:true,reply:`Удаление объекта «${current.label}» отменено.`}}
    if(frameObjectDeleteAffirm(text)){
      if(current.stage===1){frameObjectDeleteSession={...current,stage:2,expiresAt:Date.now()+120000};return {handled:true,reply:`Вы уверены? Объект «${current.label}» будет удалён полностью вместе со всеми его заказами, работами, документами, фото и историей. Скажи «Да» ещё раз, чтобы удалить, или «Нет», чтобы отменить.`}}
      frameObjectDeleteSession=null;return {handled:true,execute:true,objectId:current.objectId,label:current.label};
    }
    frameObjectDeleteSession=null;
    if(!frameObjectDeleteRequest(text))return null;
  }
  if(!frameObjectDeleteRequest(text))return null;
  const target=frameObjectDeleteTarget(text);
  if(target.error)return {handled:true,reply:target.error};
  frameObjectDeleteSession={objectId:target.objectId,label:target.label,stage:1,expiresAt:Date.now()+120000};
  return {handled:true,reply:`Ты хочешь полностью удалить объект «${target.label}»? Вместе с ним удалятся все заказы и данные внутри этого объекта. Скажи «Да» для первого подтверждения или «Нет», чтобы отменить.`};
}
async function frameObjectDeleteApplyDecision(decision,turnId,started){
  if(!decision?.handled)return false;
  frameThinking=false;let reply=String(decision.reply||''),outcome='answer';
  if(decision.execute){
    outcome='applied';
    try{
      if(typeof frameDeleteObjectFromChat!=='function')throw new Error('локальная функция удаления недоступна');
      const result=await frameDeleteObjectFromChat(decision.objectId);
      if(!result?.ok)throw new Error(result?.error||'объект не удалён');
      reply=`Объект «${decision.label}» полностью удалён.`;
    }catch(e){outcome='error';reply=`Не удалила объект: ${String(e?.message||e)}.`}
  }
  frameAddChat({role:'assistant',text:reply,status:'done',turnId,trace:{provider:'FRAME local destructive gate',model:VERSION,mode:'local',outcome,round_trip_ms:Math.round(performance.now()-started),proposed_actions:[],policy_blocked_actions:[]}});
  if(route==='ai')render();else frameRefreshChat();
  return true;
}
"""
    c=once(c,"function frameDetectTarget(text=''){",gate+"\nfunction frameDetectTarget(text=''){",'local destructive gate functions')
    old="    frameVoiceSession++;frameHardClearComposer();\n    const detected=frameDetectTarget(text);if(detected)frameSetTopic(detected);else if(frameTopic())routeState.aiTarget=frameTopic();"
    new="    frameVoiceSession++;frameHardClearComposer();\n    const objectDeleteDecision=frameObjectDeleteDecision(text);\n    const detected=objectDeleteDecision?.handled?'':frameDetectTarget(text);if(detected)frameSetTopic(detected);else if(frameTopic())routeState.aiTarget=frameTopic();"
    c=once(c,old,new,'delete intercept before target resolution')
    old="    turnId=uid();started=performance.now();frameAddChat({role:'user',text,status:'done',turnId});frameThinking=true;frameRefreshChat();\n    const localOpen=mutationIntent?null:frameLocalOpenIntent(text);"
    new="    turnId=uid();started=performance.now();frameAddChat({role:'user',text,status:'done',turnId});frameThinking=true;frameRefreshChat();\n    if(await frameObjectDeleteApplyDecision(objectDeleteDecision,turnId,started))return;\n    const localOpen=mutationIntent?null:frameLocalOpenIntent(text);"
    c=once(c,old,new,'delete intercept before provider')
    old="function frameLeaveAi(){clearTimeout(frameComposerWakeTimer);frameComposerWakeTimer=null;frameComposerWakeWanted=false;"
    new="function frameLeaveAi(){frameObjectDeleteSession=null;clearTimeout(frameComposerWakeTimer);frameComposerWakeTimer=null;frameComposerWakeWanted=false;"
    c=once(c,old,new,'cancel destructive session on chat leave')
    write(chat,c)

    h=index.read_text(encoding='utf-8').replace('2.8.12',BUILD).replace('2812',CACHE)
    write(index,h)
    w=sw.read_text(encoding='utf-8')
    w=once(w,"const CACHE='frame-v2812-ownerfix';",f"const CACHE='frame-v{CACHE}-object-delete';",'sw cache')
    w=w.replace('2812',CACHE);write(sw,w)
    m=json.loads(manifest.read_text(encoding='utf-8'));m['start_url']=f'./index.html?v={CACHE}';write(manifest,json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    v=vf.read_text(encoding='utf-8');v=once(v,"const BUILD='2.8.12';",f"const BUILD='{BUILD}';",'published build');write(vf,v)
    write(refresh,refresh.read_text(encoding='utf-8').replace('2812',CACHE))

    ui=out/'tests/ai/ui-harness.html'
    u=ui.read_text(encoding='utf-8')
    u=once(u,"const TARGETS=[TARGET,TARGET2];","let TARGETS=[TARGET,TARGET2];",'mutable ui targets')
    anchor="window.aiAllTargets=()=>TARGETS;"
    stub=anchor+"\nwindow.DELETED_OBJECTS=[];window.frameDeleteObjectFromChat=async objectId=>{const id=String(objectId||''),hit=TARGETS.find(t=>String(t.object.id)===id);if(!hit)return {ok:false,error:'not found'};TARGETS=TARGETS.filter(t=>String(t.object.id)!==id);DELETED_OBJECTS.push(id);return {ok:true,objectId:id,label:hit.object.contact.address};};"
    u=once(u,anchor,stub,'ui delete stub')
    marker="  }catch(e){failures.push('exception: '+(e?.stack||e))}"
    tests=r"""
    // Voice/chat full-object deletion is a local two-confirm destructive gate.
    frameSetTopic(TARGET2.key);routeState.aiTarget=TARGET2.key;
    const providerBeforeDeleteCancel=CAPTURED.length;
    await send('Удали этот объект вообще');
    assert(DELETED_OBJECTS.length===0,'object deleted on initial voice request');
    assert(/Веселковая, 12Б/.test(String(frameChatMessages().at(-1)?.text||'')),'first confirmation did not name exact selected object');
    await send('Нет');
    assert(DELETED_OBJECTS.length===0,'object deleted after explicit cancellation');
    assert(CAPTURED.length===providerBeforeDeleteCancel,'cancelled object deletion reached provider');

    frameSetTopic(TARGET.key);routeState.aiTarget=TARGET.key;
    const providerBeforeDelete=CAPTURED.length;
    await send('Удали этот объект вообще');
    assert(DELETED_OBJECTS.length===0,'object deleted before confirmations');
    assert(/Архангельская, 21/.test(String(frameChatMessages().at(-1)?.text||'')),'first destructive confirmation lost object identity');
    await send('Да');
    assert(DELETED_OBJECTS.length===0,'one yes was enough to delete object');
    assert(/Вы уверены/i.test(String(frameChatMessages().at(-1)?.text||'')),'second destructive confirmation was not requested');
    await send('Да');
    assert(DELETED_OBJECTS.length===1&&DELETED_OBJECTS[0]==='obj-arch','second yes did not delete exactly the confirmed object');
    assert(!aiAllTargets().some(t=>t.object.id==='obj-arch'),'deleted object still exists in local target list');
    assert(CAPTURED.length===providerBeforeDelete,'two-confirm object deletion reached AI provider');

    // A non-confirmation cancels the armed destructive session before ordinary chat continues.
    frameSetTopic(TARGET2.key);routeState.aiTarget=TARGET2.key;
    await send('Удали этот объект вообще');
    const beforeTopicChangeDeletes=DELETED_OBJECTS.length;
    await send('Как дела?');
    assert(DELETED_OBJECTS.length===beforeTopicChangeDeletes,'topic change executed armed object deletion');
    await send('Да');
    assert(DELETED_OBJECTS.length===beforeTopicChangeDeletes,'late yes after topic change resurrected object deletion');
"""
    u=once(u,marker,tests+'\n'+marker,'ui object delete tests')
    write(ui,u)

    ex=out/'tests/ai/executor-harness.html'
    e=ex.read_text(encoding='utf-8')
    marker="  }catch(e){failures.push('exception: '+(e?.stack||e))}"
    ex_tests=r"""
    // Real app helper: physical object deletion is one local IndexedDB delete plus in-memory removal.
    const removable=defaultObject();removable.id='obj-delete-helper';removable.contact.address='Удаляемая, 99';removable.orders[0].id='order-delete-helper';objects.push(normalizeObject(removable));
    let helperDeleteCalls=0,helperDeleteId='';const originalDbDelete=dbDelete;dbDelete=async id=>{helperDeleteCalls++;helperDeleteId=String(id)};
    routeState.aiTarget='obj-delete-helper|order-delete-helper';currentObjectId='obj-delete-helper';currentOrderId='order-delete-helper';
    const helperResult=await frameDeleteObjectFromChat('obj-delete-helper');
    assert(helperResult?.ok===true&&helperDeleteCalls===1&&helperDeleteId==='obj-delete-helper','shared object delete helper did not perform exactly one DB delete');
    assert(!objects.some(item=>item.id==='obj-delete-helper'),'shared object delete helper did not remove object from local state');
    assert(currentObjectId===''&&currentOrderId===''&&routeState.aiTarget==='','shared object delete helper left stale current target');
    dbDelete=originalDbDelete;
"""
    e=once(e,marker,ex_tests+'\n'+marker,'executor object delete helper test')
    write(ex,e)

    final_chat=chat.read_text(encoding='utf-8');final_app=app.read_text(encoding='utf-8')
    checks={
      'version':f"const VERSION='{BUILD}';" in final_app,
      'shared_delete_helper':'async function frameDeleteObjectFromChat(objectId)' in final_app and 'await dbDelete(id)' in final_app,
      'page_session_only':'frameObjectDeleteSession=null' in final_chat and 'frameObjectDeleteSession' not in final_chat[final_chat.find('function frameRetireLegacyAiChatStorage'):final_chat.find('frameRetireLegacyAiChatStorage();')],
      'two_confirm':'stage:2' in final_chat and 'Скажи «Да» ещё раз' in final_chat,
      'provider_bypass':'if(await frameObjectDeleteApplyDecision(objectDeleteDecision,turnId,started))return;' in final_chat,
      'leave_cancels':'function frameLeaveAi(){frameObjectDeleteSession=null;' in final_chat,
      'sw_cache':f"const CACHE='frame-v{CACHE}-object-delete';" in sw.read_text(encoding='utf-8'),
      'manifest':json.loads(manifest.read_text(encoding='utf-8'))['start_url']==f'./index.html?v={CACHE}',
    }
    if not all(checks.values()): raise RuntimeError('candidate invariant failed '+json.dumps(checks,ensure_ascii=False))
    report={'state':'VOICE_OBJECT_DELETE_CANDIDATE_BUILT','build':BUILD,'checks':checks,'source_sha256':EXPECTED,'candidate_sha256':{name:sha(out/name) for name in EXPECTED},'production_changed':False,'owner_db_accessed':False}
    (out/'voice-object-delete-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--src',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();build(a.src.resolve(),a.out.resolve())
