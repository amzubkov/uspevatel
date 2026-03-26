import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface Props {
  value: string;           // HH:MM or ''
  onChange: (time: string) => void;
  label?: string;
  textColor: string;
  borderColor: string;
  secondaryColor: string;
  backgroundColor?: string;
}

function parseTime(s: string): Date {
  const [h, m] = s.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TimePickerField({ value, onChange, label, textColor, borderColor, secondaryColor, backgroundColor }: Props) {
  const [show, setShow] = useState(false);

  const handleChange = (_: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selectedDate) onChange(toTimeStr(selectedDate));
  };

  const dateObj = value ? parseTime(value) : new Date();

  return (
    <View>
      {label && <Text style={[st.label, { color: secondaryColor }]}>{label}</Text>}
      <TouchableOpacity
        style={[st.field, { borderColor, backgroundColor: backgroundColor || 'transparent' }]}
        onPress={() => setShow(true)}
      >
        <Text style={{ color: value ? textColor : secondaryColor, fontSize: 15 }}>
          {value || 'Выберите время'}
        </Text>
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: secondaryColor, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      {show && (
        <>
          <DateTimePicker
            value={dateObj}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={st.doneBtn} onPress={() => setShow(false)}>
              <Text style={{ color: '#007AFF', fontWeight: '600', fontSize: 15 }}>Готово</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12 },
});
