<script setup lang="ts">
import { computed } from 'vue';
import { assignmentNames,DAYS,inkColor,ROUTE_LABEL,weekDates,weekday,type Facility,type Route,type Visit,type Week } from '../domain';
import { gridRows } from '../schedule';
const props=defineProps<{facility:Facility;week:Week;date?:string;readonly?:boolean}>();
const emit=defineEmits<{day:[date:string];edit:[visit:Visit];move:[id:string,date:string,route:Route]}>();
const dates=computed(()=>props.date?[props.date]:weekDates(props.week.start));
const dayRoutes=computed<Route[]>(()=>props.facility.dayRoutes===3?['A','B','C']:['A','B']);
const rows=computed(()=>gridRows(props.facility,props.week,dates.value));
function cell(date:string,route:Route,time:string,slot:number) {return props.week.visits.filter(v=>v.businessDate===date && v.route===route && v.time===time)[slot];}
function drag(event:DragEvent,v:Visit) {event.dataTransfer?.setData('text/plain',v.id);}
function drop(event:DragEvent,date:string,route:Route) {if(!props.readonly) emit('move',event.dataTransfer?.getData('text/plain') || '',date,route);}
</script>
<template>
  <div class="schedule-scroll">
    <table class="schedule" :class="{daily:date}">
      <colgroup><col class="time-col"><template v-for="day in dates" :key="day"><col v-for="route in dayRoutes" :key="route"></template></colgroup>
      <thead>
        <tr><th rowspan="3" class="time-heading">時刻</th><th v-for="day in dates" :key="day" :colspan="dayRoutes.length" :class="{sunday:weekday(day)===0,saturday:weekday(day)===6}"><button class="day-button" @click="emit('day',day)">{{Number(day.slice(5,7))}}/{{Number(day.slice(8))}} <span>（{{DAYS[weekday(day)]}}）</span></button></th></tr>
        <tr><template v-for="day in dates" :key="day"><th v-for="route in dayRoutes" :key="route">{{ROUTE_LABEL[route]}}</th></template></tr>
        <tr><template v-for="day in dates" :key="day"><th v-for="route in dayRoutes" :key="route" class="staff-heading">{{assignmentNames(facility,week,day,route)||'担当未設定'}}</th></template></tr>
        <tr class="night-staff"><th>夜勤担当</th><th v-for="day in dates" :key="day" :colspan="dayRoutes.length">{{assignmentNames(facility,week,day,'N')||'担当未設定'}}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row,index) in rows" :key="index" :class="{'night-row':row.night}">
          <th>{{row.time}}<small v-if="row.night">夜勤</small></th>
          <template v-for="day in dates" :key="day">
            <td v-for="route in row.night?(['N'] as Route[]):dayRoutes" :key="route" :colspan="row.night?dayRoutes.length:1" @dragover.prevent @drop.prevent="drop($event,day,route)">
              <button v-if="cell(day,route,row.time,row.slot)" class="visit-card" :style="{background:facility.colors[cell(day,route,row.time,row.slot)!.type],color:inkColor(facility.colors[cell(day,route,row.time,row.slot)!.type])}" :draggable="!readonly" :aria-label="`${day} ${row.time} ${cell(day,route,row.time,row.slot)!.clientName} 編集`" @dragstart="drag($event,cell(day,route,row.time,row.slot)!)" @click="emit('edit',cell(day,route,row.time,row.slot)!)">
                <strong>{{cell(day,route,row.time,row.slot)!.clientName}}</strong><span>{{cell(day,route,row.time,row.slot)!.duration}}分 · {{cell(day,route,row.time,row.slot)!.type}}</span><small v-if="date">{{cell(day,route,row.time,row.slot)!.notes}}</small>
              </button>
            </td>
          </template>
        </tr>
        <tr v-if="!rows.length"><td :colspan="1+dates.length*dayRoutes.length" class="empty-table">訪問予定はありません。定期訪問設定を登録し、スケジュールを生成してください。</td></tr>
      </tbody>
    </table>
  </div>
</template>
