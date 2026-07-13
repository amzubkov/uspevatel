import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  Alert, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettingsStore } from '../../store/settingsStore';
import { useDoctorStore, DoctorVisit, DoctorVisitImage, VisitStatus } from '../../store/doctorStore';
import { Person } from '../../store/personStore';
import { DatePickerField } from '../../components/DatePickerField';
import { colors } from '../../utils/theme';
import { ZoomableImage } from '../../components/ZoomableImage';
import { s, PersonPicker, todayStr, daysDiff } from './shared';

/* ── Doctors Content ── */
export function DoctorsContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const allVisits = useDoctorStore((s) => s.visits);
  const images = useDoctorStore((s) => s.images);
  const addVisit = useDoctorStore((s) => s.addVisit);
  const updateVisit = useDoctorStore((s) => s.updateVisit);
  const removeVisit = useDoctorStore((s) => s.removeVisit);
  const addImage = useDoctorStore((s) => s.addImage);
  const removeImage = useDoctorStore((s) => s.removeImage);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string>(activePerson || 'me');
  const [status, setStatus] = useState<VisitStatus>('done');

  const visits = useMemo(
    () => (activePerson ? allVisits.filter((v) => v.personId === activePerson) : allVisits),
    [allVisits, activePerson],
  );
  const today = todayStr();
  const planned = useMemo(
    () => visits.filter((v) => v.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
    [visits],
  );
  const history = useMemo(
    () => visits.filter((v) => v.status !== 'planned').sort((a, b) => b.date.localeCompare(a.date)),
    [visits],
  );
  const sorted = useMemo(() => [...planned, ...history], [planned, history]);

  const imagesForVisit = useCallback(
    (visitId: string) => images.filter((i) => i.visitId === visitId).sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const resetForm = () => {
    setName(''); setDate(todayStr()); setNotes('');
    setShowForm(false); setEditingId(null);
    setPersonId(activePerson || 'me'); setStatus('done');
  };

  const startEdit = (v: DoctorVisit) => {
    setEditingId(v.id); setName(v.name); setDate(v.date); setNotes(v.notes);
    setPersonId(v.personId || 'me'); setStatus(v.status);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !date.trim()) { Alert.alert('Ошибка', 'Введите название и дату'); return; }
    const payload = { name: name.trim(), date: date.trim(), notes: notes.trim(), personId, status };
    if (editingId) {
      await updateVisit(editingId, payload);
    } else {
      await addVisit(payload);
    }
    resetForm();
  };

  const handlePickImage = async (visitId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(visitId, r.assets[0].uri);
  };

  const handleCamera = async (visitId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(visitId, r.assets[0].uri);
  };

  const handleDelete = (v: DoctorVisit) => {
    Alert.alert('Удалить визит?', v.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeVisit(v.id) },
    ]);
  };

  const handleDeleteImage = (img: DoctorVisitImage) => {
    Alert.alert('Удалить фото?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeImage(img.id) },
    ]);
  };

  const renderVisit = ({ item }: { item: DoctorVisit }) => {
    const isExpanded = expanded === item.id;
    const visitImages = imagesForVisit(item.id);
    const isPlanned = item.status === 'planned';
    const personName = persons.find((p) => p.id === item.personId)?.name || '';
    const daysToVisit = isPlanned ? daysDiff(today, item.date) : 0;
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: isPlanned ? c.warning : c.success }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{isPlanned ? '📅' : '🩺'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.metricName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {item.date}{personName ? ` · ${personName}` : ''}
              {isPlanned && daysToVisit >= 0 ? ` · через ${daysToVisit} дн.` : ''}
              {isPlanned && daysToVisit < 0 ? ` · просрочен ${-daysToVisit} дн.` : ''}
            </Text>
          </View>
          {visitImages.length > 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{visitImages.length} фото</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>{item.notes}</Text> : null}

            {visitImages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {visitImages.map((img) => (
                  <View key={img.id} style={{ marginRight: 8, position: 'relative' }}>
                    <TouchableOpacity onPress={() => setFullImg(img.imagePath)}>
                      <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeleteImage(img)}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={s.row}>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border }]} onPress={() => handleCamera(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              {isPlanned && (
                <TouchableOpacity onPress={() => updateVisit(item.id, { status: 'done' })}>
                  <Text style={{ color: c.success, fontSize: 13, fontWeight: '600' }}>✓ Состоялся</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={{ color: '#EF4444', fontSize: 13 }}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {showForm ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать' : 'Новый визит'}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
          <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              style={[s.chip, { backgroundColor: status === 'planned' ? c.warning : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
              onPress={() => setStatus('planned')}>
              <Text style={{ color: status === 'planned' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Запланирован</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.chip, { backgroundColor: status === 'done' ? c.success : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
              onPress={() => setStatus('done')}>
              <Text style={{ color: status === 'done' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Состоялся</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Врач / клиника" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
          <DatePickerField value={date} onChange={setDate} label="Дата визита" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
              <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={resetForm}>
              <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <>
          <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
            onPress={() => setShowForm(true)}>
            <Text style={s.fabText}>+ Визит</Text>
          </TouchableOpacity>
          <FlatList
            data={sorted}
            keyExtractor={(v) => v.id}
            renderItem={renderVisit}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет визитов</Text>}
          />
        </>
      )}

      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
    </View>
  );
}
