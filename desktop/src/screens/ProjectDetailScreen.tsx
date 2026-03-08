import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { TaskCard } from '../components/TaskCard';
import { QuickAddBar } from '../components/QuickAddBar';

export function ProjectDetailScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, updateProject, deleteProject, toggleProjectCurrent, tasks, addTask, settings } = useApp();
  const c = colors[settings.theme];

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const projectName = project?.name || '';
  const projectTasks = useMemo(() => tasks.filter((t) => t.project === projectName), [tasks, projectName]);
  const [notes, setNotes] = useState(project?.notes || '');

  if (!project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: c.background }}>
        <span style={{ color: c.textSecondary }}>Проект не найден</span>
      </div>
    );
  }

  const activeTasks = projectTasks.filter((t) => !t.completed);
  const completedTasks = projectTasks.filter((t) => t.completed);

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%', backgroundColor: c.background }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: c.text, fontSize: 24, fontWeight: 800, letterSpacing: 0.5 }}>{project.name}</h2>
        <button
          onClick={() => toggleProjectCurrent(projectId!)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            backgroundColor: project.isCurrent ? c.successLight : c.border,
            color: project.isCurrent ? c.success : c.textSecondary,
          }}
        >
          {project.isCurrent ? 'Текущий' : 'ЯЯ-проект'}
        </button>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => updateProject(projectId!, { notes })}
        placeholder="Заметки к проекту..."
        style={{
          width: '100%', padding: 12, borderRadius: 10,
          border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text,
          fontSize: 14, minHeight: 60, resize: 'vertical', marginBottom: 16,
        }}
      />

      <QuickAddBar
        placeholder={`Новая задача в ${projectName}...`}
        onAdd={(action) => addTask({ subject: '', action, category: 'IN', notes: '', priority: 'normal', isRecurring: false, project: projectName })}
      />

      <div style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, marginTop: 8, marginBottom: 4, textTransform: 'uppercase' }}>
        Активные задачи ({activeTasks.length})
      </div>

      {activeTasks.length === 0 ? (
        <p style={{ fontSize: 14, textAlign: 'center', color: c.textSecondary, padding: 16 }}>Нет активных задач</p>
      ) : (
        activeTasks.map((task, index) => (
          <div key={task.id} style={{ backgroundColor: index % 2 === 1 ? c.rowAlt : 'transparent' }}>
            <TaskCard
              task={task}
              showCategory
              onPress={() => navigate(`/task/${task.id}`)}
              onSubjectPress={(s) => navigate(`/subject/${encodeURIComponent(s)}`)}
            />
          </div>
        ))
      )}

      {completedTasks.length > 0 && (
        <div style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, marginTop: 8, marginBottom: 4, textTransform: 'uppercase' }}>
          Выполнено ({completedTasks.length})
        </div>
      )}

      <button
        onClick={() => {
          if (window.confirm('Удалить проект? Задачи проекта останутся')) {
            deleteProject(projectId!);
            navigate('/projects');
          }
        }}
        style={{ marginTop: 24, marginBottom: 40, width: '100%', padding: 14, color: c.danger, fontSize: 16, fontWeight: 600 }}
      >
        Удалить проект
      </button>
    </div>
  );
}
