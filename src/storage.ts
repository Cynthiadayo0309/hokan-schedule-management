import { invoke, isTauri } from '@tauri-apps/api/core';
import { emptyData, validateData, type AppData } from './domain';
export const desktop = isTauri();
let revision = 0;
export async function loadData(): Promise<AppData> {
  const stored: { revision: number; data: string | null } = desktop ? await invoke('load_state') : JSON.parse(localStorage.getItem('visit-schedule-v1') || '{"revision":0,"data":null}');
  revision=stored.revision;
  const data=stored.data ? JSON.parse(stored.data) : emptyData(); validateData(data); return data;
}
export async function saveData(data: AppData) {
  validateData(data);
  const serialized=JSON.stringify(data);
  if(desktop) revision=await invoke<number>('save_state',{data:serialized,expectedRevision:revision});
  else {const current=JSON.parse(localStorage.getItem('visit-schedule-v1') || '{"revision":0}');if(current.revision!==revision) throw new Error('別の画面で保存されました。再起動して最新データを開いてください。');localStorage.setItem('visit-schedule-v1',JSON.stringify({revision:revision+1,data:serialized}));revision++;}
}
export async function saveFile(name:string, bytes:Uint8Array, extension:'xlsx'|'json'):Promise<boolean> {
  if(desktop) return invoke<boolean>('export_file',{name,bytes:Array.from(bytes),extension});
  const blob=new Blob([new Uint8Array(bytes)],{type:extension==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;
}
export async function readBackup():Promise<string|null> {
  if(desktop) return invoke('import_file');
  return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{const file=input.files?.[0];resolve(file?await file.text():null);};input.oncancel=()=>resolve(null);input.click();});
}
