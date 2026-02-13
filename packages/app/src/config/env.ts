import Constants from 'expo-constants';

export const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = Constants.expoConfig?.extra?.[key] || process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue || '';
};

// 프로덕션 환경에서는 환경변수가 필수이므로 기본값을 프로덕션 URL로 설정
const getDefaultApiUrl = () => {
  // EAS 빌드 시 process.env.NODE_ENV가 설정되지 않을 수 있으므로
  // __DEV__ 플래그로 판단 (개발 모드가 아니면 프로덕션으로 간주)
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://localhost:3000';
  }
  return 'https://kimssam-backend.fly.dev';
};

export const env = {
  API_URL: getEnvVar('API_URL', getDefaultApiUrl()),
  API_KEY: getEnvVar('API_KEY', ''),
  PUBLIC_URL: getEnvVar('PUBLIC_URL', 'https://passbook.today'),
};

