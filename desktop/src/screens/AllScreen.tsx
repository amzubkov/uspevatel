import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { TaskCard } from '../components/TaskCard';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { applyFilters, sortByPriorityDeadline, hideOldCompleted, searchTasks } from '../shared/filters';

export function AllScreen() {
  const { tasks, settings, projects } = useApp();
  const c = colors[settings.theme];
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today'>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = applyFilters(hideOldCompleted(tasks), deadlineFilter, projectFilter, subjectFilter);
    result = searchTasks(result, searchQuery);
    return sortByPriorityDeadline(result);
  }, [tasks, searchQuery, deadlineFilter, projectFilter, subjectFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: c.background }}>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 48 }}>📋</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: c.textSecondary, marginTop: 12 }}>Нет задач</span>
          </div>
        ) : (
          filtered.map((task, index) => (
            <div key={task.id} style={{ backgroundColor: index % 2 === 1 ? c.rowAlt : 'transparent' }}>
              <TaskCard
                task={task}
                showCategory
                onPress={() => navigate(`/task/${task.id}`)}
                onSubjectPress={(s) => navigate(`/subject/${encodeURIComponent(s)}`)}
                onProjectPress={(p) => {
                  const proj = projects.find((pr) => pr.name === p);
                  if (proj) navigate(`/project/${proj.id}`);
                }}
              />
            </div>
          ))
        )}
      </div>
      <FilterBar
        tasks={tasks}
        deadlineFilter={deadlineFilter} projectFilter={projectFilter} subjectFilter={subjectFilter}
        onDeadlineChange={setDeadlineFilter} onProjectChange={setProjectFilter} onSubjectChange={setSubjectFilter}
      />
    </div>
  );
}
