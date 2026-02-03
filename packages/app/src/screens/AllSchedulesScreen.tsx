import React, { useState, useRef, useCallback } from 'react';
import { ActivityIndicator, ScrollView, LayoutChangeEvent } from 'react-native';
import styled from 'styled-components/native';
import { contractsApi } from '../api/contracts';
import { useFocusEffect } from '@react-navigation/native';

interface Reservation {
  id: number;
  contract_id: number;
  reserved_date: string | Date;
  reserved_time: string | null;
  student_name: string;
  student_id: number | null;
  has_attendance: boolean;
}

interface GroupedReservation {
  date: string;
  dateLabel: string;
  reservations: Reservation[];
}

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
`;

const Header = styled.View`
  background-color: #ffffff;
  padding: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5e5;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
`;

const Content = styled.ScrollView.attrs(() => ({
  contentContainerStyle: {
    paddingBottom: 20,
  },
}))`
  flex: 1;
`;

const DateSection = styled.View`
  background-color: #ffffff;
  margin-top: 8px;
  padding: 16px;
`;

const DateHeader = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 12px;
`;

const DateLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111111;
`;

const TodayBadge = styled.View`
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: #fff3e0; /* 연한 주황 */
`;

const TodayBadgeText = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: #ff6b00; /* 주황 텍스트 */
`;

const ReservationItem = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 12px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const ReservationItemLast = styled(ReservationItem)`
  border-bottom-width: 0;
`;

const TimeText = styled.Text`
  font-size: 14px;
  color: #666666;
  width: 60px;
`;

const StudentNameText = styled.Text<{ $completed: boolean }>`
  font-size: 15px;
  color: ${(props: { $completed: boolean }) => (props.$completed ? '#999999' : '#111111')};
  flex: 1;
  text-decoration-line: ${(props: { $completed: boolean }) => (props.$completed ? 'line-through' : 'none')};
  text-decoration-color: #ff0000;
`;

const EmptyContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 40px;
`;

const EmptyText = styled.Text`
  font-size: 16px;
  color: #999999;
  text-align: center;
`;

const LoadingContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 40px;
`;

export default function AllSchedulesScreen() {
  const [loading, setLoading] = useState(true);
  const [groupedReservations, setGroupedReservations] = useState<GroupedReservation[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasScrolledToToday = useRef(false);

  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await contractsApi.getAllReservations();
      const reservations = Array.isArray(data) ? data : [];

      // 날짜별로 그룹핑
      const grouped: Record<string, Reservation[]> = {};
      reservations.forEach((reservation) => {
        const date = new Date(reservation.reserved_date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(reservation);
      });

      // 날짜별로 정렬하고 시간순으로 정렬
      let groupedArray: GroupedReservation[] = Object.keys(grouped)
        .sort()
        .map((dateKey) => {
          const reservations = grouped[dateKey];
          // 시간순으로 정렬 (시간이 없는 것은 앞으로)
          reservations.sort((a, b) => {
            if (!a.reserved_time && !b.reserved_time) return 0;
            if (!a.reserved_time) return -1;
            if (!b.reserved_time) return 1;
            return a.reserved_time.localeCompare(b.reserved_time);
          });

          const date = new Date(dateKey);
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          const weekday = weekdays[date.getDay()];
          const dateLabel = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;

          return {
            date: dateKey,
            dateLabel,
            reservations,
          };
        });

      // 오늘 날짜 섹션이 없으면, 빈 일정이더라도 오늘 날짜 섹션을 추가
      if (groupedArray.length > 0) {
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
        const todayDay = String(today.getDate()).padStart(2, '0');
        const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;

        const hasToday = groupedArray.some((group) => group.date === todayKey);

        if (!hasToday) {
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          const weekday = weekdays[today.getDay()];
          const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 (${weekday})`;

          groupedArray = [
            ...groupedArray,
            {
              date: todayKey,
              dateLabel,
              reservations: [],
            },
          ].sort((a, b) => a.date.localeCompare(b.date));
        }
      }

      setGroupedReservations(groupedArray);
    } catch (error) {
      console.error('[AllSchedules] Failed to load reservations:', error);
      setGroupedReservations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 화면 포커스 시마다 일정 재로딩 & 오늘 섹션 스크롤 상태 초기화
  useFocusEffect(
    useCallback(() => {
      hasScrolledToToday.current = false;
      loadReservations();
    }, [loadReservations]),
  );

  const formatTime = (time: string | null): string => {
    if (!time) return '';
    // HH:mm 형식이면 그대로, 아니면 파싱
    if (time.includes(':')) {
      const [hours, minutes] = time.split(':');
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }
    return time;
  };

  // 오늘 날짜 (YYYY-MM-DD)
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
  const todayDay = String(today.getDate()).padStart(2, '0');
  const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <ActivityIndicator size="large" color="#1d42d8" />
        </LoadingContainer>
      </Container>
    );
  }

  if (groupedReservations.length === 0) {
    return (
      <Container>
        <EmptyContainer>
          <EmptyText>등록된 일정이 없습니다.</EmptyText>
        </EmptyContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Content ref={scrollViewRef}>
        {groupedReservations.map((group) => {
          const isToday = group.date === todayKey;
          const hasReservations = group.reservations.length > 0;

          return (
            <DateSection 
              key={group.date}
              onLayout={isToday ? (event: LayoutChangeEvent) => {
                if (hasScrolledToToday.current) return;
                hasScrolledToToday.current = true;
                const { y } = event.nativeEvent.layout;
                // 오늘 섹션이 화면 최상단에 오도록 스크롤
                scrollViewRef.current?.scrollTo({
                  y: Math.max(0, y),
                  animated: true,
                });
              } : undefined}
            >
              <DateHeader>
                <DateLabel>{group.dateLabel}</DateLabel>
                {isToday && (
                  <TodayBadge>
                    <TodayBadgeText>오늘</TodayBadgeText>
                  </TodayBadge>
                )}
              </DateHeader>

              {hasReservations ? (
                group.reservations.map((reservation, index) => {
                  const isLast = index === group.reservations.length - 1;
                  const ReservationComponent = isLast ? ReservationItemLast : ReservationItem;

                  return (
                    <ReservationComponent key={reservation.id}>
                      <TimeText>{formatTime(reservation.reserved_time) || '시간 미정'}</TimeText>
                      <StudentNameText $completed={reservation.has_attendance}>
                        {reservation.student_name}
                      </StudentNameText>
                    </ReservationComponent>
                  );
                })
              ) : isToday ? (
                <EmptyText>오늘은 이용권 일정이 없습니다.</EmptyText>
              ) : null}
            </DateSection>
          );
        })}
      </Content>
    </Container>
  );
}

