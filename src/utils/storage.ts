import AsyncStorage from '@react-native-async-storage/async-storage';
import { StateStorage } from 'zustand/middleware';

export const zustandStorage: StateStorage = {
  getItem: async (name: string) => {
    try {
      return (await AsyncStorage.getItem(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch {}
  },
  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {}
  },
};
