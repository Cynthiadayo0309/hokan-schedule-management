<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import ScheduleTable from './components/ScheduleTable.vue';
import { TYPES,DAYS,ROUTE_LABEL,FREQUENCY,actualStart,addDays,applyDifferences,assignmentNames,clone,confirmWeek,copyFacility,createFacility,demoFacility,differences,emptyData,generateWeek,minutes,routes,ruleSummary,splitRule,swapRoutes,timeText,today,uid,validateData,validateRule,validateVisit,warnings,weekDates,weekStart,weekday,type AppData,type Client,type Difference,type Facility,type History,type Route,type Rule,type Snapshot,type Staff,type Visit,type Week } from './domain';
import { desktop,loadData,readBackup,saveData,saveFile } from './storage';
const data=ref<AppData>(emptyData()), facilityId=ref(''), loading=ref(true), busy=ref(false), fatal=ref(false), error=ref(''), notice=ref('');
type Screen='week'|'day'|'clients'|'rules'|'staff'|'assignments'|'settings'|'history';
const screen=ref<Screen>('week'), start=ref(weekStart(today())), day=ref(today()), search=ref('');
const facility=computed(()=>data.value.facilities.find(f=>f.id===facilityId.value));
const savedWeek=computed(()=>facility.value?.weeks[start.value]);
const preview=ref<Week|null>(null), changes=ref<Difference[]|null>(null), historical=ref<Snapshot|null>(null);
const shownWeek=computed(()=>historical.value?.week || preview.value || savedWeek.value);
const shownFacility=computed<Facility|undefined>(()=>facility.value && historical.value ? {...facility.value,name:historical.value.facilityName,colors:historical.value.colors,staff:historical.value.staff,dayRoutes:historical.value.dayRoutes} : facility.value);
const weekWarnings=computed(()=>facility.value && shownWeek.value?warnings(facility.value,shownWeek.value):[]);
const title:Record<Screen,string>={week:'週間スケジュール',day:'日別スケジュール',clients:'利用者管理',rules:'定期訪問設定',staff:'職員管理',assignments:'基本担当職員',settings:'施設・設定',history:'変更履歴・確定版'};
const filteredClients=computed(()=>facility.value?.clients.filter(c=>`${c.code} ${c.name} ${c.notes}`.includes(search.value)) || []);
const filteredRules=computed(()=>facility.value?.rules.filter(r=>`${clientName(r.clientId)} ${ruleSummary(r)}`.includes(search.value)) || []);
const activeRoutes=computed(()=>facility.value?routes(facility.value):[]);
const modal=ref<'facility'|'client'|'staff'|'rule'|'visit'|'assignment'|'swap'|null>(null), editId=ref('');
const facilityForm=ref({name:'',dayRoutes:3 as 2|3,colors:{介護:'#dcebd6',医療:'#f5d9ca',精神:'#dce6f5'}});
const clientForm=ref<Client>({id:'',code:'',name:'',type:'介護',active:true,notes:''});
const staffForm=ref<Staff>({id:'',code:'',name:'',active:true,notes:''});
const ruleForm=ref<Rule>({id:'',seriesId:'',clientId:'',type:'介護',days:[1],time:'09:00',duration:30,frequency:'weekly',ordinals:[1,3],anchor:today(),route:'A',from:today(),until:'',notes:''});
const visitForm=ref<Visit>({id:'',origin:null,ruleId:null,clientId:'',clientName:'',type:'介護',businessDate:today(),actualStart:'',time:'09:00',duration:30,route:'A',notes:'',baseline:null});
const scope=ref('day'), assignmentDay=ref('0'), assignmentValues=ref<Partial<Record<Route,string[]>>>({}), assignmentMode=ref<'basic'|'date'>('basic');
const swapForm=ref({a:'A' as Route,b:'B' as Route,staff:false});
const confirmation=ref<{title:string;text:string;resolve:(answer:boolean)=>void}|null>(null);
const historyDetail=ref<History|null>(null);
const pendingImport=ref<AppData|null>(null), importMode=ref<'copy'|'replace'>('copy');
const overlayOpen=computed(()=>!!(modal.value || confirmation.value || historyDetail.value || pendingImport.value));
let previousFocus:HTMLElement|null=null;
watch(overlayOpen,async(open)=>{if(open) {previousFocus=document.activeElement as HTMLElement;await nextTick();document.querySelector<HTMLElement>('.modal-backdrop:last-child button, .modal-backdrop:last-child input')?.focus();} else previousFocus?.focus();});
onMounted(()=>document.addEventListener('keydown',(event)=>{
  if(event.key!=='Tab' || !overlayOpen.value) return;
  const dialog=document.querySelector<HTMLElement>('.confirm-backdrop') || Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop')).at(-1);
  const focusable=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea') || []).filter(el=>el.getClientRects().length);
  const first=focusable[0],last=focusable.at(-1);if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();} else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
}));
function ask(title:string,text:string):Promise<boolean> {return new Promise(resolve=>{confirmation.value={title,text,resolve};});}
function answer(value:boolean) {confirmation.value?.resolve(value);confirmation.value=null;}
function report(e:unknown) {error.value=e instanceof Error?e.message:String(e);}
function audit(f:Facility):Record<string,unknown> {return {施設:{name:f.name,dayRoutes:f.dayRoutes,colors:f.colors},基本担当:f.defaults,...Object.fromEntries(f.clients.map(c=>['利用者/'+c.id,c])),...Object.fromEntries(f.staff.map(s=>['職員/'+s.id,s])),...Object.fromEntries(f.rules.map(r=>['定期訪問/'+r.id,r])),...Object.fromEntries(Object.entries(f.weeks).map(([date,w])=>['週間/'+date,w]))};}
async function commit(message:string,action:(draft:AppData,f:Facility|undefined)=>void):Promise<boolean> {
  if(busy.value || fatal.value) return false;
  busy.value=true;error.value='';
  try {
    const draft=clone(data.value), f=draft.facilities.find(f=>f.id===facilityId.value), before=f?audit(clone(f)):null;
    action(draft,f);
    if(f && before) {
      const after=audit(f), changedBefore:Record<string,unknown>={},changedAfter:Record<string,unknown>={};
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])) if(JSON.stringify(before[key])!==JSON.stringify(after[key])) {changedBefore[key]=before[key] ?? null;changedAfter[key]=after[key] ?? null;}
      f.history.push({id:uid(),at:new Date().toISOString(),target:title[screen.value],message,before:JSON.stringify(changedBefore),after:JSON.stringify(changedAfter)});
    }
    await saveData(draft); data.value=draft;notice.value=message+'しました。';return true;
  } catch(e) {report(e);return false;} finally {busy.value=false;}
}
function clientName(id:string) {return facility.value?.clients.find(c=>c.id===id)?.name || '利用者未設定';}
function switchScreen(value:Screen) {screen.value=value;search.value='';}
function resetView() {preview.value=null;changes.value=null;historical.value=null;}
function changeFacility() {resetView();screen.value='week';search.value='';}
function changeWeek(value:string) {if(!value) return;start.value=weekStart(value);day.value=start.value;resetView();}
function openDay(date:string) {day.value=date;screen.value='day';}
function openFacility(edit=false) {editId.value=edit?facilityId.value:'';facilityForm.value=edit && facility.value?{name:facility.value.name,dayRoutes:facility.value.dayRoutes,colors:clone(facility.value.colors)}:{name:'',dayRoutes:3,colors:{介護:'#dcebd6',医療:'#f5d9ca',精神:'#dce6f5'}};modal.value='facility';}
function openClient(client?:Client) {editId.value=client?.id || '';clientForm.value=client?clone(client):{id:uid(),code:'',name:'',type:'介護',active:true,notes:''};modal.value='client';}
function openStaff(staff?:Staff) {editId.value=staff?.id || '';staffForm.value=staff?clone(staff):{id:uid(),code:'',name:'',active:true,notes:''};modal.value='staff';}
function openRule(rule?:Rule,client?:Client) {
  editId.value=rule?.id || '';const id=uid(),c=client || facility.value?.clients.find(c=>c.active);
  ruleForm.value=rule?clone(rule):{id,seriesId:id,clientId:c?.id || '',type:c?.type || '介護',days:[1],time:'09:00',duration:30,frequency:'weekly',ordinals:[1,3],anchor:today(),route:'A',from:today(),until:'',notes:''};modal.value='rule';
}
function openVisit(visit?:Visit,route:Route='A') {
  if(historical.value || preview.value || !savedWeek.value) return;
  editId.value=visit?.id || '';const c=facility.value?.clients.find(c=>c.active);
  visitForm.value=visit?clone(visit):{id:uid(),origin:null,ruleId:null,clientId:c?.id || '',clientName:c?.name || '',type:c?.type || '介護',businessDate:day.value,actualStart:'',time:route==='N'?'21:00':'09:00',duration:30,route,notes:'',baseline:null};scope.value='day';modal.value='visit';
}
function chooseClient(form:Rule|Visit) {const c=facility.value?.clients.find(c=>c.id===form.clientId);if(c) form.type=c.type;}
async function checkWarnings(w:Week) {const items=warnings(facility.value!,w);return !items.length || await ask('警告を確認して保存',items.join('\n')+'\n\n警告を確認したうえで保存しますか？');}
async function saveModal() {
  error.value='';
  try {
    if(modal.value==='facility') {
      const form=clone(facilityForm.value);form.name=form.name.trim();if(!form.name) throw new Error('施設名を入力してください。');
      let newId='';
      if(await commit(editId.value?'施設設定を更新':'施設を登録',(draft,f)=>{
        if(editId.value && f) {
          if(form.dayRoutes===2 && (f.rules.some(r=>r.route==='C') || Object.values(f.weeks).some(w=>w.visits.some(v=>v.route==='C')) || Object.values(f.defaults).some(d=>d.C?.length) || Object.values(f.weeks).some(w=>Object.values(w.assignments).some(d=>d.C?.length)))) throw new Error('日勤Cに定期訪問・保存済み予定・担当職員があります。先にA/Bへ移動してください。');
          Object.assign(f,form);
        } else {const next=createFacility(form.name);Object.assign(next,form);newId=next.id;draft.facilities.push(next);}
      })) {if(newId) {facilityId.value=newId;changeFacility();}modal.value=null;}
    } else if(modal.value==='client' || modal.value==='staff') {
      const kind=modal.value, form=clone(kind==='client'?clientForm.value:staffForm.value);form.name=form.name.trim();form.code=form.code.trim();
      if(!form.name || !form.code) throw new Error('IDと氏名を入力してください。');
      if(await commit(kind==='client'?'利用者を保存':'職員を保存',(_,f)=>{
        if(!f) throw new Error('施設を選択してください。');
        const list=kind==='client'?f.clients:f.staff;
        if(list.some(c=>c.code===form.code && c.id!==form.id)) throw new Error('同じIDが登録されています。');
        const i=list.findIndex(c=>c.id===form.id);if(i>=0) list.splice(i,1,form as Client & Staff);else list.push(form as Client & Staff);
      })) modal.value=null;
    } else if(modal.value==='rule') {
      const form=clone(ruleForm.value);form.time=timeText(minutes(form.time));validateRule(facility.value!,form);
      if(await commit('定期訪問設定を保存',(_,f)=>{const i=f!.rules.findIndex(r=>r.id===form.id);if(i>=0) f!.rules.splice(i,1,form);else f!.rules.push(form);})) modal.value=null;
    } else if(modal.value==='visit') {
      const form=clone(visitForm.value);form.time=timeText(minutes(form.time));form.actualStart=actualStart(form.businessDate,form.time);form.clientName=clientName(form.clientId);validateVisit(facility.value!,form,start.value);
      const old=savedWeek.value!.visits.find(v=>v.id===form.id);
      if(scope.value==='future' && old && old.businessDate!==form.businessDate) throw new Error('定期予定も変更するときは業務日を移動せず、曜日の変更を定期訪問設定で行ってください。');
      const next=clone(savedWeek.value!);const i=next.visits.findIndex(v=>v.id===form.id);if(i>=0) next.visits.splice(i,1,form);else next.visits.push(form);
      if(!await checkWarnings(next)) return;
      if(await commit('訪問予定を保存',(_,f)=>{if(scope.value==='future' && old) splitRule(f!,old,form);next.updatedAt=new Date().toISOString();f!.weeks[start.value]=next;})) modal.value=null;
    } else if(modal.value==='assignment') {
      const values=clone(assignmentValues.value);
      if(await commit('担当職員を保存',(_,f)=>{if(assignmentMode.value==='basic') f!.defaults[assignmentDay.value]=values;else {const w=f!.weeks[start.value];w.assignments[day.value]=values;w.updatedAt=new Date().toISOString();}})) modal.value=null;
    } else if(modal.value==='swap') {
      const {a,b,staff}=swapForm.value;
      if(a===b) throw new Error('異なるルートを選択してください。');
      const next=swapRoutes(savedWeek.value!,day.value,a,b,staff);
      for(const v of next.visits) validateVisit(facility.value!,v,start.value);
      if(!await ask('ルート入れ替えの確認',`${facility.value!.name}\n${day.value}（${DAYS[weekday(day.value)]}）\n${ROUTE_LABEL[a]} ⇄ ${ROUTE_LABEL[b]}\n${staff?'訪問予定と担当職員一覧を交換':'訪問予定のみ交換（担当職員は維持）'}\n\nこの内容で入れ替えますか？`)) return;
      if(!await checkWarnings(next)) return;
      if(await commit('ルートを入れ替え',(_,f)=>{next.updatedAt=new Date().toISOString();f!.weeks[start.value]=next;})) modal.value=null;
    }
  } catch(e) {report(e);}
}
function openAssignments(mode:'basic'|'date',value='0') {assignmentMode.value=mode;assignmentDay.value=value;assignmentValues.value=clone(mode==='basic'?facility.value!.defaults[value] || {}:savedWeek.value!.assignments[day.value] || {});modal.value='assignment';}
function changeAssignmentDay() {assignmentValues.value=clone(facility.value!.defaults[assignmentDay.value] || {});}
function toggleStaff(route:Route,id:string) {const list=assignmentValues.value[route] ||= [];const i=list.indexOf(id);if(i>=0) list.splice(i,1);else list.push(id);}
async function deleteVisit() {
  const old=savedWeek.value!.visits.find(v=>v.id===editId.value);if(!old) return;
  if(!await ask('訪問予定を削除',`${old.businessDate} ${old.time} ${old.clientName}\n${scope.value==='future'?'この日以降の定期訪問も終了します。':'この日の予定だけを削除します。'}\n削除しますか？`)) return;
  if(await commit('訪問予定を削除',(_,f)=>{const w=f!.weeks[start.value];w.visits=w.visits.filter(v=>v.id!==old.id);if(old.origin) w.deleted[old.origin]=clone(old);if(scope.value==='future') splitRule(f!,old,null);w.updatedAt=new Date().toISOString();})) modal.value=null;
}
async function deleteRule(rule:Rule) {if(await ask('定期訪問設定を削除',`${clientName(rule.clientId)}\n${ruleSummary(rule)}\n保存済みの予定は差分反映まで変わりません。削除しますか？`)) await commit('定期訪問設定を削除',(_,f)=>{f!.rules=f!.rules.filter(r=>r.id!==rule.id);});}
function generate() {if(!facility.value) return;historical.value=null;const result=generateWeek(facility.value,start.value);if(savedWeek.value) {changes.value=differences(savedWeek.value,result);preview.value=null;} else {preview.value=result;changes.value=null;}}
async function savePreview() {
  if(!preview.value || !await checkWarnings(preview.value)) return;
  const week=clone(preview.value);
  if(await commit('下書きを保存',(_,f)=>{if(f!.weeks[start.value]) throw new Error('この週は作成済みです。差分反映を利用してください。');f!.weeks[start.value]=week;})) preview.value=null;
}
async function applyChanges() {
  if(!changes.value) return;
  if(changes.value.some(d=>d.selected && d.kind==='手動編集との競合') && !await ask('手動編集を置き換える確認','選択された競合は、手動編集・削除を定期訪問設定の内容で置き換えます。反映しますか？')) return;
  const next=applyDifferences(savedWeek.value!,changes.value);
  if(!await checkWarnings(next)) return;
  if(await commit('定期訪問の差分を反映',(_,f)=>{next.updatedAt=new Date().toISOString();f!.weeks[start.value]=next;})) changes.value=null;
}
async function finalize() {
  if(!savedWeek.value || !await checkWarnings(savedWeek.value)) return;
  if(!await ask('週間スケジュールを確定',`${start.value}〜${addDays(start.value,6)}を確定し、この時点の内容を保存します。\n確定後の編集は変更履歴に残ります。`)) return;
  await commit('週間スケジュールを確定',(_,f)=>{confirmWeek(f!,f!.weeks[start.value]);});
}
async function moveVisit(id:string,date:string,route:Route) {
  if(!savedWeek.value || preview.value || historical.value) return;
  const old=savedWeek.value.visits.find(v=>v.id===id);if(!old || (old.businessDate===date && old.route===route)) return;
  const next=clone(savedWeek.value),v=next.visits.find(v=>v.id===id)!;v.businessDate=date;v.route=route;v.actualStart=actualStart(date,v.time);
  try {validateVisit(facility.value!,v,start.value);if(!await checkWarnings(next)) return;await commit('訪問ルートを移動',(_,f)=>{next.updatedAt=new Date().toISOString();f!.weeks[start.value]=next;});} catch(e) {report(e);}
}
async function excel() {if(!shownWeek.value || !shownFacility.value) return;busy.value=true;try {const {exportExcel}=await import('./export');if(await exportExcel(shownFacility.value,shownWeek.value,screen.value==='day'?day.value:undefined)) notice.value='Excelファイルを出力しました。';} catch(e) {report(e);} finally {busy.value=false;}}
async function print() {await nextTick();window.print();}
async function backup() {busy.value=true;try {if(await saveFile(`訪問スケジュール_バックアップ_${today()}.json`,new TextEncoder().encode(JSON.stringify(data.value,null,2)),'json')) notice.value='全施設のバックアップを出力しました。';} catch(e) {report(e);} finally {busy.value=false;}}
async function importBackup() {try {const raw=await readBackup();if(!raw) return;const parsed:unknown=JSON.parse(raw);validateData(parsed);pendingImport.value=parsed;importMode.value='copy';} catch(e) {report(e);}}
async function acceptImport() {
  if(!pendingImport.value) return;
  if(importMode.value==='replace' && !await ask('全施設を復元する確認','現在の全施設データを、読み込んだバックアップで置き換えます。先に現在のデータのバックアップを保存してください。復元しますか？')) return;
  const incoming=clone(pendingImport.value);
  const ok=await commit('バックアップを読み込み',(draft)=>{
    if(importMode.value==='replace') draft.facilities=incoming.facilities;
    else draft.facilities.push(...incoming.facilities.map(copyFacility));
  });
  if(ok) {facilityId.value=data.value.facilities[0]?.id || '';pendingImport.value=null;resetView();}
}
async function addDemo() {if(await commit('サンプル施設を追加',draft=>{draft.facilities.push(demoFacility());})) {facilityId.value=data.value.facilities.at(-1)!.id;resetView();}}
function viewSnapshot(snapshot:Snapshot) {historical.value=clone(snapshot);start.value=snapshot.week.start;day.value=start.value;preview.value=null;changes.value=null;screen.value='week';}
function formatAt(at:string) {return new Date(at).toLocaleString('ja-JP');}
function describe(v?:Visit) {return v?`${v.businessDate} ${v.time} / ${v.duration}分 / ${ROUTE_LABEL[v.route]} / ${v.clientName} / ${v.type}${v.notes?' / '+v.notes:''}`:'—';}
onMounted(async()=>{try {data.value=await loadData();facilityId.value=data.value.facilities[0]?.id || '';} catch(e) {report(e);fatal.value=true;} finally {loading.value=false;}});
</script>

<template>
  <div class="app-shell" :class="{'is-busy':busy}">
    <aside class="sidebar no-print">
      <div class="brand"><div class="brand-icon">訪</div><div>訪問スケジュール<small>VISIT SCHEDULE MANAGER</small></div></div>
      <label class="facility-selector">管理する施設<select v-model="facilityId" @change="changeFacility"><option v-if="!data.facilities.length" value="">施設を登録してください</option><option v-for="f in data.facilities" :key="f.id" :value="f.id">{{f.name}}</option></select></label>
      <div class="nav-label">スケジュール</div>
      <nav><button v-for="item in ([['week','▦','週間スケジュール'],['day','▤','日別スケジュール']] as const)" :key="item[0]" :class="{active:screen===item[0]}" :disabled="!facility" @click="switchScreen(item[0])"><span>{{item[1]}}</span>{{item[2]}}</button></nav>
      <div class="nav-label">基本情報</div>
      <nav><button v-for="item in ([['clients','♧','利用者管理'],['rules','↻','定期訪問設定'],['staff','♙','職員管理'],['assignments','☷','基本担当職員']] as const)" :key="item[0]" :class="{active:screen===item[0]}" :disabled="!facility" @click="switchScreen(item[0])"><span>{{item[1]}}</span>{{item[2]}}</button></nav>
      <div class="nav-bottom"><nav><button :class="{active:screen==='history'}" :disabled="!facility" @click="switchScreen('history')"><span>◷</span>変更履歴・確定版</button><button :class="{active:screen==='settings'}" @click="switchScreen('settings')"><span>⚙</span>施設・設定</button></nav><div class="offline"><span></span> オフラインで利用できます<small>{{desktop?'データはこのPCのSQLiteに保存':'ブラウザ確認モード・このブラウザに保存'}}</small></div></div>
    </aside>
    <main>
      <header class="page-header no-print"><div><p class="eyebrow">{{facility?.name || 'はじめに'}}</p><h1>{{title[screen]}}</h1></div><div class="header-meta"><span class="local-badge">● ローカル保存</span><span>{{today().replaceAll('-',' / ')}}</span></div></header>
      <div v-if="error" class="alert error no-print" role="alert">{{error}}<button @click="error=''" aria-label="閉じる">×</button></div>
      <div v-if="notice" class="alert success no-print" role="status">{{notice}}<button @click="notice=''" aria-label="閉じる">×</button></div>
      <div v-if="loading" class="empty-state">保存データを読み込んでいます…</div>
      <div v-else-if="fatal" class="empty-state"><h2>データを安全に読み込めませんでした</h2><p>保存データを上書きしないように編集を停止しています。アプリを閉じ、バックアップと保存先を確認してください。</p></div>
      <section v-else-if="!facility && screen!=='settings'" class="welcome"><div class="welcome-mark">▦</div><h2>施設の登録からはじめましょう</h2><p>利用者と定期訪問を登録すると、週間スケジュールを作成できます。</p><div class="actions"><button class="primary" @click="openFacility()">＋ 施設を登録</button><button @click="addDemo">サンプルで試す</button><button @click="importBackup">バックアップを読み込む</button></div></section>
      <template v-else-if="(screen==='week' || screen==='day') && facility">
        <section class="week-controls no-print"><div class="date-controls"><button aria-label="前の週" @click="changeWeek(addDays(start,-7))">‹</button><label>対象週<input type="date" :value="start" @change="changeWeek(($event.target as HTMLInputElement).value)"></label><strong>〜 {{addDays(start,6)}}</strong><button aria-label="次の週" @click="changeWeek(addDays(start,7))">›</button><button class="text-button" @click="changeWeek(today())">今週</button></div><div class="actions"><button :disabled="busy" @click="generate">{{savedWeek?'↻ 差分を確認':'＋ スケジュール生成'}}</button><button v-if="savedWeek && !preview && !historical" class="primary" @click="finalize">{{savedWeek.status==='confirmed'?'確定版を追加保存':'スケジュールを確定'}}</button></div></section>
        <div v-if="changes" class="panel diff-panel no-print"><div class="section-title"><div><h2>定期訪問設定との差分</h2><p>選択した項目だけを反映します。担当職員は現在の割り当てを維持します。</p></div><button @click="changes=null">閉じる</button></div><p v-if="!changes.length">反映する差分はありません。</p><div v-for="diff in changes" :key="diff.key" class="diff-item"><input type="checkbox" v-model="diff.selected" :aria-label="diff.kind+'を選択'"><span class="badge" :class="{'warning-badge':diff.kind==='手動編集との競合'}">{{diff.kind}}</span><div><div><small>変更前</small>{{describe(diff.before)}}</div><div><small>変更後</small>{{describe(diff.after)}}</div></div></div><button v-if="changes.length" class="primary" :disabled="!changes.some(d=>d.selected)" @click="applyChanges">選択した差分を反映</button></div>
        <div v-if="preview" class="alert preview-banner no-print"><div><strong>生成プレビュー · まだ保存されていません</strong><p>訪問予定と警告を確認し、下書きとして保存してください。</p></div><div class="actions"><button @click="preview=null">破棄</button><button class="primary" @click="savePreview">下書き保存</button></div></div>
        <div v-if="historical" class="alert preview-banner no-print"><div><strong>確定版を表示中：{{formatAt(historical.at)}}</strong><p>この時点の内容でExcel出力・印刷できます。</p></div><button @click="historical=null">現在の版に戻る</button></div>
        <template v-if="shownWeek && shownFacility">
          <section class="summary-strip no-print"><div><small>訪問予定</small><strong>{{shownWeek.visits.length}}<em>件 / 週</em></strong></div><div><small>利用者</small><strong>{{new Set(shownWeek.visits.map(v=>v.clientId)).size}}<em>名</em></strong></div><div><small>ルート構成</small><strong>{{facility.dayRoutes}}<em>日勤 ＋ 夜勤1</em></strong></div><div><small>保存状態</small><span class="status-pill" :class="{confirmed:shownWeek.status==='confirmed'}">{{preview?'プレビュー':shownWeek.status==='draft'?'下書き':'確定'}}</span></div></section>
          <section class="schedule-panel panel"><div class="schedule-toolbar no-print"><div class="view-tabs"><button :class="{selected:screen==='week'}" @click="screen='week'">週間表</button><button :class="{selected:screen==='day'}" @click="screen='day'">日別詳細</button></div><div class="actions"><button @click="excel" :disabled="busy">↓ Excel出力</button><button @click="print">▧ 印刷・プレビュー</button></div></div>
            <div class="schedule-caption"><div><h2>{{shownFacility.name}}</h2><p>{{screen==='day'?day:`${start} 〜 ${addDays(start,6)}`}} <span class="badge">{{shownWeek.status==='draft'?'下書き':'確定'}}{{historical?'・保存版':''}}</span></p></div><div class="legend"><span v-for="type in TYPES" :key="type"><i :style="{background:shownFacility.colors[type]}"></i>{{type}}</span></div></div>
            <div v-if="screen==='day'" class="day-toolbar no-print"><label>表示日<select v-model="day"><option v-for="date in weekDates(start)" :key="date" :value="date">{{date}}（{{DAYS[weekday(date)]}}）</option></select></label><div v-if="!preview && !historical" class="actions"><button @click="openAssignments('date')">担当職員を変更</button><button @click="swapForm={a:'A',b:'B',staff:false};modal='swap'">ルート入れ替え</button><button class="primary" @click="openVisit()">＋ 訪問予定を追加</button></div></div>
            <div v-if="screen==='day'" class="route-cards no-print"><div v-for="route in activeRoutes" :key="route" @dragover.prevent @drop.prevent="moveVisit($event.dataTransfer?.getData('text/plain')||'',day,route)"><strong>{{ROUTE_LABEL[route]}}</strong><span>{{assignmentNames(shownFacility,shownWeek,day,route)||'担当未設定'}}</span><small>{{shownWeek.visits.filter(v=>v.businessDate===day && v.route===route).length}}件</small><button v-if="!preview && !historical" class="text-button" @click="openVisit(undefined,route)">＋追加</button></div></div>
            <ScheduleTable :facility="shownFacility" :week="shownWeek" :date="screen==='day'?day:undefined" :readonly="!!preview || !!historical" @day="openDay" @edit="openVisit($event)" @move="moveVisit" />
            <div class="table-footnote">時刻は訪問開始時刻です。所要時間は各予定内に表示。24:30は業務日の翌日0:30を表します。<span class="no-print">予定をクリックして編集できます。</span></div>
          </section>
          <details v-if="weekWarnings.length" class="warning-box no-print"><summary>△ 確認が必要な項目 {{weekWarnings.length}}件</summary><ul><li v-for="item in weekWarnings" :key="item">{{item}}</li></ul></details>
        </template>
        <div v-else class="empty-state panel"><div class="empty-icon">▦</div><h2>この週はまだ作成されていません</h2><p>定期訪問設定を基に生成し、内容を確認してから下書き保存します。</p><button class="primary" @click="generate">スケジュール生成</button><button class="text-button" @click="switchScreen('rules')">定期訪問設定を確認 →</button></div>
      </template>
      <section v-else-if="screen==='clients' && facility" class="panel management"><div class="section-title"><div><h2>利用者一覧 <span class="count">{{facility.clients.length}}</span></h2><p>施設ごとに管理します。利用終了にしても過去の予定は残ります。</p></div><button class="primary" @click="openClient()">＋ 利用者を登録</button></div><input class="search" v-model="search" placeholder="ID・氏名・備考で検索" aria-label="利用者を検索"><div class="table-scroll"><table class="data-table"><thead><tr><th>ID / 氏名</th><th>訪問種類</th><th>定期訪問（曜日・時間・ルート）</th><th>備考</th><th>状態</th><th>操作</th></tr></thead><tbody><tr v-for="client in filteredClients" :key="client.id"><td><small>{{client.code}}</small><strong>{{client.name}}</strong></td><td><span class="type-badge" :style="{background:facility.colors[client.type]}">{{client.type}}</span></td><td><div v-for="rule in facility.rules.filter(r=>r.clientId===client.id)" :key="rule.id" class="rule-summary">{{ruleSummary(rule)}}<small>{{rule.from}}〜{{rule.until||'継続'}}</small></div><span v-if="!facility.rules.some(r=>r.clientId===client.id)" class="muted">未設定</span></td><td class="notes">{{client.notes||'—'}}</td><td><span class="badge" :class="{inactive:!client.active}">{{client.active?'利用中':'利用終了'}}</span></td><td><button @click="openClient(client)">編集</button><button class="text-button" @click="openRule(undefined,client)">＋定期訪問</button></td></tr><tr v-if="!filteredClients.length"><td colspan="6" class="empty-table">利用者がいません。「利用者を登録」から追加してください。</td></tr></tbody></table></div></section>
      <section v-else-if="screen==='rules' && facility" class="panel management"><div class="section-title"><div><h2>定期訪問一覧 <span class="count">{{facility.rules.length}}</span></h2><p>曜日によって時間が異なる場合や1日に複数回訪問する場合は、設定を分けて登録します。</p></div><button class="primary" :disabled="!facility.clients.length" @click="openRule()">＋ 定期訪問を登録</button></div><input v-model="search" class="search" placeholder="利用者・曜日・時刻で検索" aria-label="定期訪問を検索"><div class="table-scroll"><table class="data-table"><thead><tr><th>利用者</th><th>訪問条件</th><th>種類</th><th>適用期間 / 基準日</th><th>備考</th><th>操作</th></tr></thead><tbody><tr v-for="rule in filteredRules" :key="rule.id"><td><strong>{{clientName(rule.clientId)}}</strong></td><td>{{ruleSummary(rule)}}</td><td><span class="type-badge" :style="{background:facility.colors[rule.type]}">{{rule.type}}</span></td><td>{{rule.from}}<br>〜 {{rule.until||'継続'}}<small v-if="rule.frequency==='biweekly'">基準日 {{rule.anchor}}</small></td><td class="notes">{{rule.notes||'—'}}</td><td><button @click="openRule(rule)">編集</button><button class="text-button danger-text" @click="deleteRule(rule)">削除</button></td></tr><tr v-if="!filteredRules.length"><td colspan="6" class="empty-table">定期訪問設定がありません。先に利用者を登録してください。</td></tr></tbody></table></div></section>
      <section v-else-if="screen==='staff' && facility" class="panel management"><div class="section-title"><div><h2>職員一覧 <span class="count">{{facility.staff.length}}</span></h2><p>1ルートに複数名の職員を割り当てられます。</p></div><button class="primary" @click="openStaff()">＋ 職員を登録</button></div><table class="data-table"><thead><tr><th>職員ID</th><th>氏名</th><th>所属施設</th><th>状態</th><th>備考</th><th>操作</th></tr></thead><tbody><tr v-for="person in facility.staff" :key="person.id"><td>{{person.code}}</td><td><strong>{{person.name}}</strong></td><td>{{facility.name}}</td><td>{{person.active?'利用中':'利用終了'}}</td><td class="notes">{{person.notes||'—'}}</td><td><button @click="openStaff(person)">編集</button></td></tr><tr v-if="!facility.staff.length"><td colspan="6" class="empty-table">職員を登録してください。</td></tr></tbody></table></section>
      <section v-else-if="screen==='assignments' && facility" class="panel management"><div class="section-title"><div><h2>曜日別の基本担当職員</h2><p>新規生成時に反映されます。保存済みの週は日別詳細から担当職員を変更してください。</p></div></div><table class="data-table"><thead><tr><th>曜日</th><th v-for="route in activeRoutes" :key="route">{{ROUTE_LABEL[route]}}</th><th>操作</th></tr></thead><tbody><tr v-for="(label,i) in DAYS" :key="i"><th>{{label}}曜日</th><td v-for="route in activeRoutes" :key="route">{{(facility.defaults[String(i)]?.[route] || []).map(id=>facility!.staff.find(s=>s.id===id)?.name).join('・')||'未設定'}}</td><td><button @click="openAssignments('basic',String(i))">担当を編集</button></td></tr></tbody></table></section>
      <div v-else-if="screen==='settings'" class="settings-grid"><section class="panel management"><div class="section-title"><div><h2>施設の管理</h2><p>利用者・職員・予定は施設ごとに独立して保存します。</p></div><button class="primary" @click="openFacility()">＋ 施設を登録</button></div><div v-for="f in data.facilities" :key="f.id" class="facility-card"><div><strong>{{f.name}}</strong><p>日勤 {{f.dayRoutes}}ルート ＋ 夜勤1ルート</p><div class="legend"><span v-for="type in TYPES" :key="type"><i :style="{background:f.colors[type]}"></i>{{type}}</span></div></div><button @click="facilityId=f.id;openFacility(true)">設定を編集</button></div></section><section class="panel management"><h2>バックアップ・PC間の共有</h2><p>全施設の情報をJSONファイルで手動共有できます。取り込み前に内容を確認します。</p><div class="actions"><button @click="backup">↓ バックアップ出力</button><button @click="importBackup">↑ バックアップ読み込み</button></div><p class="privacy-note">バックアップ・Excel・印刷物には個人情報が含まれます。保存先とファイルの取り扱いを確認してください。データベースと出力ファイルは暗号化されません。</p></section><section class="panel management"><h2>操作の練習</h2><p>架空の利用者・職員・定期訪問を含む施設を追加します。</p><button @click="addDemo">サンプル施設を追加</button></section></div>
      <section v-else-if="screen==='history' && facility" class="history-grid"><div class="panel management"><h2>過去の確定版</h2><p>確定時点の訪問・担当職員・色を保持しています。開いて再印刷できます。</p><div v-for="snapshot in [...facility.snapshots].reverse()" :key="snapshot.id" class="snapshot-row"><div><strong>{{snapshot.week.start}} 〜 {{addDays(snapshot.week.start,6)}}</strong><small>{{formatAt(snapshot.at)}} / {{snapshot.week.visits.length}}件</small></div><button @click="viewSnapshot(snapshot)">確定版を開く</button></div><p v-if="!facility.snapshots.length" class="muted">確定版はまだありません。</p></div><div class="panel management"><h2>変更履歴</h2><div v-for="h in [...facility.history].reverse()" :key="h.id" class="history-row"><div><small>{{formatAt(h.at)}} · {{h.target}}</small><strong>{{h.message}}</strong></div><button @click="historyDetail=h">変更前後</button></div><p v-if="!facility.history.length" class="muted">変更履歴はまだありません。</p></div></section>
      <footer class="app-footer no-print">訪問スケジュール管理 <span>v0.1.0 · 外部サービスへの送信なし</span></footer>
    </main>
    <div v-if="modal" class="modal-backdrop no-print" @click.self="modal=null"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" @keydown.esc="modal=null"><form @submit.prevent="saveModal"><header><h2 id="modal-title">{{modal==='facility'?(editId?'施設設定':'施設を登録'):modal==='client'?'利用者情報':modal==='staff'?'職員情報':modal==='rule'?'定期訪問設定':modal==='visit'?'訪問予定を編集':modal==='swap'?'ルート入れ替え':'担当職員の設定'}}</h2><button type="button" class="close-button" aria-label="閉じる" @click="modal=null">×</button></header>
      <div class="modal-body">
        <div v-if="error" class="alert error" role="alert">{{error}}</div>
        <template v-if="modal==='facility'"><label>施設名 <input v-model="facilityForm.name" required maxlength="100" autofocus></label><label>日勤ルート数<select v-model.number="facilityForm.dayRoutes"><option :value="2">2ルート（A・B）</option><option :value="3">3ルート（A・B・C）</option></select></label><h3>訪問種類の色</h3><div class="color-fields"><label v-for="type in TYPES" :key="type">{{type}}<input type="color" v-model="facilityForm.colors[type]"></label></div></template>
        <template v-if="modal==='client'"><div class="form-grid"><label>利用者ID<input v-model="clientForm.code" required maxlength="50" autofocus></label><label>氏名<input v-model="clientForm.name" required maxlength="100"></label><label>初期訪問種類<select v-model="clientForm.type"><option v-for="type in TYPES" :key="type">{{type}}</option></select></label><label>利用状態<select v-model="clientForm.active"><option :value="true">利用中</option><option :value="false">利用終了</option></select></label></div><label>備考<textarea v-model="clientForm.notes" rows="3" maxlength="2000"></textarea></label></template>
        <template v-if="modal==='staff'"><div class="form-grid"><label>職員ID<input v-model="staffForm.code" required maxlength="50" autofocus></label><label>氏名<input v-model="staffForm.name" required maxlength="100"></label><label>利用状態<select v-model="staffForm.active"><option :value="true">利用中</option><option :value="false">利用終了</option></select></label></div><label>備考<textarea v-model="staffForm.notes" rows="3" maxlength="2000"></textarea></label></template>
        <template v-if="modal==='rule'"><div class="form-grid"><label>対象利用者<select v-model="ruleForm.clientId" @change="chooseClient(ruleForm)" required><option v-for="c in facility?.clients" :key="c.id" :value="c.id">{{c.name}}（{{c.code}}）{{c.active?'':'・利用終了'}}</option></select></label><label>訪問種類<select v-model="ruleForm.type"><option v-for="type in TYPES" :key="type">{{type}}</option></select></label><label>訪問頻度<select v-model="ruleForm.frequency"><option v-for="(label,key) in FREQUENCY" :key="key" :value="key">{{label}}</option></select></label><label>ルート<select v-model="ruleForm.route"><option v-for="route in activeRoutes" :key="route" :value="route">{{ROUTE_LABEL[route]}}</option></select></label></div><fieldset v-if="ruleForm.frequency!=='once'"><legend>訪問曜日</legend><label v-for="(label,i) in DAYS" :key="i" class="check-chip"><input type="checkbox" :value="i" v-model="ruleForm.days">{{label}}</label></fieldset><fieldset v-if="ruleForm.frequency==='ordinal'"><legend>第何回目の曜日</legend><label v-for="n in 5" :key="n" class="check-chip"><input type="checkbox" :value="n" v-model="ruleForm.ordinals">第{{n}}</label></fieldset><div class="form-grid"><label>開始時刻（例 09:35 / 24:30）<input v-model="ruleForm.time" required placeholder="09:35" inputmode="numeric"></label><label>所要時間（分）<input type="number" v-model.number="ruleForm.duration" min="1" max="1440" required></label><label>{{ruleForm.frequency==='once'?'訪問日（業務日）':'適用開始日'}}<input type="date" v-model="ruleForm.from" required></label><label v-if="ruleForm.frequency!=='once'">適用終了日（任意）<input type="date" v-model="ruleForm.until"></label><label v-if="ruleForm.frequency==='biweekly'">隔週の基準日<input type="date" v-model="ruleForm.anchor" required></label></div><p class="field-help">夜勤の翌日0:30は24:30と入力します。曜日・適用期間は夜勤の業務日で指定します。</p><label>備考<textarea v-model="ruleForm.notes" rows="2" maxlength="2000"></textarea></label><p v-if="editId" class="field-help">保存済みの週は変更されません。週間表の「差分を確認」から反映してください。</p></template>
        <template v-if="modal==='visit'"><div class="form-grid"><label>利用者<select v-model="visitForm.clientId" @change="chooseClient(visitForm)"><option v-for="c in facility?.clients" :key="c.id" :value="c.id">{{c.name}}（{{c.code}}）</option></select></label><label>業務日<input type="date" v-model="visitForm.businessDate" :min="start" :max="addDays(start,6)" required></label><label>開始時刻<input v-model="visitForm.time" required placeholder="24:30"></label><label>所要時間（分）<input type="number" v-model.number="visitForm.duration" min="1" max="1440" required></label><label>訪問種類<select v-model="visitForm.type"><option v-for="type in TYPES" :key="type">{{type}}</option></select></label><label>ルート<select v-model="visitForm.route"><option v-for="route in activeRoutes" :key="route" :value="route">{{ROUTE_LABEL[route]}}</option></select></label></div><p class="field-help">夜勤の翌日0:30は24:30と入力します。業務日は夜勤開始日です。</p><label>備考<textarea v-model="visitForm.notes" rows="2" maxlength="2000"></textarea></label><fieldset v-if="visitForm.origin"><legend>変更範囲（削除にも適用）</legend><label class="radio-line"><input type="radio" v-model="scope" value="day">この日だけ変更</label><label class="radio-line"><input type="radio" v-model="scope" value="future">この日以降の定期予定も変更</label><p class="field-help">過去の定期設定を保持します。他の生成済み週は差分確認後に反映します。</p></fieldset></template>
        <template v-if="modal==='assignment'"><label v-if="assignmentMode==='basic'">対象曜日<select v-model="assignmentDay" @change="changeAssignmentDay"><option v-for="(label,i) in DAYS" :key="i" :value="String(i)">{{label}}曜日</option></select></label><p v-else>{{day}} の担当職員</p><fieldset v-for="route in activeRoutes" :key="route"><legend>{{ROUTE_LABEL[route]}}（複数選択可）</legend><label v-for="person in facility?.staff.filter(s=>s.active || assignmentValues[route]?.includes(s.id))" :key="person.id" class="check-chip"><input type="checkbox" :checked="assignmentValues[route]?.includes(person.id)" @change="toggleStaff(route,person.id)">{{person.name}}{{person.active?'':'（利用終了）'}}</label><p v-if="!facility?.staff.length" class="muted">先に職員を登録してください。</p></fieldset></template>
        <template v-if="modal==='swap'"><p><strong>{{facility?.name}} · {{day}}</strong></p><div class="form-grid"><label>ルート1<select v-model="swapForm.a"><option v-for="route in activeRoutes" :key="route" :value="route">{{ROUTE_LABEL[route]}}</option></select></label><label>ルート2<select v-model="swapForm.b"><option v-for="route in activeRoutes" :key="route" :value="route">{{ROUTE_LABEL[route]}}</option></select></label></div><label class="radio-line"><input type="checkbox" v-model="swapForm.staff">担当職員の一覧も含めて交換する</label><p class="field-help">次の確認画面で対象日・ルート・交換内容を確認します。週全体の一括交換は行いません。</p></template>
      </div><footer><button v-if="modal==='visit' && editId" type="button" class="danger-text" @click="deleteVisit">予定を削除</button><span class="spacer"></span><button type="button" @click="modal=null">キャンセル</button><button type="submit" class="primary" :disabled="busy">{{modal==='swap'?'内容を確認':'保存'}}</button></footer></form></section></div>
    <div v-if="confirmation" class="modal-backdrop confirm-backdrop no-print"><section class="modal small" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><header><h2 id="confirm-title">{{confirmation.title}}</h2></header><div class="modal-body confirmation-text">{{confirmation.text}}</div><footer><button @click="answer(false)">キャンセル</button><button class="primary" autofocus @click="answer(true)">確認して実行</button></footer></section></div>
    <div v-if="pendingImport" class="modal-backdrop no-print"><section class="modal" role="dialog" aria-modal="true" aria-label="バックアップ内容の確認"><header><h2>バックアップ内容の確認</h2></header><div class="modal-body"><div v-if="error" class="alert error">{{error}}</div><p>{{pendingImport.facilities.length}}施設を読み込みます。</p><ul><li v-for="f in pendingImport.facilities" :key="f.id">{{f.name}}：利用者 {{f.clients.length}}名 / {{Object.keys(f.weeks).length}}週</li></ul><label class="radio-line"><input type="radio" v-model="importMode" value="copy">別施設として追加（現在のデータを保持）</label><label class="radio-line"><input type="radio" v-model="importMode" value="replace">全施設をバックアップで復元（現在のデータを置き換え）</label></div><footer><button @click="pendingImport=null">キャンセル</button><button class="primary" :disabled="busy" @click="acceptImport">取り込む</button></footer></section></div>
    <div v-if="historyDetail" class="modal-backdrop no-print" @click.self="historyDetail=null"><section class="modal wide" role="dialog" aria-modal="true" aria-label="変更前後"><header><h2>{{historyDetail.message}}</h2><button @click="historyDetail=null" aria-label="閉じる">×</button></header><div class="modal-body"><p>{{formatAt(historyDetail.at)}} · {{historyDetail.target}}</p><div class="form-grid"><div><h3>変更前</h3><pre>{{JSON.stringify(JSON.parse(historyDetail.before),null,2)}}</pre></div><div><h3>変更後</h3><pre>{{JSON.stringify(JSON.parse(historyDetail.after),null,2)}}</pre></div></div></div></section></div>
  </div>
</template>
