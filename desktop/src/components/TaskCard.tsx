import React from 'react';
import { Task, CATEGORY_SHORT } from '../shared/types';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

interface Props {
  task: Task;
  onPress: () => void;
  onComplete?: () => void;
  showCategory?: boolean;
  onSubjectPress?: (subject: string) => void;
  onProjectPress?: (project: string) => void;
  actions?: { label: string; color: string; onClick: () => void }[];
}

export function TaskCard({ task, onPress, onComplete, showCategory, onSubjectPress, onProjectPress, actions }: Props) {
  const { settings } = useApp();
  const c = colors[settings.theme];
  const fs = settings.fontSize;
  const smallFs = Math.max(fs - 4, 10);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', padding: '6px 12px',
        cursor: 'pointer', position: 'relative',
        gap: 8,
      }}
      className="task-card"
      onClick={onPress}
    >
      {onComplete && (
        <div
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          style={{
            width: 22, height: 22, borderRadius: 11,
            border: `2px solid ${task.completed ? c.success : c.textSecondary}`,
            backgroundColor: task.completed ? c.success : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          {task.completed && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {showCategory && (
            <span style={{ fontSize: smallFs, fontWeight: 600, color: c.primary }}>
              [{CATEGORY_SHORT[task.category]}]
            </span>
          )}
          {task.priority === 'high' && (
            <span style={{ color: '#DC2626', fontSize: smallFs }}>●</span>
          )}
          {task.deadline && (
            <span style={{ color: c.danger, fontSize: smallFs, fontWeight: 600 }}>
              {formatDate(task.deadline)}
            </span>
          )}
          {task.project && (
            <span
              style={{ color: c.primary, fontSize: smallFs, fontWeight: 600, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onProjectPress?.(task.project!); }}
            >
              {task.project}
            </span>
          )}
          {task.subject && (
            <span
              style={{ color: c.textSecondary, fontSize: smallFs, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onSubjectPress?.(task.subject); }}
            >
              {task.subject}
            </span>
          )}
          <span style={{
            fontSize: fs, fontWeight: 600, color: c.text,
            opacity: task.completed ? 0.5 : 1,
            textDecoration: task.completed ? 'line-through' : 'none',
          }}>
            {task.action}
          </span>
        </div>

        {(task.contextCategory || task.startDate) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {task.contextCategory && (
              <span style={{ fontSize: smallFs, color: c.warning, fontWeight: 500 }}>
                \{task.contextCategory}
              </span>
            )}
            {task.startDate && (
              <span style={{ fontSize: smallFs, color: c.textSecondary }}>
                {formatDate(task.startDate)}
              </span>
            )}
          </div>
        )}
      </div>

      {actions && actions.length > 0 && (
        <div className="task-actions" style={{ display: 'flex', gap: 4, opacity: 0 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              style={{
                padding: '4px 8px', borderRadius: 4, fontSize: 11,
                fontWeight: 600, color: '#fff', backgroundColor: a.color,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
