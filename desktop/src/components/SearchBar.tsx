import React from 'react';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  const { settings } = useApp();
  const c = colors[settings.theme];

  return (
    <div style={{ padding: '4px 12px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск..."
        style={{
          width: '100%', padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${c.border}`, backgroundColor: c.card,
          color: c.text, fontSize: 13,
        }}
      />
    </div>
  );
}
