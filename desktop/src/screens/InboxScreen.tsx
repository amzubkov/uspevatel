import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { TaskCard } from '../components/TaskCard';
import { QuickAddBar } from '../components/QuickAddBar';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { applyFilters, sortByPriorityDeadline, searchTasks } from '../shared/filters';

export function InboxScreen() {
  const { tasks, addTask, moveTask, deleteTask, settings, projects } = useApp();
  const c = colors[settings.theme];
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const categoryTasks = useMemo(() => tasks.filter((t) => t.category === 'IN' && !t.completed), [tasks]);

  const filtered = useMemo(() => {
    let result = applyFilters(categoryTasks, deadlineFilter, projectFilter, subjectFilter);
    result = searchTasks(result, searchQuery);
    return sortByPriorityDeadline(result);
  }, [categoryTasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: c.background }}>
      <QuickAddBar
        placeholder="Новая запись в Inbox..."
        onAdd={(action) => addTask({ subject: '', action, category: 'IN', notes: '', priority: 'normal', isRecurring: false })}
      />
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 48 }}>📥</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: c.textSecondary, marginTop: 12 }}>Inbox пуст</span>
          </div>
        ) : (
          filtered.map((task, index) => (
            <div key={task.id} style={{ backgroundColor: index % 2 === 1 ? c.rowAlt : 'transparent' }}>
              <TaskCard
                task={task}
                onPress={() => navigate(`/task/${task.id}`)}
                onSubjectPress={(s) => navigate(`/subject/${encodeURIComponent(s)}`)}
                onProjectPress={(p) => {
                  const proj = projects.find((pr) => pr.name === p);
                  if (proj) navigate(`/project/${proj.id}`);
                }}
                actions={[
                  { label: 'DAY', color: '#F59E0B', onClick: () => moveTask(task.id, 'DAY') },
                  { label: 'LATER', color: '#3B82F6', onClick: () => moveTask(task.id, 'LATER') },
                  { label: 'CTRL', color: '#8B5CF6', onClick: () => moveTask(task.id, 'CONTROL') },
                  { label: 'DEL', color: '#DC2626', onClick: () => deleteTask(task.id) },
                ]}
              />
            </div>
          ))
        )}
      </div>
      <FilterBar
        tasks={categoryTasks}
        deadlineFilter={deadlineFilter} projectFilter={projectFilter} subjectFilter={subjectFilter}
        onDeadlineChange={setDeadlineFilter} onProjectChange={setProjectFilter} onSubjectChange={setSubjectFilter}
      />
    </div>
  );
}
