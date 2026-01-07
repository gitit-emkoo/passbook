/**
 * 모든 고객 데이터 완전 삭제 및 ID 시퀀스 리셋 스크립트
 * 
 * 실행 방법:
 * cd packages/backend
 * npx ts-node scripts/clear-all-students-complete.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAllStudentsComplete() {
  try {
    console.log('========================================');
    console.log('모든 고객 데이터 삭제 시작...');
    console.log('========================================\n');
    
    // 1. 현재 데이터 확인
    const studentCount = await prisma.student.count();
    const contractCount = await prisma.contract.count();
    const attendanceCount = await prisma.attendanceLog.count();
    const invoiceCount = await prisma.invoice.count();
    const reservationCount = await prisma.reservation.count();
    const scheduleExceptionCount = await prisma.scheduleException.count();
    
    console.log('현재 데이터 상태:');
    console.log(`  - 고객(Student): ${studentCount}명`);
    console.log(`  - 계약(Contract): ${contractCount}개`);
    console.log(`  - 출결기록(AttendanceLog): ${attendanceCount}개`);
    console.log(`  - 청구서(Invoice): ${invoiceCount}개`);
    console.log(`  - 예약(Reservation): ${reservationCount}개`);
    console.log(`  - 일정예외(ScheduleException): ${scheduleExceptionCount}개\n`);
    
    // 2. ID 시퀀스 확인
    const studentSeqResult = await prisma.$queryRaw<Array<{ last_value: bigint }>>`
      SELECT last_value FROM students_id_seq;
    `;
    const studentLastValue = Number(studentSeqResult[0]?.last_value || 0);
    console.log(`현재 Student ID 시퀀스: ${studentLastValue}\n`);
    
    // 3. 모든 관련 데이터 삭제 (순서 중요: 외래키 제약조건 고려)
    console.log('데이터 삭제 중...');
    
    // 예약 삭제
    if (reservationCount > 0) {
      const reservationResult = await prisma.reservation.deleteMany({});
      console.log(`  ✅ 예약(Reservation) ${reservationResult.count}개 삭제`);
    }
    
    // 일정 예외 삭제
    if (scheduleExceptionCount > 0) {
      const scheduleExceptionResult = await prisma.scheduleException.deleteMany({});
      console.log(`  ✅ 일정예외(ScheduleException) ${scheduleExceptionResult.count}개 삭제`);
    }
    
    // 출결 기록 삭제
    if (attendanceCount > 0) {
      const attendanceResult = await prisma.attendanceLog.deleteMany({});
      console.log(`  ✅ 출결기록(AttendanceLog) ${attendanceResult.count}개 삭제`);
    }
    
    // 청구서 삭제
    if (invoiceCount > 0) {
      const invoiceResult = await prisma.invoice.deleteMany({});
      console.log(`  ✅ 청구서(Invoice) ${invoiceResult.count}개 삭제`);
    }
    
    // 계약 삭제
    if (contractCount > 0) {
      const contractResult = await prisma.contract.deleteMany({});
      console.log(`  ✅ 계약(Contract) ${contractResult.count}개 삭제`);
    }
    
    // 고객 삭제
    if (studentCount > 0) {
      const studentResult = await prisma.student.deleteMany({});
      console.log(`  ✅ 고객(Student) ${studentResult.count}명 삭제`);
    }
    
    console.log('\n');
    
    // 4. 삭제 확인
    const remainingStudentCount = await prisma.student.count();
    const remainingContractCount = await prisma.contract.count();
    const remainingAttendanceCount = await prisma.attendanceLog.count();
    const remainingInvoiceCount = await prisma.invoice.count();
    const remainingReservationCount = await prisma.reservation.count();
    const remainingScheduleExceptionCount = await prisma.scheduleException.count();
    
    console.log('삭제 후 남은 데이터:');
    console.log(`  - 고객(Student): ${remainingStudentCount}명`);
    console.log(`  - 계약(Contract): ${remainingContractCount}개`);
    console.log(`  - 출결기록(AttendanceLog): ${remainingAttendanceCount}개`);
    console.log(`  - 청구서(Invoice): ${remainingInvoiceCount}개`);
    console.log(`  - 예약(Reservation): ${remainingReservationCount}개`);
    console.log(`  - 일정예외(ScheduleException): ${remainingScheduleExceptionCount}개\n`);
    
    // 5. ID 시퀀스 리셋
    console.log('ID 시퀀스 리셋 중...');
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE students_id_seq RESTART WITH 1;`);
      console.log('  ✅ students_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ students_id_seq 리셋 실패:', error.message);
    }
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE contracts_id_seq RESTART WITH 1;`);
      console.log('  ✅ contracts_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ contracts_id_seq 리셋 실패:', error.message);
    }
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE invoices_id_seq RESTART WITH 1;`);
      console.log('  ✅ invoices_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ invoices_id_seq 리셋 실패:', error.message);
    }
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE attendance_logs_id_seq RESTART WITH 1;`);
      console.log('  ✅ attendance_logs_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ attendance_logs_id_seq 리셋 실패:', error.message);
    }
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE reservations_id_seq RESTART WITH 1;`);
      console.log('  ✅ reservations_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ reservations_id_seq 리셋 실패:', error.message);
    }
    
    try {
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE schedule_exceptions_id_seq RESTART WITH 1;`);
      console.log('  ✅ schedule_exceptions_id_seq 리셋 완료');
    } catch (error: any) {
      console.error('  ❌ schedule_exceptions_id_seq 리셋 실패:', error.message);
    }
    
    // 6. 시퀀스 확인
    const newStudentSeqResult = await prisma.$queryRaw<Array<{ last_value: bigint }>>`
      SELECT last_value FROM students_id_seq;
    `;
    const newStudentLastValue = Number(newStudentSeqResult[0]?.last_value || 0);
    console.log(`\n리셋 후 Student ID 시퀀스: ${newStudentLastValue}`);
    
    console.log('\n========================================');
    console.log('✅ 모든 작업이 완료되었습니다!');
    console.log('========================================');
    console.log('\n이제 새로운 고객을 생성하면 ID가 1번부터 시작됩니다.');
    
  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
clearAllStudentsComplete()
  .then(() => {
    console.log('\n완료되었습니다.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n스크립트 실행 실패:', error);
    process.exit(1);
  });

