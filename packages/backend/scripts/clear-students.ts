/**
 * 학생 데이터 삭제 스크립트
 * 모든 학생과 관련된 데이터(계약서, 출결기록, 청구서 등)를 삭제합니다.
 * 
 * 실행 방법:
 * cd packages/backend
 * npx ts-node scripts/clear-students.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAllStudents() {
  try {
    console.log('학생 데이터 삭제를 시작합니다...');
    
    // 먼저 모든 학생 수 확인
    const studentCount = await prisma.student.count();
    console.log(`삭제할 학생 수: ${studentCount}명`);
    
    if (studentCount > 0) {
      // 학생 삭제 (CASCADE로 인해 관련 데이터도 자동 삭제됨)
      // - contracts (계약서)
      // - attendance_logs (출결 기록)
      // - invoices (청구서)
      // - schedule_exceptions (일정 예외)
      const result = await prisma.student.deleteMany({});
      
      console.log(`✅ ${result.count}명의 학생 데이터가 삭제되었습니다.`);
      console.log('   (관련된 계약서, 출결기록, 청구서도 함께 삭제되었습니다)');
      
      // 삭제 확인
      const remainingCount = await prisma.student.count();
      console.log(`남은 학생 수: ${remainingCount}명`);
    } else {
      console.log('삭제할 학생 데이터가 없습니다.');
    }
    
    // 시퀀스 리셋 (학생이 있든 없든 항상 실행)
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE students_id_seq RESTART WITH 1;`);
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE contracts_id_seq RESTART WITH 1;`);
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE invoices_id_seq RESTART WITH 1;`);
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE attendance_logs_id_seq RESTART WITH 1;`);
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE schedule_exceptions_id_seq RESTART WITH 1;`);
    console.log('✅ 모든 ID 시퀀스가 1로 리셋되었습니다.');
    
  } catch (error) {
    console.error('❌ 학생 데이터 삭제 중 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
clearAllStudents()
  .then(() => {
    console.log('완료되었습니다.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('스크립트 실행 실패:', error);
    process.exit(1);
  });


