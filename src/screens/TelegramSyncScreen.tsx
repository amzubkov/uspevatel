import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { TelegramSync } from '../components/TelegramSync';

export function TelegramSyncScreen() {
  const navigation = useNavigation();
  return <TelegramSync onClose={() => navigation.goBack()} />;
}
