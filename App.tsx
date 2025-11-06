import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/useStore';

export default function App() {
  const loadAuth = useAuthStore((state) => state.loadAuth);

  useEffect(() => {
    // 앱 시작 시 저장된 인증 정보 로드
    loadAuth();
  }, [loadAuth]);

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
