#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse,hashlib,json,shutil

BUILD='2.8.12'
CACHE='2812'
SRC_VERSION="const VERSION='2.8.11';"


def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 anchor, found {n}')
    return text.replace(old,new,1)


def build(src:Path,out:Path):
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(src,out,ignore=shutil.ignore_patterns('.git','audit'))
    app=out/'app.js'; chat=out/'ai-chat.js'; index=out/'index.html'; sw=out/'sw.js'; manifest=out/'manifest.webmanifest'; vf=out/'version-fix.js'; refresh=out/'refresh.html'
    originals={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (app,chat,index,sw,manifest,vf,refresh)}

    a=app.read_text(encoding='utf-8')
    a=once(a,SRC_VERSION,f"const VERSION='{BUILD}';",'app version')
    a=once(a,'<div class="aiBadge">SOLO · 2.6</div>',f'<div class="aiBadge">FRAME · ${{esc(VERSION)}}</div>','direct current badge')
    old="if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=2811',{updateViaCache:'none'}).catch(console.warn);"
    new="""if('serviceWorker'in navigator){const reloadKey='frameSwControllerReloadV2812';navigator.serviceWorker.addEventListener('controllerchange',()=>{try{if(sessionStorage.getItem(reloadKey)!=='1'){sessionStorage.setItem(reloadKey,'1');location.reload()}}catch(e){}});navigator.serviceWorker.register('./sw.js?v=2812',{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn);}"""
    a=once(a,old,new,'service worker registration freshness')
    app.write_text(a,encoding='utf-8',newline='\n')

    c=chat.read_text(encoding='utf-8')
    c=once(c,"if(!open||!subject)return null;","if(!open)return null;",'short open gate')
    old="const exactKey=frameUniqueNamedTarget(raw),objectResolution=frameResolveNamedObject(raw);let key=exactKey;"
    new="const exactKey=frameUniqueNamedTarget(raw),objectResolution=frameResolveNamedObject(raw);if(!subject&&!(objectResolution.named&&objectResolution.objectId))return null;let key=exactKey;"
    c=once(c,old,new,'named object open gate')
    old="return {text:`Вот карточка объекта «${address}».`,links:[{kind:'object',objectId,orderId,label:'Открыть объект'}]};"
    new="const autoOpen=/(?:^|\\s)(?:открой|открыть)(?:\\s|$)/.test(norm)&&!!objectResolution.named?{objectId,orderId}:null;return {text:`Открываю карточку объекта «${address}».`,links:[{kind:'object',objectId,orderId,label:'Открыть объект'}],autoOpen};"
    c=once(c,old,new,'direct object auto-open result')
    old="if(localOpen){frameAddChat({role:'assistant',text:localOpen.text,status:'done',turnId,links:localOpen.links,trace:{provider:'FRAME local navigation',model:VERSION,mode:'local',outcome:'answer',round_trip_ms:Math.round(performance.now()-started),proposed_actions:[],policy_blocked_actions:[]}});return}"
    new="if(localOpen){frameAddChat({role:'assistant',text:localOpen.text,status:'done',turnId,links:localOpen.links,trace:{provider:'FRAME local navigation',model:VERSION,mode:'local',outcome:'answer',round_trip_ms:Math.round(performance.now()-started),proposed_actions:[],policy_blocked_actions:[]}});if(localOpen.autoOpen)setTimeout(()=>frameOpenObjectRef(localOpen.autoOpen.objectId,localOpen.autoOpen.orderId),0);return}"
    c=once(c,old,new,'auto-open execution')
    chat.write_text(c,encoding='utf-8',newline='\n')

    h=index.read_text(encoding='utf-8')
    h=h.replace('2.8.11-hotfix1',BUILD).replace('2.8.11 Hotfix 1',BUILD).replace('2811h1',CACHE)
    index.write_text(h,encoding='utf-8',newline='\n')

    w=sw.read_text(encoding='utf-8')
    w=w.replace("const CACHE='frame-v2811-hotfix1';",f"const CACHE='frame-v{CACHE}-ownerfix';")
    w=w.replace('2811h1',CACHE)
    sw.write_text(w,encoding='utf-8',newline='\n')

    m=json.loads(manifest.read_text(encoding='utf-8'))
    m['start_url']=f'./index.html?v={CACHE}'
    manifest.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')

    v=vf.read_text(encoding='utf-8').replace("const BUILD='2.8.11-hotfix1';",f"const BUILD='{BUILD}';")
    vf.write_text(v,encoding='utf-8',newline='\n')
    r=refresh.read_text(encoding='utf-8').replace('2811h1',CACHE)
    refresh.write_text(r,encoding='utf-8',newline='\n')

    # Candidate-only invariants. Never accept a UI build where the historical
    # SOLO 2.6 badge remains or short object open still requires a subject word.
    final_app=app.read_text(encoding='utf-8'); final_chat=chat.read_text(encoding='utf-8'); final_sw=sw.read_text(encoding='utf-8')
    checks={
      'version_exact':f"const VERSION='{BUILD}';" in final_app,
      'no_solo_26':'SOLO · 2.6' not in final_app,
      'short_open_relaxed':'if(!open||!subject)return null;' not in final_chat,
      'short_open_unique_guard':'!subject&&!(objectResolution.named&&objectResolution.objectId)' in final_chat,
      'auto_open_exec':'frameOpenObjectRef(localOpen.autoOpen.objectId,localOpen.autoOpen.orderId)' in final_chat,
      'sw_network_first':"fetch(event.request,{cache:'no-store'})" in final_sw,
      'sw_controller_reload':'controllerchange' in final_app,
      'cache_version':f"const CACHE='frame-v{CACHE}-ownerfix';" in final_sw,
      'manifest_version':json.loads(manifest.read_text(encoding='utf-8'))['start_url']==f'./index.html?v={CACHE}',
    }
    if not all(checks.values()): raise RuntimeError('candidate invariant failed: '+json.dumps(checks,ensure_ascii=False))
    report={'state':'OWNER_UI_CANDIDATE_BUILT','build':BUILD,'checks':checks,'original_sha256':originals,'candidate_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (app,chat,index,sw,manifest,vf,refresh)},'working_main_changed':False,'owner_db_accessed':False}
    (out/'owner-ui-candidate-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--src',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();build(a.src.resolve(),a.out.resolve())
