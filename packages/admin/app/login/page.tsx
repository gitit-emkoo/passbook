"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { apiFetch } from "../../lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이미 로그인된 경우 리다이렉트
  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("adminToken") : null;
    if (token) {
      router.replace("/notices");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("아이디를 입력해주세요.");
      return;
    }
    if (!password.trim()) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await apiFetch<{ accessToken: string; user: any }>("/api/v1/admin/auth/login", {
        method: "POST",
        body: { 
          username: username.trim(),
          password: password.trim(),
        },
      });
      
      // 토큰 저장
      localStorage.setItem("adminToken", response.accessToken);
      
      // 공지사항 페이지로 이동
      router.replace("/notices");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <LoginBox>
        <Title>Passbook 관리자</Title>
        <Subtitle>관리자 로그인</Subtitle>
        
        <Form onSubmit={handleLogin}>
          {error && <ErrorText>{error}</ErrorText>}
          
          <FormRow>
            <Label>아이디</Label>
            <Input
              type="text"
              placeholder="아이디를 입력하세요"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </FormRow>
          
          <FormRow>
            <Label>비밀번호</Label>
            <Input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </FormRow>
          
          <SubmitButton type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </SubmitButton>
        </Form>
      </LoginBox>
    </Container>
  );
}

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f9fafb;
`;

const LoginBox = styled.div`
  width: 100%;
  max-width: 400px;
  background-color: #ffffff;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px;
  text-align: center;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 24px;
  text-align: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
`;

const Input = styled.input`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 10px 12px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #1d4ed8;
    outline: none;
  }

  &:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  background-color: #1d4ed8;
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;

  &:hover:not(:disabled) {
    background-color: #1e40af;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.p`
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
  padding: 8px;
  background-color: #fee2e2;
  border-radius: 4px;
`;

