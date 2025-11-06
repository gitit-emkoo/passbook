import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { studentsApi } from '../api/students';

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
`;

const Header = styled.View`
  background-color: #fff;
  padding: 16px;
  padding-top: 50px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
`;

const AddButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #007AFF;
  border-radius: 6px;
`;

const AddButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
`;

const Subtitle = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
`;

const SearchBar = styled.TextInput`
  background-color: #f0f0f0;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: #000;
`;

const FilterRow = styled.View`
  flex-direction: row;
  margin-top: 12px;
  gap: 8px;
`;

const FilterButton = styled.TouchableOpacity<{ active?: boolean }>`
  padding: 8px 16px;
  border-radius: 16px;
  background-color: ${(props) => (props.active ? '#007AFF' : '#e0e0e0')};
`;

const FilterButtonText = styled.Text<{ active?: boolean }>`
  color: ${(props) => (props.active ? '#fff' : '#666')};
  font-size: 14px;
  font-weight: ${(props) => (props.active ? 'bold' : 'normal')};
`;

const StudentCard = styled.TouchableOpacity`
  background-color: #fff;
  padding: 16px;
  margin: 8px 16px;
  border-radius: 8px;
  elevation: 2;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.1;
  shadow-radius: 2px;
`;

const StudentName = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
`;

const StudentInfo = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
`;

const BadgeRow = styled.View`
  flex-direction: row;
  margin-top: 8px;
  flex-wrap: wrap;
`;

const Badge = styled.View<{ type?: 'prepaid' | 'postpaid' | 'carry_over' | 'deduct_next' | 'vanish' }>`
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 8px;
  margin-bottom: 4px;
  background-color: ${(props) => {
    if (props.type === 'prepaid') return '#E3F2FD';
    if (props.type === 'postpaid') return '#F3E5F5';
    if (props.type === 'carry_over') return '#FFF3E0';
    if (props.type === 'deduct_next') return '#E8F5E9';
    return '#FCE4EC';
  }};
`;

const BadgeText = styled.Text<{ type?: 'prepaid' | 'postpaid' | 'carry_over' | 'deduct_next' | 'vanish' }>`
  font-size: 12px;
  color: ${(props) => {
    if (props.type === 'prepaid') return '#1976D2';
    if (props.type === 'postpaid') return '#7B1FA2';
    if (props.type === 'carry_over') return '#E65100';
    if (props.type === 'deduct_next') return '#388E3C';
    return '#C2185B';
  }};
  font-weight: bold;
`;

const EmptyText = styled.Text`
  text-align: center;
  color: #999;
  margin-top: 40px;
  font-size: 14px;
`;

interface Student {
  id: number;
  name: string;
  phone: string;
  guardian_name?: string;
  guardian_phone?: string;
  contracts?: Array<{
    id: number;
    subject: string;
    policy_snapshot: {
      billing_type: string;
      absence_policy: string;
      monthly_amount: number;
    };
  }>;
}

type FilterType = 'all' | 'current_month' | 'needs_attention';

/**
 * 수강생 리스트 화면
 */
export default function StudentsListScreen() {
  const navigation = useNavigation();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadStudents();
  }, [filter, searchText]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (searchText) {
        params.search = searchText;
      }
      if (filter !== 'all') {
        params.filter = filter;
      }
      const data = await studentsApi.getAll(params);
      setStudents(data);
    } catch (error) {
      console.error('Failed to load students:', error);
      Alert.alert('오류', '수강생 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentPress = (studentId: number) => {
    (navigation as any).navigate('Students', {
      screen: 'StudentDetail',
      params: { id: studentId },
    });
  };

  const handleAddPress = () => {
    (navigation as any).navigate('Home', {
      screen: 'ContractNew',
    });
  };

  const getBillingTypeText = (billingType: string) => {
    return billingType === 'prepaid' ? '선불' : '후불';
  };

  const getAbsencePolicyText = (absencePolicy: string) => {
    const map: Record<string, string> = {
      carry_over: '이월',
      deduct_next: '차월차감',
      vanish: '소멸',
    };
    return map[absencePolicy] || absencePolicy;
  };

  return (
    <Container>
      <ScrollView>
        <Header>
          <HeaderRow>
            <Title>수강생</Title>
            <AddButton onPress={handleAddPress}>
              <AddButtonText>추가</AddButtonText>
            </AddButton>
          </HeaderRow>
          <Subtitle>수강생을 관리하고 출결을 확인하세요</Subtitle>
          <SearchBar
            placeholder="이름, 보호자, 과목 검색..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#999"
          />
          <FilterRow>
            <FilterButton active={filter === 'all'} onPress={() => setFilter('all')}>
              <FilterButtonText active={filter === 'all'}>전체</FilterButtonText>
            </FilterButton>
            <FilterButton active={filter === 'current_month'} onPress={() => setFilter('current_month')}>
              <FilterButtonText active={filter === 'current_month'}>이번 달 청구</FilterButtonText>
            </FilterButton>
            <FilterButton active={filter === 'needs_attention'} onPress={() => setFilter('needs_attention')}>
              <FilterButtonText active={filter === 'needs_attention'}>안내 필요</FilterButtonText>
            </FilterButton>
          </FilterRow>
        </Header>

        {loading ? (
          <EmptyText>로딩 중...</EmptyText>
        ) : students.length === 0 ? (
          <EmptyText>수강생이 없습니다</EmptyText>
        ) : (
          students.map((student) => (
            <StudentCard key={student.id} onPress={() => handleStudentPress(student.id)}>
              <StudentName>{student.name}</StudentName>
              <StudentInfo>연락처: {student.phone}</StudentInfo>
              {student.guardian_name && (
                <StudentInfo>보호자: {student.guardian_name} ({student.guardian_phone})</StudentInfo>
              )}
              {student.contracts && student.contracts.length > 0 && (
                <>
                  <StudentInfo style={{ marginTop: 8 }}>
                    수업: {student.contracts.map((c) => c.subject).join(', ')}
                  </StudentInfo>
                  <BadgeRow>
                    {student.contracts.map((contract) => (
                      <React.Fragment key={contract.id}>
                        <Badge type={contract.policy_snapshot.billing_type as any}>
                          <BadgeText type={contract.policy_snapshot.billing_type as any}>
                            {getBillingTypeText(contract.policy_snapshot.billing_type)}
                          </BadgeText>
                        </Badge>
                        <Badge type={contract.policy_snapshot.absence_policy as any}>
                          <BadgeText type={contract.policy_snapshot.absence_policy as any}>
                            {getAbsencePolicyText(contract.policy_snapshot.absence_policy)}
                          </BadgeText>
                        </Badge>
                      </React.Fragment>
                    ))}
                  </BadgeRow>
                </>
              )}
            </StudentCard>
          ))
        )}
      </ScrollView>
    </Container>
  );
}
