import React, { useState, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';
import type { FlightKind, FlightStatus } from '../hooks/useFlights';
import { resolveImageSrc } from '../services/images';

const STATUS_LABELS: Record<FlightStatus, string> = { planned: 'Планируется', booked: 'Забронировано', completed: 'Завершено', cancelled: 'Отменено' };
const STATUS_COLORS: Record<FlightStatus, string> = { planned: '#F59E0B', booked: '#3B82F6', completed: '#16A34A', cancelled: '#DC2626' };
const KIND_LABELS: Record<FlightKind, string> = { flight: 'Перелёт', hotel: 'Отель' };
const KIND_EMOJI: Record<FlightKind, string> = { flight: '✈️', hotel: '🏨' };

export function FlightsScreen() {
  const settings = useSettings();
  const c = colors[settings.theme];
  const { flights, addFlight, updateFlight, removeFlight } = useDatabase();
  const [showAdd, setShowAdd] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [kind, setKind] = useState<FlightKind>('flight'); const [title, setTitle] = useState(''); const [status, setStatus] = useState<FlightStatus>('planned');
  const [departDate, setDepartDate] = useState(''); const [departTime, setDepartTime] = useState(''); const [arriveDate, setArriveDate] = useState(''); const [arriveTime, setArriveTime] = useState(''); const [notes, setNotes] = useState('');
  const sorted = useMemo(() => [...flights].sort((a, b) => b.departDate.localeCompare(a.departDate)), [flights]);
  const resetForm = () => { setKind('flight'); setTitle(''); setStatus('planned'); setDepartDate(''); setDepartTime(''); setArriveDate(''); setArriveTime(''); setNotes(''); setEditId(null); setShowAdd(false); };
  const startEdit = (f: typeof flights[0]) => { setEditId(f.id); setKind(f.kind); setTitle(f.title); setStatus(f.status); setDepartDate(f.departDate); setDepartTime(f.departTime||''); setArriveDate(f.arriveDate||''); setArriveTime(f.arriveTime||''); setNotes(f.notes); setShowAdd(true); };
  const handleSave = () => { if (!title.trim() || !departDate) return; const data = { kind, title: title.trim(), status, departDate, departTime: departTime||undefined, arriveDate: arriveDate||undefined, arriveTime: arriveTime||undefined, notes: notes.trim() }; if (editId) updateFlight(editId, data); else addFlight(data); resetForm(); };

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: c.text, margin: 0, fontSize: settings.fontSize + 6 }}>Перелёты и Отели</h2>
        <button onClick={() => showAdd ? resetForm() : setShowAdd(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>{showAdd ? 'Отмена' : '+ Добавить'}</button>
      </div>
      {showAdd && (<div style={{ backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>{(['flight','hotel'] as FlightKind[]).map(k => (<button key={k} onClick={() => setKind(k)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: kind === k ? c.primary : 'rgba(128,128,128,0.15)', color: kind === k ? '#FFF' : c.textSecondary, fontSize: settings.fontSize, fontWeight: 600 }}>{KIND_EMOJI[k]} {KIND_LABELS[k]}</button>))}</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название / Маршрут" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize }} />
        <div style={{ display: 'flex', gap: 6 }}>{(Object.keys(STATUS_LABELS) as FlightStatus[]).map(s => (<button key={s} onClick={() => setStatus(s)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: status === s ? STATUS_COLORS[s] : 'rgba(128,128,128,0.15)', color: status === s ? '#FFF' : c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600 }}>{STATUS_LABELS[s]}</button>))}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={{ color: c.textSecondary, fontSize: settings.fontSize - 2 }}>{kind === 'hotel' ? 'Заезд' : 'Вылет'}</label><div style={{ display: 'flex', gap: 4 }}><input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize - 1 }} /><input type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize - 1 }} /></div></div>
          <div style={{ flex: 1 }}><label style={{ color: c.textSecondary, fontSize: settings.fontSize - 2 }}>{kind === 'hotel' ? 'Выезд' : 'Прилёт'}</label><div style={{ display: 'flex', gap: 4 }}><input type="date" value={arriveDate} onChange={e => setArriveDate(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize - 1 }} /><input type="time" value={arriveTime} onChange={e => setArriveTime(e.target.value)} style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize - 1 }} /></div></div>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Заметки" rows={2} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, resize: 'vertical' }} />
        <button onClick={handleSave} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', alignSelf: 'flex-end', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>{editId ? 'Сохранить' : 'Добавить'}</button>
      </div>)}
      {sorted.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: c.textSecondary }}><div style={{ fontSize: 48 }}>✈️</div><div style={{ fontSize: settings.fontSize + 2, fontWeight: 600, marginTop: 12 }}>Нет записей</div></div>)
      : sorted.map(f => (
        <div key={f.id} style={{ backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>{KIND_EMOJI[f.kind]}</span><span style={{ color: c.text, fontSize: settings.fontSize, fontWeight: 700, flex: 1 }}>{f.title}</span><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: settings.fontSize - 3, fontWeight: 600, backgroundColor: STATUS_COLORS[f.status] + '22', color: STATUS_COLORS[f.status] }}>{STATUS_LABELS[f.status]}</span></div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, color: c.textSecondary, fontSize: settings.fontSize - 1 }}><span>{f.kind === 'hotel' ? 'Заезд' : 'Вылет'}: {f.departDate}{f.departTime ? ` ${f.departTime}` : ''}</span>{f.arriveDate && <span>{f.kind === 'hotel' ? 'Выезд' : 'Прилёт'}: {f.arriveDate}{f.arriveTime ? ` ${f.arriveTime}` : ''}</span>}</div>
          {f.notes && <div style={{ color: c.textSecondary, fontSize: settings.fontSize - 1, marginTop: 4 }}>{f.notes}</div>}
          {(() => { const src = resolveImageSrc(f.imageUri); return src ? <img src={src} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} /> : null; })()}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button onClick={() => startEdit(f)} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: c.text, fontSize: settings.fontSize - 2 }}>✏️</button><button onClick={() => { if (confirm(`Удалить "${f.title}"?`)) removeFlight(f.id); }} style={{ background: 'none', border: `1px solid ${c.danger}33`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: c.danger, fontSize: settings.fontSize - 2 }}>Удалить</button></div>
        </div>
      ))}
    </div>
  );
}
