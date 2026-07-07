import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, Alert } from 'react-native';
import { ZoomableImage } from '../../components/ZoomableImage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useFlightStore, Flight } from '../../store/flightStore';
import { ME_TRAVELER } from '../../store/travelerStore';
import { AttachmentList } from '../../components/AttachmentList';
import { useAttachmentStore } from '../../store/attachmentStore';
import { useSettingsStore } from '../../store/settingsStore';
import { colors } from '../../utils/theme';
import { s, fmtFlightDate, fmtHotelDate, fmtEventDate, STATUS_LABELS, STATUS_COLORS, KIND_EMOJI } from './shared';

// ─── History sub-tab ───
export function HistoryContent({ travelerId }: { travelerId: string }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const flights = useFlightStore((s) => s.flights);
  const updateFlight = useFlightStore((s) => s.updateFlight);
  const removeFlight = useFlightStore((s) => s.removeFlight);
  const removeImage = useFlightStore((s) => s.removeImage);
  const addImage = useFlightStore((s) => s.addImage);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  const history = useMemo(() => {
    const isAll = travelerId === '__all__';
    const isMe = travelerId === ME_TRAVELER.id;
    return flights
      .filter((f) => f.status === 'completed' || f.status === 'cancelled')
      .filter((f) => isAll ? true : isMe ? f.travelerIds.length === 0 || f.travelerIds.includes(ME_TRAVELER.id) : f.travelerIds.includes(travelerId))
      .sort((a, b) => {
        const cmp = b.departDate.localeCompare(a.departDate);
        if (cmp !== 0) return cmp;
        return (b.departTime || '00:00').localeCompare(a.departTime || '00:00');
      });
  }, [flights, travelerId]);

  const handleDelete = (flight: Flight) => {
    Alert.alert('Удалить?', flight.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFlight(flight.id) },
    ]);
  };

  const handleRestore = (flight: Flight) => {
    updateFlight(flight.id, { status: 'planned' });
  };

  const handlePickImage = async (id: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) await addImage(id, r.assets[0].uri);
  };

  const renderItem = ({ item }: { item: Flight }) => {
    const isExpanded = expanded === item.id;
    const sc = STATUS_COLORS[item.status];
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded(isExpanded ? null : item.id)}>
          <Text style={{ fontSize: 20 }}>{KIND_EMOJI[item.kind]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: c.text }]}>{item.title}{item.flightNumber ? ` ${item.flightNumber}` : ''}</Text>
            {item.city ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{item.city}</Text> : null}
            <Text style={[s.cardDate, { color: c.textSecondary }]}>
              {item.kind === 'flight' ? fmtFlightDate(item) : item.kind === 'event' ? fmtEventDate(item) : fmtHotelDate(item)}
              {item.price ? `  ${item.price} ${item.currency === 'EUR' ? '€' : '₽'}` : ''}
            </Text>
          </View>
          <Text style={[s.statusBadge, { color: sc, borderColor: sc }]}>{STATUS_LABELS[item.status]}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.cardBody}>
            {item.notes ? <Text style={[s.notes, { color: c.textSecondary }]}>{item.notes}</Text> : null}

            {item.imageData && (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomUri(item.imageData!)}>
                  <Image source={{ uri: item.imageData }} style={s.flightImg} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity style={s.imgDelete} onPress={() => removeImage(item.id)}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            <AttachmentList entityType="flight" entityId={item.id} hideAddButton />
            <View style={s.imgButtons}>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1 }]} onPress={() => handlePickImage(item.id)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Галерея</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.imgBtn, { borderColor: c.border, flex: 1 }]} onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
                if (result.canceled || !result.assets?.[0]) return;
                const a = result.assets[0];
                await addAttachment('flight', item.id, a.uri, a.name, a.mimeType, a.size);
              }}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Файл</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <TouchableOpacity onPress={() => handleRestore(item)}>
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Восстановить</Text>
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
    <>
    <ZoomableImage uri={zoomUri} onClose={() => setZoomUri(null)} />
    <FlatList
      data={history}
      keyExtractor={(f) => f.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20 }}
      ListEmptyComponent={<Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 40 }}>Нет завершённых перелётов</Text>}
    />
    </>
  );
}
