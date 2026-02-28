import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation';
import { useSettingsStore } from './src/store/settingsStore';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: 'red', marginBottom: 10 }}>Ошибка!</Text>
          <Text style={{ fontSize: 14, color: '#333' }}>{this.state.error.message}</Text>
          <Text style={{ fontSize: 11, color: '#666', marginTop: 10 }}>{this.state.error.stack?.slice(0, 500)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <AppNavigator />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
