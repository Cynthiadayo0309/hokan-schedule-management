import { minutes, type Facility, type Week } from './domain';
export function gridRows(f: Facility,w: Week,dates:string[]) {
  const visits=w.visits.filter(v=>dates.includes(v.businessDate));
  const times=[...new Set(visits.map(v=>v.time))].sort((a,b)=>minutes(a)-minutes(b));
  return times.flatMap(time=>[false,true].flatMap(night=>{
    const at=visits.filter(v=>v.time===time && (v.route==='N')===night);
    let count=0;
    for(const date of dates) for(const route of night?['N']:f.dayRoutes===3?['A','B','C']:['A','B']) count=Math.max(count,at.filter(v=>v.businessDate===date && v.route===route).length);
    return Array.from({length:count},(_,slot)=>({time,night,slot}));
  }));
}
