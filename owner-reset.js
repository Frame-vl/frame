/* Owner-requested one-time preparation, 2026-09-07. No provider calls. */
const FRAME_OWNER_RESET_KEY='frameOwnerReset20260907';
const FRAME_OWNER_RESET_BACKUP='frameOwnerResetBackup20260907';
function frameOwnerResetRecord(){return JSON.parse(localStorage.getItem(FRAME_OWNER_RESET_KEY)||'null')}
function frameOwnerRetiredIds(){return new Set(frameOwnerResetRecord()?.deletedIds||[])}
function frameOwnerResetPlan(source){
  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е');
  const oct=source.filter(o=>/октябрьск/.test(norm(o.contact?.address))&&/(?:^|\D)16(?:\D|$)/.test(o.contact?.address||'')&&/(?:^|\s)екатерина(?:\s|$)/.test(norm(o.contact?.name)));
  const score=o=>{const orders=o.orders||[],works=orders.flatMap(q=>q.works||[]);return [works.filter(w=>String(w.name||'').trim()).length,works.filter(w=>Number(w.qty)>0&&Number(w.price)>0).length,orders.reduce((s,q)=>s+(q.photos||[]).length+(q.documentHistory||[]).length,0),String(o.contact?.phone||'').length>0?1:0]};
  oct.sort((a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return String(a.id).localeCompare(String(b.id))});
  const keep=oct[0],deletedIds=oct.slice(1).map(o=>o.id);
  const chosen=source.filter(o=>o.id===keep?.id||(/архангельск/.test(norm(o.contact?.address))&&/(?:^|\D)21(?:\D|$)/.test(o.contact?.address||'')&&/^денис(?:\s|$)/.test(norm(o.contact?.name))));
  const upserts=chosen.map(raw=>{const o=JSON.parse(JSON.stringify(raw));o.status='work';o.legacyMeta={...o.legacyMeta,ownerReset20260907:true};for(const q of o.orders||[]){q.status='work';q.completedAt='';for(const w of q.works||[]){w.progressPct=0;w.closedAmount=0;w.fromPct=0;w.toPct=0;w.progressNote=''}q.workClosures=[];q.documentHistory=(q.documentHistory||[]).filter(d=>d.type==='proposal');}return o});
  return {upserts,deletedIds,keptId:keep?.id||'',before:source.filter(o=>chosen.includes(o)||deletedIds.includes(o.id))};
}
async function framePrepareOwnerRetest(){
  const record=frameOwnerResetRecord();if(record?.status==='done')return;
  const source=await dbAll(),plan=frameOwnerResetPlan(source);if(!plan.before.length)return;
  // Full original objects, including photos and financial history, must persist first.
  if(!localStorage.getItem(FRAME_OWNER_RESET_BACKUP)){
    const backup=JSON.stringify({format:'FRAME_OWNER_RESET_BACKUP',at:now(),objects:plan.before});
    localStorage.setItem(FRAME_OWNER_RESET_BACKUP,backup);
    if(localStorage.getItem(FRAME_OWNER_RESET_BACKUP)!==backup)throw new Error('Резервная копия карточек не сохранена');
  }
  const retired=[...new Set([...(record?.deletedIds||[]),...plan.deletedIds])];
  localStorage.setItem(FRAME_OWNER_RESET_KEY,JSON.stringify({status:'prepared',deletedIds:retired,keptId:plan.keptId}));
  const changed=plan.upserts.filter(o=>!source.find(s=>s.id===o.id)?.legacyMeta?.ownerReset20260907);
  for(const o of changed)o.updatedAt=aiNextObjectRevision(source.find(s=>s.id===o.id).updatedAt);
  await dbApplyBatch(changed,plan.deletedIds,new Map(plan.before.map(o=>[o.id,o.updatedAt||''])));
  const after=await dbAll();
  if(plan.deletedIds.some(id=>after.some(o=>o.id===id))||changed.some(o=>JSON.stringify(after.find(x=>x.id===o.id))!==JSON.stringify(o)))throw new Error('Очистка карточек не подтверждена контрольным чтением');
  localStorage.setItem(FRAME_OWNER_RESET_KEY,JSON.stringify({status:'done',deletedIds:retired,keptId:plan.keptId,resetIds:plan.upserts.map(o=>o.id),at:now()}));
  await reloadObjects();
}
