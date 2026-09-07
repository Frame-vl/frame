const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../owner-reset.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const row={id:'w',name:'Кухня',qty:'1',price:'45000',progressPct:100,closedAmount:45000};
const obj=(id,address,name,count)=>({id,updatedAt:'old',contact:{address,name},orders:[{id:'q'+id,status:'done',works:Array.from({length:count},(_,i)=>({...row,id:'w'+i})),workClosures:[{id:'c'}],documentHistory:[{type:'proposal',id:'p'},{type:'act',id:'a'}],payments:[{id:'paid',amount:500}],photos:[{id:'photo',data:'keep'}]}]});
const fixture=[obj('arch','Архангельское 21, корпус 5','Денис',3),obj('less','Владивосток, улица Октябрьская, 16','Екатерина',1),obj('full','Октябрьская 16','Екатерина',5),obj('other','Веселковая 23Б','Анатолий',2),obj('wrong','Октябрьская 160','Екатерина',9)];
function setup({quota=false,failWrite=false}={}){let data=clone(fixture),writes=0;const storage=new Map(),c={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(quota)throw Error('quota');storage.set(k,v)}},now:()=> 'new',aiNextObjectRevision:()=> 'new',dbAll:async()=>clone(data),dbApplyBatch:async(up,del,expected)=>{if(failWrite)throw Error('revision');for(const [id,rev]of expected)assert.equal(data.find(x=>x.id===id)?.updatedAt,rev);writes++;data=data.filter(x=>!del.includes(x.id));for(const o of up){data=data.filter(x=>x.id!==o.id);data.push(clone(o))}},reloadObjects:async()=>{}};vm.createContext(c);vm.runInContext(source,c);return {c,storage,data:()=>data,writes:()=>writes};}
(async()=>{
let t=setup();await t.c.framePrepareOwnerRetest();assert.equal(t.data().filter(o=>o.id==='less').length,0);assert.equal(t.c.frameOwnerRetiredIds().has('less'),true);
for(const id of ['arch','full']){const q=t.data().find(o=>o.id===id).orders[0];assert(q.works.every(w=>w.progressPct===0&&w.closedAmount===0));assert.equal(q.workClosures.length,0);assert.deepEqual(q.documentHistory,[{type:'proposal',id:'p'}]);assert.deepEqual(q.payments,fixture.find(o=>o.id===id).orders[0].payments);assert.deepEqual(q.photos,fixture.find(o=>o.id===id).orders[0].photos)}
for(const id of ['other','wrong'])assert.deepEqual(t.data().find(o=>o.id===id),fixture.find(o=>o.id===id));
const backup=JSON.parse(t.storage.get('frameOwnerResetBackup20260907'));assert.deepEqual(backup.objects,fixture.filter(o=>['arch','less','full'].includes(o.id)));
t.data().find(o=>o.id==='full').orders[0].works[0].progressPct=50;await t.c.framePrepareOwnerRetest();assert.equal(t.writes(),1);assert.equal(t.data().find(o=>o.id==='full').orders[0].works[0].progressPct,50);
t=setup({quota:true});await assert.rejects(t.c.framePrepareOwnerRetest(),/quota/);assert.equal(t.writes(),0);assert.deepEqual(t.data(),fixture);
t=setup({failWrite:true});await assert.rejects(t.c.framePrepareOwnerRetest(),/revision/);assert.equal(t.writes(),0);assert.deepEqual(t.data(),fixture);assert(t.storage.has('frameOwnerResetBackup20260907'));
console.log('PASS: duplicate selection, zero progress/closures, proposal/payment/photo preservation, address isolation, full backup, idempotence, quota failure, write conflict, deleted-ID protection');
})().catch(e=>{console.error(e);process.exit(1)});
