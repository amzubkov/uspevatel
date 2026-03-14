import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Share, ActivityIndicator, Clipboard, Platform, Linking, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../store/settingsStore';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { colors } from '../utils/theme';
import { fetchRemoteTasks, pushChanges, computeSync, pushRoutineLog } from '../services/syncService';
import { SyncConflictModal } from '../components/SyncConflictModal';
import { useRoutineStore } from '../store/routineStore';
import { Task, SyncConflict } from '../types';
import { getSyncFolder, setSyncFolder, closeDb, getDb, copyDataToSyncFolder } from '../db/database';

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
  const contextCategories = useSettingsStore((s) => s.contextCategories);
  const addContextCategory = useSettingsStore((s) => s.addContextCategory);
  const removeContextCategory = useSettingsStore((s) => s.removeContextCategory);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize) ?? 15;
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const dailyReminderTime = useSettingsStore((s) => s.dailyReminderTime);
  const weeklyReminderTime = useSettingsStore((s) => s.weeklyReminderTime);
  const weeklyReminderDay = useSettingsStore((s) => s.weeklyReminderDay);
  const syncUrl = useSettingsStore((s) => s.syncUrl);
  const setSyncUrl = useSettingsStore((s) => s.setSyncUrl);
  const lastSyncAt = useSettingsStore((s) => s.lastSyncAt);
  const setLastSyncAt = useSettingsStore((s) => s.setLastSyncAt);
  const knownSyncIds = useSettingsStore((s) => s.knownSyncIds);
  const addKnownSyncIds = useSettingsStore((s) => s.addKnownSyncIds);
  const importTask = useTaskStore((s) => s.importTask);
  const c = colors[theme];
  const [newContext, setNewContext] = useState('');
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const routineItems = useRoutineStore((s) => s.items);
  const routineCompleted = useRoutineStore((s) => s.completedToday);

  // Sync folder
  const [syncFolderInput, setSyncFolderInput] = useState(getSyncFolder() || '');
  const [syncFolderStatus, setSyncFolderStatus] = useState<string | null>(null);

  const handleSetSyncFolder = useCallback(async () => {
    const path = syncFolderInput.trim();
    if (!path) {
      await setSyncFolder(null);
      setSyncFolderStatus('Папка сброшена. Перезапустите приложение.');
      return;
    }
    // Request storage permissions on Android < 30
    if (Platform.OS === 'android' && Platform.Version < 30) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setSyncFolderStatus('Нет разрешения на запись');
        return;
      }
    }
    try {
      await closeDb();
      const { copied } = await copyDataToSyncFolder(path);
      await setSyncFolder(path);
      await getDb();
      const info = copied.length ? `\nСкопировано: ${copied.join(', ')}` : '';
      setSyncFolderStatus(`Подключено: ${path}${info}\nПерезапустите приложение для полной синхронизации.`);
    } catch (e: any) {
      setSyncFolderStatus(`Ошибка: ${e?.message || String(e)}`);
    }
  }, [syncFolderInput]);

  // Sync state
  const [syncUrlInput, setSyncUrlInput] = useState(syncUrl);
  const [showScript, setShowScript] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [pendingExport, setPendingExport] = useState<Task[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  const finishSync = useCallback(async (url: string, toExport: Task[], deleteIds: string[], toImport: Task[]) => {
    try {
      if (toExport.length > 0 || deleteIds.length > 0) {
        setSyncStatus('Отправка задач в таблицу...');
        await pushChanges(url, toExport, deleteIds);
      }
      if (routineItems.length > 0) {
        setSyncStatus('Отправка рутины в таблицу...');
        await pushRoutineLog(url, routineItems, routineCompleted);
      }
      for (const t of toImport) importTask(t);
      const allIds = [...tasks.map((t) => t.id), ...toImport.map((t) => t.id)];
      addKnownSyncIds(allIds);
      setLastSyncAt(new Date().toISOString());
      const parts: string[] = [];
      if (toExport.length) parts.push(`${toExport.length} экспорт`);
      if (toImport.length) parts.push(`${toImport.length} импорт`);
      if (deleteIds.length) parts.push(`${deleteIds.length} удалено`);
      if (routineItems.length) parts.push(`${routineItems.length} рутина`);
      setSyncStatus(parts.length ? parts.join(', ') : 'Всё актуально');
    } catch (err) {
      setSyncStatus(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [tasks, importTask, addKnownSyncIds, setLastSyncAt, routineItems, routineCompleted]);

  const handleSync = useCallback(async () => {
    const url = syncUrl.trim();
    if (!url) { setSyncStatus('Укажите URL'); return; }
    setSyncing(true);
    setSyncStatus('Загрузка из таблицы...');
    try {
      const remote = await fetchRemoteTasks(url);
      setSyncStatus(`Получено ${remote.length}. Сравнение...`);
      const result = computeSync(tasks, remote, knownSyncIds);
      if (result.conflicts.length > 0) {
        setPendingExport([...result.toExport]);
        setPendingDeleteIds([...result.toDeleteFromSheet]);
        setConflicts(result.conflicts);
        setConflictIndex(0);
        setSyncing(false);
        setSyncStatus(`${result.toExport.length} экспорт, ${result.toImport.length} импорт, ${result.conflicts.length} конфликтов`);
        for (const t of result.toImport) importTask(t);
        addKnownSyncIds([...result.toImport.map((t) => t.id), ...result.toExport.map((t) => t.id)]);
        return;
      }
      await finishSync(url, result.toExport, result.toDeleteFromSheet, result.toImport);
    } catch (err) {
      setSyncStatus(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
      setSyncing(false);
    }
  }, [syncUrl, tasks, knownSyncIds, addKnownSyncIds, importTask, finishSync]);

  const advanceConflict = useCallback(() => {
    setConflictIndex((prev) => {
      const next = prev + 1;
      if (next >= conflicts.length) {
        setSyncing(true);
        finishSync(syncUrl.trim(), pendingExport, pendingDeleteIds, []);
        setConflicts([]);
        return 0;
      }
      return next;
    });
  }, [conflicts.length, syncUrl, pendingExport, pendingDeleteIds, finishSync]);

  const handleKeepLocal = useCallback((conflict: SyncConflict) => {
    setPendingExport((prev) => [...prev, conflict.localTask]);
    advanceConflict();
  }, [advanceConflict]);

  const handleTakeRemote = useCallback((conflict: SyncConflict) => {
    importTask(conflict.remoteTask);
    advanceConflict();
  }, [importTask, advanceConflict]);

  const handleAddContext = () => {
    const trimmed = newContext.trim();
    if (!trimmed) return;
    if (!addContextCategory(trimmed)) {
      Alert.alert('Ошибка', contextCategories.length >= 5 ? 'Максимум 5 контекстных категорий' : 'Уже существует');
      return;
    }
    setNewContext('');
  };

  const handleExport = async () => {
    const data = {
      tasks,
      projects,
      settings: {
        contextCategories,
        dailyReminderTime,
        weeklyReminderTime,
        weeklyReminderDay,
        theme,
        fontSize,
      },
    };
    await Share.share({ message: JSON.stringify(data, null, 2) });
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>Настройки</Text>

      {/* Font Size */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>Размер шрифта: {fontSize}</Text>
      <View style={styles.fontSizeRow}>
        <TouchableOpacity
          style={[styles.fontBtn, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => setFontSize(fontSize - 1)}
        >
          <Text style={[styles.fontBtnText, { color: c.text }]}>A-</Text>
        </TouchableOpacity>
        <View style={styles.fontPreview}>
          <Text style={[{ color: c.text, fontSize }]}>Пример текста</Text>
        </View>
        <TouchableOpacity
          style={[styles.fontBtn, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => setFontSize(fontSize + 1)}
        >
          <Text style={[styles.fontBtnText, { color: c.text }]}>A+</Text>
        </TouchableOpacity>
      </View>

      {/* Theme */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>Тема</Text>
      <View style={styles.themeRow}>
        <TouchableOpacity
          style={[styles.themeBtn, theme === 'light' && { backgroundColor: c.primary }]}
          onPress={() => setTheme('light')}
        >
          <Text style={[styles.themeBtnText, { color: theme === 'light' ? '#FFF' : c.text }]}>☀️ Светлая</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.themeBtn, theme === 'dark' && { backgroundColor: c.primary }]}
          onPress={() => setTheme('dark')}
        >
          <Text style={[styles.themeBtnText, { color: theme === 'dark' ? '#FFF' : c.text }]}>🌙 Тёмная</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Folder */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>Папка синхронизации</Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Путь к папке Dropbox для синхронизации с десктопом.{'\n'}
        Напр. /storage/emulated/0/Documents/uspevatel
      </Text>
      <View style={styles.addContextRow}>
        <TextInput
          style={[styles.addContextInput, { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13 }]}
          value={syncFolderInput}
          onChangeText={setSyncFolderInput}
          placeholder="/storage/emulated/0/Documents/uspevatel"
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: syncFolderInput.trim() ? c.primary : c.textSecondary, marginTop: 8 }]}
        onPress={handleSetSyncFolder}
      >
        <Text style={styles.exportBtnText}>{syncFolderInput.trim() ? 'Установить папку' : 'Сбросить папку'}</Text>
      </TouchableOpacity>
      {syncFolderStatus && (
        <View style={[{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 13 }}>{syncFolderStatus}</Text>
        </View>
      )}

      {/* Context Categories */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>Контекстные категории</Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>Максимум 5. Используйте для группировки задач.</Text>
      {contextCategories.map((ctx) => (
        <View key={ctx} style={[styles.contextRow, { borderColor: c.border }]}>
          <Text style={[styles.contextName, { color: c.text }]}>\{ctx}</Text>
          <TouchableOpacity onPress={() => removeContextCategory(ctx)}>
            <Text style={[styles.removeBtn, { color: c.danger }]}>Удалить</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.addContextRow}>
        <TextInput
          style={[styles.addContextInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
          value={newContext}
          onChangeText={setNewContext}
          placeholder="обдумывать, прочитать..."
          placeholderTextColor={c.textSecondary}
          onSubmitEditing={handleAddContext}
        />
        <TouchableOpacity style={[styles.addContextBtn, { backgroundColor: c.primary }]} onPress={handleAddContext}>
          <Text style={styles.addContextBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Google Sheets Sync */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>Google Sheets</Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Двусторонняя синхронизация задач с Google Таблицей
      </Text>
      <View style={styles.addContextRow}>
        <TextInput
          style={[styles.addContextInput, { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13 }]}
          value={syncUrlInput}
          onChangeText={setSyncUrlInput}
          placeholder="https://script.google.com/macros/s/.../exec"
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.addContextBtn, { backgroundColor: c.primary, width: 80, borderRadius: 8 }]}
          onPress={() => { setSyncUrl(syncUrlInput.trim()); setSyncStatus('URL сохранён'); }}
        >
          <Text style={[styles.addContextBtnText, { fontSize: 13 }]}>Сохранить</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
        <TouchableOpacity
          style={[styles.exportBtn, { opacity: syncing || !syncUrl ? 0.5 : 1, marginTop: 0, flex: 1 }]}
          onPress={handleSync}
          disabled={syncing || !syncUrl}
        >
          {syncing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.exportBtnText}>Синхронизация</Text>
          )}
        </TouchableOpacity>
      </View>
      {lastSyncAt && (
        <Text style={[styles.hint, { color: c.textSecondary, marginTop: 6 }]}>
          Последняя: {new Date(lastSyncAt).toLocaleString()}
        </Text>
      )}
      {syncStatus && (
        <View style={[{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 13 }}>{syncStatus}</Text>
        </View>
      )}

      {/* Setup instructions */}
      <TouchableOpacity
        style={{ marginTop: 12 }}
        onPress={() => setShowScript(!showScript)}
      >
        <Text style={{ color: c.primary, fontSize: 14, fontWeight: '600' }}>
          {showScript ? '▼ Скрыть инструкцию' : '▶ Как настроить синхронизацию'}
        </Text>
      </TouchableOpacity>
      {showScript && (
        <View style={[{ backgroundColor: c.card, borderRadius: 8, padding: 12, marginTop: 8, borderWidth: 1, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 13, lineHeight: 20, marginBottom: 8 }}>
            {'1. Создайте Google Таблицу\n2. Откройте: Расширения → Apps Script\n3. Удалите всё в Code.gs\n4. Вставьте код (кнопка ниже)\n5. Нажмите Развернуть → Новое развёртывание\n6. Тип: Веб-приложение\n   • Выполнять как: Я\n   • Доступ: Все\n7. Нажмите Развернуть, подтвердите\n8. Скопируйте URL и вставьте выше'}
          </Text>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: '#2E7D32', marginTop: 4 }]}
            onPress={() => {
              Clipboard.setString(APPS_SCRIPT_CODE);
              Alert.alert('Скопировано', 'Код скрипта скопирован в буфер обмена. Вставьте его в Apps Script.');
            }}
          >
            <Text style={styles.exportBtnText}>Скопировать код скрипта</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Data */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>Данные</Text>
      <View style={[styles.infoRow, { borderColor: c.border }]}>
        <Text style={[styles.infoLabel, { color: c.textSecondary }]}>Задач</Text>
        <Text style={[styles.infoValue, { color: c.text }]}>{tasks.length}</Text>
      </View>
      <View style={[styles.infoRow, { borderColor: c.border }]}>
        <Text style={[styles.infoLabel, { color: c.textSecondary }]}>Проектов</Text>
        <Text style={[styles.infoValue, { color: c.text }]}>{projects.length}</Text>
      </View>

      <TouchableOpacity style={[styles.exportBtn, { backgroundColor: c.primary }]} onPress={handleExport}>
        <Text style={styles.exportBtnText}>Экспортировать данные</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.dangerBtn]}
        onPress={() =>
          Alert.alert('Удалить все данные?', 'Это действие нельзя отменить!', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить',
              style: 'destructive',
              onPress: async () => {
                await AsyncStorage.clear();
                Alert.alert('Готово', 'Перезапустите приложение');
              },
            },
          ])
        }
      >
        <Text style={[styles.dangerBtnText, { color: c.danger }]}>Удалить все данные</Text>
      </TouchableOpacity>

      {conflicts.length > 0 && (
        <SyncConflictModal
          conflicts={conflicts}
          currentIndex={conflictIndex}
          onKeepLocal={handleKeepLocal}
          onTakeRemote={handleTakeRemote}
          onClose={() => { setConflicts([]); setSyncStatus('Синхронизация отменена'); }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 13, marginBottom: 8 },
  fontSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fontBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fontBtnText: { fontSize: 18, fontWeight: '700' },
  fontPreview: { flex: 1, alignItems: 'center' },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  contextName: { fontSize: 15, fontWeight: '500' },
  removeBtn: { fontSize: 14, fontWeight: '600' },
  addContextRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  addContextInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  addContextBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addContextBtnText: { color: '#FFF', fontSize: 20, fontWeight: '600' },
  themeRow: { flexDirection: 'row', gap: 12 },
  themeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#E5E7EB' },
  themeBtnText: { fontSize: 15, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15, fontWeight: '600' },
  exportBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  exportBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  dangerBtn: { marginTop: 16, marginBottom: 40, paddingVertical: 14, alignItems: 'center' },
  dangerBtnText: { fontSize: 16, fontWeight: '600' },
});
