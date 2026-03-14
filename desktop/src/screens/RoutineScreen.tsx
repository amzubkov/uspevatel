import React, { useState, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';

export function RoutineScreen() {
  const settings = useSettings();
  const c = colors[settings.theme];
  const { routineItems: items, routineCompletedToday: completedToday, addRoutineItem, updateRoutineItem, removeRoutineItem, toggleRoutineComplete, reorderRoutine } = useDatabase();
  const [newTitle, setNewTitle] = useState(''); const [editId, setEditId] = useState<string | null>(null); const [editVal, setEditVal] = useState('');
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const doneCount = useMemo(() => sorted.filter(i => completedToday.includes(i.id)).length, [sorted, completedToday]);
  const progress = sorted.length > 0 ? doneCount / sorted.length : 0;
  const handleAdd = () => { if (!newTitle.trim()) return; addRoutineItem(newTitle.trim()); setNewTitle(''); };
  const saveEdit = () => { if (editId && editVal.trim()) updateRoutineItem(editId, editVal.trim()); setEditId(null); };

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <h2 style={{ color: c.text, margin: '0 0 16px', fontSize: settings.fontSize + 6 }}>Рутина</h2>
      {sorted.length > 0 && (<div style={{ marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: c.textSecondary, fontSize: settings.fontSize - 1 }}>Прогресс</span><span style={{ color: c.primary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{doneCount}/{sorted.length}</span></div><div style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: c.success, borderRadius: 4, transition: 'width 0.3s' }} /></div></div>)}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Новый пункт рутины" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} /><button onClick={handleAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>+</button></div>
      {sorted.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: c.textSecondary }}><div style={{ fontSize: 48 }}>📋</div><div style={{ fontSize: settings.fontSize + 2, fontWeight: 600, marginTop: 12 }}>Добавьте пункты рутины</div></div>)
      : sorted.map((item, idx) => { const done = completedToday.includes(item.id); return (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: idx % 2 === 1 ? c.rowAlt : 'transparent', borderRadius: 4 }}>
          <button onClick={() => toggleRoutineComplete(item.id)} style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${done ? c.success : c.border}`, backgroundColor: done ? c.success : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 14 }}>{done ? '✓' : ''}</button>
          {editId === item.id ? <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={saveEdit} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: `1px solid ${c.primary}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} />
          : <span onDoubleClick={() => { setEditId(item.id); setEditVal(item.title); }} style={{ flex: 1, color: done ? c.textSecondary : c.text, fontSize: settings.fontSize, textDecoration: done ? 'line-through' : 'none', cursor: 'pointer' }}>{item.title}</span>}
          <button onClick={() => reorderRoutine(idx, idx - 1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: c.textSecondary, opacity: idx === 0 ? 0.3 : 0.7, fontSize: 14 }}>▲</button>
          <button onClick={() => reorderRoutine(idx, idx + 1)} disabled={idx === sorted.length - 1} style={{ background: 'none', border: 'none', cursor: idx === sorted.length - 1 ? 'default' : 'pointer', color: c.textSecondary, opacity: idx === sorted.length - 1 ? 0.3 : 0.7, fontSize: 14 }}>▼</button>
          <button onClick={() => removeRoutineItem(item.id)} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', opacity: 0.5, fontSize: settings.fontSize }}>&times;</button>
        </div>); })}
    </div>
  );
}
