import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

const NAV_ITEMS = [
  { path: '/', label: 'IN', icon: '📥', color: '#EF4444' },
  { path: '/day', label: 'DAY', icon: '☀️', color: '#F59E0B' },
  { path: '/later', label: 'LATER', icon: '📋', color: '#3B82F6' },
  { path: '/control', label: 'CTRL', icon: '👁', color: '#8B5CF6' },
  { path: '/maybe', label: 'MAYBE', icon: '💭', color: '#6B7280' },
  { path: '/all', label: 'ALL', icon: '📑', color: '#666' },
  { divider: true } as any,
  { path: '/projects', label: 'Проекты', icon: '📂', color: '#2563EB' },
  { path: '/add', label: 'Добавить', icon: '➕', color: '#16A34A' },
  { divider: true } as any,
  { path: '/settings', label: 'Настройки', icon: '⚙️', color: '#666' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, tasks, loading } = useApp();
  const c = colors[settings.theme];

  // Count tasks per category
  const counts: Record<string, number> = {
    '/': tasks.filter((t) => t.category === 'IN' && !t.completed).length,
    '/day': tasks.filter((t) => t.category === 'DAY' && !t.completed).length,
    '/later': tasks.filter((t) => t.category === 'LATER' && !t.completed).length,
    '/control': tasks.filter((t) => t.category === 'CONTROL' && !t.completed).length,
    '/maybe': tasks.filter((t) => t.category === 'MAYBE' && !t.completed).length,
    '/all': tasks.length,
  };

  return (
    <div style={{
      width: 200, backgroundColor: c.card, borderRight: `1px solid ${c.border}`,
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0,
      overflow: 'auto',
    }}>
      <div style={{
        padding: '16px 12px 8px', fontWeight: 800, fontSize: 18,
        color: c.text, letterSpacing: 0.5,
      }}>
        Успеватель
      </div>

      {loading && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: c.warning }}>
          Загрузка...
        </div>
      )}

      <nav style={{ flex: 1, padding: '4px 0' }}>
        {NAV_ITEMS.map((item, i) => {
          if (item.divider) {
            return <div key={i} style={{ height: 1, backgroundColor: c.border, margin: '8px 12px' }} />;
          }
          const isActive = location.pathname === item.path;
          const count = counts[item.path];
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 12px', textAlign: 'left',
                backgroundColor: isActive ? c.primaryLight : 'transparent',
                color: isActive ? c.primary : c.text,
                fontWeight: isActive ? 700 : 500, fontSize: 14,
                borderRadius: 0,
                borderLeft: isActive ? `3px solid ${item.color}` : '3px solid transparent',
              }}
            >
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {count !== undefined && count > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: c.textSecondary,
                  backgroundColor: c.border, borderRadius: 10,
                  padding: '1px 6px', minWidth: 20, textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{
        padding: '8px 12px', fontSize: 11, color: c.textSecondary,
        borderTop: `1px solid ${c.border}`,
      }}>
        {settings.syncUrl ? 'Синхронизация настроена' : 'Нет подключения'}
      </div>
    </div>
  );
}
