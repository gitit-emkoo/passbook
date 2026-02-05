import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  expo: {
    name: 'Passbook',
    slug: 'kimssam',
    scheme: 'passbook',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false, // 기준선 테스트: New Architecture 비활성화
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.kimssam.kwcc',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      versionCode: 7,
      targetSdkVersion: 35,
      useCleartextTraffic:
        process.env.USE_CLEARTEXT_TRAFFIC === 'true' || process.env.NODE_ENV !== 'production', // 환경변수로 제어, 기본값: 개발환경 true, 프로덕션 false
      networkSecurityConfig: './android/app/src/main/res/xml/network_security_config.xml',
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      // STEP 3: 완전 최소 네이티브 - Kotlin 버전만 강제 (빌드 성공을 위해 필수)
      './app.plugin.js', // 최소한의 Kotlin 1.9.25 설정만 적용
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#ff6b00',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '2c507d3e-8f4d-40e3-bf66-6fa305400c0f',
      },
      API_URL: process.env.API_URL || 'http://localhost:3000',
      API_KEY: process.env.API_KEY || '',
      PUBLIC_URL: process.env.PUBLIC_URL || 'https://passbook.today',
    },
  },
});

