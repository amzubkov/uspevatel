import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  Alert, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSettingsStore } from '../../store/settingsStore';
import { useAttachmentStore, resolveAttachmentUri, Attachment } from '../../store/attachmentStore';
import { Person } from '../../store/personStore';
import { useLabArchiveStore, LabRecord, LabStatus } from '../../store/labArchiveStore';
import { DatePickerField } from '../../components/DatePickerField';
import { colors } from '../../utils/theme';
import { ZoomableImage } from '../../components/ZoomableImage';
import { s, PersonPicker, todayStr, daysDiff } from './shared';

/* ── Archive Content (lab results files) ── */
export function ArchiveContent({ activePerson, persons }: { activePerson: string | null; persons: Person[] }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const allRecords = useLabArchiveStore((s) => s.records);
  const addRecord = useLabArchiveStore((s) => s.addRecord);
  const updateRecord = useLabArchiveStore((s) => s.updateRecord);
  const removeRecord = useLabArchiveStore((s) => s.removeRecord);
  const attachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string>(activePerson || 'me');
  const [status, setStatus] = useState<LabStatus>('done');

  const records = useMemo(
    () => (activePerson ? allRecords.filter((r) => r.personId === activePerson) : allRecords),
    [allRecords, activePerson],
  );
  const planned = useMemo(
    () => records.filter((r) => r.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
    [records],
  );
  const history = useMemo(
    () => records.filter((r) => r.status !== 'planned').sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  const sorted = useMemo(() => [...planned, ...history], [planned, history]);
  const today = todayStr();

  const filesFor = (id: string) => attachments.filter((a) => a.entityType === 'lab_archive' && a.entityId === id);
  const isImage = (a: Attachment) => (a.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.name);

  const reset = () => {
    setName(''); setDate(todayStr()); setNotes('');
    setEditingId(null); setShowForm(false);
    setPersonId(activePerson || 'me'); setStatus('done');
  };

  const startEdit = (r: LabRecord) => {
    setEditingId(r.id); setName(r.name); setDate(r.date); setNotes(r.notes);
    setPersonId(r.personId || 'me'); setStatus(r.status);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !date.trim()) { Alert.alert('Ошибка', 'Введите название и дату'); return; }
    const payload = { name: name.trim(), date: date.trim(), notes: notes.trim(), personId, status };
    if (editingId) {
      await updateRecord(editingId, payload);
    } else {
      await addRecord(payload);
    }
    reset();
  };

  const handleDelete = (r: LabRecord) => {
    Alert.alert('Удалить запись?', r.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          await removeRecord(r.id);
        },
      },
    ]);
  };

  const pickFile = async (recordId: string) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await addAttachment('lab_archive', recordId, a.uri, a.name || `file-${Date.now()}`, a.mimeType, a.size);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить файл');
    }
  };

  const pickImage = async (recordId: string, fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const { status: ps } = await ImagePicker.requestCameraPermissionsAsync();
        if (ps !== 'granted') { Alert.alert('Нет доступа', 'Разрешите камеру'); return; }
      } else {
        const { status: ps } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (ps !== 'granted') { Alert.alert('Нет доступа', 'Разрешите галерею'); return; }
      }
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      const fileName = a.fileName || `lab-${Date.now()}.jpg`;
      await addAttachment('lab_archive', recordId, a.uri, fileName, a.mimeType, a.fileSize);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить');
    }
  };

  const openFile = async (a: Attachment) => {
    const uri = resolveAttachmentUri(a);
    if (isImage(a)) { setFullImg(uri); return; }
    try {
      const can = await Sharing.isAvailableAsync();
      if (!can) { Alert.alert('Не поддерживается', 'Sharing недоступен'); return; }
      await Sharing.shareAsync(uri, { mimeType: a.mimeType, dialogTitle: a.name });
    } catch (e: any) {
      Alert.alert('Не открылось', e?.message || '');
    }
  };

  const handleDeleteFile = (a: Attachment) => {
    Alert.alert('Удалить файл?', a.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeAttachment(a.id) },
    ]);
  };

  if (showForm) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать' : 'Новая запись'}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 2 }}>Человек</Text>
        <PersonPicker persons={persons} value={personId} onChange={setPersonId} c={c} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            style={[s.chip, { backgroundColor: status === 'planned' ? c.warning : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => setStatus('planned')}>
            <Text style={{ color: status === 'planned' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Запланирована</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.chip, { backgroundColor: status === 'done' ? c.success : c.border, paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => setStatus('done')}>
            <Text style={{ color: status === 'done' ? '#FFF' : c.text, fontSize: 12, fontWeight: '700' }}>Сдана</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Название (напр. ОАК, биохимия)" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
        <DatePickerField value={date} onChange={setDate} label="Дата" textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки (клиника, врач, и т.п.)" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={reset}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const renderRecord = ({ item }: { item: LabRecord }) => {
    const isExpanded = expanded === item.id;
    const files = filesFor(item.id);
    const isPlanned = item.status === 'planned';
    const personName = persons.find((p) => p.id === item.personId)?.name || '';
    const daysTo = isPlanned ? daysDiff(today, item.date) : 0;
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: isPlanned ? c.warning : c.success }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{isPlanned ? '📅' : '📁'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.metricName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {item.date}{personName ? ` · ${personName}` : ''}
              {isPlanned && daysTo >= 0 ? ` · через ${daysTo} дн.` : ''}
              {isPlanned && daysTo < 0 ? ` · просрочена ${-daysTo} дн.` : ''}
            </Text>
          </View>
          {files.length > 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>📎 {files.length}</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>{item.notes}</Text> : null}

            {files.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                {files.map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                    {isImage(a) ? (
                      <TouchableOpacity onPress={() => openFile(a)}>
                        <Image source={{ uri: resolveAttachmentUri(a) }} style={{ width: 40, height: 40, borderRadius: 4 }} />
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ fontSize: 24 }}>📄</Text>
                    )}
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => openFile(a)}>
                      <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={1}>{a.name}</Text>
                      {a.size ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{Math.round(a.size / 1024)} KB</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteFile(a)} style={{ paddingHorizontal: 8 }}>
                      <Text style={{ color: '#EF4444', fontSize: 18 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={[s.row, { marginBottom: 6 }]}>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickFile(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📄 Файл/PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickImage(item.id, false)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>🖼 Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickImage(item.id, true)}>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📷 Камера</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Ред.</Text>
              </TouchableOpacity>
              {isPlanned && (
                <TouchableOpacity onPress={() => updateRecord(item.id, { status: 'done' })}>
                  <Text style={{ color: c.success, fontSize: 13, fontWeight: '600' }}>✓ Сдана</Text>
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
      <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
        onPress={() => setShowForm(true)}>
        <Text style={s.fabText}>+ Запись</Text>
      </TouchableOpacity>
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        renderItem={renderRecord}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет записей</Text>}
      />
      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
    </View>
  );
}
