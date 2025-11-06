import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  expo: {
    name: '김쌤',
    slug: 'kimssam',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
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
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: process.env.ANDROID_ADMOB_APP_ID,
          iosAppId: process.env.IOS_ADMOB_APP_ID,
        },
      ],
      './app.plugin.js',
    ],
    extra: {
      eas: {
        projectId: '2c507d3e-8f4d-40e3-bf66-6fa305400c0f',
      },
      API_URL: process.env.API_URL || 'http://localhost:3000',
      API_KEY: process.env.API_KEY || '',
      // Google AdMob 테스트 ID (나중에 실제 앱 ID로 교체)
      ANDROID_ADMOB_APP_ID: process.env.ANDROID_ADMOB_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
      IOS_ADMOB_APP_ID: process.env.IOS_ADMOB_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
    },
  },
});

