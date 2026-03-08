import React from 'react';
import { Task } from '../shared/types';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

interface Props {
  tasks: Task[];
  deadlineFilter: 'all' | 'today';
  projectFilter: string | null;
  subjectFilter: string | null;
  onDeadlineChange: (v: 'all' | 'today') => void;
  onProjectChange: (v: string | null) => void;
  onSubjectChange: (v: string | null) => void;
}

export function FilterBar({ tasks, deadlineFilter, projectFilter, subjectFilter, onDeadlineChange, onProjectChange, onSubjectChange }: Props) {
  const { settings } = useApp();
  const c = colors[settings.theme];

  const projectsSet = new Set(tasks.map((t) => t.project).filter(Boolean) as string[]);
  const subjectsSet = new Set(tasks.map((t) => t.subject).filter((s) => s.trim()) as string[]);
  const projectsList = Array.from(projectsSet).sort();
  const subjectsList = Array.from(subjectsSet).sort();

  const hasFilters = deadlineFilter !== 'all' || projectFilter || subjectFilter;

  return (
    <div style={{
      display: 'flex', gap: 6, padding: '6px 12px', borderTop: `1px solid ${c.border}`,
      alignItems: 'center', flexWrap: 'wrap',
    }}>
      <button
        onClick={() => onDeadlineChange(deadlineFilter === 'all' ? 'today' : 'all')}
        style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          backgroundColor: deadlineFilter === 'today' ? c.danger : c.card,
          color: deadlineFilter === 'today' ? '#fff' : c.text,
          border: `1px solid ${c.border}`,
        }}
      >
        {deadlineFilter === 'today' ? 'Срочные' : 'Дедлайн'}
      </button>

      {projectsList.length > 0 && (
        <select
          value={projectFilter || ''}
          onChange={(e) => onProjectChange(e.target.value || null)}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 12,
            backgroundColor: projectFilter ? c.primary : c.card,
            color: projectFilter ? '#fff' : c.text,
            border: `1px solid ${c.border}`,
          }}
        >
          <option value="">Проект</option>
          {projectsList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {subjectsList.length > 0 && (
        <select
          value={subjectFilter || ''}
          onChange={(e) => onSubjectChange(e.target.value || null)}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 12,
            backgroundColor: subjectFilter ? c.warning : c.card,
            color: subjectFilter ? '#fff' : c.text,
            border: `1px solid ${c.border}`,
          }}
        >
          <option value="">Человек</option>
          {subjectsList.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {hasFilters && (
        <button
          onClick={() => { onDeadlineChange('all'); onProjectChange(null); onSubjectChange(null); }}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 11,
            color: c.danger, fontWeight: 600,
          }}
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
