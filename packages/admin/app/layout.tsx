import React from "react";
import StyledComponentsRegistry from "../lib/styled-registry";
import { GlobalStyle } from "../lib/global-style";

export const metadata = {
  title: "Passbook 관리자",
  description: "Passbook 서비스 관리자 페이지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <StyledComponentsRegistry>
          <GlobalStyle />
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}


