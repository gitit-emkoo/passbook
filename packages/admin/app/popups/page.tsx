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

interface PopupRow {
  id: number;
  title: string;
  content: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function PopupsPage() {
  const [rows, setRows] = useState<PopupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<PopupRow[]>("/api/v1/admin/popups");
      setRows(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "팝업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    try {
      setSaving(true);
      await apiFetch<PopupRow>("/api/v1/admin/popups", {
        method: "POST",
        body: {
          title: title.trim(),
          content: content.trim(),
          is_active: isActive,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        },
      });
      setTitle("");
      setContent("");
      setIsActive(true);
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "팝업 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("해당 팝업을 삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/api/v1/admin/popups/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "팝업 삭제에 실패했습니다.");
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      await apiFetch<PopupRow>(`/api/v1/admin/popups/${id}`, {
        method: "PATCH",
        body: { is_active: !currentActive },
      });
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "팝업 상태 변경에 실패했습니다.");
    }
  };

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("ko-KR");
    } catch {
      return dateString;
    }
  };

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
          <SidebarNavItem $active>
            <Link href="/popups">팝업 관리</Link>
          </SidebarNavItem>
          <SidebarNavItem>
            <Link href="/inquiries">문의사항 관리</Link>
          </SidebarNavItem>
        </SidebarNav>
      </Sidebar>
      <Content>
        <ContentHeader>
          <ContentTitle>팝업 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
          <FormSection>
            <SectionTitle>새 팝업 작성</SectionTitle>
            <FormRow>
              <Label>제목</Label>
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) 이벤트 안내"
              />
            </FormRow>
            <FormRow>
              <Label>내용</Label>
              <TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="팝업 내용을 입력해 주세요."
                rows={4}
              />
            </FormRow>
            <FormRow>
              <label>
                <Checkbox
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />{" "}
                활성화
              </label>
            </FormRow>
            <FormRow>
              <Label>시작일시 (선택)</Label>
              <DateTimeInput
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </FormRow>
            <FormRow>
              <Label>종료일시 (선택)</Label>
              <DateTimeInput
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </FormRow>
            <FormActions>
              <PrimaryButton onClick={handleCreate} disabled={saving}>
                {saving ? "저장 중..." : "팝업 등록"}
              </PrimaryButton>
            </FormActions>
          </FormSection>

          <ListSection>
            <SectionTitle>팝업 목록</SectionTitle>
            {loading && <InfoText>목록을 불러오는 중입니다...</InfoText>}
            {error && <ErrorText>{error}</ErrorText>}

            <Table>
              <thead>
                <tr>
                  <Th>상태</Th>
                  <Th>제목</Th>
                  <Th>내용</Th>
                  <Th>시작일시</Th>
                  <Th>종료일시</Th>
                  <Th>작성일</Th>
                  <Th>동작</Th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <Td colSpan={7}>등록된 팝업이 없습니다.</Td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <StatusBadge $active={p.is_active}>
                        {p.is_active ? "활성" : "비활성"}
                      </StatusBadge>
                    </Td>
                    <Td>{p.title}</Td>
                    <Td>
                      <SmallText>{p.content}</SmallText>
                    </Td>
                    <Td>{formatDateTime(p.starts_at)}</Td>
                    <Td>{formatDateTime(p.ends_at)}</Td>
                    <Td>{new Date(p.created_at).toLocaleString("ko-KR")}</Td>
                    <Td>
                      <Actions>
                        <ToggleButton
                          onClick={() => handleToggleActive(p.id, p.is_active)}
                        >
                          {p.is_active ? "비활성화" : "활성화"}
                        </ToggleButton>
                        <DangerButton onClick={() => handleDelete(p.id)}>
                          삭제
                        </DangerButton>
                      </Actions>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </ListSection>
        </ContentBody>
      </Content>
    </LayoutRoot>
  );
}

const FormSection = styled.div`
  margin-bottom: 24px;
`;

const ListSection = styled.div``;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
`;

const FormRow = styled.div`
  margin-bottom: 10px;
`;

const Label = styled.div`
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const TextInput = styled.input`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 14px;
`;

const TextArea = styled.textarea`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 14px;
  resize: vertical;
`;

const DateTimeInput = styled.input`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 14px;
`;

const Checkbox = styled.input``;

const FormActions = styled.div`
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
`;

const PrimaryButton = styled.button`
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background-color: #1d4ed8;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`;

const DangerButton = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background-color: #b91c1c;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
`;

const ToggleButton = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #1d4ed8;
  background-color: #ffffff;
  color: #1d4ed8;
  font-size: 12px;
  cursor: pointer;
  margin-right: 4px;
`;

const InfoText = styled.p`
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
`;

const ErrorText = styled.p`
  font-size: 13px;
  color: #b91c1c;
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

const Td = styled.td`
  padding: 8px 6px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background-color: ${({ $active }) =>
    $active ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.12)"};
  color: ${({ $active }) => ($active ? "#16a34a" : "#6b7280")};
`;

const SmallText = styled.div`
  font-size: 12px;
  color: #4b5563;
`;

const Actions = styled.div`
  display: flex;
  gap: 4px;
`;

