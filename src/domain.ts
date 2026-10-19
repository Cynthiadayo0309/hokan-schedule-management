export const TYPES = ['介護', '医療', '精神'] as const;
export type VisitType = typeof TYPES[number];
export type Route = 'A' | 'B' | 'C' | 'N';
export const ROUTE_LABEL: Record<Route, string> = { A: '日勤A', B: '日勤B', C: '日勤C', N: '夜勤' };
export const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
export type Frequency = 'daily' | 'weekly' | 'multiple' | 'biweekly' | 'ordinal' | 'once';
export const FREQUENCY: Record<Frequency, string> = { daily: '毎日', weekly: '毎週', multiple: '週複数回', biweekly: '隔週', ordinal: '第○週', once: '単発' };
export const CARE_MINUTES = { I1: 19, I2: 29 } as const;
export type CareLevel = keyof typeof CARE_MINUTES;
export interface Client { id: string; code: string; name: string; type: VisitType; active: boolean; deleted?: boolean; notes: string }
export interface Staff { id: string; code: string; name: string; active: boolean; notes: string }
export interface Rule { id: string; seriesId: string; clientId: string; type: VisitType; careLevel?: CareLevel; days: number[]; time: string; duration: number; frequency: Frequency; ordinals: number[]; anchor: string; route: Route; from: string; until: string; notes: string }
export interface Visit { id: string; origin: string | null; ruleId: string | null; clientId: string; clientName: string; type: VisitType; careLevel?: CareLevel; businessDate: string; actualStart: string; time: string; duration: number; route: Route; notes: string; baseline: string | null }
export type Assignments = Record<string, Partial<Record<Route, string[]>>>;
export interface Week { start: string; status: 'draft' | 'confirmed'; visits: Visit[]; assignments: Assignments; deleted: Record<string, Visit>; updatedAt: string }
export interface History { id: string; at: string; target: string; message: string; before: string; after: string }
export interface Snapshot { id: string; at: string; facilityName: string; dayRoutes: 2 | 3; colors: Record<VisitType, string>; staff: Staff[]; week: Week }
export interface Facility { id: string; name: string; dayRoutes: 2 | 3; colors: Record<VisitType, string>; clients: Client[]; staff: Staff[]; rules: Rule[]; defaults: Assignments; weeks: Record<string, Week>; history: History[]; snapshots: Snapshot[] }
export interface AppData { version: 1; facilities: Facility[] }
export const emptyData = (): AppData => ({ version: 1, facilities: [] });
export const uid = () => crypto.randomUUID();
export function inkColor(hex:string):string {const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#000000':'#ffffff';}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function validDate(s: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
export function addDays(s: string, days: number): string { const d = new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export const weekday = (s: string) => new Date(s+'T00:00:00Z').getUTCDay();
export const weekStart = (s: string) => addDays(s, -weekday(s));
export const weekDates = (s: string) => Array.from({length:7}, (_,i) => addDays(s,i));
export function shiftMonth(month:string,offset:number):string {const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);}
export function monthDates(month:string):string[] {if(!validDate(month+'-01')) throw new Error('対象月が無効です。');const first=weekStart(month+'-01'),last=addDays(shiftMonth(month,1)+'-01',-1),end=addDays(weekStart(last),6);return Array.from({length:Math.round((Date.parse(end)-Date.parse(first))/86400000)+1},(_,i)=>addDays(first,i));}
export const routes = (f: Facility): Route[] => f.dayRoutes === 3 ? ['A','B','C','N'] : ['A','B','N'];
export function minutes(time: string): number { if (!/^(?:[0-3]?\d|4[0-7]):[0-5]\d$/.test(time)) throw new Error('時刻は0:00〜47:59の形式で入力してください。'); const [h,m] = time.split(':').map(Number); return h*60+m; }
export const timeText = (n: number) => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const actualStart = (date: string, time: string) => { const n = minutes(time); return `${addDays(date,Math.floor(n/1440))}T${timeText(n%1440)}:00`; };
export function createFacility(name: string): Facility { return {id:uid(), name, dayRoutes:3, colors:{介護:'#dcebd6',医療:'#f5d9ca',精神:'#dce6f5'},clients:[],staff:[],rules:[],defaults:{},weeks:{},history:[],snapshots:[]}; }
export function setCareLevel(item:Pick<Rule,'type'|'careLevel'|'duration'>,level:CareLevel|undefined) {item.careLevel=item.type==='介護'?level:undefined;if(item.careLevel) item.duration=CARE_MINUTES[item.careLevel];}
export function visitTypeText(item:Pick<Rule,'type'|'careLevel'>):string {return item.type==='介護' && item.careLevel?`介護Ⅰ${item.careLevel.slice(1)}`:item.type;}
function validateCare(item:Pick<Rule,'type'|'careLevel'|'duration'>) {if(item.careLevel!==undefined && (item.type!=='介護' || !Object.hasOwn(CARE_MINUTES,item.careLevel) || item.duration!==CARE_MINUTES[item.careLevel])) throw new Error('介護Ⅰ1は19分、介護Ⅰ2は29分で設定してください。');}
export function setClientDeleted(f:Facility,id:string,deleted:boolean) {const client=f.clients.find(c=>c.id===id);if(!client) throw new Error('利用者が見つかりません。');client.deleted=deleted;client.active=false;}
export function validateRule(f: Facility, rule: Rule) {
  if (!f.clients.some(c => c.id === rule.clientId)) throw new Error('利用者を選択してください。');
  if (!TYPES.includes(rule.type) || !routes(f).includes(rule.route)) throw new Error('訪問種類・ルートが無効です。');
  if (!validDate(rule.from) || (rule.until && (!validDate(rule.until) || rule.until < rule.from))) throw new Error('適用期間を確認してください。');
  if (!Number.isInteger(rule.duration) || rule.duration < 1 || rule.duration > 1440) throw new Error('所要時間は1〜1440分で入力してください。');
  validateCare(rule);
  if (rule.route !== 'N' && minutes(rule.time) >= 1440) throw new Error('24時以降は夜勤ルートを指定してください。');
  minutes(rule.time);
  if (!(rule.frequency in FREQUENCY)) throw new Error('頻度が無効です。');
  if (!['once','daily'].includes(rule.frequency) && (!rule.days.length || rule.days.some(d => !Number.isInteger(d) || d<0 || d>6))) throw new Error('訪問曜日を選択してください。');
  if (rule.frequency === 'weekly' && rule.days.length !== 1) throw new Error('毎週は曜日を1つ選択してください。複数曜日は週複数回を選んでください。');
  if (rule.frequency === 'biweekly' && !validDate(rule.anchor)) throw new Error('隔週の基準日を指定してください。');
  if (rule.frequency === 'ordinal' && (!rule.ordinals.length || rule.ordinals.some(n => !Number.isInteger(n) || n<1 || n>5))) throw new Error('第1〜第5の対象週を選んでください。');
}
export function matches(rule: Rule, date: string): boolean {
  if (date < rule.from || (rule.until && date > rule.until)) return false;
  if (rule.frequency === 'once') return date === rule.from;
  if (rule.frequency === 'daily') return true;
  if (!rule.days.includes(weekday(date))) return false;
  if (rule.frequency === 'biweekly') return Math.round((Date.parse(weekStart(date))-Date.parse(weekStart(rule.anchor)))/86400000) % 14 === 0;
  if (rule.frequency === 'ordinal') return rule.ordinals.includes(Math.floor((Number(date.slice(8))-1)/7)+1);
  return true;
}
export function signature(v: Visit): string { const fields=[v.clientId,v.clientName,v.type,v.businessDate,v.time,v.duration,v.route,v.notes];if(v.careLevel) fields.push(v.careLevel);return JSON.stringify(fields); }
export function generateWeek(f: Facility, start: string): Week {
  const visits: Visit[] = [], assignments: Assignments = {};
  for (const date of weekDates(start)) {
    assignments[date] = clone(f.defaults[String(weekday(date))] || {});
    for (const rule of f.rules) {
      const client = f.clients.find(c => c.id === rule.clientId && c.active && !c.deleted);
      if (!client || !matches(rule,date)) continue;
      const visit: Visit = {id:uid(),origin:`${rule.seriesId}/${date}`,ruleId:rule.id,clientId:client.id,clientName:client.name,type:rule.type,careLevel:rule.careLevel,businessDate:date,actualStart:actualStart(date,rule.time),time:timeText(minutes(rule.time)),duration:rule.duration,route:rule.route,notes:rule.notes,baseline:null};
      visit.baseline = signature(visit); visits.push(visit);
    }
  }
  return { start, status:'draft', visits, assignments, deleted:{}, updatedAt:new Date().toISOString() };
}
export interface Difference { key: string; kind: '追加' | '変更' | '削除候補' | '手動編集との競合'; before?: Visit; after?: Visit; selected: boolean }
export function differences(old: Week, generated: Week): Difference[] {
  const result: Difference[] = [];
  const oldMap = new Map(old.visits.filter(v=>v.origin).map(v=>[v.origin!,v]));
  const nextMap = new Map(generated.visits.map(v=>[v.origin!,v]));
  for (const [key,after] of nextMap) {
    const before = oldMap.get(key) || old.deleted[key];
    if (!before) result.push({key,kind:'追加',after,selected:true});
    else if (old.deleted[key] || signature(before)!==signature(after)) {
      const conflict = !!old.deleted[key] || signature(before)!==before.baseline;
      result.push({key,kind:conflict?'手動編集との競合':'変更',before,after,selected:!conflict});
    }
  }
  for (const [key,before] of oldMap) if (!nextMap.has(key)) {
    const conflict = signature(before)!==before.baseline;
    result.push({key,kind:conflict?'手動編集との競合':'削除候補',before,selected:!conflict});
  }
  return result;
}
export function applyDifferences(week: Week, diffs: Difference[]): Week {
  const result = clone(week);
  for (const diff of diffs.filter(d=>d.selected)) {
    result.visits = result.visits.filter(v=>v.origin!==diff.key);
    delete result.deleted[diff.key];
    if (diff.after) result.visits.push({...clone(diff.after),id:diff.before?.id || diff.after.id});
  }
  return result;
}
export function validateVisit(f: Facility, v: Visit, start: string) {
  if (!f.clients.some(c=>c.id===v.clientId) || !TYPES.includes(v.type) || !routes(f).includes(v.route)) throw new Error('利用者・訪問種類・ルートを確認してください。');
  if (!validDate(v.businessDate) || weekStart(v.businessDate)!==start) throw new Error('業務日は対象週の範囲内を指定してください。');
  if (!Number.isInteger(v.duration) || v.duration < 1 || v.duration > 1440) throw new Error('所要時間は1〜1440分です。');
  validateCare(v);
  if (v.route!=='N' && minutes(v.time)>=1440) throw new Error('24時以降は夜勤ルートを選択してください。');
  if (v.actualStart!==actualStart(v.businessDate,v.time)) throw new Error('業務日と実日時が一致していません。');
}
export function warnings(f: Facility, week: Week): string[] {
  const result: string[] = [];
  const all = [...week.visits,...Object.values(f.weeks).filter(w=>w.start!==week.start && w.start>=addDays(week.start,-7) && w.start<=addDays(week.start,7)).flatMap(w=>w.visits)];
  const currentIds=new Set(week.visits.map(v=>v.id));
  const abs = (v: Visit) => Date.parse(v.businessDate+'T00:00:00Z')/60000+minutes(v.time);
  all.sort((a,b)=>abs(a)-abs(b));
  for (let i=0;i<all.length;i++) for (let j=i+1;j<all.length;j++) {
    const a=all[i], b=all[j];
    if(abs(b)>=abs(a)+a.duration) break;
    if (!currentIds.has(a.id) && !currentIds.has(b.id)) continue;
    if (abs(a)<abs(b)+b.duration && abs(b)<abs(a)+a.duration) {
      const aw=currentIds.has(a.id)?week:f.weeks[weekStart(a.businessDate)], bw=currentIds.has(b.id)?week:f.weeks[weekStart(b.businessDate)];
      const staffOverlap=(aw?.assignments[a.businessDate]?.[a.route] || []).some(id=>bw?.assignments[b.businessDate]?.[b.route]?.includes(id));
      if(a.route===b.route || a.clientId===b.clientId || staffOverlap) result.push(`${a.businessDate} ${a.time} ${a.clientName} ／ ${b.businessDate} ${b.time} ${b.clientName}：${a.route===b.route?ROUTE_LABEL[a.route]+'の時間重複':a.clientId===b.clientId?'同じ利用者の時間重複':'担当職員の時間重複'}`);
    }
  }
  for (const date of weekDates(week.start)) for (const route of routes(f)) {
    const ids=week.assignments[date]?.[route] || [];
    if (week.visits.some(v=>v.businessDate===date && v.route===route) && !ids.length) result.push(`${date} ${ROUTE_LABEL[route]}：担当職員が未設定`);
    if (ids.some(id=>!f.staff.some(s=>s.id===id && s.active))) result.push(`${date} ${ROUTE_LABEL[route]}：利用終了の職員が含まれます`);
  }
  if (week.visits.some(v=>!routes(f).includes(v.route))) result.push('現在の施設設定にないルートの予定があります。3ルート設定へ戻して確認してください。');
  return [...new Set(result)];
}
export function splitRule(f: Facility, visit: Visit, change: Visit | null) {
  const rule = f.rules.find(r=>r.id===visit.ruleId && matches(r,visit.businessDate)) || f.rules.find(r=>`${r.seriesId}/${visit.businessDate}`===visit.origin && matches(r,visit.businessDate));
  if (!rule) throw new Error('元の定期訪問設定がありません。この日だけ変更するか定期訪問設定を確認してください。');
  const future = change ? {...clone(rule),id:uid(),from:visit.businessDate,clientId:change.clientId,type:change.type,careLevel:change.careLevel,time:change.time,duration:change.duration,route:change.route,notes:change.notes} : null;
  if (rule.from===visit.businessDate) f.rules=f.rules.filter(r=>r.id!==rule.id);
  else rule.until=addDays(visit.businessDate,-1);
  if (future) { validateRule(f,future); f.rules.push(future); }
}
export function swapRoutes(week: Week, date: string, a: Route, b: Route, includeStaff: boolean): Week {
  if (a===b) throw new Error('異なるルートを選択してください。');
  const result=clone(week);
  for (const v of result.visits.filter(v=>v.businessDate===date)) { if (v.route===a) v.route=b; else if (v.route===b) v.route=a; }
  if (includeStaff) { const values=result.assignments[date] ||= {}; const temp=values[a] || []; values[a]=values[b] || []; values[b]=temp; }
  return result;
}
export function moveVisitInWeek(f:Facility,week:Week,id:string,date:string,route:Route):Week {const result=clone(week),visit=result.visits.find(v=>v.id===id);if(!visit) throw new Error('移動する予定が見つかりません。');visit.businessDate=date;visit.route=route;visit.actualStart=actualStart(date,visit.time);validateVisit(f,visit,result.start);result.updatedAt=new Date().toISOString();return result;}
export function confirmWeek(f: Facility, week: Week) {
  week.status='confirmed';
  f.snapshots.push({id:uid(),at:new Date().toISOString(),facilityName:f.name,dayRoutes:f.dayRoutes,colors:clone(f.colors),staff:clone(f.staff),week:clone(week)});
}
export const assignmentNames = (f: Pick<Facility,'staff'>, w: Week, date: string, route: Route) => (w.assignments[date]?.[route] || []).map(id=>f.staff.find(s=>s.id===id)?.name || '不明な職員').join('・');
export function ruleSummary(rule: Rule): string { return `${FREQUENCY[rule.frequency]} ${rule.frequency==='once'?rule.from:rule.frequency==='daily'?'':rule.days.map(d=>DAYS[d]).join('・')} ${rule.frequency==='ordinal'?'第'+rule.ordinals.join('・')+'週 ':''}${rule.time} / ${rule.duration}分 / ${ROUTE_LABEL[rule.route]}${rule.careLevel?' / '+visitTypeText(rule):''}`; }

// Import validation is deliberately strict: reject the entire file before changing any saved data.
export function validateData(value: unknown): asserts value is AppData {
  const fail=()=>{throw new Error('バックアップの形式・参照関係が不正です。元のデータは変更していません。');};
  if (!value || typeof value!=='object') fail();
  const data=value as AppData;
  if (data.version!==1 || !Array.isArray(data.facilities)) fail();
  const used=new Set<string>();
  const id=(s: unknown)=> {if(typeof s!=='string' || !s || used.has(s)) fail();used.add(s as string);};
  const text=(s:unknown)=>{if(typeof s!=='string' || s.length>1000000) fail();};
  for (const f of data.facilities) {
    id(f.id);text(f.name);if(!f.name.trim() || ![2,3].includes(f.dayRoutes) || !f.colors || TYPES.some(t=>!/^#[0-9a-f]{6}$/i.test(f.colors[t]))) fail();
    if (![f.clients,f.staff,f.rules,f.history,f.snapshots].every(Array.isArray) || !f.weeks || !f.defaults) fail();
    for (const c of f.clients) {id(c.id);text(c.code);text(c.name);text(c.notes);if(!c.name.trim() || !TYPES.includes(c.type) || typeof c.active!=='boolean' || (c.deleted!==undefined && typeof c.deleted!=='boolean')) fail();}
    for (const s of f.staff) {id(s.id);text(s.code);text(s.name);text(s.notes);if(!s.name.trim() || typeof s.active!=='boolean') fail();}
    if (new Set(f.clients.map(c=>c.code)).size!==f.clients.length || new Set(f.staff.map(s=>s.code)).size!==f.staff.length) fail();
    for (const r of f.rules) {id(r.id);text(r.seriesId);text(r.notes);if(!Array.isArray(r.days) || !Array.isArray(r.ordinals)) fail();validateRule(f,r);}
    for (let i=0;i<f.rules.length;i++) for(let j=i+1;j<f.rules.length;j++) {const a=f.rules[i],b=f.rules[j]; if(a.seriesId===b.seriesId && a.from<=(b.until||'9999-12-31') && b.from<=(a.until||'9999-12-31')) fail();}
    const checkAssignments=(assignments:Assignments,defaults:boolean)=>{
      if(!assignments || typeof assignments!=='object' || Array.isArray(assignments)) fail();
      for(const [date,entries] of Object.entries(assignments)) {
        if(defaults?!/^[0-6]$/.test(date):!validDate(date)) fail();
        if(!entries || typeof entries!=='object') fail();
        for(const [route,ids] of Object.entries(entries)) if(!['A','B','C','N'].includes(route) || !Array.isArray(ids) || new Set(ids).size!==ids.length || ids.some(id=>!f.staff.some(s=>s.id===id))) fail();
      }
    };
    checkAssignments(f.defaults,true);
    const checkWeek=(w:Week,historical=false)=>{
      if(!w || !validDate(w.start) || weekStart(w.start)!==w.start || !['draft','confirmed'].includes(w.status) || !Array.isArray(w.visits) || !w.deleted || typeof w.deleted!=='object') fail();
      text(w.updatedAt); checkAssignments(w.assignments,false);
      const visitIds=new Set<string>(), origins=new Set<string>();
      for(const v of [...w.visits,...Object.values(w.deleted)]) {
        text(v.id);text(v.clientName);text(v.notes);text(v.time);
        if(visitIds.has(v.id)) fail();visitIds.add(v.id);
        if(v.origin!==null) {text(v.origin);if(origins.has(v.origin)) fail();origins.add(v.origin);}
        if(v.baseline!==null) {text(v.baseline);let baseline:unknown;try {baseline=JSON.parse(v.baseline);} catch {fail();}if(!Array.isArray(baseline) || ![8,9].includes(baseline.length) || !f.clients.some(c=>c.id===baseline[0]) || (baseline.length===9 && !Object.hasOwn(CARE_MINUTES,baseline[8]))) fail();}
        if(v.origin!==null) {const parts=v.origin.split('/');if(parts.length!==2 || !parts[0] || !validDate(parts[1])) fail();}
        if(v.ruleId!==null) text(v.ruleId);
        validateVisit({...f,dayRoutes:3},v,w.start);
      }
      if(!historical && Object.keys(w.assignments).some(d=>weekStart(d)!==w.start)) fail();
      for(const [key,v] of Object.entries(w.deleted)) if(key!==v.origin) fail();
    };
    for(const [key,w] of Object.entries(f.weeks)) {if(key!==w.start) fail();checkWeek(w);}
    for(const h of f.history) {id(h.id);text(h.at);text(h.target);text(h.message);text(h.before);text(h.after);}
    for(const s of f.snapshots) {id(s.id);text(s.at);text(s.facilityName);if(![2,3].includes(s.dayRoutes) || !Array.isArray(s.staff) || !s.colors || TYPES.some(t=>!/^#[0-9a-f]{6}$/i.test(s.colors[t]))) fail();checkWeek(s.week,true);for(const person of s.staff) {text(person.id);text(person.name);}}
  }
}
export function copyFacility(source:Facility):Facility {
  const f=clone(source),map=new Map<string,string>();
  const get=(id:string)=>{if(!map.has(id)) map.set(id,uid());return map.get(id)!;};
  f.id=get(f.id);f.name+='（取込）';f.clients.forEach(c=>c.id=get(c.id));f.staff.forEach(s=>s.id=get(s.id));
  f.rules.forEach(r=>{r.id=get(r.id);r.seriesId=get(r.seriesId);r.clientId=get(r.clientId);});
  const assignments=(a:Assignments)=>Object.values(a).forEach(entries=>Object.keys(entries).forEach(r=>{const route=r as Route;entries[route]=entries[route]?.map(get);}));
  const rewrite=(w:Week)=>{
    assignments(w.assignments);
    for(const v of [...w.visits,...Object.values(w.deleted)]) {
      v.id=get(v.id);v.clientId=get(v.clientId);if(v.ruleId) v.ruleId=get(v.ruleId);
      if(v.origin) {const [series,date]=v.origin.split('/');v.origin=`${get(series)}/${date}`;}
      if(v.baseline) {const baseline=JSON.parse(v.baseline);baseline[0]=get(baseline[0]);v.baseline=JSON.stringify(baseline);}
    }
    w.deleted=Object.fromEntries(Object.values(w.deleted).map(v=>[v.origin!,v]));
  };
  assignments(f.defaults);Object.values(f.weeks).forEach(rewrite);
  f.snapshots.forEach(s=>{s.id=get(s.id);s.staff.forEach(p=>p.id=get(p.id));rewrite(s.week);});
  // Imported history remains a verbatim record of the source; its entity IDs are historical text.
  f.history.forEach(h=>h.id=get(h.id));return f;
}
export function demoFacility(): Facility {
  const f=createFacility('サンプル訪問看護ステーション');
  f.staff=['職員あおい','職員みどり','職員さくら','職員そら'].map((name,i)=>({id:uid(),code:`S00${i+1}`,name,active:true,notes:'架空のデータです'}));
  const names=['サンプル 花子','サンプル 太郎','サンプル 春子','サンプル 一郎','サンプル 夏子','サンプル 次郎'];
  f.clients=names.map((name,i)=>({id:uid(),code:`U00${i+1}`,name,type:TYPES[i%3],active:true,notes:'架空のデータです'}));
  const start=weekStart(today());
  f.clients.forEach((c,i)=>{ const id=uid();f.rules.push({id,seriesId:id,clientId:c.id,type:c.type,days:i===5?[1,3,5]:[0,1,2,3,4,5,6],time:['09:00','09:35','10:10','13:00','17:30','24:30'][i],duration:30,frequency:'multiple',ordinals:[1,3],anchor:start,route:(['A','B','C','A','N','N'] as Route[])[i],from:start,until:'',notes:''}); });
  for(let i=0;i<7;i++) f.defaults[String(i)]={A:[f.staff[0].id],B:[f.staff[1].id],C:[f.staff[2].id],N:[f.staff[3].id]};
  return f;
}
