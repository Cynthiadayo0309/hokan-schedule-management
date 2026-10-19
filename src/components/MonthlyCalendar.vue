<script setup lang="ts">
import { computed } from 'vue';
import { DAYS,monthDates,routes,ROUTE_LABEL,weekStart,type Facility } from '../domain';
const props=defineProps<{facility:Facility;month:string}>();
const emit=defineEmits<{day:[date:string]}>();
const dates=computed(()=>monthDates(props.month));
function week(date:string) {return props.facility.weeks[weekStart(date)];}
function visits(date:string) {return week(date)?.visits.filter(v=>v.businessDate===date) || [];}
</script>
<template>
  <div class="month-scroll"><table class="month-calendar"><thead><tr><th v-for="label in DAYS" :key="label">{{label}}曜日</th></tr></thead>
    <tbody><tr v-for="row in dates.length/7" :key="row"><td v-for="date in dates.slice((row-1)*7,row*7)" :key="date" :class="{'outside-month':!date.startsWith(month)}">
      <button class="month-day" :aria-label="`${date}の日別スケジュールを開く`" @click="emit('day',date)">{{Number(date.slice(8))}}<span v-if="week(date)" class="badge">{{week(date)!.status==='confirmed'?'確定':'下書き'}}</span><span v-else class="muted">未作成</span></button>
      <template v-if="week(date)"><strong class="month-count">訪問 {{visits(date).length}}件</strong><div v-for="route in routes(facility)" :key="route" class="month-route"><span>{{ROUTE_LABEL[route]}}</span><strong>{{visits(date).filter(v=>v.route===route).length}}件</strong></div></template>
      <button v-else class="text-button month-create no-print" @click="emit('day',date)">この日を開く</button>
    </td></tr></tbody>
  </table></div>
</template>
