import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
  private readonly apiUrl = 'https://api.solapi.com/messages/v4/send';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SOLAPI_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('SOLAPI_API_SECRET') || '';
    this.senderNumber = this.configService.get<string>('SOLAPI_SENDER_NUMBER') || '';

    if (!this.apiKey || !this.apiSecret || !this.senderNumber) {
      this.logger.warn('Solapi credentials not configured. SMS sending will be disabled.');
    } else {
      this.logger.log('SmsService initialized successfully');
    }
  }

  /**
   * Solapi v4 HMAC-SHA256 인증 헤더 생성
   */
  private generateAuthHeader(): string {
    const rawDate = new Date().toISOString();
    const date = rawDate.replace(/\.\d{3}Z$/, 'Z'); // 밀리초 제거
    const salt = crypto.randomBytes(32).toString('hex');
    const data = date + salt;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(data)
      .digest('hex');
    
    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
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
      const requestBody = {
        message: {
          to: cleanPhone,
          from: this.senderNumber,
          text: options.message,
        },
      };

      // HMAC-SHA256 인증 헤더 생성
      const authHeader = this.generateAuthHeader();
      const requestBodyString = JSON.stringify(requestBody);

      // Solapi v4 HMAC-SHA256 인증 방식
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: requestBodyString,
      });

      // 응답 본문 파싱
      const responseText = await response.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        this.logger.error(`Failed to parse SMS response as JSON: ${e}`);
        result = { error: 'Invalid JSON response', raw: responseText };
      }

      if (response.ok) {
        // 단일 메시지 응답 처리 (messageList 없이 직접 응답 객체에 정보가 있는 경우)
        if (result.statusCode === '2000') {
          this.logger.log(`SMS sent successfully to ${cleanPhone}`);
          return {
            success: true,
            messageId: result.messageId || result.groupId,
          };
        }
        
        // 여러 메시지 응답 처리 (messageList가 있는 경우)
        if (result.messageList && result.messageList.length > 0) {
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
        }
        
        // statusCode가 있지만 2000이 아닌 경우
        if (result.statusCode) {
          this.logger.error(`SMS send failed: ${result.statusMessage || result.statusCode}`);
          return {
            success: false,
            error: result.statusMessage || `SMS send failed: ${result.statusCode}`,
          };
        }
      }
      
      // API 에러 응답
      const errorMessage = result.errorMessage || result.message || 'Unknown error';
      this.logger.error(`SMS send failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
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


