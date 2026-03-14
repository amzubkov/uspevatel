import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { DatabaseProvider } from './context/DatabaseContext';
import { Sidebar } from './components/Sidebar';
import { InboxScreen } from './screens/InboxScreen';
import { DayScreen } from './screens/DayScreen';
import { LaterScreen } from './screens/LaterScreen';
import { ControlScreen } from './screens/ControlScreen';
import { MaybeScreen } from './screens/MaybeScreen';
import { AllScreen } from './screens/AllScreen';
import { AddTaskScreen } from './screens/AddTaskScreen';
import { TaskDetailScreen } from './screens/TaskDetailScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectDetailScreen } from './screens/ProjectDetailScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SportScreen } from './screens/SportScreen';
import { ExercisesScreen } from './screens/ExercisesScreen';
import { ExerciseDetailScreen } from './screens/ExerciseDetailScreen';
import { FlightsScreen } from './screens/FlightsScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { ChecklistScreen } from './screens/ChecklistScreen';

export default function App() {
  return (
    <AppProvider>
      <DatabaseProvider>
      <HashRouter>
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
          <Sidebar />
          <main style={{ flex: 1, overflow: 'hidden' }}>
            <Routes>
              <Route path="/" element={<InboxScreen />} />
              <Route path="/day" element={<DayScreen />} />
              <Route path="/later" element={<LaterScreen />} />
              <Route path="/control" element={<ControlScreen />} />
              <Route path="/maybe" element={<MaybeScreen />} />
              <Route path="/all" element={<AllScreen />} />
              <Route path="/add" element={<AddTaskScreen />} />
              <Route path="/task/:taskId" element={<TaskDetailScreen />} />
              <Route path="/projects" element={<ProjectsScreen />} />
              <Route path="/project/:projectId" element={<ProjectDetailScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/sport" element={<SportScreen />} />
              <Route path="/exercises" element={<ExercisesScreen />} />
              <Route path="/exercise/:exerciseId" element={<ExerciseDetailScreen />} />
              <Route path="/flights" element={<FlightsScreen />} />
              <Route path="/routine" element={<RoutineScreen />} />
              <Route path="/checklist" element={<ChecklistScreen />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
      </DatabaseProvider>
    </AppProvider>
  );
}
