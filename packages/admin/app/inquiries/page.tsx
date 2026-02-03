"use client";

import React, { useEffect, useState } from "react";
import {
  LayoutRoot,
  AdminSidebar,
  Content,
  ContentHeader,
  ContentTitle,
  ContentBody,
} from "../../components/layout";
import styled from "styled-components";
import { apiFetch } from "../../lib/api-client";
import PageDescription from "../../components/PageDescription";

type InquiryStatus = "pending" | "answered";

interface InquiryRow {
  id: number;
  title: string | null;
  content: string;
  status: InquiryStatus;
  created_at: string;
  answered_at: string | null;
  answer: string | null;
  user?: {
    id: number;
    name: string | null;
    org_code: string | null;
    phone: string;
  };
}

export default function InquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InquiryStatus | "all">("pending");
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<InquiryRow[]>("/api/v1/inquiries");
      setRows(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "문의 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAnswerChange = (id: number, value: string) => {
    setAnswerDrafts((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSaveAnswer = async (id: number) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const draft = answerDrafts[id] ?? row.answer ?? "";
    const trimmed = draft.trim();
    if (!trimmed) {
      alert("답변 내용을 입력해 주세요.");
      return;
    }

    try {
      setSavingId(id);
      await apiFetch<InquiryRow>(`/api/v1/inquiries/${id}/answer`, {
        method: "PATCH",
        body: { answer: trimmed },
      });
      await load();
      setAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toggleExpand(id);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "답변 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = rows.filter((row) => {
    const statusMatch = filter === "all" ? true : row.status === filter;

    if (!searchQuery.trim()) {
      return statusMatch;
    }

    const query = searchQuery.toLowerCase().trim();
    const userMatch =
      row.user?.org_code?.toLowerCase().includes(query) ||
      row.user?.name?.toLowerCase().includes(query) ||
      row.user?.phone?.toLowerCase().includes(query);
    const titleMatch = row.title?.toLowerCase().includes(query) ?? false;
    const contentMatch = row.content.toLowerCase().includes(query);

    return statusMatch && (userMatch || titleMatch || contentMatch);
  });

  return (
    <LayoutRoot>
      <AdminSidebar activePage="inquiries" />
      <Content>
        <ContentHeader>
          <ContentTitle>문의사항 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
          <PageDescription
            title="문의사항 관리 페이지"
            description="앱 사용자들이 제출한 문의사항을 확인하고 답변할 수 있습니다. 문의사항은 접수 상태와 답변 완료 상태로 구분되며, 검색 기능을 통해 빠르게 찾을 수 있습니다."
            features={[
              "전체 문의사항 목록 조회",
              "상태별 필터링 (전체/접수/답변 완료)",
              "사용자, 제목, 내용으로 검색",
              "문의사항 답변 작성 및 저장",
              "카드 형태로 문의 내용과 답변을 한눈에 확인",
            ]}
            usage={[
              "상태 필터: '전체', '접수', '답변 완료' 버튼으로 문의사항을 필터링할 수 있습니다.",
              "검색: 검색창에 사용자명, 상호명, 전화번호, 제목, 내용을 입력하여 문의사항을 찾을 수 있습니다.",
              "문의 확인: 문의 카드를 클릭하면 전체 내용과 사용자 정보가 펼쳐집니다.",
              "답변 작성: 펼쳐진 카드 하단의 답변 입력란에 답변을 작성하고 '답변 저장' 버튼을 클릭합니다.",
              "새로고침: '새로고침' 버튼을 클릭하면 최신 문의사항 목록을 다시 불러옵니다.",
            ]}
          />
          <Toolbar>
            <FilterGroup>
              <FilterLabel>상태</FilterLabel>
              <FilterButton
                $active={filter === "all"}
                onClick={() => setFilter("all")}
              >
                전체
              </FilterButton>
              <FilterButton
                $active={filter === "pending"}
                onClick={() => setFilter("pending")}
              >
                접수
              </FilterButton>
              <FilterButton
                $active={filter === "answered"}
                onClick={() => setFilter("answered")}
              >
                답변 완료
              </FilterButton>
            </FilterGroup>
            <ReloadButton onClick={() => void load()} disabled={loading}>
              {loading ? "불러오는 중..." : "새로고침"}
            </ReloadButton>
          </Toolbar>

          <SearchSection>
            <SearchInput
              type="text"
              placeholder="사용자, 제목, 문의내용으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <ClearSearchButton onClick={() => setSearchQuery("")}>
                ✕
              </ClearSearchButton>
            )}
          </SearchSection>

          {error && <ErrorText>{error}</ErrorText>}

          {!loading && filtered.length === 0 && (
            <EmptyState>
              {searchQuery ? "검색 결과가 없습니다." : "표시할 문의가 없습니다."}
            </EmptyState>
          )}

          <InquiryList>
            {filtered.map((row) => {
              const hasAnswer = !!row.answer;
              const isExpanded = expandedIds.has(row.id);
              return (
                <InquiryCard key={row.id} $expanded={isExpanded}>
                  <InquiryCardHeader onClick={() => toggleExpand(row.id)}>
                    <InquiryHeaderLeft>
                      <StatusBadge $status={row.status}>
                        {row.status === "answered" ? "답변 완료" : "접수"}
                      </StatusBadge>
                      <InquiryInfo>
                        <InquiryTitle>{row.title ?? "제목 없음"}</InquiryTitle>
                        <InquiryMeta>
                          <UserInfo>
                            {row.user?.org_code ?? "-"} | {row.user?.name ?? "-"} | {row.user?.phone ?? "-"}
                          </UserInfo>
                          <DateInfo>
                            접수: {new Date(row.created_at).toLocaleString("ko-KR")}
                            {row.answered_at && (
                              <> | 답변: {new Date(row.answered_at).toLocaleString("ko-KR")}</>
                            )}
                          </DateInfo>
                        </InquiryMeta>
                      </InquiryInfo>
                    </InquiryHeaderLeft>
                    <InquiryHeaderRight>
                      <ExpandIcon $expanded={isExpanded}>▼</ExpandIcon>
                    </InquiryHeaderRight>
                  </InquiryCardHeader>

                  {isExpanded && (
                    <InquiryCardBody>
                      <InquiryContentSection>
                        <SectionTitle>문의 내용</SectionTitle>
                        <InquiryContentFull>{row.content}</InquiryContentFull>
                      </InquiryContentSection>

                      {hasAnswer && (
                        <AnswerSection>
                          <SectionTitle>관리자 답변</SectionTitle>
                          <AnswerText>{row.answer}</AnswerText>
                        </AnswerSection>
                      )}

                      <AnswerFormSection>
                        <SectionTitle>{hasAnswer ? "답변 수정" : "답변 작성"}</SectionTitle>
                        <AnswerTextarea
                          value={answerDrafts[row.id] ?? row.answer ?? ""}
                          onChange={(e) => handleAnswerChange(row.id, e.target.value)}
                          rows={8}
                          placeholder="관리자 답변을 입력해 주세요."
                        />
                        <AnswerActions>
                          <SecondaryButton onClick={() => toggleExpand(row.id)}>
                            취소
                          </SecondaryButton>
                          <SaveButton
                            onClick={() => void handleSaveAnswer(row.id)}
                            disabled={savingId === row.id}
                          >
                            {savingId === row.id ? "저장 중..." : "답변 저장"}
                          </SaveButton>
                        </AnswerActions>
                      </AnswerFormSection>
                    </InquiryCardBody>
                  )}
                </InquiryCard>
              );
            })}
          </InquiryList>
        </ContentBody>
      </Content>
    </LayoutRoot>
  );
}

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FilterLabel = styled.span`
  font-size: 13px;
  color: #6b7280;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background-color: ${({ $active }) => ($active ? "#1d4ed8" : "#e5e7eb")};
  color: ${({ $active }) => ($active ? "#ffffff" : "#111827")};
  transition: all 0.2s;

  &:hover {
    opacity: 0.8;
  }
`;

const ReloadButton = styled.button`
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background-color: #111827;
  color: #f9fafb;
  transition: all 0.2s;

  &:hover {
    background-color: #374151;
  }
`;

const SearchSection = styled.div`
  margin-bottom: 16px;
  position: relative;
  display: flex;
  align-items: center;
`;

const SearchInput = styled.input`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 12px;
  font-size: 14px;
  padding-right: 36px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1d4ed8;
    outline: none;
  }
`;

const ClearSearchButton = styled.button`
  position: absolute;
  right: 8px;
  background-color: transparent;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;

  &:hover {
    background-color: #f3f4f6;
    color: #111827;
  }
`;

const ErrorText = styled.p`
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 8px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
  font-size: 14px;
`;

const InquiryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InquiryCard = styled.div<{ $expanded?: boolean }>`
  background-color: #ffffff;
  border: 1px solid ${({ $expanded }) => ($expanded ? "#1d4ed8" : "#e5e7eb")};
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  box-shadow: ${({ $expanded }) =>
    $expanded ? "0 4px 12px rgba(29, 78, 216, 0.15)" : "0 1px 3px rgba(0, 0, 0, 0.1)"};

  &:hover {
    border-color: #1d4ed8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

const InquiryCardHeader = styled.div`
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f9fafb;
  }
`;

const InquiryHeaderLeft = styled.div`
  display: flex;
  gap: 12px;
  flex: 1;
  min-width: 0;
`;

const InquiryInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const InquiryTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
  word-break: break-word;
`;

const InquiryMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
`;

const UserInfo = styled.div`
  font-weight: 500;
`;

const DateInfo = styled.div`
  font-size: 11px;
`;

const InquiryHeaderRight = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 12px;
`;

const ExpandIcon = styled.span<{ $expanded?: boolean }>`
  font-size: 12px;
  color: #6b7280;
  transition: transform 0.2s;
  transform: ${({ $expanded }) => ($expanded ? "rotate(180deg)" : "rotate(0deg)")};
`;

const InquiryCardBody = styled.div`
  padding: 20px;
  border-top: 1px solid #e5e7eb;
  background-color: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InquiryContentSection = styled.div`
  background-color: #ffffff;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
`;

const AnswerSection = styled.div`
  background-color: #eff6ff;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #bfdbfe;
`;

const AnswerFormSection = styled.div`
  background-color: #ffffff;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
`;

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
`;

const InquiryContentFull = styled.div`
  font-size: 14px;
  color: #111827;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
`;

const AnswerText = styled.div`
  font-size: 14px;
  color: #1e40af;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
`;

const StatusBadge = styled.span<{ $status: InquiryStatus }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background-color: ${({ $status }) =>
    $status === "answered" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)"};
  color: ${({ $status }) =>
    $status === "answered" ? "#16a34a" : "#2563eb"};
`;

const AnswerTextarea = styled.textarea`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 13px;
  resize: vertical;
  min-height: 150px;
  margin-bottom: 12px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1d4ed8;
    outline: none;
  }
`;

const AnswerActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const SecondaryButton = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background-color: #ffffff;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #f3f4f6;
  }
`;

const SaveButton = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background-color: #1d4ed8;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #1e40af;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

