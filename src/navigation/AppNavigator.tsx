import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useStore';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import StudentsListScreen from '../screens/StudentsListScreen';
import StudentDetailScreen from '../screens/StudentDetailScreen';
import ContractNewScreen from '../screens/ContractNewScreen';
import SettlementScreen from '../screens/SettlementScreen';
import SettlementSendScreen from '../screens/SettlementSendScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import styled from 'styled-components/native';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabIcon = styled.Text`
  font-size: 20px;
`;

/**
 * 수강생 스택 네비게이터
 */
function StudentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="StudentsList"
        component={StudentsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentDetail"
        component={StudentDetailScreen}
        options={{ title: '수강생 상세' }}
      />
    </Stack.Navigator>
  );
}

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
        options={{ title: '계약서 생성' }}
      />
    </Stack.Navigator>
  );
}

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
    </Stack.Navigator>
  );
}

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
    </Stack.Navigator>
  );
}

/**
 * 하단 탭 네비게이션 설정
 * 홈 / 수강생 / 정산 / 설정
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <TabIcon style={{ color }}>🏠</TabIcon>,
        }}
      />
      <Tab.Screen
        name="Students"
        component={StudentsStack}
        options={{
          title: '수강생',
          tabBarIcon: ({ color }) => <TabIcon style={{ color }}>👥</TabIcon>,
        }}
      />
      <Tab.Screen
        name="Settlement"
        component={SettlementStack}
        options={{
          title: '정산',
          tabBarIcon: ({ color }) => <TabIcon style={{ color }}>💰</TabIcon>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => <TabIcon style={{ color }}>⚙️</TabIcon>,
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * 앱 네비게이터 (인증 상태에 따라 분기)
 */
export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 인증되지 않은 경우 로그인 화면 표시
  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // 인증된 경우 메인 앱 표시
  return (
    <NavigationContainer>
      <MainAppStack />
    </NavigationContainer>
  );
}

