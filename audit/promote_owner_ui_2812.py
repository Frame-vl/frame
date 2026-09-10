#!/usr/bin/env python3
from __future__ import annotations
import base64,hashlib,json,os,sys,time,urllib.error,urllib.request
from pathlib import Path

REPO='Frame-vl/frame'
API='https://api.github.com'
EXPECTED_MAIN='59121f2a15b0cad803a27e50cda52acf58601caf'
FILES={
 'app.js':'fd882be552a4e56bca5752c0ecfe6d1aef91613f57a5a264c1396df652847740',
 'ai-chat.js':'b0ffae8517388a5c804668f729194936e62eaa914cb6c4d3db7c5942bca494a1',
 'index.html':'90b774d28091dda3b56769a03410841f2738eb72f939d2d887ba2b0f42b479ae',
 'sw.js':'9cee9dafa455e011ab77647a51dba4478a334fc2730e3883047023d66cfb40e3',
 'manifest.webmanifest':'f2ff6ccbe8c6bffb12d1dcf4065327af147222b705e129fc8166f5a2dbd52541',
 'version-fix.js':'c9ccaae968c2ee66c661150188ccb43c5d0353e893b3a3eb5cccd0012f664266',
 'refresh.html':'63ecd73f60e219c74bc01b30067993922e257c684cbe96482087c3c3285a7e991',
}

def api(path,method='GET',payload=None):
    token=os.environ.get('GITHUB_TOKEN','').strip()
    if not token: raise RuntimeError('GITHUB_TOKEN missing')
    data=None if payload is None else json.dumps(payload,separators=(',',':')).encode('utf-8')
    req=urllib.request.Request(API+path,data=data,method=method,headers={
        'Authorization':'Bearer '+token,
        'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'frame-owner-ui-promoter',
        'Content-Type':'application/json',
    })
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            raw=r.read()
            return json.loads(raw.decode('utf-8')) if raw else None
    except urllib.error.HTTPError as e:
        body=e.read().decode('utf-8','replace')[:2000]
        raise RuntimeError(f'GitHub API {e.code} {path}: {body}') from e

def sha256(path:Path): return hashlib.sha256(path.read_bytes()).hexdigest()

def public_bytes(path,commit):
    url=f'https://frame-vl.github.io/frame/{path}?ownerfix={commit}'
    req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','Pragma':'no-cache','User-Agent':'frame-owner-ui-postcheck'})
    with urllib.request.urlopen(req,timeout=30) as r:
        if r.status!=200: raise RuntimeError(f'public {path} status {r.status}')
        return r.read()

def main():
    if len(sys.argv)!=2: raise SystemExit('usage: promote_owner_ui_2812.py STAGED_DIR')
    staged=Path(sys.argv[1]).resolve()
    for path,expected in FILES.items():
        p=staged/path
        if not p.exists(): raise RuntimeError(f'staged file missing: {path}')
        actual=sha256(p)
        if actual!=expected: raise RuntimeError(f'staged hash mismatch {path}: {actual}')
    branch=api(f'/repos/{REPO}/branches/main')
    current=str(branch['commit']['sha'])
    if current!=EXPECTED_MAIN: raise RuntimeError(f'main drifted before atomic publish: {current}')
    commit=api(f'/repos/{REPO}/git/commits/{current}')
    base_tree=str(commit['tree']['sha'])
    tree=[]
    for path in FILES:
        raw=(staged/path).read_bytes()
        blob=api(f'/repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(raw).decode('ascii'),'encoding':'base64'})
        tree.append({'path':path,'mode':'100644','type':'blob','sha':blob['sha']})
    new_tree=api(f'/repos/{REPO}/git/trees','POST',{'base_tree':base_tree,'tree':tree})
    new_commit=api(f'/repos/{REPO}/git/commits','POST',{
        'message':'FRAME 2.8.12: owner field fixes and PWA refresh',
        'tree':new_tree['sha'],'parents':[current],
    })
    new_sha=str(new_commit['sha'])
    api(f'/repos/{REPO}/git/refs/heads/main','PATCH',{'sha':new_sha,'force':False})
    after=api(f'/repos/{REPO}/branches/main')
    if str(after['commit']['sha'])!=new_sha: raise RuntimeError('main ref did not move to created commit')
    print('MAIN_PUBLISHED '+json.dumps({'old':current,'new':new_sha,'files':list(FILES),'audit_files_published':False},ensure_ascii=False))

    deadline=time.time()+150
    last={}
    while time.time()<deadline:
        last={}
        all_ok=True
        for path,expected in FILES.items():
            try:
                raw=public_bytes(path,new_sha)
                actual=hashlib.sha256(raw).hexdigest()
                ok=actual==expected
                last[path]={'ok':ok,'sha256':actual,'bytes':len(raw)}
                if not ok: all_ok=False
            except Exception as exc:
                last[path]={'ok':False,'error':str(exc)[:300]};all_ok=False
        if all_ok:
            print('PAGES_VERIFIED '+json.dumps({'state':'OWNER_UI_PAGES_PROMOTED_VERIFIED','commit':new_sha,'files':last,'native_ios_first_launch_verified':False,'owner_db_accessed':False},ensure_ascii=False))
            return
        time.sleep(5)
    raise RuntimeError('GitHub Pages did not converge to exact 2.8.12 bytes: '+json.dumps(last,ensure_ascii=False))

if __name__=='__main__': main()
