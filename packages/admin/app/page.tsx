"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // 토큰 확인
    const token = typeof window !== "undefined" ? window.localStorage.getItem("adminToken") : null;
    
    if (token) {
      // 토큰이 있으면 공지사항 페이지로
      router.replace("/notices");
    } else {
      // 토큰이 없으면 로그인 페이지로
      router.replace("/login");
    }
  }, [router]);

  return null;
}

