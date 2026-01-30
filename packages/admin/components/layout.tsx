import styled from 'styled-components';

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

