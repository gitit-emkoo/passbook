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
import { apiFetch, uploadImage } from "../../lib/api-client";
import PageDescription from "../../components/PageDescription";

interface PopupRow {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    if (!title.trim()) {
      alert("제목을 입력해 주세요.");
      return;
    }
    if (!imageUrl) {
      alert("이미지를 업로드해 주세요.");
      return;
    }
    try {
      setSaving(true);
      await apiFetch<PopupRow>("/api/v1/admin/popups", {
        method: "POST",
        body: {
          title: title.trim(),
          content: "", // 내용은 빈 문자열로 전송 (DB 호환성)
          image_url: imageUrl,
          link_url: linkUrl.trim() || undefined,
          is_active: isActive,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        },
      });
      setTitle("");
      setImageUrl(null);
      setLinkUrl("");
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

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB를 초과할 수 없습니다.');
      return;
    }

    try {
      setUploading(true);
      const result = await uploadImage(file, 'popup');
      setImageUrl(result.imageUrl);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <LayoutRoot>
      <AdminSidebar activePage="popups" />
      <Content>
        <ContentHeader>
          <ContentTitle>팝업 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
          <PageDescription
            title="팝업 관리 페이지"
            description="앱 실행 시 화면 하단에 표시되는 바텀시트 팝업을 생성하고 관리할 수 있습니다. 팝업은 앱 홈 화면 하단에서 자동으로 표시되며, 사용자가 '오늘은 그만 보기'를 선택할 수 있습니다. 이미지에 링크를 설정하면 사용자가 이미지를 클릭했을 때 해당 링크로 이동합니다."
            features={[
              "팝업 작성, 수정, 삭제",
              "이미지 첨부 필수 (최적 사이즈: 400×400px JPG, 품질 85%, 예상 용량 80-150KB)",
              "딥링크 URL 설정 (이미지 클릭 시 이동할 링크)",
              "활성/비활성 상태 관리",
              "시작일/종료일 설정으로 기간별 표시 제어",
            ]}
            usage={[
              "새 팝업 작성: 제목(관리용)을 입력하고 이미지를 업로드한 후 '팝업 등록' 버튼을 클릭합니다. 제목은 관리 목적으로만 사용되며 앱에는 표시되지 않습니다.",
              "이미지 업로드: 400×400px JPG 형식 권장 (품질 85%, 1:1 정사각형). 파일 크기는 150KB 이하가 최적이며, 최대 300KB까지 가능합니다. 팝업은 바텀시트 형태로 화면 높이의 45%를 차지하며, 이미지만 표시됩니다.",
              "딥링크 설정: 링크 URL을 입력하면 사용자가 팝업 이미지를 클릭했을 때 해당 링크로 이동합니다. 웹 URL (https://) 또는 앱 딥링크 (passbook://) 형식을 사용할 수 있습니다.",
              "활성 상태: '활성' 토글로 팝업의 표시 여부를 제어할 수 있습니다. 비활성 상태면 앱에 표시되지 않습니다.",
              "기간 설정: 시작일과 종료일을 설정하면 해당 기간에만 팝업이 표시됩니다. 설정하지 않으면 무기한 표시됩니다.",
              "팝업 삭제: '삭제' 버튼을 클릭하면 해당 팝업이 영구적으로 삭제됩니다.",
            ]}
            deepLinkGuide={{
              title: "앱 딥링크 사용 방법",
              description: "팝업 이미지 클릭 시 앱 내부 페이지로 이동하려면 다음 형식의 딥링크를 사용하세요:",
              examples: [
                { label: "홈 화면", url: "passbook:///home" },
                { label: "정산 화면", url: "passbook:///settlement" },
                { label: "수강생 목록", url: "passbook:///students" },
                { label: "수강생 상세 (ID: 3)", url: "passbook:///students/3" },
                { label: "알림 화면", url: "passbook:///notifications" },
                { label: "공지사항", url: "passbook:///notices" },
                { label: "설정 화면", url: "passbook:///settings" },
                { label: "계약서 보기 (ID: 5)", url: "passbook:///contracts/5" },
              ],
              note: "웹 URL로 이동하려면 일반 HTTP/HTTPS URL을 사용하세요 (예: https://example.com).",
            }}
          />
          <FormSection>
            <SectionTitle>새 팝업 작성</SectionTitle>
            <FormRow>
              <Label>제목 (관리용)</Label>
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) 이벤트 안내"
              />
              <HelperText>
                제목은 관리 목적으로만 사용되며, 앱에는 표시되지 않습니다.
              </HelperText>
            </FormRow>
            <FormRow>
              <Label>이미지 (필수)</Label>
              <ImageUploadSection>
                <FileInput
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload(file);
                    }
                  }}
                  disabled={uploading || saving}
                />
                {imageUrl && (
                  <ImagePreview>
                    <ImagePreviewImg src={imageUrl} alt="미리보기" />
                    <RemoveImageButton
                      onClick={() => setImageUrl(null)}
                      type="button"
                    >
                      ✕
                    </RemoveImageButton>
                  </ImagePreview>
                )}
                {uploading && <UploadStatus>업로드 중...</UploadStatus>}
              </ImageUploadSection>
            </FormRow>
            <FormRow>
              <Label>링크 URL (선택)</Label>
              <TextInput
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com 또는 앱 딥링크 (예: myapp://page/123)"
              />
              <HelperText>
                이미지 클릭 시 이동할 링크를 입력하세요. 웹 URL 또는 앱 딥링크를 사용할 수 있습니다.
              </HelperText>
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
                  <Th>시작일시</Th>
                  <Th>종료일시</Th>
                  <Th>작성일</Th>
                  <Th>동작</Th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <Td colSpan={6}>등록된 팝업이 없습니다.</Td>
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

const ImageUploadSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FileInput = styled.input`
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ImagePreview = styled.div`
  position: relative;
  display: inline-block;
  max-width: 300px;
`;

const ImagePreviewImg = styled.img`
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
`;

const RemoveImageButton = styled.button`
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background-color: #dc2626;
  }
`;

const UploadStatus = styled.div`
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
`;

const HelperText = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  line-height: 1.4;
`;

