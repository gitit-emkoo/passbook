import React, { useCallback, useState, useMemo, useRef } from 'react';
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import styled from 'styled-components/native';
import RemixIcon from 'react-native-remix-icon';
import { dashboardApi } from '../api/dashboard';

interface MonthlyContractData {
  year: number;
  month: number;
  count: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 200;
const CHART_PADDING = 40;
const POINT_COLOR = '#b9d9ff';
const LINE_COLOR = '#1d42d8';

// 최대값을 깔끔한 숫자로 반올림하는 함수 (컴포넌트 외부로 이동하여 재생성 방지)
const roundToNiceNumber = (value: number): number => {
  if (value === 0) return 1;
  if (value === 1) return 1;
  if (value === 2) return 2;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let rounded;
    if (normalized <= 1) rounded = 1;
    else if (normalized <= 2) rounded = 2;
    else if (normalized <= 5) rounded = 5;
    else rounded = 10;
    return rounded * magnitude;
};

function ContractStatisticsContent() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyContractData[]>([]);
  const [isLastYearExpanded, setIsLastYearExpanded] = useState(false);
  const dataLastFetchedRef = useRef<number | null>(null);

  const loadData = useCallback(async (force = false) => {
    // 타임스탬프 기반 캐싱: 30초 내 재호출 방지 (강제 새로고침이 아닐 때만)
    if (!force) {
      const now = Date.now();
      const CACHE_TTL_MS = 30 * 1000;
      if (dataLastFetchedRef.current && (now - dataLastFetchedRef.current) < CACHE_TTL_MS) {
        // 캐시된 데이터 사용 (서버 호출 없이)
        return;
      }
    }

    try {
      // Stale-while-revalidate: 캐시된 데이터가 있으면 로딩 상태 유지하지 않음
      const hasCachedData = monthlyData.length > 0;
      if (!hasCachedData) {
        setLoading(true);
      }
      const data = await dashboardApi.getMonthlyContracts();
      setMonthlyData(data);
      dataLastFetchedRef.current = Date.now();
    } catch (error: any) {
      console.error('[ContractStatistics] load error', error);
    } finally {
      setLoading(false);
    }
  }, [monthlyData.length]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true); // 강제 새로고침
    setRefreshing(false);
  }, [loadData]);

  // 올해/지난해 누적 이용권 발행 계산 (메모이제이션)
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  // 현재 연도 데이터만 필터링 (그래프와 카드 일치시키기) - 메모이제이션
  const currentYearData = useMemo(() => {
    return monthlyData.filter(item => item.year === currentYear);
  }, [monthlyData, currentYear]);
  
  const thisYearContracts = useMemo(() => {
    return currentYearData.reduce((sum, item) => sum + item.count, 0);
  }, [currentYearData]);
  
  // 올해가 아닌 모든 연도의 데이터를 그룹화 (메모이제이션)
  const pastYearsList = useMemo(() => {
    const pastYearsData = monthlyData
      .filter(item => item.year < currentYear)
      .reduce((acc, item) => {
        if (!acc[item.year]) {
          acc[item.year] = 0;
        }
        acc[item.year] += item.count;
        return acc;
      }, {} as Record<number, number>);
    
    return Object.entries(pastYearsData)
      .map(([year, count]) => ({ year: parseInt(year), count }))
      .sort((a, b) => b.year - a.year);
  }, [monthlyData, currentYear]);

  // 그래프 데이터 계산 (현재 연도 데이터만 사용) - 메모이제이션
  const { chartData, maxCount, yAxisLabels } = useMemo(() => {
    const rawMaxCount = Math.max(...currentYearData.map(d => d.count), 0);
    const max = roundToNiceNumber(rawMaxCount);
    const data = currentYearData.map((item, index) => {
      const x = CHART_PADDING + (index * (CHART_WIDTH - CHART_PADDING * 2)) / (currentYearData.length - 1 || 1);
      const ratio = max > 0 ? item.count / max : 0;
      const y = CHART_HEIGHT - CHART_PADDING - (ratio * (CHART_HEIGHT - CHART_PADDING * 2));
      return { x, y, ...item };
    });
    
    // Y축 라벨 계산
    let intervals: number[];
    if (max <= 2) {
      intervals = [0, 0.5, 1];
    } else if (max <= 5) {
      intervals = [0, 0.25, 0.5, 0.75, 1];
    } else {
      intervals = [0, 0.25, 0.5, 0.75, 1];
    }
    const labels: Array<{ ratio: number; value: number; y: number }> = [];
    intervals.forEach((ratio) => {
      const value = Math.round(max * ratio);
      const y = CHART_PADDING + (CHART_HEIGHT - CHART_PADDING * 2) * (1 - ratio);
      labels.push({ ratio, value, y });
    });
    const uniqueLabels = labels.filter((label, index, self) => 
      index === self.findIndex(l => l.value === label.value)
    );
    
    return { chartData: data, maxCount: max, yAxisLabels: uniqueLabels };
  }, [currentYearData]);

  if (loading && monthlyData.length === 0) {
    return (
      <Container>
        <LoadingContainer>
          <ActivityIndicator size="large" color="#1d42d8" />
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
        <ChartCard>
          <ChartTitle>월별 이용권 발행</ChartTitle>
          <ChartContainer>
            <ChartArea>
              {/* Y축 그리드 라인 */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = CHART_PADDING + (CHART_HEIGHT - CHART_PADDING * 2) * (1 - ratio);
                return (
                  <GridLine
                    key={ratio}
                    style={{
                      top: y,
                      left: CHART_PADDING,
                      width: CHART_WIDTH - CHART_PADDING * 2,
                    }}
                  />
                );
              })}

              {/* 라인 그래프 */}
              {chartData.length > 1 && chartData.map((point, index) => {
                if (index === 0) return null;
                const prevPoint = chartData[index - 1];
                const startX = prevPoint.x;
                const startY = prevPoint.y;
                const endX = point.x;
                const endY = point.y;
                const dx = endX - startX;
                const dy = endY - startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                return (
                  <LineSegment
                    key={`line-${index}`}
                    style={{
                      left: startX,
                      top: startY,
                      width: length,
                      transform: [{ rotate: `${angle}deg` }],
                    }}
                  />
                );
              })}

              {/* 포인트 */}
              {chartData.map((point, index) => (
                <Point
                  key={index}
                  style={{
                    left: point.x - 6,
                    top: point.y - 6,
                  }}
                />
              ))}

              {/* 월 라벨 */}
              {chartData.map((point, index) => (
                <MonthLabel
                  key={index}
                  style={{
                    left: point.x - 15,
                    top: CHART_HEIGHT - 25,
                  }}
                >
                  {point.month}월
                </MonthLabel>
              ))}

              {/* Y축 값 라벨 - 깔끔한 간격으로 표시 */}
              {yAxisLabels.map(({ ratio, value, y }) => (
                <YAxisLabel
                  key={ratio}
                  style={{
                    top: y - 8,
                    left: 0,
                  }}
                >
                  {value}
                </YAxisLabel>
              ))}
            </ChartArea>
          </ChartContainer>
        </ChartCard>

        {/* 올해 이용권 발행 섹션 */}
        <SummaryCard style={{ marginTop: 16 }}>
          <SummaryTitle>올해 이용권 발행</SummaryTitle>
          <SummaryValue>{thisYearContracts}건</SummaryValue>
          <SummarySubtext>{currentYear}년 누적</SummarySubtext>
        </SummaryCard>

        {/* 지난해 이용권 발행 섹션 (아코디언) */}
        <SummaryCard>
          <LastYearHeader onPress={() => setIsLastYearExpanded(!isLastYearExpanded)}>
            <LastYearHeaderLeft>
              <SummaryTitle>지난해 이용권 발행</SummaryTitle>
              <SummarySubtext>
                {pastYearsList.length > 0 ? `${pastYearsList.length}개 연도` : '데이터 없음'}
              </SummarySubtext>
            </LastYearHeaderLeft>
            <ExpandIcon>
              <RemixIcon 
                name={isLastYearExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} 
                size={20} 
                color="#666" 
              />
            </ExpandIcon>
          </LastYearHeader>
          {isLastYearExpanded && pastYearsList.length > 0 && (
            <LastYearContent>
              {pastYearsList.map((item) => (
                <PastYearItem key={item.year}>
                  <PastYearLabel>{item.year}년 누적</PastYearLabel>
                  <PastYearValue>{item.count}건</PastYearValue>
                </PastYearItem>
              ))}
            </LastYearContent>
          )}
          {isLastYearExpanded && pastYearsList.length === 0 && (
            <LastYearContent>
              <EmptyText>지난해 이용권 발행 데이터가 없습니다.</EmptyText>
            </LastYearContent>
          )}
        </SummaryCard>
      </ScrollView>
    </Container>
  );
}

export default function ContractStatisticsScreen() {
  return <ContractStatisticsContent />;
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

const ChartCard = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
  shadow-color: rgba(29, 66, 216, 0.1);
  shadow-opacity: 0.1;
  shadow-radius: 8px;
  shadow-offset: 0px 2px;
  elevation: 2;
`;

const ChartTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
  margin-bottom: 20px;
`;

const ChartContainer = styled.View`
  align-items: center;
  margin-bottom: 24px;
`;

const ChartArea = styled.View`
  width: ${CHART_WIDTH}px;
  height: ${CHART_HEIGHT}px;
  position: relative;
`;

const GridLine = styled.View`
  position: absolute;
  height: 1px;
  background-color: #e0e0e0;
  border-style: dashed;
  border-width: 1px;
  border-color: #e0e0e0;
`;

const LineSegment = styled.View`
  position: absolute;
  height: 2px;
  background-color: ${LINE_COLOR};
  transform-origin: left center;
`;

const Point = styled.View`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background-color: ${POINT_COLOR};
`;

const MonthLabel = styled.Text`
  position: absolute;
  font-size: 11px;
  color: #666;
  width: 30px;
  text-align: center;
`;

const YAxisLabel = styled.Text`
  position: absolute;
  font-size: 10px;
  color: #666;
  width: 35px;
  text-align: right;
`;

const SummaryCard = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  shadow-color: rgba(29, 66, 216, 0.1);
  shadow-opacity: 0.1;
  shadow-radius: 8px;
  shadow-offset: 0px 2px;
  elevation: 2;
`;

const SummaryTitle = styled.Text`
  font-size: 14px;
  color: #666;
  font-weight: 500;
  margin-bottom: 8px;
`;

const SummaryValue = styled.Text`
  font-size: 24px;
  color: #1d42d8;
  font-weight: 700;
  margin-bottom: 4px;
`;

const SummarySubtext = styled.Text`
  font-size: 12px;
  color: #999;
  font-weight: 400;
`;

const LastYearHeader = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const LastYearHeaderLeft = styled.View`
  flex: 1;
`;

const ExpandIcon = styled.View`
  margin-left: 12px;
`;

const LastYearContent = styled.View`
  margin-top: 12px;
  padding-top: 12px;
  border-top-width: 1px;
  border-top-color: #f0f0f0;
  gap: 12px;
`;

const PastYearItem = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 8px;
`;

const PastYearLabel = styled.Text`
  font-size: 14px;
  color: #666;
  font-weight: 500;
`;

const PastYearValue = styled.Text`
  font-size: 16px;
  color: #1d42d8;
  font-weight: 700;
`;

const EmptyText = styled.Text`
  font-size: 14px;
  color: #999;
  text-align: center;
  padding: 12px;
`;
