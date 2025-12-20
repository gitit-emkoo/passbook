import React from 'react';
import { StatusBar } from 'react-native';
import styled from 'styled-components/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AuthStackParamList } from '../navigation/AppNavigator';

const promoImage = require('../../assets/on.png');

type PromoNav = NativeStackNavigationProp<AuthStackParamList, 'AuthPromo'>;

export default function AuthPromoScreen() {
  const navigation = useNavigation<PromoNav>();

  const handleStart = () => {
    navigation.replace('PhoneAuth');
  };

  const handleSkip7Days = async () => {
    try {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const skipUntil = new Date(Date.now() + sevenDaysMs).toISOString();
      await AsyncStorage.setItem('onboarding_promo_skip_until', skipUntil);
    } catch {
      // 실패하더라도 그냥 넘어감
    } finally {
      navigation.replace('PhoneAuth');
    }
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <BackgroundImage source={promoImage} resizeMode="cover">
        <BottomArea>
          <PrimaryButton onPress={handleStart} activeOpacity={0.9}>
            <PrimaryButtonText>시작하기</PrimaryButtonText>
          </PrimaryButton>
          <SkipRow>
            <SkipTextButton onPress={handleSkip7Days}>
              <SkipText>7일간 보지 않기</SkipText>
            </SkipTextButton>
          </SkipRow>
        </BottomArea>
      </BackgroundImage>
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: #000000;
`;

const BackgroundImage = styled.ImageBackground`
  flex: 1;
  justify-content: flex-end;
`;

const BottomArea = styled.View`
  padding: 24px 20px 32px;
`;

const PrimaryButton = styled.TouchableOpacity`
  background-color: #1d42d8;
  padding: 16px;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
`;

const PrimaryButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
`;

const SkipRow = styled.View`
  margin-top: 12px;
  align-items: center;
`;

const SkipTextButton = styled.TouchableOpacity``;

const SkipText = styled.Text`
  color: #e5e7eb;
  font-size: 13px;
`;



