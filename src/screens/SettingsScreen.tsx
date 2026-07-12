import React, { useState, useCallback, useEffect } from "react";
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
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths, Directory } from "expo-file-system";
import { useNavigation } from "@react-navigation/native";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { useProjectStore } from "../store/projectStore";
import { colors } from "../utils/theme";
import { useRoutineStore } from "../store/routineStore";
import { CHANGELOG } from "../changelog";
import { getSyncFolder, setSyncFolder, getDb } from "../db/database";
import { validateToken } from "../services/telegramService";
import { getSecret, setSecret, deleteSecret } from "../services/secrets";

const IMAGE_DIRS = ['task_images', 'flight_images', 'document_images', 'note_images', 'exercise_images'];

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 8192; // String.fromCharCode blows the call stack on multi-MB arrays
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function BackupRestore({ c }: { c: any }) {
  const handleBackup = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') { Alert.alert('Только Android'); return; }
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted || !perm.directoryUri) { Alert.alert('Отменено'); return; }
      const destUri = perm.directoryUri;

      // Copy DB — checkpoint first, otherwise recent writes stay in -wal and are lost from the copy
      const liveDb = await getDb();
      await liveDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
      const dbSrc = new File(Paths.document, 'SQLite/uspevatel.db');
      if (dbSrc.exists) {
        const dbBytes = await dbSrc.bytes();
        const base64 = bytesToBase64(dbBytes);
        await StorageAccessFramework.createFileAsync(destUri, 'uspevatel.db', 'application/x-sqlite3')
          .then(async (uri) => {
            await StorageAccessFramework.writeAsStringAsync(uri, base64, { encoding: 'base64' as any });
          });
      }

      // Copy photos
      let photoCount = 0;
      for (const dirName of IMAGE_DIRS) {
        const srcDir = new Directory(Paths.document, dirName);
        if (!srcDir.exists) continue;
        for (const item of srcDir.list()) {
          if (item instanceof File) {
            const bytes = await item.bytes();
            const b64 = bytesToBase64(bytes);
            const fileName = `${dirName}__${item.name}`;
            await StorageAccessFramework.createFileAsync(destUri, fileName, 'image/jpeg')
              .then(async (uri) => {
                await StorageAccessFramework.writeAsStringAsync(uri, b64, { encoding: 'base64' as any });
              });
            photoCount++;
          }
        }
      }

      Alert.alert('Бэкап готов', `БД + ${photoCount} фото сохранены`);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    }
  }, []);

  const handleRestore = useCallback(async () => {
    Alert.alert('Восстановить?', 'Текущие данные будут заменены. Перезапустите приложение после.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выбрать папку', onPress: async () => {
        try {
          if (Platform.OS !== 'android') return;
          const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!perm.granted || !perm.directoryUri) return;

          // Read DB file
          const files = await StorageAccessFramework.readDirectoryAsync(perm.directoryUri);
          const dbFile = files.find((f) => decodeURIComponent(f).includes('uspevatel.db'));
          if (dbFile) {
            const db = await getDb();
            await db.closeAsync();
            const b64 = await StorageAccessFramework.readAsStringAsync(dbFile, { encoding: 'base64' as any });
            const destPath = Paths.document.uri + '/SQLite/uspevatel.db';
            const dest = new File(destPath);
            await dest.write(b64, { encoding: 'base64' });
          }

          // Restore photos
          let photoCount = 0;
          for (const fileUri of files) {
            const name = decodeURIComponent(fileUri).split('/').pop() || '';
            const sep = name.indexOf('__');
            if (sep === -1) continue;
            const dirName = name.substring(0, sep);
            const fileName = name.substring(sep + 2);
            if (!IMAGE_DIRS.includes(dirName)) continue;
            const imgDir = new Directory(Paths.document, dirName);
            if (!imgDir.exists) imgDir.create();
            const b64 = await StorageAccessFramework.readAsStringAsync(fileUri, { encoding: 'base64' as any });
            const dest = new File(imgDir, fileName);
            await dest.write(b64, { encoding: 'base64' });
            photoCount++;
          }

          Alert.alert('Готово', `БД${dbFile ? '' : ' (не найдена)'} + ${photoCount} фото восстановлены.\nПерезапустите приложение.`);
        } catch (e: any) {
          Alert.alert('Ошибка', String(e?.message || e));
        }
      }},
    ]);
  }, []);

  return (
    <>
      <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#22C55E', marginTop: 8 }]} onPress={handleBackup}>
        <Text style={styles.exportBtnText}>Бэкап (БД + фото)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#F59E0B', marginTop: 8 }]} onPress={handleRestore}>
        <Text style={styles.exportBtnText}>Восстановить из бэкапа</Text>
      </TouchableOpacity>
    </>
  );
}

function ChangeLogSection({ c }: { c: any }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginTop: 16 }]}
        onPress={() => setShow(!show)}
      >
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
          {show ? 'Скрыть изменения' : 'Что нового'}
        </Text>
      </TouchableOpacity>
      {show && CHANGELOG.map((ver) => (
        <View key={ver.version} style={{ marginTop: 12 }}>
          <Text style={{ color: c.primary, fontSize: 15, fontWeight: '700' }}>v{ver.version} — {ver.date}</Text>
          {ver.changes.map((ch, i) => (
            <Text key={i} style={{ color: c.textSecondary, fontSize: 12, marginTop: 2, paddingLeft: 8 }}>
              • {ch}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

function CityField({ c }: { c: any }) {
  const city = useSettingsStore((s) => s.city);
  const setCity = useSettingsStore((s) => s.setCity);
  const [val, setVal] = useState(city);
  useEffect(() => { setVal(city); }, [city]);
  return (
    <>
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Город (для prodoctorov)
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Слаг города из URL prodoctorov.ru, напр. moskva, spb, ekaterinburg.
      </Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, marginTop: 4 }}
        value={val}
        onChangeText={setVal}
        onBlur={() => setCity(val.trim().toLowerCase())}
        placeholder="moskva"
        placeholderTextColor={c.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </>
  );
}

function NavBarToggle({ c }: { c: any }) {
  const navBarPadding = useSettingsStore((s) => s.navBarPadding);
  const setNavBarPadding = useSettingsStore((s) => s.setNavBarPadding);
  return (
    <>
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        Навигационная панель
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Включите, если кнопки внизу перекрываются навигационной панелью Android.
      </Text>
      <TouchableOpacity
        style={[styles.themeBtn, { backgroundColor: navBarPadding ? c.primary : c.card, borderWidth: 1, borderColor: c.border }]}
        onPress={() => setNavBarPadding(!navBarPadding)}
      >
        <Text style={{ fontSize: 15, fontWeight: '600', color: navBarPadding ? '#FFF' : c.text }}>
          {navBarPadding ? 'Включено' : 'Выключено'}
        </Text>
      </TouchableOpacity>
    </>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<any>();
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
      const t = await getSecret('tgBotToken');
      if (t) setTgToken(t);
    })();
  }, []);

  const handleSaveTgToken = useCallback(async () => {
    const token = tgToken.trim();
    setTgSaving(true);
    try {
      const db = await getDb();
      if (!token) {
        await deleteSecret('tgBotToken');
        await db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', ['tgUpdateOffset', 'tgAllowedChatId']);
        setTgStatus('Токен удалён');
        setTgSaving(false);
        return;
      }
      const botName = await validateToken(token);
      await setSecret('tgBotToken', token);
      setTgStatus(`Подключён: ${botName}`);
    } catch (e: any) {
      setTgStatus(String(e?.message || e));
    }
    setTgSaving(false);
  }, [tgToken]);

  // Ollama AI (модель, цель и замечания задаются на экране «План» при запуске AI-плана)
  const [ollamaKey, setOllamaKeyState] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      const k = await getSecret('ollamaApiKey');
      if (k) setOllamaKeyState(k);
    })();
  }, []);
  const [aiSex, setAiSexState] = useState('Мужской');
  const [aiBirthYear, setAiBirthYearState] = useState('');
  React.useEffect(() => {
    (async () => {
      const db = await getDb();
      const s = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['aiSex']);
      if (s?.value) setAiSexState(s.value);
      const by = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['aiBirthYear']);
      if (by?.value) setAiBirthYearState(by.value);
    })();
  }, []);
  const handleSaveAiSex = useCallback(async (sex: string) => {
    setAiSexState(sex);
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['aiSex', sex]);
  }, []);
  const handleSaveOllamaKey = useCallback(async () => {
    try {
      const key = ollamaKey.trim();
      if (!key) {
        await deleteSecret('ollamaApiKey');
        setOllamaStatus('Ключ удалён');
        return;
      }
      await setSecret('ollamaApiKey', key);
      setOllamaStatus('Сохранено');
    } catch (e: any) {
      setOllamaStatus(String(e?.message || e));
    }
  }, [ollamaKey]);

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

      {/* Nav Bar Padding */}
      <NavBarToggle c={c} />

      {/* City for prodoctorov */}
      <CityField c={c} />

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
      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: c.primary, marginTop: 8 }]}
        onPress={() => navigation.navigate('TelegramSync')}
      >
        <Text style={styles.exportBtnText}>Открыть Telegram Sync</Text>
      </TouchableOpacity>

      {/* Ollama AI */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 24 }]}>
        AI-планировщик (Ollama Cloud)
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        API-ключ с ollama.com. Модель, цель и замечания задаются на экране «План» при нажатии 🤖.
      </Text>
      <View style={styles.addContextRow}>
        <TextInput
          style={[
            styles.addContextInput,
            { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13 },
          ]}
          value={ollamaKey}
          onChangeText={setOllamaKeyState}
          placeholder="api-key..."
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>
      <TouchableOpacity
        style={[styles.exportBtn, { backgroundColor: c.primary, marginTop: 8 }]}
        onPress={handleSaveOllamaKey}
      >
        <Text style={styles.exportBtnText}>{ollamaKey.trim() ? 'Сохранить ключ' : 'Удалить ключ'}</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: c.textSecondary, marginTop: 12 }]}>Пол:</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {['Мужской', 'Женский'].map((s) => (
          <TouchableOpacity
            key={s}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
              backgroundColor: aiSex === s ? c.primary : 'rgba(128,128,128,0.15)',
            }}
            onPress={() => handleSaveAiSex(s)}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: aiSex === s ? '#FFF' : c.textSecondary }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.hint, { color: c.textSecondary, marginTop: 12 }]}>Год рождения (для AI-советчика по анализам):</Text>
      <View style={styles.addContextRow}>
        <TextInput
          style={[
            styles.addContextInput,
            { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 13 },
          ]}
          value={aiBirthYear}
          onChangeText={setAiBirthYearState}
          onEndEditing={async () => {
            const db = await getDb();
            const y = aiBirthYear.trim();
            if (/^(19|20)\d{2}$/.test(y)) {
              await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['aiBirthYear', y]);
              setOllamaStatus(`Год рождения: ${y}`);
            } else if (!y) {
              await db.runAsync('DELETE FROM settings WHERE key = ?', ['aiBirthYear']);
            }
          }}
          placeholder="1985"
          placeholderTextColor={c.textSecondary}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
      {ollamaStatus && (
        <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>{ollamaStatus}</Text>
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

      <BackupRestore c={c} />

      <ChangeLogSection c={c} />

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
