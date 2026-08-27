from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


app_path = Path('app.js')
app = app_path.read_text(encoding='utf-8')
app = replace_once(app, "const VERSION='2.6.1';", "const VERSION='2.6.2';", 'version')

app = replace_once(
    app,
    '<span class="statusPill work">${active} в работе</span>',
    '<button id="activeWorkBtn" class="statusPill work statusPillButton" type="button">${active} в работе</button>',
    'active work pill',
)
app = replace_once(
    app,
    "if($('allOrdersBtn'))$('allOrdersBtn').onclick=()=>navigate('ordersList',{kind:'active'});",
    "if($('allOrdersBtn'))$('allOrdersBtn').onclick=()=>navigate('ordersList',{kind:'active'});if($('activeWorkBtn'))$('activeWorkBtn').onclick=()=>navigate('ordersList',{kind:'active'});",
    'active work handler',
)

old_context = "function aiContextPayload(){return {current_target:routeState.aiTarget||aiDefaultTargetKey(),today:today(),objects:objects.map(object=>({id:object.id,address:object.contact?.address||'',customer:object.contact?.name||'',status:objectStatusValue(object),orders:(object.orders||[]).map(order=>({id:order.id,title:order.title||'',status:order.status||'',contract_total:orderContractTotal(order),paid:orderPaid(order),remaining:orderRemaining(order),ready_to_close:orderReadyToClose(order),purchases_due:orderDuePurchases(order),purchases:(order.purchases||[]).map(p=>({id:p.id,name:p.name||'',amount:parseNum(p.amount),date:p.date||'',status:p.status||'due'})),closures:(order.workClosures||[]).map(c=>({id:c.id,number:c.number,date:c.date,amount:parseNum(c.amount),remaining:closureRemainingAmount(order,c)})),works:(order.works||[]).map(row=>({id:row.id,name:row.name||'',qty:parseNum(row.qty),unit:row.unit||'',price:parseNum(row.price),progress_pct:workProgressPct(row),closed_amount:workClosedAmount(row),ready_amount:workReadyAmount(row)}))}))}))}}"
new_context = """function aiSafeValue(fn,fallback=0){try{return fn()}catch(e){console.warn('FRAME AI context field skipped',e);return fallback}}
function aiOrderContext(order){return {id:order.id,title:order.title||'',status:order.status||'',contract_total:aiSafeValue(()=>orderContractTotal(order),0),paid:aiSafeValue(()=>orderPaid(order),0),remaining:aiSafeValue(()=>orderRemaining(order),0),ready_to_close:aiSafeValue(()=>orderWorkProgress(order).ready,0),purchases_due:aiSafeValue(()=>orderDuePurchases(order),0),purchases:(order.purchases||[]).map(p=>({id:p.id,name:p.name||'',amount:parseNum(p.amount),date:p.date||'',status:p.status||'due'})),closures:(order.workClosures||[]).map(c=>({id:c.id,number:c.number,date:c.date,amount:parseNum(c.amount),remaining:aiSafeValue(()=>closureRemainingAmount(order,c),0)})),works:(order.works||[]).map(row=>({id:row.id,name:row.name||'',qty:parseNum(row.qty),unit:row.unit||'',price:parseNum(row.price),progress_pct:aiSafeValue(()=>workProgressPct(row),0),closed_amount:aiSafeValue(()=>workClosedAmount(row),0),ready_amount:aiSafeValue(()=>workReadyAmount(row),0)}))}}
function aiContextPayload(){return {current_target:routeState.aiTarget||aiDefaultTargetKey(),today:today(),objects:objects.map(object=>({id:object.id,address:object.contact?.address||'',customer:object.contact?.name||'',status:aiSafeValue(()=>objectStatusValue(object),'auto'),orders:(object.orders||[]).map(aiOrderContext)}))}}"""
app = replace_once(app, old_context, new_context, 'AI context')

app = replace_once(
    app,
    '<div class="aiInlineState">${aiBrainStateHtml()}',
    '<div id="aiBrainState" class="aiInlineState">${aiBrainStateHtml()}',
    'AI inline state id',
)

old_payment_summary = '<div class="summaryGrid"><div class="reviewSummary"><span>Работы</span><strong>${money(work)}</strong></div><div class="reviewSummary secondary"><span>Оплачено</span><strong id="paidTotal">${money(paid)}</strong></div><div class="reviewSummary secondary"><span>Осталось</span><strong id="remainingTotal">${money(remaining)}</strong></div></div>'
new_payment_summary = '<div class="summaryGrid"><button id="paymentWorksMetric" class="reviewSummary summaryAction" type="button"><span>Работы</span><strong>${money(work)}</strong></button><button id="paymentPaidMetric" class="reviewSummary secondary summaryAction" type="button"><span>Оплачено</span><strong id="paidTotal">${money(paid)}</strong></button><button id="paymentRemainingMetric" class="reviewSummary secondary summaryAction" type="button"><span>Осталось</span><strong id="remainingTotal">${money(remaining)}</strong></button></div>'
app = replace_once(app, old_payment_summary, new_payment_summary, 'payment summary actions')

marker = "function bindPaymentsView(){const order=currentOrder();if(!order)return;"
quick_payment = """function showQuickPaymentSheet(defaultAmount=''){const order=currentOrder();if(!order)return;const remaining=orderRemaining(order),value=defaultAmount===''?'':String(Math.round(parseNum(defaultAmount)*100)/100);openSheet(`<div class=\"sectionTitle\"><div><h1>Добавить оплату</h1><p class=\"help compact\">Осталось по заказу ${money(remaining)}. Введите фактически полученную сумму.</p></div><button class=\"sheetCloseIcon\" data-close-sheet aria-label=\"Закрыть\">×</button></div><label>Сумма, ₽<input id=\"quickPaymentAmount\" class=\"decimal\" inputmode=\"decimal\" value=\"${esc(value)}\" placeholder=\"0\"></label><div class=\"grid two\" style=\"margin-top:10px\"><label>Дата<input id=\"quickPaymentDate\" type=\"date\" value=\"${today()}\"></label><label>Комментарий<input id=\"quickPaymentNote\" value=\"Оплата работ\"></label></div>${remaining>0?`<button id=\"quickPaymentAll\" class=\"btn ghost wide\" style=\"margin-top:10px\">Весь остаток ${money(remaining)}</button>`:''}<button id=\"saveQuickPayment\" class=\"btn primary wide\" style=\"margin-top:10px\">Сохранить оплату</button>`);const input=$('quickPaymentAmount');requestAnimationFrame(()=>{input?.focus();if(input?.value)input.select()});if($('quickPaymentAll'))$('quickPaymentAll').onclick=()=>{input.value=String(Math.round(remaining*100)/100);input.focus();input.select()};$('saveQuickPayment').onclick=()=>{const amount=parseNum(input.value);if(amount<=0){toast('Введите сумму оплаты');input.focus();return}order.payments.push(normalizePayment({amount:String(Math.round(amount*100)/100),date:$('quickPaymentDate').value||today(),note:String($('quickPaymentNote').value||'Оплата работ').trim()||'Оплата работ'}));queueSave();closeSheet();render();toast(`Оплата ${money(amount)} добавлена`)}}
""" + marker
app = replace_once(app, marker, quick_payment, 'quick payment helper')

old_add_payment = "  $('addPaymentBtn').onclick=()=>{const remaining=orderRemaining(order);order.payments.push(normalizePayment({amount:remaining?String(Math.round(remaining*100)/100):'',date:today(),note:'Оплата работ'}));queueSave();render();setTimeout(()=>window.scrollTo({left:0,top:document.body.scrollHeight,behavior:'smooth'}),20)};"
new_add_payment = "  if($('paymentWorksMetric'))$('paymentWorksMetric').onclick=()=>navigate('works',{workModule:'all'});if($('paymentPaidMetric'))$('paymentPaidMetric').onclick=()=>showQuickPaymentSheet('');if($('paymentRemainingMetric'))$('paymentRemainingMetric').onclick=()=>showQuickPaymentSheet(orderRemaining(order));$('addPaymentBtn').onclick=()=>showQuickPaymentSheet(orderRemaining(order));"
app = replace_once(app, old_add_payment, new_add_payment, 'payment handlers')

old_resize = "window.addEventListener('resize',()=>{if(!$('documentView').classList.contains('hidden'))fitPaperPreview()});"
new_resize = """window.addEventListener('resize',()=>{if(!$('documentView').classList.contains('hidden'))fitPaperPreview()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&aiServerUrl())checkAiBrain({toastResult:false})});
window.addEventListener('online',()=>{if(aiServerUrl())checkAiBrain({toastResult:false})});"""
app = replace_once(app, old_resize, new_resize, 'AI resume health check')

old_init = "  render();\n  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);"
new_init = "  render();\n  if(aiServerUrl())checkAiBrain({toastResult:false});\n  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);"
app = replace_once(app, old_init, new_init, 'AI initial health check')
app_path.write_text(app, encoding='utf-8')

css_path = Path('styles.css')
css = css_path.read_text(encoding='utf-8')
marker_css = '/* FRAME 2.6.2 · Field hotfix */'
if marker_css not in css:
    css += """

/* FRAME 2.6.2 · Field hotfix */
.statusPillButton{appearance:none;font:inherit;cursor:pointer}.statusPillButton:active{transform:scale(.97)}
button.reviewSummary.summaryAction{width:100%;font:inherit;text-align:left;cursor:pointer}.summaryAction:active{transform:scale(.985)}
@media(max-width:560px){
  .simpleTabs{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
  .simpleTabs button{min-width:0;padding:10px 4px;font-size:12px;line-height:1.12;letter-spacing:-.015em;white-space:normal;overflow-wrap:anywhere}
}
"""
css_path.write_text(css, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
index = index.replace('FRAME 2.6.1 Solo','FRAME 2.6.2 Solo').replace('<div class="build">2.6.1</div>','<div class="build">2.6.2</div>').replace('styles.css?v=260','styles.css?v=262').replace('app.js?v=261','app.js?v=262')
index_path.write_text(index, encoding='utf-8')

sw_path = Path('sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const CACHE='frame-v261-dashboard-hotfix';", "const CACHE='frame-v262-field-hotfix';").replace("'./styles.css?v=260'", "'./styles.css?v=262'").replace("'./app.js?v=261'", "'./app.js?v=262'")
sw_path.write_text(sw, encoding='utf-8')

refresh_path = Path('refresh.html')
refresh = refresh_path.read_text(encoding='utf-8').replace('2.6.1','2.6.2').replace('fresh=261','fresh=262')
refresh_path.write_text(refresh, encoding='utf-8')

changelog_path = Path('CHANGELOG.txt')
changelog = changelog_path.read_text(encoding='utf-8')
if 'FRAME 2.6.2 FIELD HOTFIX' not in changelog:
    changelog += """

FRAME 2.6.2 FIELD HOTFIX — 27.08.2026
- AI: исправлено падение контекста на отсутствующей orderReadyToClose; ready_to_close теперь берётся из orderWorkProgress().ready.
- AI: поля контекста собираются отказоустойчиво; ошибка одного вычисления не должна ронять весь запрос.
- AI: тихая проверка подключения при старте, возврате в приложение и восстановлении сети.
- Главная: «в работе» стало активным переходом к активным заказам; финансовая карточка открывает финансы.
- Оплаты: карточки «Работы / Оплачено / Осталось» активны; добавлен быстрый ввод фактической оплаты.
- Финансы: исправлена мобильная вёрстка вкладок «Обзор / Поступления / Расходы».
"""
    changelog_path.write_text(changelog, encoding='utf-8')

passport_path = Path('FRAME_CONTEXT_PASSPORT.md')
passport = passport_path.read_text(encoding='utf-8')
if '## 2.6.2 Field hotfix' not in passport:
    passport += """

## 2.6.2 Field hotfix — полевой UX принцип
- Все смысловые показатели и карточки, визуально похожие на элементы управления, должны быть активны и вести к детализации или быстрому действию.
- AI Brain при наличии сохранённых адреса и токена должен сам выполнять тихий health-check при запуске/возврате приложения; ручная кнопка проверки остаётся только диагностикой.
- Контекст AI строится по принципу graceful degradation: ошибка отдельного вычисляемого поля не должна блокировать весь запрос.
- Быстрые денежные действия: нажатие на «Оплачено»/«Осталось» открывает компактный ввод платежа, а не заставляет искать отдельную форму.
- Мобильная вёрстка тестируется прежде всего на ширине iPhone; табы не имеют права наезжать друг на друга.
"""
    passport_path.write_text(passport, encoding='utf-8')
