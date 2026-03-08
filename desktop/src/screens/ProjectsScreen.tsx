import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

export function ProjectsScreen() {
  const { projects, tasks, addProject, settings } = useApp();
  const c = colors[settings.theme];
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');
  const [showFuture, setShowFuture] = useState(false);

  const taskCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.project && !t.completed) counts[t.project] = (counts[t.project] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const currentProjects = useMemo(() => projects.filter((p) => p.isCurrent), [projects]);
  const futureProjects = useMemo(() => projects.filter((p) => !p.isCurrent), [projects]);

  const handleAdd = (isCurrent: boolean) => {
    if (!newName.trim()) return;
    addProject(newName.trim(), isCurrent);
    setNewName('');
  };

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%', backgroundColor: c.background }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, backgroundColor: c.card, borderRadius: 10, border: `1px solid ${c.border}`, padding: 4 }}>
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="Новый проект..."
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(true); }}
          style={{ flex: 1, padding: '8px 12px', border: 'none', backgroundColor: 'transparent', color: c.text, fontSize: 15, outline: 'none' }}
        />
        <button onClick={() => handleAdd(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, color: '#fff', fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Текущие проекты</h3>
      {currentProjects.length === 0 ? (
        <p style={{ color: c.textSecondary, fontSize: 14, marginBottom: 16 }}>Нет текущих проектов</p>
      ) : (
        currentProjects.map((project) => (
          <div
            key={project.id}
            onClick={() => navigate(`/project/${project.id}`)}
            style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.text, letterSpacing: 0.5 }}>{project.name}</div>
              {project.notes && <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.notes}</div>}
            </div>
            {(taskCountByProject[project.name] ?? 0) > 0 && (
              <div style={{ fontSize: 12, color: c.textSecondary, fontWeight: 600, whiteSpace: 'nowrap' }}>{taskCountByProject[project.name]}</div>
            )}
          </div>
        ))
      )}

      <div onClick={() => setShowFuture(!showFuture)} style={{ cursor: 'pointer', marginTop: 16 }}>
        <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          ЯЯ-ПРОЕКТЫ {showFuture ? '▼' : '▶'}
        </h3>
      </div>

      {showFuture && (
        <>
          {futureProjects.length === 0 ? (
            <p style={{ color: c.textSecondary, fontSize: 14, marginBottom: 16 }}>Нет будущих проектов</p>
          ) : (
            futureProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: c.textSecondary, letterSpacing: 0.5 }}>{project.name}</div>
                {(taskCountByProject[project.name] ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: c.textSecondary, fontWeight: 600, whiteSpace: 'nowrap' }}>{taskCountByProject[project.name]}</div>
                )}
              </div>
            ))
          )}
          <div
            onClick={() => handleAdd(false)}
            style={{ border: `1px dashed ${c.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center', marginTop: 6, cursor: 'pointer' }}
          >
            <span style={{ color: c.textSecondary, fontSize: 14 }}>+ Добавить в ЯЯ-ПРОЕКТЫ</span>
          </div>
        </>
      )}
    </div>
  );
}
