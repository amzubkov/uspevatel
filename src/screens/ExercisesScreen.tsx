import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useExerciseStore, Exercise } from '../store/exerciseStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';

const WEIGHT_LABELS: Record<number, string> = { 0: 'Без веса', 10: 'Гантели', 100: 'Штанга' };
const WEIGHT_OPTIONS: { key: number; label: string }[] = [
  { key: 0, label: 'Без веса' },
  { key: 10, label: 'Гантели' },
  { key: 100, label: 'Штанга' },
];

export function ExercisesScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const exercises = useExerciseStore((s) => s.exercises);
  const addExercise = useExerciseStore((s) => s.addExercise);
  const removeExercise = useExerciseStore((s) => s.removeExercise);
  const navigation = useNavigation<any>();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [weightType, setWeightType] = useState(0);
  const [tag, setTag] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const ex of exercises) {
      if (ex.tag) tags.add(ex.tag);
    }
    return Array.from(tags).sort();
  }, [exercises]);

  const filtered = useMemo(() => {
    if (!selectedTag) return exercises;
    return exercises.filter((e) => e.tag === selectedTag);
  }, [exercises, selectedTag]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addExercise(name.trim(), weightType, tag.trim() || undefined, undefined, imageUri);
    setName('');
    setImageUri(undefined);
    setWeightType(0);
    setTag('');
    setShowAdd(false);
  };

  const handleRemove = (ex: Exercise) => {
    Alert.alert('Удалить?', `"${ex.name}" и все логи`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeExercise(ex.id) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {!showAdd ? (
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: c.primary }]} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Новое упражнение</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.addForm, { backgroundColor: c.card, borderColor: c.border }]}>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Название упражнения"
            placeholderTextColor={c.textSecondary}
          />
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={tag}
            onChangeText={setTag}
            placeholder="Тег (напр. Грудь, Ноги)"
            placeholderTextColor={c.textSecondary}
          />
          <View style={styles.typeRow}>
            {WEIGHT_OPTIONS.map((wt) => (
              <TouchableOpacity
                key={wt.key}
                style={[styles.typeBtn, weightType === wt.key && { backgroundColor: c.primary }]}
                onPress={() => setWeightType(wt.key)}
              >
                <Text style={[styles.typeBtnText, { color: weightType === wt.key ? '#FFF' : c.textSecondary }]}>{wt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.imagePickBtn, { borderColor: c.border }]} onPress={pickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImg} />
            ) : (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>Добавить фото</Text>
            )}
          </TouchableOpacity>
          <View style={styles.formActions}>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={{ color: c.textSecondary, fontSize: 14 }}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.primary }]} onPress={handleAdd}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Добавить</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagBar} contentContainerStyle={styles.tagBarContent}>
          <TouchableOpacity
            style={[styles.tagChip, !selectedTag && { backgroundColor: c.primary }]}
            onPress={() => setSelectedTag(null)}
          >
            <Text style={[styles.tagChipText, { color: !selectedTag ? '#FFF' : c.textSecondary }]}>Все ({exercises.length})</Text>
          </TouchableOpacity>
          {allTags.map((t) => {
            const count = exercises.filter((e) => e.tag === t).length;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.tagChip, selectedTag === t && { backgroundColor: c.primary }]}
                onPress={() => setSelectedTag(selectedTag === t ? null : t)}
              >
                <Text style={[styles.tagChipText, { color: selectedTag === t ? '#FFF' : c.textSecondary }]}>{t} ({count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.exRow, { backgroundColor: index % 2 === 1 ? (theme === 'dark' ? '#252525' : '#F0F0F0') : 'transparent' }]}
            onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
            onLongPress={() => handleRemove(item)}
          >
            {(item.imageBase64 || item.imageUri) ? (
              <Image source={{ uri: item.imageBase64 || item.imageUri! }} style={styles.exImage} />
            ) : (
              <View style={[styles.exImagePlaceholder, { backgroundColor: c.border }]}>
                <Text style={{ fontSize: 20 }}>🏋️</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.exName, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
              <View style={styles.exMeta}>
                <Text style={[styles.exType, { color: c.textSecondary }]}>{WEIGHT_LABELS[item.weightType] || 'Гантели'}</Text>
                {item.tag && <Text style={[styles.exTag, { color: c.primary }]}>{item.tag}</Text>}
              </View>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 16 }}>›</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { paddingBottom: 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🏋️</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>Нет упражнений</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: { margin: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  addForm: { margin: 12, padding: 12, borderRadius: 10, borderWidth: 1, gap: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.15)' },
  typeBtnText: { fontSize: 12, fontWeight: '600' },
  imagePickBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
  previewImg: { width: 80, height: 80, borderRadius: 8 },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  tagBar: { maxHeight: 40, marginBottom: 4 },
  tagBarContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tagChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(128,128,128,0.15)' },
  tagChipText: { fontSize: 12, fontWeight: '600' },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  exImage: { width: 44, height: 44, borderRadius: 8 },
  exImagePlaceholder: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 15, fontWeight: '600' },
  exMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  exType: { fontSize: 12 },
  exTag: { fontSize: 11, fontWeight: '600' },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 12 },
});
