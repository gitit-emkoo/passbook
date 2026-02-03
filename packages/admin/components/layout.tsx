import styled from 'styled-components';
import React from 'react';
import { useRouter } from 'next/navigation';

export const LayoutRoot = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: #f9fafb;
`;

export const Sidebar = styled.aside`
  width: 240px;
  background-color: #1f2937;
  color: #ffffff;
  padding: 24px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
`;

export const SidebarHeader = styled.h1`
  font-size: 20px;
  font-weight: 700;
  padding: 0 24px;
  margin-bottom: 32px;
  color: #ffffff;
`;

export const SidebarNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`;

export const SidebarNavItem = styled.div<{ $active?: boolean }>`
  padding: 12px 24px;
  background-color: ${({ $active }) => ($active ? '#374151' : 'transparent')};
  transition: background-color 0.2s;

  &:hover {
    background-color: #374151;
  }

  a {
    color: #ffffff;
    font-size: 14px;
    font-weight: ${({ $active }) => ($active ? 600 : 400)};
    display: block;
  }
`;

export const SidebarFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid #374151;
  margin-top: auto;
`;

export const LogoutButton = styled.button`
  width: 100%;
  padding: 10px 16px;
  border-radius: 6px;
  border: 1px solid #6b7280;
  background-color: transparent;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #374151;
    border-color: #9ca3af;
  }
`;

export const Content = styled.main`
  flex: 1;
  padding: 32px;
  overflow-y: auto;
`;

export const ContentHeader = styled.header`
  margin-bottom: 24px;
`;

export const ContentTitle = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

export const ContentBody = styled.div`
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
`;

export function AdminSidebar({ activePage }: { activePage?: string }) {
  const router = useRouter();

  const handleLogout = () => {
    if (confirm('로그아웃하시겠습니까?')) {
      localStorage.removeItem('adminToken');
      router.replace('/login');
    }
  };

  return (
    <Sidebar>
      <SidebarHeader>Passbook Admin</SidebarHeader>
      <SidebarNav>
        <SidebarNavItem $active={activePage === 'users'}>
          <a href="/users">유저 관리</a>
        </SidebarNavItem>
        <SidebarNavItem $active={activePage === 'notices'}>
          <a href="/notices">공지사항 관리</a>
        </SidebarNavItem>
        <SidebarNavItem $active={activePage === 'popups'}>
          <a href="/popups">팝업 관리</a>
        </SidebarNavItem>
        <SidebarNavItem $active={activePage === 'inquiries'}>
          <a href="/inquiries">문의사항 관리</a>
        </SidebarNavItem>
      </SidebarNav>
      <SidebarFooter>
        <LogoutButton onClick={handleLogout}>로그아웃</LogoutButton>
      </SidebarFooter>
    </Sidebar>
  );
}

