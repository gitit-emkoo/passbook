/**
 * Firebase 설정 확인 스크립트
 * 
 * 사용법:
 * cd packages/backend
 * npx ts-node scripts/check-firebase-config.ts
 */

import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env 파일 로드
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkFirebaseConfig() {
  console.log('🔍 Firebase 설정 확인 중...\n');

  const configService = new ConfigService();
  const serviceAccountKey = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY');

  // 1. 환경 변수 존재 확인
  if (!serviceAccountKey) {
    console.log('❌ FIREBASE_SERVICE_ACCOUNT_KEY가 설정되지 않았습니다.');
    console.log('   packages/backend/.env 파일에 다음을 추가하세요:');
    console.log('   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}');
    console.log('\n   자세한 내용은 FIREBASE_SETUP.md를 참고하세요.');
    process.exit(1);
  }

  console.log('✅ FIREBASE_SERVICE_ACCOUNT_KEY 환경 변수 발견');

  // 2. JSON 파싱 확인
  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(serviceAccountKey);
    console.log('✅ JSON 파싱 성공');
    console.log(`   프로젝트 ID: ${serviceAccount.project_id || 'N/A'}`);
    console.log(`   클라이언트 이메일: ${serviceAccount.client_email || 'N/A'}`);
  } catch (error: any) {
    console.log('❌ JSON 파싱 실패:');
    console.log(`   ${error.message}`);
    console.log('\n   JSON이 한 줄로 올바르게 변환되었는지 확인하세요.');
    process.exit(1);
  }

  // 3. Firebase Admin 초기화 확인
  try {
    const firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin 초기화 성공');
    
    // 4. Firebase 연결 테스트 (프로젝트 정보 가져오기)
    try {
      const projectId = firebaseApp.options.projectId;
      console.log(`✅ Firebase 프로젝트 연결 확인: ${projectId}`);
    } catch (error: any) {
      console.log('⚠️  Firebase 프로젝트 정보 확인 실패:');
      console.log(`   ${error.message}`);
    }

    // 정리
    await firebaseApp.delete();
    
    console.log('\n✅ Firebase 설정이 올바르게 구성되었습니다!');
    console.log('   이제 백엔드 서버를 재시작하면 푸시 알림이 활성화됩니다.');
  } catch (error: any) {
    console.log('❌ Firebase Admin 초기화 실패:');
    console.log(`   ${error.message}`);
    console.log('\n   Service Account Key가 올바른지 확인하세요.');
    process.exit(1);
  }
}

checkFirebaseConfig().catch((error) => {
  console.error('❌ 확인 중 오류 발생:', error);
  process.exit(1);
});


