import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';

const WEIGHT_LABELS: Record<number, string> = { 0: 'Без веса', 10: 'Гантели', 100: 'Штанга' };
const WEIGHT_OPTIONS = [{ key: 0, label: 'Без веса' }, { key: 10, label: 'Гантели' }, { key: 100, label: 'Штанга' }];

export function ExercisesScreen() {
  const settings = useSettings();
  const c = colors[settings.theme];
  const { exercises, removeExercise, addExercise } = useDatabase();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState(''); const [tag, setTag] = useState(''); const [weightType, setWeightType] = useState(0); const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const allTags = useMemo(() => { const t = new Set<string>(); for (const e of exercises) if (e.tag) t.add(e.tag); return Array.from(t).sort(); }, [exercises]);
  const filtered = useMemo(() => selectedTag ? exercises.filter(e => e.tag === selectedTag) : exercises, [exercises, selectedTag]);
  const handleAdd = async () => { if (!name.trim()) return; await addExercise(name.trim(), weightType, tag.trim() || undefined, description.trim() || undefined); setName(''); setTag(''); setWeightType(0); setDescription(''); setShowAdd(false); };

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: c.text, margin: 0, fontSize: settings.fontSize + 6 }}>Упражнения</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>{showAdd ? 'Отмена' : '+ Новое'}</button>
      </div>
      {showAdd && (<div style={{ backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Название" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize }} />
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Тег (Грудь, Ноги)" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize }} />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание" rows={2} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: settings.fontSize, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6 }}>{WEIGHT_OPTIONS.map(wt => (<button key={wt.key} onClick={() => setWeightType(wt.key)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: weightType === wt.key ? c.primary : 'rgba(128,128,128,0.15)', color: weightType === wt.key ? '#FFF' : c.textSecondary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{wt.label}</button>))}</div>
        <button onClick={handleAdd} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', alignSelf: 'flex-end', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>Добавить</button>
      </div>)}
      {allTags.length > 0 && (<div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setSelectedTag(null)} style={{ padding: '4px 10px', borderRadius: 14, border: 'none', cursor: 'pointer', backgroundColor: !selectedTag ? c.primary : 'rgba(128,128,128,0.15)', color: !selectedTag ? '#FFF' : c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600 }}>Все ({exercises.length})</button>
        {allTags.map(t => (<button key={t} onClick={() => setSelectedTag(selectedTag === t ? null : t)} style={{ padding: '4px 10px', borderRadius: 14, border: 'none', cursor: 'pointer', backgroundColor: selectedTag === t ? c.primary : 'rgba(128,128,128,0.15)', color: selectedTag === t ? '#FFF' : c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600 }}>{t} ({exercises.filter(e => e.tag === t).length})</button>))}
      </div>)}
      {filtered.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: c.textSecondary }}><div style={{ fontSize: 48 }}>🏋️</div><div style={{ fontSize: settings.fontSize + 2, fontWeight: 600, marginTop: 12 }}>Нет упражнений</div></div>)
      : filtered.map((ex, i) => (
        <div key={ex.id} onClick={() => navigate(`/exercise/${ex.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: i % 2 === 1 ? c.rowAlt : 'transparent', borderRadius: 4, cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏋️</div>
          <div style={{ flex: 1 }}><div style={{ color: c.text, fontSize: settings.fontSize, fontWeight: 600 }}>{ex.name}</div><div style={{ display: 'flex', gap: 8, marginTop: 1 }}><span style={{ color: c.textSecondary, fontSize: settings.fontSize - 2 }}>{WEIGHT_LABELS[ex.weightType] || 'Гантели'}</span>{ex.tag && <span style={{ color: c.primary, fontSize: settings.fontSize - 3, fontWeight: 600 }}>{ex.tag}</span>}</div></div>
          <button onClick={e => { e.stopPropagation(); if (confirm(`Удалить "${ex.name}"?`)) removeExercise(ex.id); }} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', fontSize: settings.fontSize, opacity: 0.5 }}>&times;</button>
          <span style={{ color: c.textSecondary, fontSize: 16 }}>&rsaquo;</span>
        </div>
      ))}
    </div>
  );
}
