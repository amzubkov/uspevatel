import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { colors } from '../styles/theme';

interface Props {
  placeholder: string;
  onAdd: (action: string) => void;
}

export function QuickAddBar({ placeholder, onAdd }: Props) {
  const { settings } = useApp();
  const c = colors[settings.theme];
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex', gap: 8, padding: '8px 12px',
      borderBottom: `1px solid ${c.border}`,
    }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${c.border}`, backgroundColor: c.card,
          color: c.text, fontSize: settings.fontSize,
        }}
      />
      <button
        type="submit"
        style={{
          padding: '8px 16px', borderRadius: 8,
          backgroundColor: c.primary, color: '#fff',
          fontWeight: 600, fontSize: 14,
          opacity: value.trim() ? 1 : 0.5,
        }}
      >
        +
      </button>
    </form>
  );
}
