import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { TaskCard } from '../components/TaskCard';
import { QuickAddBar } from '../components/QuickAddBar';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { applyFilters, sortByPriorityDeadline, hideOldCompleted, searchTasks } from '../shared/filters';

export function DayScreen() {
  const { tasks, addTask, moveTask, completeTask, uncompleteTask, settings, projects } = useApp();
  const c = colors[settings.theme];
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const categoryTasks = useMemo(() => hideOldCompleted(tasks.filter((t) => t.category === 'DAY')), [tasks]);

  const dayTasks = useMemo(() => {
    let result = applyFilters(categoryTasks, deadlineFilter, projectFilter, subjectFilter);
    return searchTasks(result, searchQuery);
  }, [categoryTasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  const urgent = sortByPriorityDeadline(dayTasks.filter((t) => t.startDate && !t.completed));
  const normal = sortByPriorityDeadline(dayTasks.filter((t) => !t.startDate && !t.completed));
  const completed = dayTasks.filter((t) => t.completed);

  const sections = [
    ...(urgent.length > 0 ? [{ title: 'Срочные', data: urgent }] : []),
    ...(normal.length > 0 ? [{ title: 'Действия на сегодня', data: normal }] : []),
    ...(completed.length > 0 ? [{ title: 'Выполнено', data: completed }] : []),
  ];

  let globalIndex = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: c.background }}>
      <QuickAddBar
        placeholder="Добавить в DAY..."
        onAdd={(action) => addTask({ subject: '', action, category: 'DAY', notes: '', priority: 'normal', isRecurring: false })}
      />
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sections.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 48 }}>☀️</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: c.textSecondary, marginTop: 12 }}>Нет задач на сегодня</span>
            <span style={{ fontSize: 14, color: c.textSecondary, marginTop: 4 }}>Переместите задачи из IN или LATER</span>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: c.textSecondary,
                padding: '12px 16px 4px', textTransform: 'uppercase',
                backgroundColor: c.background,
              }}>
                {section.title}
              </div>
              {section.data.map((task) => {
                const idx = globalIndex++;
                return (
                  <div key={task.id} style={{ backgroundColor: idx % 2 === 1 ? c.rowAlt : 'transparent' }}>
                    <TaskCard
                      task={task}
                      onPress={() => navigate(`/task/${task.id}`)}
                      onComplete={() => task.completed ? uncompleteTask(task.id) : completeTask(task.id)}
                      onSubjectPress={(s) => navigate(`/subject/${encodeURIComponent(s)}`)}
                      onProjectPress={(p) => {
                        const proj = projects.find((pr) => pr.name === p);
                        if (proj) navigate(`/project/${proj.id}`);
                      }}
                      actions={[
                        { label: 'LATER', color: '#3B82F6', onClick: () => moveTask(task.id, 'LATER') },
                        { label: 'CTRL', color: '#8B5CF6', onClick: () => moveTask(task.id, 'CONTROL') },
                      ]}
                    />
                  </div>
                );
              })}
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
