import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, Alert, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useExerciseStore } from '../store/exerciseStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { useRoute } from '@react-navigation/native';

const WEIGHT_LABELS: Record<number, string> = { 0: 'Без веса', 10: 'Гантели', 100: 'Штанга' };
const WEIGHT_OPTIONS: { key: number; label: string }[] = [
  { key: 0, label: 'Без веса' },
  { key: 10, label: 'Гантели' },
  { key: 100, label: 'Штанга' },
];

export function ExerciseDetailScreen() {
  const route = useRoute<any>();
  const { exerciseId } = route.params;
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const exercises = useExerciseStore((s) => s.exercises);
  const logs = useExerciseStore((s) => s.logs);
  const addLog = useExerciseStore((s) => s.addLog);
  const removeLog = useExerciseStore((s) => s.removeLog);
  const updateExercise = useExerciseStore((s) => s.updateExercise);

  const exercise = useMemo(() => exercises.find((e) => e.id === exerciseId), [exercises, exerciseId]);
  const exLogs = useMemo(() => logs.filter((l) => l.exerciseId === exerciseId), [logs, exerciseId]);

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('1');
  const [showFullImg, setShowFullImg] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editWeightType, setEditWeightType] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayLogs = useMemo(() => exLogs.filter((l) => l.date === today), [exLogs, today]);
  const historyByDate = useMemo(() => {
    const map = new Map<string, typeof exLogs>();
    for (const l of exLogs) {
      const arr = map.get(l.date) || [];
      arr.push(l);
      map.set(l.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [exLogs]);

  const maxWeight = useMemo(() => exLogs.reduce((max, l) => Math.max(max, l.weight), 0), [exLogs]);

  if (!exercise) return <View style={[styles.container, { backgroundColor: c.background }]}><Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Упражнение не найдено</Text></View>;

  const currentImage = exercise.imageBase64 || exercise.imageUri;

  const startEdit = () => {
    setEditName(exercise.name);
    setEditTag(exercise.tag || '');
    setEditWeightType(exercise.weightType);
    setEditDescription(exercise.description || '');
    setEditImageUri(currentImage);
    setImageChanged(false);
    setEditing(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setEditImageUri(result.assets[0].uri);
      setImageChanged(true);
    }
  };

  const removeImage = () => {
    setEditImageUri(null);
    setImageChanged(true);
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    const updates: any = {
      name: editName.trim(),
      tag: editTag.trim() || null,
      weightType: editWeightType,
      description: editDescription.trim() || null,
    };
    if (imageChanged) {
      updates.imageUri = editImageUri; // null = remove, uri = new image
    }
    updateExercise(exercise.id, updates);
    setEditing(false);
  };

  const handleAdd = () => {
    const w = parseFloat(weight.replace(',', '.')) || 0;
    const r = parseInt(reps) || 0;
    const s = parseInt(sets) || 1;
    if (exercise.weightType !== 0 && w <= 0) return;
    if (r <= 0) return;
    addLog(exerciseId, w, r, s);
    setWeight('');
    setReps('');
    setSets('1');
  };

  const logTime = (log: typeof exLogs[0]) => {
    if (log.createdAt && log.createdAt.includes(' ')) {
      return log.createdAt.split(' ')[1]?.slice(0, 5) || '';
    }
    return '';
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={styles.header}>
        {currentImage ? (
          <>
          <TouchableOpacity activeOpacity={0.9} onPress={() => setShowFullImg(true)}>
            <Image source={{ uri: currentImage }} style={styles.headerImg} />
          </TouchableOpacity>
          <Modal visible={showFullImg} transparent animationType="fade" onRequestClose={() => setShowFullImg(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }} activeOpacity={1} onPress={() => setShowFullImg(false)}>
              <Image source={{ uri: currentImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
            </TouchableOpacity>
          </Modal>
          </>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.exName, { color: c.text }]}>{exercise.name}</Text>
          {exercise.tag && <Text style={[styles.exTag, { color: c.primary }]}>{exercise.tag}</Text>}
          {maxWeight > 0 && <Text style={[styles.maxWeight, { color: c.primary }]}>Макс: {maxWeight} кг</Text>}
        </View>
        {!exercise.isPreset && (
          <TouchableOpacity onPress={startEdit} style={styles.editBtn}>
            <Text style={{ fontSize: 18 }}>✏️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Edit modal */}
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={styles.editOverlay}>
          <View style={[styles.editModal, { backgroundColor: c.card }]}>
            <Text style={[styles.editTitle, { color: c.text }]}>Редактировать</Text>
            <TextInput
              style={[styles.editInput, { color: c.text, borderColor: c.border }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Название"
              placeholderTextColor={c.textSecondary}
            />
            <TextInput
              style={[styles.editInput, { color: c.text, borderColor: c.border }]}
              value={editTag}
              onChangeText={setEditTag}
              placeholder="Тег (напр. Грудь)"
              placeholderTextColor={c.textSecondary}
            />
            <TextInput
              style={[styles.editInput, { color: c.text, borderColor: c.border, minHeight: 60 }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Описание"
              placeholderTextColor={c.textSecondary}
              multiline
            />
            <View style={styles.typeRow}>
              {WEIGHT_OPTIONS.map((wt) => (
                <TouchableOpacity
                  key={wt.key}
                  style={[styles.typeBtn, editWeightType === wt.key && { backgroundColor: c.primary }]}
                  onPress={() => setEditWeightType(wt.key)}
                >
                  <Text style={[styles.typeBtnText, { color: editWeightType === wt.key ? '#FFF' : c.textSecondary }]}>{wt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.imageRow}>
              <TouchableOpacity style={[styles.imagePickBtn, { borderColor: c.border }]} onPress={pickImage}>
                {editImageUri ? (
                  <Image source={{ uri: editImageUri }} style={styles.previewImg} />
                ) : (
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>Добавить фото</Text>
                )}
              </TouchableOpacity>
              {editImageUri && (
                <TouchableOpacity onPress={removeImage} style={styles.removeImgBtn}>
                  <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '600' }}>Убрать</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={{ color: c.textSecondary, fontSize: 15 }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.primary }]} onPress={saveEdit}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Description */}
      {exercise.description ? (
        <View style={[styles.descBlock, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.descText, { color: c.textSecondary }]}>{exercise.description}</Text>
        </View>
      ) : null}

      {/* Log form */}
      <View style={[styles.logForm, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.logRow}>
          {exercise.weightType !== 0 && (
            <TextInput
              style={[styles.logInput, { color: c.text, borderColor: c.border }]}
              value={weight}
              onChangeText={setWeight}
              placeholder="Вес"
              placeholderTextColor={c.textSecondary}
              keyboardType="decimal-pad"
            />
          )}
          <TextInput
            style={[styles.logInput, { color: c.text, borderColor: c.border }]}
            value={reps}
            onChangeText={setReps}
            placeholder="Повт."
            placeholderTextColor={c.textSecondary}
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.logInput, { color: c.text, borderColor: c.border, width: 50 }]}
            value={sets}
            onChangeText={setSets}
            placeholder="Подх."
            placeholderTextColor={c.textSecondary}
            keyboardType="number-pad"
          />
          <TouchableOpacity style={[styles.logBtn, { backgroundColor: c.primary }]} onPress={handleAdd}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Today */}
      {todayLogs.length > 0 && (
        <Text style={[styles.section, { color: c.textSecondary }]}>Сегодня</Text>
      )}

      <FlatList
        data={todayLogs}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onLongPress={() => Alert.alert('Удалить?', '', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => removeLog(item.id) },
            ])}
            style={[styles.logRow2, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
          >
            <Text style={[styles.logTime, { color: c.textSecondary }]}>{logTime(item)}</Text>
            {item.weight > 0 && <Text style={[styles.logVal, { color: c.text }]}>{item.weight} кг</Text>}
            <Text style={[styles.logVal, { color: c.text }]}>{item.reps} повт.</Text>
            <Text style={[styles.logVal, { color: c.textSecondary }]}>×{item.setNum}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListFooterComponent={
          historyByDate.length > (todayLogs.length > 0 ? 1 : 0) ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.section, { color: c.textSecondary }]}>История</Text>
              {historyByDate.filter(([date]) => date !== today).slice(0, 14).map(([date, dayLogs]) => (
                <View key={date} style={[styles.histDay, { borderColor: c.border }]}>
                  <Text style={[styles.histDate, { color: c.text }]}>{date}</Text>
                  {dayLogs.map((l) => (
                    <Text key={l.id} style={[styles.histEntry, { color: c.textSecondary }]}>
                      {l.weight > 0 ? `${l.weight}кг ` : ''}{l.reps}×{l.setNum}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  headerImg: { width: 64, height: 64, borderRadius: 10 },
  exName: { fontSize: 20, fontWeight: '800' },
  exTag: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  maxWeight: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  editBtn: { padding: 8 },
  descBlock: { marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 8, borderWidth: 0.5 },
  descText: { fontSize: 13, lineHeight: 18 },
  logForm: { marginHorizontal: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: 'center' },
  logBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase' },
  logRow2: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  logTime: { fontSize: 13, width: 45 },
  logVal: { fontSize: 14, fontWeight: '600' },
  histDay: { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 0.5 },
  histDate: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  histEntry: { fontSize: 13 },
  // Edit modal
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  editModal: { borderRadius: 14, padding: 16, gap: 12 },
  editTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  editInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.15)' },
  typeBtnText: { fontSize: 12, fontWeight: '600' },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  imagePickBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', minHeight: 60, justifyContent: 'center', flex: 1 },
  previewImg: { width: 80, height: 80, borderRadius: 8 },
  removeImgBtn: { padding: 8 },
  editActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
});
