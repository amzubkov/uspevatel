import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';
import { resolveImageSrc } from '../services/images';

const WEIGHT_LABELS: Record<number, string> = { 0: 'Без веса', 10: 'Гантели', 100: 'Штанга' };
const WEIGHT_OPTIONS = [{ key: 0, label: 'Без веса' }, { key: 10, label: 'Гантели' }, { key: 100, label: 'Штанга' }];
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

export function ExerciseDetailScreen() {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const c = colors[settings.theme];
  const { exercises, workoutLogs: logs, addWorkoutLog, removeWorkoutLog, updateExercise } = useDatabase();
  const exId = Number(exerciseId);
  const exercise = useMemo(() => exercises.find(e => e.id === exId), [exercises, exId]);
  const exLogs = useMemo(() => logs.filter(l => l.exerciseId === exId), [logs, exId]);
  const [weight, setWeight] = useState(''); const [reps, setReps] = useState(''); const [sets, setSets] = useState('1');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(''); const [editTag, setEditTag] = useState(''); const [editWeightType, setEditWeightType] = useState(0); const [editDescription, setEditDescription] = useState('');
  const today = todayStr();
  const todayLogs = useMemo(() => exLogs.filter(l => l.date === today), [exLogs, today]);
  const maxWeight = useMemo(() => exLogs.reduce((m, l) => Math.max(m, l.weight), 0), [exLogs]);
  const historyByDate = useMemo(() => {
    const map = new Map<string, typeof exLogs>(); for (const l of exLogs) { const a = map.get(l.date) || []; a.push(l); map.set(l.date, a); }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [exLogs]);

  if (!exercise) return <div style={{ padding: 40, textAlign: 'center', color: c.textSecondary, backgroundColor: c.background, height: '100vh' }}>Упражнение не найдено<br/><button onClick={() => navigate('/exercises')} style={{ marginTop: 12, color: c.primary, background: 'none', border: 'none', cursor: 'pointer' }}>&larr; Назад</button></div>;
  const handleAdd = () => { const w = parseFloat(weight.replace(',','.'))||0; const r = parseInt(reps)||0; const s = parseInt(sets)||1; if (exercise.weightType !== 0 && w <= 0) return; if (r <= 0) return; addWorkoutLog(exId, w, r, s); setWeight(''); setReps(''); setSets('1'); };
  const startEdit = () => { setEditName(exercise.name); setEditTag(exercise.tag||''); setEditWeightType(exercise.weightType); setEditDescription(exercise.description||''); setEditing(true); };
  const saveEdit = () => { if (!editName.trim()) return; updateExercise(exercise.id, { name: editName.trim(), tag: editTag.trim()||null, weightType: editWeightType, description: editDescription.trim()||null }); setEditing(false); };
  const logTime = (l: typeof exLogs[0]) => l.createdAt?.includes(' ') ? l.createdAt.split(' ')[1]?.slice(0,5)||'' : '';

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <button onClick={() => navigate('/exercises')} style={{ background: 'none', border: 'none', color: c.primary, cursor: 'pointer', fontSize: settings.fontSize, marginBottom: 12 }}>&larr; Упражнения</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div><div style={{ fontSize: settings.fontSize + 6, fontWeight: 800, color: c.text }}>{exercise.name}</div><div style={{ display: 'flex', gap: 8, marginTop: 2 }}>{exercise.tag && <span style={{ color: c.primary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{exercise.tag}</span>}<span style={{ color: c.textSecondary, fontSize: settings.fontSize - 1 }}>{WEIGHT_LABELS[exercise.weightType]}</span>{maxWeight > 0 && <span style={{ color: c.primary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>Макс: {maxWeight} кг</span>}</div></div>
        <span style={{ flex: 1 }} /><button onClick={startEdit} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: c.text, fontSize: settings.fontSize }}>✏️</button>
      </div>
      {editing && (<div style={{ backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize }} />
        <input value={editTag} onChange={e => setEditTag(e.target.value)} placeholder="Тег" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize }} />
        <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Описание" rows={2} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6 }}>{WEIGHT_OPTIONS.map(wt => (<button key={wt.key} onClick={() => setEditWeightType(wt.key)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: editWeightType === wt.key ? c.primary : 'rgba(128,128,128,0.15)', color: editWeightType === wt.key ? '#FFF' : c.textSecondary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{wt.label}</button>))}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: c.textSecondary, cursor: 'pointer' }}>Отмена</button><button onClick={saveEdit} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontWeight: 700 }}>Сохранить</button></div>
      </div>)}
      {(() => { const src = resolveImageSrc(exercise.imageUri); return src ? <img src={src} alt="" style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} /> : null; })()}
      {exercise.description && <div style={{ backgroundColor: c.card, borderRadius: 8, border: `1px solid ${c.border}`, padding: 10, marginBottom: 12 }}><div style={{ color: c.textSecondary, fontSize: settings.fontSize - 1, lineHeight: 1.5 }}>{exercise.description}</div></div>}
      <div style={{ backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        {exercise.weightType !== 0 && <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="Вес" onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, textAlign: 'center' }} />}
        <input value={reps} onChange={e => setReps(e.target.value)} placeholder="Повт." onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, textAlign: 'center' }} />
        <input value={sets} onChange={e => setSets(e.target.value)} placeholder="Подх." onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ width: 50, padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, textAlign: 'center' }} />
        <button onClick={handleAdd} style={{ width: 40, height: 40, borderRadius: 20, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>+</button>
      </div>
      {todayLogs.length > 0 && <><div style={{ color: c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Сегодня</div>{todayLogs.map((l, i) => (<div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', backgroundColor: i % 2 === 1 ? c.rowAlt : 'transparent', borderRadius: 4 }}><span style={{ color: c.textSecondary, fontSize: settings.fontSize - 1, width: 45 }}>{logTime(l)}</span>{l.weight > 0 && <span style={{ color: c.text, fontSize: settings.fontSize, fontWeight: 600 }}>{l.weight} кг</span>}<span style={{ color: c.text, fontSize: settings.fontSize, fontWeight: 600 }}>{l.reps} повт.</span><span style={{ color: c.textSecondary }}>x{l.setNum}</span><span style={{ flex: 1 }} /><button onClick={() => removeWorkoutLog(l.id)} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', opacity: 0.6 }}>&times;</button></div>))}</>}
      {historyByDate.filter(([d]) => d !== today).length > 0 && <><div style={{ color: c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600, textTransform: 'uppercase', marginTop: 20, marginBottom: 6 }}>История</div>{historyByDate.filter(([d]) => d !== today).slice(0, 14).map(([date, dayLogs]) => (<div key={date} style={{ padding: '6px 12px', borderBottom: `1px solid ${c.border}` }}><div style={{ color: c.text, fontSize: settings.fontSize - 1, fontWeight: 600, marginBottom: 2 }}>{date}</div>{dayLogs.map(l => <span key={l.id} style={{ color: c.textSecondary, fontSize: settings.fontSize - 1, marginRight: 12 }}>{l.weight > 0 ? `${l.weight}кг ` : ''}{l.reps}x{l.setNum}</span>)}</div>))}</>}
    </div>
  );
}
