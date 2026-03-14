import React, { useState, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useDatabase } from '../context/DatabaseContext';
import { colors } from '../styles/theme';
import type { SportType, SportEntry } from '../hooks/useSport';

const TYPES: { key: SportType; label: string; emoji: string; unit: string }[] = [
  { key: 'pullups', label: 'Подтягивания', emoji: '💪', unit: 'раз' },
  { key: 'abs', label: 'Пресс', emoji: '🔥', unit: 'раз' },
  { key: 'triceps', label: 'Трицепс', emoji: '🏋️', unit: 'раз' },
  { key: 'run', label: 'Бег', emoji: '🏃', unit: 'км' },
  { key: 'weight', label: 'Вес', emoji: '⚖️', unit: 'кг' },
];
const QUICK_ADDS: Record<SportType, number[]> = {
  pullups: [1, 5, 10, 15, 20], abs: [5, 10, 20, 30, 50], triceps: [5, 10, 15, 20, 30], run: [1, 2, 3, 5, 10], weight: [],
};
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

export function SportScreen() {
  const settings = useSettings();
  const c = colors[settings.theme];
  const { sportEntries: entries, addSportEntry, removeSportEntry, updateSportEntry } = useDatabase();
  const [activeType, setActiveType] = useState<SportType>('pullups');
  const [customVal, setCustomVal] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const today = todayStr();
  const todayEntries = useMemo(() => entries.filter(e => e.date === today && e.type === activeType).sort((a, b) => b.time.localeCompare(a.time)), [entries, today, activeType]);
  const todayTotal = useMemo(() => todayEntries.reduce((s, e) => s + e.count, 0), [todayEntries]);
  const history = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) { if (e.type !== activeType) continue; map.set(e.date, (map.get(e.date) || 0) + e.count); }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).filter(([d]) => d !== today).slice(0, 14);
  }, [entries, activeType, today]);
  const typeInfo = TYPES.find(t => t.key === activeType)!;
  const handleCustomAdd = () => { const n = parseFloat(customVal.replace(',', '.')); if (!n || n <= 0) return; addSportEntry(activeType, n); setCustomVal(''); };
  const saveEdit = () => { if (!editId) return; const n = parseFloat(editVal.replace(',', '.')); if (n > 0) updateSportEntry(editId, { count: n }); setEditId(null); };

  return (
    <div style={{ height: '100vh', overflow: 'auto', backgroundColor: c.background, padding: 20 }}>
      <h2 style={{ color: c.text, margin: '0 0 16px', fontSize: settings.fontSize + 6 }}>Спорт</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TYPES.map(t => (<button key={t.key} onClick={() => setActiveType(t.key)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: activeType === t.key ? c.primary : c.card, color: activeType === t.key ? '#FFF' : c.text, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{t.emoji} {t.label}</button>))}
      </div>
      <div style={{ backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${c.border}`, textAlign: 'center' }}>
        <div style={{ fontSize: settings.fontSize + 16, fontWeight: 800, color: c.primary }}>{todayTotal}</div>
        <div style={{ color: c.textSecondary, fontSize: settings.fontSize - 1 }}>{typeInfo.label} сегодня ({typeInfo.unit})</div>
      </div>
      {QUICK_ADDS[activeType].length > 0 && (<div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>{QUICK_ADDS[activeType].map(n => (<button key={n} onClick={() => addSportEntry(activeType, n)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 600 }}>+{n}</button>))}</div>)}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input type="text" value={customVal} onChange={e => setCustomVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomAdd()} placeholder={`Своё значение (${typeInfo.unit})`} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} />
        <button onClick={handleCustomAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: c.primary, color: '#FFF', cursor: 'pointer', fontSize: settings.fontSize, fontWeight: 700 }}>+</button>
      </div>
      {todayEntries.length > 0 && <div style={{ color: c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Сегодня</div>}
      {todayEntries.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', backgroundColor: i % 2 === 1 ? c.rowAlt : 'transparent', borderRadius: 4 }}>
          <span style={{ color: c.textSecondary, fontSize: settings.fontSize - 1, width: 45 }}>{e.time}</span>
          {editId === e.id ? <input value={editVal} onChange={ev => setEditVal(ev.target.value)} onBlur={saveEdit} onKeyDown={ev => ev.key === 'Enter' && saveEdit()} autoFocus style={{ width: 60, padding: '2px 6px', borderRadius: 4, border: `1px solid ${c.primary}`, backgroundColor: c.card, color: c.text, fontSize: settings.fontSize }} />
          : <span style={{ color: c.text, fontSize: settings.fontSize, fontWeight: 600, cursor: 'pointer' }} onDoubleClick={() => { setEditId(e.id); setEditVal(String(e.count)); }}>{e.count} {typeInfo.unit}</span>}
          <span style={{ flex: 1 }} />
          <button onClick={() => removeSportEntry(e.id)} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', fontSize: settings.fontSize, opacity: 0.6 }}>&times;</button>
        </div>
      ))}
      {history.length > 0 && <><div style={{ color: c.textSecondary, fontSize: settings.fontSize - 2, fontWeight: 600, textTransform: 'uppercase', marginTop: 20, marginBottom: 6 }}>История</div>{history.map(([date, total]) => (<div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: `1px solid ${c.border}` }}><span style={{ color: c.text, fontSize: settings.fontSize - 1 }}>{date}</span><span style={{ color: c.primary, fontSize: settings.fontSize - 1, fontWeight: 600 }}>{total} {typeInfo.unit}</span></div>))}</>}
    </div>
  );
}
