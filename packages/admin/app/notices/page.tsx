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

type NoticeStatus = "normal" | "important";

interface NoticeRow {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  is_important: boolean;
  created_at: string;
  updated_at: string;
}

export default function NoticesPage() {
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsImportant, setEditIsImportant] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<NoticeRow[]>("/api/v1/admin/notices");
      setRows(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "공지사항 목록을 불러오지 못했습니다.");
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
      await apiFetch<NoticeRow>("/api/v1/admin/notices", {
        method: "POST",
        body: { title: title.trim(), content: content.trim(), is_important: isImportant },
      });
      setTitle("");
      setContent("");
      setIsImportant(false);
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "공지 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("해당 공지를 삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/api/v1/admin/notices/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "공지 삭제에 실패했습니다.");
    }
  };

  const handleEdit = (notice: NoticeRow) => {
    setEditingId(notice.id);
    setEditTitle(notice.title);
    setEditContent(notice.content);
    setEditIsImportant(notice.is_important);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
    setEditIsImportant(false);
  };

  const handleUpdate = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      alert("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    try {
      setUpdatingId(id);
      await apiFetch<NoticeRow>(`/api/v1/admin/notices/${id}`, {
        method: "PATCH",
        body: { title: editTitle.trim(), content: editContent.trim(), is_important: editIsImportant },
      });
      handleCancelEdit();
      await load();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "공지 수정에 실패했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };


  return (
    <LayoutRoot>
      <AdminSidebar activePage="notices" />
      <Content>
        <ContentHeader>
          <ContentTitle>공지사항 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
          <PageDescription
            title="공지사항 관리 페이지"
            description="앱 사용자에게 표시할 공지사항을 작성하고 관리할 수 있습니다. 공지사항은 앱의 공지사항 목록 화면에 표시되며, 중요 공지로 설정하면 상단에 고정됩니다."
            features={[
              "공지사항 작성, 수정, 삭제",
              "중요 공지 설정 (상단 고정)",
              "공지 내용에 URL 포함 시 자동으로 클릭 가능한 링크로 변환",
            ]}
            usage={[
              "새 공지 작성: 제목과 내용을 입력한 후 '공지 등록' 버튼을 클릭합니다.",
              "공지 수정: 기존 공지의 '수정' 버튼을 클릭하여 내용을 변경할 수 있습니다.",
              "공지 삭제: '삭제' 버튼을 클릭하면 해당 공지가 영구적으로 삭제됩니다.",
              "중요 공지: '중요 공지로 설정' 체크박스를 선택하면 앱에서 상단에 고정 표시됩니다.",
            ]}
          />
          <FormSection>
            <SectionTitle>새 공지 작성</SectionTitle>
            <FormRow>
              <Label>제목</Label>
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) 신규 기능 업데이트 안내"
              />
            </FormRow>
            <FormRow>
              <Label>내용</Label>
              <TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="공지 내용을 입력해 주세요."
                rows={4}
              />
            </FormRow>
            <FormRow>
              <label>
                <Checkbox
                  type="checkbox"
                  checked={isImportant}
                  onChange={(e) => setIsImportant(e.target.checked)}
                />{" "}
                중요 공지로 표시
              </label>
            </FormRow>
            <FormActions>
              <PrimaryButton onClick={handleCreate} disabled={saving}>
                {saving ? "저장 중..." : "공지 등록"}
              </PrimaryButton>
            </FormActions>
          </FormSection>

          <ListSection>
            <SectionTitle>공지 목록</SectionTitle>
            {loading && <InfoText>목록을 불러오는 중입니다...</InfoText>}
            {error && <ErrorText>{error}</ErrorText>}

            <Table>
              <thead>
                <tr>
                  <Th>중요</Th>
                  <Th>제목</Th>
                  <Th>내용</Th>
                  <Th>작성일</Th>
                  <Th>동작</Th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <Td colSpan={5}>등록된 공지가 없습니다.</Td>
                  </tr>
                )}
                {rows.map((n) => (
                  <React.Fragment key={n.id}>
                    <tr>
                      <Td>{n.is_important ? "★" : ""}</Td>
                      <Td>{n.title}</Td>
                      <Td>
                        <SmallText>{n.content}</SmallText>
                      </Td>
                      <Td>{new Date(n.created_at).toLocaleString("ko-KR")}</Td>
                      <Td>
                        <Actions>
                          <SecondaryButton onClick={() => handleEdit(n)}>
                            수정
                          </SecondaryButton>
                          <DangerButton onClick={() => handleDelete(n.id)}>
                            삭제
                          </DangerButton>
                        </Actions>
                      </Td>
                    </tr>
                    {editingId === n.id && (
                      <tr>
                        <TdExpanded colSpan={5}>
                          <ExpandedEditBox>
                            <FormRow>
                              <Label>제목</Label>
                              <TextInput
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="예) 신규 기능 업데이트 안내"
                              />
                            </FormRow>
                            <FormRow>
                              <Label>내용</Label>
                              <TextArea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                placeholder="공지 내용을 입력해 주세요."
                                rows={6}
                              />
                            </FormRow>
                            <FormRow>
                              <label>
                                <Checkbox
                                  type="checkbox"
                                  checked={editIsImportant}
                                  onChange={(e) => setEditIsImportant(e.target.checked)}
                                />{" "}
                                중요 공지로 표시
                              </label>
                            </FormRow>
                            <FormActions>
                              <SecondaryButton onClick={handleCancelEdit}>
                                취소
                              </SecondaryButton>
                              <PrimaryButton
                                onClick={() => void handleUpdate(n.id)}
                                disabled={updatingId === n.id}
                              >
                                {updatingId === n.id ? "저장 중..." : "공지 수정"}
                              </PrimaryButton>
                            </FormActions>
                          </ExpandedEditBox>
                        </TdExpanded>
                      </tr>
                    )}
                  </React.Fragment>
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

const SmallText = styled.div`
  font-size: 12px;
  color: #4b5563;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const SecondaryButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background-color: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #f3f4f6;
  }
`;

const TdExpanded = styled(Td)`
  background-color: #fcfcfc;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
`;

const ExpandedEditBox = styled.div`
  background-color: #fefefe;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
`;


