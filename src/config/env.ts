import Constants from 'expo-constants';

export const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = Constants.expoConfig?.extra?.[key] || process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue || '';
};

export const env = {
  API_URL: getEnvVar('API_URL', 'http://localhost:3000'),
  API_KEY: getEnvVar('API_KEY', ''),
  // Google AdMob 테스트 ID (나중에 실제 앱 ID로 교체)
  ANDROID_ADMOB_APP_ID: getEnvVar('ANDROID_ADMOB_APP_ID', 'ca-app-pub-3940256099942544~3347511713'),
  IOS_ADMOB_APP_ID: getEnvVar('IOS_ADMOB_APP_ID', 'ca-app-pub-3940256099942544~1458002511'),
};

