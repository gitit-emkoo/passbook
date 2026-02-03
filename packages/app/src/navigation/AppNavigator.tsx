import React, { useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions, NavigationContainerRef, useNavigation, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TouchableOpacity, View, ImageSourcePropType, Linking } from 'react-native';
import { useAuthStore } from '../store/useStore';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '../services/pushNotificationService';
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import AuthSplashScreen from '../screens/AuthSplashScreen';
import AuthPromoScreen from '../screens/AuthPromoScreen';
import SignupScreen from '../screens/SignupScreen';
import HomeScreen from '../screens/HomeScreen';
import StudentsListScreen from '../screens/StudentsListScreen';
import StudentDetailScreen from '../screens/StudentDetailScreen';
import ContractViewScreen from '../screens/ContractViewScreen';
import ContractNewScreen from '../screens/ContractNewScreen';
import ContractPreviewScreen from '../screens/ContractPreviewScreen';
import SettlementScreen from '../screens/SettlementScreen';
import InvoicePreviewScreen from '../screens/InvoicePreviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { canAddContract, getSubscriptionInfo } from '../utils/subscription';
import { useStudentsStore } from '../store/useStudentsStore';
import NotificationsScreen from '../screens/NotificationsScreen';
import NoticesListScreen from '../screens/NoticesListScreen';
import NoticeDetailScreen from '../screens/NoticeDetailScreen';
import TermsScreen from '../screens/TermsScreen';
import InquiryScreen from '../screens/InquiryScreen';
import UnprocessedAttendanceScreen from '../screens/UnprocessedAttendanceScreen';
import AttendanceViewScreen from '../screens/AttendanceViewScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import RevenueStatisticsScreen from '../screens/RevenueStatisticsScreen';
import ContractStatisticsScreen from '../screens/ContractStatisticsScreen';
import UsageAmountStatisticsScreen from '../screens/UsageAmountStatisticsScreen';
import UsageCountStatisticsScreen from '../screens/UsageCountStatisticsScreen';
import AllSchedulesScreen from '../screens/AllSchedulesScreen';
import styled from 'styled-components/native';

export type AuthStackParamList = {
  AuthSplash: undefined;
  AuthPromo: undefined;
  PhoneAuth: undefined;
  Signup: {
    phone: string;
    temporaryToken: string;
  };
};

export type StudentsStackParamList = {
  StudentsList: undefined;
  StudentDetail: { studentId: number };
  ContractView: { contractId: number };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const StudentsStackNavigator = createNativeStackNavigator<StudentsStackParamList>();

const homeIcon = require('../../assets/home.png');
const studentIcon = require('../../assets/student.png');
const invoiceIcon = require('../../assets/invoice.png');
const myIcon = require('../../assets/my.png');
const noteIcon = require('../../assets/note.png');

interface TabIconImageProps {
  source: ImageSourcePropType;
  focused: boolean;
}

const TabIconImage = styled.Image.attrs<TabIconImageProps>((props: TabIconImageProps) => ({
  resizeMode: 'contain' as const,
}))<TabIconImageProps>`
  width: 24px;
  height: 24px;
  tint-color: ${(props: TabIconImageProps) => (props.focused ? '#1d42d8' : '#999')};
  opacity: ${(props: TabIconImageProps) => (props.focused ? 1 : 0.6)};
`;

// 플로팅 버튼용 빈 화면 컴포넌트
const EmptyScreen = () => null;

// 플로팅 버튼 스타일 컴포넌트
interface FABButtonProps {
  size: number;
}

const FABButton = styled.TouchableOpacity<FABButtonProps>`
  width: ${(props: FABButtonProps) => props.size}px;
  height: ${(props: FABButtonProps) => props.size}px;
  border-radius: ${(props: FABButtonProps) => props.size / 2}px;
  border-width: 2px;
  border-color: #1d42d8;
  background-color: #ffffff;
  align-items: center;
  justify-content: center;
  elevation: 0;
  shadow-opacity: 0;
  shadow-radius: 0;
  shadow-offset: 0px 0px;
  position: absolute;
  top: -${(props: FABButtonProps) => props.size / 2}px;
  align-self: center;
`;

const FABIcon = styled.Image`
  width: 28px;
  height: 28px;
  margin-top: -6px;
`;

const FABContainer = styled.View`
  align-items: center;
  justify-content: center;
`;

const FABLabel = styled.Text`
  font-size: 11px;
  color: #999;
  margin-top: 8px;
  font-weight: 500;
`;

/**
 * 수강생 스택 네비게이터
 */
export type StudentsStackNavigationProp = NativeStackNavigationProp<StudentsStackParamList>;

function StudentsStack() {
  return (
    <StudentsStackNavigator.Navigator
      initialRouteName="StudentsList"
      screenOptions={{
        headerShown: false,
      }}
    >
      <StudentsStackNavigator.Screen
        name="StudentsList"
        component={StudentsListScreen}
        options={{ headerShown: false }}
      />
      <StudentsStackNavigator.Screen
        name="StudentDetail"
        component={StudentDetailScreen}
        options={{
          title: '수강생 상세',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
      <StudentsStackNavigator.Screen
        name="ContractView"
        component={ContractViewScreen}
        options={{
          title: '이용권 계약 보기',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
    </StudentsStackNavigator.Navigator>
  );
}

export type HomeStackParamList = {
  HomeMain: undefined;
  ContractNew: undefined;
  ContractPreview: {
    contractId: number;
  };
  AttendanceView: {
    attendanceLogId: number;
    studentPhone?: string;
  };
  AllSchedules: undefined;
};

export type HomeStackNavigationProp = NativeStackNavigationProp<HomeStackParamList>;

/**
 * 홈 스택 네비게이터 (계약서 생성 포함)
 */
function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ContractNew"
        component={ContractNewScreen}
        options={{
          title: '이용권 (계약) 발행',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="ContractPreview"
        component={ContractPreviewScreen}
        options={{
          title: '이용권 확인',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="AttendanceView"
        component={AttendanceViewScreen}
        options={{
          title: '사용처리 완료 안내',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="AllSchedules"
        component={AllSchedulesScreen}
        options={{
          title: '일정 노트',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
    </Stack.Navigator>
  );
}

export type SettlementStackParamList = {
  SettlementMain: undefined;
  InvoicePreview: {
    invoiceIds: number[];
    initialIndex?: number;
  };
};

export type SettlementStackNavigationProp = NativeStackNavigationProp<SettlementStackParamList>;

/**
 * 정산 스택 네비게이터
 */
function SettlementStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="SettlementMain"
        component={SettlementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InvoicePreview"
        component={InvoicePreviewScreen}
        options={{ title: '청구서 미리보기' }}
      />
    </Stack.Navigator>
  );
}

export type MainAppStackParamList = {
  MainTabs: undefined;
  Notifications: undefined;
  NoticesList: undefined;
  NoticeDetail: { noticeId: number };
  Terms: { type: 'terms' | 'privacy' };
   Inquiry: undefined;
  UnprocessedAttendance: undefined;
  Statistics: undefined;
  RevenueStatistics: undefined;
  ContractStatistics: undefined;
  UsageAmountStatistics: undefined;
  UsageCountStatistics: undefined;
};

export type MainAppStackNavigationProp = NativeStackNavigationProp<MainAppStackParamList>;

/**
 * 메인 앱 스택 (알림 포함)
 */
function MainAppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: '알림' }}
      />
      <Stack.Screen
        name="NoticesList"
        component={NoticesListScreen}
        options={{ title: '공지사항' }}
      />
      <Stack.Screen
        name="NoticeDetail"
        component={NoticeDetailScreen}
        options={{ title: '공지사항' }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={({ route }) => ({
          title: (route.params as { type?: 'terms' | 'privacy' })?.type === 'terms' ? '서비스 이용약관' : '개인정보처리방침',
        })}
      />
      <Stack.Screen
        name="Inquiry"
        component={InquiryScreen}
        options={{ title: '문의하기' }}
      />
      <Stack.Screen
        name="UnprocessedAttendance"
        component={UnprocessedAttendanceScreen}
        options={{ title: '미처리 내역' }}
      />
      <Stack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{ title: '이번 달 이용권 통계' }}
      />
      <Stack.Screen
        name="RevenueStatistics"
        component={RevenueStatisticsScreen}
        options={{ title: '매출' }}
      />
      <Stack.Screen
        name="ContractStatistics"
        component={ContractStatisticsScreen}
        options={{ title: '이용권 발행' }}
      />
      <Stack.Screen
        name="UsageAmountStatistics"
        component={UsageAmountStatisticsScreen}
        options={{ title: '처리 금액' }}
      />
      <Stack.Screen
        name="UsageCountStatistics"
        component={UsageCountStatisticsScreen}
        options={{ title: '처리 횟수' }}
      />
    </Stack.Navigator>
  );
}

export type MainTabsParamList = {
  Home: undefined;
  Students: undefined;
  ContractAdd: undefined; // 플로팅 버튼용 빈 화면
  Settlement: undefined;
  // Settings 탭은 선택적으로 파라미터를 받을 수 있음
  Settings:
    | {
        showSubscriptionIntro?: boolean;
        isFirstTimeBonus?: boolean;
      }
    | undefined;
};

export type MainTabsNavigationProp = BottomTabNavigationProp<MainTabsParamList>;


/**
 * 하단 탭 네비게이션 설정
 * 홈 / 수강생 / [+ 버튼] / 정산 / 설정
 */
function MainTabs() {
  const FAB_SIZE = 64;

  const handleFABPress = React.useCallback(async (navigation: any) => {
    // 구독 체크
    // 현재 이용권 개수 확인 (계약이 있는 학생 수)
    const students = useStudentsStore.getState().list.items;
    const contractCount = students.filter((s) => s.latest_contract && s.latest_contract.status !== 'draft').length;
    
    const info = await getSubscriptionInfo(contractCount);
    
    // 구독이 없으면 안내 모달 표시 (일반 경로: 60일 적용)
    if (info.status === 'none') {
      // Settings 화면으로 이동하고 모달 표시 플래그 전달 (isFirstTimeBonus: false)
      navigation.navigate('Settings', { showSubscriptionIntro: true, isFirstTimeBonus: false });
      return;
    }
    
    const canAdd = await canAddContract(contractCount);
    if (!canAdd) {
      // 구독 필요 안내
      navigation.navigate('Settings');
      return;
    }
    
    // 계약서 작성 화면으로 이동
    navigation.navigate('Home', {
      screen: 'ContractNew',
    });
  }, []);

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1d42d8',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            paddingBottom: 5,
            paddingTop: 5,
            height: 60,
            elevation: 0,
            zIndex: 0,
            paddingHorizontal: 0,
          },
          tabBarItemStyle: {
            paddingVertical: 4,
          },
        }}
      >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={homeIcon} focused={focused} />
          ),
          tabBarBadge: undefined, // 알림 개수는 추후 알림 API 연동 후 설정
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.navigate({
                name: 'Home',
                params: {
                  screen: 'HomeMain',
                },
              }),
            );
          },
        })}
      />
      <Tab.Screen
        name="Students"
        component={StudentsStack}
        options={{
          title: '이용권 고객',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={studentIcon} focused={focused} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Students 탭 클릭 시 항상 목록 화면으로 리셋
            e.preventDefault(); // 기본 탭 전환 방지
            navigation.dispatch(
              CommonActions.navigate({
                name: 'Students',
                params: {
                  screen: 'StudentsList',
                },
              }),
            );
          },
        })}
      />
      <Tab.Screen
        name="ContractAdd"
        component={EmptyScreen}
        options={({ navigation }) => ({
          title: '',
          tabBarButton: () => {
            // 항상 플로팅 버튼 표시
            return (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <FABContainer>
                  <FABButton
                    size={FAB_SIZE}
                    onPress={() => handleFABPress(navigation)}
                    activeOpacity={0.8}
                  >
                    <FABIcon source={noteIcon} />
                  </FABButton>
                  <FABLabel>이용권</FABLabel>
                </FABContainer>
              </View>
            );
          },
        })}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementStack}
        options={{
          title: '청구',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={invoiceIcon} focused={focused} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // 정산 탭 클릭 시 항상 정산 메인 화면으로 리셋
            const state = navigation.getState();
            const settlementTab = state.routes.find((r) => r.name === 'Settlement');
            if (settlementTab?.state) {
              const settlementStackState = settlementTab.state as any;
              // 스택에 화면이 2개 이상이면 (메인 + 미리보기) 메인으로 리셋
              if (settlementStackState?.routes && settlementStackState.routes.length > 1) {
                e.preventDefault(); // 기본 탭 전환 방지
                // Settlement 스택을 메인 화면으로 리셋
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'Settlement',
                    params: {
                      screen: 'SettlementMain',
                    },
                  }),
                );
              }
            }
          },
        })}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '마이',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={myIcon} focused={focused} />
          ),
        }}
        />
      </Tab.Navigator>
    </>
  );
}

/**
 * 앱 네비게이터 (인증 상태에 따라 분기)
 */
export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadAuth = useAuthStore((state) => state.loadAuth);

  // 앱 시작 시 자동 로그인 확인
  useEffect(() => {
    loadAuth();
  }, [loadAuth]);
  const notificationCleanup = useRef<(() => void) | null>(null);
  const linkingCleanup = useRef<(() => void) | null>(null);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // 경로 기반 화면 이동 처리 (알림 및 딥링크 공통)
  const handleNotificationNavigation = (targetRoute: string) => {
    if (!navigationRef.current) {
      return;
    }

    try {
      // targetRoute 파싱: /settlement, /students/3, /notifications 등
      if (targetRoute === '/settlement' || targetRoute.startsWith('/settlement')) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'MainTabs',
            params: {
              screen: 'Settlement',
            },
          }),
        );
      } else if (targetRoute.startsWith('/students/')) {
        // /students/3 형식
        const studentIdMatch = targetRoute.match(/\/students\/(\d+)/);
        if (studentIdMatch) {
          const studentId = parseInt(studentIdMatch[1], 10);
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'MainTabs',
              params: {
                screen: 'Students',
                params: {
                  screen: 'StudentDetail',
                  params: { studentId },
                },
              },
            }),
          );
        }
      } else if (targetRoute === '/notifications' || targetRoute.startsWith('/notifications')) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'Notifications',
          }),
        );
      } else if (targetRoute === '/home' || targetRoute === '/') {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'MainTabs',
            params: {
              screen: 'Home',
            },
          }),
        );
      } else if (targetRoute === '/settings' || targetRoute.startsWith('/settings')) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'MainTabs',
            params: {
              screen: 'Settings',
            },
          }),
        );
      } else if (targetRoute === '/notices' || targetRoute.startsWith('/notices')) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'NoticesList',
          }),
        );
      } else if (targetRoute.startsWith('/contracts/')) {
        // /contracts/3 형식
        const contractIdMatch = targetRoute.match(/\/contracts\/(\d+)/);
        if (contractIdMatch) {
          const contractId = parseInt(contractIdMatch[1], 10);
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'MainTabs',
              params: {
                screen: 'Students',
                params: {
                  screen: 'ContractView',
                  params: { contractId },
                },
              },
            }),
          );
        }
      }
    } catch (error: any) {
      console.error('[AppNavigator] Failed to navigate from notification:', error);
    }
  };

  // 딥링크 처리 함수
  const handleDeepLink = (url: string) => {
    try {
      // passbook:// 형식 처리
      if (url.startsWith('passbook://')) {
        // passbook:///home 또는 passbook://home 형식 모두 처리
        const path = url.replace('passbook://', '').replace(/^\/+/, '/');
        handleNotificationNavigation(path || '/');
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        // 웹 URL은 외부 브라우저로 열기
        Linking.openURL(url).catch((error) => {
          console.error('[AppNavigator] Failed to open URL:', error);
        });
      }
    } catch (error: any) {
      console.error('[AppNavigator] Failed to handle deep link:', error);
    }
  };

  // FCM 토큰 등록 및 알림 리스너 설정
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // FCM 토큰 등록
    registerForPushNotificationsAsync().catch((error) => {
      console.warn('[AppNavigator] Push notification registration failed:', error?.message);
    });

    // 알림 리스너 설정
    notificationCleanup.current = setupNotificationListeners(
      (notification) => {
        if (__DEV__) {
          console.log('[AppNavigator] Notification received:', notification);
        }
      },
      (response) => {
        if (__DEV__) {
          console.log('[AppNavigator] Notification tapped:', response);
        }
        const data = response.notification.request.content.data;
        if (data && typeof data === 'object' && 'targetRoute' in data && typeof data.targetRoute === 'string') {
          handleNotificationNavigation(data.targetRoute);
        }
      },
    );

    return () => {
      if (notificationCleanup.current) {
        notificationCleanup.current();
      }
    };
  }, [isAuthenticated]);

  // 딥링크 리스너 설정
  useEffect(() => {
    // 앱이 실행 중일 때 딥링크 처리
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        if (__DEV__) {
          console.log('[AppNavigator] Initial URL:', initialUrl);
        }
        handleDeepLink(initialUrl);
      }
    };

    // 앱이 백그라운드에서 포그라운드로 올 때 딥링크 처리
    const linkingListener = Linking.addEventListener('url', (event) => {
      if (__DEV__) {
        console.log('[AppNavigator] Deep link received:', event.url);
      }
      handleDeepLink(event.url);
    });

    linkingCleanup.current = () => {
      linkingListener.remove();
    };

    handleInitialURL();

    return () => {
      if (linkingCleanup.current) {
        linkingCleanup.current();
      }
    };
  }, [isAuthenticated]);

  // 인증되지 않은 경우 로그인 화면 표시
  if (!isAuthenticated) {
    return (
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName="AuthSplash"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="AuthSplash" component={AuthSplashScreen} />
          <Stack.Screen name="AuthPromo" component={AuthPromoScreen} />
          <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // 인증된 경우 메인 앱 표시
  return (
    <NavigationContainer ref={navigationRef}>
      <MainAppStack />
    </NavigationContainer>
  );
}

