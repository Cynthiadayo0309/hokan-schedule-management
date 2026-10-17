import { it,expect } from 'vitest';
import { createFacility,generateWeek,uid, type Rule } from './domain';
import { workbookFor } from './export';
it('週間・日別Excelが同時刻の複数訪問と夜勤を欠落せずセルとして出力する',async()=>{
  const f=createFacility('Excelテスト施設');const start='2026-10-11';
  for(let i=0;i<4;i++) {const c={id:uid(),code:'U'+i,name:'出力確認'+i,type:'介護' as const,active:true,notes:''};f.clients.push(c);const id=uid();const r:Rule={id,seriesId:id,clientId:c.id,type:'介護',days:[0],time:'09:35',duration:30,frequency:'weekly',ordinals:[],anchor:start,route:i===3?'N':'A',from:start,until:'',notes:''};f.rules.push(r);}
  const w=generateWeek(f,start);
  for(const date of [undefined,start]) {const book=await workbookFor(f,w,date);const values:string[]=[];book.worksheets[0].eachRow(row=>row.eachCell(c=>{if(c.type!==1 && typeof c.value==='string') values.push(c.value);}));for(let i=0;i<4;i++) expect(values.some(s=>s.includes('出力確認'+i))).toBe(true);expect(book.worksheets[0].getImages()).toHaveLength(0);const bytes=await book.xlsx.writeBuffer();expect(bytes.byteLength).toBeGreaterThan(1000);}
});
