import React, { useEffect, useRef } from 'react';
import { Modal, TouchableOpacity, Dimensions, Linking, Animated } from 'react-native';
import styled from 'styled-components/native';
import { Popup } from '../../api/popups';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ModalOverlay = styled(Animated.View)`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.3);
  justify-content: flex-end;
`;

const PopupContainer = styled(Animated.View)`
  background-color: #ffffff;
  width: 100%;
  height: ${SCREEN_HEIGHT * 0.45}px;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  overflow: hidden;
  shadow-color: #000;
  shadow-offset: 0px -2px;
  shadow-opacity: 0.25;
  shadow-radius: 8px;
  elevation: 10;
  position: relative;
`;

const ContentRow = styled.View`
  flex: 1;
  padding: 20px;
  align-items: center;
  justify-content: center;
`;

const ImageContainer = styled.TouchableOpacity`
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.2);
`;

const PopupImage = styled.Image`
  width: 100%;
  height: 100%;
  resize-mode: contain;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  background-color: #ffffff;
  padding: 12px 20px;
  border-top-width: 1px;
  border-top-color: rgba(255, 255, 255, 0.2);
`;

const Button = styled.TouchableOpacity`
  flex: 1;
  padding: 14px;
  align-items: center;
  justify-content: center;
`;

const ButtonText = styled.Text`
  color: #333333;
  font-size: 15px;
  font-weight: 600;
`;

const Divider = styled.View`
  width: 1px;
  background-color: #e0e0e0;
  margin: 0 8px;
`;

interface RemotePopupModalProps {
  visible: boolean;
  popup: Popup | null;
  onClose: () => void;
  onDontShowToday?: () => void;
}

/**
 * 관리자 페이지에서 생성한 바텀시트 팝업을 표시하는 모달
 * 화면 높이의 45%를 차지하는 하단 팝업
 */
export default function RemotePopupModal({
  visible,
  popup,
  onClose,
  onDontShowToday,
}: RemotePopupModalProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // 배경 레이어 페이드 인
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // 팝업 컨테이너 슬라이드 업
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // 배경 레이어 페이드 아웃
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // 팝업 컨테이너 슬라이드 다운
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!popup) return null;

  const handleImagePress = async () => {
    if (popup.link_url) {
      try {
        const canOpen = await Linking.canOpenURL(popup.link_url);
        if (canOpen) {
          await Linking.openURL(popup.link_url);
        } else {
          console.warn('[Popup] Cannot open URL:', popup.link_url);
        }
      } catch (error) {
        console.error('[Popup] Error opening URL:', error);
      }
    }
  };

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="none" 
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        activeOpacity={1} 
        style={{ flex: 1 }} 
        onPress={onClose}
      >
        <ModalOverlay style={{ opacity: fadeAnim }}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <PopupContainer style={{ transform: [{ translateY: slideAnim }] }}>
              <ContentRow>
                {popup.image_url ? (
                  <ImageContainer 
                    onPress={handleImagePress}
                    disabled={!popup.link_url}
                    activeOpacity={popup.link_url ? 0.7 : 1}
                  >
                    <PopupImage source={{ uri: popup.image_url }} />
                  </ImageContainer>
                ) : null}
              </ContentRow>
              
              <ButtonRow>
                {onDontShowToday && (
                  <>
                    <Button onPress={onDontShowToday}>
                      <ButtonText>오늘은 그만 보기</ButtonText>
                    </Button>
                    <Divider />
                  </>
                )}
                <Button onPress={onClose}>
                  <ButtonText>닫기</ButtonText>
                </Button>
              </ButtonRow>
            </PopupContainer>
          </TouchableOpacity>
        </ModalOverlay>
      </TouchableOpacity>
    </Modal>
  );
}

