'use strict';
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
const VERSION='2.0.0';
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

let db=null;
let objects=[];
let currentObjectId='';
let currentOrderId='';
let route='dashboard';
let routeState={};
let saveTimer=null;
const MANUAL_EDIT_ROUTES=new Set(['object','order','floor','doors','purchases','expenses','payments','photos']);
let editorState={key:'',snapshot:null,dirty:false};
let sheetCloseHandler=null;
let importCandidate=null;
let reviewRows=[];
let documentContext={};
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
  'door.opening.standard':0,'door.opening.entrance':5000,'door.threshold.aluminium':500,'door.threshold.seal':800,'door.threshold.seamless':1500
};

const RATE_GROUPS={
  floor:[
    {title:'SPC / замковый кварцвинил',items:[['Прямая укладка','floor.spc.straight'],['Английская ёлочка','floor.spc.eng'],['Французская ёлочка','floor.spc.fr'],['Укладка от угла','floor.spc.corner'],['Сложный рисунок','floor.spc.complex']]},
    {title:'Ламинат',items:[['Прямая укладка','floor.laminate.straight'],['Английская ёлочка','floor.laminate.eng'],['Французская ёлочка','floor.laminate.fr'],['Укладка от угла','floor.laminate.corner'],['Сложный рисунок','floor.laminate.complex']]},
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
  ]
};

let rates=loadRates();
let profile=loadProfile();

function storageGet(key,fallback=''){try{return localStorage.getItem(key)??fallback}catch(e){return fallback}}
function storageSet(key,value){try{localStorage.setItem(key,value)}catch(e){console.warn('storage',e)}}
function clone(v){return JSON.parse(JSON.stringify(v))}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function today(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function now(){return new Date().toISOString()}
function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function parseNum(value){const s=String(value??'').trim().replace(/\s/g,'').replace(',','.');if(!s||s==='.'||s==='-')return 0;const n=Number(s);return Number.isFinite(n)?n:0}
function rawNum(value){return String(value??'').replace(/[^0-9.,-]/g,'').replace(/\.(?=.*\.)/g,'')}
function qty(value){const n=parseNum(value);return Number.isInteger(n)?String(n):String(Math.round(n*100)/100).replace('.',',')}
function money(value){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(parseNum(value))}
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
  const category=scope==='general'?(rawCategory==='fuel'?'fuel':rawCategory==='tool'?'tool':'other'):(rawCategory==='worker'?'worker':'objectOther');
  return sanitizeExpense({id:e.id||uid(),category,amount:String(e.amount??''),date:e.date||today(),worker:String(e.worker||''),work:String(e.work||''),comment:String(e.comment||'')},scope)
}
function sanitizeExpense(item,scope='order'){
  if(scope==='general'){
    if(!['fuel','tool','other'].includes(item.category))item.category='other';
    item.worker='';item.work='';
    if(item.category==='fuel')item.comment='';
  }else{
    if(!['worker','objectOther'].includes(item.category))item.category=item.category==='worker'?'worker':'objectOther';
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
function defaultOrder(index=1){return {id:uid(),title:`Заказ ${index}`,date:today(),status:'draft',comment:'',pricing:normalizePricing(),floor:defaultFloor(),doors:defaultDoors(),purchases:[],expenses:[],payments:[],stages:[],photos:[],documentHistory:[]}}
function defaultObject(){return {id:uid(),version:VERSION,createdAt:now(),updatedAt:now(),status:'auto',showDiscountInDocuments:true,contact:{name:'',phone:'',address:'',comment:''},orders:[defaultOrder(1)],legacyMeta:{}}}
function normalizeGenericRow(row={},group='Дополнительные работы',kind='work'){return {id:row.id||uid(),name:String(row.name||''),qty:String(row.qty??1),unit:row.unit||'шт.',price:String(row.price??''),comment:String(row.comment||''),group:row.group||group,kind:row.kind||kind,rateKey:row.rateKey||''}}
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
function normalizePayment(p={}){return {id:p.id||uid(),amount:String(p.amount??''),date:p.date||today(),note:p.note||''}}
function normalizeStage(s={}){return {id:s.id||uid(),name:s.name||'',amount:String(s.amount??''),date:s.date||today(),paid:!!s.paid}}
function normalizeOrder(raw={},index=1){return {
  id:raw.id||uid(),title:raw.title||`Заказ ${index}`,date:raw.date||today(),status:raw.status||'draft',comment:raw.comment||'',pricing:normalizePricing(raw.pricing||{contractTotal:raw.contractTotal??''}),
  floor:normalizeFloor(raw.floor||{}),doors:normalizeDoors(raw.doors||{}),purchases:(raw.purchases||[]).map(normalizePurchase),expenses:(raw.expenses||[]).map(e=>normalizeExpense(e,'order')),
  payments:(raw.payments||[]).map(normalizePayment),stages:(raw.stages||[]).map(normalizeStage),photos:(raw.photos||[]).map(p=>({...p,id:p.id||uid(),caption:p.caption||''})),documentHistory:raw.documentHistory||[]
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
function stripPhotos(object){const c=clone(object);for(const order of c.orders||[]){order.photos=(order.photos||[]).map(p=>({id:p.id,caption:p.caption||'',missing:true}));for(const purchase of order.purchases||[])if(purchase.receiptData){purchase.receiptData='';purchase.receiptMissing=true}}return c}
function mirrorBackup(){storageSet(BACKUP_KEY,JSON.stringify(objects.map(stripPhotos)))}
function localKeys(){try{return Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(Boolean)}catch(e){return []}}
async function migrateLegacy(){
  const existing=await dbAll();const ids=new Set(existing.map(x=>x.id));
  const keys=[...new Set([...OLD_BACKUP_KEYS,...localKeys().filter(k=>/^frameObjects/i.test(k))])];
  for(const key of keys){try{const arr=JSON.parse(storageGet(key,'[]')||'[]');if(!Array.isArray(arr))continue;for(const raw of arr){const object=normalizeObject(raw);if(!ids.has(object.id)){await dbPut(object);ids.add(object.id)}}}catch(e){console.warn('migration',key,e)}}
}
async function reloadObjects(){objects=(await dbAll()).map(normalizeObject).sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt)));mirrorBackup()}
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
function orderCalculatedWorkTotal(order){const f=calculateFloor(order.floor),d=calculateDoors(order.doors);return f.workTotal+d.total}
function orderContractTotal(order){const calc=orderCalculatedWorkTotal(order),raw=order?.pricing?.contractTotal;return raw===undefined||raw===null||String(raw).trim()===''?calc:Math.max(0,parseNum(raw))}
function orderAdjustment(order){return orderContractTotal(order)-orderCalculatedWorkTotal(order)}
function orderWorkTotal(order){return orderContractTotal(order)}
function orderPaid(order){return (order.payments||[]).reduce((s,p)=>s+parseNum(p.amount),0)}
function orderRemaining(order){return Math.max(0,orderContractTotal(order)-orderPaid(order))}
function orderDuePurchases(order){return (order.purchases||[]).filter(p=>p.status!=='reimbursed').reduce((s,p)=>s+parseNum(p.amount),0)}
function orderExpenses(order){return (order.expenses||[]).reduce((s,e)=>s+parseNum(e.amount),0)}
function orderProfit(order){return orderPaid(order)-orderExpenses(order)}
function objectTotals(object){return (object.orders||[]).reduce((acc,o)=>{acc.work+=orderWorkTotal(o);acc.paid+=orderPaid(o);acc.due+=orderDuePurchases(o);acc.expenses+=orderExpenses(o);return acc},{work:0,paid:0,due:0,expenses:0})}
function expenseCategoryName(value){return {worker:'Оплата работнику',objectOther:'Прочие расходы по объекту',fuel:'Бензин',tool:'Инструмент',other:'Прочее'}[value]||'Прочее'}
function objectStatusValue(object){if(object?.status&&object.status!=='auto')return object.status;const statuses=(object?.orders||[]).map(o=>o.status);if(statuses.length&&statuses.every(s=>['done','paid'].includes(s)))return 'done';if(statuses.length&&statuses.every(s=>s==='draft'))return 'draft';return 'work'}
function objectStatusName(value){return {work:'В работе',done:'Завершён',paused:'Приостановлен',draft:'Черновик',auto:'Авто'}[value]||'В работе'}
function dateInRange(value,start,end){if(!value)return false;return value>=start&&value<=end}
function financeRange(kind='last30',customStart='',customEnd=''){const nowDate=new Date(),end=today();let start=end;if(kind==='month')start=`${end.slice(0,7)}-01`;else if(kind==='year')start=`${end.slice(0,4)}-01-01`;else if(kind==='custom'&&customStart&&customEnd){start=customStart;return {start,end:customEnd,label:`${ruDate(start).replace(' г.','')} – ${ruDate(customEnd)}`}}else{const d=new Date(nowDate);d.setDate(d.getDate()-29);start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}return {start,end,label:kind==='month'?'Этот месяц':kind==='year'?'Этот год':'Последние 30 дней'}}
function financeData(range){
  const payments=[],expenses=[],purchasesDue=[];
  for(const object of objects)for(const order of object.orders||[]){
    for(const pay of order.payments||[])if(dateInRange(pay.date,range.start,range.end))payments.push({...pay,orderId:order.id,orderTitle:order.title,address:object.contact.address});
    for(const exp of order.expenses||[])if(dateInRange(exp.date,range.start,range.end))expenses.push({...exp,orderId:order.id,orderTitle:order.title,address:object.contact.address});
    for(const purchase of order.purchases||[])if(purchase.status!=='reimbursed'&&dateInRange(purchase.date,range.start,range.end))purchasesDue.push({...purchase,orderId:order.id,orderTitle:order.title,address:object.contact.address});
  }
  for(const exp of generalExpenses)if(dateInRange(exp.date,range.start,range.end))expenses.push({...exp,orderId:'general',orderTitle:'Общий расход',address:''});
  const received=payments.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const spent=expenses.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const due=purchasesDue.reduce((sum,item)=>sum+parseNum(item.amount),0);
  const workerPaid=expenses.filter(item=>item.category==='worker').reduce((sum,item)=>sum+parseNum(item.amount),0);
  return {payments,expenses,purchasesDue,received,spent,due,workerPaid,net:received-spent};
}

function orderStatusName(value){return {draft:'Черновик',agreed:'Согласован',work:'В работе',done:'Завершён',paid:'Оплачен'}[value]||'Черновик'}
function rateGuide(row){if(!row.rateKey||!rates[row.rateKey])return {cls:'guide-none',label:'Без ориентира',detail:'Ручная или нестандартная работа'};const ref=parseNum(rates[row.rateKey]),cur=parseNum(row.price);if(!ref)return {cls:'guide-none',label:'Цена не задана',detail:'Заполните в «Моих ценах»'};const diff=(cur-ref)/ref;if(Math.abs(diff)<=.1)return {cls:'guide-ok',label:'По моей ставке',detail:`Ориентир ${money(ref)}`};if(diff<0)return {cls:'guide-low',label:`Ниже на ${Math.round(Math.abs(diff)*100)}%`,detail:`Моя ставка ${money(ref)}`};if(diff<=.3)return {cls:'guide-high',label:`Выше на ${Math.round(diff*100)}%`,detail:`Моя ставка ${money(ref)}`};return {cls:'guide-danger',label:`Выше на ${Math.round(diff*100)}%`,detail:`Моя ставка ${money(ref)}`}}

function applyTheme(theme){document.body.classList.toggle('light',theme==='light');$('lightBtn').classList.toggle('active',theme==='light');$('darkBtn').classList.toggle('active',theme==='dark');storageSet('frameTheme',theme);document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f3f0e9':'#0f1113'}
function commitNavigate(next,state={},options={}){closeSheet();route=next;routeState=state;if(!MANUAL_EDIT_ROUTES.has(route))editorState={key:'',snapshot:null,dirty:false};render();requestAnimationFrame(()=>{document.documentElement.scrollLeft=0;document.body.scrollLeft=0;if(options.keepScroll)return;if(options.scrollToId){const el=$(options.scrollToId);if(el)el.scrollIntoView({block:'start',inline:'nearest',behavior:options.behavior||'smooth'});else window.scrollTo({left:0,top:0,behavior:'auto'})}else window.scrollTo({left:0,top:0,behavior:options.behavior||'auto'})})}
function navigate(next,state={},options={}){if(editorState.dirty&&editorApplies()&&next!==route){showUnsavedChanges(()=>commitNavigate(next,state,options),()=>commitNavigate(next,state,options));return}commitNavigate(next,state,options)}
function render(){const host=$('viewHost');const renderers={dashboard:renderDashboard,settings:renderSettings,globalDocs:renderGlobalDocs,finances:renderFinancesView,object:renderObjectView,order:renderOrderView,floor:renderFloorView,doors:renderDoorsView,purchases:renderPurchasesView,expenses:renderExpensesView,payments:renderPaymentsView,photos:renderPhotosView,documents:renderDocumentsView};host.innerHTML=(renderers[route]||renderDashboard)();bindRoute();}
function openSheet(html,onClose=null){$('sheetPanel').innerHTML=`<div class="sheetHandle"></div>${html}`;$('sheet').classList.add('show');$('sheet').setAttribute('aria-hidden','false');sheetCloseHandler=onClose;$$('[data-close-sheet]',$('sheetPanel')).forEach(b=>b.onclick=closeSheet)}
function closeSheet(){if(!$('sheet').classList.contains('show'))return;$('sheet').classList.remove('show');$('sheet').setAttribute('aria-hidden','true');$('sheetPanel').innerHTML='';const cb=sheetCloseHandler;sheetCloseHandler=null;if(cb)cb()}
$('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))closeSheet()});

function renderDashboard(){
  const total=objects.reduce((sum,o)=>sum+objectTotals(o).work,0),active=objects.filter(o=>objectStatusValue(o)==='work').length;
  const saved=(()=>{try{return JSON.parse(storageGet(FINANCE_PERIOD_KEY,'{}')||'{}')}catch(e){return {}}})();const range=financeRange(saved.kind||'last30',saved.start||'',saved.end||''),finance=financeData(range);
  return `<section class="view">
    <div class="card"><h1>Рабочие объекты</h1><p class="help">Локальный кабинет мастера. Контакты, расчёты и документы остаются на этом устройстве.</p>
      <div class="stats"><div class="stat"><span>Объекты</span><strong>${objects.length}</strong></div><div class="stat"><span>В работе</span><strong>${active}</strong></div><div class="stat"><span>Стоимость работ</span><strong>${money(total)}</strong></div></div>
      <div class="financeCard"><button id="financePeriodCard" class="financeCell financePeriodCell" type="button"><strong>${esc(range.label)}</strong><small>Выбрать период</small></button><button class="financeCell" data-finance-focus="received"><small>Получено</small><strong>${money(finance.received)}</strong></button><button class="financeCell" data-finance-focus="expenses"><small>Расходы</small><strong>${money(finance.spent)}</strong></button><button class="financeCell" data-finance-focus="net"><small>Чистыми</small><strong>${money(finance.net)}</strong></button></div>
      <div class="actions"><button id="newObjectBtn" class="btn primary">＋ Новый объект</button><button id="quickPriceBtn" class="btn ghost">▤ Прайс-лист</button></div>
    </div>
    <div class="card"><div class="sectionTitle"><h2>История объектов</h2><span class="muted tiny">IndexedDB · локально</span></div>
      <div class="list">${objects.length?objects.slice().reverse().map(o=>{const t=objectTotals(o),remaining=Math.max(0,t.work-t.paid),status=objectStatusValue(o);return `<article class="objectItem clickable" tabindex="0" data-object-id="${o.id}"><div><div class="objectTitleLine"><h3>${esc(o.contact.address||'Объект без адреса')}</h3><span class="statusPill ${status}">${esc(objectStatusName(status))}</span></div><p>${esc(o.contact.name||'Заказчик не указан')} · ${esc(formatPhone(o.contact.phone)||'без телефона')}</p><p><strong>${money(t.work)}</strong> · оплачено ${money(t.paid)} · осталось ${money(remaining)}</p>${t.due?`<span class="warningPill">К возмещению: ${money(t.due)}</span>`:''}</div><span class="arrow">›</span></article>`}).join(''):'<div class="empty">Объектов пока нет. Создайте первый, и FRAME заведёт внутри него первый заказ.</div>'}</div>
    </div>
  </section>`;
}
function settingsRateSection(group){return `<details data-price-group><summary>${esc(group.title)}</summary><div class="settingsRows">${group.items.map(([label,key,unit='м²'])=>`<label class="settingsRow" data-price-row data-price-name="${esc(`${group.title} ${label}`.toLowerCase())}"><span><strong>${esc(label)}</strong><small>₽/${esc(unit)}</small></span><input class="decimal" inputmode="decimal" data-rate="${key}" value="${rates[key]?esc(String(rates[key])):''}" placeholder="Цена не задана"></label>`).join('')}</div></details>`}
function renderCustomFloorSettings(){return `<details data-price-group><summary>Мои покрытия</summary><p class="help compact">Добавляйте материал под своим названием. Он появится и в расчёте, и в прайс-листе.</p><div class="customCoverList">${customFloorCovers.length?customFloorCovers.map((item,i)=>`<div class="customCoverCard" data-price-row data-price-name="${esc(item.name.toLowerCase())}"><div class="grid two"><label>Название<input data-custom-cover-index="${i}" data-custom-cover-key="name" value="${esc(item.name)}" placeholder="Инженерная доска"></label><label>Прямая укладка, ₽/м²<input class="decimal" inputmode="decimal" data-custom-cover-index="${i}" data-custom-cover-pattern="straight" value="${esc(item.patterns.straight)}"></label></div><details><summary>Другие варианты укладки</summary><div class="grid two">${[['eng','Английская ёлочка'],['fr','Французская ёлочка'],['corner','От угла'],['complex','Сложный рисунок']].map(([key,label])=>`<label>${label}<input class="decimal" inputmode="decimal" data-custom-cover-index="${i}" data-custom-cover-pattern="${key}" value="${esc(item.patterns[key])}" placeholder="Цена не задана"></label>`).join('')}</div></details><button class="btn danger small" data-remove-custom-cover="${i}">Удалить покрытие</button></div>`).join(''):'<div class="empty">Своих покрытий пока нет.</div>'}</div><button id="addCustomCoverBtn" class="btn ghost wide" style="margin-top:10px">＋ Добавить покрытие</button></details>`}
function renderSettings(){const tab=routeState.tab||'profile';return `<section class="view">
  <div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Объекты</button></div>
  <div class="card"><h1>Настройки</h1><div class="settingsTabs"><button class="btn ghost ${tab==='profile'?'active':''}" data-settings-tab="profile">Мои данные</button><button class="btn ghost ${tab==='prices'?'active':''}" data-settings-tab="prices">Мои цены</button><button class="btn ghost ${tab==='backup'?'active':''}" data-settings-tab="backup">Резервная копия</button></div></div>
  ${tab==='profile'?renderProfileSettings():tab==='prices'?renderPriceSettings():renderBackupSettings()}
  </section>`}
function renderProfileSettings(){return `<div class="card"><h2>Основные данные</h2><p class="help">Один раз заполните контакты. Они автоматически появятся в прайс-листах и документах.</p>
  <div class="grid two"><label>Фамилия<input data-profile="lastName" value="${esc(profile.lastName)}" placeholder="Фамилия"></label><label>Имя<input data-profile="firstName" value="${esc(profile.firstName)}" placeholder="Имя"></label><label>Отчество<input data-profile="middleName" value="${esc(profile.middleName)}" placeholder="Отчество"></label><label>Телефон<input data-profile="phone" inputmode="tel" value="${esc(profile.phone)}"></label><label>Город<input data-profile="city" value="${esc(profile.city)}"></label></div>
  <details><summary>Данные для договора</summary><p class="help">Необязательно. Договор можно печатать с пустыми реквизитами мастера. Паспортные данные хранятся только на этом устройстве.</p>
    <div class="grid two"><label>Серия паспорта<input data-profile="passportSeries" type="password" inputmode="numeric" autocomplete="off" value="${esc(profile.passportSeries)}"></label><label>Номер паспорта<input data-profile="passportNumber" type="password" inputmode="numeric" autocomplete="off" value="${esc(profile.passportNumber)}"></label><label class="wide">Кем выдан<input data-profile="passportIssuedBy" value="${esc(profile.passportIssuedBy)}"></label><label>Дата выдачи<input data-profile="passportIssuedDate" type="date" value="${esc(profile.passportIssuedDate)}"></label><label>Код подразделения<input data-profile="passportCode" value="${esc(profile.passportCode)}"></label><label class="wide">Адрес регистрации<input data-profile="registrationAddress" value="${esc(profile.registrationAddress)}"></label></div>
    <div class="actions end"><button id="clearPassportBtn" class="btn danger small">Удалить паспортные данные</button></div>
  </details><div id="autosaveStatus" class="autosave"></div></div>`}
function renderPriceSettings(){return `<div class="card"><h2>Мои цены</h2><p class="help">Стартовые цены уже заполнены. Меняйте их постепенно. Новые ставки применяются только к новым расчётам и не пересчитывают старые заказы.</p><label>Найти работу<input id="rateSearch" type="search" placeholder="Например, ёлочка, грунтование или замок"></label>
  <details open data-price-category><summary>Полы</summary>${RATE_GROUPS.floor.map(settingsRateSection).join('')}${renderCustomFloorSettings()}</details>
  <details data-price-category><summary>Двери</summary>${RATE_GROUPS.doors.map(settingsRateSection).join('')}</details>
  <div id="autosaveStatus" class="autosave"></div></div>`}
function renderBackupSettings(){const includePrivate=storageGet(EXPORT_PRIVATE_KEY,'0')==='1';return `<div class="card"><h2>Резервная копия</h2><p class="help">Экспорт сохраняет объекты, заказы и персональные цены. Фотографии не включаются, чтобы файл оставался компактным.</p>
  <label class="check"><input id="includePrivateExport" type="checkbox" ${includePrivate?'checked':''}> Включить паспортные данные мастера</label>
  <div class="actions" style="margin-top:12px"><button id="exportBackupBtn" class="btn primary">Экспортировать</button><label class="btn ghost fileBtn">Импортировать<input id="importBackupInput" type="file" accept="application/json" hidden></label></div>
  <div class="backupNote">Импорт сначала покажет состав файла. FRAME ничего не перезапишет молча.</div></div>`}

function renderGlobalDocs(){return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Объекты</button></div>
  <div class="card"><h1>Прайс-лист</h1><p class="help">Быстрый документ из ваших цен. Договоры остаются внутри заказа.</p><button class="module" id="openPriceList"><div class="moduleTop"><span class="moduleIcon">₽</span><span class="moduleStatus">PDF</span></div><h3>Сформировать прайс-лист</h3><p>Выберите направления и отправьте клиенту конкретные ориентиры.</p></button></div></section>`}

function relatedObjectsCount(object){const phone=normalizePhone(object.contact.phone);if(!phone)return 0;return objects.filter(o=>o.id!==object.id&&normalizePhone(o.contact.phone)===phone).length}
function renderObjectView(){const object=currentObject();if(!object)return renderDashboard();const totals=objectTotals(object),remaining=Math.max(0,totals.work-totals.paid),related=relatedObjectsCount(object),status=objectStatusValue(object);return `<section class="view">
  <div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Все объекты</button><button id="deleteObjectBtn" class="btn danger">Удалить объект</button></div>
  <div class="card"><div class="objectHero"><div><div class="objectTitleLine"><h1>${esc(object.contact.address||'Новый объект')}</h1><span class="statusPill ${status}">${esc(objectStatusName(status))}</span></div><p class="help compact">${esc(object.contact.name||'Заказчик не указан')} ${object.contact.phone?'· '+esc(formatPhone(object.contact.phone)):''}</p></div>
    <div class="moneyStack"><button class="moneyMetric primary metricButton" data-object-summary="work"><span>Стоимость работ</span><strong>${money(totals.work)}</strong></button><button class="moneyMetric metricButton" data-object-summary="paid"><span>Оплачено</span><strong>${money(totals.paid)}</strong></button><button class="moneyMetric metricButton" data-object-summary="remaining"><span>Осталось</span><strong>${money(remaining)}</strong></button></div></div>
    ${totals.due?`<div class="dangerNote"><strong>К возмещению: ${money(totals.due)}</strong><br>Покупки мастера, которые заказчик ещё не возместил.</div>`:''}
    <h2>Карточка объекта</h2><div class="grid two"><label>Заказчик<input id="objectName" value="${esc(object.contact.name)}" placeholder="Имя или ФИО"></label><label>Телефон<input id="objectPhone" inputmode="tel" value="${esc(formatPhone(object.contact.phone))}" placeholder="+7 (___) ___-__-__"></label><label class="wide">Адрес<input id="objectAddress" value="${esc(object.contact.address)}" placeholder="Город, улица, дом, квартира"></label><label>Статус объекта<select id="objectStatus"><option value="auto" ${object.status==='auto'?'selected':''}>Автоматически</option><option value="work" ${object.status==='work'?'selected':''}>В работе</option><option value="done" ${object.status==='done'?'selected':''}>Завершён</option><option value="paused" ${object.status==='paused'?'selected':''}>Приостановлен</option><option value="draft" ${object.status==='draft'?'selected':''}>Черновик</option></select></label><label class="check objectDocToggle"><input id="showDiscountDocs" type="checkbox" ${object.showDiscountInDocuments!==false?'checked':''}> Показывать скидку в документах</label><label class="wide">Комментарий<input id="objectComment" value="${esc(object.contact.comment)}" placeholder="Необязательно"></label></div>
    ${related?`<div class="relatedHint">У этого контакта есть ещё объектов: ${related}</div>`:''}
  </div>
  <div class="card"><div class="sectionTitle"><div><h2>Заказы</h2><p class="help compact">Каждый новый выезд или самостоятельная работа живёт отдельным заказом.</p></div><button id="newOrderBtn" class="btn primary small">＋ Новый заказ</button></div>
    <div class="list">${object.orders.slice().reverse().map(order=>`<article class="orderItem clickable" tabindex="0" data-order-id="${order.id}"><div class="orderHead"><div><h3>${esc(order.title)}</h3><p>${ruDate(order.date)} · ${orderStatusName(order.status)}</p></div><span class="arrow">›</span></div><div class="summaryGrid"><div class="stat"><span>Стоимость работ</span><strong>${money(orderWorkTotal(order))}</strong></div><div class="stat"><span>Оплачено</span><strong>${money(orderPaid(order))}</strong></div><div class="stat"><span>Осталось</span><strong>${money(orderRemaining(order))}</strong></div></div>${orderDuePurchases(order)?`<span class="warningPill">К возмещению: ${money(orderDuePurchases(order))}</span>`:''}</article>`).join('')}</div>
  </div>${editorSaveBar()}</section>`}
function moduleCard(id,icon,title,text,status,done=false){return `<button class="module" data-open-module="${id}"><div class="moduleTop"><span class="moduleIcon">${icon}</span><span class="moduleStatus ${done?'done':''}">${esc(status)}</span></div><h3>${esc(title)}</h3><p>${esc(text)}</p></button>`}
function orderToolCard(id,icon,title,status,done=false){return `<button class="orderTool" data-open-module="${id}"><span class="orderToolIcon">${icon}</span><span class="orderToolText"><strong>${esc(title)}</strong><small>${esc(status)}</small></span><span class="moduleStatus ${done?'done':''}">${done?'Готово':'›'}</span></button>`}
function renderOrderView(){
  const order=currentOrder();
  if(!order)return renderObjectView();
  const calculated=orderCalculatedWorkTotal(order),work=orderWorkTotal(order),adjustment=orderAdjustment(order),paid=orderPaid(order),remaining=orderRemaining(order),due=orderDuePurchases(order),expenses=orderExpenses(order),profit=orderProfit(order);
  const adjustmentText=adjustment<0?`Индивидуальная скидка: ${money(Math.abs(adjustment))}`:adjustment>0?`Корректировка стоимости: +${money(adjustment)}`:'Итог совпадает с расчётом';
  return `<section class="view">
    <div class="actions pageBack"><button class="btn ghost" data-go="object">← Объект</button><button id="deleteOrderBtn" class="btn danger">Удалить заказ</button></div>
    <div class="card">
      <div class="objectHero"><div><h1>${esc(order.title)}</h1><p class="help compact">${ruDate(order.date)} · ${orderStatusName(order.status)}</p></div><div class="moneyStack"><button class="moneyMetric primary metricButton" data-order-summary="pricing"><span>Стоимость работ</span><strong id="orderWorkMetric">${money(work)}</strong></button><button class="moneyMetric metricButton" data-open-module="payments"><span>Оплачено</span><strong id="orderPaidMetric">${money(paid)}</strong></button><button class="moneyMetric metricButton" data-open-module="payments"><span>Осталось</span><strong id="orderRemainingMetric">${money(remaining)}</strong></button></div></div>
      ${due?`<div class="dangerNote"><strong>К возмещению: ${money(due)}</strong></div>`:''}
      <button class="orderFinanceStrip" data-open-module="expenses"><span><small>Расходы</small><strong>${money(expenses)}</strong></span><span><small>Чистыми получено</small><strong>${money(profit)}</strong></span><span class="arrow">›</span></button>
      <div class="grid two"><label>Название заказа<input id="orderTitle" value="${esc(order.title)}"></label><label>Дата<input id="orderDate" type="date" value="${esc(order.date)}"></label><label>Статус<select id="orderStatus">${[['draft','Черновик'],['agreed','Согласован'],['work','В работе'],['done','Завершён'],['paid','Оплачен']].map(([v,n])=>`<option value="${v}" ${order.status===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Комментарий<input id="orderComment" value="${esc(order.comment)}" placeholder="Необязательно"></label></div>
      <div id="pricingCard" class="pricingCard"><div class="sectionTitle"><div><h2>Стоимость по договорённости</h2><p class="help compact">Можно изменить итог, не меняя цены отдельных работ.</p></div>${order.pricing.contractTotal!==''?'<button id="resetContractPrice" class="btn ghost small">Вернуть расчётную</button>':''}</div><div class="pricingGrid"><div class="pricingReadonly"><span>Расчётная стоимость</span><strong id="calculatedWorkMetric">${money(calculated)}</strong></div><label>Договорная стоимость, ₽<input id="orderContractTotal" class="decimal" inputmode="decimal" value="${esc(order.pricing.contractTotal)}" placeholder="${esc(String(Math.round(calculated*100)/100))}"></label></div><div id="pricingAdjustment" class="pricingAdjustment ${adjustment<0?'discount':adjustment>0?'increase':''}">${adjustmentText}</div></div>
    </div>
    <div class="card" id="orderActionsCard">
      <h2>Что делаем?</h2><p class="help">Добавьте в заказ нужные направления работ.</p>
      <div class="workModules">
        ${moduleCard('floor','▱','Полы','Покрытие, плинтус, демонтаж и основание.',order.floor.completed?'Заполнено':'Не заполнено',order.floor.completed)}
        ${moduleCard('doors','▯','Двери','Установка, обслуживание и работы с проёмами.',order.doors.completed?`${order.doors.items.length} поз.`:'Не заполнено',order.doors.completed)}
      </div>
      <div class="orderToolsSection"><h3>По заказу</h3><p class="help compact">Деньги, материалы, фотографии и документы.</p><div class="orderTools">
        ${orderToolCard('purchases','🧾','Покупки мастера',due?`К возмещению ${money(due)}`:(order.purchases.length?'Возмещено':'Нет покупок'),order.purchases.length>0&&!due)}
        ${orderToolCard('expenses','−','Расходы',expenses?money(expenses):'Нет расходов',expenses>0)}
        ${orderToolCard('payments','₽','Оплаты',paid?`Получено ${money(paid)}`:'Не оплачено',paid>=work&&work>0)}
        ${orderToolCard('photos','▧','Фото',order.photos.length?`${order.photos.length} фото`:'Нет фото',order.photos.length>0)}
        ${orderToolCard('documents','▤','Документы','КП, акт, договор',false)}
      </div></div>
    </div>${editorSaveBar()}
  </section>`;
}
function genericRowHtml(row,index,collection,{comment=false}={}){return `<div class="rowCard"><div class="rowGrid"><label>Название<input data-row-collection="${collection}" data-row-index="${index}" data-row-key="name" value="${esc(row.name)}" placeholder="Название работы"></label><label>Кол-во<input class="decimal" inputmode="decimal" data-row-collection="${collection}" data-row-index="${index}" data-row-key="qty" value="${esc(row.qty)}" placeholder="1"></label><label>Ед.<select data-row-collection="${collection}" data-row-index="${index}" data-row-key="unit">${['шт.','м²','м.п.','компл.','участок','час','услуга','л','кг'].map(u=>`<option ${u===row.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Цена<input class="decimal" inputmode="decimal" data-row-collection="${collection}" data-row-index="${index}" data-row-key="price" value="${esc(row.price)}" placeholder="0"></label><button class="btn danger small" data-remove-row="${collection}" data-row-index="${index}">×</button></div>${comment?`<label class="rowComment">Комментарий<input data-row-collection="${collection}" data-row-index="${index}" data-row-key="comment" value="${esc(row.comment||'')}" placeholder="Необязательно"></label>`:''}<div class="rowSum">Сумма: <strong data-row-sum="${collection}-${index}">${money(parseNum(row.qty)*parseNum(row.price))}</strong></div></div>`}
function floorStepSummary(f,step){
  if(step===0)return `${floorCoverName(f)} · ${floorPatternName(f.pattern)}${f.installRate?` · ${money(f.installRate)}/м²`:''}`;
  if(step===1)return f.area?`${qty(f.area)} м²`:'Площадь не указана';
  if(step===2)return f.baseboard.enabled?`${qty(f.baseboard.qty)} м.п. · ${money(f.baseboard.rate)}/м.п.`:'Не нужен';
  if(step===3)return f.demolition.length?`${f.demolition.length} поз.`:'Не требуется';
  if(step===4)return f.preparation.length?`${f.preparation.length} поз.`:'Не требуется';
  if(step===5)return `${f.extras.length} доп. работ · ${f.materials.length} материалов`;
  return `Работы ${money(calculateFloor(f).workTotal)}`;
}
function floorStepCard(f,index,title,body){const active=(routeState.floorStep??0)===index,done=index<(routeState.floorStep??0);return `<section class="stepCard ${active?'active':''} ${done?'done':''}" data-floor-step-card="${index}"><button class="stepButton" data-floor-step="${index}"><span class="stepNumber">${done?'✓':index+1}</span><span><span class="stepTitle">${esc(title)}</span><span class="stepSummary">${esc(floorStepSummary(f,index))}</span></span><span class="stepChevron">›</span></button><div class="stepBody">${body}</div></section>`}
function floorNav(index){return `<div class="stepNav">${index>0?`<button class="btn ghost" data-floor-prev="${index-1}">Назад</button>`:'<span></span>'}${index<6?`<button class="btn primary" data-floor-next="${index+1}">Далее</button>`:`<button id="finishFloorBtn" class="btn primary">Готово</button>`}</div>`}
function renderFloorView(){const order=currentOrder();if(!order)return renderOrderView();const f=order.floor,calc=calculateFloor(f);const otherCover=f.cover==='other'?`<label class="wide">Название покрытия<input id="floorOtherCover" value="${esc(f.otherCover)}" placeholder="Например, инженерная доска"></label>`:'';const thickness=f.cover==='laminate'?`<label>Толщина<select id="floorThickness"><option value="standard" ${f.thickness!=='12plus'?'selected':''}>До 12 мм</option><option value="12plus" ${f.thickness==='12plus'?'selected':''}>12 мм и толще</option></select></label>`:'';const customOptions=customFloorCovers.map(x=>`<option value="custom:${x.id}" ${f.cover===`custom:${x.id}`?'selected':''}>${esc(x.name||'Своё покрытие')}</option>`).join('');const patternField=floorSupportsPatterns(f.cover)?`<label>Рисунок укладки<select id="floorPattern"><option value="straight" ${f.pattern==='straight'?'selected':''}>Прямая</option><option value="eng" ${f.pattern==='eng'?'selected':''}>Английская ёлочка</option><option value="fr" ${f.pattern==='fr'?'selected':''}>Французская ёлочка</option><option value="corner" ${f.pattern==='corner'?'selected':''}>От угла</option><option value="complex" ${f.pattern==='complex'?'selected':''}>Сложный рисунок</option><option value="other" ${f.pattern==='other'?'selected':''}>Другое</option></select></label>`:`<label>Вариант укладки<input value="Стандартная укладка" disabled></label>`;
  const step0=`<div class="grid two"><label>Покрытие<select id="floorCover"><option value="spc" ${f.cover==='spc'?'selected':''}>SPC / замковый кварцвинил</option><option value="laminate" ${f.cover==='laminate'?'selected':''}>Ламинат</option><option value="glue" ${f.cover==='glue'?'selected':''}>Клеевой кварцвинил / LVT</option><option value="linoleum" ${f.cover==='linoleum'?'selected':''}>Линолеум</option><option value="carpet" ${f.cover==='carpet'?'selected':''}>Ковролин</option>${customOptions}<option value="other" ${f.cover==='other'?'selected':''}>Другое</option></select></label>${thickness}${patternField}<label>Цена, ₽/м²<input id="floorInstallRate" class="decimal" inputmode="decimal" value="${esc(f.installRate)}" placeholder="Цена не задана"></label>${otherCover}</div>${!parseNum(f.installRate)?'<div class="backupNote">Для этой комбинации цена пока не задана. Введите её здесь или позже в «Моих ценах».</div>':''}${floorNav(0)}`;
  const step1=`<div class="grid two"><label>Площадь покрытия, м²<input id="floorArea" class="decimal" inputmode="decimal" value="${esc(f.area)}" placeholder="36,3"></label></div>${floorNav(1)}`;
  const step2=`<div class="checkline"><label class="check"><input id="floorBaseboardEnabled" type="checkbox" ${f.baseboard.enabled?'checked':''}> Нужен плинтус</label></div>${f.baseboard.enabled?`<div class="grid three" style="margin-top:10px"><label>Тип<select id="floorBaseboardType"><option value="pvc" ${f.baseboard.type==='pvc'?'selected':''}>ПВХ</option><option value="mdf" ${f.baseboard.type==='mdf'?'selected':''}>МДФ</option><option value="micro" ${f.baseboard.type==='micro'?'selected':''}>Алюминиевый микроплинтус</option><option value="duro" ${f.baseboard.type==='duro'?'selected':''}>Дюрополимер</option><option value="other" ${f.baseboard.type==='other'?'selected':''}>Другое</option></select></label><label>Периметр, м.п.<input id="floorBaseboardQty" class="decimal" inputmode="decimal" value="${esc(f.baseboard.qty)}" placeholder="24"></label><label>Цена, ₽/м.п.<input id="floorBaseboardRate" class="decimal" inputmode="decimal" value="${esc(f.baseboard.rate)}"></label></div>`:''}${floorNav(2)}`;
  const step3=`<div class="rowList">${f.demolition.length?f.demolition.map((r,i)=>genericRowHtml(r,i,'demolition')).join(''):'<div class="empty">Демонтаж не добавлен.</div>'}</div><div class="addBar"><select id="floorDemoPreset"><option value="lino">Линолеум</option><option value="laminate">Замковое покрытие без сохранения</option><option value="lockSave">Замковое покрытие с сохранением</option><option value="glue">Клеевое покрытие</option><option value="glueHard">Сложный клеевой демонтаж</option><option value="baseboardPvc">ПВХ-плинтус</option><option value="baseboardMdf">МДФ-плинтус</option><option value="underlay">Подложка</option><option value="threshold">Пороги</option><option value="other">Другое</option></select><button id="addFloorDemo" class="btn ghost">＋ Добавить</button></div>${floorNav(3)}`;
  const step4=`<div class="rowList">${f.preparation.length?f.preparation.map((r,i)=>genericRowHtml(r,i,'preparation')).join(''):'<div class="empty">Подготовка не добавлена.</div>'}</div><div class="addBar"><select id="floorPrepPreset"><option value="primer">Грунтование</option><option value="clean">Очистка поверхности</option><option value="sandLocal">Локальная шлифовка</option><option value="sandFull">Полная шлифовка</option><option value="cracks">Ремонт трещин</option><option value="repairLocal">Локальный ремонт основания</option><option value="level5">Наливной пол до 5 мм</option><option value="level10">Наливной пол 5–10 мм</option><option value="other">Другое</option></select><button id="addFloorPrep" class="btn ghost">＋ Добавить</button></div>${floorNav(4)}`;
  const step5=`<h3>Дополнительные работы</h3><div class="rowList">${f.extras.length?f.extras.map((r,i)=>genericRowHtml(r,i,'extras')).join(''):'<div class="empty">Дополнительных работ нет.</div>'}</div><div class="addBar"><select id="floorExtraPreset"><option value="seamless">Беспороговое примыкание</option><option value="protection">Защитное укрытие пола</option><option value="furniture">Перемещение мебели</option><option value="kitchen">Разборка / сборка кухни</option><option value="other">Другое</option></select><button id="addFloorExtra" class="btn ghost">＋ Добавить</button></div><details><summary>Материалы для коммерческого предложения</summary><p class="help">Не считаются доходом мастера. Добавляйте только когда клиенту нужен ориентир.</p><div class="rowList">${f.materials.length?f.materials.map((r,i)=>genericRowHtml(r,i,'materials')).join(''):'<div class="empty">Материалы не добавлены.</div>'}</div><button id="addFloorMaterial" class="btn ghost wide" style="margin-top:9px">＋ Добавить материал</button></details>${floorNav(5)}`;
  const step6=`<div class="summaryGrid"><div class="reviewSummary"><span>Работы</span><strong id="floorWorkTotal">${money(calc.workTotal)}</strong></div><div class="reviewSummary secondary"><span>Материалы для КП</span><strong id="floorMaterialTotal">${money(calc.materialTotal)}</strong></div><div class="reviewSummary secondary"><span>Площадь</span><strong>${qty(f.area||0)} м²</strong></div></div><div class="separator"></div><div class="list">${calc.rows.length?calc.rows.map(r=>`<div class="summaryLine"><span>${esc(r.name)}<small class="muted" style="display:block">${qty(r.qty)} ${esc(r.unit)} × ${money(r.price)}</small></span><strong>${money(parseNum(r.qty)*parseNum(r.price))}</strong></div>`).join(''):'<div class="empty">Работы пока не добавлены.</div>'}</div>${floorNav(6)}`;
  return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Полы</h1><p class="help">Открыт только текущий вопрос. Заполненные шаги сворачиваются в короткие строки.</p><div class="stepList">${floorStepCard(f,0,'Покрытие',step0)}${floorStepCard(f,1,'Площадь',step1)}${floorStepCard(f,2,'Плинтус',step2)}${floorStepCard(f,3,'Демонтаж',step3)}${floorStepCard(f,4,'Подготовка основания',step4)}${floorStepCard(f,5,'Дополнительные работы',step5)}${floorStepCard(f,6,'Проверка',step6)}</div><div id="autosaveStatus" class="autosave"></div></div>${editorSaveBar()}</section>`;
}

function doorCardIsOpen(index){return routeState.openDoorIndex===index}
function doorCardMeta(item){if(item.kind==='installation')return `Комплексная установка · ${qty(item.qty)} шт. × ${money(item.unitPrice)}`;if(item.kind==='opening')return `Оформление проёма · ${qty(item.qty)} ${item.unit}`;return `Отдельная работа / выезд · ${qty(item.qty)} ${item.unit}`}
function installationCard(item,index){const min=item.type==='interroom'?parseNum(rates['door.install.interroom.base']):0;const below=min&&parseNum(item.unitPrice)<min;return `<details class="doorCard" data-door-card="${index}" ${doorCardIsOpen(index)?'open':''}><summary class="doorSummary"><span class="doorSummaryText"><strong>${esc(doorTypeName(item.type))}</strong><small data-door-meta="${index}">${esc(doorCardMeta(item))}</small></span><span class="doorSummaryTotal" data-door-sum="${index}">${money(parseNum(item.qty)*parseNum(item.unitPrice))}</span></summary><div class="doorCardBody">
  <div class="grid two"><label>Количество<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="qty" value="${esc(item.qty)}"></label><label>Цена за дверь<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="unitPrice" value="${esc(item.unitPrice)}"></label>
  ${item.type==='interroom'?`<label>Доборы<select data-door-index="${index}" data-door-key="dobor"><option value="none" ${item.dobor==='none'?'selected':''}>Без доборов</option><option value="standard" ${item.dobor==='standard'?'selected':''}>С доборами</option><option value="wide" ${item.dobor==='wide'?'selected':''}>Широкий / наборный добор</option><option value="other" ${item.dobor==='other'?'selected':''}>Другое</option></select></label>${['wide','other'].includes(item.dobor)?`<label>Доплата за доборы<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="doborExtra" value="${esc(item.doborExtra)}"></label>`:''}
  <label>Замок / защёлка<select data-door-index="${index}" data-door-key="lock"><option value="latch" ${item.lock==='latch'?'selected':''}>Стандартная защёлка</option><option value="magnetic" ${item.lock==='magnetic'?'selected':''}>Магнитный замок</option><option value="none" ${item.lock==='none'?'selected':''}>Без замка</option><option value="other" ${item.lock==='other'?'selected':''}>Другое</option></select></label>${item.lock==='other'?`<label>Название замка<input data-door-index="${index}" data-door-key="lockOther" value="${esc(item.lockOther)}"></label>`:''}${['magnetic','other'].includes(item.lock)?`<label>Доплата за замок<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="lockExtra" value="${esc(item.lockExtra)}"></label>`:''}
  <label>Петли<select data-door-index="${index}" data-door-key="hinges"><option value="butterfly" ${item.hinges==='butterfly'?'selected':''}>Петли-бабочки</option><option value="mortise" ${item.hinges==='mortise'?'selected':''}>Врезные / нестандартные</option><option value="other" ${item.hinges==='other'?'selected':''}>Другое</option></select></label>${item.hinges==='other'?`<label>Название петель<input data-door-index="${index}" data-door-key="hingesOther" value="${esc(item.hingesOther)}"></label>`:''}${['mortise','other'].includes(item.hinges)?`<label>Доплата за петли<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="hingeExtra" value="${esc(item.hingeExtra)}"></label>`:''}`:''}
  <label class="wide">Комментарий<input data-door-index="${index}" data-door-key="comment" value="${esc(item.comment)}" placeholder="Необязательно"></label></div>
  ${below?`<div class="priceWarning">Цена ниже вашей минимальной ставки ${money(min)}. Это считается индивидуальной скидкой.</div>`:''}
  <div class="inlineActions"><button class="btn ghost small" data-duplicate-door="${index}">Дублировать и изменить</button>${item.priceMode==='manual'?`<button class="btn ghost small" data-door-auto="${index}">Вернуть мою цену</button>`:''}<button class="btn danger small" data-remove-door="${index}">Удалить</button></div></div></details>`}
function serviceCard(item,index){return `<details class="doorCard" data-door-card="${index}" ${doorCardIsOpen(index)?'open':''}><summary class="doorSummary"><span class="doorSummaryText"><strong>${esc(item.name||'Другая дверная работа')}</strong><small data-door-meta="${index}">${esc(doorCardMeta(item))}</small></span><span class="doorSummaryTotal" data-door-sum="${index}">${money(parseNum(item.qty)*parseNum(item.unitPrice))}</span></summary><div class="doorCardBody"><div class="grid two"><label class="wide">Название<input data-door-index="${index}" data-door-key="name" value="${esc(item.name)}"></label><label>Количество<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="qty" value="${esc(item.qty)}"></label><label>Единица<select data-door-index="${index}" data-door-key="unit">${['шт.','компл.','м.п.','участок','услуга'].map(u=>`<option ${item.unit===u?'selected':''}>${u}</option>`).join('')}</select></label><label>Цена за единицу<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="unitPrice" value="${esc(item.unitPrice)}" placeholder="Цена не задана"></label><label class="wide">Комментарий<input data-door-index="${index}" data-door-key="comment" value="${esc(item.comment)}" placeholder="Необязательно"></label></div><div class="inlineActions">${item.priceMode==='manual'&&item.rateKey?`<button class="btn ghost small" data-door-auto="${index}">Вернуть мою цену</button>`:''}<button class="btn danger small" data-remove-door="${index}">Удалить</button></div></div></details>`}
function openingCard(item,index){return `<details class="doorCard" data-door-card="${index}" ${doorCardIsOpen(index)?'open':''}><summary class="doorSummary"><span class="doorSummaryText"><strong>${esc(item.name||'Оформление проёма')}</strong><small data-door-meta="${index}">${esc(doorCardMeta(item))}</small></span><span class="doorSummaryTotal" data-door-sum="${index}">${money(parseNum(item.qty)*parseNum(item.unitPrice))}</span></summary><div class="doorCardBody"><div class="grid two"><label class="wide">Название<input data-door-index="${index}" data-door-key="name" value="${esc(item.name)}"></label><label>Количество<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="qty" value="${esc(item.qty)}"></label><label>Цена<input class="decimal" inputmode="decimal" data-door-index="${index}" data-door-key="unitPrice" value="${esc(item.unitPrice)}" placeholder="Цена вручную"></label><label class="wide">Комментарий<input data-door-index="${index}" data-door-key="comment" value="${esc(item.comment)}" placeholder="Материал проёма, способ отделки, особенности"></label></div><div class="inlineActions">${item.priceMode==='manual'&&item.rateKey?`<button class="btn ghost small" data-door-auto="${index}">Вернуть мою цену</button>`:''}<button class="btn danger small" data-remove-door="${index}">Удалить</button></div></div></details>`}
function renderDoorsView(){const order=currentOrder();if(!order)return renderOrderView();const d=order.doors,calc=calculateDoors(d);if(routeState.openDoorIndex===undefined&&d.items.length===1)routeState.openDoorIndex=0;return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Двери</h1><p class="help">Одна точка входа. Заполненные работы сворачиваются в короткие строки, отличающуюся дверь можно продублировать.</p><div class="doorList">${d.items.length?d.items.map((item,i)=>item.kind==='installation'?installationCard(item,i):item.kind==='opening'?openingCard(item,i):serviceCard(item,i)).join(''):'<div class="empty">Дверные работы пока не добавлены.</div>'}</div><button id="addDoorWorkBtn" class="btn primary wide" style="margin-top:11px">＋ Добавить дверную работу</button><div class="reviewSummary" style="margin-top:13px"><span>Стоимость дверных работ</span><strong id="doorsTotal">${money(calc.total)}</strong></div><div id="autosaveStatus" class="autosave"></div></div>${editorSaveBar()}</section>`}

function renderPurchasesView(){const order=currentOrder();if(!order)return renderOrderView();const due=orderDuePurchases(order);return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Покупки мастера</h1><p class="help">Материалы, которые мастер купил за свои деньги. Они не считаются заработком.</p><div id="purchaseRows" class="rowList">${order.purchases.length?order.purchases.map((p,i)=>`<div class="rowCard"><div class="rowGrid compact"><label>Покупка<input data-purchase-index="${i}" data-purchase-key="name" value="${esc(p.name)}" placeholder="Грунтовка, клей, лезвия…"></label><label>Сумма<input class="decimal" inputmode="decimal" data-purchase-index="${i}" data-purchase-key="amount" value="${esc(p.amount)}"></label><label>Статус<select data-purchase-index="${i}" data-purchase-key="status"><option value="due" ${p.status!=='reimbursed'?'selected':''}>К возмещению</option><option value="reimbursed" ${p.status==='reimbursed'?'selected':''}>Возмещено</option></select></label><button class="btn danger small" data-remove-purchase="${i}">×</button></div><div class="grid two" style="margin-top:8px"><label>Дата<input type="date" data-purchase-index="${i}" data-purchase-key="date" value="${esc(p.date)}"></label><label>Комментарий<input data-purchase-index="${i}" data-purchase-key="comment" value="${esc(p.comment)}" placeholder="Магазин, назначение, примечание"></label></div><div class="receiptSlot">${p.receiptData?`<div class="receiptPreview"><img src="${p.receiptData}" alt="Чек"><div><strong>Фото чека сохранено</strong><small>${esc(p.receiptName||'Изображение')}</small><button class="btn ghost small" data-remove-purchase-receipt="${i}">Удалить фото</button></div></div>`:`<label class="btn ghost small fileBtn">＋ Фото чека<input data-purchase-receipt="${i}" type="file" accept="image/*" capture="environment" hidden></label>${p.receiptMissing?'<span class="muted tiny">Фото не включалось в резервную копию.</span>':''}`}</div></div>`).join(''):'<div class="empty">Покупок пока нет.</div>'}</div><button id="addPurchaseBtn" class="btn ghost wide" style="margin-top:10px">＋ Добавить покупку</button><div class="reviewSummary ${due?'':'secondary'}" style="margin-top:13px"><span>К возмещению</span><strong id="purchasesDue">${money(due)}</strong></div><div id="autosaveStatus" class="autosave"></div></div>${editorSaveBar()}</section>`}

function expenseRowsHtml(list,scope){return list.length?list.map((raw,i)=>{const e=sanitizeExpense(raw,scope);const categories=scope==='general'?[['fuel','Бензин'],['tool','Инструмент'],['other','Прочее']]:[['worker','Оплата работнику'],['objectOther','Прочие расходы по объекту']];let extra='';if(scope==='order'&&e.category==='worker')extra=`<label>Работник<input data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="worker" value="${esc(e.worker)}" placeholder="Например, Илья"></label><label>Работа<input data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="work" value="${esc(e.work)}" placeholder="Например, укладка пола"></label><label class="wide">Комментарий<input data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="comment" value="${esc(e.comment)}" placeholder="Необязательно"></label>`;else if(scope==='order'&&e.category==='objectOther')extra=`<label class="wide">Комментарий<input data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="comment" value="${esc(e.comment)}" placeholder="На что потрачено"></label>`;else if(scope==='general'&&['tool','other'].includes(e.category))extra=`<label class="wide">${e.category==='tool'?'Что куплено':'Комментарий'}<input data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="comment" value="${esc(e.comment)}" placeholder="${e.category==='tool'?'Например, диск или инструмент':'Необязательно'}"></label>`;return `<div class="rowCard"><div class="grid two"><label>Категория<select data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="category">${categories.map(([v,n])=>`<option value="${v}" ${e.category===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Сумма<input class="decimal" inputmode="decimal" data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="amount" value="${esc(e.amount)}" placeholder="0"></label><label>Дата<input type="date" data-expense-scope="${scope}" data-expense-index="${i}" data-expense-key="date" value="${esc(e.date)}"></label>${extra}</div><button class="btn danger small" data-remove-expense-scope="${scope}" data-remove-expense="${i}">Удалить расход</button></div>`}).join(''):'<div class="empty">Расходов пока нет.</div>'}
function renderExpensesView(){const order=currentOrder();if(!order)return renderOrderView();const total=orderExpenses(order);return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Расходы по заказу</h1><p class="help">Только невозмещаемые траты, которые уменьшают вашу прибыль. Покупки клиента остаются в «Покупках мастера».</p><div class="reviewSummary"><span>Всего расходов</span><strong id="expenseTotal">${money(total)}</strong></div><div class="rowList" style="margin-top:12px">${expenseRowsHtml(order.expenses||[],'order')}</div><button id="addOrderExpenseBtn" class="btn primary wide" style="margin-top:10px">＋ Добавить расход</button><div id="autosaveStatus" class="autosave"></div></div>${editorSaveBar()}</section>`}
function renderFinancesView(){
  const saved=(()=>{try{return JSON.parse(storageGet(FINANCE_PERIOD_KEY,'{}')||'{}')}catch(e){return {}}})();
  const kind=routeState.kind||saved.kind||'last30',startDate=routeState.start||saved.start||'',endDate=routeState.end||saved.end||'';
  const range=financeRange(kind,startDate,endDate),data=financeData(range);
  const categories={},workers={},orders={};
  for(const expense of data.expenses){
    categories[expense.category]=(categories[expense.category]||0)+parseNum(expense.amount);
    if(expense.category==='worker'&&expense.worker)workers[expense.worker]=(workers[expense.worker]||0)+parseNum(expense.amount);
    const key=expense.orderId||expense.orderTitle;
    orders[key]=orders[key]||{title:expense.orderTitle,address:expense.address,received:0,spent:0};
    orders[key].spent+=parseNum(expense.amount);
  }
  for(const payment of data.payments){const key=payment.orderId||payment.orderTitle;orders[key]=orders[key]||{title:payment.orderTitle,address:payment.address,received:0,spent:0};orders[key].received+=parseNum(payment.amount)}
  return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="dashboard">← Объекты</button></div><div class="card">
    <div class="sectionTitle financeTitle"><div><h1>Финансы</h1><p class="help compact">Доход мастера считается без материалов и доставок, которые оплачивает заказчик.</p></div><button id="financePeriodBtn" class="btn ghost periodButton">${esc(range.label)} ▾</button></div>
    <div class="financeMetrics"><button class="moneyMetric primary metricButton" data-finance-jump="financeReceived"><span>Получено</span><strong>${money(data.received)}</strong></button><button class="moneyMetric metricButton" data-finance-jump="financeExpenses"><span>Расходы</span><strong>${money(data.spent)}</strong></button><button class="moneyMetric metricButton" data-finance-jump="financeOrders"><span>Чистыми</span><strong>${money(data.net)}</strong></button><div class="moneyMetric"><span>К возмещению</span><strong>${money(data.due)}</strong></div></div>
    <details id="financeOrders" open><summary>По заказам</summary><div class="summaryList">${Object.values(orders).length?Object.values(orders).sort((a,b)=>(b.received-b.spent)-(a.received-a.spent)).map(item=>`<div class="financeOrderLine"><span><strong>${esc(item.title)}</strong><small>${esc(item.address||'Без адреса')}</small></span><span><small>Получено ${money(item.received)}</small><strong>${money(item.received-item.spent)}</strong></span></div>`).join(''):'<div class="empty">Движений по заказам в этом периоде нет.</div>'}</div></details>
    <details id="financeReceived"><summary>Поступления · ${money(data.received)}</summary><div class="summaryList">${data.payments.length?data.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(pay=>`<div class="summaryLine"><span>${esc(pay.note||'Оплата работ')}<small class="muted" style="display:block">${esc(pay.orderTitle)} · ${ruDate(pay.date)}</small></span><strong>${money(pay.amount)}</strong></div>`).join(''):'<div class="empty">Поступлений нет.</div>'}</div></details>
    <details id="financeExpenses"><summary>Расходы · ${money(data.spent)}</summary><div class="summaryList">${data.expenses.length?data.expenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(expense=>`<div class="summaryLine"><span>${esc(expenseCategoryName(expense.category))}${expense.worker?` · ${esc(expense.worker)}`:''}<small class="muted" style="display:block">${esc(expense.orderTitle)} · ${ruDate(expense.date)}</small></span><strong>${money(expense.amount)}</strong></div>`).join(''):'<div class="empty">Расходов нет.</div>'}</div></details>
    <details><summary>По категориям расходов</summary><div class="summaryList">${Object.entries(categories).length?Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([key,value])=>`<div class="summaryLine"><span>${esc(expenseCategoryName(key))}</span><strong>${money(value)}</strong></div>`).join(''):'<div class="empty">Расходов в этом периоде нет.</div>'}</div></details>
    <details><summary>Работники · ${money(data.workerPaid)}</summary><div class="summaryList">${Object.entries(workers).length?Object.entries(workers).sort((a,b)=>b[1]-a[1]).map(([name,value])=>`<div class="summaryLine"><span>${esc(name)}</span><strong>${money(value)}</strong></div>`).join(''):'<div class="empty">Выплат работникам нет.</div>'}</div></details>
    <h2>Общие расходы</h2><p class="help compact">Только общие расходы мастера: бензин, инструмент и прочее. Бензин не привязывается к объектам.</p><div class="rowList">${expenseRowsHtml(generalExpenses,'general')}</div><button id="addGeneralExpenseBtn" class="btn ghost wide" style="margin-top:10px">＋ Добавить общий расход</button>
  </div></section>`;
}
function showFinancePeriodSheet(){const saved=(()=>{try{return JSON.parse(storageGet(FINANCE_PERIOD_KEY,'{}')||'{}')}catch(e){return {}}})();openSheet(`<div class="sectionTitle"><div><h1>Период</h1><p class="help compact">Как в банковском приложении: быстрый выбор или свои даты.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="periodChoices"><button class="optionCard" data-finance-kind="last30"><strong>Последние 30 дней</strong></button><button class="optionCard" data-finance-kind="month"><strong>Этот месяц</strong></button><button class="optionCard" data-finance-kind="year"><strong>Этот год</strong></button></div><div class="grid two" style="margin-top:12px"><label>С<input id="financeStart" type="date" value="${esc(saved.start||'')}"></label><label>По<input id="financeEnd" type="date" value="${esc(saved.end||today())}"></label></div><button id="applyCustomFinance" class="btn primary wide" style="margin-top:10px">Показать свой период</button>`);$$('[data-finance-kind]',$('sheetPanel')).forEach(b=>b.onclick=()=>applyFinancePeriod(b.dataset.financeKind));$('applyCustomFinance').onclick=()=>{const a=$('financeStart').value,b=$('financeEnd').value;if(!a||!b||a>b){toast('Проверьте даты периода');return}applyFinancePeriod('custom',a,b)}}
function applyFinancePeriod(kind,start='',end=''){storageSet(FINANCE_PERIOD_KEY,JSON.stringify({kind,start,end}));closeSheet();navigate('finances',{kind,start,end})}

function renderPaymentsView(){const order=currentOrder();if(!order)return renderOrderView();const work=orderWorkTotal(order),paid=orderPaid(order),remaining=orderRemaining(order);return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Оплаты</h1><p class="help">Без этапов по умолчанию. Новый платёж сразу предлагает оставшуюся сумму.</p><div class="summaryGrid"><div class="reviewSummary"><span>Работы</span><strong>${money(work)}</strong></div><div class="reviewSummary secondary"><span>Оплачено</span><strong id="paidTotal">${money(paid)}</strong></div><div class="reviewSummary secondary"><span>Осталось</span><strong id="remainingTotal">${money(remaining)}</strong></div></div>
  <h2>Платежи</h2><div class="rowList">${order.payments.length?order.payments.map((p,i)=>`<div class="rowCard"><div class="rowGrid compact"><label>Назначение<input data-payment-index="${i}" data-payment-key="note" value="${esc(p.note)}" placeholder="Оплата работ"></label><label>Сумма<input class="decimal" inputmode="decimal" data-payment-index="${i}" data-payment-key="amount" value="${esc(p.amount)}" placeholder="${esc(qty(remaining))}"></label><label>Дата<input type="date" data-payment-index="${i}" data-payment-key="date" value="${esc(p.date)}"></label><button class="btn danger small" data-remove-payment="${i}">×</button></div></div>`).join(''):'<div class="empty">Платежей пока нет.</div>'}</div><button id="addPaymentBtn" class="btn primary wide" style="margin-top:10px">＋ Добавить платёж ${remaining?money(remaining):''}</button>
  <details><summary>Этапы работ</summary><p class="help">Добавляйте только когда заказ действительно разбит на этапы.</p><div class="rowList">${order.stages.length?order.stages.map((s,i)=>`<div class="rowCard"><div class="rowGrid compact"><label>Этап<input data-stage-index="${i}" data-stage-key="name" value="${esc(s.name)}"></label><label>Сумма<input class="decimal" inputmode="decimal" data-stage-index="${i}" data-stage-key="amount" value="${esc(s.amount)}" placeholder="Сумма"></label><label>Статус<select data-stage-index="${i}" data-stage-key="paid"><option value="false" ${!s.paid?'selected':''}>Не оплачен</option><option value="true" ${s.paid?'selected':''}>Оплачен</option></select></label><button class="btn danger small" data-remove-stage="${i}">×</button></div></div>`).join(''):'<div class="empty">Этапов нет.</div>'}</div><button id="addStageBtn" class="btn ghost wide" style="margin-top:9px">＋ Добавить этап</button></details><div id="autosaveStatus" class="autosave"></div></div>${editorSaveBar()}</section>`}

function renderPhotosView(){const order=currentOrder();if(!order)return renderOrderView();return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Фото объекта</h1><p class="help">Снимайте серию без подтверждения каждого кадра или выбирайте несколько фотографий из галереи.</p><div class="photoAddActions"><button id="openCameraBtn" class="btn primary">📷 Снять серию</button><label class="btn ghost fileBtn">▧ Выбрать из галереи<input id="photoInput" type="file" accept="image/*" multiple hidden></label></div><div class="photoGrid">${order.photos.length?order.photos.map((p,i)=>`<div class="photo"><img src="${p.data||''}" alt=""><button data-remove-photo="${i}">×</button><input data-photo-index="${i}" value="${esc(p.caption||'')}" placeholder="Подпись"></div>`).join(''):'<div class="empty wide">Фотографий пока нет.</div>'}</div></div>${editorSaveBar()}</section>`}
function renderDocumentsView(){const order=currentOrder();if(!order)return renderOrderView();const history=(order.documentHistory||[]).map((h,i)=>({...h,_index:i})).reverse(),labels={proposal:'Коммерческое предложение',worklist:'Перечень выполненных работ',act:'Акт выполненных работ'};return `<section class="view"><div class="actions pageBack"><button class="btn ghost" data-go="order">← Заказ</button></div><div class="card"><h1>Документы заказа</h1><p class="help">Перед клиентским PDF можно проверить и поправить строки. Внутренние подсказки в документ не попадут.</p><div class="modules">
  <button class="module" data-doc-type="proposal"><div class="moduleTop"><span class="moduleIcon">₽</span><span class="moduleStatus">PDF</span></div><h3>Коммерческое предложение</h3><p>Работы, материалы по выбору и итог.</p></button>
  <button class="module" data-doc-type="worklist"><div class="moduleTop"><span class="moduleIcon">✓</span><span class="moduleStatus">PDF</span></div><h3>Перечень выполненных работ</h3><p>Неформальный документ без подписей.</p></button>
  <button class="module" data-doc-type="act"><div class="moduleTop"><span class="moduleIcon">▤</span><span class="moduleStatus">A4</span></div><h3>Акт выполненных работ</h3><p>Приёмка, стоимость и подписи сторон.</p></button>
  <button class="module" data-doc-type="contract"><div class="moduleTop"><span class="moduleIcon">✎</span><span class="moduleStatus">A4</span></div><h3>Договор</h3><p>Данные мастера по выбору, заказчик заполняет от руки.</p></button>
  <button class="module" id="orderPriceList"><div class="moduleTop"><span class="moduleIcon">▤</span><span class="moduleStatus">Общий</span></div><h3>Прайс-лист</h3><p>Быстрый документ из «Моих цен».</p></button>
  </div>${history.length?`<details><summary>История документов · ${history.length}</summary><div class="list" style="margin-top:10px">${history.map(h=>`<button class="historyItem" data-doc-history="${h._index}"><span><strong>${esc(labels[h.type]||'Документ')}</strong><small>${esc(ruDate(h.date))}</small></span><span>${money(h.total||0)} ›</span></button>`).join('')}</div></details>`:''}</div></section>`}

function bindRoute(){
  if(editorApplies())beginEditor();
  if($('saveEditorBtn'))$('saveEditorBtn').onclick=()=>saveEditor();
  updateEditorSaveBar();
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('[data-settings-tab]').forEach(b=>b.onclick=()=>navigate('settings',{tab:b.dataset.settingsTab}));

  if(route==='dashboard'){
    $('newObjectBtn').onclick=async()=>{const object=defaultObject();object.contact.address='';object.contact.name='';const saved=await saveObject(object);currentObjectId=saved.id;currentOrderId=saved.orders[0].id;navigate('object');toast('Новый объект создан')};
    $('quickPriceBtn').onclick=()=>showPriceListSheet();
    if($('financePeriodCard'))$('financePeriodCard').onclick=()=>navigate('finances');
    $$('[data-finance-focus]').forEach(b=>b.onclick=()=>navigate('finances',{focus:b.dataset.financeFocus}));
    $$('[data-object-id]').forEach(el=>{const open=()=>{currentObjectId=el.dataset.objectId;currentOrderId='';navigate('object')};el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  }
  if(route==='settings')bindSettings();
  if(route==='globalDocs'){
    $('openPriceList').onclick=showPriceListSheet;
  }
  if(route==='finances')bindFinancesView();
  if(route==='object')bindObjectView();
  if(route==='order')bindOrderView();
  if(route==='floor')bindFloorView();
  if(route==='doors')bindDoorsView();
  if(route==='purchases')bindPurchasesView();
  if(route==='expenses')bindExpensesView();
  if(route==='payments')bindPaymentsView();
  if(route==='photos')bindPhotosView();
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

function showObjectSummarySheet(kind){const object=currentObject();if(!object)return;const title={work:'Стоимость работ',paid:'Оплачено',remaining:'Осталось'}[kind]||'Сводка';const rows=(object.orders||[]).map(order=>{const value=kind==='paid'?orderPaid(order):kind==='remaining'?orderRemaining(order):orderWorkTotal(order);return `<div class="summaryLine"><span><strong>${esc(order.title)}</strong><small class="muted" style="display:block">${ruDate(order.date)} · ${orderStatusName(order.status)}</small></span><strong>${money(value)}</strong></div>`}).join('');openSheet(`<div class="sectionTitle"><div><h1>${title}</h1><p class="help compact">Разбивка по заказам этого объекта.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="summaryList">${rows||'<div class="empty">Нет данных.</div>'}</div>`)}
function bindObjectView(){const object=currentObject();if(!object)return;
  const fields={objectName:'name',objectPhone:'phone',objectAddress:'address',objectComment:'comment'};
  Object.entries(fields).forEach(([id,key])=>$(id).addEventListener('input',e=>{let value=e.target.value;if(key==='phone'){value=formatPhone(value);e.target.value=value}object.contact[key]=value;queueSave()}));
  $('objectStatus').onchange=e=>{object.status=e.target.value;queueSave();render()};
  $('showDiscountDocs').onchange=e=>{object.showDiscountInDocuments=e.target.checked;queueSave()};
  $$('[data-object-summary]').forEach(b=>b.onclick=()=>showObjectSummarySheet(b.dataset.objectSummary));
  $('newOrderBtn').onclick=async()=>{const order=defaultOrder(object.orders.length+1);object.orders.push(order);currentOrderId=order.id;await saveObject(object);editorState={key:'',snapshot:null,dirty:false};commitNavigate('order',{}, {scrollToId:'orderActionsCard',behavior:'smooth'});toast('Новый заказ создан')};
  $$('[data-order-id]').forEach(el=>{const open=()=>{currentOrderId=el.dataset.orderId;navigate('order')};el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  $('deleteObjectBtn').onclick=async()=>{if(!confirm('Удалить объект вместе со всеми заказами?'))return;await dbDelete(object.id);objects=objects.filter(o=>o.id!==object.id);mirrorBackup();currentObjectId='';currentOrderId='';editorState={key:'',snapshot:null,dirty:false};commitNavigate('dashboard');toast('Объект удалён')};
}
function updateOrderPricingLive(){const order=currentOrder();if(!order)return;const calculated=orderCalculatedWorkTotal(order),final=orderContractTotal(order),adjustment=final-calculated,paid=orderPaid(order);if($('calculatedWorkMetric'))$('calculatedWorkMetric').textContent=money(calculated);if($('orderWorkMetric'))$('orderWorkMetric').textContent=money(final);if($('orderRemainingMetric'))$('orderRemainingMetric').textContent=money(Math.max(0,final-paid));const label=$('pricingAdjustment');if(label){label.classList.toggle('discount',adjustment<0);label.classList.toggle('increase',adjustment>0);label.textContent=adjustment<0?`Индивидуальная скидка: ${money(Math.abs(adjustment))}`:adjustment>0?`Корректировка стоимости: +${money(adjustment)}`:'Итог совпадает с расчётом'}}
function bindOrderView(){const object=currentObject(),order=currentOrder();if(!object||!order)return;
  const map={orderTitle:'title',orderDate:'date',orderStatus:'status',orderComment:'comment'};
  Object.entries(map).forEach(([id,key])=>$(id).addEventListener($(id).tagName==='SELECT'||$(id).type==='date'?'change':'input',e=>{order[key]=e.target.value;queueSave()}));
  $('orderContractTotal').oninput=e=>{order.pricing.contractTotal=rawNum(e.target.value);queueSave();updateOrderPricingLive()};
  if($('resetContractPrice'))$('resetContractPrice').onclick=()=>{order.pricing.contractTotal='';queueSave();render()};
  $$('[data-order-summary="pricing"]').forEach(b=>b.onclick=()=>$('pricingCard')?.scrollIntoView({behavior:'smooth',block:'center'}));
  $$('[data-open-module]').forEach(b=>b.onclick=()=>navigate(b.dataset.openModule));
  $('deleteOrderBtn').onclick=async()=>{if(object.orders.length===1){toast('У объекта должен остаться хотя бы один заказ');return}if(!confirm('Удалить этот заказ?'))return;object.orders=object.orders.filter(o=>o.id!==order.id);currentOrderId=object.orders[object.orders.length-1].id;await saveObject(object);editorState={key:'',snapshot:null,dirty:false};commitNavigate('object');toast('Заказ удалён')};
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
function showAddDoorSheet(){const html=`<div class="sectionTitle"><div><h1>Добавить дверную работу</h1><p class="help compact">Сначала выберите раздел, затем конкретную работу.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="scenarioTabs" id="doorScenarioChoices"><button class="active" data-door-scenario="installation">Установка</button><button data-door-scenario="service">Обслуживание</button><button data-door-scenario="opening">Проём</button></div><div id="doorScenarioPanel" class="scenarioPanel"></div>`;openSheet(html);let scenario='installation';const lists={installation:{title:'Установка двери',help:'Выберите тип новой двери.',items:[['interroom','Межкомнатная дверь','Базовая установка 6 000 ₽'],['sliding','Откатная дверь','Вдоль стены'],['pocket','Дверь-пенал','Полотно уходит в стену'],['double','Двустворчатая дверь','Два полотна'],['hidden','Скрытая распашная дверь','Алюминиевая коробка'],['entrance','Входная дверь','Цена вручную'],['other','Другое','Своя дверь']]},service:{title:'Обслуживание и доработка',help:'Работы по уже установленной двери.',items:[['latch','Установка простой защёлки','1 500 ₽'],['magnetic','Установка магнитного замка','2 500 ₽'],['trim','Замена телескопических наличников','2 000 ₽'],['adjustment','Регулировка двери','3 000 ₽'],['limiter','Установка ограничителя','500 ₽'],['dobor','Замена доборов','2 000 ₽'],['demo','Демонтаж старой двери','1 500 ₽'],['other','Другое','Своя работа']]},opening:{title:'Оформление проёма',help:'Портал или оформление входного проёма.',items:[['portal','Обычный портал','Цена вручную'],['entrancePortal','Проём входной двери','Ориентир 5 000 ₽'],['other','Другое','Нестандартный проём']]}};const renderScenario=()=>{const panel=$('doorScenarioPanel'),data=lists[scenario];panel.innerHTML=`<div class="scenarioHeading"><h2>${data.title}</h2><p>${data.help}</p></div><div class="scenarioList">${data.items.map(([v,n,sub])=>`<button class="workChoice" data-add-door-kind="${scenario}" data-add-door-value="${v}"><span><strong>${n}</strong><small>${sub}</small></span><span class="arrow">›</span></button>`).join('')}</div>`;panel.scrollTop=0;$$('[data-add-door-kind]',panel).forEach(b=>b.onclick=()=>{const order=currentOrder();if(!order)return;let item;if(b.dataset.addDoorKind==='installation')item=defaultDoorInstallation(b.dataset.addDoorValue);else if(b.dataset.addDoorKind==='service')item=doorServicePreset(b.dataset.addDoorValue);else item=doorOpeningPreset(b.dataset.addDoorValue);if(item.kind==='installation'&&item.type==='other'){item.type='other';item.unitPrice='';item.priceMode='manual'}order.doors.items.push(item);order.doors.completed=true;routeState.openDoorIndex=order.doors.items.length-1;queueSave();closeSheet();render()})};$$('[data-door-scenario]',$('sheetPanel')).forEach(b=>b.onclick=()=>{scenario=b.dataset.doorScenario;$$('[data-door-scenario]',$('sheetPanel')).forEach(x=>x.classList.toggle('active',x===b));renderScenario();$('sheetPanel').scrollTo({top:0,behavior:'auto'})});renderScenario()}

function bindPurchasesView(){const order=currentOrder();if(!order)return;
  $$('[data-purchase-index]').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const p=order.purchases[+el.dataset.purchaseIndex],key=el.dataset.purchaseKey;if(!p)return;p[key]=key==='amount'?rawNum(el.value):el.value;if($('purchasesDue'))$('purchasesDue').textContent=money(orderDuePurchases(order));queueSave()}));
  $$('[data-remove-purchase]').forEach(b=>b.onclick=()=>{order.purchases.splice(+b.dataset.removePurchase,1);queueSave();render()});
  $$('[data-purchase-receipt]').forEach(input=>input.onchange=async e=>{const file=e.target.files?.[0],purchase=order.purchases[+input.dataset.purchaseReceipt];e.target.value='';if(!file||!purchase)return;try{purchase.receiptData=await compressImage(file);purchase.receiptName=file.name;purchase.receiptMissing=false;queueSave();render();toast('Фото чека сохранено')}catch(err){console.error(err);toast('Не удалось обработать фото чека')}});
  $$('[data-remove-purchase-receipt]').forEach(b=>b.onclick=()=>{const purchase=order.purchases[+b.dataset.removePurchaseReceipt];if(!purchase)return;purchase.receiptData='';purchase.receiptName='';purchase.receiptMissing=false;queueSave();render()});
  $('addPurchaseBtn').onclick=()=>{order.purchases.push(normalizePurchase({name:'',amount:'',date:today(),status:'due'}));queueSave();render();setTimeout(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}),20)};
}
function bindExpenseRows(scope,list){$$(`[data-expense-scope="${scope}"]`).forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const item=list[+el.dataset.expenseIndex];if(!item)return;const key=el.dataset.expenseKey;item[key]=key==='amount'?rawNum(el.value):el.value;if(key==='category'){sanitizeExpense(item,scope);if(scope==='general')saveGeneralExpenses();else queueSave();render();return}sanitizeExpense(item,scope);if(scope==='general')saveGeneralExpenses();else queueSave();if($('expenseTotal'))$('expenseTotal').textContent=money(orderExpenses(currentOrder()))}));$$(`[data-remove-expense-scope="${scope}"]`).forEach(b=>b.onclick=()=>{list.splice(+b.dataset.removeExpense,1);if(scope==='general')saveGeneralExpenses();else queueSave();render()})}
function bindExpensesView(){const order=currentOrder();if(!order)return;bindExpenseRows('order',order.expenses);$('addOrderExpenseBtn').onclick=()=>{order.expenses.push(normalizeExpense({category:'worker',date:today()},'order'));queueSave();render();requestAnimationFrame(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}))}}
function bindFinancesView(){const saved=(()=>{try{return JSON.parse(storageGet(FINANCE_PERIOD_KEY,'{}')||'{}')}catch(e){return {}}})();$('financePeriodBtn').onclick=showFinancePeriodSheet;bindExpenseRows('general',generalExpenses);$('addGeneralExpenseBtn').onclick=()=>{generalExpenses.push(normalizeExpense({category:'fuel',date:today()},'general'));saveGeneralExpenses();render();requestAnimationFrame(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}))};$$('[data-finance-jump]').forEach(b=>b.onclick=()=>$(b.dataset.financeJump)?.scrollIntoView({behavior:'smooth',block:'start'}));if(routeState.focus){requestAnimationFrame(()=>{const target={received:'financeReceived',expenses:'financeExpenses',net:'financeOrders'}[routeState.focus];if(target)$(target)?.scrollIntoView({behavior:'smooth',block:'start'})})}}
function bindPaymentsView(){const order=currentOrder();if(!order)return;
  $$('[data-payment-index]').forEach(el=>el.addEventListener(el.type==='date'?'change':'input',()=>{const p=order.payments[+el.dataset.paymentIndex],key=el.dataset.paymentKey;if(!p)return;p[key]=key==='amount'?rawNum(el.value):el.value;updatePaymentLive();queueSave()}));
  $$('[data-remove-payment]').forEach(b=>b.onclick=()=>{order.payments.splice(+b.dataset.removePayment,1);queueSave();render()});
  $('addPaymentBtn').onclick=()=>{const remaining=orderRemaining(order);order.payments.push(normalizePayment({amount:remaining?String(Math.round(remaining*100)/100):'',date:today(),note:'Оплата работ'}));queueSave();render();setTimeout(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}),20)};
  $$('[data-stage-index]').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>{const s=order.stages[+el.dataset.stageIndex],key=el.dataset.stageKey;if(!s)return;s[key]=key==='paid'?el.value==='true':key==='amount'?rawNum(el.value):el.value;queueSave()}));
  $$('[data-remove-stage]').forEach(b=>b.onclick=()=>{order.stages.splice(+b.dataset.removeStage,1);queueSave();render()});
  $('addStageBtn').onclick=()=>{order.stages.push(normalizeStage({name:`Этап ${order.stages.length+1}`,amount:'',date:today(),paid:false}));queueSave();render()};
}
function updatePaymentLive(){const order=currentOrder();if(!order)return;if($('paidTotal'))$('paidTotal').textContent=money(orderPaid(order));if($('remainingTotal'))$('remainingTotal').textContent=money(orderRemaining(order))}
async function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.76))};img.onerror=reject;img.src=url})}
function openCameraBurst(){const order=currentOrder();if(!order)return;if(!navigator.mediaDevices?.getUserMedia){$('photoInput')?.click();return}let stream=null,frames=[];const stop=()=>{if(stream)stream.getTracks().forEach(t=>t.stop());stream=null};openSheet(`<div class="cameraSheet"><div class="sectionTitle"><div><h1>Серия фото</h1><p class="help compact">Камера останется открытой после каждого кадра.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="cameraViewport"><video id="burstVideo" playsinline muted autoplay></video><div id="cameraLoading" class="cameraLoading">Открываем камеру…</div></div><div class="cameraControls"><button id="burstCapture" class="cameraShutter" disabled aria-label="Сделать фото"></button></div><div id="burstStrip" class="burstStrip"></div><button id="burstAdd" class="btn primary wide" disabled>Добавить фото</button></div>`,stop);const video=$('burstVideo'),capture=$('burstCapture'),add=$('burstAdd'),strip=$('burstStrip');const drawStrip=()=>{strip.innerHTML=frames.map((src,i)=>`<div class="burstThumb"><img src="${src}" alt=""><button data-burst-remove="${i}">×</button></div>`).join('');add.disabled=!frames.length;add.textContent=frames.length?`Добавить ${frames.length} фото`:'Добавить фото';$$('[data-burst-remove]',strip).forEach(b=>b.onclick=()=>{frames.splice(+b.dataset.burstRemove,1);drawStrip()})};navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(media=>{stream=media;video.srcObject=media;video.onloadedmetadata=()=>{video.play().catch(()=>{});capture.disabled=false;if($('cameraLoading'))$('cameraLoading').hidden=true}}).catch(err=>{console.error(err);closeSheet();toast('Не удалось открыть камеру');$('photoInput')?.click()});capture.onclick=()=>{if(!video.videoWidth||!video.videoHeight)return;const max=1400,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);frames.push(canvas.toDataURL('image/jpeg',.76));drawStrip()};add.onclick=()=>{if(!frames.length)return;for(const data of frames)order.photos.push({id:uid(),data,caption:''});queueSave();closeSheet();render();toast(`Добавлено фото: ${frames.length}`)}}
function bindPhotosView(){const order=currentOrder();if(!order)return;
  $('openCameraBtn').onclick=()=>openCameraBurst();
  $('photoInput').onchange=async e=>{for(const file of [...e.target.files]){try{order.photos.push({id:uid(),data:await compressImage(file),caption:''})}catch(err){toast('Не удалось обработать фото')}}e.target.value='';queueSave();render()};
  $$('[data-photo-index]').forEach(el=>el.oninput=()=>{order.photos[+el.dataset.photoIndex].caption=el.value;queueSave()});
  $$('[data-remove-photo]').forEach(b=>b.onclick=()=>{order.photos.splice(+b.dataset.removePhoto,1);queueSave();render()});
}
function bindDocumentsView(){
  $$('[data-doc-type]').forEach(b=>b.onclick=()=>openDocumentOptions(b.dataset.docType));
  $('orderPriceList').onclick=showPriceListSheet;
  $$('[data-doc-history]').forEach(b=>b.onclick=()=>{const h=currentOrder()?.documentHistory?.[+b.dataset.docHistory];if(h)buildOrderDocument(h.type,(h.snapshot||[]).map(clone),h.options||{})});
}

function orderDocumentRows(order,{includeMaterials=false,procurement='none',procurementPrice=''}={}){const f=calculateFloor(order.floor),d=calculateDoors(order.doors);const rows=[...f.rows,...d.rows];if(includeMaterials)rows.push(...f.materials);if(procurement==='include'&&parseNum(procurementPrice)>0)rows.push(normalizeGenericRow({name:'Организация закупки материалов',qty:'1',unit:'услуга',price:procurementPrice,group:'Дополнительные услуги',kind:'work'},'Дополнительные услуги'));return rows.map(r=>({...clone(r),id:r.id||uid()}))}
function openDocumentOptions(type){const order=currentOrder();if(!order)return;if(type==='contract'){showContractOptions(order);return}
  if(type==='proposal'){
    openSheet(`<div class="sectionTitle"><div><h1>Коммерческое предложение</h1><p class="help compact">Выберите состав документа.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="grid two"><label>Что включить<select id="proposalMaterials"><option value="work">Только работы</option><option value="materials">Работы + материалы из расчёта</option></select></label><label>Организация закупки<select id="proposalProcurement"><option value="none">Не показывать</option><option value="recommend">Предложить отдельно</option><option value="include">Включить в расчёт</option></select></label><label>Цена организации закупки<input id="proposalProcurementPrice" class="decimal" inputmode="decimal" placeholder="Цена"></label></div><div class="actions end"><button id="startProposalReview" class="btn primary">Проверить расчёт</button></div>`);
    $('startProposalReview').onclick=()=>{const options={includeMaterials:$('proposalMaterials').value==='materials',procurement:$('proposalProcurement').value,procurementPrice:$('proposalProcurementPrice').value};const rows=orderDocumentRows(order,options);closeSheet();openReviewSheet('proposal',rows,options)};return;
  }
  if(type==='act'){
    openSheet(`<div class="sectionTitle"><div><h1>Акт выполненных работ</h1><p class="help compact">Выберите количество экземпляров, затем проверьте перечень.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="grid two"><label>Экземпляры<select id="actCopies"><option value="1">1 экземпляр</option><option value="2">2 экземпляра</option></select></label></div><div class="actions end"><button id="startActReview" class="btn primary">Проверить акт</button></div>`);
    $('startActReview').onclick=()=>{const rows=orderDocumentRows(order,{}),options={copies:+$('actCopies').value};closeSheet();openReviewSheet(type,rows,options)};return;
  }
  const rows=orderDocumentRows(order,{});openReviewSheet(type,rows,{});
}
function reviewRowHtml(row,index){const guide=rateGuide(row);return `<div class="rowCard"><div class="rowGrid"><label>Наименование<input data-review-index="${index}" data-review-key="name" value="${esc(row.name)}"></label><label>Кол-во<input class="decimal" inputmode="decimal" data-review-index="${index}" data-review-key="qty" value="${esc(row.qty)}"></label><label>Ед.<select data-review-index="${index}" data-review-key="unit">${['шт.','м²','м.п.','компл.','участок','час','услуга','л','кг'].map(u=>`<option ${u===row.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Цена<input class="decimal" inputmode="decimal" data-review-index="${index}" data-review-key="price" value="${esc(row.price)}"></label><button class="btn danger small" data-remove-review="${index}">×</button></div><div class="priceGuide"><strong data-review-sum="${index}">${money(parseNum(row.qty)*parseNum(row.price))}</strong><span class="guideBadge ${guide.cls}">${esc(guide.label)}</span><span class="muted">${esc(guide.detail)}</span></div></div>`}
function openReviewSheet(type,rows,options){reviewRows=rows;documentContext={type,options};renderReviewSheet()}
function renderReviewSheet(){const title={proposal:'Проверка коммерческого предложения',worklist:'Проверка перечня работ',act:'Проверка акта'}[documentContext.type]||'Проверка расчёта';const order=currentOrder(),calc=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),raw=order?.pricing?.contractTotal,contract=raw===undefined||raw===null||String(raw).trim()===''?calc:parseNum(raw),adj=contract-calc;openSheet(`<div class="sectionTitle"><div><h1>${title}</h1><p class="help compact">Подсказки мастера не попадут в PDF.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div id="reviewRows" class="rowList">${reviewRows.length?reviewRows.map(reviewRowHtml).join(''):'<div class="empty">Позиции не добавлены.</div>'}</div><button id="addReviewRow" class="btn ghost wide" style="margin-top:9px">＋ Добавить работу</button><div class="documentReviewTotals"><div><span>Расчёт по позициям</span><strong id="reviewTotal">${money(calc)}</strong></div><div><span>Договорная стоимость работ</span><strong id="reviewContractTotal">${money(contract)}</strong></div><small id="reviewAdjustment">${adj<0?`Индивидуальная скидка ${money(Math.abs(adj))}`:adj>0?`Корректировка +${money(adj)}`:'Без корректировки'}</small></div><div class="actions end"><button id="generateReviewedDoc" class="btn primary">Сформировать документ</button></div>`);
  const refreshTotals=()=>{const calcNow=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),rawNow=order?.pricing?.contractTotal,contractNow=rawNow===undefined||rawNow===null||String(rawNow).trim()===''?calcNow:parseNum(rawNow),adjNow=contractNow-calcNow;$('reviewTotal').textContent=money(calcNow);$('reviewContractTotal').textContent=money(contractNow);$('reviewAdjustment').textContent=adjNow<0?`Индивидуальная скидка ${money(Math.abs(adjNow))}`:adjNow>0?`Корректировка +${money(adjNow)}`:'Без корректировки'};
  $$('[data-review-index]',$('sheetPanel')).forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const row=reviewRows[+el.dataset.reviewIndex],key=el.dataset.reviewKey;row[key]=['qty','price'].includes(key)?rawNum(el.value):el.value;const sum=$('sheetPanel').querySelector(`[data-review-sum="${el.dataset.reviewIndex}"]`);if(sum)sum.textContent=money(parseNum(row.qty)*parseNum(row.price));refreshTotals()}));
  $$('[data-remove-review]',$('sheetPanel')).forEach(b=>b.onclick=()=>{reviewRows.splice(+b.dataset.removeReview,1);renderReviewSheet()});
  $('addReviewRow').onclick=()=>{reviewRows.push(normalizeGenericRow({name:'',qty:'1',unit:'шт.',price:'',group:'Дополнительные работы'},'Дополнительные работы'));renderReviewSheet()};
  $('generateReviewedDoc').onclick=async()=>{const {type}=documentContext,order=currentOrder(),object=currentObject(),options={...(documentContext.options||{}),contractTotal:order?.pricing?.contractTotal??'',showDiscount:object?.showDiscountInDocuments!==false};closeSheet();buildOrderDocument(type,reviewRows,options);if(order){const calcWork=reviewRows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),contractWork=String(options.contractTotal).trim()===''?calcWork:parseNum(options.contractTotal),materialTotal=reviewRows.filter(r=>r.kind==='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0);order.documentHistory.push({id:uid(),type,date:now(),total:contractWork+materialTotal,snapshot:reviewRows.map(clone),options:clone(options)});await saveObject(currentObject());editorState.snapshot=clone(currentObject())}}
}
function groupedRowsTable(rows,{hideWorkPrices=false}={}){const groups=[];for(const row of rows)if(!groups.includes(row.group||'Работы'))groups.push(row.group||'Работы');return groups.map(group=>`<tr class="group"><td colspan="5">${esc(group)}</td></tr>`+rows.filter(r=>(r.group||'Работы')===group).map(r=>{const hide=hideWorkPrices&&r.kind!=='material';return `<tr><td>${esc(r.name)}${r.comment?`<br><small>${esc(r.comment)}</small>`:''}</td><td>${qty(r.qty)}</td><td>${esc(r.unit)}</td><td>${hide?'—':money(r.price)}</td><td>${hide?'—':money(parseNum(r.qty)*parseNum(r.price))}</td></tr>`}).join('')).join('')}
function paperHeader(title,{slogan=false}={}){return `<div class="paperBrand">FRAME</div><div class="paperTag">Design. Build. Finish.</div>${slogan?`<div class="paperSlogan"><strong>Работаем сами. Отвечаем лично.</strong><span>Без посредников и передачи заказа на сторону.</span></div>`:''}<div class="paperHero"><h1>${esc(title)}</h1></div>`}
function infoGrid(items){return `<div class="paperInfo">${items.filter(x=>x[1]).map(([l,v])=>`<div><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`}
function buildOrderDocument(type,rows,options={}){const object=currentObject(),order=currentOrder();if(!object||!order)return;const calculatedWork=rows.filter(r=>r.kind!=='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),materialTotal=rows.filter(r=>r.kind==='material').reduce((s,r)=>s+parseNum(r.qty)*parseNum(r.price),0),rawContract=options.contractTotal!==undefined?options.contractTotal:order.pricing?.contractTotal,contractWork=rawContract===undefined||rawContract===null||String(rawContract).trim()===''?calculatedWork:Math.max(0,parseNum(rawContract)),adjustment=contractWork-calculatedWork,showDiscount=options.showDiscount!==undefined?options.showDiscount:object.showDiscountInDocuments!==false,total=contractWork+materialTotal,hideWorkPrices=!showDiscount&&Math.abs(adjustment)>.009;const titles={proposal:'Коммерческое предложение',worklist:'Перечень выполненных работ',act:'Акт выполненных работ'};let html=paperHeader(titles[type]||'Документ',{slogan:type==='proposal'});html+=infoGrid([['Заказчик',object.contact.name],['Телефон',formatPhone(object.contact.phone)],['Адрес объекта',object.contact.address],['Заказ',order.title],['Дата',ruDate(order.date||today())]]);html+=`<h2>Работы и услуги</h2>${hideWorkPrices?'<p class="paperNote compactNote">Цены по отдельным работам не выводятся. Ниже указана согласованная итоговая стоимость.</p>':''}<div class="paperTableWrap"><table><colgroup><col class="col-name"><col class="col-qty"><col class="col-unit"><col class="col-price"><col class="col-sum"></colgroup><thead><tr><th>Наименование</th><th>Кол.</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${groupedRowsTable(rows,{hideWorkPrices})}</tbody></table></div>`;
  const adjustmentHtml=showDiscount&&adjustment<-.009?`<div><span>Расчётная стоимость работ</span><strong>${money(calculatedWork)}</strong></div><div><span>Индивидуальная скидка</span><strong>− ${money(Math.abs(adjustment))}</strong></div>`:showDiscount&&adjustment>.009?`<div><span>Расчётная стоимость работ</span><strong>${money(calculatedWork)}</strong></div><div><span>Корректировка стоимости</span><strong>+ ${money(adjustment)}</strong></div>`:'';
  if(type==='proposal')html+=`<div class="paperTotal">${adjustmentHtml}<div><span>Стоимость работ</span><strong>${money(contractWork)}</strong></div>${materialTotal?`<div><span>Материалы для заказчика</span><strong>${money(materialTotal)}</strong></div>`:''}<div class="grand"><span>Итого</span><strong>${money(total)}</strong></div></div>${options.procurement==='recommend'?`<div class="paperAlso"><strong>Организация закупки материалов</strong><p>Подбор, согласование и организация приобретения материалов. Ориентировочная стоимость услуги ${money(options.procurementPrice)}. Материалы и доставка оплачиваются отдельно.</p></div>`:''}<p class="paperNote">Расчёт составлен по указанному объёму и условиям. Дополнительные или скрытые работы выполняются только после согласования с заказчиком.</p>`;
  if(type==='worklist')html+=`<div class="paperTotal">${adjustmentHtml}<div class="grand"><span>Итого выполненных работ</span><strong>${money(contractWork)}</strong></div></div><p class="paperNote">Перечень отражает фактически выполненный объём и согласованную стоимость работ по объекту.</p>`;
  if(type==='act')html+=`<div class="paperTotal">${adjustmentHtml}<div class="grand"><span>Стоимость принятых работ</span><strong>${money(contractWork)}</strong></div></div><p class="paperNote">Заказчик подтверждает, что перечисленные работы выполнены в полном объёме, результат принят, претензий по объёму и качеству работ не имеется. При наличии замечаний они указываются ниже до подписания акта.</p><div class="blankLines"><div class="blankLine"><span>Заказчик, ФИО</span><span></span></div><div class="blankLine"><span>Замечания</span><span></span></div></div><div class="signature"><div>Исполнитель / подпись</div><div>Заказчик / подпись</div></div>`;
  if(type==='act'&&parseNum(options.copies)>1){const one=html;html=Array.from({length:parseNum(options.copies)},(_,i)=>`<section class="printCopy">${one}<p class="paperNote">Экземпляр ${i+1} из ${options.copies}</p></section>`).join('<div style="break-after:page"></div>')}
  showPaper(html);
}
function showContractOptions(order){const hasPrivate=profile.passportSeries||profile.passportNumber||profile.registrationAddress;openSheet(`<div class="sectionTitle"><div><h1>Договор</h1><p class="help compact">Заказчик заполняет свои реквизиты от руки.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="grid two"><label>Данные мастера<select id="contractMasterMode"><option value="blank">Оставить пустыми</option><option value="profile" ${hasPrivate?'':'disabled'}>Подставить мои данные</option></select></label><label>Дата<select id="contractDateMode"><option value="today">Сегодняшняя</option><option value="blank">Оставить пустой</option></select></label>${order?`<label>Объект и работы<select id="contractOrderMode"><option value="include">Подставить из заказа</option><option value="blank">Оставить пустыми</option></select></label>`:''}<label>Экземпляры<select id="contractCopies"><option value="1">1 экземпляр</option><option value="2">2 экземпляра</option></select></label></div>${!hasPrivate?'<div class="backupNote">Паспортные данные не заполнены. Договор всё равно сформируется с пустыми строками мастера.</div>':''}<div class="actions end"><button id="generateContractBtn" class="btn primary">Сформировать договор</button></div>`);$('generateContractBtn').onclick=()=>{const options={masterMode:$('contractMasterMode').value,dateMode:$('contractDateMode').value,orderMode:order&&$('contractOrderMode')?$('contractOrderMode').value:'blank',copies:+$('contractCopies').value};closeSheet();buildContract(order,options)}}
function blankOr(value,enabled){return enabled&&value?esc(value):'&nbsp;'}
function buildContract(order,options){const object=order?currentObject():null,includeMaster=options.masterMode==='profile',includeOrder=!!order&&options.orderMode==='include',date=options.dateMode==='today'?ruDate(today()):'________________';const fio=blankOr(profileFullName(),includeMaster),passport=includeMaster&&profile.passportSeries&&profile.passportNumber?`${esc(profile.passportSeries)} ${esc(profile.passportNumber)}`:'&nbsp;',issued=blankOr(profile.passportIssuedBy,includeMaster),issuedDate=includeMaster&&profile.passportIssuedDate?ruDate(profile.passportIssuedDate):'&nbsp;',code=blankOr(profile.passportCode,includeMaster),registration=blankOr(profile.registrationAddress,includeMaster),phone=blankOr(formatPhone(profile.phone),includeMaster);const work=order?orderWorkTotal(order):0,calculated=order?orderCalculatedWorkTotal(order):0,adjustment=work-calculated,showDiscount=object?.showDiscountInDocuments!==false;const workRows=order?[...calculateFloor(order.floor).rows,...calculateDoors(order.doors).rows]:[];const list=includeOrder&&workRows.length?`<ol>${workRows.map(r=>`<li>${esc(r.name)} · ${qty(r.qty)} ${esc(r.unit)}</li>`).join('')}</ol>`:`<div class="blankLines"><div class="blankLine"><span>Перечень работ</span><span></span></div><div class="blankLine"><span></span><span></span></div><div class="blankLine"><span></span><span></span></div></div>`;const one=`${paperHeader('Договор на выполнение работ')}<p style="text-align:right">г. ${esc(profile.city||'____________')} · ${date}</p><div class="contractText"><p><strong>Исполнитель</strong> ${fio} и <strong>Заказчик</strong> __________________________________________ заключили настоящий договор о нижеследующем.</p><h2>1. Предмет договора</h2><p>Исполнитель обязуется выполнить согласованные работы, а Заказчик принять результат и произвести оплату.</p>${includeOrder&&object?infoGrid([['Адрес объекта',object.contact.address],['Заказ',order.title],['Согласованная стоимость',work?money(work):'']]):''}${list}<h2>2. Стоимость и порядок оплаты</h2><p>Стоимость работ определяется согласованным перечнем и объёмом. Работы, не включённые в первоначальный перечень, выполняются после отдельного согласования стоимости.</p><div class="blankLines">${includeOrder&&showDiscount&&adjustment<-.009?`<div class="blankLine"><span>Расчётная стоимость</span><span>${money(calculated)}</span></div><div class="blankLine"><span>Индивидуальная скидка</span><span>− ${money(Math.abs(adjustment))}</span></div>`:includeOrder&&showDiscount&&adjustment>.009?`<div class="blankLine"><span>Расчётная стоимость</span><span>${money(calculated)}</span></div><div class="blankLine"><span>Корректировка</span><span>+ ${money(adjustment)}</span></div>`:``}<div class="blankLine"><span>Стоимость работ</span><span>${includeOrder&&work?money(work):''}</span></div><div class="blankLine"><span>Порядок оплаты</span><span></span></div></div><h2>3. Сроки и условия</h2><p>Срок начала и завершения работ, доступ на объект, материалы и иные условия согласовываются сторонами. Обстоятельства, обнаруженные после начала работ и влияющие на объём или технологию, фиксируются и согласовываются отдельно.</p><h2>4. Сдача и приёмка</h2><p>После завершения работ стороны подписывают акт. Замечания при наличии указываются до подписания акта.</p><h2>5. Реквизиты сторон</h2><div class="grid two"><div><strong>Исполнитель</strong><div class="blankLines"><div class="blankLine"><span>ФИО</span><span>${fio}</span></div><div class="blankLine"><span>Паспорт</span><span>${passport}</span></div><div class="blankLine"><span>Выдан</span><span>${issued}</span></div><div class="blankLine"><span>Дата выдачи</span><span>${issuedDate}</span></div><div class="blankLine"><span>Код</span><span>${code}</span></div><div class="blankLine"><span>Регистрация</span><span>${registration}</span></div><div class="blankLine"><span>Телефон</span><span>${phone}</span></div></div></div><div><strong>Заказчик</strong><div class="blankLines"><div class="blankLine"><span>ФИО</span><span></span></div><div class="blankLine"><span>Паспорт</span><span></span></div><div class="blankLine"><span>Выдан</span><span></span></div><div class="blankLine"><span>Дата выдачи</span><span></span></div><div class="blankLine"><span>Код</span><span></span></div><div class="blankLine"><span>Регистрация</span><span></span></div><div class="blankLine"><span>Телефон</span><span></span></div></div></div></div><div class="signature"><div>Исполнитель / подпись</div><div>Заказчик / подпись</div></div></div>`;showPaper(Array.from({length:options.copies||1},(_,i)=>`<section class="printCopy">${one}${options.copies>1?`<p class="paperNote">Экземпляр ${i+1} из ${options.copies}</p>`:''}</section>`).join('<div style="break-after:page"></div>'))}

function showPriceListSheet(){const saved=(()=>{try{return JSON.parse(storageGet('framePriceSectionsV180','{}')||'{}')}catch(e){return {}}})();const sections={floorCover:saved.floorCover!==false,floorBaseboard:!!saved.floorBaseboard,floorPrep:!!saved.floorPrep,doorsInstall:!!saved.doorsInstall,doorsService:!!saved.doorsService,doorsOpening:!!saved.doorsOpening};openSheet(`<div class="sectionTitle"><div><h1>Прайс-лист</h1><p class="help compact">Отметьте направления, по которым нужны подробные цены. Общий перечень работ добавится автоматически.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><h3>Полы</h3><div class="checkline"><label class="check"><input data-price-section="floorCover" type="checkbox" ${sections.floorCover?'checked':''}> Напольные покрытия</label><label class="check"><input data-price-section="floorBaseboard" type="checkbox" ${sections.floorBaseboard?'checked':''}> Плинтусы</label><label class="check"><input data-price-section="floorPrep" type="checkbox" ${sections.floorPrep?'checked':''}> Подготовка и демонтаж</label></div><h3>Двери</h3><div class="checkline"><label class="check"><input data-price-section="doorsInstall" type="checkbox" ${sections.doorsInstall?'checked':''}> Установка дверей</label><label class="check"><input data-price-section="doorsService" type="checkbox" ${sections.doorsService?'checked':''}> Обслуживание</label><label class="check"><input data-price-section="doorsOpening" type="checkbox" ${sections.doorsOpening?'checked':''}> Проёмы</label></div><div class="actions end"><button id="generatePriceList" class="btn primary">Сформировать PDF</button></div>`);$('generatePriceList').onclick=()=>{const selected={};$$('[data-price-section]',$('sheetPanel')).forEach(x=>selected[x.dataset.priceSection]=x.checked);if(!Object.values(selected).some(Boolean)){toast('Выберите хотя бы один раздел');return}storageSet('framePriceSectionsV180',JSON.stringify(selected));closeSheet();buildPriceList(selected)}}
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
function showPaper(html){$('paper').innerHTML=html;$('documentView').classList.remove('hidden');$('documentView').classList.add('preparing');const ready=document.fonts?.ready||Promise.resolve();ready.then(()=>requestAnimationFrame(()=>{fitPaperPreview();$('documentView').classList.remove('preparing')}));$('documentView').scrollTo({left:0,top:0,behavior:'auto'})}

function exportBackup(){const includePrivate=storageGet(EXPORT_PRIVATE_KEY,'0')==='1';const safeProfile=clone(profile);if(!includePrivate)for(const key of ['passportSeries','passportNumber','passportIssuedBy','passportIssuedDate','passportCode','registrationAddress'])safeProfile[key]='';const data={format:'FRAME_BACKUP',version:VERSION,exportedAt:now(),profile:safeProfile,rates,customFloorCovers,generalExpenses,objects:objects.map(stripPhotos),privateDataIncluded:includePrivate};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`FRAME-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Резервная копия подготовлена')}
async function handleImportFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const data=JSON.parse(await file.text()),arr=Array.isArray(data)?data:data.objects;if(!Array.isArray(arr))throw new Error('objects');importCandidate={objects:arr.map(normalizeObject),rates:data.rates&&typeof data.rates==='object'?data.rates:null,profile:data.profile&&typeof data.profile==='object'?data.profile:null,customFloorCovers:Array.isArray(data.customFloorCovers)?data.customFloorCovers.map(normalizeCustomFloorCover):null,generalExpenses:Array.isArray(data.generalExpenses)?data.generalExpenses.map(e=>normalizeExpense(e,'general')):null};showImportPreview()}catch(e){console.error(e);toast('Не удалось прочитать резервную копию')}}
function showImportPreview(){if(!importCandidate)return;const conflicts=importCandidate.objects.filter(x=>objects.some(o=>o.id===x.id)).length;openSheet(`<div class="sectionTitle"><div><h1>Импорт FRAME</h1><p class="help compact">Проверьте состав перед записью.</p></div><button class="btn ghost small" data-close-sheet>Закрыть</button></div><div class="stats"><div class="stat"><span>Объекты</span><strong>${importCandidate.objects.length}</strong></div><div class="stat"><span>Совпадения ID</span><strong>${conflicts}</strong></div><div class="stat"><span>Цены</span><strong>${importCandidate.rates?'Есть':'Нет'}</strong></div></div><div class="backupNote">«Добавить как новые» сохранит текущие данные и выдаст импортированным объектам новые идентификаторы. «Обновить совпадающие» заменит только объекты с теми же ID после вашего явного подтверждения.</div><div class="actions end"><button id="importAsNew" class="btn primary">Добавить как новые</button><button id="importMerge" class="btn ghost">Обновить совпадающие</button></div>`);$('importAsNew').onclick=()=>applyImport('new');$('importMerge').onclick=()=>applyImport('merge')}
async function applyImport(mode){if(!importCandidate)return;try{for(const incoming of importCandidate.objects){const object=clone(incoming);if(mode==='new'){object.id=uid();object.orders.forEach(o=>o.id=uid())}await dbPut(normalizeObject(object))}if(importCandidate.rates){rates={...rates,...importCandidate.rates};saveRates()}if(importCandidate.profile){const incoming=importCandidate.profile;profile={...profile,...incoming};saveProfile()}if(importCandidate.customFloorCovers){customFloorCovers=importCandidate.customFloorCovers;saveCustomFloorCovers()}if(importCandidate.generalExpenses){generalExpenses=importCandidate.generalExpenses;saveGeneralExpenses()}await reloadObjects();importCandidate=null;closeSheet();navigate('dashboard');toast('Импорт завершён')}catch(e){console.error(e);toast('Ошибка импорта')}}

window.addEventListener('beforeunload',e=>{if(editorState.dirty){e.preventDefault();e.returnValue=''}});
window.addEventListener('resize',()=>{if(!$('documentView').classList.contains('hidden'))fitPaperPreview()});
$('brandHome').onclick=()=>navigate('dashboard');
$('globalDocsBtn').onclick=()=>showPriceListSheet();
$('settingsBtn').onclick=()=>navigate('settings',{tab:'profile'});
$('lightBtn').onclick=()=>applyTheme('light');
$('darkBtn').onclick=()=>applyTheme('dark');
$('closeDocumentBtn').onclick=()=>$('documentView').classList.add('hidden');
$('printDocumentBtn').onclick=()=>window.print();
applyTheme(storageGet('frameTheme','dark')||'dark');

async function init(){
  try{
    await openDB();
    await migrateLegacy();
    await reloadObjects();
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
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
init();
