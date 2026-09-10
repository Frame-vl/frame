#!/usr/bin/env python3
from pathlib import Path
import argparse
import voice_object_delete_candidate as base

base.EXPECTED['refresh.html']='63ecd73f60e219c74d3d514ef59c0b0e9e284415346f35811d8c6e83e33ec600'

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--src',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    base.build(a.src.resolve(),a.out.resolve())
