import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { Category, CATEGORY_LABELS } from '../shared/types';
import { resolveImageSrc } from '../services/images';

const CATEGORIES: Category[] = ['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE'];

export function TaskDetailScreen() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tasks, updateTask, deleteTask, completeTask, uncompleteTask, projects, addProject, settings } = useApp();
  const c = colors[settings.theme];
  const contextCategories = settings.contextCategories;

  const task = useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);
  const deletedRef = useRef(false);

  const [subject, setSubject] = useState(task?.subject || '');
  const [action, setAction] = useState(task?.action || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [category, setCategory] = useState<Category>(task?.category || 'IN');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>(task?.priority || 'normal');
  const [project, setProject] = useState<string | undefined>(task?.project);
  const [contextCategory, setContextCategory] = useState<string | undefined>(task?.contextCategory);
  const [deadline, setDeadline] = useState<string | undefined>(task?.deadline);
  const [showSubjectList, setShowSubjectList] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [customDeadlineDate, setCustomDeadlineDate] = useState('');
  const [customDeadlineTime, setCustomDeadlineTime] = useState('');

  const knownSubjects = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => { if (t.subject?.trim()) set.add(t.subject.trim()); });
    const arr = Array.from(set).sort();
    if (!subject.trim()) return arr;
    const q = subject.toLowerCase();
    return arr.filter((s) => s.toLowerCase().includes(q));
  }, [tasks, subject]);

  const filteredProjects = useMemo(() => {
    if (!project?.trim()) return projects;
    const q = project.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, project]);

  if (!task) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: c.background }}>
        <span style={{ color: c.textSecondary }}>Задача не найдена</span>
      </div>
    );
  }

  const ensureProjectExists = (name: string | undefined) => {
    if (!name?.trim()) return;
    const exists = projects.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (!exists) addProject(name.trim());
  };

  const handleSave = () => {
    deletedRef.current = true;
    ensureProjectExists(project);
    updateTask(taskId!, { subject, action, notes, category, priority, project: project || undefined, contextCategory: contextCategory || undefined, deadline: deadline || undefined });
    navigate(-1);
  };

  const handleDelete = () => {
    if (window.confirm('Удалить задачу? Это действие нельзя отменить')) {
      deletedRef.current = true;
      deleteTask(taskId!);
      navigate(-1);
    }
  };

  const chipStyle = (active: boolean, activeColor: string) => ({
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    backgroundColor: active ? activeColor : c.card,
    color: active ? '#fff' : c.text,
    border: `1px solid ${c.border}`, fontSize: 13, fontWeight: 600 as const,
  });

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%', backgroundColor: c.background }}>
      <div style={{ fontSize: 11, color: c.textSecondary, textAlign: 'right', marginBottom: -8 }}>
        {new Date(task.createdAt).toLocaleDateString('ru-RU')}
      </div>

      {/* Subject with autocomplete */}
      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Человек</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text" value={subject}
          onChange={(e) => { setSubject(e.target.value); setShowSubjectList(true); }}
          onFocus={() => setShowSubjectList(true)}
          onBlur={() => setTimeout(() => setShowSubjectList(false), 200)}
          placeholder="Кто делает / для кого"
          style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15 }}
        />
        {showSubjectList && knownSubjects.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: c.card, border: `1px solid ${c.border}`, borderTop: 0, borderRadius: '0 0 10px 10px', zIndex: 10, overflow: 'hidden' }}>
            {knownSubjects.slice(0, 6).map((s) => (
              <div key={s} onClick={() => { setSubject(s); setShowSubjectList(false); }}
                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `0.5px solid ${c.border}`, color: c.text, fontSize: 14 }}>
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Действие</label>
      <textarea
        value={action} onChange={(e) => setAction(e.target.value)}
        style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15, minHeight: 60, resize: 'vertical' }}
      />

      {/* Project with autocomplete */}
      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Проект</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text" value={project || ''}
          onChange={(e) => { setProject(e.target.value || undefined); setShowProjectList(true); }}
          onFocus={() => setShowProjectList(true)}
          onBlur={() => setTimeout(() => setShowProjectList(false), 200)}
          placeholder="Выберите или введите проект"
          style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15 }}
        />
        {showProjectList && (filteredProjects.length > 0 || project?.trim()) && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: c.card, border: `1px solid ${c.border}`, borderTop: 0, borderRadius: '0 0 10px 10px', zIndex: 10, overflow: 'hidden' }}>
            {project?.trim() && (
              <div onClick={() => { setProject(undefined); setShowProjectList(false); }}
                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `0.5px solid ${c.border}`, color: c.danger, fontSize: 14 }}>
                Убрать проект
              </div>
            )}
            {filteredProjects.slice(0, 6).map((p) => (
              <div key={p.id} onClick={() => { setProject(p.name); setShowProjectList(false); }}
                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `0.5px solid ${c.border}`, color: c.text, fontSize: 14 }}>
                {p.name} {p.isCurrent ? '(текущий)' : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context */}
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
        {(['high', 'normal', 'low'] as const).map((p) => (
          <button key={p} onClick={() => setPriority(p)} style={chipStyle(priority === p, p === 'high' ? '#DC2626' : p === 'normal' ? '#16A34A' : '#EAB308')}>
            {p === 'high' ? 'Высокий' : p === 'normal' ? 'Обычный' : 'Низкий'}
          </button>
        ))}
      </div>

      {task.completedAt && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 10, borderBottom: `1px solid ${c.border}`, marginTop: 8 }}>
          <span style={{ color: c.textSecondary, fontSize: 14 }}>Выполнено</span>
          <span style={{ color: c.text, fontSize: 14, fontWeight: 500 }}>{new Date(task.completedAt).toLocaleDateString('ru-RU')}</span>
        </div>
      )}

      {/* Deadline */}
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

      {/* Image */}
      {(() => { const src = resolveImageSrc(task.imageUri); return src ? (
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginBottom: 6 }}>Фото</label>
          <img src={src} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
            onClick={(e) => { const el = e.currentTarget; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen(); }} />
        </div>
      ) : null; })()}

      {/* Notes */}
      <label style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, display: 'block', marginTop: 16, marginBottom: 6 }}>Заметки</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onFocus={() => {
          const today = new Date().toLocaleDateString('ru-RU');
          if (notes.startsWith(today)) return;
          if (notes.trim()) setNotes(today + '\n' + notes);
          else setNotes(today + ' ');
        }}
        style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15, minHeight: 80, resize: 'vertical' }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          onClick={() => { task.completed ? uncompleteTask(taskId!) : completeTask(taskId!); navigate(-1); }}
          style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: task.completed ? c.warning : c.success, color: '#fff', fontSize: 16, fontWeight: 600 }}
        >
          {task.completed ? 'Вернуть' : 'Выполнено'}
        </button>
        <button onClick={handleSave} style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.primary, color: '#fff', fontSize: 16, fontWeight: 600 }}>
          Сохранить
        </button>
      </div>

      <button onClick={handleDelete} style={{ marginTop: 16, marginBottom: 40, width: '100%', padding: 14, color: c.danger, fontSize: 16, fontWeight: 600 }}>
        Удалить задачу
      </button>

      {/* Deadline modal */}
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
                setDeadline(new Date(y, m - 1, d, h, min, 0, 0).toISOString());
                setShowDeadlinePicker(false);
              }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: c.primary, color: '#fff', fontWeight: 600 }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
