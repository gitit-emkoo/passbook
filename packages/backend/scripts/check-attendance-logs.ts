import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  ts-node scripts/check-attendance-logs.ts --student <student_id>');
    console.log('  ts-node scripts/check-attendance-logs.ts --contract <contract_id>');
    process.exit(1);
  }

  try {
    if (args[0] === '--student') {
      const studentId = parseInt(args[1], 10);
      if (isNaN(studentId)) {
        console.error('Invalid student ID');
        process.exit(1);
      }

      const logs = await prisma.attendanceLog.findMany({
        where: {
          student_id: studentId,
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

      console.log(`Found ${logs.length} attendance log(s) for student ${studentId}:`);
      logs.forEach((log, index) => {
        console.log(`${index + 1}. ID: ${log.id}, Student: ${log.student.name}, Contract: ${log.contract.subject}, Status: ${log.status}, Date: ${log.occurred_at.toISOString()}, Substitute: ${log.substitute_at ? log.substitute_at.toISOString() : 'N/A'}, Voided: ${log.voided}`);
      });

      // 예약도 확인
      const contracts = await prisma.contract.findMany({
        where: {
          student_id: studentId,
        },
        select: {
          id: true,
          subject: true,
        },
      });

      for (const contract of contracts) {
        const reservations = await (prisma as any).reservation.findMany({
          where: {
            contract_id: contract.id,
          },
          orderBy: {
            reserved_date: 'asc',
          },
        });

        if (reservations.length > 0) {
          console.log(`\nReservations for contract ${contract.id} (${contract.subject}):`);
          reservations.forEach((r: any, index: number) => {
            console.log(`  ${index + 1}. ID: ${r.id}, Date: ${r.reserved_date}, Time: ${r.reserved_time || 'N/A'}`);
          });
        }
      }
    } else if (args[0] === '--contract') {
      const contractId = parseInt(args[1], 10);
      if (isNaN(contractId)) {
        console.error('Invalid contract ID');
        process.exit(1);
      }

      const logs = await prisma.attendanceLog.findMany({
        where: {
          contract_id: contractId,
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

      console.log(`Found ${logs.length} attendance log(s) for contract ${contractId}:`);
      logs.forEach((log, index) => {
        console.log(`${index + 1}. ID: ${log.id}, Student: ${log.student.name}, Contract: ${log.contract.subject}, Status: ${log.status}, Date: ${log.occurred_at.toISOString()}, Substitute: ${log.substitute_at ? log.substitute_at.toISOString() : 'N/A'}, Voided: ${log.voided}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


