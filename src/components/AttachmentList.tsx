import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useAttachmentStore, resolveAttachmentUri } from '../store/attachmentStore';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../utils/theme';

const MIME_ICONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/': 'TXT',
  'image/': 'IMG',
  'application/json': 'JSON',
};

function fileIcon(mime?: string): string {
  if (!mime) return 'FILE';
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(prefix)) return icon;
  }
  return 'FILE';
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function AttachmentList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const allAttachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);
  const attachments = useMemo(
    () => allAttachments.filter((a) => a.entityType === entityType && a.entityId === entityId),
    [allAttachments, entityType, entityId],
  );

  const handlePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await addAttachment(entityType, entityId, asset.uri, asset.name, asset.mimeType, asset.size);
  };

  const handleOpen = async (a: typeof attachments[0]) => {
    const uri = resolveAttachmentUri(a);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: a.mimeType, dialogTitle: a.name });
    } else {
      Alert.alert('Ошибка', 'Не удаётся открыть файл');
    }
  };

  const handleDelete = (a: typeof attachments[0]) => {
    Alert.alert('Удалить?', a.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeAttachment(a.id) },
    ]);
  };

  return (
    <View style={st.container}>
      {attachments.length > 0 && attachments.map((a) => (
        <TouchableOpacity key={a.id} style={[st.row, { borderColor: c.border }]} onPress={() => handleOpen(a)} onLongPress={() => handleDelete(a)}>
          <View style={[st.icon, { backgroundColor: c.primaryLight }]}>
            <Text style={{ color: c.primary, fontSize: 10, fontWeight: '700' }}>{fileIcon(a.mimeType)}</Text>
          </View>
          <Text style={{ color: c.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{a.name}</Text>
          {a.size ? <Text style={{ color: c.textSecondary, fontSize: 11 }}>{formatSize(a.size)}</Text> : null}
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[st.addBtn, { borderColor: c.border }]} onPress={handlePick}>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>+ Файл</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5 },
  icon: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 6 },
});
