import React, { useState, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';

export function ChecklistScreen() {
  const settings = useSettings();
  const c = colors[settings.theme];
  const { checkItems: items, addCheckItem, toggleCheckItem, updateCheckItem, removeCheckItem } = useDatabase();
  const [newTitle, setNewTitle] = useState(''); const [editId, setEditId] = useState<string | null>(null); const [editVal, setEditVal] = useState('');
  const undone = useMemo(() => items.filter(i => !i.done), [items]);
  const done = useMemo(() => items.filter(i => i.done), [items]);
  const progress = items.length > 0 ? done.length / items.length : 0;
  const handleAdd = () => { if (!newTitle.trim()) return; addCheckItem(newTitle.trim()); setNewTitle(''); };
  const saveEdit = () => { if (editId && editVal.trim()) updateCheckItem(editId, editVal.trim()); setEditId(null); };

  const renderItem = (item: typeof items[0], i: number) => (
    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: i % 2 === 1 ? c.rowAlt : 'transparent', borderRadius: 4 }}>
      <button onClick={() => toggleCheckItem(item.id)} style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${item.done ? c.success : c.border}`, backgroundColor: item.done ? c.success : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 13 }}>{item.done ? '✓' : ''}</button>
      {editId === item.id ? <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={saveEdit} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: `1px solid ${c.primary}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} />
      : <span onDoubleClick={() => { setEditId(item.id); setEditVal(item.title); }} style={{ flex: 1, color: item.done ? c.textSecondary : c.text, fontSize: settings.fontSize, textDecoration: item.done ? 'line-through' : 'none', cursor: 'pointer' }}>{item.title}</span>}
      <button onClick={() => removeCheckItem(item.id)} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', opacity: 0.5, fontSize: settings.fontSize }}>&times;</button>
    </div>
  );

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <h2 style={{ color: c.text, margin: '0 0 16px', fontSize: settings.fontSize + 6 }}>Чеклист</h2>
      {items.length > 0 && (<div style={{ marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: c.textSecondary, fontSize: settings.fontSize - 1 }}>Готово</span><span style={{ color: c.primary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{done.length}/{items.length}</span></div><div style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: c.success, borderRadius: 4, transition: 'width 0.3s' }} /></div></div>)}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Новый пункт" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} /><button onClick={handleAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>+</button></div>
      {items.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: c.textSecondary }}><div style={{ fontSize: 48 }}>✅</div><div style={{ fontSize: settings.fontSize + 2, fontWeight: 600, marginTop: 12 }}>Пусто</div></div>)
      : <>{undone.map((item, i) => renderItem(item, i))}{done.length > 0 && <><div style={{ color: c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 }}>Готово ({done.length})</div>{done.map((item, i) => renderItem(item, i))}</>}</>}
    </div>
  );
}
