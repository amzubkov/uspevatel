import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettingsStore } from '../store/settingsStore';
import { useDocumentStore, Document, DocumentImage } from '../store/documentStore';
import { useCarStore, Car, CarDocument, CarDocImage, CarService } from '../store/carStore';
import { AttachmentList } from '../components/AttachmentList';
import { DatePickerField } from '../components/DatePickerField';
import { colors } from '../utils/theme';
import { ZoomableImage } from '../components/ZoomableImage';
import { calendarDayDiff, todayStr } from '../utils/date';

/* ── Documents Tab ── */
function DocsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const documents = useDocumentStore((s) => s.documents);
  const images = useDocumentStore((s) => s.images);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const removeDocument = useDocumentStore((s) => s.removeDocument);
  const addImage = useDocumentStore((s) => s.addImage);
  const removeImage = useDocumentStore((s) => s.removeImage);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [fullImg, setFullImg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const visibleDocs = useMemo(() => {
    const base = documents.filter((d) => !d.notes?.startsWith('insurance:'));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((d) => d.name.toLowerCase().includes(q) || d.notes?.toLowerCase().includes(q));
  }, [documents, search]);

  const imagesFor = useCallback(
    (docId: string) => images.filter((i) => i.documentId === docId).sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const handlePickImage = async (docId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(docId, r.assets[0].uri);
  };

  const handleCamera = async (docId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(docId, r.assets[0].uri);
  };

  const handleDelete = (doc: Document) => {
    Alert.alert('Удалить?', doc.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeDocument(doc.id) },
    ]);
  };

  const handleDeleteImage = (img: DocumentImage) => {
    Alert.alert('Удалить фото?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeImage(img.id) },
    ]);
  };

  const startEdit = (doc: Document) => {
    setEditingId(doc.id); setEditName(doc.name); setEditNotes(doc.notes || '');
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    updateDocument(editingId!, { name: editName.trim(), notes: editNotes.trim() });
    setEditingId(null);
  };

  const renderDoc = ({ item }: { item: Document }) => {
    const isExpanded = expanded === item.id;
    const isEditing = editingId === item.id;
    const docImages = imagesFor(item.id);
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: c.text }]}>{item.name}</Text>
            {item.notes ? <Text style={{ color: c.textSecondary, fontSize: 11 }} numberOfLines={1}>{item.notes}</Text> : null}
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{docImages.length} фото</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.cardBody}>
            {isEditing ? (
              <View style={{ marginBottom: 8 }}>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border }]}
                  value={editName} onChangeText={setEditName} placeholder="Название" placeholderTextColor={c.textSecondary} />
                <TextInput style={[s.input, { color: c.text, borderColor: c.border }]}
                  value={editNotes} onChangeText={setEditNotes} placeholder="Заметки..." placeholderTextColor={c.textSecondary} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[s.imgBtn, { borderColor: c.primary, flex: 1, alignItems: 'center' }]} onPress={saveEdit}>
                    <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1, alignItems: 'center' }]} onPress={() => setEditingId(null)}>
                    <Text style={{ color: c.textSecondary, fontSize: 13 }}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {docImages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {docImages.map((img) => (
                  <View key={img.id} style={{ marginRight: 8, position: 'relative' }}>
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setFullImg(img.imagePath)}>
                      <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.imgDelete} onPress={() => handleDeleteImage(img)}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <AttachmentList entityType="document" entityId={item.id} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handleCamera(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Редактировать</Text>
              </TouchableOpacity>
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
      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
      {showAdd ? (
        <View style={[s.addRow, { borderColor: c.border }]}>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, flex: 1 }]}
            placeholder="Паспорт, водительские..." placeholderTextColor={c.textSecondary}
            value={newName} onChangeText={setNewName} autoFocus />
          <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary }]}
            onPress={async () => {
              if (!newName.trim()) return;
              await addDocument(newName.trim());
              setNewName(''); setShowAdd(false);
            }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowAdd(false); setNewName(''); }}>
            <Text style={{ color: c.textSecondary, fontSize: 14, paddingHorizontal: 8 }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[s.fabBtn, { backgroundColor: c.primary, margin: 12 }]}
          onPress={() => setShowAdd(true)}>
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>+ Документ</Text>
        </TouchableOpacity>
      )}
      <TextInput
        style={[s.input, { color: c.text, borderColor: c.border, marginHorizontal: 12, marginBottom: 8 }]}
        placeholder="🔍 Поиск документа..."
        placeholderTextColor={c.textSecondary}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />
      <FlatList data={visibleDocs} keyExtractor={(d) => d.id} renderItem={renderDoc}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>{search.trim() ? 'Ничего не найдено' : 'Добавьте документы'}</Text>} />
    </View>
  );
}

/* ── Cars Tab ── */
function CarsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const cars = useCarStore((s) => s.cars);
  const carDocuments = useCarStore((s) => s.carDocuments);
  const carDocImages = useCarStore((s) => s.carDocImages);
  const services = useCarStore((s) => s.services);
  const addCar = useCarStore((s) => s.addCar);
  const removeCar = useCarStore((s) => s.removeCar);
  const addCarDocument = useCarStore((s) => s.addCarDocument);
  const removeCarDocument = useCarStore((s) => s.removeCarDocument);
  const addCarDocImage = useCarStore((s) => s.addCarDocImage);
  const removeCarDocImage = useCarStore((s) => s.removeCarDocImage);
  const addService = useCarStore((s) => s.addService);
  const removeService = useCarStore((s) => s.removeService);

  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [newCarName, setNewCarName] = useState('');
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [showAddService, setShowAddService] = useState(false);
  const [svcDate, setSvcDate] = useState(todayStr());
  const [svcMileage, setSvcMileage] = useState('');
  const [svcNotes, setSvcNotes] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);

  // Auto-select first car
  const car = useMemo(() => {
    if (selectedCarId) return cars.find((c) => c.id === selectedCarId) || cars[0];
    return cars[0];
  }, [cars, selectedCarId]);

  const docsForCar = useMemo(() => car ? carDocuments.filter((d) => d.carId === car.id) : [], [carDocuments, car]);
  const servicesForCar = useMemo(() => car ? services.filter((sv) => sv.carId === car.id) : [], [services, car]);
  const lastService = servicesForCar[0];

  const imagesForDoc = useCallback(
    (docId: string) => carDocImages.filter((i) => i.carDocumentId === docId).sort((a, b) => a.sortOrder - b.sortOrder),
    [carDocImages],
  );

  const handlePickImage = async (docId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addCarDocImage(docId, r.assets[0].uri);
  };

  const handleCamera = async (docId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addCarDocImage(docId, r.assets[0].uri);
  };

  if (cars.length === 0 && !showAddCar) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: c.textSecondary, marginBottom: 12 }}>Добавьте автомобиль</Text>
        <TouchableOpacity style={[s.fabBtn, { backgroundColor: c.primary }]}
          onPress={() => setShowAddCar(true)}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>+ Авто</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
      {/* Car selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {cars.map((cr) => (
          <TouchableOpacity key={cr.id}
            style={[s.carChip, { backgroundColor: car?.id === cr.id ? c.primary : c.card, borderColor: c.border }]}
            onPress={() => setSelectedCarId(cr.id)}
            onLongPress={() => Alert.alert(cr.name, '', [
              { text: 'Удалить', style: 'destructive', onPress: () => removeCar(cr.id) },
              { text: 'Отмена', style: 'cancel' },
            ])}>
            <Text style={{ fontSize: 16 }}>🚗</Text>
            <Text style={{ color: car?.id === cr.id ? '#FFF' : c.text, fontSize: 13, fontWeight: '600' }}>{cr.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.carChip, { borderColor: c.border, backgroundColor: c.card }]}
          onPress={() => setShowAddCar(true)}>
          <Text style={{ color: c.textSecondary, fontSize: 16, fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </ScrollView>

      {showAddCar && (
        <View style={[s.addRow, { borderColor: c.border, marginBottom: 8 }]}>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, flex: 1 }]}
            placeholder="Kia Ceed, BMW X5..." placeholderTextColor={c.textSecondary}
            value={newCarName} onChangeText={setNewCarName} autoFocus />
          <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary }]}
            onPress={async () => {
              if (!newCarName.trim()) return;
              const id = await addCar(newCarName.trim());
              setSelectedCarId(id); setNewCarName(''); setShowAddCar(false);
            }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowAddCar(false); setNewCarName(''); }}>
            <Text style={{ color: c.textSecondary, paddingHorizontal: 8 }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      )}

      {car && (
        <>
          {/* Last service */}
          <Text style={[s.sectionTitle, { color: c.text }]}>Последнее ТО</Text>
          {lastService ? (
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ padding: 12 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{lastService.mileage.toLocaleString()} км</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{lastService.date}</Text>
                {lastService.notes ? <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>{lastService.notes}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>Нет записей</Text>
          )}

          {/* Service history */}
          {servicesForCar.length > 1 && (
            <>
              <Text style={[s.sectionTitle, { color: c.text, marginTop: 12 }]}>История ТО</Text>
              {servicesForCar.slice(1).map((sv) => (
                <TouchableOpacity key={sv.id} onLongPress={() => Alert.alert('Удалить?', '', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => removeService(sv.id) },
                ])} style={[s.serviceRow, { borderColor: c.border }]}>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{sv.mileage.toLocaleString()} км</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{sv.date}</Text>
                  {sv.notes ? <Text style={{ color: c.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}> — {sv.notes}</Text> : null}
                </TouchableOpacity>
              ))}
            </>
          )}

          {showAddService ? (
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, padding: 12, marginTop: 8 }]}>
              <DatePickerField value={svcDate} onChange={setSvcDate} label="Дата ТО"
                textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
              <TextInput style={[s.input, { color: c.text, borderColor: c.border }]}
                placeholder="Пробег (км)" placeholderTextColor={c.textSecondary}
                value={svcMileage} onChangeText={setSvcMileage} keyboardType="numeric" />
              <TextInput style={[s.input, { color: c.text, borderColor: c.border }]}
                placeholder="Заметки (масло, фильтры...)" placeholderTextColor={c.textSecondary}
                value={svcNotes} onChangeText={setSvcNotes} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary }]}
                  onPress={async () => {
                    const m = parseInt(svcMileage);
                    if (isNaN(m)) { Alert.alert('Ошибка', 'Введите пробег'); return; }
                    await addService({ carId: car.id, date: svcDate, mileage: m, notes: svcNotes.trim() });
                    setSvcMileage(''); setSvcNotes(''); setShowAddService(false);
                  }}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Сохранить</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAddService(false)}>
                  <Text style={{ color: c.textSecondary, paddingVertical: 10, paddingHorizontal: 8 }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[s.fabBtn, { backgroundColor: c.primary, marginTop: 8 }]}
              onPress={() => setShowAddService(true)}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>+ ТО</Text>
            </TouchableOpacity>
          )}

          {/* Car documents */}
          <Text style={[s.sectionTitle, { color: c.text, marginTop: 16 }]}>Документы</Text>
          {docsForCar.map((doc) => {
            const isExp = expandedDoc === doc.id;
            const docImgs = imagesForDoc(doc.id);
            return (
              <View key={doc.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <TouchableOpacity style={s.cardHeader} onPress={() => setExpandedDoc(isExp ? null : doc.id)}>
                  <Text style={{ fontSize: 16 }}>📄</Text>
                  <Text style={[s.cardTitle, { color: c.text, flex: 1 }]}>{doc.name}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{docImgs.length} фото</Text>
                </TouchableOpacity>
                {isExp && (
                  <View style={s.cardBody}>
                    {docImgs.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        {docImgs.map((img) => (
                          <View key={img.id} style={{ marginRight: 8, position: 'relative' }}>
                            <TouchableOpacity activeOpacity={0.9} onPress={() => setFullImg(img.imagePath)}>
                              <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                            </TouchableOpacity>
                            <TouchableOpacity style={s.imgDelete} onPress={() =>
                              Alert.alert('Удалить фото?', '', [
                                { text: 'Отмена', style: 'cancel' },
                                { text: 'Удалить', style: 'destructive', onPress: () => removeCarDocImage(img.id) },
                              ])}>
                              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(doc.id)}>
                        <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handleCamera(doc.id)}>
                        <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={{ marginTop: 10 }} onPress={() =>
                      Alert.alert('Удалить?', doc.name, [
                        { text: 'Отмена', style: 'cancel' },
                        { text: 'Удалить', style: 'destructive', onPress: () => removeCarDocument(doc.id) },
                      ])}>
                      <Text style={{ color: '#EF4444', fontSize: 13 }}>Удалить</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {showAddDoc ? (
            <View style={[s.addRow, { borderColor: c.border, marginTop: 8 }]}>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, flex: 1 }]}
                placeholder="СТС, ОСАГО, ПТС..." placeholderTextColor={c.textSecondary}
                value={newDocName} onChangeText={setNewDocName} autoFocus />
              <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary }]}
                onPress={async () => {
                  if (!newDocName.trim() || !car) return;
                  await addCarDocument(car.id, newDocName.trim());
                  setNewDocName(''); setShowAddDoc(false);
                }}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddDoc(false); setNewDocName(''); }}>
                <Text style={{ color: c.textSecondary, paddingHorizontal: 8 }}>Отмена</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[s.fabBtn, { backgroundColor: c.primary, marginTop: 8 }]}
              onPress={() => setShowAddDoc(true)}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>+ Документ авто</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

/* ── Insurance Tab ── */
function InsuranceContent() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const documents = useDocumentStore((s) => s.documents);
  const images = useDocumentStore((s) => s.images);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const removeDocument = useDocumentStore((s) => s.removeDocument);
  const addImage = useDocumentStore((s) => s.addImage);
  const removeImage = useDocumentStore((s) => s.removeImage);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullImg, setFullImg] = useState<string | null>(null);

  // Insurance docs have notes starting with "insurance:"
  const insuranceDocs = useMemo(() => documents.filter((d) => d.notes?.startsWith('insurance:')), [documents]);

  const imagesFor = useCallback(
    (docId: string) => images.filter((i) => i.documentId === docId).sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const handlePickImage = async (docId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(docId, r.assets[0].uri);
  };

  const handleCamera = async (docId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(docId, r.assets[0].uri);
  };

  const getExpiry = (doc: Document): string | null => {
    const m = doc.notes?.match(/^insurance:(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };

  const daysUntil = (dateStr: string): number => {
    return calendarDayDiff(dateStr, todayStr());
  };

  return (
    <View style={{ flex: 1 }}>
      <ZoomableImage uri={fullImg} onClose={() => setFullImg(null)} />
      {showAdd ? (
        <InsuranceForm c={c} onSave={async (name, expiry) => {
          const id = await addDocument(name);
          await updateDocument(id, { notes: `insurance:${expiry}` });
          setShowAdd(false);
        }} onCancel={() => setShowAdd(false)} />
      ) : (
        <TouchableOpacity style={[s.fabBtn, { backgroundColor: c.primary, margin: 12 }]} onPress={() => setShowAdd(true)}>
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>+ Страховка</Text>
        </TouchableOpacity>
      )}
      <FlatList data={insuranceDocs} keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет страховок</Text>}
        renderItem={({ item }) => {
          const isExp = expanded === item.id;
          const docImages = imagesFor(item.id);
          const expiry = getExpiry(item);
          const days = expiry ? daysUntil(expiry) : null;
          return (
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExp ? null : item.id)}>
                <Text style={{ fontSize: 20 }}>🛡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]}>{item.name}</Text>
                  {expiry && (
                    <Text style={{ color: days != null && days < 30 ? '#EF4444' : days != null && days < 90 ? '#F59E0B' : c.textSecondary, fontSize: 11 }}>
                      до {expiry}{days != null ? ` (${days > 0 ? `${days} дн.` : 'истекла!'})` : ''}
                    </Text>
                  )}
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{docImages.length} фото</Text>
              </TouchableOpacity>
              {isExp && (
                <View style={s.cardBody}>
                  {docImages.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {docImages.map((img) => (
                        <View key={img.id} style={{ marginRight: 8, position: 'relative' }}>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => setFullImg(img.imagePath)}>
                            <Image source={{ uri: img.imagePath }} style={s.docImg} resizeMode="cover" />
                          </TouchableOpacity>
                          <TouchableOpacity style={s.imgDelete} onPress={() =>
                            Alert.alert('Удалить фото?', '', [
                              { text: 'Отмена', style: 'cancel' },
                              { text: 'Удалить', style: 'destructive', onPress: () => removeImage(img.id) },
                            ])}>
                            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handlePickImage(item.id)}>
                      <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.imgBtn, { borderColor: c.border }]} onPress={() => handleCamera(item.id)}>
                      <Text style={{ color: c.textSecondary, fontSize: 13 }}>Камера</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={{ marginTop: 10 }} onPress={() =>
                    Alert.alert('Удалить?', item.name, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => removeDocument(item.id) },
                    ])}>
                    <Text style={{ color: '#EF4444', fontSize: 13 }}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function InsuranceForm({ c, onSave, onCancel }: { c: any; onSave: (name: string, expiry: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  return (
    <View style={{ padding: 12 }}>
      <TextInput style={[s.input, { color: c.text, borderColor: c.border }]}
        placeholder="Название (ОСАГО, ДМС, путешественника...)" placeholderTextColor={c.textSecondary}
        value={name} onChangeText={setName} autoFocus />
      <DatePickerField value={expiry} onChange={setExpiry} label="Дата истечения"
        textColor={c.text} borderColor={c.border} secondaryColor={c.textSecondary} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: c.primary, flex: 1, alignItems: 'center' }]}
          onPress={() => { if (!name.trim() || !expiry) { Alert.alert('Заполните поля'); return; } onSave(name.trim(), expiry); }}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Добавить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flex: 1, alignItems: 'center' }]} onPress={onCancel}>
          <Text style={{ color: c.text }}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Main Screen ── */
const MODES = [
  { key: 'docs' as const, label: 'Документы', icon: '📄' },
  { key: 'insurance' as const, label: 'Страховки', icon: '🛡' },
  { key: 'cars' as const, label: 'Авто', icon: '🚗' },
];

type Mode = 'docs' | 'insurance' | 'cars';

export function DocumentsScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const [mode, setMode] = useState<Mode>('docs');

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={s.modeRow}>
        {MODES.map((m) => (
          <TouchableOpacity key={m.key}
            style={[s.modeBtn, { backgroundColor: mode === m.key ? c.primary : c.card, borderColor: c.border, borderWidth: 1 }]}
            onPress={() => setMode(m.key)}>
            <Text style={{ fontSize: 16 }}>{m.icon}</Text>
            <Text style={{ color: mode === m.key ? '#FFF' : c.text, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'docs' ? <DocsContent /> : mode === 'insurance' ? <InsuranceContent /> : <CarsContent />}
    </View>
  );
}

const s = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  card: { borderWidth: 1, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  fabBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  docImg: { width: 200, height: 260, borderRadius: 8 },
  imgDelete: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  imgBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  carChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 6 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5 },
});
