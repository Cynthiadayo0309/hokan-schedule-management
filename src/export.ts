import ExcelJS from 'exceljs';
import { assignmentNames, DAYS, inkColor, ROUTE_LABEL, visitTypeText, weekDates, weekday, type Facility, type Route, type Week } from './domain';
import { gridRows } from './schedule';
import { saveFile } from './storage';
export async function workbookFor(f:Facility,w:Week,date?:string) {
  const book=new ExcelJS.Workbook();book.creator='訪問スケジュール管理';
  const sheet=book.addWorksheet(date?'日別スケジュール':'週間スケジュール');
  const dates=date?[date]:weekDates(w.start), count=f.dayRoutes, last=1+dates.length*count;
  sheet.properties.defaultRowHeight=23;
  sheet.getColumn(1).width=12;
  for(let i=2;i<=last;i++) sheet.getColumn(i).width=date?30:15;
  sheet.mergeCells(1,1,1,last);sheet.getCell(1,1).value=`${f.name}　${date || `${w.start} 〜 ${weekDates(w.start)[6]}`}　${w.status==='draft'?'【下書き】':'【確定】'}`;
  sheet.getCell(1,1).font={name:'Yu Gothic',bold:true,size:14};sheet.getRow(1).height=30;
  sheet.getCell(2,1).value='時刻';sheet.mergeCells(2,1,4,1);
  dates.forEach((d,di)=>{
    const first=2+di*count;sheet.mergeCells(2,first,2,first+count-1);sheet.getCell(2,first).value=`${d}（${DAYS[weekday(d)]}）`;
    for(let ri=0;ri<count;ri++) {const route=(['A','B','C'] as Route[])[ri];sheet.getCell(3,first+ri).value=ROUTE_LABEL[route];sheet.getCell(4,first+ri).value=assignmentNames(f,w,d,route)||'担当未設定';}
  });
  sheet.getRow(4).height=32;
  sheet.getCell(5,1).value='夜勤担当';
  dates.forEach((d,di)=>{const first=2+di*count;sheet.mergeCells(5,first,5,first+count-1);sheet.getCell(5,first).value=assignmentNames(f,w,d,'N')||'担当未設定';});
  let row=6;
  for(const item of gridRows(f,w,dates)) {
    sheet.getCell(row,1).value=item.time+(item.night?' 夜':'');
    dates.forEach((d,di)=>{
      const first=2+di*count;
      for(let ri=0;ri<(item.night?1:count);ri++) {
        const route:Route=item.night?'N':(['A','B','C'] as Route[])[ri];
        if(item.night) sheet.mergeCells(row,first,row,first+count-1);
        const v=w.visits.filter(v=>v.businessDate===d && v.route===route && v.time===item.time)[item.slot];
        if(v) {const c=sheet.getCell(row,first+ri);c.value=`${v.clientName}\n${v.time} / ${v.duration}分 / ${visitTypeText(v)}${v.notes?'\n'+v.notes:''}`;c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+f.colors[v.type].slice(1)}};c.font={color:{argb:'FF'+inkColor(f.colors[v.type]).slice(1)}};}
      }
    });
    sheet.getRow(row).height=42;row++;
  }
  if(row===6) {sheet.mergeCells(row,1,row,last);sheet.getCell(row,1).value='訪問予定はありません';row++;}
  sheet.mergeCells(row,1,row,last);sheet.getCell(row,1).value='介護・医療・精神はセルの背景色で表示。24時以降は夜勤開始日の業務日です。';
  for(let r=2;r<=row;r++) for(let c=1;c<=last;c++) {
    const cell=sheet.getCell(r,c);cell.font={...cell.font,name:'Yu Gothic',size:date?10:9};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
    cell.border={top:{style:'thin',color:{argb:'FF9DA8B5'}},bottom:{style:'thin',color:{argb:'FF9DA8B5'}},left:{style:'thin',color:{argb:'FF9DA8B5'}},right:{style:'thin',color:{argb:'FF9DA8B5'}}};
    if(r<=5) {cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F2'}};cell.font={...cell.font,bold:true};}
  }
  sheet.views=[{state:'frozen',xSplit:1,ySplit:5}];
  // ExcelJS's type enum omits A3 (OOXML paper size 8), although the writer accepts it.
  sheet.pageSetup={paperSize:(date?9:8) as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5',margins:{left:.2,right:.2,top:.3,bottom:.3,header:.1,footer:.1}};
  sheet.headerFooter.oddFooter='&C&P / &N';sheet.pageSetup.printArea=`A1:${sheet.getColumn(last).letter}${row}`;
  return book;
}
export async function exportExcel(f:Facility,w:Week,date?:string) { const book=await workbookFor(f,w,date);return saveFile(`訪問スケジュール_${date||w.start}.xlsx`,new Uint8Array(await book.xlsx.writeBuffer()),'xlsx'); }
