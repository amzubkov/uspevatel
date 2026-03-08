import React, { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';
import { syncLog } from '../shared/syncService';

const APPS_SCRIPT_CODE = `var SHEET_NAME = 'Tasks';
var HEADERS = ['id','subject','action','category','contextCategory','project','notes','startDate','priority','isRecurring','recurDays','completed','completedAt','deadline','createdAt','updatedAt','reminderAt'];
var ROUTINE_SHEET = 'Routine';
var ROUTINE_HEADERS = ['date','itemId','title','completed'];

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateRoutineSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ROUTINE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ROUTINE_SHEET);
    sheet.appendRow(ROUTINE_HEADERS);
    sheet.getRange(1,1,1,ROUTINE_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function doGet() {
  var sheet = getOrCreateSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  var headers = data[0], tasks = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j], key = headers[j];
      if (key === 'isRecurring' || key === 'completed') obj[key] = val === true || val === 'true' || val === 'TRUE';
      else obj[key] = val === '' ? '' : String(val);
    }
    tasks.push(obj);
  }
  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  if (payload.routineLog) {
    var rs = getOrCreateRoutineSheet();
    var entries = payload.routineLog;
    if (entries.length > 0) {
      var date = entries[0].date;
      var data = rs.getDataRange().getValues();
      var rowsToDel = [];
      for (var i = data.length - 1; i >= 1; i--) { if (String(data[i][0]) === date) rowsToDel.push(i + 1); }
      for (var d = 0; d < rowsToDel.length; d++) rs.deleteRow(rowsToDel[d]);
      for (var e2 = 0; e2 < entries.length; e2++) {
        var en = entries[e2];
        rs.appendRow([en.date, en.itemId, en.title, String(en.completed)]);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({status:'ok'})).setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = getOrCreateSheet();
  var upsert = payload.upsert || [], deleteIds = payload.deleteIds || [];
  var data = sheet.getDataRange().getValues(), headers = data[0];
  var idCol = headers.indexOf('id'), idRowMap = {};
  for (var i = 1; i < data.length; i++) if (data[i][idCol]) idRowMap[String(data[i][idCol])] = i + 1;
  var rowsToDelete = [];
  for (var d = 0; d < deleteIds.length; d++) { var dr = idRowMap[String(deleteIds[d])]; if (dr) rowsToDelete.push(dr); }
  rowsToDelete.sort(function(a,b){return b-a});
  for (var r = 0; r < rowsToDelete.length; r++) sheet.deleteRow(rowsToDelete[r]);
  if (rowsToDelete.length > 0) {
    data = sheet.getDataRange().getValues(); idRowMap = {};
    for (var i2 = 1; i2 < data.length; i2++) if (data[i2][idCol]) idRowMap[String(data[i2][idCol])] = i2 + 1;
  }
  for (var u = 0; u < upsert.length; u++) {
    var task = upsert[u], rowValues = [];
    for (var h = 0; h < HEADERS.length; h++) { var val = task[HEADERS[h]]; if (val === null || val === undefined) val = ''; if (typeof val === 'boolean') val = String(val); if (Array.isArray(val)) val = JSON.stringify(val); rowValues.push(val); }
    var existing = idRowMap[String(task.id)];
    if (existing) sheet.getRange(existing,1,1,HEADERS.length).setValues([rowValues]);
    else sheet.appendRow(rowValues);
  }
  return ContentService.createTextOutput(JSON.stringify({status:'ok'})).setMimeType(ContentService.MimeType.JSON);
}`;

export function SettingsScreen() {
  const { tasks, projects, settings, refresh, loading } = useApp();
  const c = colors[settings.theme];

  const [syncUrlInput, setSyncUrlInput] = useState(settings.syncUrl);
  const [showScript, setShowScript] = useState(false);
  const [newContext, setNewContext] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    if (!settings.syncUrl) { setSyncStatus('Укажите URL'); return; }
    setSyncStatus('Загрузка...');
    try {
      await refresh();
      settings.update({ lastSyncAt: new Date().toISOString() });
      setSyncStatus('Синхронизировано');
    } catch (err) {
      setSyncStatus(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [settings, refresh]);

  const handleAddContext = () => {
    const trimmed = newContext.trim();
    if (!trimmed) return;
    if (!settings.addContextCategory(trimmed)) {
      alert(settings.contextCategories.length >= 5 ? 'Максимум 5 контекстных категорий' : 'Уже существует');
      return;
    }
    setNewContext('');
  };

  const handleExport = () => {
    const data = {
      tasks,
      projects,
      settings: {
        contextCategories: settings.contextCategories,
        theme: settings.theme,
        fontSize: settings.fontSize,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uspevatel-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%', backgroundColor: c.background }}>
      <h2 style={{ color: c.text, fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Настройки</h2>

      {/* Font Size */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Размер шрифта: {settings.fontSize}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => settings.update({ fontSize: settings.fontSize - 1 })}
          style={{ width: 48, height: 48, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 18, fontWeight: 700 }}>A-</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: c.text, fontSize: settings.fontSize }}>Пример текста</span>
        </div>
        <button onClick={() => settings.update({ fontSize: settings.fontSize + 1 })}
          style={{ width: 48, height: 48, borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 18, fontWeight: 700 }}>A+</button>
      </div>

      {/* Theme */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Тема</h3>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => settings.update({ theme: 'light' })}
          style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: settings.theme === 'light' ? c.primary : '#E5E7EB', color: settings.theme === 'light' ? '#fff' : c.text, fontWeight: 600, fontSize: 15 }}>
          Светлая
        </button>
        <button onClick={() => settings.update({ theme: 'dark' })}
          style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: settings.theme === 'dark' ? c.primary : '#E5E7EB', color: settings.theme === 'dark' ? '#fff' : c.text, fontWeight: 600, fontSize: 15 }}>
          Тёмная
        </button>
      </div>

      {/* Context Categories */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Контекстные категории</h3>
      <p style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>Максимум 5. Используйте для группировки задач.</p>
      {settings.contextCategories.map((ctx) => (
        <div key={ctx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
          <span style={{ color: c.text, fontSize: 15, fontWeight: 500 }}>\{ctx}</span>
          <button onClick={() => settings.removeContextCategory(ctx)} style={{ color: c.danger, fontSize: 14, fontWeight: 600 }}>Удалить</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          type="text" value={newContext} onChange={(e) => setNewContext(e.target.value)}
          placeholder="обдумывать, прочитать..."
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddContext(); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 15 }}
        />
        <button onClick={handleAddContext}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, color: '#fff', fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      {/* Google Sheets Sync */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Google Sheets</h3>
      <p style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>Прямое подключение к Google Таблице</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text" value={syncUrlInput} onChange={(e) => setSyncUrlInput(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.text, fontSize: 13 }}
        />
        <button onClick={() => { settings.update({ syncUrl: syncUrlInput.trim() }); setSyncStatus('URL сохранён'); }}
          style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: c.primary, color: '#fff', fontWeight: 600, fontSize: 13 }}>
          Сохранить
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, gap: 12 }}>
        <button
          onClick={handleSync}
          disabled={loading || !settings.syncUrl}
          style={{
            flex: 1, padding: 14, borderRadius: 10, backgroundColor: c.primary,
            color: '#fff', fontWeight: 600, fontSize: 16,
            opacity: loading || !settings.syncUrl ? 0.5 : 1,
          }}
        >
          {loading ? 'Загрузка...' : 'Синхронизация'}
        </button>
      </div>

      {settings.lastSyncAt && (
        <p style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>
          Последняя: {new Date(settings.lastSyncAt).toLocaleString()}
        </p>
      )}

      {syncStatus && (
        <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${c.border}` }}>
          <span style={{ color: c.text, fontSize: 13 }}>{syncStatus}</span>
        </div>
      )}

      <button onClick={() => setShowScript(!showScript)} style={{ marginTop: 12, color: c.primary, fontSize: 14, fontWeight: 600 }}>
        {showScript ? '▼ Скрыть инструкцию' : '▶ Как настроить синхронизацию'}
      </button>

      {showScript && (
        <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 12, marginTop: 8, border: `1px solid ${c.border}` }}>
          <p style={{ color: c.text, fontSize: 13, lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-line' }}>
            {'1. Создайте Google Таблицу\n2. Откройте: Расширения → Apps Script\n3. Удалите всё в Code.gs\n4. Вставьте код (кнопка ниже)\n5. Нажмите Развернуть → Новое развёртывание\n6. Тип: Веб-приложение\n   • Выполнять как: Я\n   • Доступ: Все\n7. Нажмите Развернуть, подтвердите\n8. Скопируйте URL и вставьте выше'}
          </p>
          <button onClick={() => { navigator.clipboard.writeText(APPS_SCRIPT_CODE); alert('Код скопирован в буфер обмена'); }}
            style={{ padding: 14, borderRadius: 10, backgroundColor: '#2E7D32', color: '#fff', fontWeight: 600, fontSize: 16, width: '100%' }}>
            Скопировать код скрипта
          </button>
        </div>
      )}

      {/* Data */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Данные</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
        <span style={{ color: c.textSecondary, fontSize: 15 }}>Задач</span>
        <span style={{ color: c.text, fontSize: 15, fontWeight: 600 }}>{tasks.length}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
        <span style={{ color: c.textSecondary, fontSize: 15 }}>Проектов</span>
        <span style={{ color: c.text, fontSize: 15, fontWeight: 600 }}>{projects.length}</span>
      </div>

      <button onClick={handleExport}
        style={{ marginTop: 16, width: '100%', padding: 14, borderRadius: 10, backgroundColor: c.primary, color: '#fff', fontWeight: 600, fontSize: 16 }}>
        Экспортировать данные
      </button>

      <button
        onClick={() => {
          if (window.confirm('Удалить все данные? Это действие нельзя отменить!')) {
            localStorage.clear();
            window.location.reload();
          }
        }}
        style={{ marginTop: 16, width: '100%', padding: 14, color: c.danger, fontSize: 16, fontWeight: 600 }}
      >
        Удалить все данные
      </button>

      {/* Debug Log */}
      <h3 style={{ color: c.text, fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Debug Log</h3>
      <div style={{
        backgroundColor: '#000', color: '#0f0', borderRadius: 8, padding: 12,
        fontSize: 11, fontFamily: 'monospace', maxHeight: 300, overflow: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 40,
      }}>
        {syncLog.length === 0 ? 'No logs yet. Try creating a task or pressing Sync.' : syncLog.join('\n')}
      </div>
    </div>
  );
}
