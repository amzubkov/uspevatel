import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
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

export default function App() {
  return (
    <AppProvider>
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
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppProvider>
  );
}
