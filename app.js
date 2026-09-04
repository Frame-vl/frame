Warning: truncated output (original token count: 81480)
Total output lines: 1357

'use strict';
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
const VERSION='2.8.2';
const DB_NAME='FRAME_DB';
const DB_VERSION=2;
const STORE='objects';
const BACKUP_KEY='frameObjectsBackupV180';
const OLD_BACKUP_KEYS=['frameObjectsBackupV170','frameObjectsBackupV160','frameObjectsBackupV150','frameObjectsBackupV140','frameObjectsV140'];
const RATE_KEY='frameRatesV180';
const OLD_RATE_KEYS=['frameRatesV170','frameRatesV160'];
const PROFILE_KEY='frameProfileV180';
const OLD_PROFILE_KEYS=['frameProfileV170'];
const EXPORT_PRIVATE_KEY='frameExportPrivateV180';
const CUSTOM_FLOOR_KEY='frameCustomFloorV180';
const GENERAL_EXPENSES_KEY='frameGeneralExpensesV180';
const FINANCE_PERIOD_KEY='frameFinancePeriodV180';
const AUG2026_SEED_KEY='frameAug2026CurrentObjectsV201';
const MONTHLY_GOAL_KEY='frameMonthlyNetGoalV202';
const UX202_DATA_KEY='frameUx202DataPatch';
const WORKFLOW210_DATA_KEY='frameWorkflow210DataPatch';
const WORKFLOW220_DATA_KEY='frameWorkflow220DataPatch';
const CURRENT230_DATA_KEY='frameCurrent230DataPatch';
const AI_LOG_KEY='frameAiLogV240';
const SOLO260_DATA_KEY='frameSolo260FieldReset';
const RETIRED_CONTENT_PATCH_KEYS=[
  AUG2026_SEED_KEY,
  UX202_DATA_KEY,
  WORKFLOW210_DATA_KEY,
  WORKFLOW220_DATA_KEY,
  CURRENT230_DATA_KEY,
  SOLO260_DATA_KEY
];

let db=null;
let objects=[];
let currentObjectId='';
let currentOrderId='';
let route='ai';
let routeState={};
let saveTimer=null;
const MANUAL_EDIT_ROUTES=new Set(['object','order','works','floor','doors','purchases','expenses','payments','photos']);
let editorState={key:'',snapshot:null,dirty:false};
let sheetCloseHandler=null;
let importCandidate=null;
let reviewRows=[];
let documentContext={};
let aiDraft=null;
let aiRecognition=null;
let frameLastApplyReceipt=null;
let customFloorCovers=loadCustomFloorCovers();
let generalExpenses=loadGeneralExpenses();

const DEFAULT_PROFILE={
  firstName:'Николай',lastName:'',middleName:'',phone:'8 913 558-13-11',city:'Владивосток',
  passportSeries:'',passportNumber:'',passportIssuedBy:'',passportIssuedDate:'',passportCode:'',registrationAddress:''
};

const DEFAULT_RATES={
  'floor.spc.straight':600,'floor.spc.eng':1100,'floor.spc.fr':0,'floor.spc.corner':0,'floor.spc.complex':0,
  'floor.laminate.straight':600,'floor.laminate.eng':1100,'floor.laminate.fr':0,'floor.laminate.corner':0,'floor.laminate.complex':0,
  'floor.laminate12.straight':0,'floor.laminate12.eng':0,'floor.laminate12.fr':0,'floor.laminate12.corner':0,'floor.laminate12.complex':0,
  'floor.glue.straight':800,'floor.glue.eng':850,'floor.glue.fr':0,'floor.glue.corner':0,'floor.glue.complex':0,
  'floor.linoleum.straight':500,'floor.carpet.straight':500,
  'floor.baseboard.pvc':300,'floor.baseboard.mdf':500,'floor.baseboard.micro':400,'floor.baseboard.duro':800,
  'floor.demo.lino':150,'floor.demo.lock.discard':200,'floor.demo.lock.save':300,'floor.demo.glue':400,'floor.demo.glue.hard':1000,
  'floor.demo.baseboard.pvc':150,'floor.demo.baseboard.mdf':300,'floor.demo.baseboard.duro':300,
  'floor.prep.primer':75,'floor.prep.clean':200,'floor.prep.sand.local':100,'floor.prep.sand.full':300,
  'floor.prep.cracks':0,'floor.prep.repair.local':0,'floor.prep.level5':450,'floor.prep.level10':600,
  'floor.extra.seamless':1500,'floor.extra.protection':200,'floor.minimum':0,
  'door.install.interroom.base':6000,'door.install.interroom.complex':7500,
  'door.install.sliding':9000,'door.install.pocket':25000,'door.install.double':12000,'door.install.hidden':10000,
  'door.service.demo':1500,'door.service.lock.latch':1500,'door.service.lock.magnetic':2500,'door.service.trim':2000,
  'door.service.adjustment':3000,'door.service.limiter':500,'door.service.dobor':2000,
  'door.opening.standard':0,'door.opening.entrance':5000,'door.threshold.aluminium':500,'door.threshold.seal':800,'door.threshold.seamless':1500,
  'misc.speedbump':7000,'misc.glassRoller':5000,'misc.valve':1000,'misc.ledPower':1000,'misc.procurement':2000,'misc.kitchen':40000
};

const RATE_GROUPS={
  floor:[
    {title:'SPC / замковый кварцвинил',items:[['Прямая укладка','floor.spc.straight'],['Английская ёлочка','floor.spc.eng'],['Французская ёлочка','floor.spc.fr'],['Укладка от угла','floor.spc.corner'],['Сложный рисунок','floor.spc.complex']]},
    {title:'Ламинат до 11 мм',items:[['Прямая укладка','floor.laminate.straight'],['Английская ёлочка','floor.laminate.eng'],['Французская ёлочка','floor.laminate.fr'],['Укладка от угла','floor.laminate.corner'],['Сложный рисунок','floor.laminate.complex']]},
    {title:'Ламинат 12 мм и толще',items:[['Прямая укладка','floor.laminate12.straight'],['Английская ёлочка','floor.laminate12.eng'],['Французская ёлочка','floor.laminate12.fr'],['Укладка от угла','floor.laminate12.corner'],['Сложный рисунок','floor.laminate12.complex']]},
    {title:'Клеевой кварцвинил / LVT',items:[['Прямая укладка','floor.glue.straight'],['Английская ёлочка','floor.glue.eng'],['Французская ёлочка','floor.glue.fr'],['Укладка от угла','floor.glue.corner'],['Сложный рисунок','floor.glue.complex']]},
    {title:'Линолеум',items:[['Стандартная укладка','floor.linoleum.straight']]},
    {title:'Ковролин',items:[['Стандартная укладка','floor.carpet.straight']]},
    {title:'Плинтус',items:[['ПВХ','floor.baseboard.pvc','м.п.'],['МДФ','floor.baseboard.mdf','м.п.'],['Алюминиевый микроплинтус','floor.baseboard.micro','м.п.'],['Дюрополимер','floor.baseboard.duro','м.п.']]},
    {title:'Подготовка основания',items:[['Грунтование','floor.prep.primer','м²'],['Очистка поверхности','floor.prep.clean','м²'],['Локальная шлифовка','floor.prep.sand.local','участок'],['Полная шлифовка','floor.prep.sand.full','м²'],['Ремонт трещин','floor.prep.cracks','участок'],['Локальный ремонт основания','floor.prep.repair.local','участок'],['Наливной пол до 5 мм','floor.prep.level5','м²'],['Наливной пол 5–10 мм','floor.prep.level10','м²']]},
    {title:'Демонтаж и дополнительные работы',items:[['Линолеум','floor.demo.lino','м²'],['Замковое покрытие без сохранения','floor.demo.lock.discard','м²'],['Замковое покрытие с сохранением','floor.demo.lock.save','м²'],['Клеевое покрытие','floor.demo.glue','м²'],['Сложный клеевой демонтаж','floor.demo.glue.hard','м²'],['Беспороговое примыкание','floor.extra.seamless','м.п.'],['Защитное укрытие пола','floor.extra.protection','м²']]}
  ],
  doors:[
    {title:'Установка двери',items:[['Базовая межкомнатная дверь','door.install.interroom.base','шт.'],['Межкомнатная дверь с доборами','door.install.interroom.complex','шт.'],['Откатная дверь','door.install.sliding','шт.'],['Дверь-пенал','door.install.pocket','шт.'],['Двустворчатая дверь','door.install.double','шт.'],['Скрытая распашная дверь','door.install.hidden','шт.']]},
    {title:'Обслуживание и доработка',items:[['Демонтаж старой двери','door.service.demo','шт.'],['Установка простой защёлки','door.service.lock.latch','шт.'],['Установка магнитного замка','door.service.lock.magnetic','шт.'],['Замена телескопических наличников','door.service.trim','компл.'],['Регулировка двери','door.service.adjustment','шт.'],['Установка ограничителя','door.service.limiter','шт.'],['Замена доборов','door.service.dobor','компл.']]},
    {title:'Проёмы и примыкания',items:[['Обычный портал','door.opening.standard','компл.'],['Проём входной двери','door.opening.entrance','компл.'],['Алюминиевый порог','door.threshold.aluminium','м.п.'],['Шов герметиком','door.threshold.seal','м.п.'],['Беспороговое примыкание','door.threshold.seamless','м.п.']]}
  ],
  other:[]
};

const WORK_MODULES=[
  {id:'demo',title:'Демонтаж и проёмы',icon:'◫'},
  {id:'prep',title:'Подготовка',icon:'◩'},
  {id:'walls',title:'Стены и отделка',icon:'▤'},
  {id:'floors',title:'Полы',icon:'▱'},
  {id:'bathroom',title:'Санузел',icon:'◧'},
  {id:'plumbing',title:'Сантехника',icon:'⌁'},
  {id:'electrical',title:'Электрика',icon:'ϟ'},
  {id:'ventilation',title:'Вентиляция и климат',icon:'⌁'},
  {id:'ceilings',title:'Потолки',icon:'▔'},
  {id:'doors',title:'Двери и проёмы',icon:'▯'},
  {id:'kitchen',title:'Кухня и мебель',icon:'▥'},
  {id:'other',title:'Прочее',icon:'＋'}
];
const WORK_MODULE_BY_ID=Object.fromEntries(WORK_MODULES.map(x=>[x.id,x]));
function inferWorkModuleId(group='',name=''){
  const exact=WORK_MODULES.find(m=>m.title.toLowerCase()===String(group||'').trim().toLowerCase());if(exact)return exact.id;
  const text=`${group} ${name}`.toLowerCase();
  if(/электр|кабел|подрозет|розет|выключател|автомат|щит/.test(text))return 'electrical';
  if(/сантех|водоснаб|канализ|бойлер|смесител|раковин|вывод/.test(text))return 'plumbing';
  if(/сануз|поддон|унитаз|инсталляц|гидроизоляц|керамогранит|плитк|затирк/.test(text))return 'bathroom';
  if(/вентил|воздуховод|вентканал|кондиционер|климат/.test(text))return 'ventilation';
  if(/потол/.test(text))return 'ceilings';
  if(/кухн|шкаф|мебел/.test(text))return 'kitchen';
  if(/двер|про[её]м|откос/.test(text))return 'doors';
  if(/пол|кварцвинил|ламинат|линолеум|плинтус|стык/.test(text))return 'floors';
  if(/стен|шпакл|штукатур|флизелин|покраск/.test(text))return 'walls';
  if(/подготов|грунт|шлиф|наливн/.test(text))return 'prep';
  if(/демонтаж/.test(text))return 'demo';
  return 'other';
}
function workModuleMeta(row){const id=row?.moduleId||inferWorkModuleId(row?.group,row?.name);return WORK_MODULE_BY_ID[id]||WORK_MODULE_BY_ID.other}
function workModuleTitle(id){return (WORK_MODULE_BY_ID[id]||WORK_MODULE_BY_ID.other).title}
function orderWorkModules(order){
  const map=new Map();for(const row of order?.works||[]){if(!row?.name?.trim())continue;const meta=workModuleMeta(row),item=map.get(meta.id)||{...meta,count:0,done:0,partial:0,total:0,ready:0};item.count++;item.total+=workRowTotal(row);item.ready+=workReadyAmount(row);const pct=workProgressPct(row);if(pct>=100)item.done++;else if(pct>0)item.partial++;map.set(meta.id,item)}
  return WORK_MODULES.filter(m=>map.has(m.id)).map(m=>map.get(m.id));
}

let rates=loadRates();
let profile=loadProfile();

function storageGet(key,fallback=''){try{return localStorage.getItem(key)??fallback}catch(e){return fallback}}
function storageSet(key,value){try{localStorage.setItem(key,value)}catch(e){console.warn('storage',e)}}
function storageRemove(key){try{localStorage.removeItem(key)}catch(e){console.warn('storage',e)}}
function retireLegacyContentPatches(){
  // These were one-off personal/test data edits, not schema migrations.
  // Mark them retired without touching current IndexedDB data.
  for(const key of RETIRED_CONTENT_PATCH_KEYS)storageSet(key,'1');
}
function clone(v){return JSON.parse(JSON.stringify(v))}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function today(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function now(){return new Date().toISOString()}
function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function parseNum(value){const s=String(value??'').trim().replace(/\s/g,'').replace(',','.');if(!s||s==='.'||s==='-')return 0;const n=Number(s);return Number.isFinite(n)?n:0}
function rawNum(value){return String(value??'').replace(/[^0-9.,-]/g,'').replace(/\.(?=.*\.)/g,'')}
function qty(value){const n=parseNum(value);return Number.isInteger(n)?String(n):String(Math.round(n*100)/100).replace('.',',')}
function money(value){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(parseNum(value))}
function paperMoney(value){const n=parseNum(value),hasCents=Math.abs(n-Math.round(n))>.0001;return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:hasCents?2:0,maximumFractionDigits:2}).format(n)}
function paperQty(value){const n=parseNum(value);return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:4}).format(n)}
function ruDate(value){if(!value)return '';const [y,m,d]=String(value).slice(0,10).split('-');return y&&m&&d?`${d}.${m}.${y} г.`:String(value)}
function normalizePhone(value){let d=String(value||'').replace(/\D/g,'');if(!d)return '';if(d[0]==='8')d='7'+d.slice(1);else if(d[0]!=='7')d='7'+d;return d.slice(0,11)}
function formatPhone(value){const d=normalizePhone(value);if(!d)return '';const x=d.slice(1);let out='8';if(x.length)out+=` ${x.slice(0,3)}`;if(x.length>3)out+=` ${x.slice(3,6)}`;if(x.length>6)out+=`-${x.slice(6,8)}`;if(x.length>8)out+=`-${x.slice(8,10)}`;return out}
function profileFullName(){return [profile.lastName,profile.firstName,profile.middleName].filter(Boolean).join(' ')||profile.firstName||'Мастер'}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),1900)}
function loadProfile(){for(const key of [PROFILE_KEY,...OLD_PROFILE_KEYS]){try{const value=JSON.parse(storageGet(key,'{}')||'{}');if(value&&Object.keys(value).length)return {...DEFAULT_PROFILE,...value}}catch(e){}}return {...DEFAULT_PROFILE}}
function saveProfile(){storageSet(PROFILE_KEY,JSON.stringify(profile))}
function loadRates(){let saved={};for(const key of [...OLD_RATE_KEYS].reverse().concat(RATE_KEY)){try{const value=JSON.parse(storageGet(key,'{}')||'{}');if(value&&typeof value==='object')saved={...saved,...value}}catch(e){}}
  const mapped={
    'floor.spc.straight':saved['floor.install.standard'],'floor.laminate.straight':saved['floor.install.standard'],
    'floor.glue.straight':saved['floor.install.glue'],'floor.prep.primer':saved['floor.prep.primer'],
    'floor.minimum':saved['floor.minimum'],'door.install.interroom.base':saved['door.interroom.base']===6500?6000:saved['door.interroom.base'],
    'door.service.demo':saved['door.demo'],'door.service.limiter':saved['door.limiter'],
    'door.threshold.aluminium':saved['door.threshold.aluminium'],'door.threshold.seal':saved['door.threshold.seal'],
    'door.threshold.seamless':saved['door.threshold.seamless'],'door.install.double':saved['door.double.base'],
    'door.install.hidden':saved['door.hidden.base'],'door.install.pocket':saved['door.pocket.base'],'door.install.sliding':saved['door.sliding.base']
  };
  Object.entries(mapped).forEach(([k,v])=>{if(v!==undefined&&saved[k]===undefined)saved[k]=v});
  return {...DEFAULT_RATES,...saved};
}
function saveRates(){storageSet(RATE_KEY,JSON.stringify(rates))}
function normalizeCustomFloorCover(item={}){return {id:item.id||uid(),name:String(item.name||''),unit:item.unit||'м²',patterns:{straight:String(item.patterns?.straight??item.price??''),eng:String(item.patterns?.eng??''),fr:String(item.patterns?.fr??''),corner:String(item.patterns?.corner??''),complex:String(item.patterns?.complex??'')}}}
function loadCustomFloorCovers(){try{const arr=JSON.parse(storageGet(CUSTOM_FLOOR_KEY,'[]')||'[]');return Array.isArray(arr)?arr.map(normalizeCustomFloorCover):[]}catch(e){return []}}
function saveCustomFloorCovers(){storageSet(CUSTOM_FLOOR_KEY,JSON.stringify(customFloorCovers))}
function normalizeExpense(e={},scope='order'){
  const rawCategory=e.category||'other';
  const category=scope==='general'?(rawCategory==='fuel'?'fuel':rawCategory==='tool'?'tool':'other'):(['worker','materialsIncluded','objectOther'].includes(rawCategory)?rawCategory:'objectOther');
  return sanitizeExpense({id:e.id||uid(),category,amount:String(e.amount??''),date:e.date||today(),worker:String(e.worker||''),work:String(e.work||''),comment:String(e.comment||''),receiptData:e.receiptData||'',receiptName:e.receiptName||'',receiptMissing:!!e.receiptMissing},scope)
}
function sanitizeExpense(item,scope='order'){
  if(scope==='general'){
    if(!['fuel','tool','other'].includes(item.category))item.category='other';
    item.worker='';item.work='';
    if(item.category==='fuel')item.comment='';
  }else{
    if(!['worker','materialsIncluded','objectOther'].includes(item.category))item.category='objectOther';
    if(item.category!=='worker'){item.worker='';item.work=''}
  }
  return item;
}
function loadGeneralExpenses(){try{const arr=JSON.parse(storageGet(GENERAL_EXPENSES_KEY,'[]')||'[]');return Array.isArray(arr)?arr.map(e=>normalizeExpense(e,'general')):[]}catch(e){return []}}
function saveGeneralExpenses(){storageSet(GENERAL_EXPENSES_KEY,JSON.stringify(generalExpenses))}
function customCoverByValue(value){return String(value||'').startsWith('custom:')?customFloorCovers.find(x=>x.id===String(value).slice(7)):null}
function customCoverRate(value,pattern){const item=customCoverByValue(value);return item?parseNum(item.patterns?.[pattern]||item.patterns?.straight):0}

function defaultFloor(){return {
  completed:false,cover:'spc',otherCover:'',thickness:'standard',pattern:'straight',area:'',installRate:String(rateForFloor('spc','standard','straight')),
  baseboard:{enabled:false,type:'pvc',qty:'',rate:String(rates['floor.baseboard.pvc'])},demolition:[],preparation:[],extras:[],materials:[]
}}
function defaultDoors(){return {completed:false,items:[]}}
function normalizePricing(p={}){return {contractTotal:String(p.contractTotal??'')}}
function defaultOrder(index=1){return {id:uid(),title:`Заказ ${index}`,date:today(),startedAt:'',completedAt:'',status:'draft',taxRate:'0',comment:'',pricing:normalizePricing(),works:[],workClosures:[],floor:defaultFloor(),doors:defaultDoors(),purchases:[],expenses:[],payments:[],stages:[],photos:[],documentHistory:[]}}
function defaultObject(){return {id:uid(),version:VERSION,createdAt:now(),updatedAt:now(),status:'auto',showDiscountInDocuments:true,contact:{name:'',phone:'',address:'',comment:''},orders:[defaultOrder(1)],legacyMeta:{}}}
function normalizeGenericRow(row={},group='Дополнительные работы',kind='work'){
  const progress=Math.max(0,Math.min(100,Math.round(parseNum(row.progressPct??0))));
  const moduleId=row.moduleId||inferWorkModuleId(row.group||group,row.name||'');
  return {id:row.id||uid(),name:String(row.name||''),qty:String(row.qty??1),unit:row.unit||'шт.',price:String(row.price??''),comment:String(row.comment||''),group:row.group||workModuleTitle(moduleId)||group,moduleId,kind:row.kind||kind,rateKey:row.rateKey||'',progressPct:progress,closedAmount:Math.max(0,parseNum(row.closedAmount??0)),baseQty:String(row.baseQty??''),fromPct:parseNum(row.fromPct??0),toPct:parseNum(row.toPct??0),progressNote:String(row.progressNote||'')}
}
function floorDemoPreset(type,area='',mode='discard'){
  const map={
    lino:['Демонтаж линолеума','floor.demo.lino'],
    laminate:['Демонтаж замкового покрытия',mode==='save'?'floor.demo.lock.save':'floor.demo.lock.discard'],
    spc:['Демонтаж замкового покрытия',mode==='save'?'floor.demo.lock.save':'floor.demo.lock.discard'],
    glue:['Демонтаж клеевого покрытия',mode==='hard'?'floor.demo.glue.hard':'floor.demo.glue'],
    baseboardPvc:['Демонтаж ПВХ-плинтуса','floor.demo.baseboard.pvc'],
    baseboardMdf:['Демонтаж МДФ-плинтуса','floor.demo.baseboard.mdf'],
    baseboardDuro:['Демонтаж дюрополимерного плинтуса','floor.demo.baseboard.duro'],
    underlay:['Демонтаж подложки',''],threshold:['Демонтаж порогов',''],other:['','']
  };
  const [name,key]=map[type]||map.other;
  return normalizeGenericRow({name,qty:area||'1',unit:type.startsWith('baseboard')?'м.п.':type==='threshold'?'шт.':'м²',price:key?String(rates[key]):'',rateKey:key,group:'Демонтажные работы'},'Демонтажные работы');
}
function floorPrepPreset(type,area=''){
  const map={
    primer:['Грунтование основания','floor.prep.primer','м²'],clean:['Очистка поверхности','floor.prep.clean','м²'],
    sandLocal:['Локальная шлифовка','floor.prep.sand.local','участок'],sandFull:['Полная шлифовка','floor.prep.sand.full','м²'],
    cracks:['Ремонт трещин','floor.prep.cracks','участок'],repairLocal:['Локальный ремонт основания','floor.prep.repair.local','участок'],
    level5:['Наливной пол до 5 мм','floor.prep.level5','м²'],level10:['Наливной пол 5–10 мм','floor.prep.level10','м²'],other:['','','м²']
  };
  const [name,key,unit]=map[type]||map.other;
  return normalizeGenericRow({name,qty:unit==='м²'?(area||''):'1',unit,price:key?String(rates[key]):'',rateKey:key,group:'Подготовка основания'},'Подготовка основания');
}
function floorExtraPreset(type,area=''){
  const map={
    seamless:['Беспороговое примыкание','floor.extra.seamless','м.п.','1'],protection:['Защитное укрытие готового покрытия','floor.extra.protection','м²',area||''],
    furniture:['Перемещение мебели','','компл.','1'],kitchen:['Разборка / сборка кухонного гарнитура','','компл.','1'],other:['','','шт.','1']
  };
  const [name,key,unit,q]=map[type]||map.other;
  return normalizeGenericRow({name,qty:q,unit,price:key?String(rates[key]):'',rateKey:key,group:'Дополнительные работы'},'Дополнительные работы');
}
function rateForFloor(cover,thickness,pattern){
  const p=['straight','eng','fr','corner','complex'].includes(pattern)?pattern:'complex';
  if(cover==='spc')return rates[`floor.spc.${p}`]||0;
  if(cover==='laminate')return rates[`floor.${thickness==='12plus'?'laminate12':'laminate'}.${p}`]||0;
  if(cover==='glue')return rates[`floor.glue.${p}`]||0;
  if(cover==='linoleum')return rates['floor.linoleum.straight']||0;
  if(cover==='carpet')return rates['floor.carpet.straight']||0;
  if(String(cover).startsWith('custom:'))return customCoverRate(cover,p);
  return 0;
}
function floorRateKey(f){const p=['straight','eng','fr','corner','complex'].includes(f.pattern)?f.pattern:'complex';if(f.cover==='spc')return `floor.spc.${p}`;if(f.cover==='laminate')return `floor.${f.thickness==='12plus'?'laminate12':'laminate'}.${p}`;if(f.cover==='glue')return `floor.glue.${p}`;if(f.cover==='linoleum')return 'floor.linoleum.straight';if(f.cover==='carpet')return 'floor.carpet.straight';return ''}
function floorSupportsPatterns(cover){return !['linoleum','carpet'].includes(cover)}
function normalizeFloor(raw={}){
  if(raw&&Array.isArray(raw.demolition)&&Array.isArray(raw.preparation)&&Array.isArray(raw.extras)){
    const d=defaultFloor(),out={...d,...raw};
    out.area=String(raw.area??'');if(!floorSupportsPatterns(out.cover))out.pattern='straight';out.installRate=String(raw.installRate??rateForFloor(out.cover,out.thickness,out.pattern));
    out.baseboard={...d.baseboard,...(raw.baseboard||{})};out.baseboard.qty=String(out.baseboard.qty??'');out.baseboard.rate=String(out.baseboard.rate??rates[`floor.baseboard.${out.baseboard.type}`]??'');
    out.demolition=raw.demolition.map(r=>normalizeGenericRow(r,'Демонтажные работы'));
    out.preparation=raw.preparation.map(r=>normalizeGenericRow(r,'Подготовка основания'));
    out.extras=raw.extras.map(r=>normalizeGenericRow(r,'Дополнительные работы'));
    out.materials=(raw.materials||[]).map(r=>normalizeGenericRow(r,'Материалы для предложения','material'));
    return out;
  }
  const f=defaultFloor();
  f.completed=!!raw.completed;f.cover=raw.cover||'spc';f.otherCover=raw.otherCover||'';f.pattern=raw.pattern||'straight';f.area=String(raw.area??'');
  f.thickness=raw.thickness||'standard';if(!floorSupportsPatterns(f.cover))f.pattern='straight';f.installRate=String(raw.installRate??rateForFloor(f.cover,f.thickness,f.pattern));
  if(raw.baseboard&&raw.baseboard!=='none')f.baseboard={enabled:true,type:raw.baseboard,qty:String(raw.perimeter??''),rate:String(rates[`floor.baseboard.${raw.baseboard}`]||'')};
  if(raw.oldCover&&raw.oldCover!=='none')f.demolition.push(floorDemoPreset(raw.oldCover,f.area,raw.demoMode||'discard'));
  if(raw.demoBaseboard&&raw.demoBaseboard!=='none')f.demolition.push(floorDemoPreset(`baseboard${String(raw.demoBaseboard).replace(/^./,x=>x.toUpperCase())}`,String(raw.perimeter??'')));
  for(const r of raw.prepRows||[])f.preparation.push(normalizeGenericRow(r,'Подготовка основания'));
  if(!f.preparation.length&&raw.prep&&raw.prep!=='none'){
    const legacy={primer:'primer',grindLight:'sandLocal',grindMed:'clean',grindHard:'sandFull',level5:'level5',level10:'level10'}[raw.prep];
    if(legacy)f.preparation.push(floorPrepPreset(legacy,f.area));
  }
  for(const r of raw.custom||[])f.extras.push(normalizeGenericRow(r,'Дополнительные работы'));
  if(parseNum(raw.joint))f.extras.push(normalizeGenericRow({name:'Беспороговое примыкание',qty:String(raw.joint),unit:'м.п.',price:String(rates['floor.extra.seamless']),rateKey:'floor.extra.seamless'},'Дополнительные работы'));
  const furniture={light:3000,medium:7500,hard:15000}[raw.furniture];if(furniture)f.extras.push(normalizeGenericRow({name:'Перемещение мебели',qty:'1',unit:'компл.',price:String(furniture)},'Дополнительные работы'));
  const kitchen={light:5000,medium:10000,hard:15000}[raw.kitchen];if(kitchen)f.extras.push(normalizeGenericRow({name:'Разборка / сборка кухонного гарнитура',qty:'1',unit:'компл.',price:String(kitchen)},'Дополнительные работы'));
  f.materials=(raw.consumables||[]).map(r=>normalizeGenericRow(r,'Материалы для предложения','material'));
  return f;
}
function doorInstallationPrice(item){
  if(item.type==='interroom'){
    let base=item.dobor==='standard'?parseNum(rates['door.install.interroom.complex']):parseNum(rates['door.install.interroom.base']);
    if(item.dobor==='wide'||item.dobor==='other')base+=parseNum(item.doborExtra);
    if(item.lock==='magnetic'||item.lock==='other')base+=parseNum(item.lockExtra);
    if(item.hinges==='mortise'||item.hinges==='other')base+=parseNum(item.hingeExtra);
    return base;
  }
  return parseNum(rates[`door.install.${item.type}`]||0);
}
function defaultDoorInstallation(type='interroom'){const item={id:uid(),kind:'installation',type,qty:'1',unitPrice:'',priceMode:'auto',dobor:'none',doborExtra:'',lock:'latch',lockOther:'',lockExtra:'',hinges:'butterfly',hingesOther:'',hingeExtra:'',comment:''};item.unitPrice=String(doorInstallationPrice(item));return item}
function doorServicePreset(type='adjustment'){
  const map={
    latch:['Установка простой защёлки','шт.','door.service.lock.latch'],magnetic:['Установка магнитного замка','шт.','door.service.lock.magnetic'],trim:['Замена телескопических наличников','компл.','door.service.trim'],
    adjustment:['Регулировка двери','шт.','door.service.adjustment'],limiter:['Установка ограничителя','шт.','door.service.limiter'],
    dobor:['Замена доборов','компл.','door.service.dobor'],
    demo:['Демонтаж старой двери','шт.','door.service.demo'],other:['','шт.','']
  };
  const [name,unit,key]=map[type]||map.other;
  return {id:uid(),kind:'service',serviceType:type,name,qty:'1',unit,unitPrice:key?String(rates[key]||''):'',priceMode:'auto',rateKey:key,comment:''};
}
function doorOpeningPreset(type='portal'){const map={portal:['Обычный дверной портал','door.opening.standard'],entrancePortal:['Проём входной двери','door.opening.entrance'],other:['','']};const [name,key]=map[type]||map.other;return {id:uid(),kind:'opening',openingType:type,name,qty:'1',unit:'компл.',unitPrice:key?String(rates[key]||''):'',priceMode:'auto',rateKey:key,comment:''}}
function normalizeDoorItem(item={}){
  if(item.kind==='installation'){const x={...defaultDoorInstallation(item.type||'interroom'),...item};x.qty=String(item.qty??1);x.unitPrice=String(item.unitPrice??item.price??doorInstallationPrice(x));return x}
  if(item.kind==='service'){let type=item.serviceType||'other';if(type==='lock')type='magnetic';if(type==='hinges')type='other';const x={...doorServicePreset(type),...item,serviceType:type};x.qty=String(item.qty??1);x.unitPrice=String(item.unitPrice??item.price??'');return x}
  if(item.kind==='opening'){const x={...doorOpeningPreset(item.openingType||'other'),...item};x.qty=String(item.qty??1);x.unitPrice=String(item.unitPrice??item.price??'');return x}
  return {...doorServicePreset('other'),name:item.name||'',qty:String(item.qty??1),unit:item.unit||'шт.',unitPrice:String(item.price??item.unitPrice??''),comment:item.comment||'',priceMode:'manual',rateKey:item.rateKey||''};
}
function normalizeDoors(raw={}){
  if(Array.isArray(raw.items))return {completed:!!raw.completed,items:raw.items.map(normalizeDoorItem)};
  const items=[];
  for(const g of raw.groups||[]){const x=defaultDoorInstallation(g.type||'interroom');Object.assign(x,{qty:String(g.qty??1),unitPrice:String(g.price??doorInstallationPrice(x)),priceMode:g.priceMode||'manual',dobor:g.dobor==='up100'?'standard':g.dobor||'none',doborExtra:String(g.doborExtra??''),lock:g.lock||'latch',lockExtra:String(g.lockExtra??''),hinges:g.hinges||'butterfly',hingeExtra:String(g.hingeExtra??''),comment:g.comment||''});items.push(x)}
  for(const r of raw.extras||raw.rows||[])items.push(normalizeDoorItem({kind:'service',serviceType:'other',name:r.name,qty:r.qty,unit:r.unit,unitPrice:r.price,comment:r.comment,rateKey:r.rateKey,priceMode:'manual'}));
  return {completed:!!raw.completed||items.length>0,items};
}
function normalizePurchase(p={}){return {id:p.id||uid(),name:p.name||'',amount:String(p.amount??''),date:p.date||today(),status:p.status||'due',comment:p.comment||'',receiptData:p.receiptData||'',receiptName:p.receiptName||'',receiptMissing:!!p.receiptMissing}}
function normalizePayment(p={}){return {id:p.id||uid(),amount:String(p.amount??''),date:p.date||today(),note:p.note||'',closureId:p.closureId||''}}
function normalizeStage(s={}){return {id:s.id||uid(),name:s.name||'',amount:String(s.amount??''),date:s.date||today(),paid:!!s.paid}}
function normalizeWorkClosure(c={}){return {id:c.id||uid(),number:Math.max(1,parseInt(c.number||1,10)||1),date:c.date||today(),amount:Math.max(0,parseNum(c.amount)),items:Array.isArray(c.items)?c.items.map(x=>({...x,rowId:x.rowId||'',name:x.name||'',group:x.group||'Работы',fromPct:parseNum(x.fromPct),toPct:parseNum(x.toPct),amount:Math.max(0,parseNum(x.amount))})):[],snapshot:Array.isArray(c.snapshot)?c.snapshot.map(r=>normalizeGenericRow(r,r.group||'Работы')):[]}}
function normalizeOrder(raw={},index=1){return {
  id:raw.id||uid(),title:raw.title||`Заказ ${index}`,date:raw.date||today(),startedAt:raw.startedAt||raw.date||'',completedAt:raw.completedAt||'',status:raw.status||'draft',taxRate:String(raw.taxRate??'0'),comment:raw.comment||'',workflowKey:raw.workflowKey||'',pricing:normalizePricing(raw.pricing||{contractTotal:raw.contractTotal??''}),works:(raw.works||[]).map(r=>normalizeGenericRow(r,'Работы')),
  floor:normalizeFloor(raw.floor||{}),doors:normalizeDoors(raw.doors||{}),purchases:(raw.purchases||[]).map(normalizePurchase),expenses:(raw.expenses||[]).map(e=>normalizeExpense(e,'order')),
  payments:(raw.payments||[]).map(normalizePayment),stages:(raw.stages||[]).map(normalizeStage),workClosures:(raw.workClosures||[]).map(normalizeWorkClosure),photos:(raw.photos||[]).map(p=>({...p,id:p.id||uid(),caption:p.caption||'',addedAt:p.addedAt||p.date||''})),documentHistory:(raw.documentHistory||[]).map(h=>({...h,id:h.id||uid()}))
}}
function legacyToObject(raw={}){
  if(Array.isArray(raw.orders))return raw;
  const p=raw.project||{};
  const contact={name:p.customer||raw.customer||'',phone:p.phone||raw.phone||'',address:p.address||raw.address||'',comment:p.comment||''};
  const order=normalizeOrder({id:uid(),title:'Заказ 1',date:p.date||today(),status:p.status==='work'?'work':p.status==='done'?'done':p.status==='approval'?'agreed':'draft',floor:raw.floor||{},doors:raw.doors||{},photos:raw.photos||[],stages:raw.stages||[],documentHistory:raw.documentHistory||[]},1);
  for(const s of raw.stages||[])if(s.paid&&parseNum(s.amount)>0)order.payments.push(normalizePayment({amount:s.amount,date:s.date||today(),note:s.name||'Оплаченный этап'}));
  return {id:raw.id||uid(),version:VERSION,createdAt:raw.createdAt||raw.updatedAt||now(),updatedAt:raw.updatedAt||now(),contact,orders:[order],legacyMeta:{source:p.source||'',messengers:p.messengers||[]}};
}
function normalizeObject(raw={}){
  const base=legacyToObject(raw),c=base.contact||{};
  const out={id:base.id||uid(),version:VERSION,createdAt:base.createdAt||base.updatedAt||now(),updatedAt:base.updatedAt||now(),status:base.status||'auto',showDiscountInDocuments:base.showDiscountInDocuments!==false,contact:{name:c.name||'',phone:c.phone||'',address:c.address||'',comment:c.comment||''},orders:(base.orders||[]).map((o,i)=>normalizeOrder(o,i+1)),legacyMeta:base.legacyMeta||{}};
  if(!out.orders.length)out.orders.push(defaultOrder(1));
  return out;
}

function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})};request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve(db)};request.onerror=()=>reject(request.error)})}
function dbAll(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function dbPut(object){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(object);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function dbDelete(id){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function dbApplyBatch(upserts=[],deleteIds=[],expectedRevisions=null){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let settled=false;const fail=error=>{if(settled)return;settled=true;reject(error||tx.error||new Error('Не удалось сохранить пакет изменений'))},apply=()=>{try{for(const id of deleteIds)store.delete(String(id));for(const object of upserts)store.put(object)}catch(error){try{tx.abort()}catch(_){}fail(error)}};tx.oncomplete=()=>{if(settled)return;settled=true;resolve()};tx.onerror=()=>fail();tx.onabort=()=>fail();const checks=expectedRevisions instanceof Map?[...expectedRevisions.entries()]:Object.entries(expectedRevisions||{});if(!checks.length){apply();return}let pending=checks.length;for(const [id,revision] of checks){const request=store.get(String(id));request.onerror=()=>{try{tx.abort()}catch(_){}fail(request.error)};request.onsuccess=()=>{if(settled)return;const actual=request.result,valid=revision===null?!actual:!!actual&&String(actual.updatedAt||'')===String(revision);if(!valid){try{tx.abort()}catch(_){}fail(new Error('Данные объекта изменились в другой вкладке'));return}pending--;if(!pending)apply()}}})}
function stripPhotos(object){const c=clone(object);for(const order of c.orders||[]){order.photos=(order.photos||[]).map(p=>({id:p.id,caption:p.caption||'',missing:true}));for(const purchase of order.purchases||[])if(purchase.receiptData){purchase.receiptData='';purchase.receiptMissing=true}for(const exp of order.expenses||[])if(exp.receiptData){exp.receiptData='';exp.receiptMissing=true}}return c}
function mirrorBackup(){storageSet(BACKUP_KEY,JSON.stringify(objects.map(stripPhotos)))}
function localKeys(){try{return Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(Boolean)}catch(e){return []}}
async function migrateLegacy(){
  const existing=await dbAll();const ids=new Set(existing.map(x=>x.id));
  const keys=[...new Set([...OLD_BACKUP_KEYS,...localKeys().filter(k=>/^frameObjects/i.test(k))])];
  for(const key of keys){try{const arr=JSON.parse(storageGet(key,'[]')||'[]');if(!Array.isArray(arr))continue;for(const raw of arr){const object=normalizeObject(raw);if(!ids.has(object.id)){await dbPut(object);ids.add(object.id)}}}catch(e){console.warn('migration',key,e)}}
}
async function reloadObjects(){const stored=await dbAll(),migrations=[];objects=stored.map(raw=>{const normalized=normalizeObject(raw),needsStableIds=(raw.orders||[]).some(order=>(order.photos||[]).some(photo=>!photo?.id)||(order.documentHistory||[]).some(doc=>!doc?.id));if(needsStableIds){normalized.updatedAt=raw.updatedAt||normalized.updatedAt;migrations.push(normalized)}return normalized}).sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt)));if(migrations.length)await dbApplyBatch(migrations,[]);mirrorBackup()}
async function saveObject(object,{reload=false}={}){object.updatedAt=now();object.version=VERSION;const normalized=normalizeObject(object);normalized.updatedAt=object.updatedAt;await dbPut(normalized);const i=objects.findIndex(o=>o.id===object.id);if(i<0)objects.push(object);objects.sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt)));mirrorBackup();if(reload)await reloadObjects();return object}
function currentObject(){return objects.find(o=>o.id===currentObjectId)||null}
function currentOrder(){return currentObject()?.orders.find(o=>o.id===currentOrderId)||null}
function editorKey(){return route==='object'?`object:${currentObjectId||''}`:`${route}:${currentObjectId||''}:${currentOrderId||''}`}
function editorApplies(){return MANUAL_EDIT_ROUTES.has(route)&&!!currentObject()}
function beginEditor(force=false){
  if(!editorApplies())return;
  const key=editorKey();
  if(!force&&editorState.key===key)return;
  editorState={key,snapshot:clone(currentObject()),dirty:false};
}
function updateEditorSaveBar(){const button=$('saveEditorBtn'),hint=$('editorSaveHint');if(button)button.disabled=!editorState.dirty;if(hint)hint.textContent=editorState.dirty?'Есть несохранённые изменения':'Изменения сохранены'}
function markDirty(){if(!editorApplies())return;beginEditor();editorState.dirty=true;updateEditorSaveBar()}
async function saveEditor({silent=false}={}){if(!editorApplies())return true;try{await saveObject(currentObject());editorState={key:editorKey(),snapshot:clone(currentObject()),dirty:false};updateEditorSaveBar();if(!silent)toast('Изменения сохранены');return true}catch(e){console.error(e);toast('Не удалось сохранить изменения');return false}}
function discardEditor(){if(!editorState.snapshot)return;const snapshot=normalizeObject(editorState.snapshot),index=objects.findIndex(o=>o.id===snapshot.id);if(index>=0)objects[index]=snapshot;editorState={key:'',snapshot:null,dirty:false}}
function editorSaveBar(){return `<div class="editorSaveBar"><span id="editorSaveHint">${editorState.dirty?'Есть несохранённые изменения':'Изменения сохранены'}</span><button id="saveEditorBtn" class="btn primary" ${editorState.dirty?'':'disabled'}>Сохранить</button></div>`}
function showUnsavedChanges(onSave,onDiscard){openSheet(`<div class="sectionTitle"><div><h1>Сохранить изменения?</h1><p class="help compact">Есть изменения, которые ещё не записаны.</p></div></div><div class="unsavedActions"><button id="unsavedSave" class="btn primary wide">Сохранить</button><button id="unsavedDiscard" class="btn ghost wide">Не сохранять</button><button class="btn ghost wide" data-close-sheet>Отмена</button></div>`);$('unsavedSave').onclick=async()=>{if(await saveEditor({silent:true})){closeSheet();onSave&&onSave()}};$('unsavedDiscard').onclick=()=>{discardEditor();closeSheet();onDiscard&&onDiscard()}}
function queueSave(){if(editorApplies()){markDirty();return}clearTimeout(saveTimer);const object=currentObject();if(!object)return;saveTimer=setTimeout(()=>saveObject(object).catch(e=>{console.error(e);toast('Не удалось сохранить изменения')}),500)}

function floorCoverName(f){const custom=customCoverByValue(f.cover);if(custom)return custom.name||'Своё покрытие';return {spc:'SPC / замковый кварцвинил',laminate:f.thickness==='12plus'?'Ламинат 12 мм и толще':'Ламинат',glue:'Клеевой кварцвинил / LVT',linoleum:'Линолеум',carpet:'Ковролин',other:f.otherCover||'Другое покрытие'}[f.cover]||'Напольное покрытие'}
function floorPatternName(pattern){return {straight:'Прямая укладка',eng:'Английская ёлочка',fr:'Французская ёлочка',corner:'Укладка от угла',complex:'Сложный рисунок',other:'Другой рисунок'}[pattern]||'Укладка'}
function calculateFloor(floor){
  const f=normalizeFloor(floor||{}),rows=[];const area=parseNum(f.area);
  if(area>0&&parseNum(f.installRate)>0)rows.push(normalizeGenericRow({name:`${floorCoverName(f)} · ${floorPatternName(f.pattern)}`,qty:f.area,unit:'м²',price:f.installRate,rateKey:floorRateKey(f),group:'Монтаж напольного покрытия'},'Монтаж напольного покрытия'));
  if(f.baseboard.enabled&&parseNum(f.baseboard.qty)>0&&parseNum(f.baseboard.rate)>0){const names={pvc:'ПВХ',mdf:'МДФ',micro:'алюминиевого микроплинтуса',duro:'дюрополимерного плинтуса',other:'другого плинтуса'};rows.push(normalizeGenericRow({name:`Монтаж плинтуса: ${names[f.baseboard.type]||'другой'}`,qty:f.baseboard.qty,unit:'м.п.',price:f.baseboard.rate,rateKey:f.baseboard.type!=='other'?`floor.baseboard.${f.baseboard.type}`:'',group:'Плинтус'},'Плинтус'))}
  for(const r of [...f.demolition,...f.preparation,...f.extras])if(parseNum(r.qty)>0&&parseNum(r.price)>=0&&r.name.trim())rows.push(normalizeGenericRow(r,r.group||'Работы'));
  const materials=f.materials.filter(r=>parseNum(r.qty)>0&&parseNum(r.price)>=0&&r.name.trim()).map(r=>normalizeGenericRow(r,'Материалы для предложения','material'));
  const workTotal=rows.reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),materialTotal=materials.reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0);
  return {rows,materials,workTotal,materialTotal};
}
function doorTypeName(type){return {interroom:'Межкомнатная дверь',sliding:'Откатная дверь',pocket:'Дверь-пенал',double:'Двустворчатая дверь',hidden:'Скрытая распашная дверь',entrance:'Входная дверь',other:'Другая дверь'}[type]||'Дверь'}
function doorItemRow(item){
  const i=normalizeDoorItem(item);if(i.kind==='installation'){
    const details=[];
    if(i.type==='interroom'){
      details.push({none:'без доборов',standard:'с доборами и наличниками',wide:'широкий / наборный добор',other:'нестандартные доборы'}[i.dobor]||'');
      details.push({latch:'стандартная защёлка',magnetic:'магнитный замок',none:'без замка',other:i.lockOther||'другой замок'}[i.lock]||'');
      details.push({butterfly:'петли-бабочки',mortise:'врезные / нестандартные петли',other:i.hingesOther||'другие петли'}[i.hinges]||'');
    }
    return normalizeGenericRow({id:i.id,name:`${doorTypeName(i.type)}${details.filter(Boolean).length?' · '+details.filter(Boolean).join(', '):''}`,qty:i.qty,unit:'шт.',price:i.unitPrice,comment:i.comment,group:'Установка дверей',rateKey:i.type==='interroom'?(i.dobor==='standard'?'door.install.interroom.complex':'door.install.interroom.base'):`door.install.${i.type}`},'Установка дверей');
  }
  if(i.kind==='opening')return normalizeGenericRow({id:i.id,name:i.name||'Оформление проёма',qty:i.qty,unit:i.unit||'компл.',price:i.unitPrice,comment:i.comment,group:'Оформление проёмов',rateKey:i.rateKey},'Оформление проёмов');
  return normalizeGenericRow({id:i.id,name:i.name||'Дверная работа',qty:i.qty,unit:i.unit||'шт.',price:i.unitPrice,comment:i.comment,group:'Обслуживание и доработка дверей',rateKey:i.rateKey},'Обслуживание и доработка дверей');
}
function calculateDoors(doors){const items=normalizeDoors(doors||{}).items.map(doorItemRow).filter(r=>r.name.trim()&&parseNum(r.qty)>0);return {rows:items,total:items.reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0)}}
function calculateWorks(order){const rows=(order?.works||[]).map(r=>normalizeGenericRow(r,r.group||'Работы')).filter(r=>r.name.trim()&&parseNum(r.qty)>0);return {rows,total:rows.reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0)}}
function workRowTotal(row){return Math.max(0,parseNum(row?.qty)*parseNum(row?.price))}
function workProgressPct(row){return Math.max(0,Math.min(100,Math.round(parseNum(row?.progressPct))))}
function workDoneAmount(row){return workRowTotal(row)*workProgressPct(row)/100}
function workClosedAmount(row){return Math.max(0,parseNum(row?.closedAmount))}
function workReadyAmount(row){return Math.max(0,workDoneAmount(row)-workClosedAmount(row))}
function orderWorkProgress(order){
  const rows=(order?.works||[]).filter(r=>r?.name?.trim()&&parseNum(r.qty)>0);
  return rows.reduce((acc,row)=>{const total=workRowTotal(row),done=workDoneAmount(row),closed=workClosedAmount(row),ready=Math.max(0,done-closed);acc.total+=total;acc.done+=done;acc.closed+=closed;acc.ready+=ready;if(workProgressPct(row)>=100)acc.complete++;else if(workProgressPct(row)>0)acc.partial++;return acc},{total:0,done:0,closed:0,ready:0,complete:0,partial:0});
}
function closurePaidAmount(order,closure){return (order?.payments||[]).filter(p=>p.closureId===closure?.id).reduce((sum,p)=>sum+parseNum(p.amount),0)}
function closureRemainingAmount(order,closure){return Math.max(0,parseNum(closure?.amount)-closurePaidAmount(order,closure))}
function orderCalculatedWorkTotal(order){const w=calculateWorks(order),f=calculateFloor(order.floor),d=calculateDoors(order.doors);return w.total+f.workTotal+d.total}
function orderContractTotal(order){const calc=orderCalculatedWorkTotal(order),raw=order?.pricing?.contractTotal;return raw===undefined||raw===null||String(raw).trim()===''?calc:Math.max(0,parseNum(raw))}
function orderAdjustment(order){return orderContractTotal(order)-orderCalculatedWorkTotal(order)}
function orderWorkTotal(order){return orderContractTotal(order)}
function orderPaid(order){return (order.payments||[]).reduce((s,p)=>s+parseNum(p.amount),0)}
function orderRemaining(order){return Math.max(0,orderContractTotal(order)-orderPaid(order))}
function orderDuePurchases(order){return (order.purchases||[]).filter(p=>p.status!=='reimbursed').reduce((s,p)=>s+parseNum(p.amount),0)}
function orderExpenses(order){return (order.expenses||[]).reduce((s,e)=>s+parseNum(e.amount),0)}
function orderTaxRate(order){return Math.max(0,parseNum(order?.taxRate))/100}
function orderTaxOnPaid(order){return orderPaid(order)*orderTaxRate(order)}
function orderTaxOnContract(order){return orderWorkTotal(order)*orderTaxRate(order)}
function orderProfit(order){return orderPaid(order)-orderExpenses(order)-orderTaxOnPaid(order)}
function orderExpectedProfit(order){return orderWorkTotal(order)-orderExpenses(order)-orderTaxOnContract(order)}
function orderIsActive(order){return ['agreed','work','awaiting','paused'].includes(order?.status)}
function allOrders(){const out=[];for(const object of objects)for(const order of object.orders||[])out.push({object,order});return out}
function objectTotals(object){return (object.orders||[]).reduce((acc,o)=>{acc.work+=orderWorkTotal(o);acc.paid+=orderPaid(o);acc.due+=orderDuePurchases(o);acc.expenses+=orderExpenses(o);acc.tax+=orderTaxOnPaid(o);return acc},{work:0,paid:0,due:0,expenses:0,tax:0})}
function expenseCategoryName(value){return {worker:'Оплата работнику',materialsIncluded:'Материалы в цене под ключ',objectOther:'Прочие расходы по объекту',fuel:'Бензин',tool:'Инструмент',tax:'Налог НПД',other:'Прочее'}[value]||'Прочее'}
function objectStatusValue(object){if(object?.status&&object.status!=='auto')return object.status;const statuses=(object?.orders||[]).map(o=>o.status);if(statuses.length&&statuses.every(s=>['done','paid'].includes(s)))return 'done';if(statuses.length&&statuses.every(s=>s==='draft'))return 'draft';return 'work'}
function objectStatusName(value){return {work:'В работе',done:'Завершён',paused:'Приостановлен',draft:'Черновик',auto:'Авто'}[value]||'В работе'}
function dateInRange(value,start,end){if(!value)return false;return value>=start&&value<=end}
function financeRange(kind='month',customStart='',customEnd=''){const nowDate=new Date(),end=today();let start=end;if(kind==='month')start=`${end.slice(0,7)}-01`;else if(kind==='year')start=`${end.slice(0,4)}-01-01`;else if(kind==='custom'&&customStart&&customEnd){start=customStart;return {start,end:customEnd,label:`${ruDate(start).replace(' г.','')} – ${ruDate(customEnd)}`}}else{const d=new Date(nowDate);d.setDate(d.getDate()-29);start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}return {start,end,label:kind==='month'?new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date(end+'T12:00:00')):kind==='year'?'Этот год':'Последние 30 дней'}}
function financeData(range){
  const payments=[],expenses=[],purchasesDue=[];
  for(const object of objects)for(const order of object.orders||[]){
    for(const pay of order.payments||[])if(dateInRange(pay.date,range.start,range.end))payments.push({...pay,orderId:order.id,objectId:object.id,orderTitle:order.title,address:object.contact.address});
    for(const exp of order.expenses||[])if(dateInRange(exp.date,range.start,range.end))expenses.push({...exp,orderId:order.id,objectId:object.id,orderTitle:order.title,address:object.contact.address});
    const taxRate=orderTaxRate(order);if(taxRate)for(const pay of order.payments||[])if(dateInRange(pay.date,range.start,range.end))expenses.push({id:`tax-${pay.id}`,category:'tax',amount:String(parseNum(pay.amount)*taxRate),date:pay.date,comment:`НПД ${Math.round(taxRate*100)}%`,orderId:order.id,objectId:object.id,orderTitle:order.title,address:object.contact.address,synthetic:true});
    for(const purchase of order.purchases||[])if(purchase.status!=='reimbursed'&&dateInRange(purchase.date,range.start,range.end))purchasesDue.push({...purchase,orderId:order.id,objectId:object.id,orderTitle:order.title,address:object.contact.address});
  }
  for(const exp of generalExpenses)if(dateInRange(exp.date,range.start,range.end))expenses.push({...exp,orderId:'general',orderTitle:'Общий расход',address:''});
  const received=payments.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const spent=expenses.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const due=purchasesDue.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const workerPaid=expenses.filter(item=>item.category==='worker').reduce((sum,item)=>sum+parseNum(item.amount),0);
  return {payments,expenses,purchasesDue,received,spent,due,workerPaid,net:received-spent};
}

function orderStatusName(value){return {draft:'Черновик',agreed:'Согласован',work:'В работе',awaiting:'Ожидает оплаты',paused:'Приостановлен',done:'Завершён',paid:'Оплачен'}[value]||'Черновик'}
function rateGuide(row){if(!row.rateKey||!rates[row.rateKey])return {cls:'guide-none',label:'Без ориентира',detail:'Ручная или нестандартная работа'};const ref=parseNum(rates[row.rateKey]),cur=parseNum(row.price);if(!ref)return {cls:'guide-none',label:'Цена не задана',detail:'Заполните в «Моих ценах»'};const diff=(cur-ref)/ref;if(Math.abs(diff)<=.1)return {cls:'guide-ok',label:'По моей ставке',detail:`Ориентир ${money(ref)}`};if(diff<0)return {cls:'guide-low',label:`Ниже на ${Math.round(Math.abs(diff)*100)}%`,detail:`Моя ставка ${money(ref)}`};if(diff<=.3)return {cls:'guide-high',label:`Выше на ${Math.round(diff*100)}%`,detail:`Моя ставка ${money(ref)}`};return {cls:'guide-danger',label:`Выше на ${Math.round(diff*100)}%`,detail:`Моя ставка ${money(ref)}`}}


function aiLogs(){try{const arr=JSON.parse(storageGet(AI_LOG_KEY,'[]')||'[]');return aiSanitizeAuditEntries(arr)}catch(e){return []}}
function saveAiLogs(items){const encoded=JSON.stringify(aiSanitizeAuditEntries(items).slice(-50));storageSet(AI_LOG_KEY,encoded);return storageGet(AI_LOG_KEY,'')===encoded}
function retireAiLogRawUtterances(){try{const raw=JSON.parse(storageGet(AI_LOG_KEY,'[]')||'[]');if(!Array.isArray(raw))return;const clean=aiSanitizeAuditEntries(raw);if(JSON.stringify(raw)!==JSON.stringify(clean))saveAiLogs(clean)}catch(e){}}
function addAiLog(entry){const items=aiLogs(),item={id:uid(),at:now(),undone:false,...entry};items.push(item);if(!saveAiLogs(items))throw new Error('Не удалось надёжно сохранить журнал отмены');return aiLogs().find(row=>row.id===item.id)||item}
function aiNorm(text=''){return String(text).toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9.,+\-\s]/gi,' ').replace(/\s+/g,' ').trim()}
function aiStem(word=''){let w=aiNorm(word).replace(/[.,]/g,'');for(const end of ['иями','ями','ами','ого','ему','ыми','ими','ить','ать','ять','ение','ения','иях','ах','ях','ов','ев','ом','ем','ой','ый','ий','ая','яя','ое','ее','ам','ям','ы','и','а','я','у','ю']){if(w.length-end.length>=4&&w.endsWith(end)){w=w.slice(0,-end.length);break}}return w}
function aiTokens(text=''){const stop=new Set(['добавь','добавить','работу','работа','новая','новый','сделал','сделали','выполнил','закончил','завершил','готово','по','на','за','для','это','эту','там','тут','объекту','объект','заказу','заказ','рублей','руб','тысяч','тысячи','тысячу']);return aiNorm(text).split(' ').map(aiStem).filter(x=>x.length>=3&&!stop.has(x))}
function aiAmountFrom(text=''){const t=aiNorm(text);const re=/(\d{1,3}(?:\s\d{3})+|\d+(?:[.,]\d+)?)\s*(тыс(?:яч(?:а|и|у)?|\.)?)?/g;let m,last=null;while((m=re.exec(t))){let n=parseNum(String(m[1]).replace(/\s/g,''));if(m[2])n*=1000;last={amount:n,raw:m[0],index:m.index}}return last}
function aiAllTargets(){return allOrders().map(({object,order})=>({key:`${object.id}|${order.id}`,object,order,label:`${object.contact.address||'Без адреса'} · ${order.title}`}))}
function aiDefaultTargetKey(){const exact=currentObjectId&&currentOrderId?`${currentObjectId}|${currentOrderId}`:'';if(exact&&aiAllTargets().some(x=>x.key===exact))return exact;const active=aiAllTargets().filter(x=>orderIsActive(x.order));return (active.at(-1)||aiAllTargets().at(-1)||{}).key||''}
function aiTargetByKey(key){const [oid,rid]=String(key||'').split('|');const object=objects.find(o=>o.id===oid),order=object?.orders?.find(q=>q.id===rid);return object&&order?{object,order,key:`${oid}|${rid}`} : null}
function aiGuessTarget(text,currentKey=''){const norm=aiNorm(text),targets=aiAllTargets();let best=null,bestScore=0;for(const x of targets){const hay=aiNorm(`${x.object.contact.address} ${x.object.contact.name} ${x.order.title}`);let score=0;for(const token of aiTokens(norm)){if(token.length>=4&&hay.includes(token))score+=2}const addr=aiNorm(x.object.contact.address);for(const part of addr.split(' ')){const stem=aiStem(part);if(stem.length>=5&&norm.includes(stem))score+=3}if(score>bestScore){best=x;bestScore=score}}return bestScore>=3?best?.key:(currentKey||aiDefaultTargetKey())}
function aiFindWork(order,text){const tokens=aiTokens(text);let best=null,bestScore=0;for(const row of order?.works||[]){const name=aiNorm(row.name),nameTokens=aiTokens(name);let score=0;for(const t of tokens){if(name.includes(t))score+=3;else if(nameTokens.some(n=>n.startsWith(t)||t.startsWith(n)))score+=2}if(score>bestScore){best=row;bestScore=score}}return bestScore>=2?best:null}
function aiStripLeadCommand(text=''){return String(text||'').trim().replace(/^.*?(?:добавь|добавить|новая работа|допработа|допработу)\s*/i,'').trim()}
function aiParseWorkAdd(text){const source=aiStripLeadCommand(text),norm=aiNorm(source);const qtyPrice=norm.match(/(\d+(?:[.,]\d+)?)\s*(м2|м²|кв(?:адратных)?\s*м(?:етров)?|метр(?:а|ов)?|м\.?\s*п\.?|шт\.?|штук(?:а|и)?|компл(?:ект)?\.?|час(?:а|ов)?)\s+по\s+(\d+(?:[.,]\d+)?)/i);if(qtyPrice){const qty=parseNum(qtyPrice[1]),rawUnit=qtyPrice[2];let unit=/м2|м²|кв/.test(rawUnit)?'м²':/метр|м\.?\s*п/.test(rawUnit)?'м.п.':/час/.test(rawUnit)?'час':/компл/.test(rawUnit)?'компл.':'шт.';const idx=norm.indexOf(qtyPrice[0]);const name=(idx>=0?source.slice(0,idx):source).trim()||'Новая работа';return {name,qty:String(qty),unit,price:String(parseNum(qtyPrice[3]))}}const amt=aiAmountFrom(source);if(!amt?.amount)return null;let name=source;const re=/(?:\s+)(?:\d{1,3}(?:\s\d{3})+|\d+(?:[.,]\d+)?)\s*(?:тыс(?:яч[аиу]?|\.)?|руб(?:лей|ля|ль|\.)?|₽)?\s*$/i;name=name.replace(re,'').trim()||'Новая работа';return {name,qty:'1',unit:'компл.',price:String(amt.amount)}}
function parseAiCommand(text,targetKey=''){
  const raw=String(text||'').trim(),norm=aiNorm(raw);if(!raw)return {ok:false,error:'Сначала расскажите FRAME, что произошло.'};
  if(/(?:новый\s+объект|создай\s+объект|новая\s+квартира|новый\s+заказчик)/.test(norm))return {ok:false,error:'Эта фраза похожа на создание нового объекта. Для этого подключите AI Brain: локальный парсер специально не угадывает такие команды.'};
  const guessed=aiGuessTarget(raw,targetKey),target=aiTargetByKey(guessed);if(!target)return {ok:false,error:'Не выбран заказ. Сначала выберите объект и заказ.'};
  const amount=aiAmountFrom(raw)?.amount||0;
  if(/(?:получил|получили|пришл[аои]|перевел|перевели|заказчик\s+(?:дал|отдал|перевел)|оплатил|оплата)/.test(norm)&&amount>0){return {ok:true,type:'payment',source:'local',targetKey:guessed,amount,text:raw,summary:`Добавить оплату ${money(amount)}`}}
  if(/(?:отдал|заплатил|выплатил|расход)/.test(norm)&&/(?:посред|рабоч|мастер|субподряд|комисси)/.test(norm)&&amount>0){const who=/посред/.test(norm)?'Посредник':/субподряд/.test(norm)?'Субподрядчик':/рабоч/.test(norm)?'Рабочий':'Исполнитель';return {ok:true,type:'expense',source:'local',targetKey:guessed,amount,worker:who,text:raw,summary:`Добавить расход ${money(amount)} · ${who}`}}
  if(/(?:купил|купили|закупил|закупили|материал)/.test(norm)&&amount>0){let name=raw.replace(/^.*?(?:купил|купили|закупил|закупили)\s*/i,'').replace(/\s+(?:за|на)\s+\d+[\d\s.,]*(?:руб\w*|₽|тыс\w*)?.*$/i,'').trim();if(!name||/^материал/i.test(name))name='Материалы / расходники';return {ok:true,type:'purchase',source:'local',targetKey:guessed,amount,name,text:raw,summary:`Добавить покупку ${money(amount)} · ${name}`}}
  if(/(?:закончил|закончена|завершил|завершена|выполнил|выполнена|готово)/.test(norm)){const row=aiFindWork(target.order,raw);if(row)return {ok:true,type:'work_complete',source:'local',targetKey:guessed,rowId:row.id,rowName:row.name,previousPct:workProgressPct(row),text:raw,summary:`Отметить «${row.name}» выполненной на 100%`};return {ok:false,error:'Не нашла подходящую работу в выбранном заказе. Можно уточнить название.'}}
  if(/(?:добавь|добавить|новая работа|допработ)/.test(norm)){const work=aiParseWorkAdd(raw);if(work&&parseNum(work.price)>0)return {ok:true,type:'work_add',source:'local',targetKey:guessed,work,text:raw,summary:`Добавить работу «${work.name}» · ${work.qty} ${work.unit} × ${money(parseNum(work.price))}`};return {ok:false,error:'Не поняла цену новой работы. Например: «Добавь монтаж подсветки 3500».'}}
  if(/(?:заметк\w*|запиши|комментари\w*)/.test(norm)){const note=raw.replace(/^.*?(?:заметк\w*|запиши|комментари\w*)[:\s-]*/i,'').trim();if(note)return {ok:true,type:'order_note',source:'local',targetKey:guessed,note,text:raw,summary:`Добавить заметку к заказу: «${note}»`}}
  return {ok:false,error:'Локальный парсер не уверен в действии. Подключённый AI Brain понимает свободную речь, новые объекты, удаление и несколько действий одной фразой.'};
}
function aiActionLabel(type){return {payment:'Оплата',expense:'Расход',purchase:'Покупка',work_add:'Новая работа',work_complete:'Выполнение',order_note:'Заметка',brain_batch:'AI Brain',create_object:'Новый объект',create_order:'Новый заказ',update_object:'Объект',update_order:'Заказ',add_work:'Новая работа',delete_work:'Удаление работы',update_work:'Изменение работы',set_work_progress:'Прогресс',add_payment:'Оплата',add_expense:'Расход',add_purchase:'Покупка',add_note:'Заметка',reimburse_purchase:'Возмещение',create_document:'Новый документ',read_answer:'Ответ'}[type]||'Изменение'}
function aiTargetLabel(key){const t=aiTargetByKey(key);return t?`${t.object.contact.address||'Без адреса'} · ${t.order.title}`:'Заказ не найден'}

const AI_SERVER_URL_KEY='frameAiServerUrlV250';
const AI_SERVER_TOKEN_KEY='frameAiServerTokenV250';
let aiBrainStatus=null;
let aiAnalyzing=false;
function aiServerUrl(){return String(storageGet(AI_SERVER_URL_KEY,'')||'').trim().replace(/\/$/,'')}
function aiServerToken(){return String(storageGet(AI_SERVER_TOKEN_KEY,'')||'').trim()}
function normalizeAiServerUrl(value=''){let v=String(value||'').trim().replace(/\/$/,'');if(v&&!/^https?:\/\//i.test(v))v='https://'+v;return v}
function aiSafeValue(fn,fallback=0){try{return fn()}catch(e){console.warn('FRAME AI context field skipped',e);return fallback}}
function aiOrderContext(order){return {id:order.id,title:order.title||'',date:order.date||'',started_at:order.startedAt||'',completed_at:order.completedAt||'',status:order.status||'',contract_total:aiSafeValue(()=>orderContractTotal(order),0),paid:aiSafeValue(()=>orderPaid(order),0),remaining:aiSafeValue(()=>orderRemaining(order),0),ready_to_close:aiSafeValue(()=>orderWorkProgress(order).ready,0),purchases_due:aiSafeValue(()=>orderDuePurchases(order),0),purchases:(order.purchases||[]).map(p=>({id:p.id,name:p.name||'',amount:parseNum(p.amount),date:p.date||'',status:p.status||'due'})),closures:(order.workClosures||[]).map(c=>({id:c.id,number:c.number,date:c.date,amount:parseNum(c.amount),remaining:aiSafeValue(()=>closureRemainingAmount(order,c),0)})),documents:(order.documentHistory||[]).map(d=>({id:d.id||'',type:d.type||'',date:d.date||'',total:parseNum(d.total)})).slice(-20),photos:(order.photos||[]).map(p=>({id:p.id||'',caption:p.caption||'',added_at:p.addedAt||p.date||''})).slice(-30),works:(order.works||[]).map(row=>({id:row.id,name:row.name||'',qty:parseNum(row.qty),unit:row.unit||'',price:parseNum(row.price),progress_pct:aiSafeValue(()=>workProgressPct(row),0),closed_amount:aiSafeValue(()=>workClosedAmount(row),0),ready_amount:aiSafeValue(()=>workReadyAmount(row),0)}))}}
function aiContextPayload(){return {current_target:routeState.aiTarget||aiDefaultTargetKey(),today:today(),objects:objects.map(object=>({id:object.id,created_at:object.createdAt||'',updated_at:object.updatedAt||'',address:object.contact?.address||'',customer:object.contact?.name||'',status:aiSafeValue(()=>objectStatusValue(object),'auto'),orders:(object.orders||[]).map(aiOrderContext)}))}}
async function aiBrainFetch(path,options={},connection={}){const base=connection.base===undefined?aiServerUrl():String(connection.base||''),token=connection.token===undefined?aiServerToken():String(connection.token||'');if(!base)throw new Error('Адрес AI Brain не задан');const headers={'Content-Type':'application/json',...(options.headers||{})};if(token)headers.Authorization=`Bearer ${token}`;if(/pinggy/i.test(base))headers['X-Pinggy-No-Screen']='1';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),190000);try{const response=await fetch(base+path,{...options,headers,signal:controller.signal,cache:'no-store',credentials:'omit'});let data={};try{data=await response.json()}catch(_){data={}}if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);return data}finally{clearTimeout(timer)}}
async function checkAiBrain({toastResult=true}={}){const base=aiServerUrl(),token=aiServerToken(),current=()=>base===aiServerUrl()&&token===aiServerToken();if(!base){aiRecordAuthenticatedHealth('',{url:base,authenticated:false});aiBrainStatus={ok:false,message:'Адрес не задан'};if(toastResult)toast('Сначала укажите адрес AI Brain');return aiBrainStatus}try{const data=await aiBrainFetch('/health',{method:'GET'},{base,token});if(!current())return aiBrainStatus||{ok:false,message:'Настройки AI Brain изменились'};const healthMode=String(data.mode||data.detail?.mode||''),fieldVerified=aiRecordAuthenticatedHealth(healthMode,{url:base,authenticated:!!token&&!!data.ok}),ok=!!data.ok&&(!aiConfiguredFieldSafe(base)||fieldVerified);aiBrainStatus={ok,provider:data.provider||'',model:data.model||'',mode:healthMode,detail:data.detail||{},message:ok?'Готов к работе':aiConfiguredFieldSafe(base)?'Безопасный режим сервера не подтверждён':'Мозг отвечает, но модель не готова'};if(toastResult)toast(ok?`AI Brain подключён · ${data.model||data.provider||'готов'}`:aiBrainStatus.message);return aiBrainStatus}catch(e){if(!current())return aiBrainStatus||{ok:false,message:'Настройки AI Brain изменились'};aiRecordAuthenticatedHealth('',{url:base,authenticated:false});aiBrainStatus={ok:false,message:String(e?.message||e)};if(toastResult)toast('AI Brain недоступен: '+aiBrainStatus.message);return aiBrainStatus}finally{if(route==='ai')requestAnimationFrame(()=>{const el=$('aiBrainState');if(el)el.innerHTML=aiBrainStateHtml()})}}
async function requestAiBrain(text){const base=aiServerUrl(),token=aiServerToken(),current=()=>base===aiServerUrl()&&token===aiServerToken();if(aiConfiguredFieldSafe(base)&&!aiFieldSafeHealthVerified()){const health=await checkAiBrain({toastResult:false});if(!current()||!health?.ok||!aiFieldSafeHealthVerified())throw new Error('Безопасный режим AI Brain не подтверждён авторизованной проверкой')};const data=await aiBrainFetch('/analyze',{method:'POST',body:JSON.stringify({text,context:aiContextPayload()})},{base,token});if(!current())throw new Error('Настройки AI Brain изменились во время запроса');if(!data?.ok||!data?.result)throw new Error(data?.message||'AI Brain вернул пустой ответ');return {result:data.result,meta:data.meta||{}}}
function brainDraftFromResponse(text,response){const targetKey=routeState.aiTarget||aiDefaultTargetKey();return aiSafeDraftFromResponse(text,response,targetKey,aiTargetLabel(targetKey))}
function aiFindObjectById(id){return objects.find(o=>o.id===id)||null}
function aiFindOrderByIds(objectId,orderId){const object=aiFindObjectById(objectId),order=object?.orders?.find(q=>q.id===orderId)||null;return object&&order?{object,order}:null}
function aiFindWorkByIds(objectId,orderId,workId){const t=aiFindOrderByIds(objectId,orderId),row=t?.order?.works?.find(w=>w.id===workId)||null;return t&&row?{...t,row}:null}
function aiBrainActionSummary(a){const type=a?.type||'';if(type==='create_object')return `Создать объект: ${a.address||'адрес не указан'}${a.customer_name?` · ${a.customer_name}`:''}`;if(type==='create_order')return `Создать заказ: ${a.order_title||'Новый заказ'}`;if(type==='update_object')return `Изменить данные объекта${a.address?`: ${a.address}`:''}${a.customer_name?` · ${a.customer_name}`:''}`;if(type==='update_order')return `Изменить заказ${a.order_title?`: ${a.order_title}`:''}${a.order_status?` · статус ${a.order_status}`:''}`;if(type==='add_work')return `Добавить работу «${a.work_name||'Без названия'}» · ${a.qty||1} ${a.unit||'компл.'} × ${money(a.price||a.amount||0)}`;if(type==='delete_work'){const hit=aiFindWorkByIds(a.object_id,a.order_id,a.work_id);return `Удалить работу «${hit?.row?.name||a.work_name||'не найдена'}»`};if(type==='update_work'){const hit=aiFindWorkByIds(a.object_id,a.order_id,a.work_id);const bits=[];if(a.new_name)bits.push(`название → ${a.new_name}`);if(a.qty>0)bits.push(`объём → ${a.qty} ${a.unit||hit?.row?.unit||''}`);if(a.price>0)bits.push(`ставка → ${money(a.price)}`);return `Изменить «${hit?.row?.name||a.work_name||'работу'}»${bits.length?`: ${bits.join(', ')}`:''}`};if(type==='set_work_progress'){const hit=aiFindWorkByIds(a.object_id,a.order_id,a.work_id);return `Прогресс «${hit?.row?.name||a.work_name||'работы'}» → ${Math.max(0,Math.min(100,Math.round(a.progress_pct||0)))}%`};if(type==='add_payment')return `Добавить оплату ${money(a.amount)}`;if(type==='add_expense')return `Добавить расход ${money(a.amount)}${a.category?` · ${a.category}`:''}`;if(type==='add_purchase')return `Добавить покупку «${a.work_name||a.note||'Материалы'}» · ${money(a.amount)}`;if(type==='reimburse_purchase'){const target=aiFindOrderByIds(a.object_id,a.order_id);const item=target?.order?.purchases?.find(p=>p.id===String(a.purchase_id||''));return `Отметить возмещение${item?` «${item.name||'Материалы'}» · ${money(item.amount)}`:''}`};if(type==='add_note')return `Добавить заметку: ${a.note||'без текста'}`;if(type==='create_document')return `Создать ${docTypeLabel(a.document_type||'').toLowerCase()}${a.closure_id?' по закрытию':''}`;return aiActionLabel(type)}
function aiBrainStateHtml(){if(!aiServerUrl())return '<span class="aiStateDot local"></span><span><strong>Локальный парсер</strong><small>AI Brain ещё не подключён</small></span>';if(!aiBrainStatus)return '<span class="aiStateDot wait"></span><span><strong>AI Brain настроен</strong><small>Нажмите «Проверить»</small></span>';return `<span class="aiStateDot ${aiBrainStatus.ok?'ok':'bad'}"></span><span><strong>${aiBrainStatus.ok?'AI Brain онлайн':'AI Brain недоступен'}</strong><small>${esc(aiBrainStatus.ok?[aiBrainStatus.provider,aiBrainStatus.model].filter(Boolean).join(' · '):(aiBrainStatus.message||'ошибка'))}</small></span>`}
function aiDraftHtml(draft){if(!draft)return '<div class="aiEmpty"><strong>FRAME ждёт</strong><span>Скажите, что произошло, или спросите про объект, деньги и выполненные работы.</span></div>';if(draft?.ok&&draft.type==='read_answer')return `<div class="aiPreview brainPreview"><div class="aiPreviewHead"><span>FRAME AI</span><b>${Math.round((draft.confidence||0)*100)}%</b></div><strong>${esc(draft.summary)}</strong><small class="aiMeta">${esc([draft.provider,draft.model].filter(Boolean).join(' · '))}</small></div>`;if(!draft.ok)return `<div class="aiError"><strong>${draft.clarification?'AI Brain просит уточнить':'Нужно уточнение'}</strong><span>${esc(draft.error)}</span>${draft.source==='brain'?`<small class="aiMeta">${esc([draft.provider,draft.model].filter(Boolean).join(' · '))}</small>`:''}</div>`;if(draft.type==='brain_batch'){const destructive=draft.actions.some(a=>a.type==='delete_work');return `<div class="aiPreview brainPreview"><div class="aiPreviewHead"><span>AI BRAIN</span><b>${Math.round((draft.confidence||0)*100)}% уверенности</b></div><strong>${esc(draft.summary)}</strong><div class="aiActionPlan">${draft.actions.map((a,i)=>`<div class="aiPlanRow ${a.type==='delete_work'?'dangerPlan':''}"><b>${i+1}</b><span>${esc(aiBrainActionSummary(a))}</span></div>`).join('')}</div><small class="aiMeta">${esc([draft.provider,draft.model].filter(Boolean).join(' · '))}</small><div class="aiPreviewActions"><button id="applyAiDraftBtn" class="btn ${destructive?'danger':'primary'}">${destructive?'⚠️ Подтвердить':'✓ Применить'}</button><button id="clearAiDraftBtn" class="btn ghost">Изменить фразу</button></div></div>`}return `<div class="aiPreview"><div class="aiPreviewHead"><span>${esc(aiActionLabel(draft.type))}</span><b>Локальный парсер</b></div><strong>${esc(draft.summary)}</strong><small>${esc(aiTargetLabel(draft.targetKey))}</small><div class="aiPreviewActions"><button id="applyAiDraftBtn" class="btn primary">✓ Применить</button><button id="clearAiDraftBtn" class="btn ghost">Изменить фразу</button></div></div>`}
function aiHistoryHtml(){const items=aiLogs().slice().reverse().slice(0,6);return items.length?items.map(x=>`<article class="aiHistoryItem ${x.undone?'undone':''}"><span><strong>${esc(aiActionLabel(x.type))}${x.undone?' · отменено':x.undoPending?' · проверяем отмену':''}</strong><small>${esc(x.summary||x.text||'')} · ${esc(new Date(x.at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}</small></span></article>`).join(''):'<div class="empty">AI-изменений пока нет.</div>'}
function renderAiView(){const targets=aiAllTargets(),selected=routeState.aiTarget||aiDefaultTargetKey();routeState.aiTarget=targets.some(x=>x.key===selected)?selected:(targets[0]?.key||'');const mic=!!(window.SpeechRecognition||window.webkitSpeechRecognition),server=aiServerUrl();return `<section class="view aiView"><div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Главная</button></div><div class="card aiHero"><div class="aiBadge">SOLO · 2.6</div><h1>FRAME</h1><p class="help">Говорите обычным языком. Можно сообщить о выполнении, деньгах и новых работах или спросить: «что там по Архангельской?».</p><div id="aiBrainState" class="aiInlineState">${aiBrainStateHtml()}<button id="openAiSettingsBtn" class="btn ghost small">Настроить</button></div><label>О каком заказе говорим<select id="aiTargetSelect"><option value="">Без привязки</option>${targets.map(x=>`<option value="${esc(x.key)}" ${x.key===routeState.aiTarget?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><div class="aiComposer"><textarea id="aiCommandInput" rows="4" placeholder="Например: По Архангельской электрика выполнена, кроме монтажа механизмов розеток"></textarea><div class="aiComposerActions"><button id="aiMicBtn" class="btn ghost" ${mic?'':'disabled'}>${mic?'🎙️ Сказать':'🎙️ Микрофон недоступен'}</button><button id="aiAnalyzeBtn" class="btn primary" ${aiAnalyzing?'disabled':''}>${aiAnalyzing?'🧠 Думаю…':'✨ Отправить FRAME'}</button></div></div><div class="aiChips"><button data-ai-example="Что сейчас по Архангельской: что выполнено, что к закрытию и сколько денег висит?">? Сводка</button><button data-ai-example="Электромонтаж выполнен полностью, кроме монтажа механизмов розеток и выключателей">✓ Выполнение</button><button data-ai-example="Заказчик всё возместил за материалы">₽ Возмещение</button><button data-ai-example="Получил от заказчика весь остаток по этому заказу">＋ Оплата</button></div><p class="aiPrivacy">${server?'AI Brain подключён. Изменения записываются только после предпросмотра и подтверждения.':'Подключение AI Brain находится в Настройки → Система / AI.'}</p></div><div class="card"><h2>FRAME отвечает</h2><div id="aiResult">${aiDraftHtml(aiDraft)}</div></div><div class="card"><div class="sectionTitle"><div><h2>Последние изменения</h2><p class="help compact">Можно откатить последний применённый пакет.</p></div><button id="undoAiBtn" class="btn ghost small" ${aiLogs().some(x=>!x.undone&&!x.undoPending)?'':'disabled'}>↶ Отменить</button></div><div id="aiHistory" class="aiHistory">${aiHistoryHtml()}</div></div></section>`}
function showAiBrainSettings(){openSheet(`<div class="sectionTitle"><div><h1>Подключение AI Brain</h1><p class="help compact">Домашний ПК с Ollama работает как AI-сервер FRAME. Адрес и ключ хранятся только на этом устройстве.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="aiConnectForm"><label>Адрес сервера<input id="aiServerUrlInput" inputmode="url" autocomplete="off" placeholder="https://home-pc.xxxxx.ts.net" value="${esc(aiServerUrl())}"></label><label>Ключ доступа<input id="aiServerTokenInput" type="password" autocomplete="off" placeholder="TOKEN из окна FRAME AI Server" value="${esc(aiServerToken())}"></label><div id="aiConnectState" class="aiConnectState">${aiBrainStateHtml()}</div><button id="saveAiServerBtn" class="btn primary wide">Сохранить и проверить</button><button id="clearAiServerBtn" class="btn ghost wide">Отключить AI Brain</button></div>`);$('saveAiServerBtn').onclick=async()=>{const url=normalizeAiServerUrl($('aiServerUrlInput').value),token=String($('aiServerTokenInput').value||'').trim();storageSet(AI_SERVER_URL_KEY,url);storageSet(AI_SERVER_TOKEN_KEY,token);aiBrainStatus=null;const b=$('saveAiServerBtn');b.disabled=true;b.textContent='Проверяем…';await checkAiBrain({toastResult:true});b.disabled=false;b.textContent='Сохранить и проверить';const state=$('aiConnectState');if(state)state.innerHTML=aiBrainStateHtml();if(route==='ai')requestAnimationFrame(()=>{const main=$('aiBrainState');if(main)main.innerHTML=aiBrainStateHtml()})};$('clearAiServerBtn').onclick=()=>{storageSet(AI_SERVER_URL_KEY,'');storageSet(AI_SERVER_TOKEN_KEY,'');aiBrainStatus=null;closeSheet();if(route==='ai')render();toast('AI Brain отключён. Работает локальный парсер.')};}
function bindAiResult(){if($('applyAiDraftBtn'))$('applyAiDraftBtn').onclick=applyAiDraft;if($('clearAiDraftBtn'))$('clearAiDraftBtn').onclick=()=>{$('aiCommandInput')?.focus();aiDraft=null;$('aiResult').innerHTML=aiDraftHtml(null)}}
async function analyzeAiInput(){const input=$('aiCommandInput'),text=String(input?.value||'').trim();if(!text){toast('Сначала скажите или напишите команду');return}aiAnalyzing=true;const btn=$('aiAnalyzeBtn');if(btn){btn.disabled=true;btn.textContent='🧠 Думаю…'}try{if(aiServerUrl()){const response=await requestAiBrain(text);aiDraft=brainDraftFromResponse(text,response)}else aiDraft=parseAiCommand(text,routeState.aiTarget);if(aiDraft?.targetKey&&aiDraft.source!=='brain'&&aiDraft.targetKey!==routeState.aiTarget){routeState.aiTarget=aiDraft.targetKey;const select=$('aiTargetSelect');if(select)select.value=aiDraft.targetKey}const result=$('aiResult');if(result)result.innerHTML=aiDraftHtml(aiDraft);bindAiResult()}catch(e){console.error('FRAME AI Brain',e);aiDraft={ok:false,source:'brain',error:`AI Brain не ответил: ${String(e?.message||e)}. Проверьте ноутбук, Ollama, сервер и туннель.`};const result=$('aiResult');if(result)result.innerHTML=aiDraftHtml(aiDraft)}finally{aiAnalyzing=false;if(btn){btn.disabled=false;btn.textContent='✨ Разобрать'}}}
async function startAiVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Браузерное распознавание недоступно. Используйте диктовку клавиатуры iPhone.');return}
  try{
    if(aiRecognition){aiRecognition.stop();aiRecognition=null;return}
    const btn=$('aiMicBtn');
    if(btn){btn.disabled=true;btn.textContent='🎙️ Проверяем микрофон…'}
    if(navigator.mediaDevices?.getUserMedia){
      try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop())}
      catch(err){console.warn('FRAME AI microphone permission',err);if(btn){btn.disabled=false;btn.textContent='🎙️ Диктовать'}const name=String(err?.name||'');if(name==='NotAllowedError'||name==='SecurityError')toast('Safari не дал доступ к микрофону. Разрешите микрофон для frame-vl.github.io и попробуйте ещё раз.');else if(name==='NotFoundError')toast('iPhone не видит доступный микрофон.');else toast('Не удалось открыть микрофон: '+(name||'неизвестная ошибка'));return}
    }
    const rec=new SR();aiRecognition=rec;rec.lang='ru-RU';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;if(btn){btn.disabled=false;btn.textContent='⏹ Слушаю…'}let heard='';rec.onstart=()=>{const b=$('aiMicBtn');if(b)b.textContent='⏹ Слушаю…'};rec.onaudiostart=()=>{const b=$('aiMicBtn');if(b)b.textContent='🎙️ Говорите…'};rec.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0]?.transcript||'';text=text.trim();if(text){heard=text;const input=$('aiCommandInput');if(input)input.value=text}};rec.onnomatch=()=>toast('Речь услышала, но не смогла разобрать слова. Попробуйте ещё раз.');rec.onerror=e=>{console.warn('FRAME AI speech recognition',e?.error,e?.message||'');const code=String(e?.error||'unknown'),messages={'no-speech':'Микрофон работает, но речь не обнаружена. Нажмите и начните говорить сразу.','audio-capture':'Safari не смог получить звук с микрофона.','not-allowed':'Safari запретил распознавание речи или доступ к микрофону. Проверьте разрешение сайта.','service-not-allowed':'Служба распознавания речи недоступна в этом режиме Safari. Используйте диктовку клавиатуры iPhone.','network':'Служба распознавания Safari не ответила по сети. Попробуйте ещё раз.','language-not-supported':'Safari не поддержал русский язык распознавания на этом устройстве.','aborted':'Диктовка остановлена.'};toast(messages[code]||('Ошибка распознавания: '+code))};rec.onend=()=>{aiRecognition=null;const b=$('aiMicBtn');if(b){b.disabled=false;b.textContent='🎙️ Диктовать'};if(heard)toast('Речь распознана ✓')};rec.start();
  }catch(e){console.warn(e);aiRecognition=null;const btn=$('aiMicBtn');if(btn){btn.disabled=false;btn.textContent='🎙️ Диктовать'};toast('Диктовка сейчас недоступна: '+String(e?.name||'ошибка'))}
}
function aiResolveObjectRef(ref,aliases,workMap){const id=aliases.get(ref)||ref;return workMap.get(id)||null}
function aiResolveOrderRef(obj,ref,aliases){const id=aliases.get(ref)||ref;return obj?.orders?.find(q=>q.id===id)||null}
function aiSafeOrderStatus(value='',fallback='work'){return ['draft','agreed','work','awaiting','paused','done','paid'].includes(value)?value:fallback}
function aiSafeObjectStatus(value='',fallback='auto'){return ['work','done','paused','draft','auto'].includes(value)?value:fallback}
function aiStableValue(value){if(Array.isArray(value))return value.map(aiStableValue);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=aiStableValue(value[key]);return out}return value}
function aiStoredObjectMatches(expected){const actual=objects.find(object=>object.id===expected.id);return !!actual&&JSON.stringify(aiStableValue(normalizeObject(clone(actual))))===JSON.stringify(aiStableValue(normalizeObject(clone(expected))))}
function aiDocumentEntry(object,order,action){const type=String(action.document_type||''),allowed=new Set(['proposal','worklist','act']);if(!allowed.has(type))throw new Error('Поддерживаются только КП, перечень работ и акт');let rows=[],options={},total=0,closureId='',autoClosure=null;if(type==='proposal'){if(String(action.closure_id||''))throw new Error('КП не должно ссылаться на закрытие');rows=orderDocumentRows(order,{});const calculated=rows.filter(row=>row.kind!=='material').reduce((sum,row)=>sum+workRowTotal(row),0),contract=String(order.pricing?.contractTotal??'').trim();total=contract===''?calculated:Math.max(0,parseNum(contract));options={contractTotal:order.pricing?.contractTotal??'',showDiscount:object.showDiscountInDocuments!==false}}else{closureId=String(action.closure_id||'');let closure=(order.workClosures||[]).find(item=>item.id===closureId);if(!closure&&!closureId){closure=freezeReadyClosure(order);autoClosure=closure}if(!closure)throw new Error('Нет выполненного объёма для документа');closureId=closure.id;rows=(closure.snapshot||[]).map(clone);total=Math.max(0,parseNum(closure.amount));options={contractTotal:'',showDiscount:true,closureId:closure.id,closureNumber:closure.number,documentDate:closure.date,copies:1}}return {entry:{id:uid(),type,date:now(),total,snapshot:rows.map(clone),options:clone(options),closureId},autoClosure}}
async function applyBrainDraft(d,authorizationToken=''){
  frameLastApplyReceipt={ok:false,error:'Действие не выполнено',actionTypes:(d?.actions||[]).map(a=>String(a?.type||'')),links:[]};
  if(!d?.actions?.length)return false;
  const authorization=aiConsumeAuthorizedDraft(d,authorizationToken);if(!authorization.ok){frameLastApplyReceipt.error=authorization.error;toast(authorization.error);return false}
  const destructive=d.actions.some(a=>a.type==='delete_work');if(destructive&&!confirm('FRAME AI собирается удалить работу. Применить показанный план?')){frameLastApplyReceipt.error='Пользователь отменил действие';return false}
  const workMap=new Map(),beforeMap=new Map(),objectAliases=new Map(),orderAliases=new Map(),undoOps=[],createdIds=[];let committedObjects=[],didCommit=false,createdDocumentId='';const getObj=id=>{const actual=objectAliases.get(id)||id;if(workMap.has(actual))return workMap.get(actual);const src=objects.find(o=>o.id===actual);if(!src)throw new Error(`Объект ${id||'без id'} не найден`);const before=normalizeObject(clone(src)),c=normalizeObject(clone(src));beforeMap.set(actual,before);workMap.set(actual,c);return c};const getOrder=(obj,id)=>{const actual=orderAliases.get(id)||id;const order=obj?.orders?.find(q=>q.id===actual);if(!order)throw new Error(`Заказ ${id||'без id'} не найден`);return order};let firstTarget='';
  try{
    for(let index=0;index<d.actions.length;index++){
      const a=d.actions[index]||{},kind=a.type;
      if(kind==='create_object'){
        if(!String(a.address||'').trim()&&!String(a.customer_name||'').trim())throw new Error('Для нового объекта нет адреса или заказчика');
        const o=defaultObject(),q=o.orders[0];o.contact.address=String(a.address||'').trim();o.contact.name=String(a.customer_name||'').trim();o.contact.phone=String(a.phone||'').trim();o.status=aiSafeObjectStatus(a.object_status,'auto');q.title=String(a.order_title||'').trim()||'Основные работы';q.status=aiSafeOrderStatus(a.order_status,'work');workMap.set(o.id,o);createdIds.push(o.id);const oRef=String(a.object_id||`@new_object_${index+1}`),qRef=String(a.order_id||`@new_order_${index+1}`);objectAliases.set(oRef,o.id);orderAliases.set(qRef,q.id);undoOps.unshift({kind:'delete_object',objectId:o.id});if(!firstTarget)firstTarget=`${o.id}|${q.id}`;continue;
      }
      const obj=getObj(String(a.object_id||''));
      if(kind==='create_order'){
        const q=defaultOrder((obj.orders||[]).length+1);q.title=String(a.order_title||'').trim()||`Заказ ${obj.orders.length+1}`;q.status=aiSafeOrderStatus(a.order_status,'work');obj.orders.push(q);const qRef=String(a.order_id||`@new_order_${index+1}`);orderAliases.set(qRef,q.id);undoOps.unshift({kind:'remove_order',objectId:obj.id,orderId:q.id});if(!firstTarget)firstTarget=`${obj.id}|${q.id}`;continue;
      }
      if(kind==='update_object'){
        undoOps.unshift({kind:'restore_object_fields',objectId:obj.id,contact:clone(obj.contact),status:obj.status});if(String(a.address||'').trim())obj.contact.address=String(a.address).trim();if(String(a.customer_name||'').trim())obj.contact.name=String(a.customer_name).trim();if(String(a.phone||'').trim())obj.contact.phone=String(a.phone).trim();if(String(a.object_status||'').trim())obj.status=aiSafeObjectStatus(a.object_status,obj.status||'auto');continue;
      }
      const order=getOrder(obj,String(a.order_id||''));if(!firstTarget)firstTarget=`${obj.id}|${order.id}`;
      if(kind==='update_order'){
        undoOps.unshift({kind:'restore_order_fields',objectId:obj.id,orderId:order.id,title:order.title,status:order.status,comment:order.comment});if(String(a.order_title||'').trim())order.title=String(a.order_title).trim();if(String(a.order_status||'').trim())order.status=aiSafeOrderStatus(a.order_status,order.status||'work');if(String(a.note||'').trim())order.comment=String(a.note).trim();continue;
      }
      if(kind==='add_work'){
        const price=parseNum(a.price||a.amount),qty=parseNum(a.qty)>0?parseNum(a.qty):1,name=String(a.work_name||'').trim();if(!name)throw new Error('У новой работы нет названия');if(price<0)throw new Error('Цена работы не может быть отрицательной');const oldContract=String(order.pricing.contractTotal??'').trim(),row=normalizeGenericRow({name,qty:String(qty),unit:String(a.unit||'компл.').trim()||'компл.',price:String(price),moduleId:inferWorkModuleId('',name),group:workModuleTitle(inferWorkModuleId('',name)),comment:`Добавлено через FRAME AI Brain · ${today()}`},'Работы');order.works.push(row);if(oldContract!=='')order.pricing.contractTotal=String(parseNum(oldContract)+workRowTotal(row));undoOps.unshift({kind:'remove_work',objectId:obj.id,orderId:order.id,id:row.id,contractTotal:oldContract});continue;
      }
      const row=(order.works||[]).find(w=>w.id===String(a.work_id||''));
      if(['delete_work','update_work','set_work_progress'].includes(kind)&&!row)throw new Error(`Не найдена работа «${a.work_name||a.work_id||''}»`);
      if(kind==='delete_work'){
        const idx=order.works.findIndex(w=>w.id===row.id),oldContract=String(order.pricing.contractTotal??'').trim();undoOps.unshift({kind:'insert_work',objectId:obj.id,orderId:order.id,index:idx,row:clone(row),contractTotal:oldContract});order.works.splice(idx,1);if(oldContract!=='')order.pricing.contractTotal=String(Math.max(0,parseNum(oldContract)-workRowTotal(row)));continue;
      }
      if(kind==='update_work'){
        const old=clone(row),oldContract=String(order.pricing.contractTotal??'').trim(),before=workRowTotal(row);undoOps.unshift({kind:'restore_work',objectId:obj.id,orderId:order.id,id:row.id,row:old,contractTotal:oldContract});if(String(a.new_name||'').trim())row.name=String(a.new_name).trim();if(parseNum(a.qty)>0)row.qty=String(parseNum(a.qty));if(String(a.unit||'').trim())row.unit=String(a.unit).trim();if(parseNum(a.price)>0)row.price=String(parseNum(a.price));row.moduleId=inferWorkModuleId(row.group,row.name);row.group=workModuleTitle(row.moduleId);if(oldContract!=='')order.pricing.contractTotal=String(Math.max(0,parseNum(oldContract)+(workRowTotal(row)-before)));continue;
      }
      if(kind==='set_work_progress'){
        undoOps.unshift({kind:'restore_progress',objectId:obj.id,orderId:order.id,id:row.id,pct:workProgressPct(row),note:row.progressNote||''});row.progressPct=Math.max(0,Math.min(100,Math.round(parseNum(a.progress_pct))));row.progressNote=`FRAME AI Brain · ${today()}`;continue;
      }
      if(kind==='add_payment'){
        const amount=parseNum(a.amount);if(amount<=0)throw new Error('Сумма оплаты должна быть больше нуля');const item=normalizePayment({amount:String(amount),date:today(),note:`Добавлено через FRAME AI · ${today()}`});order.payments.push(item);undoOps.unshift({kind:'remove_payment',objectId:obj.id,orderId:order.id,id:item.id});continue;
      }
      if(kind==='add_expense'){
        const amount=parseNum(a.amount);if(amount<=0)throw new Error('Сумма расхода должна быть больше нуля');const category=/материал/i.test(a.category||'')?'materialsIncluded':'worker',worker=/посред/i.test(a.category||'')?'Посредник':String(a.category||'Исполнитель');const item=normalizeExpense({category,amount:String(amount),date:today(),worker,work:String(a.work_name||''),comment:`Добавлено через FRAME AI · ${today()}`},'order');order.expenses.push(item);undoOps.unshift({kind:'remove_expense',objectId:obj.id,orderId:order.id,id:item.id});continue;
      }
      if(kind==='reimburse_purchase'){const item=(order.purchases||[]).find(p=>p.id===String(a.purchase_id||''));if(!item)throw new Error('Не найдена покупка для возмещения');undoOps.unshift({kind:'restore_purchase_status',objectId:obj.id,orderId:order.id,id:item.id,status:item.status});item.status='reimbursed';item.comment=[item.comment,`Возмещение подтверждено через FRAME AI · ${today()}`].filter(Boolean).join(' · ');continue;}
      if(kind==='add_purchase'){
        const amount=parseNum(a.amount);if(amount<=0)throw new Error('Сумма покупки должна быть больше нуля');const item=normalizePurchase({name:String(a.work_name||a.note||'Материалы / расходники'),amount:String(amount),date:today(),status:'due',comment:`Добавлено через FRAME AI · ${today()}`});order.purchases.push(item);undoOps.unshift({kind:'remove_purchase',objectId:obj.id,orderId:order.id,id:item.id});continue;
      }
      if(kind==='add_note'){
        const note=String(a.note||'').trim();if(!note)throw new Error('Пустая заметка');undoOps.unshift({kind:'restore_comment',objectId:obj.id,orderId:order.id,comment:order.comment||''});order.comment=[order.comment,note].filter(Boolean).join(' · ');continue;
      }
      if(kind==='create_document'){
        const built=aiDocumentEntry(obj,order,a),entry=built.entry;order.documentHistory.push(entry);createdDocumentId=entry.id;undoOps.unshift(built.autoClosure?{kind:'remove_document_and_closure',objectId:obj.id,orderId:order.id,id:entry.id,closureId:built.autoClosure.id,items:clone(built.autoClosure.items||[])}:{kind:'remove_document',objectId:obj.id,orderId:order.id,id:entry.id});continue;
      }
      throw new Error(`FRAME пока не умеет применять действие ${kind}`);
    }
    committedObjects=[...workMap.values()].map(obj=>{obj.updatedAt=beforeMap.has(obj.id)?aiNextObjectRevision(beforeMap.get(obj.id).updatedAt):now();o…31480 tokens truncated…Ref(oid,rid,item.kind==='purchase'?'purchases':'payments')});
    $('newObjectBtn').onclick=async()=>{const object=defaultObject();object.contact.address='';object.contact.name='';const saved=await saveObject(object);frameSelectTargetRefs(saved.id,saved.orders[0].id);navigate('object');toast('Новый заказ создан')};
    if($('quickPriceBtn'))$('quickPriceBtn').onclick=()=>showPriceListSheet();
    if($('documentsBtn'))$('documentsBtn').onclick=()=>navigate('globalDocs');
    $$('[data-dashboard-list]').forEach(b=>b.onclick=()=>navigate('ordersList',{kind:b.dataset.dashboardList}));
    if($('monthFinanceCard'))$('monthFinanceCard').onclick=()=>navigate('finances',{kind:'month',tab:'overview'});
    $$('[data-object-id]').forEach(el=>{const open=()=>frameOpenObjectRef(el.dataset.objectId);el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  }
  if(route==='ordersList'){}
  if(route==='objectsList'){$$('[data-object-id]').forEach(el=>{const open=()=>frameOpenObjectRef(el.dataset.objectId);el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});}
  if(route==='ai')bindAiView();
  if(route==='settings')bindSettings();
  if(route==='globalDocs'){
    if($('createGlobalDoc'))$('createGlobalDoc').onclick=showGlobalDocCreate;
    let filter='all';const apply=()=>{const q=($('globalDocSearch')?.value||'').trim().toLowerCase();let visible=0;$$('[data-global-doc]').forEach(card=>{card.hidden=(filter!=='all'&&card.dataset.docType!==filter)||!!q&&!card.dataset.docSearch.includes(q);if(!card.hidden)visible++});if($('globalDocFilterEmpty'))$('globalDocFilterEmpty').hidden=visible>0||!$$('[data-global-doc]').length};
    if($('globalDocSearch'))$('globalDocSearch').oninput=apply;$$('[data-doc-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.docFilter;$$('[data-doc-filter]').forEach(x=>x.classList.toggle('active',x===b));apply()});
    $$('[data-global-doc-open]').forEach(b=>b.onclick=()=>{const [oid,rid,idx]=b.dataset.globalDocOpen.split('|'),target=frameSelectTargetRefs(oid,rid),h=target?.order?.documentHistory?.[+idx];if(h){if(['proposal','worklist','act'].includes(h.type))buildOrderDocument(h.type,h.snapshot||[],h.options||{});else navigate('documents')}});
    $$('[data-global-doc-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();const [oid,rid,idx]=b.dataset.globalDocDelete.split('|');deleteDocumentEntry(oid,rid,+idx)});
  }
  if(route==='globalGallery')$$('[data-global-gallery-object]').forEach(button=>button.onclick=()=>frameOpenObjectPhotosRef(button.dataset.globalGalleryObject));
  if(route==='finances')bindFinancesView();
  if(route==='object')bindObjectView();
  if(route==='order')bindOrderView();
  if(route==='works')bindWorksView();
  if(route==='floor')bindFloorView();
  if(route==='doors')bindDoorsView();
  if(route==='purchases')bindPurchasesView();
  if(route==='expenses')bindExpensesView();
  if(route==='payments')bindPaymentsView();
  if(route==='photos')bindPhotosView();
  if(route==='objectPhotos')$$('[data-object-photo-order]').forEach(button=>button.onclick=()=>frameOpenOrderRef(currentObjectId,button.dataset.objectPhotoOrder,'photos'));
  if(route==='documents')bindDocumentsView();
}

function bindSettings(){
  $$('[data-profile]').forEach(el=>{const event=el.type==='date'?'change':'input';el.addEventListener(event,()=>{let value=el.value;if(el.dataset.profile==='phone'){value=formatPhone(value);el.value=value}profile[el.dataset.profile]=value;saveProfile();const status=$('autosaveStatus');if(status)status.textContent='Сохранено на устройстве'})});
  if($('clearPassportBtn'))$('clearPassportBtn').onclick=()=>{if(!confirm('Удалить сохранённые паспортные данные?'))return;for(const k of ['passportSeries','passportNumber','passportIssuedBy','passportIssuedDate','passportCode','registrationAddress'])profile[k]='';saveProfile();render();toast('Паспортные данные удалены')};
  $$('[data-rate]').forEach(el=>el.addEventListener('input',()=>{rates[el.dataset.rate]=parseNum(el.value);saveRates();const status=$('autosaveStatus');if(status)status.textContent='Мои цены сохранены'}));
  $$('[data-custom-cover-index]').forEach(el=>el.addEventListener('input',()=>{const item=customFloorCovers[+el.dataset.customCoverIndex];if(!item)return;if(el.dataset.customCoverKey)item[el.dataset.customCoverKey]=el.value;if(el.dataset.customCoverPattern)item.patterns[el.dataset.customCoverPattern]=rawNum(el.value);saveCustomFloorCovers();const status=$('autosaveStatus');if(status)status.textContent='Мои покрытия сохранены'}));
  $$('[data-remove-custom-cover]').forEach(b=>b.onclick=()=>{customFloorCovers.splice(+b.dataset.removeCustomCover,1);saveCustomFloorCovers();render();toast('Покрытие удалено')});
  if($('addCustomCoverBtn'))$('addCustomCoverBtn').onclick=()=>{customFloorCovers.push(normalizeCustomFloorCover({name:'Новое покрытие',price:''}));saveCustomFloorCovers();render();requestAnimationFrame(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}))};
  if($('rateSearch'))$('rateSearch').oninput=e=>{const q=e.target.value.trim().toLowerCase();$$('[data-price-row]').forEach(row=>row.hidden=!!q&&!row.dataset.priceName.includes(q));$$('[data-price-group]').forEach(group=>{const any=$$('[data-price-row]',group).some(row=>!row.hidden);group.hidden=!any;if(q&&any)group.open=true});$$('[data-price-category]').forEach(category=>{const any=$$('[data-price-row]',category).some(row=>!row.hidden);category.hidden=!any;if(q&&any)category.open=true})};
  if($('includePrivateExport'))$('includePrivateExport').onchange=e=>storageSet(EXPORT_PRIVATE_KEY,e.target.checked?'1':'0');
  if($('exportBackupBtn'))$('exportBackupBtn').onclick=exportBackup;
  if($('importBackupInput'))$('importBackupInput').onchange=handleImportFile;
}

function showObjectSummarySheet(kind){const object=currentObject();if(!object)return;const title={work:'Стоимость работ',paid:'Оплачено',remaining:'Осталось'}[kind]||'Сводка';const rows=(object.orders||[]).map(order=>{const value=kind==='paid'?orderPaid(order):kind==='remaining'?orderRemaining(order):orderWorkTotal(order);return `<button class="summaryLine clickableSummary" data-order-link="${object.id}|${order.id}"><span><strong>${esc(order.title)}</strong><small class="muted" style="display:block">${ruDate(order.date)} · ${orderStatusName(order.status)}</small></span><strong>${money(value)}</strong></button>`}).join('');openSheet(`<div class="sectionTitle"><div><h1>${title}</h1><p class="help compact">Нажмите на заказ, чтобы открыть карточку.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="summaryList">${rows||'<div class="empty">Нет данных.</div>'}</div>`);$$('[data-order-link]',$('sheetPanel')).forEach(b=>b.onclick=()=>{const [oid,rid]=b.dataset.orderLink.split('|');closeSheet();frameOpenOrderRef(oid,rid)})}
function showObjectReimbursementSheet(){const object=currentObject();if(!object)return;const rows=(object.orders||[]).filter(o=>orderDuePurchases(o)>.01).map(order=>`<button class="summaryLine clickableSummary" data-reimburse-order="${order.id}"><span><strong>${esc(order.title)}</strong><small class="muted" style="display:block">${(order.purchases||[]).filter(p=>p.status!=='reimbursed').length} покупок к возмещению</small></span><strong>${money(orderDuePurchases(order))}</strong></button>`).join('');openSheet(`<div class="sectionTitle"><div><h1>К возмещению</h1><p class="help compact">Нажмите на заказ и сразу откроются его покупки мастера.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="summaryList">${rows||'<div class="empty">Всё возмещено.</div>'}</div>`);$$('[data-reimburse-order]',$('sheetPanel')).forEach(b=>b.onclick=()=>{closeSheet();frameOpenOrderRef(object.id,b.dataset.reimburseOrder,'purchases')})}
function bindObjectView(){const object=currentObject();if(!object)return;
  const fields={objectName:'name',objectPhone:'phone',objectAddress:'address',objectComment:'comment'};
  Object.entries(fields).forEach(([id,key])=>$(id).addEventListener('input',e=>{let value=e.target.value;if(key==='phone'){value=formatPhone(value);e.target.value=value}object.contact[key]=value;queueSave()}));
  $('objectStatus').onchange=e=>{object.status=e.target.value;queueSave();render()};
  $('showDiscountDocs').onchange=e=>{object.showDiscountInDocuments=e.target.checked;queueSave()};
  $$('[data-object-summary]').forEach(b=>b.onclick=()=>showObjectSummarySheet(b.dataset.objectSummary));
  if($('objectReimburseBtn'))$('objectReimburseBtn').onclick=showObjectReimbursementSheet;
  $$('[data-order-purchases]').forEach(b=>b.onclick=e=>{e.stopPropagation();frameOpenOrderRef(object.id,b.dataset.orderPurchases,'purchases')});
  $('newOrderBtn').onclick=async()=>{const order=defaultOrder(object.orders.length+1);object.orders.push(order);await saveObject(object);frameSelectTargetRefs(object.id,order.id);editorState={key:'',snapshot:null,dirty:false};commitNavigate('order',{}, {scrollToId:'orderActionsCard',behavior:'smooth'});toast('Новый заказ создан')};
  $$('[data-order-id]').forEach(el=>{const open=()=>frameOpenOrderRef(object.id,el.dataset.orderId);el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  $$('[data-object-works]').forEach(button=>button.onclick=e=>{e.stopPropagation();frameOpenOrderRef(object.id,button.dataset.objectWorks,'works')});
  $('deleteObjectBtn').onclick=async()=>{if(!confirm('Удалить объект вместе со всеми заказами?'))return;await dbDelete(object.id);objects=objects.filter(o=>o.id!==object.id);mirrorBackup();currentObjectId='';currentOrderId='';if(typeof frameSetTopic==='function')frameSetTopic('');editorState={key:'',snapshot:null,dirty:false};commitNavigate('ai');toast('Объект удалён')};
}
function updateOrderPricingLive(){const order=currentOrder();if(!order)return;const calculated=orderCalculatedWorkTotal(order),final=orderContractTotal(order),adjustment=final-calculated,paid=orderPaid(order);if($('calculatedWorkMetric'))$('calculatedWorkMetric').textContent=money(calculated);if($('orderWorkMetric'))$('orderWorkMetric').textContent=money(final);if($('orderRemainingMetric'))$('orderRemainingMetric').textContent=money(Math.max(0,final-paid));const label=$('pricingAdjustment');if(label){label.classList.toggle('discount',adjustment<0);label.classList.toggle('increase',adjustment>0);label.textContent=adjustment<0?`Индивидуальная скидка: ${money(Math.abs(adjustment))}`:adjustment>0?`Корректировка стоимости: +${money(adjustment)}`:'Итог совпадает с расчётом'}}
function showOrderDatesSheet(){const order=currentOrder();if(!order)return;const lastPay=order.payments?.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];openSheet(`<div class="sectionTitle"><div><h1>Даты заказа</h1><p class="help compact">FRAME заполняет даты автоматически, но их можно поправить.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="grid two"><label>Начало работ<input id="orderStartedAtEdit" type="date" value="${esc(order.startedAt||order.date||'')}"></label><label>Завершение<input id="orderCompletedAtEdit" type="date" value="${esc(order.completedAt||'')}"></label></div>${lastPay?`<div class="backupNote">Последняя оплата: ${ruDate(lastPay.date)} · ${money(lastPay.amount)}. Все платежи с датами находятся в разделе «Оплаты».</div>`:''}<button id="saveOrderDates" class="btn primary wide" style="margin-top:12px">Сохранить даты</button>`);$('saveOrderDates').onclick=()=>{order.startedAt=$('orderStartedAtEdit').value;order.completedAt=$('orderCompletedAtEdit').value;queueSave();closeSheet();render()}}
function bindOrderView(){const object=currentObject(),order=currentOrder();if(!object||!order)return;if($('orderAiBtn'))$('orderAiBtn').onclick=()=>{aiDraft=null;const key=`${object.id}|${order.id}`;if(typeof frameSetTopic==='function')frameSetTopic(key);navigate('ai',{aiTarget:key})};
  const map={orderTitle:'title',orderDate:'date',orderComment:'comment'};
  Object.entries(map).forEach(([id,key])=>$(id).addEventListener($(id).type==='date'?'change':'input',e=>{order[key]=e.target.value;queueSave()}));
  $('orderStatus').onchange=e=>{order.status=e.target.value;if(['work','agreed'].includes(order.status)&&!order.startedAt)order.startedAt=today();if(['awaiting','done','paid'].includes(order.status)&&!order.completedAt)order.completedAt=today();queueSave();render()};
  $('orderTaxRate').onchange=e=>{order.taxRate=e.target.value;queueSave();render()};
  $('orderDatesBtn').onclick=()=>showOrderDatesSheet();
  $('orderContractTotal').oninput=e=>{order.pricing.contractTotal=rawNum(e.target.value);queueSave();updateOrderPricingLive()};
  if($('resetContractPrice'))$('resetContractPrice').onclick=()=>{order.pricing.contractTotal='';queueSave();render()};
  $$('[data-order-summary="pricing"]').forEach(b=>b.onclick=()=>$('pricingCard')?.scrollIntoView({behavior:'smooth',block:'center'}));
  $$('[data-open-module]').forEach(b=>b.onclick=()=>navigate(b.dataset.openModule));
  if($('openWorkModulesBtn'))$('openWorkModulesBtn').onclick=showWorkModulePicker;
  $('deleteOrderBtn').onclick=async()=>{if(object.orders.length===1){toast('У объекта должен остаться хотя бы один заказ');return}if(!confirm('Удалить этот заказ?'))return;object.orders=object.orders.filter(o=>o.id!==order.id);await saveObject(object);frameSelectTargetRefs(object.id,object.orders[object.orders.length-1].id);editorState={key:'',snapshot:null,dirty:false};commitNavigate('object');toast('Заказ удалён')};
}
function bindFloorView(){const order=currentOrder(),f=order?.floor;if(!order||!f)return;
  $$('[data-floor-step]').forEach(b=>b.onclick=()=>{routeState.floorStep=+b.dataset.floorStep;render()});
  $$('[data-floor-next]').forEach(b=>b.onclick=()=>{routeState.floorStep=+b.dataset.floorNext;render()});
  $$('[data-floor-prev]').forEach(b=>b.onclick=()=>{routeState.floorStep=+b.dataset.floorPrev;render()});
  const autoRate=()=>{f.installRate=String(rateForFloor(f.cover,f.thickness,f.pattern)||'')};
  if($('floorCover'))$('floorCover').onchange=e=>{f.cover=e.target.value;if(f.cover!=='laminate')f.thickness='standard';if(!floorSupportsPatterns(f.cover))f.pattern='straight';autoRate();queueSave();render()};
  if($('floorThickness'))$('floorThickness').onchange=e=>{f.thickness=e.target.value;autoRate();queueSave();render()};
  if($('floorPattern'))$('floorPattern').onchange=e=>{f.pattern=e.target.value;autoRate();queueSave();render()};
  if($('floorOtherCover'))$('floorOtherCover').oninput=e=>{f.otherCover=e.target.value;queueSave()};
  if($('floorInstallRate'))$('floorInstallRate').oninput=e=>{f.installRate=rawNum(e.target.value);updateFloorLive();queueSave()};
  if($('floorArea'))$('floorArea').oninput=e=>{f.area=rawNum(e.target.value);updateFloorLive();queueSave()};
  if($('floorBaseboardEnabled'))$('floorBaseboardEnabled').onchange=e=>{f.baseboard.enabled=e.target.checked;if(e.target.checked&&!f.baseboard.qty)f.baseboard.qty=f.area;queueSave();render()};
  if($('floorBaseboardType'))$('floorBaseboardType').onchange=e=>{f.baseboard.type=e.target.value;f.baseboard.rate=String(rates[`floor.baseboard.${f.baseboard.type}`]||'');queueSave();render()};
  if($('floorBaseboardQty'))$('floorBaseboardQty').oninput=e=>{f.baseboard.qty=rawNum(e.target.value);updateFloorLive();queueSave()};
  if($('floorBaseboardRate'))$('floorBaseboardRate').oninput=e=>{f.baseboard.rate=rawNum(e.target.value);updateFloorLive();queueSave()};
  bindGenericRows(f);
  if($('addFloorDemo'))$('addFloorDemo').onclick=()=>{let v=$('floorDemoPreset').value,row;if(v==='lockSave')row=floorDemoPreset('laminate',f.area,'save');else if(v==='glueHard')row=floorDemoPreset('glue',f.area,'hard');else row=floorDemoPreset(v,f.area);f.demolition.push(row);queueSave();render()};
  if($('addFloorPrep'))$('addFloorPrep').onclick=()=>{f.preparation.push(floorPrepPreset($('floorPrepPreset').value,f.area));queueSave();render()};
  if($('addFloorExtra'))$('addFloorExtra').onclick=()=>{f.extras.push(floorExtraPreset($('floorExtraPreset').value,f.area));queueSave();render()};
  if($('addFloorMaterial'))$('addFloorMaterial').onclick=()=>{f.materials.push(normalizeGenericRow({name:'',qty:'1',unit:'шт.',price:'',kind:'material',group:'Материалы для предложения'},'Материалы для предложения','material'));queueSave();render()};
  if($('finishFloorBtn'))$('finishFloorBtn').onclick=async()=>{f.completed=calculateFloor(f).rows.length>0;queueSave();if(await saveEditor({silent:true})){commitNavigate('order');toast('Раздел «Полы» сохранён')}};
}
function bindGenericRows(f){
  $$('[data-row-collection]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const collection=el.dataset.rowCollection,index=+el.dataset.rowIndex,key=el.dataset.rowKey;if(!f[collection]?.[index])return;f[collection][index][key]=key==='qty'||key==='price'?rawNum(el.value):el.value;const sum=document.querySelector(`[data-row-sum="${collection}-${index}"]`);if(sum)sum.textContent=money(parseNum(f[collection][index].qty)*parseNum(f[collection][index].price));updateFloorLive();queueSave()}));
  $$('[data-remove-row]').forEach(b=>b.onclick=()=>{const collection=b.dataset.removeRow,index=+b.dataset.rowIndex;f[collection].splice(index,1);queueSave();render()});
}
function updateFloorLive(){const order=currentOrder();if(!order)return;const c=calculateFloor(order.floor);if($('floorWorkTotal'))$('floorWorkTotal').textContent=money(c.workTotal);if($('floorMaterialTotal'))$('floorMaterialTotal').textContent=money(c.materialTotal)}

function bindDoorsView(){const order=currentOrder(),d=order?.doors;if(!order||!d)return;
  $('addDoorWorkBtn').onclick=showAddDoorSheet;
  $$('[data-door-card]').forEach(card=>card.addEventListener('toggle',()=>{const index=+card.dataset.doorCard;if(card.open){routeState.openDoorIndex=index;$$('[data-door-card]').forEach(other=>{if(other!==card)other.open=false})}else if(routeState.openDoorIndex===index)routeState.openDoorIndex=null}));
  $$('[data-door-index]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const i=+el.dataset.doorIndex,key=el.dataset.doorKey,item=d.items[i];if(!item)return;const isNumeric=['qty','unitPrice','doborExtra','lockExtra','hingeExtra'].includes(key);item[key]=isNumeric?rawNum(el.value):el.value;
    if(key==='unitPrice')item.priceMode='manual';
    if(item.kind==='installation'&&['dobor','doborExtra','lock','lockExtra','hinges','hingeExtra'].includes(key)&&item.priceMode!=='manual')item.unitPrice=String(doorInstallationPrice(item));
    const sum=document.querySelector(`[data-door-sum="${i}"]`);if(sum)sum.textContent=money(parseNum(item.qty)*parseNum(item.unitPrice));
    const meta=document.querySelector(`[data-door-meta="${i}"]`);if(meta)meta.textContent=doorCardMeta(item);
    const priceInput=document.querySelector(`[data-door-index="${i}"][data-door-key="unitPrice"]`);if(priceInput&&key!=='unitPrice')priceInput.value=item.unitPrice;
    if($('doorsTotal'))$('doorsTotal').textContent=money(calculateDoors(d).total);queueSave();
    if(el.tagName==='SELECT'&&['dobor','lock','hinges'].includes(key))render();
  }));
  $$('[data-remove-door]').forEach(b=>b.onclick=()=>{const index=+b.dataset.removeDoor;d.items.splice(index,1);d.completed=d.items.length>0;if(routeState.openDoorIndex===index)routeState.openDoorIndex=null;else if(routeState.openDoorIndex>index)routeState.openDoorIndex--;queueSave();render()});
  $$('[data-duplicate-door]').forEach(b=>b.onclick=()=>{const copy=clone(d.items[+b.dataset.duplicateDoor]);copy.id=uid();copy.qty='1';d.items.push(copy);d.completed=true;routeState.openDoorIndex=d.items.length-1;queueSave();render();setTimeout(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}),20)});
  $$('[data-door-auto]').forEach(b=>b.onclick=()=>{const item=d.items[+b.dataset.doorAuto];item.priceMode='auto';if(item.kind==='installation')item.unitPrice=String(doorInstallationPrice(item));else if(item.rateKey)item.unitPrice=String(rates[item.rateKey]||'');queueSave();render()});
}
function showAddDoorSheet(){const html=`<div class="sectionTitle"><div><h1>Добавить дверную работу</h1><p class="help compact">Сначала выберите раздел, затем конкретную работу.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="scenarioTabs" id="doorScenarioChoices"><button class="active" data-door-scenario="installation">Установка</button><button data-door-scenario="service">Обслуживание</button><button data-door-scenario="opening">Проём</button></div><div id="doorScenarioPanel" class="scenarioPanel"></div>`;openSheet(html);let scenario='installation';const lists={installation:{title:'Установка двери',help:'Выберите тип новой двери.',items:[['interroom','Межкомнатная дверь','Базовая установка 6 000 ₽'],['sliding','Откатная дверь','Вдоль стены'],['pocket','Дверь-пенал','Полотно уходит в стену'],['double','Двустворчатая дверь','Два полотна'],['hidden','Скрытая распашная дверь','Алюминиевая коробка'],['entrance','Входная дверь','Цена вручную'],['other','Другое','Своя дверь']]},service:{title:'Обслуживание и доработка',help:'Работы по уже установленной двери.',items:[['latch','Установка простой защёлки','1 500 ₽'],['magnetic','Установка магнитного замка','2 500 ₽'],['trim','Замена телескопических наличников','2 000 ₽'],['adjustment','Регулировка двери','3 000 ₽'],['limiter','Установка ограничителя','500 ₽'],['dobor','Замена доборов','2 000 ₽'],['demo','Демонтаж старой двери','1 500 ₽'],['other','Другое','Своя работа']]},opening:{title:'Оформление проёма',help:'Портал или оформление входного проёма.',items:[['portal','Обычный портал','Цена вручную'],['entrancePortal','Проём входной двери','Ориентир 5 000 ₽'],['other','Другое','Нестандартный проём']]}};const renderScenario=()=>{const panel=$('doorScenarioPanel'),data=lists[scenario];panel.innerHTML=`<div class="scenarioHeading"><h2>${data.title}</h2><p>${data.help}</p></div><div class="scenarioList">${data.items.map(([v,n,sub])=>`<button class="workChoice" data-add-door-kind="${scenario}" data-add-door-value="${v}"><span><strong>${n}</strong><small>${sub}</small></span><span class="arrow">›</span></button>`).join('')}</div>`;panel.scrollTop=0;$$('[data-add-door-kind]',panel).forEach(b=>b.onclick=()=>{const order=currentOrder();if(!order)return;let item;if(b.dataset.addDoorKind==='installation')item=defaultDoorInstallation(b.dataset.addDoorValue);else if(b.dataset.addDoorKind==='service')item=doorServicePreset(b.dataset.addDoorValue);else item=doorOpeningPreset(b.dataset.addDoorValue);if(item.kind==='installation'&&item.type==='other'){item.type='other';item.unitPrice='';item.priceMode='manual'}order.doors.items.push(item);order.doors.completed=true;routeState.openDoorIndex=order.doors.items.length-1;queueSave();closeSheet();render()})};$$('[data-door-scenario]',$('sheetPanel')).forEach(b=>b.onclick=()=>{scenario=b.dataset.doorScenario;$$('[data-door-scenario]',$('sheetPanel')).forEach(x=>x.classList.toggle('active',x===b));renderScenario();$('sheetPanel').scrollTo({top:0,behavior:'auto'})});renderScenario()}

function bindPurchasesView(){const order=currentOrder();if(!order)return;
  $$('[data-purchase-index]').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const p=order.purchases[+el.dataset.purchaseIndex],key=el.dataset.purchaseKey;if(!p)return;p[key]=key==='amount'?rawNum(el.value):el.value;if($('purchasesDue'))$('purchasesDue').textContent=money(orderDuePurchases(order));queueSave()}));
  $$('[data-remove-purchase]').forEach(b=>b.onclick=()=>{order.purchases.splice(+b.dataset.removePurchase,1);queueSave();render()});
  $$('[data-purchase-receipt]').forEach(input=>input.onchange=async e=>{const file=e.target.files?.[0],purchase=order.purchases[+input.dataset.purchaseReceipt];e.target.value='';if(!file||!purchase)return;try{purchase.receiptData=await compressImage(file);purchase.receiptName=file.name;purchase.receiptMissing=false;queueSave();render();toast('Фото чека сохранено')}catch(err){console.error(err);toast('Не удалось обработать фото чека')}});
  $$('[data-remove-purchase-receipt]').forEach(b=>b.onclick=()=>{const purchase=order.purchases[+b.dataset.removePurchaseReceipt];if(!purchase)return;purchase.receiptData='';purchase.receiptName='';purchase.receiptMissing=false;queueSave();render()});
  $('addPurchaseBtn').onclick=()=>{order.purchases.push(normalizePurchase({name:'',amount:'',date:today(),status:'due'}));queueSave();render();setTimeout(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}),20)};
}
function bindExpenseRows(scope,list){$$(`[data-expense-scope="${scope}"]`).forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const item=list[+el.dataset.expenseIndex];if(!item)return;const key=el.dataset.expenseKey;item[key]=key==='amount'?rawNum(el.value):el.value;if(key==='category'){sanitizeExpense(item,scope);if(scope==='general')saveGeneralExpenses();else queueSave();render();return}sanitizeExpense(item,scope);if(scope==='general')saveGeneralExpenses();else queueSave();if($('expenseTotal'))$('expenseTotal').textContent=money(orderExpenses(currentOrder()))}));$$(`[data-remove-expense-scope="${scope}"]`).forEach(b=>b.onclick=()=>{list.splice(+b.dataset.removeExpense,1);if(scope==='general')saveGeneralExpenses();else queueSave();render()});if(scope==='order'){$$('[data-expense-receipt]').forEach(input=>input.onchange=async e=>{const file=e.target.files?.[0],item=list[+input.dataset.expenseReceipt];e.target.value='';if(!file||!item)return;try{item.receiptData=await compressImage(file);item.receiptName=file.name;item.receiptMissing=false;queueSave();render();toast('Фото чека сохранено')}catch(err){console.error(err);toast('Не удалось обработать фото чека')}});$$('[data-remove-expense-receipt]').forEach(b=>b.onclick=()=>{const item=list[+b.dataset.removeExpenseReceipt];if(!item)return;item.receiptData='';item.receiptName='';item.receiptMissing=false;queueSave();render()})}}
function bindExpensesView(){const order=currentOrder();if(!order)return;bindExpenseRows('order',order.expenses);$('addOrderExpenseBtn').onclick=()=>{order.expenses.push(normalizeExpense({category:'worker',date:today()},'order'));queueSave();render();requestAnimationFrame(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}))}}
function bindFinancesView(){$('financePeriodBtn').onclick=showFinancePeriodSheet;$$('[data-fin-tab]').forEach(b=>b.onclick=()=>navigate('finances',{...routeState,tab:b.dataset.finTab},{keepScroll:true}));if($('editMonthlyGoal'))$('editMonthlyGoal').onclick=()=>{const value=prompt('Цель по чистому доходу на месяц, ₽',String(monthGoal()));if(value===null)return;const n=parseNum(value);if(n<=0){toast('Введите сумму больше нуля');return}storageSet(MONTHLY_GOAL_KEY,String(n));render()};bindExpenseRows('general',generalExpenses);if($('addGeneralExpenseBtn'))$('addGeneralExpenseBtn').onclick=()=>{generalExpenses.push(normalizeExpense({category:'fuel',date:today()},'general'));saveGeneralExpenses();render();requestAnimationFrame(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}))}}
function showQuickPaymentSheet(defaultAmount=''){const order=currentOrder();if(!order)return;const remaining=orderRemaining(order),value=defaultAmount===''?'':String(Math.round(parseNum(defaultAmount)*100)/100);openSheet(`<div class="sectionTitle"><div><h1>Добавить оплату</h1><p class="help compact">Осталось по заказу ${money(remaining)}. Введите фактически полученную сумму.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><label>Сумма, ₽<input id="quickPaymentAmount" class="decimal" inputmode="decimal" value="${esc(value)}" placeholder="0"></label><div class="grid two" style="margin-top:10px"><label>Дата<input id="quickPaymentDate" type="date" value="${today()}"></label><label>Комментарий<input id="quickPaymentNote" value="Оплата работ"></label></div>${remaining>0?`<button id="quickPaymentAll" class="btn ghost wide" style="margin-top:10px">Весь остаток ${money(remaining)}</button>`:''}<button id="saveQuickPayment" class="btn primary wide" style="margin-top:10px">Сохранить оплату</button>`);const input=$('quickPaymentAmount');requestAnimationFrame(()=>{input?.focus();if(input?.value)input.select()});if($('quickPaymentAll'))$('quickPaymentAll').onclick=()=>{input.value=String(Math.round(remaining*100)/100);input.focus();input.select()};$('saveQuickPayment').onclick=()=>{const amount=parseNum(input.value);if(amount<=0){toast('Введите сумму оплаты');input.focus();return}order.payments.push(normalizePayment({amount:String(Math.round(amount*100)/100),date:$('quickPaymentDate').value||today(),note:String($('quickPaymentNote').value||'Оплата работ').trim()||'Оплата работ'}));queueSave();closeSheet();render();toast(`Оплата ${money(amount)} добавлена`)}}
function bindPaymentsView(){const order=currentOrder();if(!order)return;
  $$('[data-payment-index]').forEach(el=>el.addEventListener(el.type==='date'?'change':'input',()=>{const p=order.payments[+el.dataset.paymentIndex],key=el.dataset.paymentKey;if(!p)return;p[key]=key==='amount'?rawNum(el.value):el.value;updatePaymentLive();queueSave()}));
  $$('[data-remove-payment]').forEach(b=>b.onclick=()=>{order.payments.splice(+b.dataset.removePayment,1);queueSave();render()});
  if($('paymentWorksMetric'))$('paymentWorksMetric').onclick=()=>navigate('works',{workModule:'all'});if($('paymentPaidMetric'))$('paymentPaidMetric').onclick=()=>showQuickPaymentSheet('');if($('paymentRemainingMetric'))$('paymentRemainingMetric').onclick=()=>showQuickPaymentSheet(orderRemaining(order));$('addPaymentBtn').onclick=()=>showQuickPaymentSheet(orderRemaining(order));
  $$('[data-stage-index]').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const s=order.stages[+el.dataset.stageIndex],key=el.dataset.stageKey;if(!s)return;s[key]=key==='paid'?el.value==='true':key==='amount'?rawNum(el.value):el.value;queueSave()}));
  $$('[data-remove-stage]').forEach(b=>b.onclick=()=>{order.stages.splice(+b.dataset.removeStage,1);queueSave();render()});
  $('addStageBtn').onclick=()=>{order.stages.push(normalizeStage({name:`Этап ${order.stages.length+1}`,amount:'',date:today(),paid:false}));queueSave();render()};
}
function updatePaymentLive(){const order=currentOrder();if(!order)return;if($('paidTotal'))$('paidTotal').textContent=money(orderPaid(order));if($('remainingTotal'))$('remainingTotal').textContent=money(orderRemaining(order))}
async function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.76))};img.onerror=reject;img.src=url})}
function openCameraBurst(){const order=currentOrder();if(!order)return;if(!navigator.mediaDevices?.getUserMedia){$('photoInput')?.click();return}let stream=null,frames=[],readyTimer=null;const stop=()=>{if(readyTimer)clearInterval(readyTimer);readyTimer=null;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null};openSheet(`<div class="cameraSheet"><div class="sectionTitle"><div><h1>Серия фото</h1><p class="help compact">Камера останется открытой после каждого кадра.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="cameraViewport"><video id="burstVideo" playsinline webkit-playsinline muted autoplay></video><div id="cameraLoading" class="cameraLoading">Открываем камеру…</div></div><div class="cameraControls"><button id="burstCapture" class="cameraShutter" disabled aria-label="Сделать фото"></button></div><div id="burstStrip" class="burstStrip"></div><button id="burstAdd" class="btn primary wide" disabled>Добавить фото</button></div>`,stop);const video=$('burstVideo'),capture=$('burstCapture'),add=$('burstAdd'),strip=$('burstStrip');const drawStrip=()=>{strip.innerHTML=frames.map((src,i)=>`<div class="burstThumb"><img src="${src}" alt=""><button data-burst-remove="${i}">×</button></div>`).join('');add.disabled=!frames.length;add.textContent=frames.length?`Добавить ${frames.length} фото`:'Добавить фото';$$('[data-burst-remove]',strip).forEach(b=>b.onclick=()=>{frames.splice(+b.dataset.burstRemove,1);drawStrip()})};navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(async media=>{stream=media;const ready=()=>{if(!video.videoWidth||!video.videoHeight)return;capture.disabled=false;const loading=$('cameraLoading');if(loading){loading.hidden=true;loading.style.display='none'}video.style.opacity='1';video.classList.add('ready')};video.onloadedmetadata=ready;video.oncanplay=ready;video.onplaying=ready;video.srcObject=media;video.setAttribute('playsinline','');video.muted=true;readyTimer=setInterval(()=>{if(video.videoWidth&&video.videoHeight){ready();clearInterval(readyTimer);readyTimer=null}},120);try{await video.play();setTimeout(ready,80)}catch(e){console.warn('camera play',e);setTimeout(ready,150)}}).catch(err=>{console.error(err);closeSheet();toast('Не удалось открыть камеру');$('photoInput')?.click()});capture.onclick=()=>{ready();if(!video.videoWidth||!video.videoHeight)return;const max=1400,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);frames.push(canvas.toDataURL('image/jpeg',.76));drawStrip()};add.onclick=()=>{if(!frames.length)return;const addedAt=now();for(const data of frames)order.photos.push({id:uid(),data,caption:'',addedAt});queueSave();closeSheet();render();toast(`Добавлено фото: ${frames.length}`)}}
function bindPhotosView(){const order=currentOrder();if(!order)return;
  $('openCameraBtn').onclick=()=>openCameraBurst();
  $('photoInput').onchange=async e=>{for(const file of [...e.target.files]){try{order.photos.push({id:uid(),data:await compressImage(file),caption:'',addedAt:now()})}catch(err){toast('Не удалось обработать фото')}}e.target.value='';queueSave();render()};
  $$('[data-photo-index]').forEach(el=>el.oninput=()=>{order.photos[+el.dataset.photoIndex].caption=el.value;queueSave()});
  $$('[data-remove-photo]').forEach(b=>b.onclick=()=>{order.photos.splice(+b.dataset.removePhoto,1);queueSave();render()});
}
function bindDocumentsView(){
  $$('[data-doc-type]').forEach(b=>b.onclick=()=>openDocumentOptions(b.dataset.docType));
  $('orderPriceList').onclick=showPriceListSheet;
  $$('[data-doc-history]').forEach(b=>b.onclick=()=>{const h=currentOrder()?.documentHistory?.[+b.dataset.docHistory];if(h)buildOrderDocument(h.type,(h.snapshot||[]).map(clone),h.options||{})});
  $$('[data-doc-delete]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const order=currentOrder();if(!order)return;const i=+b.dataset.docDelete;if(!order.documentHistory?.[i])return;if(!confirm('Удалить документ из истории? Объект и расчёты останутся без изменений.'))return;order.documentHistory.splice(i,1);await saveObject(currentObject());render();toast('Документ удалён')});
}

function orderDocumentRows(order,{includeMaterials=false,procurement='none',procurementPrice=''}={}){const w=calculateWorks(order),f=calculateFloor(order.floor),d=calculateDoors(order.doors);const rows=[...w.rows,...f.rows,...d.rows];if(includeMaterials)rows.push(...f.materials);if(procurement==='include'&&parseNum(procurementPrice)>0)rows.push(normalizeGenericRow({name:'Организация закупки материалов',qty:'1',unit:'услуга',price:procurementPrice,group:'Дополнительные услуги',kind:'work'},'Дополнительные услуги'));return rows.map(r=>({...clone(r),id:r.id||uid()}))}
function openDocumentOptions(type){const order=currentOrder();if(!order)return;if(type==='contract'){showContractOptions(order);return}
  if((type==='worklist'||type==='act')&&(order.workClosures||[]).length){const closures=(order.workClosures||[]).slice().reverse();openSheet(`<div class="sectionTitle"><div><h1>${type==='act'?'Акт выполненных работ':'Перечень выполненных работ'}</h1><p class="help compact">Можно сформировать документ строго из зафиксированного закрытия.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><label>Источник<select id="closureDocSource">${closures.map(c=>`<option value="${c.id}">Закрытие №${c.number} · ${ruDate(c.date).replace(' г.','')} · ${money(c.amount)}</option>`).join('')}<option value="all">Весь текущий заказ</option></select></label>${type==='act'?`<label style="margin-top:10px">Экземпляры<select id="closureActCopies"><option value="1">1 экземпляр</option><option value="2">2 экземпляра</option></select></label>`:''}<button id="buildClosureDocFromDocuments" class="btn primary wide" style="margin-top:12px">Продолжить</button>`);$('buildClosureDocFromDocuments').onclick=async()=>{const source=$('closureDocSource').value;if(source!=='all'){const closure=order.workClosures.find(c=>c.id===source);const copies=type==='act'?+$('closureActCopies').value:1;closeSheet();if(closure){const options={contractTotal:'',showDiscount:true,closureId:closure.id,closureNumber:closure.number,documentDate:closure.date,copies};buildOrderDocument(type,(closure.snapshot||[]).map(clone),options);const entry={id:uid(),type,date:now(),total:closure.amount,snapshot:(closure.snapshot||[]).map(clone),options:clone(options),closureId:closure.id};const existing=order.documentHistory.findIndex(h=>h.type===type&&h.closureId===closure.id);if(existing>=0)order.documentHistory[existing]=entry;else order.documentHistory.push(entry);await saveObject(currentObject());editorState={key:editorKey(),snapshot:clone(currentObject()),dirty:false};}return}const copies=type==='act'?+($('closureActCopies')?.value||1):1;closeSheet();if(type==='act'){const rows=orderDocumentRows(order,{}),options={copies};openReviewSheet(type,rows,options)}else openReviewSheet(type,orderDocumentRows(order,{}),{})};return}
  if(type==='proposal'){
    openSheet(`<div class="sectionTitle"><div><h1>Коммерческое предложение</h1><p class="help compact">Выберите состав документа.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="grid two"><label>Что включить<select id="proposalMaterials"><option value="work">Только работы</option><option value="materials">Работы + материалы из расчёта</option></select></label><label>Организация закупки<select id="proposalProcurement"><option value="none">Не показывать</option><option value="recommend">Предложить отдельно</option><option value="include">Включить в расчёт</option></select></label><label>Цена организации закупки<input id="proposalProcurementPrice" class="decimal" inputmode="decimal" placeholder="Цена"></label></div><div class="actions end"><button id="startProposalReview" class="btn primary">Проверить расчёт</button></div>`);
    $('startProposalReview').onclick=()=>{const options={includeMaterials:$('proposalMaterials').value==='materials',procurement:$('proposalProcurement').value,procurementPrice:$('proposalProcurementPrice').value};const rows=orderDocumentRows(order,options);closeSheet();openReviewSheet('proposal',rows,options)};return;
  }
  if(type==='act'){
    openSheet(`<div class="sectionTitle"><div><h1>Акт выполненных работ</h1><p class="help compact">Выберите количество экземпляров, затем проверьте перечень.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="grid two"><label>Экземпляры<select id="actCopies"><option value="1">1 экземпляр</option><option value="2">2 экземпляра</option></select></label></div><div class="actions end"><button id="startActReview" class="btn primary">Проверить акт</button></div>`);
    $('startActReview').onclick=()=>{const rows=orderDocumentRows(order,{}),options={copies:+$('actCopies').value};closeSheet();openReviewSheet(type,rows,options)};return;
  }
  const rows=orderDocumentRows(order,{});openReviewSheet(type,rows,{});
}
function reviewRowHtml(row,index){const guide=rateGuide(row);return `<div class="rowCard"><div class="rowGrid"><label>Наименование<input data-review-index="${index}" data-review-key="name" value="${esc(row.name)}"></label><label>Кол-во<input class="decimal" inputmode="decimal" data-review-index="${index}" data-review-key="qty" value="${esc(row.qty)}"></label><label>Ед.<select data-review-index="${index}" data-review-key="unit">${['шт.','м²','м.п.','компл.','участок','час','услуга','л','кг'].map(u=>`<option ${u===row.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Цена<input class="decimal" inputmode="decimal" data-review-index="${index}" data-review-key="price" value="${esc(row.price)}"></label><button class="btn danger small" data-remove-review="${index}">×</button></div><div class="priceGuide"><strong data-review-sum="${index}">${money(parseNum(row.qty)*parseNum(row.price))}</strong><span class="guideBadge ${guide.cls}">${esc(guide.label)}</span><span class="muted">${esc(guide.detail)}</span></div></div>`}
function openReviewSheet(type,rows,options){reviewRows=rows;documentContext={type,options};renderReviewSheet()}
function renderReviewSheet(){const title={proposal:'Проверка коммерческого предложения',worklist:'Проверка перечня работ',act:'Проверка акта'}[documentContext.type]||'Проверка расчёта';const order=currentOrder(),calc=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),raw=order?.pricing?.contractTotal,contract=raw===undefined||raw===null||String(raw).trim()===''?calc:parseNum(raw),adj=contract-calc;openSheet(`<div class="sectionTitle"><div><h1>${title}</h1><p class="help compact">Подсказки мастера не попадут в PDF.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div id="reviewRows" class="rowList">${reviewRows.length?reviewRows.map(reviewRowHtml).join(''):'<div class="empty">Позиции не добавлены.</div>'}</div><button id="addReviewRow" class="btn ghost wide" style="margin-top:9px">＋ Добавить работу</button><div class="documentReviewTotals"><div><span>Расчёт по позициям</span><strong id="reviewTotal">${money(calc)}</strong></div><div><span>Договорная стоимость работ</span><strong id="reviewContractTotal">${money(contract)}</strong></div><small id="reviewAdjustment">${adj<0?`Индивидуальная скидка ${money(Math.abs(adj))}`:adj>0?`Корректировка +${money(adj)}`:'Без корректировки'}</small></div><div class="actions end"><button id="generateReviewedDoc" class="btn primary">Сформировать документ</button></div>`);
  const refreshTotals=()=>{const calcNow=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),rawNow=order?.pricing?.contractTotal,contractNow=rawNow===undefined||rawNow===null||String(rawNow).trim()===''?calcNow:parseNum(rawNow),adjNow=contractNow-calcNow;$('reviewTotal').textContent=money(calcNow);$('reviewContractTotal').textContent=money(contractNow);$('reviewAdjustment').textContent=adjNow<0?`Индивидуальная скидка ${money(Math.abs(adjNow))}`:adjNow>0?`Корректировка +${money(adjNow)}`:'Без корректировки'};
  $$('[data-review-index]',$('sheetPanel')).forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const row=reviewRows[+el.dataset.reviewIndex],key=el.dataset.reviewKey;row[key]=['qty','price'].includes(key)?rawNum(el.value):el.value;const sum=$('sheetPanel').querySelector(`[data-review-sum="${el.dataset.reviewIndex}"]`);if(sum)sum.textContent=money(parseNum(row.qty)*parseNum(row.price));refreshTotals()}));
  $$('[data-remove-review]',$('sheetPanel')).forEach(b=>b.onclick=()=>{reviewRows.splice(+b.dataset.removeReview,1);renderReviewSheet()});
  $('addReviewRow').onclick=()=>{reviewRows.push(normalizeGenericRow({name:'',qty:'1',unit:'шт.',price:'',group:'Дополнительные работы'},'Дополнительные работы'));renderReviewSheet()};
  $('generateReviewedDoc').onclick=async()=>{const {type}=documentContext,order=currentOrder(),object=currentObject(),options={...(documentContext.options||{}),contractTotal:order?.pricing?.contractTotal??'',showDiscount:object?.showDiscountInDocuments!==false};closeSheet();buildOrderDocument(type,reviewRows,options);if(order){const calcWork=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),contractWork=String(options.contractTotal).trim()===''?calcWork:parseNum(options.contractTotal),materialTotal=reviewRows.filter(r=>r.kind==='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0);order.documentHistory.push({id:uid(),type,date:now(),total:contractWork+materialTotal,snapshot:reviewRows.map(clone),options:clone(options),closureId:options.closureId||''});await saveObject(currentObject());editorState.snapshot=clone(currentObject())}}
}
function groupedRowsTable(rows,{hideWorkPrices=false}={}){const groups=[];for(const row of rows)if(!groups.includes(row.group||'Работы'))groups.push(row.group||'Работы');return groups.map(group=>`<tr class="group"><td colspan="5">${esc(group)}</td></tr>`+rows.filter(r=>(r.group||'Работы')===group).map(r=>{const hide=hideWorkPrices&&r.kind!=='material',note=r.progressNote?`<br><small class="paperProgressNote">${esc(r.progressNote)}${r.baseQty?` от ${qty(r.baseQty)} ${esc(r.unit)}`:''}</small>`:'';return `<tr><td>${esc(r.name)}${note}${r.comment?`<br><small>${esc(r.comment)}</small>`:''}</td><td>${paperQty(r.qty)}</td><td>${esc(r.unit)}</td><td>${hide?'—':paperMoney(r.price)}</td><td>${hide?'—':paperMoney(parseNum(r.qty)*parseNum(r.price))}</td></tr>`}).join('')).join('')}
function paperHeader(title,{slogan=false}={}){return `<div class="paperBrand">FRAME</div><div class="paperTag">Design. Build. Finish.</div>${slogan?`<div class="paperSlogan"><strong>Работаем сами. Отвечаем лично.</strong><span>Без посредников и передачи заказа на сторону.</span></div>`:''}<div class="paperHero"><h1>${esc(title)}</h1></div>`}
function infoGrid(items){return `<div class="paperInfo">${items.filter(x=>x[1]).map(([l,v])=>`<div><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`}
function buildOrderDocument(type,rows,options={}){const object=currentObject(),order=currentOrder();if(!object||!order)return;const calculatedWork=rows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),materialTotal=rows.filter(r=>r.kind==='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),rawContract=options.contractTotal!==undefined?options.contractTotal:order.pricing?.contractTotal,contractWork=rawContract===undefined||rawContract===null||String(rawContract).trim()===''?calculatedWork:Math.max(0,parseNum(rawContract)),adjustment=contractWork-calculatedWork,showDiscount=options.showDiscount!==undefined?options.showDiscount:object.showDiscountInDocuments!==false,total=contractWork+materialTotal,hideWorkPrices=!showDiscount&&Math.abs(adjustment)>.009;const titles={proposal:'Коммерческое предложение',worklist:'Перечень выполненных работ',act:'Акт выполненных работ'};let html=paperHeader(titles[type]||'Документ',{slogan:type==='proposal'});html+=infoGrid([['Заказчик',object.contact.name],['Телефон',formatPhone(object.contact.phone)],['Адрес объекта',object.contact.address],['Заказ',order.title],['Закрытие',options.closureNumber?`№${options.closureNumber}`:''],['Дата',ruDate(options.documentDate||order.date||today())]]);html+=`<h2>Работы и услуги</h2>${hideWorkPrices?'<p class="paperNote compactNote">Цены по отдельным работам не выводятся. Ниже указана согласованная итоговая стоимость.</p>':''}<div class="paperTableWrap"><table><colgroup><col class="col-name"><col class="col-qty"><col class="col-unit"><col class="col-price"><col class="col-sum"></colgroup><thead><tr><th>Наименование</th><th>Кол.</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${groupedRowsTable(rows,{hideWorkPrices})}</tbody></table></div>`;
  const adjustmentHtml=showDiscount&&adjustment<-.009?`<div><span>Расчётная стоимость работ</span><strong>${money(calculatedWork)}</strong></div><div><span>Индивидуальная скидка</span><strong>− ${money(Math.abs(adjustment))}</strong></div>`:showDiscount&&adjustment>.009?`<div><span>Расчётная стоимость работ</span><strong>${money(calculatedWork)}</strong></div><div><span>Корректировка стоимости</span><strong>+ ${money(adjustment)}</strong></div>`:'';
  if(type==='proposal')html+=`<div class="paperTotal">${adjustmentHtml}<div><span>Стоимость работ</span><strong>${money(contractWork)}</strong></div>${materialTotal?`<div><span>Материалы для заказчика</span><strong>${money(materialTotal)}</strong></div>`:''}<div class="grand"><span>Итого</span><strong>${money(total)}</strong></div></div>${options.procurement==='recommend'?`<div class="paperAlso"><strong>Организация закупки материалов</strong><p>Подбор, согласование и организация приобретения материалов. Ориентировочная стоимость услуги ${money(options.procurementPrice)}. Материалы и доставка оплачиваются отдельно.</p></div>`:''}<p class="paperNote">Расчёт составлен по указанному объёму и условиям. Дополнительные или скрытые работы выполняются только после согласования с заказчиком.</p>`;
  if(type==='worklist')html+=`<div class="paperTotal">${adjustmentHtml}<div class="grand"><span>Итого выполненных работ</span><strong>${money(contractWork)}</strong></div></div><p class="paperNote">Перечень отражает фактически выполненный объём и согласованную стоимость работ по объекту.</p>`;
  if(type==='act')html+=`<div class="paperTotal">${adjustmentHtml}<div class="grand"><span>Стоимость принятых работ</span><strong>${money(contractWork)}</strong></div></div><p class="paperNote">Заказчик подтверждает, что перечисленные работы выполнены в полном объёме, результат принят, претензий по объёму и качеству работ не имеется. При наличии замечаний они указываются ниже до подписания акта.</p><div class="blankLines"><div class="blankLine"><span>Заказчик, ФИО</span><span></span></div><div class="blankLine"><span>Замечания</span><span></span></div></div><div class="signature"><div>Исполнитель / подпись</div><div>Заказчик / подпись</div></div>`;
  if(type==='act'&&parseNum(options.copies)>1){const one=html;html=Array.from({length:parseNum(options.copies)},(_,i)=>`<section class="printCopy">${one}<p class="paperNote">Экземпляр ${i+1} из ${options.copies}</p></section>`).join('<div style="break-after:page"></div>')}
  showPaper(html);
}
function showContractOptions(order){const hasPrivate=profile.passportSeries||profile.passportNumber||profile.registrationAddress;openSheet(`<div class="sectionTitle"><div><h1>Договор</h1><p class="help compact">Заказчик заполняет свои реквизиты от руки.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="grid two"><label>Данные мастера<select id="contractMasterMode"><option value="blank">Оставить пустыми</option><option value="profile" ${hasPrivate?'':'disabled'}>Подставить мои данные</option></select></label><label>Дата<select id="contractDateMode"><option value="today">Сегодняшняя</option><option value="blank">Оставить пустой</option></select></label>${order?`<label>Объект и работы<select id="contractOrderMode"><option value="include">Подставить из заказа</option><option value="blank">Оставить пустыми</option></select></label>`:''}<label>Экземпляры<select id="contractCopies"><option value="1">1 экземпляр</option><option value="2">2 экземпляра</option></select></label></div>${!hasPrivate?'<div class="backupNote">Паспортные данные не заполнены. Договор всё равно сформируется с пустыми строками мастера.</div>':''}<div class="actions end"><button id="generateContractBtn" class="btn primary">Сформировать договор</button></div>`);$('generateContractBtn').onclick=()=>{const options={masterMode:$('contractMasterMode').value,dateMode:$('contractDateMode').value,orderMode:order&&$('contractOrderMode')?$('contractOrderMode').value:'blank',copies:+$('contractCopies').value};closeSheet();buildContract(order,options)}}
function blankOr(value,enabled){return enabled&&value?esc(value):'&nbsp;'}
function buildContract(order,options){const object=order?currentObject():null,includeMaster=options.masterMode==='profile',includeOrder=!!order&&options.orderMode==='include',date=options.dateMode==='today'?ruDate(today()):'________________';const fio=blankOr(profileFullName(),includeMaster),passport=includeMaster&&profile.passportSeries&&profile.passportNumber?`${esc(profile.passportSeries)} ${esc(profile.passportNumber)}`:'&nbsp;',issued=blankOr(profile.passportIssuedBy,includeMaster),issuedDate=includeMaster&&profile.passportIssuedDate?ruDate(profile.passportIssuedDate):'&nbsp;',code=blankOr(profile.passportCode,includeMaster),registration=blankOr(profile.registrationAddress,includeMaster),phone=blankOr(formatPhone(profile.phone),includeMaster);const work=order?orderWorkTotal(order):0,calculated=order?orderCalculatedWorkTotal(order):0,adjustment=work-calculated,showDiscount=object?.showDiscountInDocuments!==false;const workRows=order?[...calculateWorks(order).rows,...calculateFloor(order.floor).rows,...calculateDoors(order.doors).rows]:[];const list=includeOrder&&workRows.length?`<ol>${workRows.map(r=>`<li>${esc(r.name)} · ${qty(r.qty)} ${esc(r.unit)}</li>`).join('')}</ol>`:`<div class="blankLines"><div class="blankLine"><span>Перечень работ</span><span></span></div><div class="blankLine"><span></span><span></span></div><div class="blankLine"><span></span><span></span></div></div>`;const one=`${paperHeader('Договор на выполнение работ')}<p style="text-align:right">г. ${esc(profile.city||'____________')} · ${date}</p><div class="contractText"><p><strong>Исполнитель</strong> ${fio} и <strong>Заказчик</strong> __________________________________________ заключили настоящий договор о нижеследующем.</p><h2>1. Предмет договора</h2><p>Исполнитель обязуется выполнить согласованные работы, а Заказчик принять результат и произвести оплату.</p>${includeOrder&&object?infoGrid([['Адрес объекта',object.contact.address],['Заказ',order.title],['Согласованная стоимость',work?money(work):'']]):''}${list}<h2>2. Стоимость и порядок оплаты</h2><p>Стоимость работ определяется согласованным перечнем и объёмом. Работы, не включённые в первоначальный перечень, выполняются после отдельного согласования стоимости.</p><div class="blankLines">${includeOrder&&showDiscount&&adjustment<-.009?`<div class="blankLine"><span>Расчётная стоимость</span><span>${money(calculated)}</span></div><div class="blankLine"><span>Индивидуальная скидка</span><span>− ${money(Math.abs(adjustment))}</span></div>`:includeOrder&&showDiscount&&adjustment>.009?`<div class="blankLine"><span>Расчётная стоимость</span><span>${money(calculated)}</span></div><div class="blankLine"><span>Корректировка</span><span>+ ${money(adjustment)}</span></div>`:``}<div class="blankLine"><span>Стоимость работ</span><span>${includeOrder&&work?money(work):''}</span></div><div class="blankLine"><span>Порядок оплаты</span><span></span></div></div><h2>3. Сроки и условия</h2><p>Срок начала и завершения работ, доступ на объект, материалы и иные условия согласовываются сторонами. Обстоятельства, обнаруженные после начала работ и влияющие на объём или технологию, фиксируются и согласовываются отдельно.</p><h2>4. Сдача и приёмка</h2><p>После завершения работ стороны подписывают акт. Замечания при наличии указываются до подписания акта.</p><h2>5. Реквизиты сторон</h2><div class="grid two"><div><strong>Исполнитель</strong><div class="blankLines"><div class="blankLine"><span>ФИО</span><span>${fio}</span></div><div class="blankLine"><span>Паспорт</span><span>${passport}</span></div><div class="blankLine"><span>Выдан</span><span>${issued}</span></div><div class="blankLine"><span>Дата выдачи</span><span>${issuedDate}</span></div><div class="blankLine"><span>Код</span><span>${code}</span></div><div class="blankLine"><span>Регистрация</span><span>${registration}</span></div><div class="blankLine"><span>Телефон</span><span>${phone}</span></div></div></div><div><strong>Заказчик</strong><div class="blankLines"><div class="blankLine"><span>ФИО</span><span></span></div><div class="blankLine"><span>Паспорт</span><span></span></div><div class="blankLine"><span>Выдан</span><span></span></div><div class="blankLine"><span>Дата выдачи</span><span></span></div><div class="blankLine"><span>Код</span><span></span></div><div class="blankLine"><span>Регистрация</span><span></span></div><div class="blankLine"><span>Телефон</span><span></span></div></div></div></div><div class="signature"><div>Исполнитель / подпись</div><div>Заказчик / подпись</div></div></div>`;showPaper(Array.from({length:options.copies||1},(_,i)=>`<section class="printCopy">${one}${options.copies>1?`<p class="paperNote">Экземпляр ${i+1} из ${options.copies}</p>`:''}</section>`).join('<div style="break-after:page"></div>'))}

function showPriceListSheet(){const saved=(()=>{try{return JSON.parse(storageGet('framePriceSectionsV180','{}')||'{}')}catch(e){return {}}})();const sections={floorCover:saved.floorCover!==false,floorBaseboard:!!saved.floorBaseboard,floorPrep:!!saved.floorPrep,doorsInstall:!!saved.doorsInstall,doorsService:!!saved.doorsService,doorsOpening:!!saved.doorsOpening};openSheet(`<div class="sectionTitle"><div><h1>Прайс-лист</h1><p class="help compact">Отметьте направления, по которым нужны подробные цены. Общий перечень работ добавится автоматически.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><h3>Полы</h3><div class="checkline"><label class="check"><input data-price-section="floorCover" type="checkbox" ${sections.floorCover?'checked':''}> Напольные покрытия</label><label class="check"><input data-price-section="floorBaseboard" type="checkbox" ${sections.floorBaseboard?'checked':''}> Плинтусы</label><label class="check"><input data-price-section="floorPrep" type="checkbox" ${sections.floorPrep?'checked':''}> Подготовка и демонтаж</label></div><h3>Двери</h3><div class="checkline"><label class="check"><input data-price-section="doorsInstall" type="checkbox" ${sections.doorsInstall?'checked':''}> Установка дверей</label><label class="check"><input data-price-section="doorsService" type="checkbox" ${sections.doorsService?'checked':''}> Обслуживание</label><label class="check"><input data-price-section="doorsOpening" type="checkbox" ${sections.doorsOpening?'checked':''}> Проёмы</label></div><div class="actions end"><button id="generatePriceList" class="btn primary">Сформировать PDF</button></div>`);$('generatePriceList').onclick=()=>{const selected={};$$('[data-price-section]',$('sheetPanel')).forEach(x=>selected[x.dataset.priceSection]=x.checked);if(!Object.values(selected).some(Boolean)){toast('Выберите хотя бы один раздел');return}storageSet('framePriceSectionsV180',JSON.stringify(selected));closeSheet();buildPriceList(selected)}}
function priceRateValue(key){if(String(key).startsWith('custom.')){const [,id,pattern]=String(key).split('.');return parseNum(customFloorCovers.find(x=>x.id===id)?.patterns?.[pattern])}return parseNum(rates[key])}
function rateTable(title,items){const visible=items.filter(([,key])=>priceRateValue(key)>0);if(!visible.length)return '';return `<h2>${esc(title)}</h2><table><thead><tr><th>Работа</th><th>Цена</th></tr></thead><tbody>${visible.map(([label,key,unit='м²'])=>`<tr><td>${esc(label)}</td><td>${money(priceRateValue(key))}/${esc(unit)}</td></tr>`).join('')}</tbody></table>`}
function buildPriceList(selected){
  let body='';
  if(selected.floorCover){
    body+=RATE_GROUPS.floor.slice(0,6).map(group=>rateTable(group.title,group.items)).join('');
    body+=customFloorCovers.map(item=>rateTable(item.name,[['Прямая укладка',`custom.${item.id}.straight`],['Английская ёлочка',`custom.${item.id}.eng`],['Французская ёлочка',`custom.${item.id}.fr`],['Укладка от угла',`custom.${item.id}.corner`],['Сложный рисунок',`custom.${item.id}.complex`]])).join('');
  }
  if(selected.floorBaseboard)body+=rateTable('Плинтус',RATE_GROUPS.floor[6].items);
  if(selected.floorPrep)body+=rateTable('Подготовка основания',RATE_GROUPS.floor[7].items)+rateTable('Демонтаж и дополнительные работы',RATE_GROUPS.floor[8].items);
  if(selected.doorsInstall)body+=rateTable('Установка дверей',RATE_GROUPS.doors[0].items);
  if(selected.doorsService)body+=rateTable('Обслуживание и доработка дверей',RATE_GROUPS.doors[1].items);
  if(selected.doorsOpening)body+=rateTable('Проёмы',RATE_GROUPS.doors[2].items);
  const html=`${paperHeader('Прайс-лист',{slogan:true})}${infoGrid([['Мастер',profileFullName()],['Телефон',formatPhone(profile.phone)],['Город',profile.city],['Дата',ruDate(today())]])}${body}<div class="paperAdvantages"><div class="paperAdvantage"><strong>Работаем сами. Отвечаем лично.</strong><br>Без посредников и передачи заказа на сторону.</div><div class="paperAdvantage"><strong>Согласовываем заранее</strong><br>Состав работ и изменение стоимости обсуждаются до начала выполнения.</div><div class="paperAdvantage"><strong>Вовлечены в результат</strong><br>Организуем работу без лишних простоев и соблюдаем необходимую технологию.</div></div><div class="paperAlso"><strong>Также выполняем</strong><p>Выполняем полный комплекс строительных и отделочных работ: электромонтажные и сантехнические работы, черновая и чистовая отделка, напольные покрытия, монтаж дверей, укладка плитки и керамогранита, санузлы под ключ, локальный ремонт и доработки.</p></div><p class="paperNote"><strong>Цены в прайс-листе являются ориентировочными.</strong> Окончательная стоимость определяется после уточнения объёма, материала, состояния основания, сложности работ и условий объекта. Итоговая цена согласовывается до начала работ. Точный расчёт по конкретному объекту имеет приоритет над общим прайс-листом.</p>`;
  showPaper(html);
}

function fitPaperPreview(){const paper=$('paper'),stage=$('paperStage');if(!paper||!stage||$('documentView').classList.contains('hidden'))return;paper.style.width='794px';paper.style.transform='none';requestAnimationFrame(()=>{const scale=Math.min(1,Math.max(.32,(window.innerWidth-24)/794));paper.style.transform=`scale(${scale})`;stage.style.width=`${794*scale}px`;stage.style.height=`${paper.scrollHeight*scale}px`})}
function showPaper(html){if(route==='ai'&&typeof frameStopVoice==='function'&&(frameVoiceWanted||aiRecognition))frameStopVoice(true,true);$('paper').innerHTML=html;$('documentView').classList.remove('hidden');$('documentView').classList.add('preparing');const ready=document.fonts?.ready||Promise.resolve();ready.then(()=>requestAnimationFrame(()=>{fitPaperPreview();$('documentView').classList.remove('preparing')}));$('documentView').scrollTo({left:0,top:0,behavior:'auto'})}

function exportBackup(){const includePrivate=storageGet(EXPORT_PRIVATE_KEY,'0')==='1';const safeProfile=clone(profile);if(!includePrivate)for(const key of ['passportSeries','passportNumber','passportIssuedBy','passportIssuedDate','passportCode','registrationAddress'])safeProfile[key]='';const data={format:'FRAME_BACKUP',version:VERSION,exportedAt:now(),profile:safeProfile,rates,customFloorCovers,generalExpenses,aiLogs:aiLogs(),objects:objects.map(stripPhotos),privateDataIncluded:includePrivate};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`FRAME-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Резервная копия подготовлена')}
async function handleImportFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const data=JSON.parse(await file.text()),arr=Array.isArray(data)?data:data.objects;if(!Array.isArray(arr))throw new Error('objects');importCandidate={objects:arr.map(normalizeObject),rates:data.rates&&typeof data.rates==='object'?data.rates:null,profile:data.profile&&typeof data.profile==='object'?data.profile:null,customFloorCovers:Array.isArray(data.customFloorCovers)?data.customFloorCovers.map(normalizeCustomFloorCover):null,generalExpenses:Array.isArray(data.generalExpenses)?data.generalExpenses.map(e=>normalizeExpense(e,'general')):null,aiLogs:Array.isArray(data.aiLogs)?data.aiLogs:null};showImportPreview()}catch(e){console.error(e);toast('Не удалось прочитать резервную копию')}}
function showImportPreview(){if(!importCandidate)return;const conflicts=importCandidate.objects.filter(x=>objects.some(o=>o.id===x.id)).length;openSheet(`<div class="sectionTitle"><div><h1>Импорт FRAME</h1><p class="help compact">Проверьте состав перед записью.</p></div><button class="sheetCloseIcon" data-close-sheet aria-label="Закрыть">×</button></div><div class="stats"><div class="stat"><span>Объекты</span><strong>${importCandidate.objects.length}</strong></div><div class="stat"><span>Совпадения ID</span><strong>${conflicts}</strong></div><div class="stat"><span>Цены</span><strong>${importCandidate.rates?'Есть':'Нет'}</strong></div></div><div class="backupNote">«Добавить как новые» сохранит текущие данные и выдаст импортированным объектам новые идентификаторы. «Обновить совпадающие» заменит только объекты с теми же ID после вашего явного подтверждения.</div><div class="actions end"><button id="importAsNew" class="btn primary">Добавить как новые</button><button id="importMerge" class="btn ghost">Обновить совпадающие</button></div>`);$('importAsNew').onclick=()=>applyImport('new');$('importMerge').onclick=()=>applyImport('merge')}
async function applyImport(mode){if(!importCandidate)return;try{for(const incoming of importCandidate.objects){const object=clone(incoming);if(mode==='new'){object.id=uid();object.orders.forEach(o=>o.id=uid())}await dbPut(normalizeObject(object))}if(importCandidate.rates){rates={...rates,...importCandidate.rates};saveRates()}if(importCandidate.profile){const incoming=importCandidate.profile;profile={...profile,...incoming};saveProfile()}if(importCandidate.customFloorCovers){customFloorCovers=importCandidate.customFloorCovers;saveCustomFloorCovers()}if(importCandidate.generalExpenses){generalExpenses=importCandidate.generalExpenses;saveGeneralExpenses()}if(importCandidate.aiLogs){saveAiLogs(importCandidate.aiLogs)}await reloadObjects();importCandidate=null;closeSheet();navigate('ai');toast('Импорт завершён')}catch(e){console.error(e);toast('Ошибка импорта')}}


function rowWork(name,price,rateKey='',qty='1',unit='шт.'){return normalizeGenericRow({name,qty,unit,price:String(price),rateKey,group:'Работы'},'Работы')}
function arch21Work(name,price,group,qty='1',unit='компл.',comment=''){return normalizeGenericRow({name,qty,unit,price:String(price),group,comment,progressPct:0,closedAmount:0},group)}
function arch21ProgressWorks(){return [
  arch21Work('Реконструкция дверного проёма',6000,'Двери и проёмы','1','компл.','Увеличение проёма по высоте до потолка и расширение на 300 мм с одной стороны.'),
  arch21Work('Штукатурка и финишное шпаклевание откосов широкого проёма',13000,'Двери и проёмы'),
  arch21Work('Флизелин и покраска откосов широкого проёма',4000,'Двери и проёмы'),
  arch21Work('Локальная подготовка стен',200,'Подготовка','54.52','м²'),
  arch21Work('Грунтование стен прихожей и комнаты',75,'Подготовка','54.52','м²'),
  arch21Work('Локальная подготовка пола',300,'Подготовка','20.8666666667','м²'),
  arch21Work('Грунтование пола перед клеевым кварцвинилом',75,'Подготовка','20.8666666667','м²'),
  arch21Work('Грунтование стен санузла перед облицовкой',75,'Подготовка','17.52','м²'),
  arch21Work('Локальный наливной пол в санузле, сложный малый участок',3000,'Подготовка'),
  arch21Work('Поклейка малярного флизелина',400,'Стены и отделка','46.1175','м²'),
  arch21Work('Покраска стен в 2 слоя',450,'Стены и отделка','46.1177777778','м²'),
  arch21Work('Укладка клеевого кварцвинила',800,'Полы','20.865','м²'),
  arch21Work('Беспороговый стык керамогранита и кварцвинила',1500,'Полы','1','м.п.'),
  arch21Work('Монтаж ПВХ-плинтуса',300,'Полы','19.3166666667','м.п.'),
  arch21Work('Монтаж инсталляции',10000,'Санузел'),
  arch21Work('Изготовление короба под инсталляцию и зашивка канализационной трубы',15000,'Санузел'),
  arch21Work('Монтаж подвесного унитаза и кнопки инсталляции',3000,'Санузел'),
  arch21Work('Устройство монолитного душевого поддона с бортиком и облицовкой',25000,'Санузел','1','компл.','Одна согласованная позиция. Для промежуточного закрытия можно использовать процент выполнения.'),
  arch21Work('Гидроизоляция душевой зоны, поддона и пола санузла',500,'Санузел','5','м²','Повторное устройство после удаления непрочно держащейся старой гидроизоляции, с подготовкой и грунтованием основания.'),
  arch21Work('Облицовка стен керамогранитом',4000,'Санузел','17.519','м²'),
  arch21Work('Облицовка пола керамогранитом',4500,'Санузел','3.1646666667','м²'),
  arch21Work('Запил керамогранита под 45°',1500,'Санузел','4','м.п.'),
  arch21Work('Цементная затирка',300,'Санузел','22.1833333333','м²'),
  arch21Work('Прокладка кабеля в штробе',600,'Электрика','15.2','м.п.'),
  arch21Work('Прокладка кабеля открытым способом',200,'Электрика','18.1','м.п.'),
  arch21Work('Подрозетники в газобетоне',500,'Электрика','12','шт.'),
  arch21Work('Подрозетник в ГКЛ',300,'Электрика','1','шт.'),
  arch21Work('Пересборка распаечных коробок',600,'Электрика','3','шт.'),
  arch21Work('Добавление автомата в электрощит',1200,'Электрика','1','шт.'),
  arch21Work('Монтаж механизмов: розетки, выключатели, интернет',300,'Электрика','25','шт.'),
  arch21Work('Штробление стен под инженерные коммуникации',10000,'Сантехника'),
  arch21Work('Монтаж системы водоснабжения',15000,'Сантехника'),
  arch21Work('Монтаж системы канализации',10000,'Сантехника'),
  arch21Work('Подготовка выводов под сантехническое оборудование',10000,'Сантехника'),
  arch21Work('Монтаж и подключение бойлера',6000,'Сантехника'),
  arch21Work('Сборка и установка тумбы с раковиной',6000,'Сантехника'),
  arch21Work('Монтаж смесителя и душевой системы',7000,'Сантехника'),
  arch21Work('Прокладка плоского прямоугольного пластикового вентканала с комплектующими',1000,'Вентиляция и климат','1','м.п.'),
  arch21Work('Монтаж и подключение принудительного вентилятора',3500,'Вентиляция и климат'),
  arch21Work('Монтаж кондиционера',22000,'Вентиляция и климат'),
  arch21Work('Натяжной потолок',1200,'Потолки','24.03','м²'),
  arch21Work('Сборка и установка прямой кухни',25000,'Кухня и мебель'),
  arch21Work('Сборка отдельно стоящего шкафа',6000,'Кухня и мебель','1','шт.'),
  arch21Work('Установка двери в санузел',7000,'Двери и проёмы','1','шт.')
]}
async function seedAug2026CurrentObjects(){if(storageGet(AUG2026_SEED_KEY,'0')==='1')return;let changed=false;
  const hasAddr=(needle)=>objects.find(o=>String(o.contact.address||'').toLowerCase().includes(needle));
  if(!hasAddr('5-я матросская')&&!hasAddr('пятая матросская')){const o=defaultObject();o.status='work';o.contact={name:'Детейлинг «ПроЗащиту»',phone:'',address:'г. Владивосток, ул. 5-я Матросская, 26',comment:'Выполненные работы, ожидается оплата'};const q=o.orders[0];q.title='Детейлинг · выполненные работы';q.date='2026-08-09';q.status='awaiting';q.completedAt='2026-08-09';q.works=[rowWork('Монтаж резинового порога / лежачего полицейского',7000,'misc.speedbump','2','шт.'),rowWork('Монтаж стекла и ролика под плёнку',5000,'misc.glassRoller','1','компл.'),rowWork('Замена крана',1000,'misc.valve'),rowWork('Замена блока питания LED',1000,'misc.ledPower'),rowWork('Закупка и доставка материалов',2000,'misc.procurement','1','услуга')];q.pricing.contractTotal='23000';q.purchases=[normalizePurchase({name:'Возмещаемые материалы по двум чекам',amount:'7651',date:'2026-08-09',status:'due',comment:'В чеках есть личные покупки; к возмещению подтверждено 7 651 ₽'})];await dbPut(normalizeObject(o));changed=true;}
  if(!hasAddr('веселковая, 12б')&&!hasAddr('веселковая 12б')){const o=defaultObject();o.status='work';o.contact={name:'ООО «АТМОСФЕРА»',phone:'',address:'г. Владивосток, ул. Веселковая, 12Б, 4 этаж, кабинет 1409',comment:'Монтаж выполнен, ожидается оплата'};const q=o.orders[0];q.title='Водоснабжение и напорное водоотведение';q.date='2026-08-09';q.status='awaiting';q.completedAt='2026-08-09';q.taxRate='6';q.works=[rowWork('Монтаж водоснабжения и напорного водоотведения под ключ',74000,'','1','компл.')];q.pricing.contractTotal='74000';q.expenses=[normalizeExpense({category:'materialsIncluded',amount:'12500',date:'2026-08-09',comment:'Трубы, фитинги и прочие материалы'},'order'),normalizeExpense({category:'materialsIncluded',amount:'16000',date:'2026-08-09',comment:'Санитарный насос'},'order')];await dbPut(normalizeObject(o));changed=true;}
  let leonova=objects.find(o=>{const a=String(o.contact.address||'').toLowerCase();return a.includes('леонова')&&a.includes('54')});
  if(leonova){const paidFloor=leonova.orders.find(q=>Math.abs(orderWorkTotal(q)-33362.5)<1);if(paidFloor&&orderPaid(paidFloor)<1){paidFloor.payments.push(normalizePayment({amount:'33362.50',date:'2026-08-01',note:'Оплата выполненных работ'}));paidFloor.status='paid';changed=true;}if(!leonova.orders.some(q=>String(q.title).toLowerCase().includes('кухн'))){const q=defaultOrder(leonova.orders.length+1);q.title='Сборка кухни';q.date='2026-08-10';q.status='work';q.works=[rowWork('Сборка и монтаж кухни под ключ',40000,'misc.kitchen','1','компл.')];q.pricing.contractTotal='40000';leonova.orders.push(q);changed=true;}if(changed)await dbPut(normalizeObject(leonova));}
  storageSet(AUG2026_SEED_KEY,'1');if(changed)await reloadObjects();
}

async function patchV202CurrentData(){if(storageGet(UX202_DATA_KEY,'0')==='1')return;let changed=false;for(const object of objects){const a=String(object.contact.address||'').toLowerCase();for(const order of object.orders||[]){if(a.includes('5-я матросская')&&String(order.title).toLowerCase().includes('детейлинг')){if(['done','work'].includes(order.status))order.status='awaiting';order.completedAt=order.completedAt||'2026-08-09';changed=true}if(a.includes('веселковая')&&String(order.title).toLowerCase().includes('водоснабжение')){if(['done','work'].includes(order.status))order.status='awaiting';order.completedAt=order.completedAt||'2026-08-09';order.taxRate='6';changed=true}}if(changed)await dbPut(normalizeObject(object))}storageSet(UX202_DATA_KEY,'1');if(changed)await reloadObjects()}
async function patchV210WorkflowData(){
  if(storageGet(WORKFLOW210_DATA_KEY,'0')==='1')return;let changed=false;
  let object=objects.find(o=>{const a=String(o.contact.address||'').toLowerCase();return a.includes('архангельск')&&a.includes('21')});
  if(!object){object=defaultObject();object.status='work';object.contact={name:'',phone:'',address:'г. Владивосток, ул. Архангельская, 21',comment:'Тест новой карточки прогресса работ'};object.orders=[];objects.push(object)}
  let order=(object.orders||[]).find(q=>q.workflowKey==='arch21-progress-v1'||String(q.title||'').toLowerCase().includes('прогресс работ'));
  if(!order){order=defaultOrder((object.orders||[]).length+1);order.title='Ремонт квартиры · прогресс работ';order.date='2026-08-11';order.startedAt='2026-08-11';order.status='work';order.comment='Рабочий чек-лист: финальное КП + фактические уточнения по электрике, откосам и локальному наливному полу.';order.pricing.contractTotal='';order.works=arch21ProgressWorks();order.workflowKey='arch21-progress-v1';object.orders.push(order);changed=true}
  if(changed)await dbPut(normalizeObject(object));storageSet(WORKFLOW210_DATA_KEY,'1');if(changed)await reloadObjects()
}
async function patchV220WorkflowData(){
  if(storageGet(WORKFLOW220_DATA_KEY,'0')==='1')return;let changed=false;
  for(const object of objects){const address=String(object.contact.address||'').toLowerCase();let objectChanged=false;
    if(address.includes('архангельск')&&address.includes('21')){
      const old=(object.orders||[]).find(q=>q.workflowKey==='arch21-progress-v1'||q.workflowKey==='arch21-progress-v2'||String(q.title||'').toLowerCase().includes('прогресс работ'));
      const replacement=defaultOrder((object.orders||[]).indexOf(old)+1||1);replacement.id=old?.id||replacement.id;replacement.title='Ремонт квартиры · прогресс работ';replacement.date='2026-08-11';replacement.startedAt='2026-08-11';replacement.status='work';replacement.comment='Рабочий чек-лист по разделам. Тестовый прогресс 2.1.0 сброшен для чистого теста новой архитектуры.';replacement.pricing.contractTotal='';replacement.works=arch21ProgressWorks();replacement.workflowKey='arch21-progress-v2';if(old)object.orders.splice(object.orders.indexOf(old),1,replacement);else object.orders.push(replacement);objectChanged=true;
    }
    if(address.includes('леонова')&&address.includes('54')){
      const floor=(object.orders||[]).find(q=>Math.abs(orderWorkTotal(q)-33362.5)<1||String(q.title||'').toLowerCase().includes('spc'));
      if(floor){const pay=(floor.payments||[]).find(p=>Math.abs(parseNum(p.amount)-33362.5)<1);if(pay&&Math.abs(parseNum(pay.amount)-33363)>.001){pay.amount='33363';objectChanged=true}if(floor.status!=='paid'){floor.status='paid';objectChanged=true}}
      const kitchen=(object.orders||[]).find(q=>String(q.title||'').toLowerCase().includes('кухн'));
      if(kitchen){if(Math.abs(orderContractTotal(kitchen)-43000)>.01){kitchen.pricing.contractTotal='43000';if(kitchen.works?.length===1&&/кухн/i.test(kitchen.works[0].name))kitchen.works[0].price='43000';objectChanged=true}if(kitchen.status!=='paid'&&kitchen.status!=='work'){kitchen.status='work';objectChanged=true}}
    }
    if(objectChanged){await dbPut(normalizeObject(object));changed=true}
  }
  storageSet(WORKFLOW220_DATA_KEY,'1');if(changed)await reloadObjects()
}

async function patchV230CurrentData(){
  if(storageGet(CURRENT230_DATA_KEY,'0')==='1')return;
  let changed=false;

  // Актуальная месячная цель пользователя.
  storageSet(MONTHLY_GOAL_KEY,'300000');

  // На 25.08.2026 все возмещаемые покупки по чекам закрыты.
  for(const object of objects){
    let objectChanged=false;
    for(const order of object.orders||[]){
      for(const purchase of order.purchases||[]){
        if(purchase.status!=='reimbursed'&&String(purchase.date||'')<='2026-08-25'){
          purchase.status='reimbursed';
          purchase.comment=[purchase.comment,'Возмещение закрыто по факту на 25.08.2026.'].filter(Boolean).join(' · ');
          objectChanged=true;
        }
      }
    }
    if(objectChanged){await dbPut(normalizeObject(object));changed=true}
  }
  if(changed)await reloadObjects();

  // Леонова: актуализируем адрес и текущий пакет работ. Старый SPC-заказ сохраняется отдельной историей.
  let leonova=objects.find(o=>{
    const a=String(o.contact.address||'').toLowerCase(),n=String(o.contact.name||'').toLowerCase();
    return a.includes('леонова')&&(a.includes('204')||n.includes('юлия'));
  });
  if(leonova){
    let objectChanged=false;
    if(leonova.contact.address!=='г. Владивосток, ул. Леонова, 34, секция 6, кв. 204'){
      leonova.contact.address='г. Владивосток, ул. Леонова, 34, секция 6, кв. 204';
      objectChanged=true;
    }
    leonova.contact.comment='Актуализировано 25.08.2026. Материалы/чеки закрыты. Текущий пакет допработ ведётся отдельным заказом.';

    let order=(leonova.orders||[]).find(q=>q.workflowKey==='leonova34-current-v230');
    if(!order){
      order=(leonova.orders||[]).find(q=>/кухн/i.test(String(q.title||''))&&orderPaid(q)<.01&&!(q.workClosures||[]).length)||null;
      if(!order){order=defaultOrder((leonova.orders||[]).length+1);leonova.orders.push(order)}
    }

    order.workflowKey='leonova34-current-v230';
    order.title='Допработы · кухня, балкон и мебель';
    order.date='2026-08-18';
    order.startedAt=order.startedAt||'2026-08-18';
    order.status='work';
    order.comment='Актуально на 25.08.2026. Плинтус ~33,6 м.п. — окончательный объём уточнить после завершения. По кухне возможны отдельные дополнительные переделки. LED-подсветка добавлена отдельной позицией 3 500 ₽.';
    order.pricing.contractTotal='168380';
    order.works=[
      normalizeGenericRow({name:'Сборка и монтаж кухни под ключ',qty:'1',unit:'компл.',price:'50000',moduleId:'kitchen',group:'Кухня и мебель',comment:'Цена клиенту 50 000 ₽. Доля пользователя 43 000 ₽; посреднику 7 000 ₽. Возможные дальнейшие переделки считаются отдельно.'},'Кухня и мебель'),
      normalizeGenericRow({name:'Монтаж напольного плинтуса под ключ',qty:'33.6',unit:'м.п.',price:'800',moduleId:'floors',group:'Полы',comment:'Предварительный объём. Финальный замер и сумма корректируются по окончанию.'},'Полы'),
      normalizeGenericRow({name:'Тёплый пол + укладка керамогранита на балконе',qty:'1',unit:'компл.',price:'33000',moduleId:'floors',group:'Полы',comment:'Цена клиенту 33 000 ₽. Доля пользователя 30 000 ₽; посреднику 3 000 ₽.'},'Полы'),
      normalizeGenericRow({name:'Кухонный фартук под ключ',qty:'1',unit:'компл.',price:'18000',moduleId:'kitchen',group:'Кухня и мебель',comment:'Цена клиенту 18 000 ₽. Доля пользователя 15 000 ₽; посреднику 3 000 ₽.'},'Кухня и мебель'),
      normalizeGenericRow({name:'Сборка и монтаж прихожей / гардеробной',qty:'1',unit:'компл.',price:'25000',moduleId:'kitchen',group:'Кухня и мебель'},'Кухня и мебель'),
      normalizeGenericRow({name:'Монтаж межкомнатной двери',qty:'1',unit:'шт.',price:'7000',moduleId:'doors',group:'Двери и проёмы'},'Двери и проёмы'),
      normalizeGenericRow({name:'Благоустройство входной двери / откосы',qty:'1',unit:'компл.',price:'5000',moduleId:'doors',group:'Двери и проёмы'},'Двери и проёмы'),
      normalizeGenericRow({name:'Монтаж LED-подсветки кухонного гарнитура',qty:'1',unit:'компл.',price:'3500',moduleId:'electrical',group:'Электрика',comment:'Канал, диодная лента, блок питания и монтаж. Добавлено 25.08.2026.'},'Электрика')
    ];

    // Комиссия посреднику учитывается как расход по заказу, чтобы «чистыми при полной оплате» = 155 380 ₽.
    order.expenses=(order.expenses||[]).filter(e=>!String(e.comment||'').includes('[FRAME 2.3 посредник]'));
    order.expenses.push(
      normalizeExpense({category:'worker',amount:'7000',date:'2026-08-25',worker:'Посредник',work:'Сборка кухни',comment:'[FRAME 2.3 посредник] Доля посредника по кухне.'},'order'),
      normalizeExpense({category:'worker',amount:'3000',date:'2026-08-25',worker:'Посредник',work:'Балкон: тёплый пол + керамогранит',comment:'[FRAME 2.3 посредник] Доля посредника по балкону.'},'order'),
      normalizeExpense({category:'worker',amount:'3000',date:'2026-08-25',worker:'Посредник',work:'Кухонный фартук',comment:'[FRAME 2.3 посредник] Доля посредника по фартуку.'},'order')
    );

    // По состоянию на 25.08.2026 клиент уже передал всего 100 000 ₽ по этому пакету.
    const paidNow=orderPaid(order);
    if(paidNow<100000-.01){
      order.payments.push(normalizePayment({amount:String(Math.round((100000-paidNow)*100)/100),date:'2026-08-25',note:'Фактически получено по текущему пакету работ; общий итог оплат доведён до 100 000 ₽.'}));
    }
    objectChanged=true;
    if(objectChanged){await dbPut(normalizeObject(leonova));changed=true}
  }

  // Архангельская, 21: кондиционер установлен сторонним исполнителем 22–23.08.2026; доход пользователя = 0 ₽.
  let arch=objects.find(o=>{const a=String(o.contact.address||'').toLowerCase();return a.includes('архангельск')&&a.includes('21')});
  if(arch){
    let objectChanged=false;
    const order=(arch.orders||[]).find(q=>q.workflowKey==='arch21-progress-v2'||String(q.title||'').toLowerCase().includes('прогресс работ'));
    if(order){
      const ac=(order.works||[]).find(r=>/кондиционер/i.test(String(r.name||'')));
      if(ac){
        ac.name='Монтаж кондиционера сторонним исполнителем';
        ac.qty='1';ac.unit='компл.';ac.price='0';ac.moduleId='ventilation';ac.group='Вентиляция и климат';
        ac.comment='Установлен 22–23.08.2026 сторонним исполнителем. Доход пользователя по этой работе: 0 ₽.';
        ac.progressPct=100;ac.closedAmount=0;ac.progressNote='Сторонняя работа · 22–23.08.2026';
        objectChanged=true;
      }
      order.comment='Рабочий чек-лист по разделам. На 25.08.2026 новых собственных объёмов после последнего обновления не добавлено; кондиционер отмечен как сторонняя работа без дохода.';
    }
    if(objectChanged){await dbPut(normalizeObject(arch));changed=true}
  }

  storageSet(CURRENT230_DATA_KEY,'1');
  if(changed)await reloadObjects();
}
async function patchV260SoloFieldTest(){if(storageGet(SOLO260_DATA_KEY,'0')==='1')return;let changed=false;const arch=objects.find(o=>{const a=String(o.contact.address||'').toLowerCase();return a.includes('архангельск')&&a.includes('21')});if(arch){const order=(arch.orders||[]).find(q=>q.workflowKey==='arch21-progress-v2'||String(q.title||'').toLowerCase().includes('прогресс работ'));if(order){for(const row of order.works||[]){if(/кондиционер сторонним/i.test(String(row.name||''))){row.progressPct=100;row.closedAmount=0;row.progressNote='Сторонняя работа · уже выполнена';continue}row.progressPct=0;row.closedAmount=0;row.progressNote=''}order.workClosures=[];order.payments=[];order.documentHistory=[];order.status='work';order.comment='FRAME Solo 2.6: полевой тест с чистого прогресса. Исходные работы, объёмы и ставки сохранены. Кондиционер стороннего исполнителя оставлен выполненным с доходом 0 ₽.';await dbPut(normalizeObject(arch));changed=true}}storageSet(SOLO260_DATA_KEY,'1');if(changed)await reloadObjects()}
window.addEventListener('beforeunload',e=>{if(editorState.dirty){e.preventDefault();e.returnValue=''}});
window.addEventListener('resize',()=>{if(!$('documentView').classList.contains('hidden'))fitPaperPreview()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&aiServerUrl())checkAiBrain({toastResult:false})});
window.addEventListener('online',()=>{if(aiServerUrl())checkAiBrain({toastResult:false})});
if($('brandHome'))$('brandHome').onclick=()=>navigate('ai',{aiTarget:(typeof frameTopicSession==='string'?frameTopicSession:'')||aiDefaultTargetKey()});
if($('chatBtn'))$('chatBtn').onclick=()=>navigate('ai',{aiTarget:(typeof frameTopicSession==='string'?frameTopicSession:'')||aiDefaultTargetKey()});
if($('settingsBtn'))$('settingsBtn').onclick=()=>navigate('settings',{tab:'profile'});
if($('menuBtn'))$('menuBtn').onclick=showMainMenu;
if($('closeDocumentBtn'))$('closeDocumentBtn').onclick=()=>$('documentView').classList.add('hidden');
if($('printDocumentBtn'))$('printDocumentBtn').onclick=()=>window.print();
applyTheme(storageGet('frameTheme','dark')||'dark');

async function init(){
  retireAiLogRawUtterances();
  try{
    await openDB();
    await migrateLegacy();
    await reloadObjects();
    retireLegacyContentPatches();
  }catch(e){
    console.error('IndexedDB',e);
    try{
      for(const key of [BACKUP_KEY,...OLD_BACKUP_KEYS]){
        const arr=JSON.parse(storageGet(key,'[]')||'[]');
        if(Array.isArray(arr)&&arr.length){objects=arr.map(normalizeObject);break}
      }
    }catch(_){objects=[]}
    toast('FRAME работает из локальной резервной копии')
  }
  render();
  if(aiServerUrl())checkAiBrain({toastResult:false});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=282',{updateViaCache:'none'}).catch(console.warn);
}
const frameSkipInitForExecutorHarness=window.FRAME_TEST_SKIP_APP_INIT===true&&location.protocol==='file:'&&/\/tests\/ai\/executor-harness\.html$/i.test(decodeURI(location.pathname||''));
if(!frameSkipInitForExecutorHarness)init();
