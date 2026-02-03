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

interface UserRow {
  id: number;
  phone: string;
  name: string | null;
  org_code: string | null;
  created_at: string;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<UserRow[]>("/api/v1/admin/users");
      setRows(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "유저 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <LayoutRoot>
      <AdminSidebar activePage="users" />
      <Content>
        <ContentHeader>
          <ContentTitle>유저 관리</ContentTitle>
        </ContentHeader>
        <ContentBody>
          <PageDescription
            title="유저 관리 페이지"
            description="앱에 가입한 모든 사용자 목록을 확인할 수 있습니다. 사용자의 기본 정보와 가입일을 조회할 수 있습니다."
            features={[
              "전체 사용자 목록 조회",
              "사용자 ID, 전화번호, 이름, 상호명, 가입일 확인",
            ]}
            usage={[
              "페이지 접속 시 자동으로 전체 사용자 목록이 표시됩니다.",
              "테이블에서 각 사용자의 정보를 확인할 수 있습니다.",
            ]}
          />
          {loading && <InfoText>목록을 불러오는 중입니다...</InfoText>}
          {error && <ErrorText>{error}</ErrorText>}

          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>전화번호</Th>
                <Th>이름</Th>
                <Th>상호명</Th>
                <Th>가입일</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <Td colSpan={5}>등록된 유저가 없습니다.</Td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id}>
                  <Td>{u.id}</Td>
                  <Td>{u.phone}</Td>
                  <Td>{u.name ?? "-"}</Td>
                  <Td>{u.org_code ?? "-"}</Td>
                  <Td>{new Date(u.created_at).toLocaleString("ko-KR")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ContentBody>
      </Content>
    </LayoutRoot>
  );
}

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

