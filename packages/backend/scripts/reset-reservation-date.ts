import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage:');
    console.log('  ts-node scripts/reset-reservation-date.ts <reservation_id> <original_date>');
    console.log('  ts-node scripts/reset-reservation-date.ts --contract <contract_id> <original_date>');
    console.log('');
    console.log('Examples:');
    console.log('  ts-node scripts/reset-reservation-date.ts 1 2025-12-30');
    console.log('  ts-node scripts/reset-reservation-date.ts --contract 1 2025-12-30');
    process.exit(1);
  }

  try {
    if (args[0] === '--contract') {
      const contractId = parseInt(args[1], 10);
      const originalDateStr = args[2];
      
      if (isNaN(contractId)) {
        console.error('Invalid contract ID');
        process.exit(1);
      }

      if (!originalDateStr) {
        console.error('Original date is required');
        process.exit(1);
      }

      // 원래 날짜 파싱
      const [year, month, day] = originalDateStr.split('-').map(Number);
      const originalDate = new Date(year, month - 1, day, 0, 0, 0, 0);

      // 계약의 예약 조회
      const reservations = await (prisma as any).reservation.findMany({
        where: {
          contract_id: contractId,
        },
      });

      if (reservations.length === 0) {
        console.log('No reservations found for this contract');
        process.exit(0);
      }

      console.log(`Found ${reservations.length} reservation(s):`);
      reservations.forEach((r: any, index: number) => {
        console.log(`${index + 1}. ID: ${r.id}, Current Date: ${r.reserved_date}, Time: ${r.reserved_time || 'N/A'}`);
      });

      console.log(`\nResetting reservation date to: ${originalDate.toISOString()}`);

      // 예약 날짜 복구
      for (const reservation of reservations) {
        await (prisma as any).reservation.update({
          where: { id: reservation.id },
          data: {
            reserved_date: originalDate,
          },
        });
        console.log(`Updated reservation ${reservation.id}`);
      }

      console.log('Done!');
    } else {
      const reservationId = parseInt(args[0], 10);
      const originalDateStr = args[1];
      
      if (isNaN(reservationId)) {
        console.error('Invalid reservation ID');
        process.exit(1);
      }

      if (!originalDateStr) {
        console.error('Original date is required');
        process.exit(1);
      }

      // 원래 날짜 파싱
      const [year, month, day] = originalDateStr.split('-').map(Number);
      const originalDate = new Date(year, month - 1, day, 0, 0, 0, 0);

      const reservation = await (prisma as any).reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) {
        console.error('Reservation not found');
        process.exit(1);
      }

      console.log(`Current reservation date: ${reservation.reserved_date}`);
      console.log(`Resetting to: ${originalDate.toISOString()}`);

      await (prisma as any).reservation.update({
        where: { id: reservationId },
        data: {
          reserved_date: originalDate,
        },
      });

      console.log('Done!');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


