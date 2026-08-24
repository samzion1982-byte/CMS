/* ═══════════════════════════════════════════════════════════════
   EventPlannerPage.jsx
   Views: Year · Month · Week · Agenda · Cards · Board (Kanban)
  Features: click-to-add, event color & status,
             board filters, smart carry-forward
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, pointerWithin, useDroppable, useDraggable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Calendar, Plus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil, Trash2,
  User, CalendarDays, Copy, LayoutGrid, CheckCircle2, List,
  Grid3X3, Filter, X, SlidersHorizontal, Search, BarChart2,
  AlertCircle, Clock, Repeat, Settings, GripVertical, Download, FileSpreadsheet,
} from 'lucide-react'
import { supabase, getChurch } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  getEvents, saveEvent, deleteEvent,
  getBuckets, saveBucket, deleteBucket,
  getTasks, getTasksForEvents, saveTask, deleteTask,
  updateTaskOrder, updateBucketOrder, moveTask, carryForward,
  getTaskLibrary, updateLibraryTaskOrder, cloneLibraryTaskToEvent,
  addLibraryCategory, updateLibraryItemName, addLibrarySubtask, deleteLibraryItem,
  getEventVolunteers, saveEventVolunteer, deleteEventVolunteer, replaceEventPlannerMasterData,
  getBucketsForEvents,
  autoFillRecurring,
} from '../lib/eventPlannerLib'
import { sendWhatsAppMessage } from '../lib/whatsapp'
import { exportToExcelWithTitle, exportMultiSheetWithTitle } from '../lib/exportExcel'
import PageHeader from '../components/ui/PageHeader'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { isPlusHotkey, isTypingTarget } from '../lib/plusHotkey'

// ── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#0ea5e9','#64748b','#be123c',
]

const EVENT_TYPES = [
  { value:'annual',   label:'Annual'   },
  { value:'monthly',  label:'Monthly'  },
  { value:'weekly',   label:'Weekly'   },
  { value:'one-time', label:'One-time' },
]

const EVENT_STATUSES = [
  { value:'planning',   label:'Planning',   bg:'#fff7ed', text:'#c2410c' },
  { value:'active',     label:'Active',     bg:'#dcfce7', text:'#16a34a' },
  { value:'completed',  label:'Completed',  bg:'#f1f5f9', text:'#64748b' },
  { value:'cancelled',  label:'Cancelled',  bg:'#fee2e2', text:'#dc2626' },
]

const PRIORITIES = [
  { value:'high',   label:'High',   color:'#ef4444' },
  { value:'medium', label:'Medium', color:'#f97316' },
  { value:'low',    label:'Low',    color:'#22c55e' },
]

const TASK_STATUSES = [
  { value:'pending',     label:'Pending',     bg:'#f1f5f9', text:'#475569' },
  { value:'in-progress', label:'In Progress', bg:'#dbeafe', text:'#1d4ed8' },
  { value:'done',        label:'Done',        bg:'#dcfce7', text:'#16a34a' },
]

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
// Week-start-aware day label helpers (ws: 0=Sunday, 1=Monday)
function getDayAbbrs(ws){ const A=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return [...A.slice(ws),...A.slice(0,ws)] }
function getDaySingle(ws){ const A=['S','M','T','W','T','F','S']; return [...A.slice(ws),...A.slice(0,ws)] }

const BLANK_EVENT  = { name:'', event_type:'annual', start_date:'', end_date:'', year:new Date().getFullYear(), color:null, status:'planning', date_fixed:false, is_recurring:false }

function addOneYear(ds){ if(!ds)return null; const[y,m,d]=ds.split('-'); return `${parseInt(y)+1}-${m}-${d}` }
function WhatsAppIcon({ size=14, color='#fff' }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.671.15-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.447-.52.149-.173.198-.297.298-.497.099-.198.05-.372-.025-.521-.075-.148-.671-1.611-.92-2.207-.242-.579-.487-.5-.671-.51l-.572-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.262.489 1.693.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.007-1.413.248-.694.248-1.289.173-1.414-.074-.124-.273-.198-.57-.347z"/>
      <path d="M12.004 2C6.476 2 2 6.477 2 12.004c0 2.115.632 4.078 1.729 5.74L2 22l4.407-1.154A9.963 9.963 0 0 0 12.004 22c5.527 0 10.004-4.477 10.004-9.996C22.008 6.477 17.53 2 12.004 2Z"/>
    </svg>
  )
}
const BLANK_BUCKET = { name:'', color:'#6366f1' }
const BLANK_TASK   = { title:'', bucket_id:'', assigned_to:'', due_date:'', priority:'medium', status:'pending', notes:'' }

const STATUS_CYCLE = ['pending','in-progress','done']

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDate(s) {
  if (!s) return ''
  const [y,m,d] = s.split('-')
  return `${d}-${m}-${y}`
}

function fmtDateTime(date) {
  if (!date) return ''
  const pad = v => String(v).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fmtDateTimeValue(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? fmtDateTime(date) : ''
}

function parseDateOnly(dateString) {
  if (!dateString) return null
  const [year, month, day] = String(dateString).split('-').map(v => parseInt(v, 10))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, 9, 0, 0)
}

function getEventWhatsAppSchedule(event) {
  const startDate = parseDateOnly(event?.start_date)
  if (!startDate) {
    return {
      whatsapp_scheduled: '',
      whatsapp_followup_1: '',
      whatsapp_followup_2: '',
    }
  }
  return {
    whatsapp_scheduled: fmtDateTime(startDate),
    whatsapp_followup_1: fmtDateTime(new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)),
    whatsapp_followup_2: fmtDateTime(new Date(startDate.getTime() - 2 * 24 * 60 * 60 * 1000)),
  }
}

function normalizeDateKey(s) {
  if (!s) return ''
  const v = String(s)
  return v.length >= 10 ? v.slice(0, 10) : v
}

function getEventDateRange(event) {
  if (!event) return ''
  if (event.start_date) {
    return event.end_date && event.end_date !== event.start_date
      ? `${fmtDate(event.start_date)} – ${fmtDate(event.end_date)}`
      : fmtDate(event.start_date)
  }
  return event.year ? String(event.year) : '—'
}

function safeFileName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'export'
}

function normalizeSheetName(value) {
  return String(value || 'Sheet')
    .replace(/[\\/?*\[\]:]/g, '')
    .slice(0, 28)
    .trim() || 'Sheet'
}

function getEventTypeLabel(type) {
  return EVENT_TYPES.find(t => t.value === type)?.label || String(type || 'Event')
}

function getEventStatusLabel(status) {
  return evtStatusStyle(status).label || String(status || 'Status')
}

function buildEventTaskRows(event, buckets, tasks) {
  const parentById = new Map((tasks || []).map(t => [t.id, t]))
  const childrenByParent = {}
  ;(tasks || []).forEach(task => {
    if (task.parent_id) {
      if (!childrenByParent[task.parent_id]) childrenByParent[task.parent_id] = []
      childrenByParent[task.parent_id].push(task)
    }
  })

  const normalizeNames = value => [...new Set(String(value || '').split(/[;,]+/).map(v => v.trim()).filter(Boolean))]
  const topLevelTasks = (tasks || []).filter(task => !task.parent_id)

  // Group top-level tasks by title so duplicate parent tasks (same name) are merged
  const grouped = {}
  topLevelTasks.forEach(t => {
    const key = (t.title || '').toLowerCase()
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  })

  const rows = []

  const getTaskWhatsAppTimestamps = task => ({
    whatsapp_scheduled: fmtDateTimeValue(task?.whatsapp_sent_at),
    whatsapp_followup_1: fmtDateTimeValue(task?.whatsapp_followup_1_sent_at),
    whatsapp_followup_2: fmtDateTimeValue(task?.whatsapp_followup_2_sent_at),
  })

  Object.values(grouped).forEach(group => {
    const rootTask = group.find(t => t.whatsapp_sent_at || t.whatsapp_followup_1_sent_at || t.whatsapp_followup_2_sent_at) || group[0]
    const whatsappActual = getTaskWhatsAppTimestamps(rootTask)

    // Combine parent assignees from all parents with same title
    const parentAssigneesArr = [...new Set(group.flatMap(g => normalizeNames(g.assigned_to)))]
    const parentAssignees = parentAssigneesArr.join(', ')

    // Collect all children across the grouped parent tasks
    const allChildren = []
    group.forEach(g => {
      const kids = childrenByParent[g.id] || []
      allChildren.push(...kids)
    })

    // Parent row: keep unassigned subtasks
    const unassignedSubtasks = allChildren.filter(c => normalizeNames(c.assigned_to).length === 0)
    const assignedChildren = allChildren.filter(c => normalizeNames(c.assigned_to).length > 0)

    rows.push({
      task: group[0].title || '',
      subtasks: unassignedSubtasks.map(child => child.title || '').join('; '),
      assigned_to: parentAssignees,
      sub_assigned_to: '',
      reports_to: '',
      whatsapp_count: Number(Math.max(...group.map(t => t.whatsapp_sent_count || 0))),
      whatsapp_scheduled: whatsappActual.whatsapp_scheduled,
      whatsapp_followup_1: whatsappActual.whatsapp_followup_1,
      whatsapp_followup_2: whatsappActual.whatsapp_followup_2,
      notes: group[0].notes || '',
    })

    // Emit a separate row for each assigned child (child becomes its own row)
    assignedChildren.forEach(child => {
      const childAssignedArr = normalizeNames(child.assigned_to)
      const childAssigned = childAssignedArr.join(', ')
      rows.push({
        task: group[0].title || '',
        subtasks: '» ' + (child.title || ''),
        assigned_to: parentAssignees,
        sub_assigned_to: childAssigned,
        reports_to: parentAssignees,
        whatsapp_count: Number(child.whatsapp_sent_count || 0),
        whatsapp_scheduled: whatsappActual.whatsapp_scheduled,
        whatsapp_followup_1: whatsappActual.whatsapp_followup_1,
        whatsapp_followup_2: whatsappActual.whatsapp_followup_2,
        notes: child.notes || '',
      })
    })
  })

  // In case there are orphan subtasks without a parent task
  ;(tasks || []).filter(task => task.parent_id && !parentById.has(task.parent_id)).forEach(child => {
    const childWhatsApp = {
      whatsapp_scheduled: fmtDateTimeValue(child.whatsapp_sent_at),
      whatsapp_followup_1: fmtDateTimeValue(child.whatsapp_followup_1_sent_at),
      whatsapp_followup_2: fmtDateTimeValue(child.whatsapp_followup_2_sent_at),
    }
    rows.push({
      task: child.title || '',
      subtasks: '',
      assigned_to: '',
      sub_assigned_to: child.assigned_to || '',
      reports_to: '',
      whatsapp_count: Number(child.whatsapp_sent_count || 0),
      whatsapp_scheduled: childWhatsApp.whatsapp_scheduled,
      whatsapp_followup_1: childWhatsApp.whatsapp_followup_1,
      whatsapp_followup_2: childWhatsApp.whatsapp_followup_2,
      notes: child.notes || '',
    })
  })

  return rows
}

// Returns anchor (start-of-week) for the current week; ws: 0–6
function getWeekStart(ws=0){
  const d=new Date(),day=d.getDay()
  d.setDate(d.getDate()-((day-ws+7)%7));d.setHours(0,0,0,0);return d
}

function getMonthGrid(date,ws=0){
  const y=date.getFullYear(),m=date.getMonth()
  const first=new Date(y,m,1),last=new Date(y,m+1,0)
  const fd=first.getDay(),ld=last.getDay()
  const startOff=(fd-ws+7)%7
  const endOff  =((ws+6)%7-ld+7)%7
  const start=new Date(first);start.setDate(first.getDate()-startOff)
  const end=new Date(last);end.setDate(last.getDate()+endOff)
  const days=[],cur=new Date(start)
  while(cur<=end){days.push(new Date(cur));cur.setDate(cur.getDate()+1)}
  return days
}

function getWeekDays(monday) {
  return Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return d })
}

function getWeekNumber(date, ws=0) {
  const d = new Date(date)
  d.setHours(0,0,0,0)
  const day = d.getDay()
  const diffToStart = (day - ws + 7) % 7
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - diffToStart)

  const year = weekStart.getFullYear()
  const yearStart = new Date(year, 0, 1)
  const startDay = yearStart.getDay()
  const yearStartOffset = (startDay - ws + 7) % 7
  const firstWeekStart = new Date(yearStart)
  firstWeekStart.setDate(yearStart.getDate() - yearStartOffset)

  const diffDays = Math.round((weekStart - firstWeekStart) / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

function eventsOnDay(dayStr, events) {
  return events.filter(e=>{
    const s=e.start_date||(e.year?`${e.year}-01-01`:null)
    const en=e.end_date||s
    return s && s<=dayStr && dayStr<=en
  })
}

function isOverdue(d) { return d && new Date(d)<new Date(new Date().toDateString()) }

// ── Colour helpers ────────────────────────────────────────────────────────────

function eventColor(e) {
  if (e.color) return { bg:e.color+'22', text:e.color, dot:e.color }
  if (e.event_type==='annual')  return { bg:'#dbeafe', text:'#1d4ed8', dot:'#3b82f6' }
  if (e.event_type==='monthly') return { bg:'#ede9fe', text:'#7c3aed', dot:'#8b5cf6' }
  return                               { bg:'#f1f5f9', text:'#475569', dot:'#64748b' }
}

function evtStatusStyle(s) { return EVENT_STATUSES.find(x=>x.value===s)||EVENT_STATUSES[0] }
function taskStatusStyle(s){ return TASK_STATUSES.find(x=>x.value===s)||TASK_STATUSES[0] }
function priorityColor(p)  { return PRIORITIES.find(x=>x.value===p)?.color||'#94a3b8' }

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Modal({ onClose, children, width=480 }) {
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--card-bg,#fff)',borderRadius:14,width:'100%',maxWidth:width,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',overflow:'hidden'}}>
        {children}
      </div>
    </div>
  )
}
function ModalTitle({children, onClose}){
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'transparent',padding:'13px 20px',flexShrink:0,borderBottom:'1px solid var(--card-border,#e2e8f0)'}}>
      <h2 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--text-1)',letterSpacing:'0.01em',display:'flex',alignItems:'center',gap:7}}>{children}</h2>
      {onClose&&(
        <button onClick={onClose} style={{background:'var(--sidebar-bg,#042f2e)',border:'none',borderRadius:7,width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,lineHeight:1,flexShrink:0,outline:'none'}}>×</button>
      )}
    </div>
  )
}
function ModalBody({children}){
  return <div style={{flex:1,overflowY:'auto',padding:'22px 26px 20px'}}>{children}</div>
}
function Field({label,children}){
  return(
    <div style={{marginBottom:13}}>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:'var(--text-3,#64748b)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</label>
      {children}
    </div>
  )
}
const iSt={width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid var(--card-border,#e2e8f0)',background:'var(--input-bg,#f8fafc)',color:'var(--text-1)',fontSize:14,outline:'none',boxSizing:'border-box'}
const btnP={padding:'8px 18px',borderRadius:7,border:'none',background:'var(--accent,#2563eb)',color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer'}
const btnS={padding:'7px 13px',borderRadius:7,border:'1px solid var(--card-border,#e2e8f0)',background:'transparent',color:'var(--text-2)',fontWeight:500,fontSize:14,cursor:'pointer'}

// ── MiniMonth (used in Year view) ─────────────────────────────────────────────

function MiniMonth({ year, month, events, selRange, onDayMouseDown, onDayMouseEnter, onDayMouseUp, onDayContextMenu, onMonthClick, onEventClick, ws=0 }) {
  const days     = getMonthGrid(new Date(year, month, 1), ws)
  const todayStr = toDateStr(new Date())
  const mStart   = `${year}-${String(month+1).padStart(2,'0')}-01`
  const mEnd     = `${year}-${String(month+1).padStart(2,'0')}-31`
  const monthEvtCount = events.filter(e=>{
    const s=e.start_date||(e.year?`${e.year}-01-01`:null)
    const en=e.end_date||s
    return s&&s<=mEnd&&en>=mStart
  }).length
  return (
    <div style={{background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,padding:'12px 10px 10px'}}>
      <div onClick={onMonthClick} style={{textAlign:'center',fontSize:13,fontWeight:700,color:'var(--accent,#2563eb)',marginBottom:7,cursor:'pointer',letterSpacing:'0.02em',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
        {MONTH_NAMES[month].slice(0,3).toUpperCase()}
        {monthEvtCount>0&&<span style={{fontSize:9,fontWeight:700,background:'var(--accent,#2563eb)',color:'#fff',borderRadius:10,padding:'1px 5px',lineHeight:1.4}}>{monthEvtCount}</span>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:3}}>
        {getDaySingle(ws).map((d,i)=>{
          const isStartHdr=i===0
          return <div key={i} style={{textAlign:'center',fontSize:8,fontWeight:700,color:isStartHdr?'#ef4444':'var(--text-3)',paddingBottom:1}}>{d}</div>
        })}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',rowGap:2}}>
        {days.map(day=>{
          const ds=toDateStr(day), isCur=day.getMonth()===month, isToday=ds===todayStr
          const isStartDay=day.getDay()===ws
          const evts=isCur?eventsOnDay(ds,events):[]
          const inSel=!!(selRange&&isCur&&ds>=selRange.start&&ds<=selRange.end)
          return(
            <div key={ds}
              onMouseDown={e=>{if(!isCur||e.button!==0)return;e.preventDefault();onDayMouseDown(ds)}}
              onMouseEnter={e=>{if(isCur)onDayMouseEnter(ds,e.clientX,e.clientY)}}
              onMouseUp={e=>{if(isCur&&e.button===0)onDayMouseUp(ds,e.clientX,e.clientY)}}
              onContextMenu={e=>{if(isCur)onDayContextMenu(e,ds)}}
              style={{textAlign:'center',cursor:isCur?'pointer':'default',position:'relative',paddingBottom:evts.length?6:2,borderRadius:3,background:inSel?'rgba(37,99,235,0.14)':isStartDay&&isCur?'rgba(239,68,68,0.04)':'transparent',userSelect:'none',transition:'background 0.05s'}}>
              <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:isToday?'var(--accent,#2563eb)':'transparent',color:isToday?'#fff':!isCur?'transparent':isStartDay?'#ef4444':'var(--text-1)',fontSize:9,fontWeight:isToday?700:isStartDay?600:400}}>
                {isCur?day.getDate():''}
              </span>
              {evts.length>0&&(
                <div style={{position:'absolute',bottom:0,left:0,right:0,display:'flex',justifyContent:'center',gap:1.5}}>
                  {evts.slice(0,3).map(e=>(
                    <div key={e.id}
                      onMouseDown={ev=>ev.stopPropagation()}
                      onContextMenu={ev=>{ev.stopPropagation();ev.preventDefault()}}
                      onClick={ev=>{ev.stopPropagation();onEventClick(e)}} title={e.name}
                      style={{width:4,height:4,borderRadius:'50%',background:eventColor(e).dot,cursor:'pointer'}}/>
                  ))}
                  {evts.length>3&&<div style={{width:4,height:4,borderRadius:'50%',background:'#94a3b8'}}/>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TaskCard (draggable) ──────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onAssign, onDelete, onStatusChange, onSendWhatsApp, onMoveUp, onMoveDown }) {
  const [hov,setHov]=useState(false)
  const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:task.id})
  const st=taskStatusStyle(task.status)
  const overdue=task.status!=='done'&&isOverdue(task.due_date)
  const assignLabel = task.assigned_to ? 'Reassign' : 'Assign'
  return(
    <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.3:1,marginBottom:8}}
      {...attributes}{...listeners} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderLeft:`3px solid ${priorityColor(task.priority)}`,borderRadius:8,padding:'10px 12px',cursor:isDragging?'grabbing':'grab',position:'relative',boxShadow:hov?'0 2px 8px rgba(0,0,0,0.09)':'none',transition:'box-shadow 0.15s'}}>
        {hov&&!isDragging&&(
          <div style={{position:'absolute',top:6,right:6,display:'flex',gap:3,zIndex:1}}>
            <button onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMoveUp?.(task.id)}} disabled={!onMoveUp}
              style={{background:'var(--input-bg,#f1f5f9)',border:'none',borderRadius:5,padding:'3px 5px',cursor:onMoveUp?'pointer':'default',display:'flex',alignItems:'center',opacity:onMoveUp?1:0.4}}><ChevronUp size={11} color="var(--text-2)"/></button>
            <button onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMoveDown?.(task.id)}} disabled={!onMoveDown}
              style={{background:'var(--input-bg,#f1f5f9)',border:'none',borderRadius:5,padding:'3px 5px',cursor:onMoveDown?'pointer':'default',display:'flex',alignItems:'center',opacity:onMoveDown?1:0.4}}><ChevronDown size={11} color="var(--text-2)"/></button>
            <button onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onEdit(task)}}
              style={{background:'var(--input-bg,#f1f5f9)',border:'none',borderRadius:5,padding:'3px 5px',cursor:'pointer',display:'flex',alignItems:'center'}}><Pencil size={11} color="var(--text-2)"/></button>
                <button onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onAssign?.(task)}}
              style={{background:'var(--input-bg,#f1f5f9)',border:'none',borderRadius:5,padding:'3px 7px',cursor:'pointer',fontSize:11,color:'var(--text-2)',fontWeight:600,whiteSpace:'nowrap'}}>{assignLabel}</button>
            <button onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onDelete(task)}}
              style={{background:'#fef2f2',border:'none',borderRadius:5,padding:'3px 5px',cursor:'pointer',display:'flex',alignItems:'center'}}><Trash2 size={11} color="#ef4444"/></button>
          </div>
        )}
        <p style={{margin:'0 0 6px',fontSize:13,fontWeight:600,color:'var(--text-1)',lineHeight:1.4,paddingRight:hov?46:0}}>{task.title}</p>
        {task.whatsapp_sent_count > 0 && (
          <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:10,fontWeight:700,color:'#166534',background:'#dcfce7',borderRadius:999,padding:'4px 8px',marginBottom:6}}>
            <CheckCircle2 size={12} color='#16a34a' />
            <span>{task.whatsapp_sent_count} WhatsApp</span>
          </div>
        )}
        {task.notes&&!isDragging&&<p style={{margin:'0 0 6px',fontSize:11,color:'var(--text-3)',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',lineHeight:1.4}}>{task.notes}</p>}
        {task.assigned_to&&<div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}><User size={11} color="var(--text-3)"/><span style={{fontSize:12,color:'var(--text-2)'}}>{task.assigned_to}</span></div>}
        {task.due_date&&<div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}><CalendarDays size={11} color={overdue?'#ef4444':'var(--text-3)'}/><span style={{fontSize:12,color:overdue?'#ef4444':'var(--text-2)',fontWeight:overdue?600:400}}>{fmtDate(task.due_date)}{overdue?' ⚠':''}</span></div>}
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
          {!task.parent_id && (
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={e=>{e.stopPropagation();onSendWhatsApp?.(task.id)}}
                aria-label={task.whatsapp_sent_count>0 ? `WhatsApp sent ${task.whatsapp_sent_count} time(s)` : 'Send WhatsApp'}
                style={{background:task.whatsapp_sent_count>0?'#16a34a':'transparent',border:'none',borderRadius:'50%',width:30,height:30,display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:task.assigned_to&&task.whatsapp_sent_count===0?'pointer':'not-allowed',opacity:task.assigned_to&&task.whatsapp_sent_count===0?1:0.45,transition:'all 0.2s',flexShrink:0,outline:'none',padding:0}}
                disabled={!task.assigned_to||task.whatsapp_sent_count>0}>
                <WhatsAppIcon size={14} color={task.whatsapp_sent_count>0?'#fff':'#25d366'} />
              </button>
            </div>
          )}
          <button onClick={e=>{e.stopPropagation();onAssign?.(task)}}
            style={{background:'#2563eb',border:'none',borderRadius:20,padding:'7px 16px',fontSize:12,color:'#fff',cursor:'pointer',fontWeight:600,marginTop:6,whiteSpace:'nowrap',transition:'all 0.2s',flex:1}}>
            {assignLabel}
          </button>
        </div>
        {/* status hidden for now */}
      </div>
    </div>
  )
}

function TaskCardOverlay({task}){
  if(!task)return null
  const st=taskStatusStyle(task.status)
  return(
    <div style={{background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderLeft:`3px solid ${priorityColor(task.priority)}`,borderRadius:8,padding:'10px 12px',boxShadow:'0 10px 28px rgba(0,0,0,0.2)',width:252,cursor:'grabbing'}}>
      <p style={{margin:'0 0 6px',fontSize:13,fontWeight:600,color:'var(--text-1)'}}>{task.title}</p>
      <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:st.bg,color:st.text,textTransform:'uppercase'}}>{st.label}</span>
    </div>
  )
}

function LibraryTaskOverlay({task}){
  if(!task)return null
  const title = task.subcategory || task.category || task.title || ''
  return(
    <div style={{background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:8,padding:'10px 12px',boxShadow:'0 10px 28px rgba(0,0,0,0.2)',width:260,cursor:'grabbing'}}>
      <p style={{margin:'0 0 6px',fontSize:13,fontWeight:600,color:'var(--text-1)'}}>{title}</p>
      {task.description&&<p style={{margin:'0 0 8px',fontSize:12,color:'var(--text-3)'}}>{task.description}</p>}
      <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:'#eef2ff',color:'#1d4ed8',textTransform:'uppercase'}}>Library template</span>
    </div>
  )
}

function LibraryItemRow({task,isSubtask,onNameChange,onAddSubtask,onDelete,saving,onToggleCollapse,collapsed,autoEdit}){
  const [editing,setEditing]=useState(false)
  const [value,setValue]=useState(task.subcategory||task.category||'')
  const draggableId = task.dragId || `lib-${task.id}`
  const {attributes,listeners,setNodeRef,isDragging}=useDraggable({id:draggableId})
  const taskColor=isSubtask?'#1e3a8a':'#991b1b'
  const bgColor=isSubtask?'#eff6ff':'#fef2f2'
  const inputRef = useRef(null)

  useEffect(()=>{
    if(autoEdit){
      setEditing(true)
      setTimeout(()=>{inputRef.current?.focus()},60)
    }
  },[autoEdit])

  async function handleSave(){
    if(!value.trim()) return
    setEditing(false)
    const targetId = task.dragId || task.id
    await onNameChange(targetId, isSubtask ? 'subcategory' : 'category', value.trim())
  }

  return(
    <div ref={setNodeRef} style={{width:'100%',boxSizing:'border-box',padding:isSubtask?'8px 12px 8px 30px':'8px 12px',borderBottom:'1px solid var(--card-border,#e2e8f0)',background:isDragging?'rgba(37,99,235,0.1)':bgColor,display:'flex',alignItems:'center',gap:6,opacity:isDragging?0.6:1,transition:'all 0.15s',borderLeft:`3px solid ${isDragging?'var(--accent,#2563eb)':taskColor}`}}>
      <div {...attributes} {...listeners} style={{cursor:'grab',display:'flex',alignItems:'center',color:'var(--text-3)',flexShrink:0}}>
        <GripVertical size={14}/>
      </div>
      {!isSubtask&&(
        <button onClick={()=>onToggleCollapse?.(task.category)} disabled={saving} title={collapsed ? 'Expand category' : 'Collapse category'} aria-expanded={!collapsed} style={{background:'transparent',border:'none',color:'var(--text-3)',cursor:'pointer',fontSize:14,padding:'0 4px',display:'flex',alignItems:'center',flexShrink:0}}>
          {collapsed ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}        
        </button>
      )}
      {editing?(
        <input ref={inputRef} autoFocus value={value} onChange={e=>setValue(e.target.value)} onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave()}} style={{flex:1,padding:'4px 6px',fontSize:12,border:`1px solid ${taskColor}`,borderRadius:4,outline:'none'}} disabled={saving}/>
      ):(
        <span onDoubleClick={()=>{setEditing(true);setValue(task.subcategory||task.category||'')}} style={{flex:1,fontSize:13,color:taskColor,cursor:'text',padding:'2px 4px',borderRadius:3,userSelect:'none',fontWeight:isSubtask?500:600}}>{task.subcategory||task.category}</span>
      )}
      {!isSubtask&&(
        <button onClick={()=>onAddSubtask(task.id)} disabled={saving || !task.id} style={{background:'transparent',border:'none',color:taskColor,cursor:task.id?'pointer':'not-allowed',fontSize:14,padding:'0 4px',fontWeight:600}}>+</button>
      )}
      <button onClick={()=>onDelete(task.dragId || task.id)} disabled={saving} style={{background:'transparent',border:'none',color:'#ef4444',cursor:'pointer',padding:'0 4px'}}><Trash2 size={14}/></button>
    </div>
  )
}

// ── CanvasDropZone ────────────────────────────────────────────────────────────

function CanvasDropZone({tasks=[],onDeleteTask,onAddSubtask,onAssignTask,onEditTask,onSendWhatsApp,onToggleCategory,collapsedCategories={},libCreatedTaskIds=[],onMoveTaskUp,onMoveTaskDown}){
  const {setNodeRef,isOver}=useDroppable({id:'canvas-drop-zone'})
  const sortByOrder = (a,b)=> (a.sort_order||0)-(b.sort_order||0) || (new Date(a.created_at||0) - new Date(b.created_at||0))
  const topTasks = tasks.filter(t=>t.parent_id==null).slice().sort(sortByOrder)
  const subtasksByParent = {}
  tasks.filter(t=>t.parent_id!=null).forEach(t=>{
    if(!subtasksByParent[t.parent_id]) subtasksByParent[t.parent_id]=[]
    subtasksByParent[t.parent_id].push(t)
  })
  Object.values(subtasksByParent).forEach(arr=>arr.sort(sortByOrder))

  const isCategoryTask = task => !task.parent_id && (subtasksByParent[task.id]?.length > 0)

  const handleAddSubtaskClick = async (e, task) => {
    e.stopPropagation()
    const title = window.prompt('Subtask name')
    if(title && title.trim()) await onAddSubtask(task.id, title.trim())
  }

  function CategorySlot({ task, subtasks }){
    const {setNodeRef: setTaskDropRef, isOver: isOverTask} = useDroppable({id:`task-${task.id}`})
    const parentAssignees = task.assigned_to ? String(task.assigned_to).trim() : ''
    const taskIndex = topTasks.findIndex(t=>t.id===task.id)
    const canMoveTaskUp = taskIndex > 0
    const canMoveTaskDown = taskIndex !== -1 && taskIndex < topTasks.length - 1
    return (
      <div ref={setTaskDropRef} style={{background:isOverTask?'rgba(37,99,235,0.08)':'#fff',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:12,boxShadow:'0 8px 24px rgba(15,23,42,0.08)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'10px 12px'}}>
            <div style={{display:'grid',gridTemplateColumns:'36px 1fr min-content',alignItems:'center',gap:8,marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
              {isCategoryTask(task) ? (
                <button onClick={e=>{e.stopPropagation(); onToggleCategory?.(task.id)}} title={collapsedCategories[task.id] ? 'Expand category' : 'Collapse category'} aria-expanded={!collapsedCategories[task.id]} style={{background:'transparent',border:'none',padding:'6px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'var(--text-3)',flexShrink:0}}>
                  {collapsedCategories[task.id] ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}              
                </button>
              ) : null}
            </div>

            <div style={{minWidth:0, display:'flex', alignItems:'center', gap:10}}>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</div>
              {parentAssignees && (
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  <User size={12} color='var(--text-3)' />
                  <span>{parentAssignees}</span>
                </div>
              )}
            </div>

            <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end',minWidth:176,marginRight:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button onClick={e=>{e.stopPropagation(); onSendWhatsApp?.(task.id)}} disabled={!task.assigned_to || task.whatsapp_sent_count>0} aria-label={task.whatsapp_sent_count>0 ? `WhatsApp sent ${task.whatsapp_sent_count} time(s)` : 'Send WhatsApp'} style={{background:task.whatsapp_sent_count>0?'#16a34a':'transparent',border:'none',borderRadius:'50%',width:30,height:30,display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:task.assigned_to && task.whatsapp_sent_count===0 ? 'pointer' : 'not-allowed',opacity:task.assigned_to && task.whatsapp_sent_count===0 ? 1 : 0.45,transition:'all 0.2s',flexShrink:0,outline:'none',padding:0}}>
                  <WhatsAppIcon size={14} color={task.whatsapp_sent_count>0?'#fff':'#25d366'} />
                </button>
                {task.whatsapp_sent_count>0 && (
                  <span style={{fontSize:11,fontWeight:700,color:'#166534',background:'#dcfce7',borderRadius:999,padding:'4px 8px'}}>{task.whatsapp_sent_count}</span>
                )}
              </div>
              <button onClick={e=>{e.stopPropagation(); onMoveTaskUp?.(task.id)}} disabled={!onMoveTaskUp || !canMoveTaskUp} title="Move up" style={{background:'transparent',border:'none',cursor:onMoveTaskUp && canMoveTaskUp ? 'pointer':'default',padding:4,display:'flex',alignItems:'center',color:'var(--text-3)',opacity:onMoveTaskUp && canMoveTaskUp ? 1 : 0.25}}><ChevronUp size={14}/></button>
              <button onClick={e=>{e.stopPropagation(); onMoveTaskDown?.(task.id)}} disabled={!onMoveTaskDown || !canMoveTaskDown} title="Move down" style={{background:'transparent',border:'none',cursor:onMoveTaskDown && canMoveTaskDown ? 'pointer':'default',padding:4,display:'flex',alignItems:'center',color:'var(--text-3)',opacity:onMoveTaskDown && canMoveTaskDown ? 1 : 0.25}}><ChevronDown size={14}/></button>
              {isCategoryTask(task)&&(
                <button onClick={e=>handleAddSubtaskClick(e, task)} style={{...btnS,fontSize:12,padding:'4px 8px',whiteSpace:'nowrap',height:28,lineHeight:1,display:'inline-flex',alignItems:'center',borderRadius:8}}>+ Subtask</button>
              )}
              <button onClick={e=>{e.stopPropagation(); onAssignTask?.(task)}} style={{...btnS,fontSize:11,padding:'5px 7px',whiteSpace:'nowrap',...(task.assigned_to?{background:'var(--text-1)',color:'var(--accent-text)',borderColor:'var(--text-1)'}:{})}}>{task.assigned_to ? 'Re-Assign' : 'Assign'}</button>
              <button onClick={e=>{e.stopPropagation(); onDeleteTask(task.id)}} title="Delete" style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4}}><Trash2 size={14}/></button>
            </div>
          </div>
          {task.description && <div style={{fontSize:12,color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.description}</div>}
          {!collapsedCategories[task.id] && subtasks.length>0 && (
            <div style={{padding:'8px 0 0',borderTop:'1px solid #eef2f7',display:'flex',flexDirection:'column',gap:6}}>
              {subtasks.map(subtask=>{
                const childAssignees = subtask.assigned_to ? String(subtask.assigned_to).trim() : ''
                const showReport = Boolean(childAssignees && parentAssignees && childAssignees !== parentAssignees)
                  return (
                  <div key={subtask.id} style={{display:'grid',gridTemplateColumns:'26px minmax(0,1fr) min-content',columnGap:8,alignItems:'center',gap:4,padding:'8px 12px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10}}>
                    <div />
                    <div style={{minWidth:0,display:'flex',alignItems:'center',gap:8,flexWrap:'nowrap'}}>
                      <div style={{fontSize:13,color:'#1f2937',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{subtask.title}</div>
                      {(childAssignees || showReport) && (
                        <div style={{display:'flex',alignItems:'center',gap:4,fontSize:12,color:'var(--text-2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>
                          <User size={11} color='var(--text-3)' />
                          <span>
                            {childAssignees}
                            {childAssignees && showReport ? ' · ' : ''}
                            {showReport ? `Reports to ${parentAssignees}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'flex-end'}}>
                      <button onClick={e=>{e.stopPropagation(); onMoveTaskUp?.(subtask.id)}} disabled={!onMoveTaskUp || subtasks.findIndex(st=>st.id===subtask.id)===0} title="Move up" style={{background:'transparent',border:'none',cursor:onMoveTaskUp ? 'pointer':'default',padding:4,display:'flex',alignItems:'center',color:'var(--text-3)',opacity: onMoveTaskUp && subtasks.findIndex(st=>st.id===subtask.id)!==0 ? 1 : 0.25}}><ChevronUp size={12}/></button>
                      <button onClick={e=>{e.stopPropagation(); onMoveTaskDown?.(subtask.id)}} disabled={!onMoveTaskDown || subtasks.findIndex(st=>st.id===subtask.id)===subtasks.length-1} title="Move down" style={{background:'transparent',border:'none',cursor:onMoveTaskDown ? 'pointer':'default',padding:4,display:'flex',alignItems:'center',color:'var(--text-3)',opacity: onMoveTaskDown && subtasks.findIndex(st=>st.id===subtask.id)!==subtasks.length-1 ? 1 : 0.25}}><ChevronDown size={12}/></button>
                      <button onClick={e=>{e.stopPropagation(); onAssignTask?.(subtask)}} style={{...btnS,fontSize:11,padding:'5px 8px',whiteSpace:'nowrap',...(subtask.assigned_to?{background:'var(--text-1)',color:'var(--accent-text)',borderColor:'var(--text-1)'}:{})}}>{subtask.assigned_to ? 'Re-Assign' : 'Assign'}</button>
                      <button onClick={e=>{e.stopPropagation(); onDeleteTask(subtask.id)}} title="Delete subtask" style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4}}><Trash2 size={12}/></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  if(!topTasks.length){
    return(
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:268}}>
        <div ref={setNodeRef} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px',color:'var(--text-3)',minHeight:180,background:isOver?'rgba(37,99,235,0.05)':'transparent',borderRadius:8,border:isOver?'2px dashed var(--accent,#2563eb)':'2px dashed transparent',transition:'all 0.15s'}}>
          <LayoutGrid size={48} style={{opacity:isOver?0.3:0.18,marginBottom:16,transition:'opacity 0.15s'}}/>
          <p style={{margin:0,fontSize:15,fontWeight:500,textAlign:'center'}}>Drag tasks from the library to organize your event</p>
          <p style={{margin:'8px 0 0',fontSize:13,textAlign:'center'}}>Click <strong>+ Task</strong> in the library to create a new task</p>
        </div>
      </div>
    )
  }

  return(
    <div ref={setNodeRef} style={{flex:1,overflowY:'auto',padding:'20px',background:isOver?'rgba(37,99,235,0.03)':'transparent',borderRadius:8,transition:'all 0.15s'}}>
      <div style={{display:'flex',flexDirection:'column',gap:16,minHeight:520}}>
        {topTasks.map(task=>{
          const subtasks = subtasksByParent[task.id] || []
          return <CategorySlot key={task.id} task={task} subtasks={subtasks}/>
        })}
      </div>
    </div>
  )
}

// ── LibraryPanel ──────────────────────────────────────────────────────────────

function LibraryPanel({tasks,onNameChange,onAddSubtask,onDelete,onAddCategory,saving,recentAddedId}){
  const [search,setSearch]=useState('')
  const [collapsedCategories,setCollapsedCategories]=useState({})
  const { profile } = useAuth()

  const filtered=tasks.filter(t=>
    (t.category||'').toLowerCase().includes(search.toLowerCase())||
    (t.subcategory||'').toLowerCase().includes(search.toLowerCase())
  )

  const grouped={}
  filtered.forEach(t=>{
    const key = t.category || ''
    if(!grouped[key]) grouped[key]=[]
    grouped[key].push(t)
  })

  // sort items inside each category by sort_order then created_at
  Object.keys(grouped).forEach(k=>{
    grouped[k].sort((a,b)=> (a.sort_order||0)-(b.sort_order||0) || (new Date(a.created_at||0) - new Date(b.created_at||0)))
  })

  // order categories by the lowest sort_order of their items so new categories appear at the end
  const categories = Object.keys(grouped).sort((a,b)=>{
    const aOrder = grouped[a][0]?.sort_order ?? 0
    const bOrder = grouped[b][0]?.sort_order ?? 0
    return aOrder - bOrder
  })
  const allCollapsed = categories.length > 0 && categories.every(cat => collapsedCategories[cat])

  const toggleCategory = (category) => setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }))
  const toggleAll = () => setCollapsedCategories(Object.fromEntries(categories.map(cat => [cat, !allCollapsed])))

  return(
    <div style={{display:'flex',flexDirection:'column',background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:12,overflow:'hidden',boxShadow:'0 12px 32px rgba(15,23,42,0.08)',flex:1,height:'100%'}}>
      <div style={{display:'flex',flexDirection:'column',gap:8,padding:'14px 16px',borderBottom:'1px solid var(--card-border,#e2e8f0)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-1)'}}>Task Library</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <button onClick={onAddCategory} disabled={saving} title="Add a new task category" style={{...btnP,fontSize:12,padding:'6px 12px',whiteSpace:'nowrap',flexShrink:0,height:32,display:'flex',alignItems:'center',gap:6}}>+ Task</button>
            <button onClick={toggleAll} disabled={categories.length===0} title={allCollapsed ? 'Expand all categories' : 'Collapse all categories'} aria-label={allCollapsed ? 'Expand all categories' : 'Collapse all categories'} style={{background:'transparent',border:'none',padding:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:categories.length? 'pointer':'default',flexShrink:0,transition:'transform 0.12s,background 0.12s',borderRadius:8}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(15,23,42,0.04)';e.currentTarget.style.transform='scale(1.05)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.transform='none'}}>{allCollapsed ? <ChevronRight size={16} color="var(--text-3)"/> : <ChevronDown size={16} color="var(--text-3)"/>}</button>
          </div>
        </div>
        <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',padding:'6px 8px',fontSize:12,border:'1px solid var(--card-border,#f8fafc)',borderRadius:6,outline:'none',background:'var(--input-bg,#f8fafc)'}}/>
      </div>
      <div style={{flex:1,overflowY:'auto',minHeight:240,padding:'12px 14px'}}>
        {filtered.length===0?(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'var(--text-3)',padding:'24px',textAlign:'center',height:'100%'}}>
            <LayoutGrid size={34}/>
            <div style={{fontSize:13,fontWeight:600}}>{search?'No items found':'No tasks yet'}</div>
            <div style={{fontSize:12}}>Click "+ Task" to add a category.</div>
          </div>
        ):(
          categories.map(cat=>{
            const firstTask = grouped[cat][0]
            const newTask = recentAddedId ? tasks.find(t=>t.id===recentAddedId) : null
            const headerAutoEdit = newTask && (newTask.subcategory==null || newTask.subcategory==='') && newTask.category===cat && newTask.id===firstTask?.id
            return (
              <div key={cat}>
                <LibraryItemRow task={{category:cat,id:firstTask?.id,dragId:`lib-cat-${cat}`}} isSubtask={false} onNameChange={onNameChange} onAddSubtask={onAddSubtask} onDelete={onDelete} saving={saving} onToggleCollapse={toggleCategory} collapsed={collapsedCategories[cat]} autoEdit={headerAutoEdit} />
                {!collapsedCategories[cat] && grouped[cat].filter(t => t.subcategory != null && t.subcategory !== '').map(subtask=>(
                  <LibraryItemRow key={subtask.id} task={subtask} isSubtask={true} onNameChange={onNameChange} onDelete={onDelete} saving={saving} autoEdit={subtask.id===recentAddedId}/>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── BucketColumn ──────────────────────────────────────────────────────────────

function BucketColumn({bucket,tasks,onAddTask,onEditBucket,onDeleteBucket,onEditTask,onDeleteTask,onStatusChange,onMoveLeft,onMoveRight,onQuickAdd,onAssignTask,onMoveUp,onMoveDown}){
  const {setNodeRef,isOver}=useDroppable({id:bucket.id})
  const [quickTitle,setQuickTitle]=useState('')
  const [isQuickAdd,setIsQuickAdd]=useState(false)
  const done=tasks.filter(t=>t.status==='done').length

  function commitQuick(){
    if(quickTitle.trim()){onQuickAdd(bucket.id,quickTitle.trim());setQuickTitle('');setIsQuickAdd(false)}
  }

  return(
    <div style={{width:268,flexShrink:0,display:'flex',flexDirection:'column',background:'var(--page-bg,#f8fafc)',border:`1.5px solid ${isOver?bucket.color:'var(--card-border,#e2e8f0)'}`,borderRadius:10,overflow:'hidden',transition:'border-color 0.15s',maxHeight:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderBottom:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',flexShrink:0}}>
        <div style={{width:10,height:10,borderRadius:'50%',background:bucket.color,flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:700,color:'var(--text-1)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bucket.name}</span>
        <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',background:'var(--input-bg,#f1f5f9)',borderRadius:10,padding:'1px 7px',flexShrink:0}}>{done}/{tasks.length}</span>
        <button onClick={onMoveLeft}  disabled={!onMoveLeft}  style={{background:'none',border:'none',cursor:onMoveLeft?'pointer':'default',padding:2,display:'flex',alignItems:'center',opacity:onMoveLeft?1:0.25}} title="Move left"><ChevronLeft  size={12} color="var(--text-3)"/></button>
        <button onClick={onMoveRight} disabled={!onMoveRight} style={{background:'none',border:'none',cursor:onMoveRight?'pointer':'default',padding:2,display:'flex',alignItems:'center',opacity:onMoveRight?1:0.25}} title="Move right"><ChevronRight size={12} color="var(--text-3)"/></button>
        <button onClick={()=>onEditBucket(bucket)} style={{background:'none',border:'none',cursor:'pointer',padding:2,display:'flex',alignItems:'center'}}><Pencil size={12} color="var(--text-3)"/></button>
        <button onClick={()=>onDeleteBucket(bucket)} style={{background:'none',border:'none',cursor:'pointer',padding:2,display:'flex',alignItems:'center'}}><Trash2 size={12} color="#ef4444"/></button>
      </div>
      <div ref={setNodeRef} style={{flex:1,overflowY:'auto',padding:'10px 8px 12px',minHeight:72,background:isOver?`${bucket.color}12`:'transparent',transition:'background 0.15s'}}>
        <SortableContext items={tasks.map(t=>t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task=><TaskCard key={task.id} task={task} onEdit={onEditTask} onAssign={onAssignTask} onDelete={onDeleteTask} onStatusChange={onStatusChange} onSendWhatsApp={handleSendWhatsApp} onMoveUp={()=>onMoveUp?.(task)} onMoveDown={()=>onMoveDown?.(task)}/>) }
        </SortableContext>
        {tasks.length===0&&<div style={{textAlign:'center',padding:'14px 8px',color:'var(--text-3)',fontSize:12,userSelect:'none'}}>Drop tasks here</div>}
      </div>
      {isQuickAdd?(
        <div style={{padding:'7px 8px',borderTop:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',flexShrink:0}}>
          <input autoFocus value={quickTitle} onChange={e=>setQuickTitle(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')commitQuick();if(e.key==='Escape'){setQuickTitle('');setIsQuickAdd(false)}}}
            onBlur={()=>{if(!quickTitle.trim())setIsQuickAdd(false)}}
            placeholder="Task title… Enter to save"
            style={{...iSt,padding:'5px 8px',fontSize:12,marginBottom:5}}/>
          <div style={{display:'flex',gap:4}}>
            <button onClick={commitQuick} style={{...btnP,fontSize:11,padding:'3px 10px'}}>Add</button>
            <button onClick={()=>{setQuickTitle('');setIsQuickAdd(false)}} style={{...btnS,fontSize:11,padding:'3px 8px'}}>Cancel</button>
            <button onPointerDown={e=>e.stopPropagation()} onClick={()=>{setIsQuickAdd(false);onAddTask(bucket.id)}} style={{...btnS,fontSize:11,padding:'3px 8px',marginLeft:'auto'}}>More…</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setIsQuickAdd(true)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'8px 12px',border:'none',borderTop:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',color:'var(--text-3)',fontSize:13,cursor:'pointer',flexShrink:0,textAlign:'left'}}>
          <Plus size={14}/> Add task
        </button>
      )}
    </div>
  )
}

// ── EventCard (cards view) ────────────────────────────────────────────────────

function EventCard({event,onClick,onEdit,onDelete,onExport,compact=false}){
  const [hov,setHov]=useState(false)
  const ec=eventColor(event), es=evtStatusStyle(event.status)
  const dr=event.start_date?(event.end_date&&event.end_date!==event.start_date?`${fmtDate(event.start_date)} – ${fmtDate(event.end_date)}`:fmtDate(event.start_date)):event.year?String(event.year):'—'
  const dim=event.status==='completed'||event.status==='cancelled'
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onClick(event)}
      style={{background:'var(--card-bg,#fff)',border:`1px solid var(--card-border,#e2e8f0)`,borderTop:`3px solid ${ec.dot}`,borderRadius:10,padding:compact?'12px 12px 10px':'16px 16px 14px',cursor:'pointer',position:'relative',boxShadow:hov?'0 4px 16px rgba(0,0,0,0.08)':'0 1px 3px rgba(0,0,0,0.04)',transform:hov?'translateY(-1px)':'none',transition:'box-shadow 0.15s,transform 0.12s',opacity:dim?0.7:1}}>
      {hov&&<div style={{position:'absolute',top:10,right:10,display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>onExport?.(event)} style={{background:'var(--input-bg)',border:'none',borderRadius:6,padding:'4px 6px',cursor:'pointer',display:'flex',alignItems:'center'}}><Download size={13} color="var(--text-2)"/></button>
        <button onClick={()=>onEdit(event)} style={{background:'var(--input-bg)',border:'none',borderRadius:6,padding:'4px 6px',cursor:'pointer',display:'flex',alignItems:'center'}}><Pencil size={13} color="var(--text-2)"/></button>
        <button onClick={()=>onDelete(event)} style={{background:'#fef2f2',border:'none',borderRadius:6,padding:'4px 6px',cursor:'pointer',display:'flex',alignItems:'center'}}><Trash2 size={13} color="#ef4444"/></button>
      </div>}
      <div style={{display:'flex',alignItems:'center',gap:compact?4:6,marginBottom:compact?6:8,flexWrap:'wrap'}}>
        <span style={{fontSize:compact?9:10,fontWeight:700,padding:compact?'1px 5px':'2px 7px',borderRadius:20,background:ec.bg,color:ec.text,textTransform:'uppercase'}}>{event.event_type}</span>
        <span style={{fontSize:compact?9:10,fontWeight:700,padding:compact?'1px 5px':'2px 7px',borderRadius:20,background:es.bg,color:es.text,textTransform:'uppercase'}}>{es.label}</span>
        {event.event_type==='annual'&&event.is_recurring&&(
          <span style={{fontSize:compact?9:10,fontWeight:700,padding:compact?'1px 5px':'2px 7px',borderRadius:20,background:'#eff6ff',color:'#2563eb',display:'flex',alignItems:'center',gap:compact?2:3}}>
            <Repeat size={compact?8:9}/>Recurring
          </span>
        )}
        {event.event_type==='annual'&&event.date_fixed&&(
          <span style={{fontSize:compact?9:10,fontWeight:700,padding:compact?'1px 5px':'2px 7px',borderRadius:20,background:'#dcfce7',color:'#16a34a',display:'flex',alignItems:'center',gap:compact?2:3}}>
            <CalendarDays size={compact?8:9}/>Fixed Date
          </span>
        )}
        {event.event_type==='annual'&&event.is_recurring&&!event.date_fixed&&!event.start_date&&(
          <span style={{fontSize:compact?9:10,fontWeight:700,padding:compact?'1px 5px':'2px 7px',borderRadius:20,background:'#fff7ed',color:'#c2410c',display:'flex',alignItems:'center',gap:compact?2:3}}>
            <AlertCircle size={compact?8:9}/>Needs Scheduling
          </span>
        )}
      </div>
      <div style={{margin:'0 0 6px',display:'flex',alignItems:'center'}}>
        <div style={{background:ec.dot,color:'#fff',padding:compact?'5px 10px':'6px 12px',borderRadius:10,fontSize:compact?13:14,fontWeight:700,lineHeight:1.2,display:'inline-block',textDecoration:event.status==='cancelled'?'line-through':'none'}}>{event.name}</div>
      </div>
      <p style={{margin:'0 0 8px',fontSize:compact?11:12,color:'var(--text-3)',display:'flex',alignItems:'center',gap:4}}><CalendarDays size={compact?10:11}/>{dr}</p>
  
      <p style={{margin:0,fontSize:11,color:'var(--text-3)'}}>Open board →</p>
    </div>
  )
}

// ── ColorPicker (reusable) ────────────────────────────────────────────────────

function ColorPicker({value, onChange}) {
  return(
    <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:2}}>
      {PALETTE.map(c=>(
        <button key={c} onClick={()=>onChange(c)}
          style={{width:26,height:26,borderRadius:'50%',background:c,border:'none',cursor:'pointer',outline:value===c?`3px solid ${c}`:'2px solid transparent',outlineOffset:2,transition:'outline 0.1s'}}/>
      ))}
      <button onClick={()=>onChange(null)}
        style={{width:26,height:26,borderRadius:'50%',background:'var(--input-bg,#f1f5f9)',border:'1px dashed var(--card-border,#e2e8f0)',cursor:'pointer',fontSize:11,color:'var(--text-3)',display:'flex',alignItems:'center',justifyContent:'center',outline:value===null?'2px solid var(--text-3)':'none',outlineOffset:2}}>
        ✕
      </button>
    </div>
  )
}

// ── DayTooltip (hover popup) ──────────────────────────────────────────────────

function DayTooltip({ ds, events, x, y, onEventClick, onClose }) {
  const [hovId, setHovId] = useState(null)
  const dayEvts = eventsOnDay(ds, events)
  if (!ds) return null
  const [yy,mm,dd] = ds.split('-')
  const dateLabel = new Date(parseInt(yy), parseInt(mm)-1, parseInt(dd))
    .toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
  const tipW = 248
  const left = x + 14 + tipW > window.innerWidth - 8 ? x - tipW - 14 : x + 14
  const top  = Math.max(8, Math.min(y - 20, window.innerHeight - 340))
  return (
    <div style={{position:'fixed',left,top,zIndex:1200,background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,padding:'10px 13px',width:tipW,maxHeight:320,overflowY:'auto',boxShadow:'0 8px 28px rgba(0,0,0,0.18)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{dateLabel}</span>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',padding:'0 2px',lineHeight:1,fontSize:14,display:'flex',alignItems:'center'}}>×</button>
      </div>
      {dayEvts.length===0&&(
        <div style={{fontSize:12,color:'var(--text-3)',textAlign:'center',padding:'8px 0'}}>No events</div>
      )}
      {dayEvts.map(e=>{
        const ec=eventColor(e)
        const isHov=hovId===e.id
        return(
          <div key={e.id}
            onMouseEnter={()=>setHovId(e.id)}
            onMouseLeave={()=>setHovId(null)}
            onClick={()=>onEventClick(e)}
            style={{display:'flex',alignItems:'flex-start',gap:7,marginBottom:5,padding:'5px 6px',borderRadius:7,cursor:'pointer',background:isHov?'var(--input-bg,#f1f5f9)':'transparent',transition:'background 0.1s'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:ec.dot,flexShrink:0,marginTop:3}}/>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:isHov?'var(--accent,#2563eb)':'var(--text-1)',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</div>
              <div style={{fontSize:10,color:'var(--text-3)'}}>
                {e.event_type}{e.start_date&&(' · '+fmtDate(e.start_date)+(e.end_date&&e.end_date!==e.start_date?' – '+fmtDate(e.end_date):''))}
              </div>
            </div>
            <div style={{fontSize:9,color:'var(--accent,#2563eb)',opacity:isHov?1:0,fontWeight:600,flexShrink:0,marginTop:2,transition:'opacity 0.1s'}}>Open →</div>
          </div>
        )
      })}
    </div>
  )
}

// ── CompletionSummaryModal ────────────────────────────────────────────────────

function CompletionSummaryModal({ event, buckets, tasks, onClose }) {
  const total   = tasks.length
  const done    = tasks.filter(t=>t.status==='done').length
  const inProg  = tasks.filter(t=>t.status==='in-progress').length
  const pending = tasks.filter(t=>t.status==='pending').length
  const overdue = tasks.filter(t=>t.status!=='done'&&isOverdue(t.due_date))
  const pct     = total>0?Math.round(done/total*100):0

  const byBucket = buckets.map(b=>{
    const bt=tasks.filter(t=>t.bucket_id===b.id)
    return {...b,total:bt.length,done:bt.filter(t=>t.status==='done').length}
  })

  const assigneeMap = {}
  tasks.forEach(t=>{
    if(!t.assigned_to)return
    if(!assigneeMap[t.assigned_to])assigneeMap[t.assigned_to]={total:0,done:0}
    assigneeMap[t.assigned_to].total++
    if(t.status==='done')assigneeMap[t.assigned_to].done++
  })

  const barSt = {height:6,borderRadius:6,background:'var(--input-bg,#f1f5f9)',overflow:'hidden',flex:1}
  const barFill = (p,clr)=>({height:'100%',width:`${p}%`,background:clr,borderRadius:6,transition:'width 0.3s'})
  const sectionTitle = (label)=><div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'16px 0 8px'}}>{label}</div>

  return(
    <Modal onClose={onClose} width={500}>
      <ModalTitle onClose={onClose}><BarChart2 size={16}/>Completion Summary — {event.name}</ModalTitle>
      <ModalBody>
      {/* Overall */}
      <div style={{background:'var(--input-bg,#f8fafc)',borderRadius:10,padding:'14px 16px',marginBottom:4}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <div style={barSt}><div style={barFill(pct,pct===100?'#22c55e':'var(--accent,#2563eb)')}/></div>
          <span style={{fontSize:20,fontWeight:800,color:pct===100?'#16a34a':'var(--accent,#2563eb)',minWidth:46,textAlign:'right'}}>{pct}%</span>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          {[['Done',done,'#22c55e'],['In Progress',inProg,'#3b82f6'],['Pending',pending,'#94a3b8']].map(([l,n,c])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:c}}/>
              <span style={{fontSize:12,color:'var(--text-2)'}}>{l}: <strong>{n}</strong></span>
            </div>
          ))}
        </div>
      </div>

      {/* By bucket */}
      {sectionTitle('By Bucket')}
      {byBucket.map(b=>(
        <div key={b.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:b.color,flexShrink:0}}/>
          <span style={{fontSize:12,color:'var(--text-1)',width:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.name}</span>
          <div style={barSt}><div style={barFill(b.total>0?Math.round(b.done/b.total*100):0,b.color)}/></div>
          <span style={{fontSize:11,color:'var(--text-3)',minWidth:36,textAlign:'right'}}>{b.done}/{b.total}</span>
        </div>
      ))}

      {/* By assignee */}
      {Object.keys(assigneeMap).length>0&&<>
        {sectionTitle('By Assignee')}
        {Object.entries(assigneeMap).sort((a,b)=>b[1].total-a[1].total).map(([name,v])=>(
          <div key={name} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <User size={11} color="var(--text-3)" style={{flexShrink:0}}/>
            <span style={{fontSize:12,color:'var(--text-1)',width:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</span>
            <div style={barSt}><div style={barFill(Math.round(v.done/v.total*100),'#8b5cf6')}/></div>
            <span style={{fontSize:11,color:'var(--text-3)',minWidth:36,textAlign:'right'}}>{v.done}/{v.total}</span>
          </div>
        ))}
      </>}

      {/* Overdue */}
      {overdue.length>0&&<>
        {sectionTitle('Overdue Tasks')}
        {overdue.map(t=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 9px',borderRadius:7,background:'#fef2f2',marginBottom:4,border:'1px solid #fecaca'}}>
            <AlertCircle size={11} color="#ef4444" style={{flexShrink:0}}/>
            <span style={{fontSize:12,color:'#dc2626',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title}</span>
            <span style={{fontSize:11,color:'#ef4444',flexShrink:0}}>{fmtDate(t.due_date)}</span>
          </div>
        ))}
      </>}

      <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
        <button style={btnP} onClick={onClose}>Close</button>
      </div>
      </ModalBody>
    </Modal>
  )
}

// ── EventFormModal ────────────────────────────────────────────────────────────

function EventFormModal({initial,onSave,onClose}){
  const normalizedInitial = {
    ...BLANK_EVENT,
    ...initial,
    event_type: String(initial?.event_type || BLANK_EVENT.event_type).toLowerCase(),
  }
  const [form,setForm]=useState(normalizedInitial)
  const [saving,setSaving]=useState(false)
  const isAnnual = String(form.event_type || '').toLowerCase() === 'annual'
  function f(k){return e=>{const v=e.target.value;setForm(p=>{const n={...p,[k]:v};if(k==='start_date'&&v)n.year=parseInt(v.split('-')[0])||p.year;return n})}}
  function getRecurringLabel(){
    if(!form.year) return null
    const nextYears = Array.from({ length: form.recurring_years || 1 }, (_, i) => parseInt(form.year) + i + 1).join(', ')
    return form.date_fixed
      ? `Will create ${form.name || 'this event'} for ${nextYears} with the same dates.`
      : `Will tentatively book ${form.name || 'this event'} for ${nextYears} — dates can be updated later.`
  }
  async function handleSave(){if(!form.name.trim())return;setSaving(true);await onSave(form);setSaving(false)}
  return(
    <Modal onClose={onClose} width={500}>
      <ModalTitle onClose={onClose}>{initial?.id?'Edit Event':'New Event'}</ModalTitle>
      <ModalBody>
      <Field label="Event Name *"><input autoFocus style={iSt} value={form.name} onChange={f('name')} placeholder="e.g. New Year Service"/></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Field label="Type"><select style={iSt} value={form.event_type} onChange={f('event_type')}>{EVENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="Year"><input style={iSt} type="number" value={form.year} onChange={f('year')}/></Field>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Field label="Start Date"><input style={iSt} type="date" value={form.start_date} onChange={f('start_date')}/></Field>
        <Field label="End Date"><input style={iSt} type="date" value={form.end_date} onChange={f('end_date')}/></Field>
      </div>
      <div style={{background:'var(--input-bg,#f1f5f9)',borderRadius:8,padding:'12px 14px',marginTop:2,display:'flex',flexDirection:'column',gap:10}}>
        {/* Fixed date */}
        <label style={{display:'flex',alignItems:'flex-start',gap:9,cursor:'pointer',userSelect:'none'}}>
          <input type="checkbox" checked={!!form.date_fixed} onChange={e=>setForm(p=>({...p,date_fixed:e.target.checked}))}
            style={{accentColor:'var(--accent,#2563eb)',marginTop:2,width:14,height:14,flexShrink:0}}/>
          <div>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text-1)'}}>Date is fixed (same day every year)</span>
            {form.date_fixed
              ? <p style={{margin:'3px 0 0',fontSize:11,color:'#16a34a'}}>e.g. Christmas (Dec 25), New Year (Jan 1) — dates carry forward automatically.</p>
              : <p style={{margin:'3px 0 0',fontSize:11,color:'var(--text-3)'}}>e.g. VBS, Camp — dates vary and require rescheduling each year.</p>
            }
          </div>
        </label>
        <div style={{height:1,background:'var(--card-border,#e2e8f0)'}}/>
        {/* Recurring */}
        <label style={{display:'flex',alignItems:'flex-start',gap:9,cursor:'pointer',userSelect:'none'}}>
          <input type="checkbox" checked={!!form.is_recurring} onChange={e=>setForm(p=>({...p,is_recurring:e.target.checked}))}
            style={{accentColor:'var(--accent,#2563eb)',marginTop:2,width:14,height:14,flexShrink:0}}/>
          <div style={{flex:1}}>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text-1)'}}>Recurring - auto-books future years</span>
            {form.is_recurring ? (
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:7}}>
                  <span style={{fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap'}}>Book ahead for:</span>
                  <select value={form.recurring_years||1} onChange={e=>setForm(p=>({...p,recurring_years:parseInt(e.target.value)}))}
                    style={{fontSize:12,padding:'3px 8px',borderRadius:6,border:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',color:'var(--text-1)',cursor:'pointer',outline:'none'}}>
                    {[1,2,3,5,10].map(n=><option key={n} value={n}>{n} {n===1?'year':'years'}</option>)}
                  </select>
                </div>
                {form.year && (
                  <p style={{margin:'5px 0 0',fontSize:11,color:'var(--accent,#2563eb)'}}>{getRecurringLabel()}</p>
                )}
              </div>
            ) : (
              <p style={{margin:'3px 0 0',fontSize:11,color:'var(--text-3)'}}>Off - manage each year manually.</p>
            )}
          </div>
        </label>
      </div>
      
      <Field label="Event Colour (overrides type colour)">
        <ColorPicker value={form.color} onChange={c=>setForm(p=>({...p,color:c}))}/>
        {form.color&&<div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}><div style={{width:18,height:18,borderRadius:4,background:form.color}}/><span style={{fontSize:12,color:'var(--text-2)'}}>{form.color}</span></div>}
      </Field>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
        <button style={btnS} onClick={onClose}>Cancel</button>
        <button style={{...btnP,opacity:saving?0.7:1}} onClick={handleSave} disabled={!form.name.trim()||saving}>{saving?'Saving…':'Save Event'}</button>
      </div>
      </ModalBody>
    </Modal>
  )
}

// ── BucketFormModal ───────────────────────────────────────────────────────────

function BucketFormModal({initial,onSave,onClose}){
  const [form,setForm]=useState({...BLANK_BUCKET,...initial})
  const [saving,setSaving]=useState(false)
  async function handleSave(){if(!form.name.trim())return;setSaving(true);await onSave(form);setSaving(false)}
  return(
    <Modal onClose={onClose} width={360}>
      <ModalTitle onClose={onClose}>{initial?.id?'Edit Bucket':'New Bucket'}</ModalTitle>
      <ModalBody>
      <Field label="Name *"><input autoFocus style={iSt} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Choir, Transport"/></Field>
      <Field label="Colour"><ColorPicker value={form.color} onChange={c=>setForm(p=>({...p,color:c||'#6366f1'}))}/></Field>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
        <button style={btnS} onClick={onClose}>Cancel</button>
        <button style={{...btnP,opacity:saving?0.7:1}} onClick={handleSave} disabled={!form.name.trim()||saving}>{saving?'Saving…':'Save'}</button>
      </div>
      </ModalBody>
    </Modal>
  )
}

// ── TaskFormModal ─────────────────────────────────────────────────────────────

function TaskFormModal({initial,buckets,members,volunteers,defaultBucketId,onSave,onClose}){
  const [form,setForm]=useState({...BLANK_TASK,bucket_id:defaultBucketId||buckets[0]?.id||'',assigned_volunteer_id:initial?.assigned_volunteer_id||'',...initial})
  const [saving,setSaving]=useState(false)
  function f(k){return e=>setForm(p=>({...p,[k]:e.target.value}))}
  async function handleSave(){
    if(!form.title.trim()||!form.bucket_id)return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }
  return(
    <Modal onClose={onClose} width={500}>
      <ModalTitle onClose={onClose}>{initial?.id?'Edit Task':'New Task'}</ModalTitle>
      <ModalBody>
      <Field label="Title *"><input autoFocus style={iSt} value={form.title} onChange={f('title')} placeholder="e.g. Book choir for the service"/></Field>
      <Field label="Bucket"><select style={iSt} value={form.bucket_id} onChange={f('bucket_id')}>{buckets.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Field label="Assigned Volunteer">
          <select style={iSt} value={form.assigned_volunteer_id||''} onChange={e=>setForm(p=>({...p,assigned_volunteer_id:e.target.value}))}>
            <option value="">— None —</option>
            {volunteers.map(v=><option key={v.id} value={v.id}>{v.name}{v.role?` · ${v.role}`:''}</option>)}
          </select>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>Select a volunteer to send assignment notification via WhatsApp.</div>
        </Field>
        <Field label="Due Date"><input style={iSt} type="date" value={form.due_date} onChange={f('due_date')}/></Field>
      </div>
      <Field label="Assigned To">
        <input style={iSt} list="ep-mlist" value={form.assigned_to} onChange={f('assigned_to')} placeholder="Person or team"/>
        <datalist id="ep-mlist">{members.map(m=><option key={m.id} value={`${m.first_name||''} ${m.last_name||''}`.trim()}/>)}</datalist>
      </Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Field label="Priority"><select style={iSt} value={form.priority} onChange={f('priority')}>{PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
        <Field label="Status"><select style={iSt} value={form.status} onChange={f('status')}>{TASK_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
      </div>
      <Field label="Notes"><textarea style={{...iSt,resize:'vertical',minHeight:56}} value={form.notes} onChange={f('notes')} placeholder="Optional…"/></Field>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
        <button style={btnS} onClick={onClose}>Cancel</button>
        <button style={{...btnP,opacity:saving?0.7:1}} onClick={handleSave} disabled={!form.title.trim()||!form.bucket_id||saving}>{saving?'Saving…':'Save Task'}</button>
      </div>
      </ModalBody>
    </Modal>
  )
}

function LibraryTaskFormModal({initial,onSave,onClose,libraryTasks}){
  const [form,setForm]=useState({
    title:'',description:'',priority:'medium',parent_id:'',sort_order:libraryTasks.filter(t=>!t.parent_id).length,
    ...initial,
  })
  const [saving,setSaving]=useState(false)
  function f(k){return e=>setForm(p=>({...p,[k]:e.target.value}))}
  async function handleSave(){
    if(!form.title.trim())return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }
  return(
    <Modal onClose={onClose} width={440}>
      <ModalTitle onClose={onClose}>{initial?.id?'Edit Template':'New Library Template'}</ModalTitle>
      <ModalBody>
      <Field label="Title *"><input autoFocus style={iSt} value={form.title} onChange={f('title')} placeholder="e.g. Welcome folder"/></Field>
      <Field label="Description"><textarea style={{...iSt,resize:'vertical',minHeight:72}} value={form.description} onChange={f('description')} placeholder="Optional details or instructions"/></Field>
      <Field label="Priority"><select style={iSt} value={form.priority} onChange={f('priority')}>{PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
      <Field label="Parent Template"><select style={iSt} value={form.parent_id||''} onChange={f('parent_id')}>
        <option value="">— None —</option>
        {libraryTasks.filter(t=>t.id!==initial?.id).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
      </select></Field>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
        <button style={btnS} onClick={onClose}>Cancel</button>
        <button style={{...btnP,opacity:saving?0.7:1}} onClick={handleSave} disabled={!form.title.trim()||saving}>{saving?'Saving…':'Save Template'}</button>
      </div>
      </ModalBody>
    </Modal>
  )
}

function AssignModal({initial, volunteers, onSave, onClose}){
  const [role, setRole] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(()=>{
    if(!initial) return
    if(initial.assigned_volunteer_id){
      setSelectedIds([String(initial.assigned_volunteer_id)])
      return
    }
    if(initial.assigned_to){
      const names = String(initial.assigned_to||'').split(',').map(s=>s.trim()).filter(Boolean)
      const ids = volunteers.filter(v=>names.includes(v.name)).map(v=>String(v.id))
      setSelectedIds(ids)
    }
  },[initial,volunteers])

  const roles = [...new Set(volunteers.map(v=>v.role).filter(Boolean))]
  const available = role ? volunteers.filter(v=>v.role===role) : volunteers
  
  // Check if task is already assigned
  const isAssigned = !!(initial?.assigned_to || initial?.assigned_volunteer_id)
  // Check if all volunteers are unselected
  const isAllUnselected = selectedIds.length === 0

  function toggleSel(id){
    setSelectedIds(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s,id])
  }

  const selectedVolunteers = volunteers.filter(v=>selectedIds.includes(String(v.id)))
  const assignedNames = selectedVolunteers.map(v=>v.name).join(', ')

  return (
    <Modal onClose={onClose} width={420}>
      <ModalTitle onClose={onClose}>Assign — {initial?.title || initial?.name || 'Task'}</ModalTitle>
      <ModalBody>
        <Field label="Role">
          <select style={iSt} value={role} onChange={e=>setRole(e.target.value)}>
            <option value="">— Select role —</option>
            {roles.map(r=> <option key={r} value={r}>{r}</option> )}
          </select>
        </Field>

        <Field label="Names (select one or more)">
          <div style={{border:'1px solid var(--card-border,#e2e8f0)',borderRadius:6,maxHeight:160,overflowY:'auto',padding:6}}>
            {available.map(v=> (
              <label key={v.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 4px',cursor:'pointer'}}>
                <input type="checkbox" checked={selectedIds.includes(String(v.id))} onChange={()=>toggleSel(String(v.id))} />
                <span style={{fontSize:13}}>{v.name}{v.role?` · ${v.role}`:''}</span>
              </label>
            ))}
            {available.length===0 && <div style={{padding:8,color:'var(--text-3)'}}>No volunteers for this role</div>}
          </div>
        </Field>

        <Field label="Assigned To">
          <div style={{padding:'8px',background:'var(--input-bg,#f8fafc)',borderRadius:6}}>{assignedNames || '— Unassigned —'}</div>
        </Field>

        <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center',marginTop:6}}>
          <div style={{fontSize:12,color:'var(--text-3)'}}>{selectedVolunteers.length} selected</div>
          <div style={{display:'flex',gap:8}}>
            <button style={btnS} onClick={onClose}>Cancel</button>
            <button style={{...btnP,opacity:(selectedIds.length||isAllUnselected&&isAssigned)?1:0.5,cursor:(selectedIds.length||isAllUnselected&&isAssigned)?'pointer':'not-allowed'}} onClick={async ()=>{
              // If no volunteers selected and task is already assigned, unassign
              if(isAllUnselected && isAssigned){
                await onSave(initial.id, [])
                return
              }
              // If volunteers selected, assign them
              if(selectedIds.length>0){
                const ids = selectedIds.slice()
                await onSave(initial.id, ids)
                return
              }
              // Otherwise show error
              toast('Select at least one volunteer to assign','error')
            }} disabled={!selectedIds.length && !(isAllUnselected&&isAssigned)}>
              {isAllUnselected && isAssigned ? 'Unassign' : selectedIds.length>1?'Assign (multiple)':'Assign'}
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}

// ── CarryForwardModal ─────────────────────────────────────────────────────────

function CarryForwardModal({currentEvent,allEvents,onCarryForward,onClose}){
  const [sourceId,setSourceId]=useState('')
  const [preview,setPreview]=useState(null)
  const [advance,setAdvance]=useState(false)
  const [loading,setLoading]=useState(false)
  const [copying,setCopying]=useState(false)

  const sourceEvent=allEvents.find(e=>e.id===sourceId)||null

  async function handleSelect(id){
    setSourceId(id);setPreview(null)
    if(!id){setAdvance(false);return}
    setLoading(true)
    try{
      const [b,t]=await Promise.all([getBuckets(id),getTasks(id)])
      const src=allEvents.find(e=>e.id===id)
      const isFixed=src?.date_fixed||false
      setAdvance(isFixed)
      const parentTasks=t.filter(x=>!x.parent_id).length
      const childTasks=t.filter(x=>x.parent_id).length
      setPreview({buckets:b.length,tasks:t.length,parentTasks,childTasks,hasDates:t.some(x=>x.due_date),isFixed})
    }finally{setLoading(false)}
  }
  async function handleCopy(){
    if(!sourceId)return;setCopying(true);await onCarryForward(sourceId,advance);setCopying(false)
  }
  return(
    <Modal onClose={onClose} width={460}>
      <ModalTitle onClose={onClose}>Copy Tasks from Another Event</ModalTitle>
      <ModalBody>
      <p style={{margin:'0 0 14px',fontSize:13,color:'var(--text-2)'}}>Copy all buckets &amp; tasks into <strong>{currentEvent.name}</strong>. Statuses reset to <em>Pending</em>.</p>
      <Field label="Source Event">
        <select style={iSt} value={sourceId} onChange={e=>handleSelect(e.target.value)}>
          <option value="">— Select an event —</option>
          {allEvents.filter(e=>e.id!==currentEvent.id).map(e=>(
            <option key={e.id} value={e.id}>{e.name}{e.year?` (${e.year})`:''}{e.date_fixed?' 📅':''}</option>
          ))}
        </select>
      </Field>
      {loading&&<p style={{fontSize:13,color:'var(--text-3)',margin:'6px 0'}}>Loading…</p>}
      {preview&&!loading&&(
        <div style={{borderRadius:8,margin:'6px 0 12px',fontSize:13,color:'var(--text-2)'}}>
          <div style={{background:'var(--input-bg,#f1f5f9)',borderRadius:8,padding:'11px 14px'}}>
            {preview.buckets > 0 ? (
              <><strong>{preview.buckets}</strong> Buckets · <strong>{preview.tasks}</strong> Tasks</>
            ) : (
              <><strong>{preview.parentTasks}</strong> Categor{preview.parentTasks===1?'y':'ies'} · <strong>{preview.childTasks}</strong> Subtask{preview.childTasks===1?'':'s'}</>
            )}
          </div>
          {preview.isFixed?(
            <div style={{background:'#dcfce7',borderRadius:8,padding:'10px 14px',marginTop:8,display:'flex',alignItems:'flex-start',gap:8}}>
              <CalendarDays size={14} color="#16a34a" style={{flexShrink:0,marginTop:1}}/>
              <div>
                <span style={{fontSize:12,fontWeight:700,color:'#16a34a'}}>Fixed-date event</span>
                <p style={{margin:'2px 0 0',fontSize:11,color:'#15803d'}}>This event falls on the same date every year. Task due dates will be advanced by +1 year automatically.</p>
                {preview.hasDates&&(
                  <label style={{display:'flex',alignItems:'center',gap:7,marginTop:8,cursor:'pointer',fontSize:12,color:'#166534'}}>
                    <input type="checkbox" checked={advance} onChange={e=>setAdvance(e.target.checked)} style={{accentColor:'#16a34a'}}/>
                    Advance task due dates by +1 year
                  </label>
                )}
              </div>
            </div>
          ):(
            <div style={{background:'#fff7ed',borderRadius:8,padding:'10px 14px',marginTop:8,display:'flex',alignItems:'flex-start',gap:8}}>
              <AlertCircle size={14} color="#c2410c" style={{flexShrink:0,marginTop:1}}/>
              <div>
                <span style={{fontSize:12,fontWeight:700,color:'#c2410c'}}>Variable-date event</span>
                <p style={{margin:'2px 0 0',fontSize:11,color:'#9a3412'}}>This event requires rescheduling each year. Task due dates will be cleared — remember to set new dates after copying.</p>
                {preview.hasDates&&(
                  <label style={{display:'flex',alignItems:'center',gap:7,marginTop:8,cursor:'pointer',fontSize:12,color:'#7c2d12'}}>
                    <input type="checkbox" checked={advance} onChange={e=>setAdvance(e.target.checked)} style={{accentColor:'#c2410c'}}/>
                    Carry forward existing dates anyway (+1 year)
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
        <button style={btnS} onClick={onClose}>Cancel</button>
        <button style={{...btnP,opacity:(!sourceId||!preview||copying)?0.6:1,display:'flex',alignItems:'center',gap:6}} onClick={handleCopy} disabled={!sourceId||!preview||copying}>
          <Copy size={14}/>{copying?'Copying…':'Copy Tasks'}
        </button>
      </div>
      </ModalBody>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventPlannerPage(){
  const {profile}=useAuth()
  const toast=useToast()
  const navigate=useNavigate()

  // Settings (localStorage mirror; EventSettingsPage also persists to churches.event_planner_settings)
  const [settings,setSettings]=useState(()=>{
    try{return{weekStartDay:0,...JSON.parse(localStorage.getItem('epSettings')||'{}')} }
    catch{return{weekStartDay:0}}
  })
  const ws=settings.weekStartDay??0  // 0=Sunday (India default), 1=Monday

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      try{
        const church=await getChurch()
        const fromDb=church?.event_planner_settings
        if(cancelled||!fromDb||typeof fromDb!=='object') return
        const next={weekStartDay:0,...fromDb}
        setSettings(next)
        try{localStorage.setItem('epSettings',JSON.stringify(next))}catch{}
      }catch{}
    })()
    return()=>{cancelled=true}
  },[])

  const [confirmDlg,setConfirmDlg]=useState(null)
  const [confirmBusy,setConfirmBusy]=useState(false)

  // view: 'year' | 'month' | 'week' | 'agenda' | 'cards' | 'board'
  const [view,       setView]       = useState('month')
  const [prevView,   setPrevView]   = useState('month')
  const [yearFilter, setYearFilter] = useState(null)
  const [yearSortAsc, setYearSortAsc] = useState(false)

  // Calendar navigation
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date())
  const [calWeek,  setCalWeek]  = useState(()=>getWeekStart(ws))

  // Data
  const [events,    setEvents]    = useState([])
  const [buckets,   setBuckets]   = useState([])
  const [tasks,     setTasks]     = useState([])
  const [libraryTasks, setLibraryTasks] = useState([])
  const [librarySaving, setLibrarySaving] = useState(false)
  const [libraryModal, setLibraryModal] = useState(null)
  const [libraryRecentlyAddedId, setLibraryRecentlyAddedId] = useState(null)
  const [volunteers, setVolunteers] = useState([])
  const [members,   setMembers]   = useState([])
  const tasksRef = useRef(tasks)
  const delayedWhatsAppQueue = useRef(new Map())

  useEffect(()=>{ tasksRef.current = tasks }, [tasks])
  useEffect(()=>{ return ()=>{ delayedWhatsAppQueue.current.forEach(item=>clearTimeout(item.timerId)); delayedWhatsAppQueue.current.clear() } }, [])
  const [selEvent,  setSelEvent]  = useState(null)
  const [loading,   setLoading]   = useState(true)

  // Board filters
  const [fStatus,    setFStatus]    = useState('')
  const [fPriority,  setFPriority]  = useState('')
  const [fAssignee,  setFAssignee]  = useState('')

  // Modals
  const [eventModal,  setEventModal]  = useState(null)
  const [bucketModal, setBucketModal] = useState(null)
  const [taskModal,   setTaskModal]   = useState(null)
  const [assignModal, setAssignModal] = useState(null)
  const [taskDefBkt,  setTaskDefBkt]  = useState(null)
  const [carryModal,  setCarryModal]  = useState(false)

  // Calendar drag-select + click tooltip
  const [selRange,    setSelRange]    = useState(null)
  const [tooltip,     setTooltip]     = useState(null)
  const calDragRef    = useRef({ active: false, start: null, end: null })

  function handleDayClick(ds, x, y) {
    setSelRange(null)
    setTooltip(t => t && t.ds === ds ? null : { ds, x, y })
  }

  function handleDayContextMenu(e, ds) {
    e.preventDefault()
    setTooltip(null)
    const inSel = selRange && ds >= selRange.start && ds <= selRange.end
    const start = inSel ? selRange.start : ds
    const end   = inSel ? selRange.end   : ds
    setSelRange(null)
    setEventModal({ start_date: start, end_date: end, year: parseInt(start.split('-')[0]) })
  }

  // Calendar filter
  const [calFilter,   setCalFilter]   = useState({ type:'' })

  // Search
  const [search,      setSearch]      = useState('')
  const [showSearch,  setShowSearch]  = useState(false)

  // Exporting state
  const [exportingEventId, setExportingEventId] = useState(null)
  const [exportingAll, setExportingAll] = useState(false)
  const [exportingFilteredCards, setExportingFilteredCards] = useState(false)

  // Completion summary
  const [summaryModal,setSummaryModal]= useState(false)

  // DnD
  const [activeTask,setActiveTask]=useState(null)
  const [activeLibraryTask,setActiveLibraryTask]=useState(null)
  const [libCreatedTaskIds,setLibCreatedTaskIds]=useState([])
  const [collapsedCanvasCategories,setCollapsedCanvasCategories]=useState({})
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}))

  // ── Data loaders ────────────────────────────────────────────

  const loadEvents=useCallback(async()=>{
    setLoading(true)
    try{
      let data=await getEvents()
      const created=await autoFillRecurring(data,profile?.email)
      if(created>0)data=await getEvents()
      setEvents(data)
    }
    catch{toast('Failed to load events','error')}
    finally{setLoading(false)}
  },[toast,profile])

  const loadBoard=useCallback(async(id)=>{
    try{
      const [b,t]=await Promise.all([getBuckets(id),getTasks(id)])
      setBuckets(b);setTasks(t)
    }catch{toast('Failed to load board','error')}
  },[toast])

  const loadVolunteers=useCallback(async()=>{
    try{setVolunteers(await getEventVolunteers())}catch{}
  },[])

  const loadLibraryTasks=useCallback(async()=>{
    try{setLibraryTasks(await getTaskLibrary())}catch{}
  },[])

  function getWhatsAppReminderDelay(notificationKey){
    if(!selEvent?.start_date) return null
    const eventStart = parseDateOnly(selEvent.start_date)
    if(!eventStart) return null

    const now = Date.now()
    let targetTime = null

    if(notificationKey === 'followup-1') {
      targetTime = eventStart.getTime() - 7 * 24 * 60 * 60 * 1000
    } else if(notificationKey === 'followup-2') {
      targetTime = eventStart.getTime() - 2 * 24 * 60 * 60 * 1000
    }

    if(targetTime === null || targetTime <= now) return null
    return targetTime - now
  }

  function scheduleDelayedWhatsAppNotification(taskId, recipients, buildMessage, delayMs = 180000, notificationKey = 'default') {
    if(!taskId || !Array.isArray(recipients) || recipients.length === 0) return
    const validRecipients = recipients.filter(r => r?.whatsapp)
    if(validRecipients.length === 0) return

    const queue = delayedWhatsAppQueue.current
    const queueKey = `${taskId}::${notificationKey}`
    const existing = queue.get(queueKey)
    if(existing) {
      validRecipients.forEach(recipient => existing.recipientsMap.set(recipient.whatsapp, recipient))
      return
    }

    const item = {
      recipientsMap: new Map(validRecipients.map(recipient => [recipient.whatsapp, recipient])),
      buildMessage,
      timerId: null,
    }

    item.timerId = setTimeout(async () => {
      queue.delete(queueKey)
      const recipientsToSend = Array.from(item.recipientsMap.values())
      if(recipientsToSend.length === 0) return

      try {
        const { data: church, error } = await supabase.from('churches').select('*').limit(1).single()
        if(error || !church) {
          console.error('[WhatsApp] Failed to load church config', error)
          toast('WhatsApp notification could not be sent','error')
          return
        }

        const sendResults = await Promise.allSettled(recipientsToSend.map(async recipient => {
          const message = buildMessage(recipient)
          try {
            const result = await sendWhatsAppMessage(church, { to: recipient.whatsapp, message })
            return { recipient: recipient.name, status: 'fulfilled', result }
          } catch (err) {
            console.error('[WhatsApp] send failed for', recipient.name, { error: err, message })
            return { recipient: recipient.name, status: 'rejected', reason: err?.message || String(err) }
          }
        }))

        const successes = sendResults.filter(r => r.status === 'fulfilled')
        const failures = sendResults.filter(r => r.status === 'rejected')
        if(successes.length){
          toast(`WhatsApp sent to ${successes.map(r=>r.recipient).join(', ')}`,'success')
          const task = tasksRef.current.find(t=>t.id===taskId)
          const currentCount = Number(task?.whatsapp_sent_count || 0)
          const newCount = currentCount + 1
          const sentAt = new Date().toISOString()
          try{
            const updateKey = notificationKey === 'followup-1'
              ? 'whatsapp_followup_1_sent_at'
              : notificationKey === 'followup-2'
                ? 'whatsapp_followup_2_sent_at'
                : 'whatsapp_sent_at'
            const payload = { whatsapp_sent_count: newCount }
            if (updateKey) payload[updateKey] = sentAt
            await saveTask(taskId, payload, profile?.email)
            setTasks(prev => prev.map(t => t.id===taskId ? { ...t, ...payload } : t))
          } catch(err){
            console.error('[WhatsApp] failed to update send count', err)
          }
        }
        if(failures.length){
          console.error('[WhatsApp] send failures', failures)
          toast(`WhatsApp failed for ${failures.map(r => `${r.recipient}: ${r.reason}`).join(', ')}`,'error')
        }
      } catch (err) {
        console.error('[WhatsApp] delayed send error', err)
        toast('WhatsApp notification could not be sent','error')
      }
    }, delayMs)

    queue.set(queueKey, item)
  }

  useEffect(()=>{loadEvents()},[loadEvents])
  useEffect(()=>{
    const onKey=(e)=>{if(e.key==='Escape')setTooltip(null)}
    const onCtx=(e)=>e.preventDefault()   // suppress native context menu on the calendar page
    document.addEventListener('keydown',onKey)
    document.addEventListener('contextmenu',onCtx)
    return()=>{
      document.removeEventListener('keydown',onKey)
      document.removeEventListener('contextmenu',onCtx)
    }
  },[])

  // "+" opens New Event (planner views only; skip when typing or any modal is open)
  useEffect(() => {
    function onKey(e) {
      if (!isPlusHotkey(e)) return
      if (view === 'board') return
      if (eventModal !== null || bucketModal || taskModal || assignModal || carryModal || libraryModal || confirmDlg || summaryModal) return
      if (isTypingTarget(e.target) || isTypingTarget()) return
      e.preventDefault()
      setTooltip(null)
      setEventModal({})
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [view, eventModal, bucketModal, taskModal, assignModal, carryModal, libraryModal, confirmDlg, summaryModal])
  
  useEffect(()=>{
    supabase.from('members').select('id,first_name,last_name').eq('is_active', true).order('first_name').then(({data,error})=>{
      if(error){
        console.error('Failed loading active members:', error)
        return
      }
      setMembers(data||[])
    })
  },[])

  // Global mouseup — finalise calendar drag-select
  useEffect(()=>{
    function onUp(e){
      if(e.button!==0)return  // ignore right-click
      if(!calDragRef.current.active)return
      const {start,end}=calDragRef.current
      calDragRef.current={active:false,start:null,end:null}
      if(!start||start===end) setSelRange(null)  // plain click — clear selection, popup handles it
      // multi-date drag: keep selRange highlighted; right-click will open new event form
    }
    document.addEventListener('mouseup',onUp)
    return()=>document.removeEventListener('mouseup',onUp)
  },[])

  // ── Navigation ──────────────────────────────────────────────

  function openBoard(event){
    setPrevView(view);setSelEvent(event);setView('board');setFStatus('');setFPriority('');setFAssignee('');
    loadBoard(event.id);loadLibraryTasks();loadVolunteers()
  }

  async function exportEvent(event) {
    if (!event) return
    setExportingEventId(event.id)
    try {
      const [buckets, tasks] = await Promise.all([getBuckets(event.id), getTasks(event.id)])
      const rows = buildEventTaskRows(event, buckets, tasks)
      const columns = [
        { header: 'Task', key: 'task', align: 'left' },
        { header: 'Subtasks', key: 'subtasks', align: 'left' },
        { header: 'Assigned To', key: 'assigned_to', align: 'left' },
        { header: 'Sub Assigned To', key: 'sub_assigned_to', align: 'left' },
        { header: 'Reports To', key: 'reports_to', align: 'left' },
        { header: 'Notes', key: 'notes', align: 'left' },
        { header: 'WhatsApp 1st Notification', key: 'whatsapp_scheduled', align: 'center', merge: true },
        { header: 'WhatsApp 2nd Notification', key: 'whatsapp_followup_1', align: 'center', merge: true },
        { header: 'WhatsApp Final Notification', key: 'whatsapp_followup_2', align: 'center', merge: true },
      ]
      const titleLines = [
        { text: event.name || 'Event', bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
        { text: `${getEventTypeLabel(event.event_type)} · ${getEventDateRange(event)}`, size: 11 },
      ]
      const safeName = safeFileName(event.name || `Event_${event.id}`)
      const dateLabel = safeFileName(formatDate(event.start_date) || String(event.year) || new Date().toLocaleDateString('en-IN'))
      await exportToExcelWithTitle(columns, rows, 'Tasks', `Event_${safeName}_${dateLabel}.xlsx`, titleLines)
    } catch (error) {
      console.error('Export event failed', error)
      toast('Failed to export event to Excel','error')
    } finally {
      setExportingEventId(null)
    }
  }

  async function exportCurrentEvent() {
    if (!selEvent) {
      toast('Select an event to export first','error')
      return
    }
    await exportEvent(selEvent)
  }

  async function exportAllEvents() {
    if (!events?.length) {
      toast('No events available to export','info')
      return
    }
    setExportingAll(true)
    try {
      const eventIds = events.map(e => e.id).filter(Boolean)
      const [buckets, tasks] = await Promise.all([
        getBucketsForEvents(eventIds),
        getTasksForEvents(eventIds),
      ])
      const bucketsByEvent = eventIds.reduce((map, id) => map.set(id, []), new Map())
      const tasksByEvent   = eventIds.reduce((map, id) => map.set(id, []), new Map())
      for (const bucket of buckets) {
        bucketsByEvent.get(bucket.event_id)?.push(bucket)
      }
      for (const task of tasks) {
        tasksByEvent.get(task.event_id)?.push(task)
      }

      const summaryColumns = [
        { header: 'Event Name', key: 'event_name', align: 'left' },
        { header: 'Type', key: 'event_type', align: 'left' },
        { header: 'Status', key: 'status', align: 'left' },
        { header: 'Dates', key: 'dates', align: 'left' },
        { header: 'Year', key: 'year', align: 'center' },
        { header: 'Task Count', key: 'task_count', align: 'center' },
      ]
      const compareEvents = (a, b) => {
        const yearA = Number(a.year) || Number.MAX_SAFE_INTEGER
        const yearB = Number(b.year) || Number.MAX_SAFE_INTEGER
        if (yearA !== yearB) return yearA - yearB
        const dateA = String(a.start_date || '')
        const dateB = String(b.start_date || '')
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        return String(a.name || '').localeCompare(String(b.name || ''))
      }

      const sortedEvents = [...events].sort(compareEvents)
      const summaryRows = sortedEvents.map(event => ({
        event_name: event.name || '',
        event_type: getEventTypeLabel(event.event_type),
        status: getEventStatusLabel(event.status),
        dates: getEventDateRange(event),
        year: event.year || '',
        task_count: (tasksByEvent.get(event.id) || []).length,
      }))
      const yearGroups = [...new Set(sortedEvents.map(e => String(e.year || 'Unknown')))]
      const yearTabColors = ['FF122A61','FF1D4F27','FF4D2F73','FF7A2B2B','FF4B3E2F','FF1F4046']
      const getYearTabColor = year => {
        const index = yearGroups.indexOf(String(year || 'Unknown'))
        return yearTabColors[index % yearTabColors.length]
      }
      const summaryTabColor = 'FF800000' // Maroon for summary sheet

      const taskColumns = [
        { header: 'Task', key: 'task', align: 'left' },
        { header: 'Subtasks', key: 'subtasks', align: 'left' },
        { header: 'Assigned To', key: 'assigned_to', align: 'left' },
        { header: 'Sub Assigned To', key: 'sub_assigned_to', align: 'left' },
        { header: 'Reports To', key: 'reports_to', align: 'left' },
        { header: 'Notes', key: 'notes', align: 'left' },
        { header: 'WhatsApp 1st Notification', key: 'whatsapp_scheduled', align: 'center', merge: true },
        { header: 'WhatsApp 2nd Notification', key: 'whatsapp_followup_1', align: 'center', merge: true },
        { header: 'WhatsApp Final Notification', key: 'whatsapp_followup_2', align: 'center', merge: true },
      ]

      const usedSheetNames = new Set(['Summary'])
      const sheets = []

      for (const event of sortedEvents) {
        const bucketList = bucketsByEvent.get(event.id) || []
        const taskList = tasksByEvent.get(event.id) || []
        const rows = buildEventTaskRows(event, bucketList, taskList)
        let baseName = normalizeSheetName(event.name || `Event_${event.id}`)
        if (!baseName) baseName = `Event_${event.id}`
        let sheetName = baseName
        let counter = 1
        while (usedSheetNames.has(sheetName)) {
          sheetName = `${baseName.slice(0, 24)}_${counter++}`
        }
        usedSheetNames.add(sheetName)

        sheets.push({
          name: sheetName,
          columns: taskColumns,
          rows,
          titleLines: [
            { text: event.name || 'Event', bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
            { text: `${getEventTypeLabel(event.event_type)} · ${getEventDateRange(event)}`, size: 11 },
          ],
          tabColor: getYearTabColor(event.year),
        })
      }

      sheets.push({ name: 'Summary', columns: summaryColumns, rows: summaryRows, tabColor: summaryTabColor })
      const dateLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-')
      await exportMultiSheetWithTitle(sheets, `Event_Planner_All_Events_${dateLabel}.xlsx`)
    } catch (error) {
      console.error('Export all events failed', error)
      toast('Failed to export all events','error')
    } finally {
      setExportingAll(false)
    }
  }

  async function exportFilteredCards() {
    if (!filteredEvents?.length) {
      toast('No events visible to export','info')
      return
    }
    setExportingFilteredCards(true)
    try {
      const eventIds = filteredEvents.map(e => e.id).filter(Boolean)
      const [buckets, tasks] = await Promise.all([
        getBucketsForEvents(eventIds),
        getTasksForEvents(eventIds),
      ])
      const bucketsByEvent = eventIds.reduce((map, id) => map.set(id, []), new Map())
      const tasksByEvent   = eventIds.reduce((map, id) => map.set(id, []), new Map())
      for (const bucket of buckets) {
        bucketsByEvent.get(bucket.event_id)?.push(bucket)
      }
      for (const task of tasks) {
        tasksByEvent.get(task.event_id)?.push(task)
      }

      const summaryColumns = [
        { header: 'Event Name', key: 'event_name', align: 'left' },
        { header: 'Type', key: 'event_type', align: 'left' },
        { header: 'Status', key: 'status', align: 'left' },
        { header: 'Dates', key: 'dates', align: 'left' },
        { header: 'Year', key: 'year', align: 'center' },
        { header: 'Task Count', key: 'task_count', align: 'center' },
      ]
      const compareEvents = (a, b) => {
        const yearA = Number(a.year) || Number.MAX_SAFE_INTEGER
        const yearB = Number(b.year) || Number.MAX_SAFE_INTEGER
        if (yearA !== yearB) return yearA - yearB
        const dateA = String(a.start_date || '')
        const dateB = String(b.start_date || '')
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        return String(a.name || '').localeCompare(String(b.name || ''))
      }

      const sortedEvents = [...filteredEvents].sort(compareEvents)
      const summaryRows = sortedEvents.map(event => ({
        event_name: event.name || '',
        event_type: getEventTypeLabel(event.event_type),
        status: getEventStatusLabel(event.status),
        dates: getEventDateRange(event),
        year: event.year || '',
        task_count: (tasksByEvent.get(event.id) || []).length,
      }))
      const yearGroups = [...new Set(sortedEvents.map(e => String(e.year || 'Unknown')))]
      const yearTabColors = ['FF122A61','FF1D4F27','FF4D2F73','FF7A2B2B','FF4B3E2F','FF1F4046']
      const getYearTabColor = year => {
        const index = yearGroups.indexOf(String(year || 'Unknown'))
        return yearTabColors[index % yearTabColors.length]
      }
      const summaryTabColor = 'FF800000' // Maroon for summary sheet

      const taskColumns = [
        { header: 'Task', key: 'task', align: 'left' },
        { header: 'Subtasks', key: 'subtasks', align: 'left' },
        { header: 'Assigned To', key: 'assigned_to', align: 'left' },
        { header: 'Sub Assigned To', key: 'sub_assigned_to', align: 'left' },
        { header: 'Reports To', key: 'reports_to', align: 'left' },
        { header: 'Notes', key: 'notes', align: 'left' },
        { header: 'WhatsApp 1st Notification', key: 'whatsapp_scheduled', align: 'center', merge: true },
        { header: 'WhatsApp 2nd Notification', key: 'whatsapp_followup_1', align: 'center', merge: true },
        { header: 'WhatsApp Final Notification', key: 'whatsapp_followup_2', align: 'center', merge: true },
      ]

      const usedSheetNames = new Set(['Summary'])
      const sheets = []

      for (const event of sortedEvents) {
        const bucketList = bucketsByEvent.get(event.id) || []
        const taskList = tasksByEvent.get(event.id) || []
        const rows = buildEventTaskRows(event, bucketList, taskList)
        let baseName = normalizeSheetName(event.name || `Event_${event.id}`)
        if (!baseName) baseName = `Event_${event.id}`
        let sheetName = baseName
        let counter = 1
        while (usedSheetNames.has(sheetName)) {
          sheetName = `${baseName.slice(0, 24)}_${counter++}`
        }
        usedSheetNames.add(sheetName)

        sheets.push({
          name: sheetName,
          columns: taskColumns,
          rows,
          titleLines: [
            { text: event.name || 'Event', bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
            { text: `${getEventTypeLabel(event.event_type)} · ${getEventDateRange(event)}`, size: 11 },
          ],
          tabColor: getYearTabColor(event.year),
        })
      }

      sheets.push({ name: 'Summary', columns: summaryColumns, rows: summaryRows, tabColor: summaryTabColor })
      const dateLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-')
      await exportMultiSheetWithTitle(sheets, `Event_Planner_Cards_Events_${dateLabel}.xlsx`)
    } catch (error) {
      console.error('Export filtered card events failed', error)
      toast('Failed to export cards task list','error')
    } finally {
      setExportingFilteredCards(false)
    }
  }

  function backFromBoard(){ setView(prevView);setSelEvent(null);setBuckets([]);setTasks([]) }

  // ── Calendar nav ────────────────────────────────────────────

  const prevMonth=()=>setCalMonth(d=>new Date(d.getFullYear(),d.getMonth()-1,1))
  const nextMonth=()=>setCalMonth(d=>new Date(d.getFullYear(),d.getMonth()+1,1))
  const goToday  =()=>setCalMonth(new Date())
  const prevWeek =()=>setCalWeek(d=>{const n=new Date(d);n.setDate(d.getDate()-7);return n})
  const nextWeek =()=>setCalWeek(d=>{const n=new Date(d);n.setDate(d.getDate()+7);return n})
  const goThisWeek=()=>setCalWeek(getWeekStart(ws))

  // Open event form pre-filled with a clicked date
  function clickDate(ds){
    setEventModal({start_date:ds,end_date:ds,year:parseInt(ds.split('-')[0])})
  }

  // ── CRUD: Events ────────────────────────────────────────────

  async function handleSaveEvent(form){
    try{
      const yr=parseInt(form.year)||null
      const payload={
        name:form.name.trim(),event_type:String(form.event_type||'annual').toLowerCase(),
        start_date:form.start_date||null,end_date:form.end_date||null,
        year:yr,color:form.color||null,
        status:form.status||'planning',
        date_fixed:!!form.date_fixed,is_recurring:!!form.is_recurring,
      }
      await saveEvent(form.id||null,payload,profile?.email)

      // Auto-book next year for recurring annual events (new or edited)
      if(form.is_recurring&&form.event_type==='annual'&&yr){
        const nextYr=yr+1
        const alreadyExists=events.some(e=>e.name.toLowerCase()===payload.name.toLowerCase()&&e.year===nextYr)
        if(!alreadyExists){
          const nextPayload={
            ...payload,
            year:nextYr,status:'planning',
            start_date:payload.start_date?addOneYear(payload.start_date):null,
            end_date:payload.end_date?addOneYear(payload.end_date):null,
          }
          await saveEvent(null,nextPayload,profile?.email)
          toast(
            payload.date_fixed
              ? `${payload.name} (${nextYr}) auto-created with same dates`
              : `${payload.name} (${nextYr}) tentatively booked — update dates when ready`,
            'success'
          )
        }
      }

      toast(form.id?'Event updated':'Event created','success')
      setEventModal(null);await loadEvents()
      if(form.id&&selEvent?.id===form.id)setSelEvent(e=>({...e,...payload}))
    }catch{toast('Failed to save event','error')}
  }

  async function handleDeleteEvent(event){
    setConfirmDlg({
      title:'Delete event?',
      message:`Delete "${event.name}"? All buckets and tasks will be removed.`,
      onConfirm:async()=>{
        setConfirmBusy(true)
        try{
          await deleteEvent(event.id);toast('Event deleted','success')
          if(selEvent?.id===event.id)backFromBoard();await loadEvents()
          setConfirmDlg(null)
        }catch{toast('Failed to delete event','error')}
        finally{setConfirmBusy(false)}
      },
    })
  }

  // ── CRUD: Buckets ───────────────────────────────────────────

  async function handleSaveBucket(form){
    try{
      await saveBucket(form.id||null,{name:form.name.trim(),color:form.color,event_id:selEvent.id})
      toast(form.id?'Bucket updated':'Bucket added','success');setBucketModal(null);await loadBoard(selEvent.id)
    }catch{toast('Failed to save bucket','error')}
  }

  async function handleDeleteBucket(bucket){
    const cnt=tasks.filter(t=>t.bucket_id===bucket.id).length
    setConfirmDlg({
      title:'Delete bucket?',
      message:`Delete "${bucket.name}"?${cnt>0?` Also deletes ${cnt} task${cnt>1?'s':''}.`:''}`,
      onConfirm:async()=>{
        setConfirmBusy(true)
        try{await deleteBucket(bucket.id);toast('Bucket deleted','success');await loadBoard(selEvent.id);setConfirmDlg(null)}
        catch{toast('Failed to delete bucket','error')}
        finally{setConfirmBusy(false)}
      },
    })
  }

  // ── CRUD: Tasks ─────────────────────────────────────────────

  async function handleSaveTask(form){
    try{
      const volunteer = volunteers.find(v=>v.id===form.assigned_volunteer_id)
      const payload={
        event_id:selEvent.id,
        bucket_id:form.bucket_id,
        title:form.title.trim(),
        assigned_to:volunteer?volunteer.name:(form.assigned_to||null),
        assigned_volunteer_id:form.assigned_volunteer_id||null,
        due_date:form.due_date||null,
        priority:form.priority,
        status:form.status,
        notes:form.notes||null,
      }
      if(!form.id) payload.sort_order=tasks.filter(t=>t.bucket_id===form.bucket_id).length
      const savedTaskId = await saveTask(form.id||null,payload,profile?.email)
      toast(form.id?'Task updated':'Task added','success')
      setTaskModal(null);setTaskDefBkt(null);await loadBoard(selEvent.id)

    }catch{toast('Failed to save task','error')}
  }

  function resolveAssignedVolunteerIds(task){
    if(task.assigned_volunteer_id) return [String(task.assigned_volunteer_id)]
    if(!task.assigned_to) return []
    return String(task.assigned_to)
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .map(name => volunteers.find(vol => vol.name === name)?.id)
      .filter(Boolean)
      .map(String)
  }

  function formatVolunteerList(names){
    if(names.length === 0) return ''
    if(names.length === 1) return names[0]
    if(names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }

  function buildTaskWhatsAppRecipients(task){
    return resolveAssignedVolunteerIds(task).flatMap(id => {
      const volunteer = volunteers.find(v => String(v.id) === String(id))
      if(!volunteer) return []
      return [{
        task,
        whatsapp: volunteer.whatsapp || '',
        name: volunteer.name,
        volunteerId: id,
      }]
    })
  }

  async function handleSendWhatsApp(taskId){
    const task = tasks.find(t => t.id === taskId)
    if(!task){
      toast('Task not found','error')
      return
    }

    const childTasks = tasks.filter(t => t.parent_id === task.id)
    const recipients = [task, ...childTasks].flatMap(buildTaskWhatsAppRecipients)
    if(recipients.length === 0){
      toast('Select a volunteer with WhatsApp before sending','error')
      return
    }

    const validRecipients = recipients.filter(r => r.whatsapp)
    if(validRecipients.length === 0){
      toast('Assigned volunteer(s) do not have WhatsApp numbers','error')
      return
    }

    try{
      const { data: church, error } = await supabase.from('churches').select('*').limit(1).single()
      if(error || !church){
        toast('WhatsApp configuration unavailable','error')
        return
      }

      const sendResults = await Promise.allSettled(validRecipients.map(async recipient => {
        const message = buildTaskWhatsAppMessage(recipient.task, recipient)
        await sendWhatsAppMessage(church, { to: recipient.whatsapp, message })
        return recipient
      }))

      const successes = sendResults.filter(r => r.status === 'fulfilled').map(r => r.value)
      const failures = sendResults.filter(r => r.status === 'rejected')
      if(successes.length){
        toast(`WhatsApp sent to ${successes.map(r=>r.name).join(', ')}`,'success')
        const currentCount = Number(task.whatsapp_sent_count || 0)
        const newCount = currentCount + 1
        const sentAt = new Date().toISOString()
        await saveTask(taskId, { whatsapp_sent_count: newCount, whatsapp_sent_at: sentAt }, profile?.email)
        setTasks(prev => prev.map(t => t.id===taskId ? { ...t, whatsapp_sent_count: newCount, whatsapp_sent_at: sentAt } : t))

        const delay1 = getWhatsAppReminderDelay('followup-1')
        if(delay1 != null){
          scheduleDelayedWhatsAppNotification(taskId, successes, recipient => buildTaskWhatsAppFollowupMessage(recipient.task, recipient, 1), delay1, 'followup-1')
        }

        const delay2 = getWhatsAppReminderDelay('followup-2')
        if(delay2 != null){
          scheduleDelayedWhatsAppNotification(taskId, successes, recipient => buildTaskWhatsAppFollowupMessage(recipient.task, recipient, 2), delay2, 'followup-2')
        }
      }
      if(failures.length){
        const failureMessages = failures.map(r => {
          const reason = r.reason
          return reason?.message ? reason.message : String(reason)
        })
        console.error('[WhatsApp] send failures', failures)
        toast(`WhatsApp failed for ${failures.length} contact(s): ${failureMessages.join(' ; ')}`,'error')
      }
    }catch(err){
      console.error('WhatsApp send failed', err)
      const msg = String(err?.message || err || '')
      if(msg.toLowerCase().includes('relogin')){
        toast('WhatsApp account requires relogin in your Soft7 / WhatsApp gateway','error')
      } else if(msg.toLowerCase().includes('not connected') || msg.toLowerCase().includes('not ready')){
        toast('WhatsApp gateway is not connected. Please check the Soft7 session.','error')
      } else {
        toast(msg || 'WhatsApp send failed','error')
      }
    }
  }

  function buildTaskWhatsAppMessage(task, recipient){
    const eventDates = selEvent?.start_date
      ? selEvent.end_date && selEvent.end_date !== selEvent.start_date
        ? ` (${fmtDate(selEvent.start_date)} – ${fmtDate(selEvent.end_date)})`
        : ` (${fmtDate(selEvent.start_date)})`
      : selEvent?.year ? ` (${fmtDate(selEvent.year)})` : ''
    
    // Get co-assignees on this task
    const coAssigneeIds = resolveAssignedVolunteerIds(task)
    const coAssignees = coAssigneeIds
      .map(id => volunteers.find(v => String(v.id) === String(id)))
      .filter(Boolean)
      .filter(v => String(v.id) !== String(recipient.volunteerId))
      .map(v => v.name)
    
    // Get child subtasks and their assignees (for parent tasks only)
    const childTasks = task.parent_id ? [] : tasks.filter(t => t.parent_id === task.id)
    const childInfo = childTasks.length > 0 
      ? childTasks
          .flatMap(child => {
            const childAssigneeIds = resolveAssignedVolunteerIds(child)
            return childAssigneeIds
              .map(id => volunteers.find(v => String(v.id) === String(id)))
              .filter(Boolean)
              .map(v => `${v.name} for ${child.title.trim()}`)
          })
      : []
    
    // Get parent task info (for subtasks only)
    const parentTask = task.parent_id ? tasks.find(t => t.id === task.parent_id) : null
    const parentAssigneeIds = parentTask ? resolveAssignedVolunteerIds(parentTask) : []
    const parentInfo = parentTask && parentAssigneeIds.length > 0
      ? `${parentAssigneeIds
          .map(id => volunteers.find(v => String(v.id) === String(id)))
          .filter(Boolean)
          .map(v => v.name)
          .join(' and ')} for ${parentTask.title.trim()}`
      : ''
    
    let msg = `Dear ${recipient.name},\n\nYou have been assigned "${task.title.trim()}" for ${selEvent?.name || 'the event'}${eventDates}. Please prepare accordingly.`
    
    if(coAssignees.length > 0){
      msg += `\n\nYou and ${formatVolunteerList(coAssignees)} are working on this together.`
    }
    
    if(childInfo.length > 0){
      msg += `\n\nPlease coordinate with ${childInfo.join(', ')}.`
    }
    
    if(parentInfo){
      msg += `\n\nPlease coordinate with ${parentInfo}.`
    }
    
    msg += '\n\nThank you for your extended support.'
    return msg
  }

  function buildTaskWhatsAppFollowupMessage(task, recipient, followUpNumber){
    const eventDates = selEvent?.start_date
      ? selEvent.end_date && selEvent.end_date !== selEvent.start_date
        ? ` (${fmtDate(selEvent.start_date)} – ${fmtDate(selEvent.end_date)})`
        : ` (${fmtDate(selEvent.start_date)})`
      : selEvent?.year ? ` (${fmtDate(selEvent.year)})` : ''
    
    // Get co-assignees on this task
    const coAssigneeIds = resolveAssignedVolunteerIds(task)
    const coAssignees = coAssigneeIds
      .map(id => volunteers.find(v => String(v.id) === String(id)))
      .filter(Boolean)
      .filter(v => String(v.id) !== String(recipient.volunteerId))
      .map(v => v.name)
    
    // Get child subtasks and their assignees (for parent tasks only)
    const childTasks = task.parent_id ? [] : tasks.filter(t => t.parent_id === task.id)
    const childInfo = childTasks.length > 0 
      ? childTasks
          .flatMap(child => {
            const childAssigneeIds = resolveAssignedVolunteerIds(child)
            return childAssigneeIds
              .map(id => volunteers.find(v => String(v.id) === String(id)))
              .filter(Boolean)
              .map(v => `${v.name} for ${child.title.trim()}`)
          })
      : []
    
    // Get parent task info (for subtasks only)
    const parentTask = task.parent_id ? tasks.find(t => t.id === task.parent_id) : null
    const parentAssigneeIds = parentTask ? resolveAssignedVolunteerIds(parentTask) : []
    const parentInfo = parentTask && parentAssigneeIds.length > 0
      ? `${parentAssigneeIds
          .map(id => volunteers.find(v => String(v.id) === String(id)))
          .filter(Boolean)
          .map(v => v.name)
          .join(' and ')} for ${parentTask.title.trim()}`
      : ''
    
    let msg = `Dear ${recipient.name},\n\nReminder ${followUpNumber}: You are assigned "${task.title.trim()}" for ${selEvent?.name || 'the event'}${eventDates}. Please ensure you are ready.`
    
    if(coAssignees.length > 0){
      msg += `\n\nYou and ${formatVolunteerList(coAssignees)} are working on this together.`
    }
    
    if(childInfo.length > 0){
      msg += `\n\nPlease coordinate with ${childInfo.join(', ')}.`
    }
    
    if(parentInfo){
      msg += `\n\nPlease coordinate with ${parentInfo}.`
    }
    
    msg += '\n\nThank you for your extended support.'
    return msg
  }


  async function handleSaveLibraryTask(form){
    try{
      const payload={
        title:form.title.trim(),
        description:form.description||null,
        priority:form.priority||'medium',
        parent_id:form.parent_id||null,
        sort_order:form.sort_order!=null?form.sort_order:libraryTasks.filter(t=>!t.parent_id).length,
      }
      await saveLibraryTask(form.id||null,payload,profile?.email)
      toast(form.id?'Template updated':'Template added','success')
      setLibraryModal(null);await loadLibraryTasks()
    }catch{toast('Failed to save template','error')}
  }

  async function handleDeleteLibrary(task){
    setConfirmDlg({
      title:'Delete template?',
      message:`Delete library template "${task.title}"?`,
      onConfirm:async()=>{
        setConfirmBusy(true)
        try{await deleteLibraryItem(task.id);toast('Template deleted','success');await loadLibraryTasks();setConfirmDlg(null)}
        catch{toast('Failed to delete template','error')}
        finally{setConfirmBusy(false)}
      },
    })
  }

  // ── Library management (new) ────────────────────────────────
  async function handleAddLibraryCategory(){
    setLibrarySaving(true)
    try{
      const newId = await addLibraryCategory(profile?.email)
      await loadLibraryTasks()
      setLibraryRecentlyAddedId(newId)
      setTimeout(()=>setLibraryRecentlyAddedId(null),2200)
      toast('Task category added','success')
    }catch{
      toast('Failed to add task','error')
    }finally{
      setLibrarySaving(false)
    }
  }

  async function handleLibraryNameChange(id,field,value){
    setLibrarySaving(true)
    try{
      if(typeof id==='string' && id.startsWith('lib-cat-')){
        const oldCategory = id.slice('lib-cat-'.length)
        const newCategory = value.trim()
        if(!newCategory) throw new Error('Category name cannot be blank')
        const now = new Date().toISOString()
        const { error } = await supabase.from('task_library')
          .update({ category:newCategory, updated_by: profile?.email, updated_at: now })
          .eq('category', oldCategory)
        if(error) throw error
      } else {
        await updateLibraryItemName(id,field,value,profile?.email)
      }
      await loadLibraryTasks()
    }catch{
      toast('Failed to update','error')
    }finally{
      setLibrarySaving(false)
    }
  }

  async function handleAddLibrarySubtask(taskId){
    setLibrarySaving(true)
    try{
      await addLibrarySubtask(taskId,profile?.email)
      await loadLibraryTasks()
      toast('Subtask added','success')
    }catch{
      toast('Failed to add subtask','error')
    }finally{
      setLibrarySaving(false)
    }
  }

  async function handleDeleteLibraryItem(id){
    if(typeof id==='string' && id.startsWith('lib-cat-')){
      const category = id.slice('lib-cat-'.length)
      const count = libraryTasks.filter(t=>t.category===category).length
      setConfirmDlg({
        title:'Delete category?',
        message:`Delete category "${category}" and its ${count} item${count===1?'':'s'}?`,
        onConfirm:async()=>{
          setConfirmBusy(true)
          setLibrarySaving(true)
          try{
            const { error } = await supabase.from('task_library').delete().eq('category', category)
            if(error) throw error
            await loadLibraryTasks()
            toast('Item deleted','success')
            setConfirmDlg(null)
          }catch{
            toast('Failed to delete','error')
          }finally{
            setLibrarySaving(false)
            setConfirmBusy(false)
          }
        },
      })
      return
    }
    setLibrarySaving(true)
    try{
      await deleteLibraryItem(id,profile?.email)
      await loadLibraryTasks()
      toast('Item deleted','success')
    }catch{
      toast('Failed to delete','error')
    }finally{
      setLibrarySaving(false)
    }
  }

  async function handleDeleteTask(taskId){
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setConfirmDlg({
      title:'Delete task?',
      message:`Delete "${task.title}"?`,
      onConfirm:async()=>{
        setConfirmBusy(true)
        try{
          await deleteTask(taskId)
          setTasks(p=>p.filter(t=>t.id!==taskId))
          toast('Task deleted','success')
          setConfirmDlg(null)
        }catch(err){
          console.error('Failed to delete task:', err)
          toast('Failed to delete task','error')
        }finally{setConfirmBusy(false)}
      },
    })
  }

  async function handleMoveTask(taskId, direction){
    const task = tasks.find(t => t.id === taskId)
    if(!task) return
    const siblings = tasks
      .filter(t => task.parent_id != null
        ? t.parent_id === task.parent_id
        : t.parent_id == null && t.bucket_id === task.bucket_id)
      .slice()
      .sort((a,b)=> (a.sort_order||0)-(b.sort_order||0) || (new Date(a.created_at||0) - new Date(b.created_at||0)))

    const index = siblings.findIndex(t=>t.id===taskId)
    const target = index + direction
    if(index === -1 || target < 0 || target >= siblings.length) return

    const reordered = arrayMove(siblings, index, target)
    setTasks(p => p.map(t => {
      const nextIndex = reordered.findIndex(r=>r.id===t.id)
      return nextIndex === -1 ? t : { ...t, sort_order: nextIndex }
    }))

    try{
      await updateTaskOrder(reordered)
    }catch(err){
      console.error('Failed to move task:', err)
      await loadBoard(selEvent.id)
    }
  }

  async function handleAddSubtask(parentTaskId, subtaskTitle){
    try{
      console.log('EventPlanner: handleAddSubtask', { parentTaskId, subtaskTitle, selEventId: selEvent?.id })
      const payload={
        event_id: selEvent.id,
        parent_id: parentTaskId,
        title: subtaskTitle,
        bucket_id: null,
        status: 'pending',
        priority: 'medium',
        sort_order: 0,
      }
      await saveTask(null, payload, profile?.email)
      await loadBoard(selEvent.id)
      toast('Subtask added','success')
    }catch(err){
      console.error('Failed to add subtask:', err)
      toast('Failed to add subtask','error')
    }
  }

  async function handleUpdateTaskPosition(taskId, x, y){
    setTasks(p=>p.map(t=>t.id===taskId?{...t,pos_x:Math.round(x),pos_y:Math.round(y)}:t))
    try{ await saveTask(taskId,{pos_x:Math.round(x),pos_y:Math.round(y)},profile?.email) }
    catch(err){ console.debug('Position save failed (ignored):', err) }
  }

  function handleOpenTaskModal(bucketId){
    setTaskDefBkt(bucketId)
    setTaskModal({ ...BLANK_TASK, bucket_id: bucketId || '' })
  }

  function handleEditTask(task){
    setTaskDefBkt(task.bucket_id || null)
    setTaskModal(task)
  }

  function handleOpenAssignModal(task){
    setAssignModal(task)
  }

  async function handleSaveAssign(taskId, volunteerIds){
    try{
      const ids = Array.isArray(volunteerIds) ? volunteerIds : []
      
      // If no volunteers, unassign the task
      if(ids.length === 0){
        await saveTask(taskId, { assigned_to: null, assigned_volunteer_id: null, whatsapp_sent_count: 0 }, profile?.email)
        toast('Assignment removed','success')
        setAssignModal(null)
        await loadBoard(selEvent.id)
        return
      }

      const selected = volunteers.filter(v=>ids.includes(String(v.id)))
      const assigned_to = selected.map(v=>v.name).join(', ') || null
      const assigned_volunteer_id = ids.length===1 ? Number(ids[0]) : null
      await saveTask(taskId, { assigned_to, assigned_volunteer_id, whatsapp_sent_count: 0 }, profile?.email)
      toast('Assignment saved','success')


      setAssignModal(null)
      await loadBoard(selEvent.id)
    }catch(err){
      console.error('Failed to save assignment:', err)
      toast(err?.message || 'Failed to save assignment','error')
    }
  }

  // ── Carry forward ───────────────────────────────────────────

  async function handleCarryForward(sourceId,advanceDates){
    try{
      const r=await carryForward(sourceId,selEvent.id,advanceDates)
      toast(`Copied ${r.buckets} buckets · ${r.tasks} tasks`,'success')
      setCarryModal(false);await loadBoard(selEvent.id)
    }catch{toast('Copy failed','error')}
  }

  // ── Quick status toggle ─────────────────────────────────────

  async function handleStatusToggle(task){
    const next=STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status)+1)%STATUS_CYCLE.length]
    setTasks(p=>p.map(t=>t.id===task.id?{...t,status:next}:t))
    try{await saveTask(task.id,{...task,status:next},profile?.email)}
    catch{setTasks(p=>p.map(t=>t.id===task.id?{...t,status:task.status}:t));toast('Failed to update status','error')}
  }

  // ── Quick add task ──────────────────────────────────────────

  async function handleQuickAddTask(bucketId,title){
    try{
      await saveTask(null,{event_id:selEvent.id,bucket_id:bucketId,title,priority:'medium',status:'pending',sort_order:tasks.filter(t=>t.bucket_id===bucketId).length},profile?.email)
      await loadBoard(selEvent.id)
    }catch{toast('Failed to add task','error')}
  }

  // ── Move bucket ─────────────────────────────────────────────

  async function handleMoveBucket(id,dir){
    const idx=buckets.findIndex(b=>b.id===id)
    const ni=idx+dir
    if(ni<0||ni>=buckets.length)return
    const re=[...buckets];const [b]=re.splice(idx,1);re.splice(ni,0,b)
    setBuckets(re)
    try{await updateBucketOrder(re)}catch{toast('Failed to reorder','error')}
  }

  // ── Drag & Drop ─────────────────────────────────────────────

  function handleDragStart({active}){
    const isLibraryDrag = typeof active.id==='string' && active.id.startsWith('lib-')
    if(isLibraryDrag){
      setActiveTask(null)
      let libraryId = active.id
      if(libraryId.startsWith('lib-lib-cat-')) libraryId = libraryId.slice('lib-'.length)
      if(libraryId.startsWith('lib-cat-')){
        setActiveLibraryTask({ category: libraryId.slice('lib-cat-'.length), subcategory: '' })
      } else {
        setActiveLibraryTask(libraryTasks.find(t=>t.id===libraryId.slice(4))||null)
      }
      return
    }
    setActiveLibraryTask(null)
    setActiveTask(tasks.find(t=>t.id===active.id)||null)
  }

  async function handleDragEnd({active,over}){
    setActiveTask(null)
    setActiveLibraryTask(null)
    if(!over||active.id===over.id)return

    const isLibraryDrag = typeof active.id==='string' && active.id.startsWith('lib-')

    if(isLibraryDrag){
      // allow dropping library items onto buckets or the canvas
      let libraryId = active.id
      if(libraryId.startsWith('lib-lib-cat-')) libraryId = libraryId.slice('lib-'.length)
      // If dragging a category header -> create a new bucket
      if(libraryId.startsWith('lib-cat-')){
        const category = libraryId.slice('lib-cat-'.length)
        const dropTarget = String(over?.id || '')
        const onTask = tasks.some(t=>`task-${t.id}`===dropTarget)

        if(dropTarget === 'canvas-drop-zone' || onTask){
          try{
            await saveTask(null, {
              event_id: selEvent.id,
              parent_id: null,
              bucket_id: null,
              title: category,
              description: null,
              assigned_to: null,
              priority: 'medium',
              status: 'pending',
              sort_order: tasks.filter(t=>!t.bucket_id).length,
            }, profile?.email)
            await loadBoard(selEvent.id)
            await loadLibraryTasks()
            toast('Category added to canvas','success')
          }catch(err){
            console.error('Failed to create category on canvas:', err, err?.message, JSON.stringify(err))
            toast(err?.message || 'Failed to add category to canvas','error')
          }
          return
        }

        if(buckets.some(b=>String(b.id)===dropTarget)){
          try{
            await saveBucket(null, { name: category, color: BLANK_BUCKET.color, event_id: selEvent.id, sort_order: buckets.length }, profile?.email)
            await loadBoard(selEvent.id)
            await loadLibraryTasks()
            toast('Bucket added to event','success')
          }catch(err){
            console.error('Failed to create bucket from category:', err, err?.message, JSON.stringify(err))
            toast(err?.message || 'Failed to create bucket from category','error')
          }
        }
        return
      }

      // Subcategory drag -> create a task. If dropped on a bucket, attach to that bucket; if dropped on a category task, make it a subtask.
      const libraryTaskId = active.id.slice(4)
      try{
        const libTask = libraryTasks.find(t=>t.id===libraryTaskId)
        const dropTarget = String(over?.id || '')
        const targetBucketId = buckets.some(b=>String(b.id)===dropTarget) ? dropTarget : null
        const targetParentId = dropTarget.startsWith('task-')
          ? dropTarget.slice('task-'.length)
          : (tasks.some(t => String(t.id) === dropTarget) ? dropTarget : null)
        const newId = await cloneLibraryTaskToEvent(libraryTaskId, selEvent.id, targetBucketId, targetParentId, profile?.email, tasks)
        if(libTask?.subcategory) setLibCreatedTaskIds(ids=>[...ids, String(newId)])
        await loadBoard(selEvent.id)
        toast('Task added to event','success')
      }catch(err){
        console.error('Failed to copy task:', err)
        toast(err?.message || 'Failed to copy task from library','error')
      }
      return
    }

    const dropTarget = String(over?.id || '')
    const dragged = tasks.find(t => t.id === active.id)
    if(!dragged) return

    const taskParentMatch = dropTarget.startsWith('task-')
      ? dropTarget.slice('task-'.length)
      : (tasks.some(t => String(t.id) === dropTarget) ? dropTarget : null)

    if (dropTarget === 'canvas-drop-zone') {
      if (dragged.parent_id === null && dragged.bucket_id === null) return
      setTasks(p => p.map(t => t.id === dragged.id ? { ...t, parent_id: null, bucket_id: null } : t))
      saveTask(dragged.id, { parent_id: null, bucket_id: null }, profile?.email).catch(() => {})
      return
    }

    if (taskParentMatch != null) {
      if (dragged.id === taskParentMatch) return
      if (dragged.parent_id === taskParentMatch && dragged.bucket_id === null) return
      setTasks(p => p.map(t => t.id === dragged.id ? { ...t, parent_id: taskParentMatch, bucket_id: null } : t))
      saveTask(dragged.id, { parent_id: taskParentMatch, bucket_id: null }, profile?.email).catch(() => {})
      return
    }

    const targetBktId = buckets.some(b => String(b.id) === dropTarget) ? dropTarget : tasks.find(t => String(t.id) === dropTarget)?.bucket_id
    if(!targetBktId) return

    const overTask = tasks.find(t => String(t.id) === dropTarget)

    if (dragged.bucket_id === targetBktId) {
      const bkt = tasks.filter(t => t.bucket_id === targetBktId).sort((a,b) => a.sort_order - b.sort_order)
      const oi = bkt.findIndex(t => t.id === active.id)
      const ni = overTask ? bkt.findIndex(t => t.id === over.id) : bkt.length - 1
      if (oi === -1 || ni === -1 || oi === ni) return
      const re = arrayMove(bkt, oi, ni)
      setTasks(p => p.map(t => { const i = re.findIndex(r => r.id === t.id); return i >= 0 ? { ...t, sort_order: i } : t }))
      updateTaskOrder(re).catch(() => {})
    } else {
      setTasks(p => p.map(t => t.id === active.id ? { ...t, bucket_id: targetBktId } : t))
      moveTask(active.id, targetBktId).catch(() => {})
    }
  }

  // ── Derived ─────────────────────────────────────────────────

  const years=[...new Set(events.map(e=>e.year).filter(Boolean))].sort((a,b)=>b-a)
  const filteredEvents=yearFilter?events.filter(e=>e.year===yearFilter):events

  // Calendar filter
  const hasCalFilter=!!calFilter.type
  const calFilteredEvents=hasCalFilter?events.filter(e=>{
    if(calFilter.type&&e.event_type!==calFilter.type)return false
    return true
  }):events

  // Search results (events)
  const searchTrimmed=search.trim().toLowerCase()
  const searchResults=searchTrimmed.length>1?{
    events:events.filter(e=>e.name.toLowerCase().includes(searchTrimmed)).slice(0,6),
    tasks: [],
  }:null
  function bucketTasks(id){return tasks.filter(t=>t.bucket_id===id).sort((a,b)=>a.sort_order-b.sort_order)}

  // Board filtered tasks (applies filters before passing to columns)
  const boardTasks=tasks.filter(t=>{
    if(fStatus&&t.status!==fStatus)return false
    if(fPriority&&t.priority!==fPriority)return false
    if(fAssignee&&t.assigned_to!==fAssignee)return false
    return true
  })
  function boardBucketTasks(id){return boardTasks.filter(t=>t.bucket_id===id).sort((a,b)=>a.sort_order-b.sort_order)}
  const assignees=[...new Set(tasks.map(t=>t.assigned_to).filter(Boolean))].sort()
  const hasFilter=!!(fStatus||fPriority||fAssignee)

  const canvasCategoryTaskIds = boardTasks
    .filter(t => t.parent_id == null && boardTasks.some(child => child.parent_id === t.id))
    .map(t => t.id)
  const allCanvasCollapsed = canvasCategoryTaskIds.length > 0 && canvasCategoryTaskIds.every(id => collapsedCanvasCategories[id])
  const toggleAllCanvasCategories = () => setCollapsedCanvasCategories(prev => {
    const next = { ...prev }
    canvasCategoryTaskIds.forEach(id => { next[id] = !allCanvasCollapsed })
    return next
  })

  const todayStr=toDateStr(new Date())

  // ── Shared top bar ───────────────────────────────────────────

  function TopBar(){
    const VIEWS=[
      {key:'year',  icon:<Calendar size={13}/>,    label:'Year'  },
      {key:'month', icon:<CalendarDays size={13}/>, label:'Month' },
      {key:'week',  icon:<List size={13}/>,         label:'Week'  },
      {key:'agenda',icon:<SlidersHorizontal size={13}/>,label:'Agenda'},
      {key:'cards', icon:<Grid3X3 size={13}/>,      label:'Cards' },
    ]
    const selSt={fontSize:12,padding:'4px 7px',borderRadius:6,border:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',color:'var(--text-2)',cursor:'pointer',outline:'none'}
    const isCalView=view==='month'||view==='week'||view==='year'
    return(
      <div style={{display:'flex',flexDirection:'column',borderBottom:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',flexShrink:0}}>
        <PageHeader
          icon={Calendar}
          title="Event Planner"
          subtitle={view==='year'?undefined:(
            view==='month'?`${MONTH_NAMES[calMonth.getMonth()]} ${calMonth.getFullYear()}`:view==='week'?'Week View':view==='agenda'?'Agenda':view==='cards'?'All Events':view
          )}
          style={{borderBottom:'none',marginBottom:0,padding:'13px 24px',flexWrap:'wrap',gap:10}}
        >
          {/* Search */}
          <div style={{position:'relative',display:'flex',alignItems:'center',gap:4}}>
            {showSearch&&(
              <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>e.key==='Escape'&&(setShowSearch(false),setSearch(''))}
                placeholder="Search events & tasks…"
                style={{...iSt,width:220,fontSize:13,padding:'6px 10px'}}/>
            )}
            <button onClick={()=>{setShowSearch(s=>!s);setSearch('')}}
              style={{...btnS,display:'flex',alignItems:'center',gap:4,padding:'6px 10px',background:showSearch?'var(--input-bg,#f1f5f9)':'transparent'}}>
              <Search size={14}/>{!showSearch&&<span style={{fontSize:12}}>Search</span>}
            </button>
          </div>
          {/* View tabs */}
          <div style={{display:'flex',background:'var(--input-bg,#f1f5f9)',borderRadius:8,padding:2,gap:1}}>
            {VIEWS.map(v=>(
              <button key={v.key} onClick={()=>{setView(v.key);setSelRange(null);setTooltip(null);setShowSearch(false);setSearch('')}}
                style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:view===v.key?'var(--card-bg,#fff)':'transparent',color:view===v.key?'var(--text-1)':'var(--text-3)',boxShadow:view===v.key?'0 1px 3px rgba(0,0,0,0.1)':'none',transition:'all 0.12s'}}>
                {v.icon}{v.label}
              </button>
            ))}
          </div>
          
          <button onClick={exportAllEvents} disabled={exportingAll || events.length===0}
            style={{...btnP,display:'flex',alignItems:'center',gap:6,background:'#16a34a',opacity:(exportingAll || events.length===0)?0.6:1,padding:'6px 14px',fontSize:12.5}}>
            <FileSpreadsheet size={15}/>{exportingAll ? 'Exporting…' : 'Export All'}
          </button>
          <button onClick={()=>navigate('/events/settings')} title="Event Settings"
            style={{...btnS,display:'flex',alignItems:'center',padding:'7px 10px'}}>
            <Settings size={15}/>
          </button>
          <button style={{...btnP,display:'flex',alignItems:'center',gap:6,fontSize:13,padding:'7px 14px'}} onClick={()=>setEventModal({})}>
            <Plus size={14}/> New Event
          </button>
        </PageHeader>
        {/* Calendar filter row */}
        {isCalView&&(
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 24px',borderTop:'1px solid var(--card-border,#e2e8f0)',background:'var(--page-bg,#f8fafc)',flexWrap:'wrap'}}>
            <Filter size={12} color={hasCalFilter?'var(--accent,#2563eb)':'var(--text-3)'}/>
            <span style={{fontSize:11,fontWeight:600,color:hasCalFilter?'var(--accent,#2563eb)':'var(--text-3)'}}>Filter:</span>
            <select value={calFilter.type} onChange={e=>setCalFilter(f=>({...f,type:e.target.value}))} style={selSt}>
              <option value="">All Types</option>
              {EVENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {hasCalFilter&&<button onClick={()=>setCalFilter({type:''})} style={{display:'flex',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text-3)',padding:'2px 4px'}}><X size={11}/>Clear</button>}
            {hasCalFilter&&<span style={{fontSize:11,color:'var(--accent,#2563eb)',fontWeight:600}}>{calFilteredEvents.length}/{events.length} events shown</span>}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Year ─────────────────────────────────────────────

  function renderYear(){
    return(
      <div style={{padding:'0 24px 24px'}}>
        {/* Year nav */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <button onClick={()=>setCalYear(y=>y-1)} style={{...btnS,padding:'5px 9px',display:'flex',alignItems:'center'}}><ChevronLeft size={15}/></button>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:'var(--text-1)',minWidth:80,textAlign:'center'}}>{calYear}</h2>
          <button onClick={()=>setCalYear(y=>y+1)} style={{...btnS,padding:'5px 9px',display:'flex',alignItems:'center'}}><ChevronRight size={15}/></button>
          <button onClick={()=>setCalYear(new Date().getFullYear())} style={{...btnS,fontSize:12,padding:'5px 12px'}}>This Year</button>
        </div>

        {/* 4×3 grid of mini months */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:14}}>
          {Array.from({length:12},(_,i)=>(
            <MiniMonth
              key={i}
              year={calYear}
              month={i}
              events={calFilteredEvents}
              
              selRange={selRange}
              onDayMouseDown={ds=>{calDragRef.current={active:true,start:ds,end:ds};setSelRange({start:ds,end:ds})}}
              onDayMouseEnter={(ds,x,y)=>{if(calDragRef.current.active){const s=calDragRef.current.start;calDragRef.current.end=ds;setSelRange({start:s<=ds?s:ds,end:s<=ds?ds:s})}}}
              onDayMouseUp={(ds,x,y)=>{if(calDragRef.current.start===calDragRef.current.end)handleDayClick(ds,x,y)}}
              onDayContextMenu={(e,ds)=>handleDayContextMenu(e,ds)}
              onMonthClick={()=>{setCalMonth(new Date(calYear,i,1));setView('month');setCalFilter({type:''});}}
              onEventClick={openBoard}
              ws={ws}
            />
          ))}
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:14,marginTop:14,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text-3)',fontWeight:600}}>Legend:</span>
          <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:8,height:8,borderRadius:'50%',background:'#3b82f6'}}/><span style={{fontSize:11,color:'var(--text-3)'}}>Annual</span></div>
          <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:8,height:8,borderRadius:'50%',background:'#8b5cf6'}}/><span style={{fontSize:11,color:'var(--text-3)'}}>Monthly</span></div>
          <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:8,height:8,borderRadius:'50%',background:'#64748b'}}/><span style={{fontSize:11,color:'var(--text-3)'}}>One-time</span></div>
          
        </div>
      </div>
    )
  }

  // ── Render: Month ────────────────────────────────────────────

  function renderMonth(){
    const days=getMonthGrid(calMonth,ws), curMon=calMonth.getMonth()
    const upcoming=[...events]
      .filter(e=>{const en=e.end_date||e.start_date||(e.year?`${e.year}-12-31`:null);return en&&en>=todayStr})
      .sort((a,b)=>(a.start_date||`${a.year||9999}-01-01`).localeCompare(b.start_date||`${b.year||9999}-01-01`))
    const monthGroups={}
    upcoming.forEach(e=>{
      const d=e.start_date?new Date(e.start_date+'T00:00:00'):new Date(parseInt(e.year||2099),0,1)
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if(!monthGroups[key])monthGroups[key]={label:`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,events:[]}
      monthGroups[key].events.push(e)
    })

    return(
      <div style={{display:'flex',gap:18,padding:'0 24px 24px',alignItems:'flex-start'}}>
        {/* Calendar */}
        <div style={{flex:'1 1 0',minWidth:0}}>
          {/* Nav */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <button onClick={prevMonth} style={{...btnS,padding:'4px 8px',display:'flex',alignItems:'center'}}><ChevronLeft size={14}/></button>
            <h2 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--text-1)',flex:1,textAlign:'center'}}>{MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}</h2>
            <button onClick={nextMonth} style={{...btnS,padding:'4px 8px',display:'flex',alignItems:'center'}}><ChevronRight size={14}/></button>
            <button onClick={goToday} style={{...btnS,fontSize:12,padding:'4px 11px'}}>Today</button>
          </div>

          {/* Grid */}
          <div style={{border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,overflow:'hidden',background:'var(--card-bg,#fff)'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--card-border,#e2e8f0)'}}>
              {getDayAbbrs(ws).map((d,i)=>{
                const isStartHdr=i===0
                return <div key={i} style={{textAlign:'center',padding:'7px 2px',fontSize:10,fontWeight:700,color:isStartHdr?'#ef4444':'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{d}</div>
              })}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
              {days.map(day=>{
                const ds=toDateStr(day),isToday=ds===todayStr,isCurMon=day.getMonth()===curMon
                const isStartDay=day.getDay()===ws
                const dayEvts=eventsOnDay(ds,calFilteredEvents)
                const inSel=!!(selRange&&isCurMon&&ds>=selRange.start&&ds<=selRange.end)
                return(
                  <div key={ds}
                    onMouseDown={e=>{if(!isCurMon||e.button!==0)return;e.preventDefault();calDragRef.current={active:true,start:ds,end:ds};setSelRange({start:ds,end:ds})}}
                    onMouseEnter={e=>{if(calDragRef.current.active&&isCurMon){const s=calDragRef.current.start;calDragRef.current.end=ds;setSelRange({start:s<=ds?s:ds,end:s<=ds?ds:s})}}}
                    onMouseUp={e=>{if(e.button!==0||!isCurMon)return;if(calDragRef.current.start===calDragRef.current.end)handleDayClick(ds,e.clientX,e.clientY)}}
                    onContextMenu={e=>{if(isCurMon)handleDayContextMenu(e,ds)}}
                    style={{minHeight:78,padding:'4px 4px 3px',borderRight:'1px solid var(--card-border,#e2e8f0)',borderBottom:'1px solid var(--card-border,#e2e8f0)',background:inSel?'rgba(37,99,235,0.11)':isToday?'rgba(37,99,235,0.04)':isStartDay&&isCurMon?'rgba(239,68,68,0.03)':'var(--card-bg,#fff)',opacity:isCurMon?1:0.3,boxSizing:'border-box',cursor:isCurMon?'pointer':'default',userSelect:'none',transition:'background 0.05s'}}>
                    <div style={{marginBottom:3}}>
                      <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:isToday?'var(--accent,#2563eb)':'transparent',color:isToday?'#fff':isStartDay?'#ef4444':'var(--text-1)',fontSize:11,fontWeight:isToday||isStartDay?700:400}}>{day.getDate()}</span>
                    </div>
                    {dayEvts.slice(0,2).map(e=>{
                      const ec=eventColor(e),isStart=e.start_date===ds
                      return(
                        <div key={e.id}
                          onMouseDown={ev=>ev.stopPropagation()}
                          onContextMenu={ev=>{ev.stopPropagation();ev.preventDefault()}}
                          onClick={ev=>{ev.stopPropagation();openBoard(e)}} title={e.name}
                          style={{fontSize:10,fontWeight:600,padding:'1px 5px',marginBottom:2,borderRadius:3,cursor:'pointer',background:ec.bg,color:ec.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',borderLeft:isStart?`2px solid ${ec.dot}`:'none',opacity:isStart?1:0.65,userSelect:'none',textDecoration:e.status==='cancelled'?'line-through':'none'}}>
                          {isStart?e.name:`↳ ${e.name}`}
                        </div>
                      )
                    })}
                    {dayEvts.length>2&&<div style={{fontSize:9,color:'var(--text-3)',fontWeight:600}}>+{dayEvts.length-2} more</div>}
                    
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{display:'flex',gap:12,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
            {EVENT_TYPES.map(t=>{const ec=eventColor({event_type:t.value});return(
              <div key={t.value} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:10,height:10,borderRadius:2,background:ec.bg,border:`1.5px solid ${ec.dot}`}}/><span style={{fontSize:11,color:'var(--text-3)'}}>{t.label}</span></div>
            )})}
            
            <span style={{fontSize:11,color:'var(--text-3)',fontStyle:'italic'}}>Click or drag dates to add event · Hover for details</span>
          </div>
        </div>

        {/* Upcoming panel */}
        <div style={{width:248,flexShrink:0}}>
          <h3 style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:'var(--text-1)',display:'flex',alignItems:'center',gap:6}}>
            <CalendarDays size={14} color="var(--accent,#2563eb)"/> Upcoming Events
          </h3>
          {Object.keys(monthGroups).length===0?(
            <div style={{textAlign:'center',padding:'24px 12px',color:'var(--text-3)',background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10}}>
              <Calendar size={26} style={{opacity:0.2,marginBottom:8}}/><p style={{margin:0,fontSize:13}}>No upcoming events</p>
            </div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {Object.entries(monthGroups).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,group])=>(
                <div key={key}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:10,fontWeight:800,color:'var(--accent,#2563eb)',textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{group.label}</span>
                    <div style={{flex:1,height:1,background:'var(--card-border,#e2e8f0)'}}/>
                  </div>
                  {group.events.map(e=>{
                    const ec=eventColor(e),d=e.start_date?new Date(e.start_date+'T00:00:00'):null
                    const end=e.end_date?new Date(e.end_date+'T00:00:00'):null
                    return(
                      <div key={e.id} onClick={()=>openBoard(e)}
                        style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,marginBottom:4,cursor:'pointer',border:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)',borderLeft:`3px solid ${ec.dot}`}}
                        onMouseEnter={ev=>ev.currentTarget.style.background='var(--input-bg,#f8fafc)'}
                        onMouseLeave={ev=>ev.currentTarget.style.background='var(--card-bg,#fff)'}>
                        <div style={{width:34,flexShrink:0,textAlign:'center',background:ec.bg,borderRadius:6,padding:'3px 0'}}>
                          <div style={{fontSize:16,fontWeight:800,lineHeight:1,color:ec.text}}>{d?d.getDate():'—'}</div>
                          <div style={{fontSize:9,fontWeight:700,color:ec.text,textTransform:'uppercase',letterSpacing:'0.04em'}}>{d?d.toLocaleString('default',{month:'short'}):''}</div>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</div>
                          <div style={{fontSize:10,color:'var(--text-3)',marginTop:1}}>
                            {end&&d&&end.getTime()!==d.getTime()?`${fmtDate(e.start_date)} – ${fmtDate(e.end_date)}`:fmtDate(e.start_date)||String(e.year||'')}
                          </div>
                        </div>
                        {e.start_date&&(
                          <button title="Go to date on calendar"
                            onClick={ev=>{ev.stopPropagation();setCalMonth(new Date(e.start_date+'T00:00:00'))}}
                            style={{background:'none',border:'none',cursor:'pointer',padding:3,display:'flex',alignItems:'center',opacity:0.5,flexShrink:0}}
                            onMouseEnter={ev=>ev.currentTarget.style.opacity=1}
                            onMouseLeave={ev=>ev.currentTarget.style.opacity=0.5}>
                            <CalendarDays size={12} color="var(--accent,#2563eb)"/>
                          </button>
                        )}
                        <ChevronRight size={12} color="var(--text-3)"/>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Render: Week ─────────────────────────────────────────────

  function renderWeek(){
    const days=getWeekDays(calWeek)
    const wsStr=toDateStr(days[0]), we=toDateStr(days[6])
    const weekNo = getWeekNumber(calWeek, ws)
    return(
      <div style={{padding:'0 24px 24px'}}>
        {/* Nav */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
          <button onClick={prevWeek} style={{...btnS,padding:'4px 8px',display:'flex',alignItems:'center'}}><ChevronLeft size={14}/></button>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text-3)',marginBottom:2}}>Week {weekNo} · {calWeek.getFullYear()}</div>
            <h2 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--text-1)'}}>
              {fmtDate(wsStr)} – {fmtDate(we)}
            </h2>
          </div>
          <button onClick={nextWeek} style={{...btnS,padding:'4px 8px',display:'flex',alignItems:'center'}}><ChevronRight size={14}/></button>
          <button onClick={goThisWeek} style={{...btnS,fontSize:12,padding:'4px 11px'}}>This Week</button>
        </div>

        {/* Week grid */}
        <div style={{border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,overflow:'hidden',background:'var(--card-bg,#fff)'}}>
          {/* Day headers */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'2px solid var(--card-border,#e2e8f0)'}}>
            {days.map(day=>{
              const ds=toDateStr(day),isToday=ds===todayStr
              const isStartDay=day.getDay()===ws
              const dow=['SUN','MON','TUE','WED','THU','FRI','SAT'][day.getDay()]
              const inSel=!!(selRange&&ds>=selRange.start&&ds<=selRange.end)
              return(
                <div key={ds}
                  onMouseDown={e=>{if(e.button!==0)return;e.preventDefault();calDragRef.current={active:true,start:ds,end:ds};setSelRange({start:ds,end:ds})}}
                  onMouseEnter={e=>{if(calDragRef.current.active){const s=calDragRef.current.start;calDragRef.current.end=ds;setSelRange({start:s<=ds?s:ds,end:s<=ds?ds:s})}}}
                  onMouseUp={e=>{if(e.button!==0)return;if(calDragRef.current.start===calDragRef.current.end)handleDayClick(ds,e.clientX,e.clientY)}}
                  onContextMenu={e=>handleDayContextMenu(e,ds)}
                  style={{textAlign:'center',padding:'10px 6px',cursor:'pointer',background:inSel?'rgba(37,99,235,0.1)':isToday?'rgba(37,99,235,0.06)':isStartDay?'rgba(239,68,68,0.04)':'transparent',borderRight:'1px solid var(--card-border,#e2e8f0)',userSelect:'none',transition:'background 0.05s'}}>
                  <div style={{fontSize:10,fontWeight:700,color:isStartDay?'#ef4444':'var(--text-3)',letterSpacing:'0.05em',marginBottom:3}}>{dow}</div>
                  <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:'50%',background:isToday?'var(--accent,#2563eb)':'transparent',color:isToday?'#fff':isStartDay?'#ef4444':'var(--text-1)',fontSize:17,fontWeight:isToday||isStartDay?700:400}}>{day.getDate()}</div>
                </div>
              )
            })}
          </div>

          {/* Day content */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',minHeight:220,alignItems:'start'}}>
            {days.map(day=>{
              const ds=toDateStr(day),isToday=ds===todayStr
              const dayEvts=eventsOnDay(ds,calFilteredEvents)
              const inSel=!!(selRange&&ds>=selRange.start&&ds<=selRange.end)
              return(
                <div key={ds}
                  onMouseDown={e=>{if(e.button!==0)return;e.preventDefault();calDragRef.current={active:true,start:ds,end:ds};setSelRange({start:ds,end:ds})}}
                  onMouseEnter={e=>{if(calDragRef.current.active){const s=calDragRef.current.start;calDragRef.current.end=ds;setSelRange({start:s<=ds?s:ds,end:s<=ds?ds:s})}}}
                  onMouseUp={e=>{if(e.button!==0)return;if(calDragRef.current.start===calDragRef.current.end)handleDayClick(ds,e.clientX,e.clientY)}}
                  onContextMenu={e=>handleDayContextMenu(e,ds)}
                  style={{borderRight:'1px solid var(--card-border,#e2e8f0)',padding:'8px 6px',minHeight:180,background:inSel?'rgba(37,99,235,0.07)':isToday?'rgba(37,99,235,0.02)':'transparent',cursor:'pointer',userSelect:'none',transition:'background 0.05s'}}>
                  {dayEvts.map(e=>{
                    const ec=eventColor(e),isStart=e.start_date===ds
                    return(
                      <div key={e.id}
                        onMouseDown={ev=>ev.stopPropagation()}
                        onClick={ev=>{ev.stopPropagation();openBoard(e)}} title={e.name}
                        style={{fontSize:11,fontWeight:600,padding:'3px 7px',marginBottom:4,borderRadius:5,cursor:'pointer',background:ec.bg,color:ec.text,borderLeft:isStart?`2px solid ${ec.dot}`:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:e.status==='cancelled'?'line-through':'none',userSelect:'none'}}>
                        {isStart?e.name:`↳ ${e.name}`}
                        {e.status!=='planning'&&<span style={{marginLeft:5,fontSize:9,opacity:0.7}}>{evtStatusStyle(e.status).label}</span>}
                      </div>
                    )
                  })}
                  
                  {dayEvts.length===0&&(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:50,color:'var(--text-3)',opacity:0.4}}>
                      <Plus size={14}/>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p style={{fontSize:11,color:'var(--text-3)',marginTop:8,fontStyle:'italic'}}>Click or drag across days to add event · Hover for details</p>
      </div>
    )
  }

  // ── Render: Agenda ───────────────────────────────────────────

  function renderAgenda(){
    const sorted=[...events].sort((a,b)=>(a.start_date||`${a.year||9999}-01-01`).localeCompare(b.start_date||`${b.year||9999}-01-01`))
    const byYear={}
    sorted.forEach(e=>{
      const yr=e.year||(e.start_date?e.start_date.slice(0,4):'Other')
      if(!byYear[yr])byYear[yr]=[]
      byYear[yr].push(e)
    })

    

    if(sorted.length===0)return(
      <div style={{padding:'0 24px 24px',textAlign:'center',paddingTop:64,color:'var(--text-3)'}}>
        <Calendar size={48} style={{opacity:0.18,marginBottom:14}}/><p style={{fontSize:15,fontWeight:500}}>No events yet</p>
      </div>
    )
    return(
      <div style={{padding:'0 24px 24px'}}>
        
        {Object.keys(byYear).sort((a,b)=>b-a).map(yr=>(
          <div key={yr} style={{marginBottom:26}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{yr}</span>
              <div style={{flex:1,height:1,background:'var(--card-border,#e2e8f0)'}}/>
            </div>
            {byYear[yr].map(e=>{
              const ec=eventColor(e),es=evtStatusStyle(e.status)
              const d=e.start_date?new Date(e.start_date+'T00:00:00'):null
              const isPast=e.start_date?e.start_date<todayStr:false
              const dr=e.start_date?(e.end_date&&e.end_date!==e.start_date?`${fmtDate(e.start_date)} – ${fmtDate(e.end_date)}`:fmtDate(e.start_date)):'—'
              return(
                <div key={e.id} onClick={()=>openBoard(e)} style={{display:'flex',alignItems:'center',gap:0,border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,marginBottom:7,cursor:'pointer',overflow:'hidden',opacity:isPast?0.65:1,background:'var(--card-bg,#fff)'}}
                  onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.07)'}
                  onMouseLeave={ev=>ev.currentTarget.style.boxShadow='none'}>
                  <div style={{width:56,flexShrink:0,textAlign:'center',padding:'12px 6px',borderRight:'1px solid var(--card-border,#e2e8f0)',background:ec.bg}}>
                    <div style={{fontSize:20,fontWeight:800,color:ec.text,lineHeight:1}}>{d?d.getDate():'—'}</div>
                    <div style={{fontSize:9,fontWeight:700,color:ec.text,marginTop:2,textTransform:'uppercase'}}>{d?d.toLocaleString('default',{month:'short'}):''}</div>
                  </div>
                  <div style={{flex:1,padding:'10px 14px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>
                      <span style={{fontSize:14,fontWeight:700,color:'var(--text-1)',textDecoration:e.status==='cancelled'?'line-through':'none'}}>{e.name}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:ec.bg,color:ec.text,textTransform:'uppercase'}}>{e.event_type}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:es.bg,color:es.text,textTransform:'uppercase'}}>{es.label}</span>
                    </div>
                    <div style={{fontSize:12,color:'var(--text-3)',display:'flex',alignItems:'center',gap:5}}><CalendarDays size={11}/>{dr}</div>
                  </div>
                  <ChevronRight size={15} color="var(--text-3)" style={{marginRight:14,flexShrink:0}}/>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Render: Cards ────────────────────────────────────────────

  function renderCards(){
    const allYearKeys = filteredEvents.length > 0
      ? [...new Set(filteredEvents.map(e => e.year || 'Unscheduled'))]
      : []
    const yearGroups = allYearKeys.sort((a,b)=>{
      if (a === 'Unscheduled') return 1
      if (b === 'Unscheduled') return -1
      const diff = Number(a) - Number(b)
      return yearSortAsc ? diff : -diff
    })
    const eventsByYear = filteredEvents.reduce((map, event) => {
      const yearKey = event.year || 'Unscheduled'
      if (!map[yearKey]) map[yearKey] = []
      map[yearKey].push(event)
      return map
    }, {})
    const showYearSections = !yearFilter && yearGroups.length > 1

    return(
      <div style={{padding:'0 24px 24px'}}>
        {years.length>0&&(
          <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
            {[null,...years].map(y=>(
              <button key={y??'all'} onClick={()=>setYearFilter(y)} style={{padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:600,cursor:'pointer',border:yearFilter===y?'2px solid var(--accent,#2563eb)':'1px solid var(--card-border,#e2e8f0)',background:yearFilter===y?'var(--accent,#2563eb)':'transparent',color:yearFilter===y?'#fff':'var(--text-2)'}}>
                {y??'All'}
              </button>
            ))}
            {!yearFilter && (
              <button onClick={()=>setYearSortAsc(prev => !prev)} style={{padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid var(--card-border,#e2e8f0)',background:'var(--input-bg,#f8fafc)',color:'var(--text-2)'}}>
                Sort {yearSortAsc ? 'Ascending' : 'Descending'}
              </button>
            )}
            {filteredEvents.length > 0 && (
              <button onClick={exportFilteredCards} disabled={exportingFilteredCards} style={{padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid var(--card-border,#e2e8f0)',background:exportingFilteredCards?'var(--card-border,#e2e8f0)':'var(--accent,#2563eb)',color:'#fff'}}>
                {exportingFilteredCards ? 'Exporting…' : `Download ${filteredEvents.length === 1 ? 'event' : 'events'}`}
              </button>
            )}
          </div>
        )}
        {loading?<p style={{color:'var(--text-3)',fontSize:14}}>Loading…</p>
        :filteredEvents.length===0?(
          <div style={{textAlign:'center',padding:'64px 32px',color:'var(--text-3)'}}>
            <Calendar size={48} style={{opacity:0.18,marginBottom:14}}/><p style={{fontSize:15,fontWeight:500}}>No events</p>
          </div>
        ):(
          showYearSections ? (
            <div style={{display:'flex',flexDirection:'column',gap:26}}>
              {yearGroups.map(year => (
                <div key={year}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:14,flexWrap:'wrap'}}>
                    <h3 style={{margin:0,fontSize:18,fontWeight:700,color:'var(--text-1)'}}>{year === 'Unscheduled' ? 'Unscheduled' : year}</h3>
                    <span style={{fontSize:12,color:'var(--text-3)',fontWeight:600}}>{eventsByYear[year].length} {eventsByYear[year].length === 1 ? 'event' : 'events'}</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:12}}>
                    {eventsByYear[year].map(e=>(
                      <EventCard key={e.id} event={e} onClick={openBoard} onExport={exportEvent} onEdit={ev=>setEventModal(ev)} onDelete={handleDeleteEvent} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:14}}>
              {filteredEvents.map(e=><EventCard key={e.id} event={e} onClick={openBoard} onExport={exportEvent} onEdit={ev=>setEventModal(ev)} onDelete={handleDeleteEvent}/>)}
            </div>
          )
        )}
      </div>
    )
  }

  // ── Board view ───────────────────────────────────────────────

  if(view==='board'){
    const total=tasks.length, done=tasks.filter(t=>t.status==='done').length
    const pct=total>0?Math.round((done/total)*100):0
    const ec=eventColor(selEvent)

    return(
      <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 88px)',overflow:'hidden'}}>
        {/* Board header */}
        <div style={{display:'flex',flexDirection:'column',gap:6,padding:'11px 22px',flexShrink:0,borderBottom:'1px solid var(--card-border,#e2e8f0)',background:'var(--card-bg,#fff)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={backFromBoard} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,color:'var(--accent,#2563eb)',fontWeight:600,fontSize:13,padding:'4px 6px 4px 0',flexShrink:0}}>
              <ChevronLeft size={16}/> Event Planner
            </button>
            <div style={{width:1,height:18,background:'var(--card-border,#e2e8f0)',flexShrink:0}}/>
            <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:12,background:'var(--input-bg,#f8fafc)',padding:'10px 12px',borderRadius:12,flex:1,minWidth:0}}>
                {ec.dot&&<div style={{width:10,height:10,borderRadius:'50%',background:ec.dot,flexShrink:0}}/>}
                <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
                  <h2 style={{margin:0,fontSize:16,fontWeight:800,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selEvent?.name}</h2>
                  <span style={{fontSize:10,fontWeight:700,padding:'4px 8px',borderRadius:20,background:ec.bg,color:ec.text,textTransform:'uppercase',flexShrink:0}}>{selEvent?.event_type}</span>
                  <span style={{fontSize:12,color:'var(--text-3)',flexShrink:0}}>{selEvent?.start_date?`${fmtDate(selEvent.start_date)}${selEvent.end_date&&selEvent.end_date!==selEvent.start_date?` – ${fmtDate(selEvent.end_date)}`:''}`:''}</span>
                </div>
              </div>
            </div>
            {total>0&&(
              <div onClick={()=>setSummaryModal(true)} title="View completion summary" style={{display:'flex',alignItems:'center',gap:7,flexShrink:0,cursor:'pointer',borderRadius:6,padding:'2px 4px'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--input-bg,#f1f5f9)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{width:64,height:5,borderRadius:10,background:'var(--input-bg,#f1f5f9)',overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pct}%`,background:pct===100?'#22c55e':'var(--accent,#2563eb)',borderRadius:10}}/>
                </div>
                <span style={{fontSize:11,color:'var(--text-3)',whiteSpace:'nowrap'}}>{done}/{total}</span>
                <BarChart2 size={12} color="var(--text-3)"/>
              </div>
            )}
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <button onClick={toggleAllCanvasCategories} disabled={canvasCategoryTaskIds.length===0} title={allCanvasCollapsed ? 'Expand all categories' : 'Collapse all categories'} style={{...btnS,display:'flex',alignItems:'center',gap:4,fontSize:12,padding:'5px 10px'}}>
                {allCanvasCollapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>} {allCanvasCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
              <button onClick={exportCurrentEvent} disabled={!selEvent || exportingEventId===selEvent?.id}
                style={{...btnS,display:'flex',alignItems:'center',gap:4,fontSize:12,padding:'5px 10px',background:'#16a34a',color:'#fff',border:'none',opacity:(!selEvent || exportingEventId===selEvent?.id)?0.6:1}}>
                <FileSpreadsheet size={12}/>{exportingEventId===selEvent?.id ? 'Exporting…' : 'Export'}
              </button>
              <button onClick={()=>setEventModal(selEvent)} style={{...btnS,display:'flex',alignItems:'center',gap:4,fontSize:12,padding:'5px 10px'}}><Pencil size={12}/>Edit</button>
              <button onClick={()=>setCarryModal(true)} style={{...btnS,display:'flex',alignItems:'center',gap:4,fontSize:12,padding:'5px 10px'}}><Copy size={12}/>Copy from…</button>
            </div>
          </div>
        </div>

        {/* Filter removed as requested */}

        {/* Kanban */}
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{display:'flex',flex:1,overflow:'hidden',gap:16}}>
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',gap:16,minWidth:0}}>
              <CanvasDropZone
                tasks={boardTasks.filter(t=>!t.bucket_id)}
                onDeleteTask={handleDeleteTask}
                onAddSubtask={handleAddSubtask}
                onAssignTask={handleOpenAssignModal}
                onSendWhatsApp={handleSendWhatsApp}
                onToggleCategory={id => setCollapsedCanvasCategories(prev => ({ ...prev, [id]: !prev[id] }))}
                collapsedCategories={collapsedCanvasCategories}
                libCreatedTaskIds={libCreatedTaskIds}
                onMoveTaskUp={id=>handleMoveTask(id,-1)}
                onMoveTaskDown={id=>handleMoveTask(id,1)}
              />
              {buckets.length>0 && (
                  <div style={{display:'flex',flexDirection:'column',gap:16,overflowY:'auto',paddingBottom:12}}>
                    {buckets.map(bucket=>(
                    <BucketColumn
                      key={bucket.id}
                      bucket={bucket}
                      tasks={boardBucketTasks(bucket.id)}
                      onAddTask={handleOpenTaskModal}
                      onEditBucket={setBucketModal}
                      onDeleteBucket={handleDeleteBucket}
                      onEditTask={handleEditTask}
                      onAssignTask={handleOpenAssignModal}
                      onDeleteTask={handleDeleteTask}
                      onStatusChange={handleStatusToggle}
                      onMoveUp={taskId=>handleMoveTask(taskId,-1)}
                      onMoveDown={taskId=>handleMoveTask(taskId,1)}
                      onMoveLeft={buckets.findIndex(b=>b.id===bucket.id)>0?()=>handleMoveBucket(bucket.id,-1):null}
                      onMoveRight={buckets.findIndex(b=>b.id===bucket.id)<buckets.length-1?()=>handleMoveBucket(bucket.id,1):null}
                      onQuickAdd={handleOpenTaskModal}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{width:380,display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',padding:'22px 22px 22px'}}>
              <LibraryPanel tasks={libraryTasks} onNameChange={handleLibraryNameChange} onAddSubtask={handleAddLibrarySubtask} onDelete={handleDeleteLibraryItem} onAddCategory={handleAddLibraryCategory} saving={librarySaving} recentAddedId={libraryRecentlyAddedId} />
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCardOverlay task={activeTask}/> : activeLibraryTask ? <LibraryTaskOverlay task={activeLibraryTask}/> : null}
          </DragOverlay>
        </DndContext>

        {/* Modals */}
        {eventModal!==null&&<EventFormModal initial={eventModal} onSave={handleSaveEvent} onClose={()=>setEventModal(null)}/>}
        {bucketModal!==null&&<BucketFormModal initial={bucketModal} onSave={handleSaveBucket} onClose={()=>setBucketModal(null)}/>}
        {taskModal!==null&&<TaskFormModal initial={taskModal} buckets={buckets} members={members} volunteers={volunteers} defaultBucketId={taskDefBkt} onSave={handleSaveTask} onClose={()=>{setTaskModal(null);setTaskDefBkt(null)}}/>}
          {assignModal!==null&&<AssignModal initial={assignModal} volunteers={volunteers} onSave={handleSaveAssign} onClose={()=>setAssignModal(null)}/>}        
          {libraryModal!==null&&<LibraryTaskFormModal initial={libraryModal} libraryTasks={libraryTasks} onSave={handleSaveLibraryTask} onClose={()=>setLibraryModal(null)}/>}        
        {carryModal&&selEvent&&<CarryForwardModal currentEvent={selEvent} allEvents={events} onCarryForward={handleCarryForward} onClose={()=>setCarryModal(false)}/>}
        {summaryModal&&selEvent&&<CompletionSummaryModal event={selEvent} buckets={buckets} tasks={tasks} onClose={()=>setSummaryModal(false)}/>}
      </div>
    )
  }

  // ── Non-board views ───────────────────────────────────────────

  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'calc(100vh - 88px)'}}>
      <TopBar/>
      <div style={{flex:1,overflowY:'auto',paddingTop:18}} onContextMenu={e=>e.preventDefault()}>
        {view==='year'   && renderYear()}
        {view==='month'  && renderMonth()}
        {view==='week'   && renderWeek()}
        {view==='agenda' && renderAgenda()}
        {view==='cards'  && renderCards()}
      </div>
      {eventModal!==null&&<EventFormModal initial={eventModal} onSave={handleSaveEvent} onClose={()=>setEventModal(null)}/>}
      {selRange&&selRange.start!==selRange.end&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:1200,background:'var(--accent,#2563eb)',color:'#fff',fontSize:12,fontWeight:600,padding:'7px 18px',borderRadius:20,boxShadow:'0 4px 14px rgba(0,0,0,0.2)',pointerEvents:'none',letterSpacing:'0.02em'}}>
          Right-click to create event for selected dates
        </div>
      )}
      {tooltip&&!selRange&&(
        <>
          <div onClick={()=>setTooltip(null)} style={{position:'fixed',inset:0,zIndex:1199}}/>
          <DayTooltip ds={tooltip.ds} events={events} x={tooltip.x} y={tooltip.y} onEventClick={e=>{openBoard(e);setTooltip(null)}} onClose={()=>setTooltip(null)}/>
        </>
      )}
      {searchResults&&(
        <div style={{position:'fixed',top:54,right:16,zIndex:9999,width:340,background:'var(--card-bg,#fff)',border:'1px solid var(--card-border,#e2e8f0)',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,0.13)',overflow:'hidden'}}>
          {searchResults.events.length===0&&searchResults.tasks.length===0?(
            <div style={{padding:'14px 16px',fontSize:13,color:'var(--text-3)',textAlign:'center'}}>No results found</div>
          ):(
            <>
              {searchResults.events.length>0&&(
                <>
                  <div style={{padding:'8px 14px 4px',fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid var(--card-border,#e2e8f0)'}}>Events</div>
                  {searchResults.events.map(e=>(
                    <div key={e.id} onClick={()=>{setSelEvent(e);loadBoard(e.id);setSearch('');setShowSearch(false)}}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',cursor:'pointer',borderBottom:'1px solid var(--card-border,#e2e8f0)'}}
                      onMouseEnter={el=>el.currentTarget.style.background='var(--input-bg,#f1f5f9)'}
                      onMouseLeave={el=>el.currentTarget.style.background='transparent'}>
                      <Calendar size={13} color="var(--accent,#2563eb)" style={{flexShrink:0}}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</div>
                        <div style={{fontSize:11,color:'var(--text-3)'}}>{e.event_type}{e.start_date?' · '+fmtDate(e.start_date):''}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {searchResults.tasks.length>0&&(
                <>
                  <div style={{padding:'8px 14px 4px',fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid var(--card-border,#e2e8f0)'}}>Tasks</div>
                  {searchResults.tasks.map(t=>{
                    const ev=events.find(e=>e.id===t.event_id)
                    return(
                      <div key={t.id} onClick={()=>{if(ev){setSelEvent(ev);loadBoard(ev.id)};setSearch('');setShowSearch(false)}}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',cursor:'pointer',borderBottom:'1px solid var(--card-border,#e2e8f0)'}}
                        onMouseEnter={el=>el.currentTarget.style.background='var(--input-bg,#f1f5f9)'}
                        onMouseLeave={el=>el.currentTarget.style.background='transparent'}>
                        <CheckCircle2 size={13} color={t.status==='done'?'#22c55e':'var(--text-3)'} style={{flexShrink:0}}/>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title}</div>
                          <div style={{fontSize:11,color:'var(--text-3)'}}>{t.eventName}{t.due_date?' · '+fmtDate(t.due_date):''}</div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDlg}
        title={confirmDlg?.title || ''}
        message={confirmDlg?.message || ''}
        confirmLabel="Delete"
        danger
        busy={confirmBusy}
        onCancel={() => { if (!confirmBusy) setConfirmDlg(null) }}
        onConfirm={() => confirmDlg?.onConfirm?.()}
      />
    </div>
  )
}
