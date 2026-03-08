import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { Category, CATEGORY_LABELS } from '../shared/types';

const CATEGORIES: Category[] = ['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE'];
const PRIORITIES = ['high', 'normal', 'low'] as const;

export function AddTaskScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addTask, projects, settings } = useApp();
  const c = colors[settings.theme];
  const contextCategories = settings.contextCategories;

  const initialCategory = (searchParams.get('category') as Category) || 'IN';

  const [subject, setSubject] = useState('');
  const [action, setAction] = useState('');
  const [category, setCategory] = useState<Category>(initialCategory);
  const [project, setProject] = useState<string | undefined>();
  const [contextCategory, setContextCategory] = useState<string | undefined>();
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [deadline, setDeadline] = useState<string | undefined>();
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [customDeadlineDate, setCustomDeadlineDate] = useState('');
  const [customDeadlineTime, setCustomDeadlineTime] = useState('');

  const handleSave = () => {
    if (!action.trim()) return;
    addTask({
      subject: subject.trim(),
      action: action.trim(),
      category,
      project,
      contextCategory,
      startDate: startDate || undefined,
      deadline,
      notes,
      priority,
      isRecurring: false,
    });
    navigate(-1);
  };

  const chipStyle = (active: boolean, activeColor: string) => ({
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    backgroundColor: active ? activeColor : c.card,
    color: active ? '#fff' : c.text,
    border: `1px solid ${c.border}`, fontSize: 13, fontWeight: 600 as const,
  });

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%', backgroundColor: c.background }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>
        Человек (кто)
      </label>
      <input
        type="text"
        value={subject} onChange={(e) => setSubject(e.target.value)}
        placeholder="Виктор, Я, Жена..."
        style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15 }}
      />

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>
        Действие *
      </label>
      <textarea
        value={action} onChange={(e) => setAction(e.target.value)}
        placeholder="Элементарное действие"
        style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15, minHeight: 60, resize: 'vertical' }}
      />

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Категория</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setCategory(cat)} style={chipStyle(category === cat, c.primary)}>
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Приоритет</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PRIORITIES.map((p) => (
          <button key={p} onClick={() => setPriority(p)} style={chipStyle(priority === p, p === 'high' ? '#DC2626' : p === 'normal' ? '#16A34A' : '#EAB308')}>
            {p === 'high' ? 'Высокий' : p === 'normal' ? 'Обычный' : 'Низкий'}
          </button>
        ))}
      </div>

      {projects.length > 0 && (
        <>
          <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Проект</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => setProject(undefined)} style={chipStyle(!project, c.border)}>Нет</button>
            {projects.map((p) => (
              <button key={p.id} onClick={() => setProject(p.name)} style={chipStyle(project === p.name, c.primary)}>
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {contextCategories.length > 0 && (
        <>
          <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Контекст</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => setContextCategory(undefined)} style={chipStyle(!contextCategory, c.border)}>Нет</button>
            {contextCategories.map((ctx) => (
              <button key={ctx} onClick={() => setContextCategory(ctx)} style={chipStyle(contextCategory === ctx, c.warning)}>
                \{ctx}
              </button>
            ))}
          </div>
        </>
      )}

      {(category === 'CONTROL' || category === 'DAY') && (
        <>
          <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Дата (ГГГГ-ММ-ДД)</label>
          <input
            type="date"
            value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15 }}
          />
        </>
      )}

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Дедлайн</label>
      {deadline ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: c.text, fontSize: 15 }}>
            {new Date(deadline).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => setDeadline(undefined)} style={{ color: c.danger, fontWeight: 600, fontSize: 14 }}>Убрать</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => { const d = new Date(); d.setHours(23, 59, 0, 0); setDeadline(d.toISOString()); }} style={chipStyle(false, '')}>Сегодня</button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); setDeadline(d.toISOString()); }} style={chipStyle(false, '')}>Завтра</button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0); setDeadline(d.toISOString()); }} style={chipStyle(false, '')}>Послезавтра</button>
          <button onClick={() => setShowDeadlinePicker(true)} style={chipStyle(false, '')}>Кастом</button>
        </div>
      )}

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Заметки</label>
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Дополнительная информация..."
        style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15, minHeight: 80, resize: 'vertical' }}
      />

      <button
        onClick={handleSave}
        disabled={!action.trim()}
        style={{
          marginTop: 24, marginBottom: 40, width: '100%', padding: 16, borderRadius: 12,
          backgroundColor: c.primary, color: '#fff', fontSize: 17, fontWeight: 700,
          opacity: action.trim() ? 1 : 0.5,
        }}
      >
        Сохранить
      </button>

      {/* Custom deadline modal */}
      {showDeadlinePicker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: c.card, borderRadius: 12, padding: 20, width: 320 }}>
            <h3 style={{ color: c.text, textAlign: 'center', marginBottom: 16 }}>Дедлайн</h3>
            <label style={{ fontSize: 13, color: c.textSecondary }}>Дата</label>
            <input type="date" value={customDeadlineDate} onChange={(e) => setCustomDeadlineDate(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: 16, marginBottom: 8 }} />
            <label style={{ fontSize: 13, color: c.textSecondary }}>Время</label>
            <input type="time" value={customDeadlineTime} onChange={(e) => setCustomDeadlineTime(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.background, color: c.text, fontSize: 16 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowDeadlinePicker(false)} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: c.border, color: c.text, fontWeight: 600 }}>Отмена</button>
              <button onClick={() => {
                if (!customDeadlineDate) return;
                const [y, m, d] = customDeadlineDate.split('-').map(Number);
                const [h, min] = (customDeadlineTime || '23:59').split(':').map(Number);
                const target = new Date(y, m - 1, d, h, min, 0, 0);
                setDeadline(target.toISOString());
                setShowDeadlinePicker(false);
              }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: c.primary, color: '#fff', fontWeight: 600 }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
