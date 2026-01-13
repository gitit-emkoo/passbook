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
};

