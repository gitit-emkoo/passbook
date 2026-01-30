"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutRoot,
  Sidebar,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  Content,
  ContentHeader,
  ContentTitle,
  ContentBody,
} from "../../components/layout";
import styled from "styled-components";
import { apiFetch } from "../../lib/api-client";

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
      <Sidebar>
        <SidebarHeader>Passbook Admin</SidebarHeader>
        <SidebarNav>
          <SidebarNavItem>
            <Link href="/users">유저 관리</Link>
          </SidebarNavItem>
          <SidebarNavItem>
            <Link href="/notices">공지사항 관리</Link>
          </SidebarNavItem>
          <SidebarNavItem>
            <Link href="/popups">팝업 관리</Link>
          </SidebarNavItem>
          <SidebarNavItem $active>
            <Link href="/inquiries">문의사항 관리</Link>
          </SidebarNavItem>
        </SidebarNav>
      </Sidebar>
      <Content>
        <ContentHeader>
          <ContentTitle>문의사항 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
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

          <Table>
            <thead>
              <tr>
                <ThNarrow>상태</ThNarrow>
                <ThWide>사용자</ThWide>
                <ThWide>제목</ThWide>
                <ThContent>문의 내용</ThContent>
                <ThNarrow>관리자 답변</ThNarrow>
                <ThWide>접수일</ThWide>
                <ThWide>답변일</ThWide>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <Td colSpan={7}>
                    {searchQuery ? "검색 결과가 없습니다." : "표시할 문의가 없습니다."}
                  </Td>
                </tr>
              )}
              {filtered.map((row) => {
                const hasAnswer = !!row.answer;
                const isExpanded = expandedIds.has(row.id);
                return (
                  <React.Fragment key={row.id}>
                    <tr>
                      <TdNarrow>
                        <StatusBadge $status={row.status}>
                          {row.status === "answered" ? "답변 완료" : "접수"}
                        </StatusBadge>
                      </TdNarrow>
                      <TdWide>
                        <div>
                          <div>{row.user?.org_code ?? "-"}</div>
                          <SmallText>
                            {row.user?.name ?? "-"} / {row.user?.phone ?? "-"}
                          </SmallText>
                        </div>
                      </TdWide>
                      <TdWide>
                        <TitleText>{row.title ?? "제목 없음"}</TitleText>
                      </TdWide>
                      <TdContent>
                        <ContentText>{row.content}</ContentText>
                      </TdContent>
                      <TdNarrow>
                        <AnswerToggleButton onClick={() => toggleExpand(row.id)}>
                          {hasAnswer ? "수정" : "답변 작성"}
                        </AnswerToggleButton>
                      </TdNarrow>
                      <TdWide>{new Date(row.created_at).toLocaleString("ko-KR")}</TdWide>
                      <TdWide>
                        {row.answered_at
                          ? new Date(row.answered_at).toLocaleString("ko-KR")
                          : "-"}
                      </TdWide>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <TdExpanded colSpan={7}>
                          <ExpandedAnswerBox>
                            <Label>답변 내용</Label>
                            <AnswerTextarea
                              value={answerDrafts[row.id] ?? row.answer ?? ""}
                              onChange={(e) =>
                                handleAnswerChange(row.id, e.target.value)
                              }
                              rows={6}
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
                          </ExpandedAnswerBox>
                        </TdExpanded>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
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

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #4b5563;
`;

const ThNarrow = styled(Th)`
  width: 80px;
`;

const ThWide = styled(Th)`
  width: 200px;
`;

const ThContent = styled(Th)`
  width: 300px;
`;

const Td = styled.td`
  padding: 8px 6px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
`;

const TdNarrow = styled(Td)`
  width: 80px;
`;

const TdWide = styled(Td)`
  width: 200px;
`;

const TdContent = styled(Td)`
  width: 300px;
`;

const TdExpanded = styled(Td)`
  background-color: #fcfcfc;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
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

const SmallText = styled.div`
  font-size: 12px;
  color: #4b5563;
`;

const TitleText = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  word-break: break-word;
  line-height: 1.5;
`;

const ContentText = styled.div`
  font-size: 13px;
  color: #4b5563;
  word-break: break-word;
  line-height: 1.5;
  max-height: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
`;

const AnswerToggleButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #1d4ed8;
  background-color: #ffffff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #f9fafb;
    border-color: #d1d5db;
  }
`;

const ExpandedAnswerBox = styled.div`
  background-color: #fefefe;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
`;

const Label = styled.div`
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
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

