import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../store/settingsStore';
import { useContactStore, Contact } from '../store/contactStore';
import { colors } from '../utils/theme';

function fmtAgo(iso: string): string {
  const then = new Date(iso);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.max(0, Math.round((b - a) / 86400000));
  return `${days}d`;
}

export function ContactsScreen() {
  const navigation = useNavigation<any>();
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const contacts = useContactStore((s) => s.contacts);
  const addContact = useContactStore((s) => s.addContact);
  const removeContact = useContactStore((s) => s.removeContact);
  const lastMessageFor = useContactStore((s) => s.lastMessageFor);
  useContactStore((s) => s.messages);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const reset = () => { setName(''); setShowAdd(false); };

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    const id = await addContact({ name: name.trim(), notes: '', tags: [] });
    reset();
    navigation.navigate('ContactDetail', { contactId: id });
  };

  const handleDelete = (item: Contact) => {
    Alert.alert('Удалить контакт?', item.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeContact(item.id) },
    ]);
  };

  // Distinct tags with counts.
  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const ct of contacts) for (const t of ct.tags) map.set(t, (map.get(t) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((ct) => {
      if (activeTag && !ct.tags.includes(activeTag)) return false;
      if (!q) return true;
      if (ct.name.toLowerCase().includes(q)) return true;
      if (ct.notes.toLowerCase().includes(q)) return true;
      if (ct.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [contacts, activeTag, query]);

  if (showAdd) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 12 }}>
        <Text style={[s.formTitle, { color: c.text }]}>Новый контакт</Text>
        <TextInput
          style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          placeholder="Имя"
          placeholderTextColor={c.textSecondary}
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleAdd}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Добавить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.textSecondary, flex: 1 }]} onPress={reset}>
            <Text style={[s.btnText, { textAlign: 'center' }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 12, marginBottom: 8 }}>
        <TextInput
          style={[s.searchInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          placeholder="Поиск: имя, тег, заметка"
          placeholderTextColor={c.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <TouchableOpacity
          style={[s.fab, { backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }]}
          onPress={() => setShowAdd(true)}
        >
          <Text style={s.fabText}>+</Text>
        </TouchableOpacity>
      </View>
      {allTags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6, alignItems: 'center' }}
        >
          <TouchableOpacity
            onPress={() => setActiveTag(null)}
            style={[s.filterChip, { borderColor: c.border, backgroundColor: activeTag === null ? c.primary : c.card }]}
          >
            <Text style={{ color: activeTag === null ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>
              Все ({contacts.length})
            </Text>
          </TouchableOpacity>
          {allTags.map(([t, n]) => {
            const active = activeTag === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setActiveTag(active ? null : t)}
                style={[s.filterChip, { borderColor: c.border, backgroundColor: active ? c.primary : c.card }]}
              >
                <Text style={{ color: active ? '#FFF' : c.text, fontSize: 12, fontWeight: '600' }}>
                  {t} ({n})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const last = lastMessageFor(item.id);
          return (
          <TouchableOpacity
            style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
            onLongPress={() => handleDelete(item)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.name}</Text>
              {last && (
                <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600' }}>{fmtAgo(last.createdAt)}</Text>
              )}
              {item.tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: '50%' }}>
                  {item.tags.map((t) => (
                    <View key={t} style={[s.tagPill, { backgroundColor: c.primary }]}>
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '600' }}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {!!item.notes && (
              <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                {item.notes}
              </Text>
            )}
          </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>
            {query.trim()
              ? `Ничего не найдено по «${query.trim()}»`
              : activeTag
                ? `Нет контактов с тегом «${activeTag}»`
                : 'Нет контактов'}
          </Text>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  fab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  fabText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  filterChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'center' },
  tagPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
});
