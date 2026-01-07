import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSmsOptions {
  to: string; // 수신자 전화번호 (하이픈 없이 숫자만)
  message: string; // SMS 메시지 내용
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly senderNumber: string;
  private readonly apiUrl = 'https://apis.aligo.in/send/';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SMS_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('SMS_API_SECRET') || '';
    this.senderNumber = this.configService.get<string>('SMS_SENDER_NUMBER') || '';

    if (!this.apiKey || !this.apiSecret || !this.senderNumber) {
      this.logger.warn('SMS credentials not configured. SMS sending will be disabled.');
    }
  }

  /**
   * SMS 발송
   * 알리고 API를 사용하여 SMS를 발송합니다.
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    if (!this.apiKey || !this.apiSecret || !this.senderNumber) {
      this.logger.error('SMS credentials not configured');
      return {
        success: false,
        error: 'SMS credentials not configured',
      };
    }

    // 전화번호 정리 (하이픈, 공백 제거)
    const cleanPhone = options.to.replace(/[-\s]/g, '');

    // 전화번호 유효성 검사 (한국 휴대폰 번호 형식)
    if (!/^010\d{8}$/.test(cleanPhone)) {
      this.logger.error(`Invalid phone number format: ${options.to}`);
      return {
        success: false,
        error: `Invalid phone number format: ${options.to}`,
      };
    }

    try {
      // 알리고 API 요청 파라미터
      const formData = new URLSearchParams();
      formData.append('key', this.apiKey);
      formData.append('user_id', this.apiKey); // 알리고는 key와 user_id가 동일
      formData.append('sender', this.senderNumber);
      formData.append('receiver', cleanPhone);
      formData.append('msg', options.message);
      formData.append('testmode_yn', 'N'); // 실제 발송 (테스트 모드: 'Y')

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const result = await response.json();

      // 알리고 API 응답 형식: { result_code: '1', message: 'success', ... }
      if (result.result_code === '1') {
        this.logger.log(`SMS sent successfully to ${cleanPhone}`);
        return {
          success: true,
          messageId: result.msg_id || result.message_id,
        };
      } else {
        this.logger.error(`SMS send failed: ${result.message || result.result_code}`);
        return {
          success: false,
          error: result.message || `SMS send failed: ${result.result_code}`,
        };
      }
    } catch (error: any) {
      this.logger.error(`SMS send error: ${error?.message || error}`);
      return {
        success: false,
        error: error?.message || 'Unknown error',
      };
    }
  }

  /**
   * 여러 번호에 동일한 메시지 발송
   */
  async sendBulkSms(recipients: string[], message: string): Promise<SendSmsResult[]> {
    const results: SendSmsResult[] = [];

    for (const recipient of recipients) {
      const result = await this.sendSms({ to: recipient, message });
      results.push(result);
      
      // API 호출 제한을 고려하여 짧은 딜레이 추가 (선택사항)
      if (recipients.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}


