import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StorageAccessFramework } from "expo-file-system/legacy";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { useProjectStore } from "../store/projectStore";
import { colors } from "../utils/theme";
import { useRoutineStore } from "../store/routineStore";
import { getSyncFolder, setSyncFolder, getDb } from "../db/database";
import { validateToken } from "../services/telegramService";

export function SettingsScreen() {
  const contextCategories = useSettingsStore((s) => s.contextCategories);
  const addContextCategory = useSettingsStore((s) => s.addContextCategory);
  const removeContextCategory = useSettingsStore(
    (s) => s.removeContextCategory,
  );
  const setTheme = useSettingsStore((s) => s.setTheme);
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize) ?? 15;
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const c = colors[theme];
  const [newContext, setNewContext] = useState("");
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);

  // Telegram bot
  const [tgToken, setTgToken] = useState("");
  const [tgStatus, setTgStatus] = useState<string | null>(null);
  const [tgSaving, setTgSaving] = useState(false);

  // Load saved token on mount
  React.useEffect(() => {
    (async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['tgBotToken']);
      if (row?.value) setTgToken(row.value);
    })();
  }, []);

  const handleSaveTgToken = useCallback(async () => {
    const token = tgToken.trim();
    setTgSaving(true);
    try {
      const db = await getDb();
      if (!token) {
        await db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', ['tgBotToken', 'tgUpdateOffset']);
        setTgStatus('Токен удалён');
        setTgSaving(false);
        return;
      }
      const botName = await validateToken(token);
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['tgBotToken', token]);
      setTgStatus(`Подключён: ${botName}`);
    } catch (e: any) {
      setTgStatus(String(e?.message || e));
    }
    setTgSaving(false);
  }, [tgToken]);

  // Sync folder
  const [syncFolderInput, setSyncFolderInput] = useState(getSyncFolder() || "");
  const [syncFolderStatus, setSyncFolderStatus] = useState<string | null>(null);

  const handlePickAndroidSyncFolder = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const permission =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted || !permission.directoryUri) {
        setSyncFolderStatus("Выбор папки отменён");
        return;
      }
      // Convert SAF content:// URI to real path
      const uri = permission.directoryUri;
      const match =
        uri.match(/\/tree\/([^/]+)/) || uri.match(/\/document\/([^/]+)/);
      let realPath: string | null = null;
      if (match?.[1]) {
        const decoded = decodeURIComponent(match[1]);
        const colonIndex = decoded.indexOf(":");
        if (colonIndex >= 0) {
          const volume = decoded.slice(0, colonIndex);
          const relative = decoded.slice(colonIndex + 1).replace(/^\/+/, "");
          const prefix =
            volume === "primary" ? "/storage/emulated/0" : `/storage/${volume}`;
          realPath = relative ? `${prefix}/${relative}` : prefix;
        }
      }
      if (!realPath) {
        setSyncFolderStatus(`Не удалось определить путь из URI:\n${uri}`);
        return;
      }
      await setSyncFolder(realPath);
      setSyncFolderInput(realPath);
      setSyncFolderStatus(
        `Папка сохранена: ${realPath}\nСинхронизация через папку временно отключена в этой сборке.`,
      );
    } catch (e: any) {
      setSyncFolderStatus(`Ошибка: ${e?.message || String(e)}`);
    }
  }, []);

  const handleSetSyncFolder = useCallback(async () => {
    const path = syncFolderInput.trim();
    if (!path) {
      await setSyncFolder(null);
      setSyncFolderStatus("Папка сброшена.");
      return;
    }
    try {
      await setSyncFolder(path);
      setSyncFolderStatus(
        `Папка сохранена: ${path}\nСинхронизация через папку временно отключена в этой сборке.`,
      );
    } catch (e: any) {
      setSyncFolderStatus(`Ошибка: ${e?.message || String(e)}`);
    }
  }, [syncFolderInput]);

  const handleAddContext = () => {
    const trimmed = newContext.trim();
    if (!trimmed) return;
    if (!addContextCategory(trimmed)) {
      Alert.alert(
        "Ошибка",
        contextCategories.length >= 5
          ? "Максимум 5 контекстных категорий"
          : "Уже существует",
      );
      return;
    }
    setNewContext("");
  };

  const handleExport = async () => {
    const data = {
      tasks,
      projects,
      settings: {
        contextCategories,
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
      <Text style={[styles.sectionTitle, { color: c.text }]}>
        Размер шрифта: {fontSize}
      </Text>
      <View style={styles.fontSizeRow}>
        <TouchableOpacity
          style={[
            styles.fontBtn,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
          onPress={() => setFontSize(fontSize - 1)}
        >
          <Text style={[styles.fontBtnText, { color: c.text }]}>A-</Text>
        </TouchableOpacity>
        <View style={styles.fontPreview}>
          <Text style={[{ color: c.text, fontSize }]}>Пример текста</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.fontBtn,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
          onPress={() => setFontSize(fontSize + 1)}
        >
          <Text style={[styles.fontBtnText, { color: c.text }]}>A+</Text>
        </TouchableOpacity>
      </View>

      {/* Theme */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Тема
      </Text>
      <View style={styles.themeRow}>
        <TouchableOpacity
          style={[
            styles.themeBtn,
            theme === "light" && { backgroundColor: c.primary },
          ]}
          onPress={() => setTheme("light")}
        >
          <Text
            style={[
              styles.themeBtnText,
              { color: theme === "light" ? "#FFF" : c.text },
            ]}
          >
            Светлая
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.themeBtn,
            theme === "dark" && { backgroundColor: c.primary },
          ]}
          onPress={() => setTheme("dark")}
        >
          <Text
            style={[
              styles.themeBtnText,
              { color: theme === "dark" ? "#FFF" : c.text },
            ]}
          >
            Тёмная
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sync Folder */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Папка синхронизации
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Путь к папке можно сохранить, но синхронизация через папку сейчас
        временно отключена.
      </Text>
      {Platform.OS === "android" && (
        <TouchableOpacity
          style={[
            styles.exportBtn,
            { backgroundColor: c.primary, marginTop: 8 },
          ]}
          onPress={handlePickAndroidSyncFolder}
        >
          <Text style={styles.exportBtnText}>Выбрать папку</Text>
        </TouchableOpacity>
      )}
      <View style={styles.addContextRow}>
        <TextInput
          style={[
            styles.addContextInput,
            {
              color: c.text,
              backgroundColor: c.card,
              borderColor: c.border,
              fontSize: 13,
            },
          ]}
          value={syncFolderInput}
          onChangeText={setSyncFolderInput}
          placeholder="/storage/emulated/0/Documents/uspevatel"
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <TouchableOpacity
        style={[
          styles.exportBtn,
          {
            backgroundColor: syncFolderInput.trim()
              ? c.primary
              : c.textSecondary,
            marginTop: 8,
          },
        ]}
        onPress={handleSetSyncFolder}
      >
        <Text style={styles.exportBtnText}>
          {syncFolderInput.trim() ? "Подключить этот путь" : "Сбросить папку"}
        </Text>
      </TouchableOpacity>
      {syncFolderStatus && (
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: 8,
              padding: 10,
              marginTop: 8,
              borderWidth: 1,
              borderColor: c.border,
            },
          ]}
        >
          <Text style={{ color: c.text, fontSize: 13 }}>
            {syncFolderStatus}
          </Text>
        </View>
      )}

      {/* Context Categories */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Контекстные категории
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Максимум 5. Используйте для группировки задач.
      </Text>
      {contextCategories.map((ctx) => (
        <View key={ctx} style={[styles.contextRow, { borderColor: c.border }]}>
          <Text style={[styles.contextName, { color: c.text }]}>{ctx}</Text>
          <TouchableOpacity onPress={() => removeContextCategory(ctx)}>
            <Text style={[styles.removeBtn, { color: c.danger }]}>Удалить</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.addContextRow}>
        <TextInput
          style={[
            styles.addContextInput,
            { color: c.text, backgroundColor: c.card, borderColor: c.border },
          ]}
          value={newContext}
          onChangeText={setNewContext}
          placeholder="обдумывать, прочитать..."
          placeholderTextColor={c.textSecondary}
          onSubmitEditing={handleAddContext}
        />
        <TouchableOpacity
          style={[styles.addContextBtn, { backgroundColor: c.primary }]}
          onPress={handleAddContext}
        >
          <Text style={styles.addContextBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Telegram Bot */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Telegram бот
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Токен от @BotFather. Добавьте бота в канал, пишите /task или /flight.
      </Text>
      <View style={styles.addContextRow}>
        <TextInput
          style={[
            styles.addContextInput,
            { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13 },
          ]}
          value={tgToken}
          onChangeText={setTgToken}
          placeholder="123456:ABC-DEF..."
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>
      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: c.primary, marginTop: 8 }]}
        onPress={handleSaveTgToken}
        disabled={tgSaving}
      >
        <Text style={styles.exportBtnText}>
          {tgSaving ? '...' : tgToken.trim() ? 'Проверить и сохранить' : 'Удалить токен'}
        </Text>
      </TouchableOpacity>
      {tgStatus && (
        <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>{tgStatus}</Text>
      )}

      {/* Data */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Данные
      </Text>
      <View style={[styles.infoRow, { borderColor: c.border }]}>
        <Text style={[styles.infoLabel, { color: c.textSecondary }]}>
          Задач
        </Text>
        <Text style={[styles.infoValue, { color: c.text }]}>
          {tasks.length}
        </Text>
      </View>
      <View style={[styles.infoRow, { borderColor: c.border }]}>
        <Text style={[styles.infoLabel, { color: c.textSecondary }]}>
          Проектов
        </Text>
        <Text style={[styles.infoValue, { color: c.text }]}>
          {projects.length}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: c.primary }]}
        onPress={handleExport}
      >
        <Text style={styles.exportBtnText}>Экспортировать данные</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.dangerBtn]}
        onPress={() =>
          Alert.alert("Удалить все данные?", "Это действие нельзя отменить!", [
            { text: "Отмена", style: "cancel" },
            {
              text: "Удалить",
              style: "destructive",
              onPress: async () => {
                await AsyncStorage.clear();
                Alert.alert("Готово", "Перезапустите приложение");
              },
            },
          ])
        }
      >
        <Text style={[styles.dangerBtnText, { color: c.danger }]}>
          Удалить все данные
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  hint: { fontSize: 13, marginBottom: 8 },
  fontSizeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  fontBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fontBtnText: { fontSize: 18, fontWeight: "700" },
  fontPreview: { flex: 1, alignItems: "center" },
  contextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  contextName: { fontSize: 15, fontWeight: "500" },
  removeBtn: { fontSize: 14, fontWeight: "600" },
  addContextRow: { flexDirection: "row", marginTop: 8, gap: 8 },
  addContextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  addContextBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addContextBtnText: { color: "#FFF", fontSize: 20, fontWeight: "600" },
  themeRow: { flexDirection: "row", gap: 12 },
  themeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#E5E7EB",
  },
  themeBtnText: { fontSize: 15, fontWeight: "600" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15, fontWeight: "600" },
  exportBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  exportBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  dangerBtn: {
    marginTop: 16,
    marginBottom: 40,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerBtnText: { fontSize: 16, fontWeight: "600" },
});
