#!/usr/bin/env python3
from pathlib import Path
import argparse,importlib.util

builder_path=Path(__file__).with_name('voice_object_delete_candidate.py').resolve()
spec=importlib.util.spec_from_file_location('voice_object_delete_candidate_lib',builder_path)
if spec is None or spec.loader is None: raise RuntimeError(f'cannot load builder: {builder_path}')
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.EXPECTED['refresh.html']='63ecd73f60e219c74d3d514ef59c0b0e9e284415346f35811d8c6e83e33ec600'
_original_once=base.once

def exact_replace(text,old,new,label):
    count=text.count(old)
    if count!=1: raise RuntimeError(f'{label}: expected one generated fragment, found {count}')
    return text.replace(old,new,1)

def precise_once(text,old,new,label):
    if label=='delete session state':
        anchor="frameMutationClarificationSession='';\nlet frameVoiceEndWaiter=null;"
        replacement="frameMutationClarificationSession='',frameObjectDeleteSession=null;\nlet frameVoiceEndWaiter=null;"
        count=text.count(anchor)
        if count!=1: raise RuntimeError(f'{label}: precise declaration anchor count {count}')
        return text.replace(anchor,replacement,1)
    if label=='executor object delete helper test':
        anchor="  }catch(error){failures.push('exception: '+(error?.stack||error))}"
        count=text.count(anchor)
        if count!=1: raise RuntimeError(f'{label}: precise executor anchor count {count}')
        if not new.endswith(old): raise RuntimeError(f'{label}: generated payload shape changed')
        payload=new[:-len(old)]
        return text.replace(anchor,payload+anchor,1)
    if label=='local destructive gate functions':
        new=exact_replace(new,r"/(?:^|\s)(?:удал\w*|снес\w*|убер\w*)(?:\s|$)/",r"/(?:^|\s)(?:удал[a-zа-яё]*|снес[a-zа-яё]*|убер[a-zа-яё]*)(?:\s|$)/i",'Cyrillic destructive verb matcher')
        new=exact_replace(new,r"/(?:этот|этого|текущ\w*|данн\w*)\s+(?:же\s+)?(?:объект|карточк)/",r"/(?:этот|этого|текущ[a-zа-яё]*|данн[a-zа-яё]*)\s+(?:же\s+)?(?:объект|карточк)/i",'Cyrillic current-object matcher')
        new=exact_replace(new,"frameThinking=false;let reply=String(decision.reply||''),outcome='answer';","frameThinking=false;let reply=String(decision.reply||''),outcome='answer',didDelete=false;",'delete decision render state')
        new=exact_replace(new,"if(!result?.ok)throw new Error(result?.error||'объект не удалён');\n      reply=`Объект «${decision.label}» полностью удалён.`;","if(!result?.ok)throw new Error(result?.error||'объект не удалён');\n      didDelete=true;\n      reply=`Объект «${decision.label}» полностью удалён.`;",'delete success marker')
        new=exact_replace(new,"if(route==='ai')render();else frameRefreshChat();","if(didDelete&&route==='ai')render();else frameRefreshChat();",'preserve confirmation session before delete')
        return _original_once(text,old,new,label)
    return _original_once(text,old,new,label)

base.once=precise_once

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--src',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    out=a.out.resolve()
    base.build(a.src.resolve(),out)
    ci=out/'tests/ai/ci.py'
    text=ci.read_text(encoding='utf-8')
    old='"ui": ("ui-harness.html", "FRAME_UI_E2E_PASS", 10000),'
    new='"ui": ("ui-harness.html", "FRAME_UI_E2E_PASS", 60000),'
    if text.count(old)!=1: raise RuntimeError('isolated UI virtual-time anchor changed')
    ci.write_text(text.replace(old,new,1),encoding='utf-8',newline='\n')
