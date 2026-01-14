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
  private readonly memberId: string;
  private readonly apiUrl = 'https://api.solapi.com/messages/v4/send';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SOLAPI_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('SOLAPI_API_SECRET') || '';
    this.senderNumber = this.configService.get<string>('SOLAPI_SENDER_NUMBER') || '';
    this.memberId = (this.configService.get<string>('SOLAPI_MEMBER_ID') || '').trim();

    // 환경변수 로드 확인 로그
    this.logger.log(`[SmsService] Initialized - memberId length: ${this.memberId.length}, value: "${this.memberId}"`);

    if (!this.apiKey || !this.apiSecret || !this.senderNumber || !this.memberId) {
      this.logger.warn('Solapi credentials not configured. SMS sending will be disabled.');
    }
    
    if (this.memberId && this.memberId.length !== 14) {
      this.logger.error(`Solapi memberId length is ${this.memberId.length}, expected 14. Current value: "${this.memberId}"`);
    }
  }

  /**
   * SMS 발송
   * 솔라피 API를 사용하여 SMS를 발송합니다.
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    if (!this.apiKey || !this.apiSecret || !this.senderNumber) {
      this.logger.error('Solapi credentials not configured');
      return {
        success: false,
        error: 'Solapi credentials not configured',
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
      // 솔라피 API 요청 파라미터
      const requestBody: any = {
        message: {
          to: cleanPhone,
          from: this.senderNumber,
          text: options.message,
        },
      };

      // memberId 필수 (14자리)
      if (!this.memberId || this.memberId.length !== 14) {
        this.logger.error(`Invalid memberId: ${this.memberId} (must be 14 digits)`);
        return {
          success: false,
          error: 'Solapi memberId not configured or invalid',
        };
      }
      requestBody.memberId = this.memberId;

      // Solapi user 인증 방식: user apiKey:apiSecret
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user ${this.apiKey}:${this.apiSecret}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      // 솔라피 API 응답 형식: { groupId: 'xxx', messageList: [{ messageId: 'xxx', statusCode: '2000', ... }] }
      if (response.ok && result.messageList && result.messageList.length > 0) {
        const messageResult = result.messageList[0];
        if (messageResult.statusCode === '2000') {
          this.logger.log(`SMS sent successfully to ${cleanPhone}`);
          return {
            success: true,
            messageId: messageResult.messageId || result.groupId,
          };
        } else {
          this.logger.error(`SMS send failed: ${messageResult.statusMessage || messageResult.statusCode}`);
          return {
            success: false,
            error: messageResult.statusMessage || `SMS send failed: ${messageResult.statusCode}`,
          };
        }
      } else {
        // API 에러 응답
        const errorMessage = result.errorMessage || result.message || 'Unknown error';
        this.logger.error(`SMS send failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
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


