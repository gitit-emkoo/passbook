import React, { useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TouchableOpacity, View, ImageSourcePropType } from 'react-native';
import { useAuthStore } from '../store/useStore';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '../services/pushNotificationService';
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import SignupScreen from '../screens/SignupScreen';
import HomeScreen from '../screens/HomeScreen';
import StudentsListScreen from '../screens/StudentsListScreen';
import StudentDetailScreen from '../screens/StudentDetailScreen';
import ContractViewScreen from '../screens/ContractViewScreen';
import ContractNewScreen from '../screens/ContractNewScreen';
import ContractPreviewScreen from '../screens/ContractPreviewScreen';
import SettlementScreen from '../screens/SettlementScreen';
import SettlementSendScreen from '../screens/SettlementSendScreen';
import InvoicePreviewScreen from '../screens/InvoicePreviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import NoticesListScreen from '../screens/NoticesListScreen';
import NoticeDetailScreen from '../screens/NoticeDetailScreen';
import TermsScreen from '../screens/TermsScreen';
import UnprocessedAttendanceScreen from '../screens/UnprocessedAttendanceScreen';
import styled from 'styled-components/native';

export type AuthStackParamList = {
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

const TabIconImage = styled.Image<TabIconImageProps>`
  width: 24px;
  height: 24px;
  tint-color: ${(props: TabIconImageProps) => (props.focused ? '#ff6b00' : '#999')};
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
  border-color: #ff6b00;
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
          title: '계약서 보기',
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
          title: '계약서 생성',
          headerShown: true,
          headerBackTitle: '뒤로',
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="ContractPreview"
        component={ContractPreviewScreen}
        options={{
          title: '계약서 확인',
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
  SettlementSend: {
    invoiceIds: number[];
    year: number;
    month: number;
  };
  InvoicePreview: {
    invoiceId: number;
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
        name="SettlementSend"
        component={SettlementSendScreen}
        options={{ title: '청구서 전송' }}
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
  UnprocessedAttendance: undefined;
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
          title: route.params.type === 'terms' ? '서비스 이용약관' : '개인정보처리방침',
        })}
      />
      <Stack.Screen
        name="UnprocessedAttendance"
        component={UnprocessedAttendanceScreen}
        options={{ title: '출결 미처리 관리' }}
      />
    </Stack.Navigator>
  );
}

export type MainTabsParamList = {
  Home: undefined;
  Students: undefined;
  ContractAdd: undefined; // 플로팅 버튼용 빈 화면
  Settlement: undefined;
  Settings: undefined;
};

export type MainTabsNavigationProp = BottomTabNavigationProp<MainTabsParamList>;


/**
 * 하단 탭 네비게이션 설정
 * 홈 / 수강생 / [+ 버튼] / 정산 / 설정
 */
function MainTabs() {
  const FAB_SIZE = 64;

  const handleFABPress = React.useCallback((navigation: any) => {
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
          tabBarActiveTintColor: '#ff6b00',
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
          title: '수강생',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={studentIcon} focused={focused} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Students 탭 클릭 시 항상 목록 화면으로 리셋
            const state = navigation.getState();
            const studentsTab = state.routes.find((r) => r.name === 'Students');
            if (studentsTab?.state) {
              const studentsStackState = studentsTab.state as any;
              // 스택에 화면이 2개 이상이면 (목록 + 상세) 목록으로 리셋
              if (studentsStackState?.routes && studentsStackState.routes.length > 1) {
                e.preventDefault(); // 기본 탭 전환 방지
                // Students 스택을 목록 화면으로 리셋
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'Students',
                    params: {
                      screen: 'StudentsList',
                    },
                  }),
                );
              }
            }
          },
        })}
      />
      <Tab.Screen
        name="ContractAdd"
        component={EmptyScreen}
        options={({ navigation }) => ({
          title: '',
          tabBarButton: () => {
            const state = navigation.getState();
            const currentRoute = state?.routes?.[state.index ?? 0];
            const isHomeFocused = currentRoute?.name === 'Home';

            // 항상 동일한 크기의 공간을 차지하도록 설정
            return (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                {isHomeFocused ? (
                  <FABButton
                    size={FAB_SIZE}
                    onPress={() => handleFABPress(navigation)}
                    activeOpacity={0.8}
                  >
                    <FABIcon source={noteIcon} />
                  </FABButton>
                ) : (
                  // 플로팅 버튼이 없는 탭에서는 투명한 공간만 차지
                  <View style={{ width: FAB_SIZE, height: FAB_SIZE }} />
                )}
              </View>
            );
          },
        })}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementStack}
        options={{
          title: '정산',
          tabBarIcon: ({ focused }) => (
            <TabIconImage source={invoiceIcon} focused={focused} />
          ),
        }}
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
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // 알림 탭 시 화면 이동 처리
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
      }
    } catch (error: any) {
      console.error('[AppNavigator] Failed to navigate from notification:', error);
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
        console.log('[AppNavigator] Notification received:', notification);
      },
      (response) => {
        console.log('[AppNavigator] Notification tapped:', response);
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

  // 인증되지 않은 경우 로그인 화면 표시
  if (!isAuthenticated) {
    return (
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
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

