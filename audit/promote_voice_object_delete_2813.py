#!/usr/bin/env python3
from __future__ import annotations
import base64,hashlib,json,os,sys,time,urllib.error,urllib.request
from pathlib import Path

REPO='Frame-vl/frame'
API='https://api.github.com'
EXPECTED_MAIN='4ab2abf189c671c1fc5bcce58f2eaf480a39798b'
FILES=('app.js','ai-chat.js','index.html','sw.js','manifest.webmanifest','version-fix.js','refresh.html')

def sha256_bytes(raw:bytes)->str:return hashlib.sha256(raw).hexdigest()
def sha256_path(path:Path)->str:return sha256_bytes(path.read_bytes())

def api(path:str,method='GET',payload=None):
    token=os.environ.get('GITHUB_TOKEN','').strip()
    if not token: raise RuntimeError('GITHUB_TOKEN missing')
    data=None if payload is None else json.dumps(payload,separators=(',',':')).encode('utf-8')
    req=urllib.request.Request(API+path,data=data,method=method,headers={
        'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28','User-Agent':'frame-2813-promoter','Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            raw=r.read();return json.loads(raw.decode('utf-8')) if raw else None
    except urllib.error.HTTPError as exc:
        body=exc.read().decode('utf-8','replace')[:2000]
        raise RuntimeError(f'GitHub API {exc.code} {path}: {body}') from exc

def public_bytes(path:str,nonce:str)->bytes:
    url=f'https://frame-vl.github.io/frame/{path}?v=2813&verify={nonce}'
    req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','Pragma':'no-cache','User-Agent':'frame-2813-pages-check'})
    with urllib.request.urlopen(req,timeout=30) as r:
        if r.status!=200: raise RuntimeError(f'public {path} status {r.status}')
        return r.read()

def main():
    if len(sys.argv)!=3: raise SystemExit('usage: promote_voice_object_delete_2813.py STAGED_DIR SOURCE_MAIN_DIR')
    staged=Path(sys.argv[1]).resolve();source=Path(sys.argv[2]).resolve()
    report_path=staged/'voice-object-delete-report.json'
    if not report_path.exists(): raise RuntimeError('candidate report missing')
    report=json.loads(report_path.read_text(encoding='utf-8-sig'))
    if report.get('state')!='VOICE_OBJECT_DELETE_CANDIDATE_BUILT' or report.get('build')!='2.8.13':
        raise RuntimeError('candidate report identity mismatch')
    expected_source=report.get('source_sha256') or {};expected_candidate=report.get('candidate_sha256') or {}
    if set(expected_candidate)!=set(FILES) or set(expected_source)!=set(FILES):
        raise RuntimeError('candidate/source report file set mismatch')
    for name in FILES:
        if sha256_path(source/name)!=expected_source[name]: raise RuntimeError(f'main checkout bytes drifted: {name}')
        if sha256_path(staged/name)!=expected_candidate[name]: raise RuntimeError(f'staged candidate bytes drifted: {name}')

    branch=api(f'/repos/{REPO}/branches/main');current=str(branch['commit']['sha'])
    if current!=EXPECTED_MAIN: raise RuntimeError(f'main drifted before promotion: {current}')
    commit=api(f'/repos/{REPO}/git/commits/{current}');base_tree=str(commit['tree']['sha'])
    tree=[]
    for name in FILES:
        raw=(staged/name).read_bytes()
        blob=api(f'/repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(raw).decode('ascii'),'encoding':'base64'})
        tree.append({'path':name,'mode':'100644','type':'blob','sha':blob['sha']})
    new_tree=api(f'/repos/{REPO}/git/trees','POST',{'base_tree':base_tree,'tree':tree})
    new_commit=api(f'/repos/{REPO}/git/commits','POST',{
        'message':'FRAME 2.8.13: two-confirm voice object deletion','tree':new_tree['sha'],'parents':[current]})
    new_sha=str(new_commit['sha'])
    api(f'/repos/{REPO}/git/refs/heads/main','PATCH',{'sha':new_sha,'force':False})
    after=str(api(f'/repos/{REPO}/branches/main')['commit']['sha'])
    if after!=new_sha: raise RuntimeError(f'main did not land on created commit: {after}')
    print('MAIN_PUBLISHED '+json.dumps({'old':current,'new':new_sha,'files':list(FILES),'audit_files_published':False},ensure_ascii=False))

    # GitHub Pages may trail main. Verify the exact seven candidate byte streams.
    deadline=time.time()+180;last={}
    while time.time()<deadline:
        all_ok=True;last={}
        for name in FILES:
            try:
                raw=public_bytes(name,new_sha);actual=sha256_bytes(raw);ok=actual==expected_candidate[name]
                last[name]={'ok':ok,'sha256':actual,'bytes':len(raw)}
                if not ok: all_ok=False
            except Exception as exc:
                last[name]={'ok':False,'error':str(exc)[:240]};all_ok=False
        if all_ok:
            print('PAGES_VERIFIED '+json.dumps({'state':'VOICE_OBJECT_DELETE_PAGES_VERIFIED','commit':new_sha,'build':'2.8.13','files':last,'owner_db_accessed':False,'native_ios_voice_verified':False},ensure_ascii=False))
            return
        time.sleep(5)
    raise RuntimeError('Pages did not converge to exact 2.8.13 bytes: '+json.dumps(last,ensure_ascii=False))

if __name__=='__main__':main()
