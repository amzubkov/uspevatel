import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface Props {
  value: string;           // YYYY-MM-DD or ''
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  textColor: string;
  borderColor: string;
  secondaryColor: string;
  backgroundColor?: string;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function DatePickerField({ value, onChange, placeholder, label, textColor, borderColor, secondaryColor, backgroundColor }: Props) {
  const [show, setShow] = useState(false);

  const handleChange = (_: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selectedDate) onChange(toDateStr(selectedDate));
  };

  const handleClear = () => { onChange(''); };

  const dateObj = value ? parseDate(value) : new Date();

  return (
    <View>
      {label && <Text style={[st.label, { color: secondaryColor }]}>{label}</Text>}
      <TouchableOpacity
        style={[st.field, { borderColor, backgroundColor: backgroundColor || 'transparent' }]}
        onPress={() => setShow(true)}
      >
        <Text style={{ color: value ? textColor : secondaryColor, fontSize: 15 }}>
          {value || placeholder || 'Выберите дату'}
        </Text>
        {value ? (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: secondaryColor, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      {show && (
        <>
          <DateTimePicker
            value={dateObj}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
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
