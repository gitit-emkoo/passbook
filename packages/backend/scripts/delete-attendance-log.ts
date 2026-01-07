import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  ts-node scripts/delete-attendance-log.ts <attendance_log_id>');
    console.log('  ts-node scripts/delete-attendance-log.ts --student <student_id>');
    console.log('  ts-node scripts/delete-attendance-log.ts --contract <contract_id>');
    console.log('  ts-node scripts/delete-attendance-log.ts --student <student_id> --status substitute');
    console.log('');
    console.log('Examples:');
    console.log('  ts-node scripts/delete-attendance-log.ts 123');
    console.log('  ts-node scripts/delete-attendance-log.ts --student 1');
    console.log('  ts-node scripts/delete-attendance-log.ts --student 1 --status substitute');
    process.exit(1);
  }

  try {
    if (args[0] === '--student') {
      const studentId = parseInt(args[1], 10);
      if (isNaN(studentId)) {
        console.error('Invalid student ID');
        process.exit(1);
      }

      const statusFilter = args[2] === '--status' ? args[3] : undefined;

      // 학생의 출결 로그 조회
      const where: any = {
        student_id: studentId,
        voided: false,
      };

      if (statusFilter) {
        where.status = statusFilter;
      }

      const logs = await prisma.attendanceLog.findMany({
        where,
        orderBy: {
          occurred_at: 'desc',
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
          contract: {
            select: {
              id: true,
              subject: true,
            },
          },
        },
      });

      if (logs.length === 0) {
        console.log('No attendance logs found');
        process.exit(0);
      }

      console.log(`Found ${logs.length} attendance log(s):`);
      logs.forEach((log, index) => {
        console.log(`${index + 1}. ID: ${log.id}, Student: ${log.student.name}, Contract: ${log.contract.subject}, Status: ${log.status}, Date: ${log.occurred_at.toISOString()}`);
      });

      console.log('');
      console.log('Deleting...');

      // 출결 로그 삭제
      const result = await prisma.attendanceLog.deleteMany({
        where,
      });

      console.log(`Deleted ${result.count} attendance log(s)`);
    } else if (args[0] === '--contract') {
      const contractId = parseInt(args[1], 10);
      if (isNaN(contractId)) {
        console.error('Invalid contract ID');
        process.exit(1);
      }

      const logs = await prisma.attendanceLog.findMany({
        where: {
          contract_id: contractId,
          voided: false,
        },
        orderBy: {
          occurred_at: 'desc',
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
          contract: {
            select: {
              id: true,
              subject: true,
            },
          },
        },
      });

      if (logs.length === 0) {
        console.log('No attendance logs found');
        process.exit(0);
      }

      console.log(`Found ${logs.length} attendance log(s):`);
      logs.forEach((log, index) => {
        console.log(`${index + 1}. ID: ${log.id}, Student: ${log.student.name}, Contract: ${log.contract.subject}, Status: ${log.status}, Date: ${log.occurred_at.toISOString()}`);
      });

      console.log('');
      console.log('Deleting...');

      const result = await prisma.attendanceLog.deleteMany({
        where: {
          contract_id: contractId,
          voided: false,
        },
      });

      console.log(`Deleted ${result.count} attendance log(s)`);
    } else {
      // 출결 로그 ID로 삭제
      const logId = parseInt(args[0], 10);
      if (isNaN(logId)) {
        console.error('Invalid attendance log ID');
        process.exit(1);
      }

      const log = await prisma.attendanceLog.findUnique({
        where: { id: logId },
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
          contract: {
            select: {
              id: true,
              subject: true,
            },
          },
        },
      });

      if (!log) {
        console.error('Attendance log not found');
        process.exit(1);
      }

      console.log(`Found attendance log:`);
      console.log(`  ID: ${log.id}`);
      console.log(`  Student: ${log.student.name}`);
      console.log(`  Contract: ${log.contract.subject}`);
      console.log(`  Status: ${log.status}`);
      console.log(`  Date: ${log.occurred_at.toISOString()}`);
      console.log(`  Substitute At: ${log.substitute_at ? log.substitute_at.toISOString() : 'N/A'}`);

      console.log('');
      console.log('Deleting...');

      await prisma.attendanceLog.delete({
        where: { id: logId },
      });

      console.log('Deleted successfully');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


