import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

interface SwipeAction {
  label: string;
  color: string;
  onPress: () => void;
}

interface Props {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
}

export function SwipeableTask({ children, leftActions = [], rightActions = [] }: Props) {
  const [showActions, setShowActions] = useState(false);
  const fontSize = useSettingsStore((s) => s.fontSize) ?? 15;
  const allActions = [...leftActions, ...rightActions];

  if (allActions.length === 0) {
    return <>{children}</>;
  }

  return (
    <View>
      <View style={styles.wrapper}>
        <View style={styles.childWrap}>{children}</View>
        <TouchableOpacity
          style={[styles.moreBtn, { paddingVertical: Math.max(4, fontSize - 3) }]}
          onPress={() => setShowActions((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.moreDots, { fontSize: fontSize + 2 }]}>⋯</Text>
        </TouchableOpacity>
      </View>
      {showActions && (
        <View style={styles.actionsRow}>
          {allActions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.actionBtn, { backgroundColor: action.color, paddingVertical: Math.max(4, fontSize - 7), paddingHorizontal: Math.max(8, fontSize) }]}
              onPress={() => {
                setShowActions(false);
                action.onPress();
              }}
            >
              <Text style={[styles.actionText, { fontSize: fontSize - 3 }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childWrap: { flex: 1 },
  moreBtn: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  moreDots: { fontSize: 18, color: '#999', fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
