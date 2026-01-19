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
    // Solapi 인증 정보: 환경변수에서만 읽음 (고정값)
    // ⚠️ 중요: memberId는 사용하지 않음!
    // Solapi는 API Key + Secret만으로 Account ID → Member ID를 자동 매핑함
    // memberId를 payload에 포함하면 오히려 에러 발생
    this.apiKey = this.configService.get<string>('SOLAPI_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('SOLAPI_API_SECRET') || '';
    this.senderNumber = this.configService.get<string>('SOLAPI_SENDER_NUMBER') || '';

    // 환경변수 로드 확인
    if (!this.apiKey || !this.apiSecret || !this.senderNumber) {
      this.logger.warn('Solapi credentials not configured. SMS sending will be disabled.');
    } else {
      this.logger.log('SmsService initialized successfully');
    }
  }

  /**
   * Solapi v4 HMAC-SHA256 인증 헤더 생성
   * 형식: HMAC-SHA256 apiKey=<key>, date=<ISO8601>, salt=<random>, signature=<hmac>
   */
  private generateAuthHeader(): string {
    // date: ISO 8601 UTC 형식
    const date = new Date().toISOString();
    
    // salt: 랜덤 문자열 (64자리 hex, 공식 예제와 동일)
    // 공식 예제: crypto.randomBytes(32).toString('hex') = 64자
    const salt = crypto.randomBytes(32).toString('hex');
    
    // signature: HMAC-SHA256(date + salt, apiSecret)
    const data = date + salt;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(data)
      .digest('hex');
    
    // ⚠️ 디버깅: 시그니처 생성 정보 (Fly.io 로그와 비교용)
    this.logger.log(`[Signature 디버깅] date: "${date}" (길이: ${date.length})`);
    this.logger.log(`[Signature 디버깅] salt: "${salt}" (길이: ${salt.length})`);
    this.logger.log(`[Signature 디버깅] signatureString (date+salt): "${data}" (길이: ${data.length})`);
    this.logger.log(`[Signature 디버깅] apiSecret 길이: ${this.apiSecret.length}, 처음4자: "${this.apiSecret.substring(0, 4)}", 마지막4자: "${this.apiSecret.substring(this.apiSecret.length - 4)}"`);
    this.logger.log(`[Signature 디버깅] 계산된 signature: "${signature}" (길이: ${signature.length})`);
    
    // Authorization 헤더 생성
    const authHeader = `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
    this.logger.log(`[Signature 디버깅] Authorization 헤더 전체: ${authHeader}`);
    
    return authHeader;
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
      // Solapi API 요청 파라미터
      // ⚠️ 중요: memberId를 절대 포함하지 않음!
      // Solapi는 API Key + Secret만으로 Account ID → Member ID를 자동 매핑함
      // memberId를 payload에 포함하면 오히려 에러 발생
      // 단일 메시지의 경우 "message" 객체 사용 (복수형 "messages" 배열 사용 불가)
      const requestBody: any = {
        message: {
          to: cleanPhone,
          from: this.senderNumber,
          text: options.message,
        },
      };

      // HMAC-SHA256 인증 헤더 생성
      const authHeader = this.generateAuthHeader();
      const requestBodyString = JSON.stringify(requestBody);

      // ⚠️ 디버깅: 요청 정보 (Fly.io 로그와 비교용)
      this.logger.log(`[Request 디버깅] method: "POST"`);
      this.logger.log(`[Request 디버깅] path: "/messages/v4/send"`);
      this.logger.log(`[Request 디버깅] timestamp: "${Date.now()}"`);
      this.logger.log(`[Request 디버깅] body: ${requestBodyString}`);
      this.logger.log(`[Request 디버깅] headers: ${JSON.stringify({
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      })}`);

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

      // ⚠️ 디버깅: 응답 정보 (Fly.io 로그와 비교용)
      this.logger.log(`[Response 디버깅] status: ${response.status}`);
      this.logger.log(`[Response 디버깅] body: ${responseText}`);

      // 솔라피 API 응답 형식:
      // 1. 단일 메시지: { groupId, messageId, statusCode, statusMessage, to, from, ... }
      // 2. 여러 메시지: { groupId, messageList: [{ messageId, statusCode, ... }] }
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


