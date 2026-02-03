import React, { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AuthStackParamList } from '../navigation/AppNavigator';

const logoImage = require('../../assets/login3.png');

type SplashNav = NativeStackNavigationProp<AuthStackParamList, 'AuthSplash'>;

export default function AuthSplashScreen() {
  const navigation = useNavigation<SplashNav>();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) return;

    const checkSkipAndNavigate = async () => {
      try {
        const raw = await AsyncStorage.getItem('onboarding_promo_skip_until');
        let shouldSkipPromo = false;
        if (raw) {
          const skipUntil = new Date(raw).getTime();
          if (!Number.isNaN(skipUntil) && Date.now() < skipUntil) {
            shouldSkipPromo = true;
          }
        }
        // 짧은 딜레이 후 화면 전환 (스플래시 감성)
        setTimeout(() => {
          if (hasNavigated.current) return;
          hasNavigated.current = true;
          
          try {
            if (shouldSkipPromo) {
              navigation.replace('PhoneAuth');
            } else {
              navigation.replace('AuthPromo');
            }
          } catch (error) {
            console.error('[AuthSplash] Navigation error:', error);
            // 폴백: PhoneAuth로 이동
            try {
              navigation.replace('PhoneAuth');
            } catch (e) {
              console.error('[AuthSplash] Fallback navigation error:', e);
            }
          }
        }, 800);
      } catch (e) {
        console.error('[AuthSplash] Error:', e);
        // 에러시 그냥 바로 로그인 화면으로
        if (!hasNavigated.current) {
          hasNavigated.current = true;
          setTimeout(() => {
            try {
              navigation.replace('PhoneAuth');
            } catch (error) {
              console.error('[AuthSplash] Error navigation error:', error);
            }
          }, 800);
        }
      }
    };

    // 네비게이션이 준비될 때까지 약간의 딜레이
    const timer = setTimeout(() => {
      checkSkipAndNavigate();
    }, 100);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <Container>
      <LogoCard>
        <LogoImage source={logoImage} resizeMode="contain" />
      </LogoCard>
      <LoadingRow>
        <ActivityIndicator color="#1d42d8" />
      </LoadingRow>
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: #ffffff;
  justify-content: center;
  align-items: center;
`;

const LogoCard = styled.View`
  width: 140px;
  height: 140px;
  border-radius: 32px;
  background-color: #ffffff;
  justify-content: center;
  align-items: center;
  shadow-color: #000000;
  shadow-opacity: 0.15;
  shadow-radius: 20px;
  shadow-offset: 0px 8px;
  elevation: 6;
`;

const LogoImage = styled.Image`
  width: 96px;
  height: 96px;
  border-radius: 24px;
`;

const LoadingRow = styled.View`
  position: absolute;
  bottom: 60px;
`;



