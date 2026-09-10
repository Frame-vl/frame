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

def precise_once(text,old,new,label):
    if label=='delete session state':
        anchor="frameMutationClarificationSession='';\nlet frameVoiceEndWaiter=null;"
        replacement="frameMutationClarificationSession='',frameObjectDeleteSession=null;\nlet frameVoiceEndWaiter=null;"
        count=text.count(anchor)
        if count!=1: raise RuntimeError(f'{label}: precise declaration anchor count {count}')
        return text.replace(anchor,replacement,1)
    return _original_once(text,old,new,label)

base.once=precise_once

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--src',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    base.build(a.src.resolve(),a.out.resolve())
