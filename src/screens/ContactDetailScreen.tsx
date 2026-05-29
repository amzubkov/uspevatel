import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSettingsStore } from '../store/settingsStore';
import { useContactStore, ContactMessage, parseTags, serializeTags } from '../store/contactStore';
import { colors } from '../utils/theme';

type Tab = 'messages' | 'notes';

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameYear = d.getFullYear() === today.getFullYear();
  const day = d.getDate();
  const mon = MONTHS_RU[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `сегодня, ${hh}:${mi}`;
  return sameYear ? `${day} ${mon}, ${hh}:${mi}` : `${day} ${mon} ${d.getFullYear()}, ${hh}:${mi}`;
}

export function ContactDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const contactId = route.params?.contactId as string;
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const contact = useContactStore((s) => s.contacts.find((x) => x.id === contactId));
  const updateContact = useContactStore((s) => s.updateContact);
  const removeContact = useContactStore((s) => s.removeContact);
  const messagesFor = useContactStore((s) => s.messagesFor);
  const addMessage = useContactStore((s) => s.addMessage);
  const updateMessage = useContactStore((s) => s.updateMessage);
  const updateMessageDate = useContactStore((s) => s.updateMessageDate);
  const removeMessage = useContactStore((s) => s.removeMessage);
  // subscribe to messages so derived list re-renders
  useContactStore((s) => s.messages);

  const [tab, setTab] = useState<Tab>('messages');
  const [name, setName] = useState(contact?.name || '');
  const [notes, setNotes] = useState(contact?.notes || '');
  const [tagsText, setTagsText] = useState(contact ? serializeTags(contact.tags) : '');
  const [draft, setDraft] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [dateEditMsgId, setDateEditMsgId] = useState<string | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [datePickerStage, setDatePickerStage] = useState<'date' | 'time' | null>(null);

  const listRef = useRef<FlatList<ContactMessage>>(null);
  // Show newest first.
  const messages = contact ? [...messagesFor(contact.id)].reverse() : [];

  useLayoutEffect(() => {
    navigation.setOptions({ title: contact?.name || 'Контакт' });
  }, [navigation, contact?.name]);

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setNotes(contact.notes);
      setTagsText(serializeTags(contact.tags));
    }
  }, [contact?.id]);

  // Persist on tab switch / unmount. Notes TextInput can unmount before onBlur fires,
  // so we never rely solely on blur.
  const nameRef = useRef(name);
  const notesRef = useRef(notes);
  const tagsRef = useRef(tagsText);
  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { tagsRef.current = tagsText; }, [tagsText]);

  const flushPending = async () => {
    if (!contact) return;
    const cur = useContactStore.getState().contacts.find((x) => x.id === contact.id);
    if (!cur) return;
    const patch: Partial<{ name: string; notes: string; tags: string[] }> = {};
    const trimmedName = nameRef.current.trim();
    if (trimmedName && trimmedName !== cur.name) patch.name = trimmedName;
    if (notesRef.current !== cur.notes) patch.notes = notesRef.current;
    const tagsArr = parseTags(tagsRef.current);
    if (serializeTags(tagsArr) !== serializeTags(cur.tags)) patch.tags = tagsArr;
    if (Object.keys(patch).length > 0) await updateContact(cur.id, patch);
  };

  // Save when leaving notes tab or unmounting.
  useEffect(() => {
    if (tab !== 'notes') { flushPending(); }
  }, [tab]);
  useEffect(() => () => { flushPending(); }, []);

  if (!contact) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.textSecondary }}>Контакт не найден</Text>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert('Удалить контакт?', contact.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        await removeContact(contact.id);
        navigation.goBack();
      } },
    ]);
  };

  const handleSendOrSave = async () => {
    const text = draft.trim();
    if (!text) return;
    if (editingMsgId) {
      await updateMessage(editingMsgId, text);
      setEditingMsgId(null);
    } else {
      await addMessage(contact.id, text, 'out');
    }
    setDraft('');
  };

  const handleMessagePress = (m: ContactMessage) => {
    Alert.alert('Запись', '', [
      { text: 'Редактировать', onPress: () => { setEditingMsgId(m.id); setDraft(m.text); } },
      { text: 'Изменить дату', onPress: () => {
        setDateEditMsgId(m.id);
        setDatePickerValue(new Date(m.createdAt));
        setDatePickerStage('date');
      } },
      { text: 'Удалить', style: 'destructive', onPress: () => removeMessage(m.id) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      {/* Top tabs */}
      <View style={[s.tabRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'messages' && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('messages')}
        >
          <Text style={{ color: tab === 'messages' ? c.primary : c.textSecondary, fontWeight: '700', fontSize: 13 }}>
            История {messages.length > 0 ? `(${messages.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'notes' && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('notes')}
        >
          <Text style={{ color: tab === 'notes' ? c.primary : c.textSecondary, fontWeight: '700', fontSize: 13 }}>
            Заметки
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'messages' ? (
        <>
          {/* Composer at top — date saved automatically */}
          <View style={[s.composer, { borderBottomColor: c.border, backgroundColor: c.card }]}>
            <TextInput
              style={[s.composerInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
              placeholder={editingMsgId ? 'Редактировать запись…' : 'Кратко: о чём говорили'}
              placeholderTextColor={c.textSecondary}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <TouchableOpacity
              onPress={handleSendOrSave}
              style={[s.sendBtn, { backgroundColor: c.primary }]}
            >
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingMsgId ? '✓' : '＋'}</Text>
            </TouchableOpacity>
          </View>
          {editingMsgId && (
            <TouchableOpacity onPress={() => { setEditingMsgId(null); setDraft(''); }} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>Отменить редактирование</Text>
            </TouchableOpacity>
          )}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onLongPress={() => handleMessagePress(item)}
                style={[s.entry, { backgroundColor: c.card, borderColor: c.border }]}
              >
                <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>{fmtDateTime(item.createdAt)}</Text>
                <Text style={{ color: c.text, fontSize: 14 }}>{item.text}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 10 }}
            ListEmptyComponent={
              <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>
                Нет записей. Запиши кратко: «обсудили семью», «договорились созвониться»…
              </Text>
            }
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={[s.label, { color: c.textSecondary }]}>Имя</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
            value={name}
            onChangeText={setName}
          />
          <Text style={[s.label, { color: c.textSecondary }]}>Теги (через запятую)</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="семья, работа, vip"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="none"
          />
          {parseTags(tagsText).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {parseTags(tagsText).map((t) => (
                <View key={t} style={[s.tagChip, { backgroundColor: c.primary }]}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{t}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={[s.label, { color: c.textSecondary }]}>Заметки</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.card, height: 220, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Контекст, ссылки, договорённости…"
            placeholderTextColor={c.textSecondary}
          />
          <TouchableOpacity style={[s.saveBtn, { backgroundColor: c.primary }]} onPress={flushPending}>
            <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>Сохранить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.deleteBtn, { borderColor: c.border }]} onPress={handleDelete}>
            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Удалить контакт</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {datePickerStage === 'date' && (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          maximumDate={new Date()}
          onChange={(e, date) => {
            if (e.type === 'dismissed') { setDatePickerStage(null); setDateEditMsgId(null); return; }
            if (date) {
              const merged = new Date(datePickerValue);
              merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              setDatePickerValue(merged);
              setDatePickerStage('time');
            }
          }}
        />
      )}
      {datePickerStage === 'time' && (
        <DateTimePicker
          value={datePickerValue}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, date) => {
            const id = dateEditMsgId;
            setDatePickerStage(null);
            setDateEditMsgId(null);
            if (e.type === 'dismissed' || !date || !id) return;
            const merged = new Date(datePickerValue);
            merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
            updateMessageDate(id, merged.toISOString());
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  entry: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  composerInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, maxHeight: 120, minHeight: 40 },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  saveBtn: { borderRadius: 8, padding: 12, marginTop: 16 },
  deleteBtn: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 12 },
});
