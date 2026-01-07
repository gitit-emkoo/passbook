import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import styled from 'styled-components/native';
import { dashboardApi } from '../api/dashboard';

interface MonthlyRevenueData {
  year: number;
  month: number;
  revenue: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 200;
const CHART_PADDING = 40;
const POINT_COLOR = '#b9d9ff';
const LINE_COLOR = '#1d42d8';

function RevenueStatisticsContent() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyRevenueData[]>([]);
  const [isLastYearExpanded, setIsLastYearExpanded] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getMonthlyRevenue();
      setMonthlyData(data);
    } catch (error: any) {
      console.error('[RevenueStatistics] load error', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // 올해/지난해 누적 매출 계산
  const currentYear = new Date().getFullYear();
  
  const thisYearRevenue = monthlyData
    .filter(item => item.year === currentYear)
    .reduce((sum, item) => sum + item.revenue, 0);
  
  // 올해가 아닌 모든 연도의 데이터를 그룹화
  const pastYearsData = monthlyData
    .filter(item => item.year < currentYear)
    .reduce((acc, item) => {
      if (!acc[item.year]) {
        acc[item.year] = 0;
      }
      acc[item.year] += item.revenue;
      return acc;
    }, {} as Record<number, number>);
  
  // 연도별로 정렬 (최신순)
  const pastYearsList = Object.entries(pastYearsData)
    .map(([year, revenue]) => ({ year: parseInt(year), revenue }))
    .sort((a, b) => b.year - a.year);

  // 최대값을 깔끔한 숫자로 반올림하는 함수
  const roundToNiceNumber = (value: number): number => {
    if (value === 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let rounded;
    if (normalized <= 1) rounded = 1;
    else if (normalized <= 2) rounded = 2;
    else if (normalized <= 5) rounded = 5;
    else rounded = 10;
    return rounded * magnitude;
  };

  // 그래프 데이터 계산
  const rawMaxRevenue = Math.max(...monthlyData.map(d => d.revenue), 0);
  const maxRevenue = roundToNiceNumber(rawMaxRevenue);
  const chartData = monthlyData.map((item, index) => {
    const x = CHART_PADDING + (index * (CHART_WIDTH - CHART_PADDING * 2)) / (monthlyData.length - 1 || 1);
    // Y축: 값이 클수록 위로 올라가야 함
    // revenue가 0이면 아래쪽(CHART_HEIGHT - CHART_PADDING), maxRevenue면 위쪽(CHART_PADDING)
    const ratio = maxRevenue > 0 ? item.revenue / maxRevenue : 0;
    const y = CHART_HEIGHT - CHART_PADDING - (ratio * (CHART_HEIGHT - CHART_PADDING * 2));
    return { x, y, ...item };
  });

  if (loading && monthlyData.length === 0) {
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
        <ChartCard>
          <ChartTitle>월별 매출</ChartTitle>
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
              {(() => {
                // 5개 구간으로 나누기 (0, 0.25, 0.5, 0.75, 1)
                const intervals = [0, 0.25, 0.5, 0.75, 1];
                const labels: Array<{ ratio: number; value: number; y: number }> = [];
                
                intervals.forEach((ratio) => {
                  const value = Math.round(maxRevenue * ratio);
                  const y = CHART_PADDING + (CHART_HEIGHT - CHART_PADDING * 2) * (1 - ratio);
                  labels.push({ ratio, value, y });
                });
                
                // 중복 제거 및 정렬
                const uniqueLabels = labels.filter((label, index, self) => 
                  index === self.findIndex(l => l.value === label.value)
                );
                
                return uniqueLabels.map(({ ratio, value, y }) => (
                  <YAxisLabel
                    key={ratio}
                    style={{
                      top: y - 8,
                      left: 0,
                    }}
                  >
                    {value > 0 ? `${(value / 10000).toFixed(0)}만` : '0'}
                  </YAxisLabel>
                ));
              })()}
            </ChartArea>
          </ChartContainer>
        </ChartCard>

        {/* 올해 매출 섹션 */}
        <SummaryCard style={{ marginTop: 16 }}>
          <SummaryTitle>올해 매출</SummaryTitle>
          <SummaryValue>{thisYearRevenue.toLocaleString()}원</SummaryValue>
          <SummarySubtext>{currentYear}년 누적</SummarySubtext>
        </SummaryCard>

        {/* 지난해 매출 섹션 (아코디언) */}
        <SummaryCard>
          <LastYearHeader onPress={() => setIsLastYearExpanded(!isLastYearExpanded)}>
            <LastYearHeaderLeft>
              <SummaryTitle>지난해 매출</SummaryTitle>
              <SummarySubtext>
                {pastYearsList.length > 0 ? `${pastYearsList.length}개 연도` : '데이터 없음'}
              </SummarySubtext>
            </LastYearHeaderLeft>
            <ExpandIcon>
              {isLastYearExpanded ? '▼' : '▶'}
            </ExpandIcon>
          </LastYearHeader>
          {isLastYearExpanded && pastYearsList.length > 0 && (
            <LastYearContent>
              {pastYearsList.map((item) => (
                <PastYearItem key={item.year}>
                  <PastYearLabel>{item.year}년 누적</PastYearLabel>
                  <PastYearValue>{item.revenue.toLocaleString()}원</PastYearValue>
                </PastYearItem>
              ))}
            </LastYearContent>
          )}
          {isLastYearExpanded && pastYearsList.length === 0 && (
            <LastYearContent>
              <EmptyText>지난해 매출 데이터가 없습니다.</EmptyText>
            </LastYearContent>
          )}
        </SummaryCard>
      </ScrollView>
    </Container>
  );
}

export default function RevenueStatisticsScreen() {
  return <RevenueStatisticsContent />;
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

const ExpandIcon = styled.Text`
  font-size: 12px;
  color: #666;
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
