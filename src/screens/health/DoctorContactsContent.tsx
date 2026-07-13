import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  Alert, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettingsStore } from '../../store/settingsStore';
import { useDoctorContactStore, Doctor } from '../../store/doctorContactStore';
import { useAttachmentStore, resolveAttachmentUri, Attachment } from '../../store/attachmentStore';
import { fetchProdoctorov } from '../../utils/prodoctorovParser';
import { Linking } from 'react-native';
import { colors } from '../../utils/theme';
import { ZoomableImage } from '../../components/ZoomableImage';
import { s } from './shared';

/* ── Doctor Contacts Content ── */
export function DoctorContactsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const city = useSettingsStore((s) => s.city);
  const doctors = useDoctorContactStore((s) => s.doctors);
  const addDoctor = useDoctorContactStore((s) => s.addDoctor);
  const updateDoctor = useDoctorContactStore((s) => s.updateDoctor);
  const removeDoctor = useDoctorContactStore((s) => s.removeDoctor);
  const attachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [clinic, setClinic] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [fetching, setFetching] = useState(false);
  // Pending business-card photos for a NEW contact (no id yet). Attached on save.
  const [pendingCards, setPendingCards] = useState<{ uri: string; name: string; mimeType?: string; size?: number }[]>([]);
  const [fullCardImg, setFullCardImg] = useState<string | null>(null);

  const cardsForDoctor = (id: string): Attachment[] =>
    attachments.filter((a) => a.entityType === 'doctor' && a.entityId === id);

  const reset = () => {
    setName(''); setSpecialty(''); setPhone(''); setAddress('');
    setClinic(''); setUrl(''); setNotes('');
    setPendingCards([]);
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (d: Doctor) => {
    setEditingId(d.id); setName(d.name); setSpecialty(d.specialty); setPhone(d.phone);
    setAddress(d.address); setClinic(d.clinic); setUrl(d.url); setNotes(d.notes);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    const data = {
      name: name.trim(), specialty: specialty.trim(), phone: phone.trim(),
      address: address.trim(), clinic: clinic.trim(), url: url.trim(), notes: notes.trim(),
    };
    let targetId = editingId;
    if (editingId) {
      await updateDoctor(editingId, data);
    } else {
      targetId = await addDoctor(data);
    }
    // Flush pending card photos to the now-known doctor id.
    if (targetId && pendingCards.length > 0) {
      for (const p of pendingCards) {
        try { await addAttachment('doctor', targetId, p.uri, p.name, p.mimeType, p.size); } catch {}
      }
    }
    reset();
  };

  const pickCardImage = async (fromCamera: boolean) => {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее'); return; }
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const fileName = a.fileName || `card-${Date.now()}.jpg`;
    if (editingId) {
      try { await addAttachment('doctor', editingId, a.uri, fileName, a.mimeType, a.fileSize); }
      catch (e: any) { Alert.alert('Ошибка', e?.message || 'Не удалось сохранить'); }
    } else {
      setPendingCards((p) => [...p, { uri: a.uri, name: fileName, mimeType: a.mimeType, size: a.fileSize }]);
    }
  };

  const handleDeleteCard = (att: Attachment) => {
    Alert.alert('Удалить визитку?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeAttachment(att.id) },
    ]);
  };

  const handleDeletePending = (uri: string) => {
    setPendingCards((p) => p.filter((x) => x.uri !== uri));
  };

  const handleFetchFromUrl = async () => {
    if (!url.trim()) { Alert.alert('Нет URL', 'Сначала вставьте ссылку на prodoctorov'); return; }
    setFetching(true);
    const data = await fetchProdoctorov(url.trim());
    setFetching(false);
    const rawLine = data?.rawTitle ? `\n\nТitle: ${data.rawTitle}` : '';
    if (!data || (!data.name && !data.specialty && !data.clinic)) {
      Alert.alert('Ничего не распознал', `Заполни поля вручную${rawLine}`);
      return;
    }
    if (data.name && !name.trim()) setName(data.name);
    if (data.specialty && !specialty.trim()) setSpecialty(data.specialty);
    if (data.clinic && !clinic.trim()) setClinic(data.clinic);
    const recognised = [
      data.name && `имя: ${data.name}`,
      data.specialty && `спец.: ${data.specialty}`,
      data.clinic && `клиника: ${data.clinic}`,
      data.city && `город: ${data.city}`,
    ].filter(Boolean).join('\n');
    Alert.alert('Распознано', `${recognised}${rawLine}`);
  };

  const handleSearchProdoctorov = async () => {
    if (!city) {
      Alert.alert('Город не указан', 'Введите город в настройках (напр. moskva, spb)');
      return;
    }
    const q = (name.trim() || specialty.trim()) || '';
    const target = `https://prodoctorov.ru/${encodeURIComponent(city)}/${q ? '?q=' + encodeURIComponent(q) : ''}`;
    Linking.openURL(target).catch(() => Alert.alert('Не открылось', target));
  };

  const handleOpenUrl = () => {
    if (!url.trim()) return;
    Linking.openURL(url.trim()).catch(() => Alert.alert('Не открылось', url));
  };

  const handleCallPhone = (p: string) => {
    if (!p) return;
    Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`).catch(() => {});
  };

  const handleDelete = (d: Doctor) => {
    Alert.alert('Удалить контакт?', d.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        await removeDoctor(d.id);
      } },
    ]);
  };

  if (showForm) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formTitle, { color: c.text }]}>{editingId ? 'Редактировать контакт' : 'Новый контакт'}</Text>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="ФИО" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Специализация" placeholderTextColor={c.textSecondary} value={specialty} onChangeText={setSpecialty} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Телефон" placeholderTextColor={c.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Клиника" placeholderTextColor={c.textSecondary} value={clinic} onChangeText={setClinic} />
        <TextInput style={[s.input, { color: c.text, borderColor: c.border }]} placeholder="Адрес" placeholderTextColor={c.textSecondary} value={address} onChangeText={setAddress} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, flex: 1 }]} placeholder="prodoctorov.ru/..." placeholderTextColor={c.textSecondary} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity onPress={handleOpenUrl} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 18 }}>🔗</Text>
          </TouchableOpacity>
        </View>
        <View style={[s.row, { marginBottom: 8 }]}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1, opacity: fetching ? 0.6 : 1 }]} onPress={handleFetchFromUrl} disabled={fetching}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{fetching ? 'Загрузка…' : 'Заполнить из URL'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, flex: 1 }]} onPress={handleSearchProdoctorov}>
            <Text style={[s.btnText, { textAlign: 'center', color: c.text }]}>Поиск {city ? `(${city})` : ''}</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={[s.input, { color: c.text, borderColor: c.border, height: 60 }]} placeholder="Заметки" placeholderTextColor={c.textSecondary} value={notes} onChangeText={setNotes} multiline />

        {/* Business card photos */}
        <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6 }}>Визитки</Text>
        {(() => {
          const saved = editingId ? cardsForDoctor(editingId) : [];
          const hasAny = saved.length > 0 || pendingCards.length > 0;
          return hasAny ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {saved.map((a) => {
                const uri = resolveAttachmentUri(a);
                return (
                  <View key={a.id} style={{ marginRight: 8, position: 'relative' }}>
                    <TouchableOpacity onPress={() => setFullCardImg(uri)}>
                      <Image source={{ uri }} style={s.docImg} resizeMode="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeleteCard(a)}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {pendingCards.map((p) => (
                <View key={p.uri} style={{ marginRight: 8, position: 'relative' }}>
                  <TouchableOpacity onPress={() => setFullCardImg(p.uri)}>
                    <Image source={{ uri: p.uri }} style={s.docImg} resizeMode="cover" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.docImgDelete} onPress={() => handleDeletePending(p.uri)}>
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null;
        })()}
        <View style={[s.row, { marginBottom: 12 }]}>
          <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickCardImage(true)}>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>📷 Камера</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.docImgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => pickCardImage(false)}>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>🖼 Галерея</Text>
          </TouchableOpacity>
        </View>

        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleSave}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>{editingId ? 'Сохранить' : 'Добавить'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={reset}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
        <ZoomableImage uri={fullCardImg} onClose={() => setFullCardImg(null)} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={[s.fab, { backgroundColor: c.primary, margin: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 10 }]}
        onPress={() => setShowForm(true)}>
        <Text style={s.fabText}>+ Контакт</Text>
      </TouchableOpacity>
      <FlatList
        data={doctors}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => startEdit(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{item.name}</Text>
              {cardsForDoctor(item.id).length > 0 && (
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>📇 {cardsForDoctor(item.id).length}</Text>
              )}
            </View>
            {!!item.specialty && <Text style={{ color: c.primary, fontSize: 13, marginTop: 2 }}>{item.specialty}</Text>}
            {!!item.clinic && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{item.clinic}</Text>}
            {!!item.phone && (
              <TouchableOpacity onPress={() => handleCallPhone(item.phone)} style={{ marginTop: 4 }}>
                <Text style={{ color: c.primary, fontSize: 13 }}>📞 {item.phone}</Text>
              </TouchableOpacity>
            )}
            {!!item.address && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{item.address}</Text>}
            {!!item.url && (
              <TouchableOpacity onPress={() => Linking.openURL(item.url).catch(() => {})} style={{ marginTop: 4 }}>
                <Text style={{ color: c.primary, fontSize: 12 }} numberOfLines={1}>🔗 {item.url}</Text>
              </TouchableOpacity>
            )}
            {!!item.notes && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>{item.notes}</Text>}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет контактов</Text>}
      />
    </View>
  );
}
