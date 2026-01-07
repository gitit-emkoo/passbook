import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import styled from 'styled-components/native';
import { dashboardApi } from '../api/dashboard';
import { MainAppStackNavigationProp } from '../navigation/AppNavigator';

const totImage = require('../../assets/tot.png');

interface StatisticsData {
  thisMonthRevenue: number;
  thisMonthContracts: number;
  thisMonthUsageAmount: number; // 금액권 사용처리 금액 합계
  thisMonthUsageCount: number; // 횟수권 사용처리 횟수
  activeContracts: number;
  endedContracts: number; // 종료된 이용권 수
  amountBasedUsageRate: number; // 금액권 사용율
  sessionBasedUsageRate: number; // 횟수권 사용율
}

function StatisticsContent() {
  const navigation = useNavigation<MainAppStackNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);

  const loadStatistics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getStatistics();
      setStatistics(data);
    } catch (error: any) {
      console.error('[Statistics] load error', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStatistics();
    }, [loadStatistics]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStatistics();
    setRefreshing(false);
  }, [loadStatistics]);

  if (loading && !statistics) {
    return (
      <Container>
        <LoadingContainer>
          <ActivityIndicator size="large" color="#ff6b00" />
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 16 }}
      >
        {/* 이번 달 통계 섹션 */}
        <Section>
          <SectionTitle>이번달 이용권 통계</SectionTitle>
          <StatisticsGrid>
            <StatisticsCardTouchable onPress={() => navigation.navigate('RevenueStatistics')}>
              <StatisticsLabel>이번 달 매출</StatisticsLabel>
              <StatisticsValue>
                {statistics?.thisMonthRevenue ? `${statistics.thisMonthRevenue.toLocaleString()}원` : '0원'}
              </StatisticsValue>
              <ChevronIcon>›</ChevronIcon>
            </StatisticsCardTouchable>
            <StatisticsCardTouchable onPress={() => navigation.navigate('ContractStatistics')}>
              <StatisticsLabel>이번 달 이용권 발행건수</StatisticsLabel>
              <StatisticsValue>
                {statistics?.thisMonthContracts ?? 0}건
              </StatisticsValue>
              <ChevronIcon>›</ChevronIcon>
            </StatisticsCardTouchable>
            <StatisticsCard>
              <StatisticsLabel>활성 이용권</StatisticsLabel>
              <StatisticsValue>
                {statistics?.activeContracts ?? 0}개
              </StatisticsValue>
            </StatisticsCard>
            <StatisticsCard>
              <StatisticsLabel>종료된 이용권</StatisticsLabel>
              <StatisticsValue>
                {statistics?.endedContracts ?? 0}개
              </StatisticsValue>
            </StatisticsCard>
            <StatisticsCardTouchable onPress={() => navigation.navigate('UsageAmountStatistics')}>
              <StatisticsLabel>금액권 처리금액</StatisticsLabel>
              <StatisticsValue>
                {statistics?.thisMonthUsageAmount ? `${statistics.thisMonthUsageAmount.toLocaleString()}원` : '0원'}
              </StatisticsValue>
              <ChevronIcon>›</ChevronIcon>
            </StatisticsCardTouchable>
            <StatisticsCardTouchable onPress={() => navigation.navigate('UsageCountStatistics')}>
              <StatisticsLabel>횟수권 차감횟수</StatisticsLabel>
              <StatisticsValue>
                {statistics?.thisMonthUsageCount ?? 0}회
              </StatisticsValue>
              <ChevronIcon>›</ChevronIcon>
            </StatisticsCardTouchable>
            <StatisticsCard>
              <StatisticsLabel>금액권 사용률</StatisticsLabel>
              <StatisticsValue>
                {statistics?.amountBasedUsageRate ? `${Math.round(statistics.amountBasedUsageRate)}%` : '0%'}
              </StatisticsValue>
            </StatisticsCard>
            <StatisticsCard>
              <StatisticsLabel>횟수권 사용률</StatisticsLabel>
              <StatisticsValue>
                {statistics?.sessionBasedUsageRate ? `${Math.round(statistics.sessionBasedUsageRate)}%` : '0%'}
              </StatisticsValue>
            </StatisticsCard>
          </StatisticsGrid>
        </Section>

        {/* 하단 안내 섹션 */}
        <EmptyContainer>
          <EmptyStateImage source={totImage} resizeMode="contain" />
          <EmptyDescription>이용권 관련한 데이터를 한눈에 볼 수 있어요.</EmptyDescription>
        </EmptyContainer>
      </ScrollView>
    </Container>
  );
}

export default function StatisticsScreen() {
  return <StatisticsContent />;
}

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
`;

const LoadingContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const Section = styled.View`
  margin-bottom: 24px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
  margin-bottom: 12px;
`;

const StatisticsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
`;

const StatisticsCard = styled.View`
  flex: 1;
  min-width: 48%;
  background-color: #ffffff;
  border-radius: 12px;
  padding: 16px;
  shadow-color: rgba(29, 66, 216, 0.1);
  shadow-opacity: 0.1;
  shadow-radius: 8px;
  shadow-offset: 0px 2px;
  elevation: 2;
`;

const StatisticsCardTouchable = styled.TouchableOpacity`
  flex: 1;
  min-width: 48%;
  background-color: #ffffff;
  border-radius: 12px;
  padding: 16px;
  shadow-color: rgba(29, 66, 216, 0.1);
  shadow-opacity: 0.1;
  shadow-radius: 8px;
  shadow-offset: 0px 2px;
  elevation: 2;
  position: relative;
`;

const StatisticsLabel = styled.Text`
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 8px;
`;

const StatisticsValue = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #1d42d8;
`;

const ChevronIcon = styled.Text`
  position: absolute;
  bottom: 16px;
  right: 16px;
  font-size: 24px;
  color: #9ca3af;
  font-weight: 300;
`;

const EmptyContainer = styled.View`
  align-items: center;
  padding: 48px 16px;
  gap: 8px;
  margin-top: 24px;
`;

const EmptyStateImage = styled.Image`
  width: 120px;
  height: 120px;
  margin-bottom: 16px;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #666666;
  text-align: center;
  margin-bottom: 16px;
`;

