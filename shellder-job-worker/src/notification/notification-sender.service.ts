import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildAuthHeaders, decryptSecret } from '../connector/connector-secret.util';
import { renderTemplate } from './template.util';
import {
  NOTIFICATION_TYPE_TO_TEMPLATE,
  NotificationJobPayload,
} from '../queue/queue.constants';

const CONFIG_NOTIFICATION_CONNECTOR = 'notification.connectorId';

export interface NotificationSendResult {
  status: 'sent' | 'mock' | 'failed' | 'skipped';
  channel: 'mock' | 'http';
  subject?: string;
  body?: string;
  error?: string;
  httpStatus?: number;
}

@Injectable()
export class NotificationSenderService {
  private readonly logger = new Logger(NotificationSenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: NotificationJobPayload): Promise<NotificationSendResult> {
    const templateType = NOTIFICATION_TYPE_TO_TEMPLATE[payload.type];
    const tpl = await this.prisma.notificationTemplate.findFirst({
      where: {
        type: templateType,
        name: payload.templateKey,
        enabled: true,
      },
    });

    if (!tpl) {
      return {
        status: 'failed',
        channel: 'mock',
        error: `通知模板不存在或未启用：${templateType}/${payload.templateKey}`,
      };
    }

    const subject = tpl.subject
      ? renderTemplate(tpl.subject, payload.variables)
      : undefined;
    const body = renderTemplate(tpl.body, payload.variables);

    const connectorId =
      tpl.connectorId ||
      (await this.getSystemConnectorId());

    const useMock =
      process.env.NOTIFICATION_SEND_MOCK !== 'false' &&
      process.env.NOTIFICATION_SEND_MOCK !== '0';

    if (useMock || !connectorId) {
      this.logger.log(
        `[Mock通知] tenant=${payload.tenantId} type=${payload.type} subject=${subject ?? '(无)'}\n${body}`,
      );
      return { status: 'mock', channel: 'mock', subject, body };
    }

    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
    });
    if (!connector || connector.type !== 'notification') {
      return {
        status: 'failed',
        channel: 'mock',
        subject,
        body,
        error: `通知连接器无效：${connectorId}`,
      };
    }

    const secret = decryptSecret(
      (connector.config as { secretCipher?: string })?.secretCipher,
    );
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(connector.authType, secret),
    };
    const requestBody = {
      type: payload.type,
      tenantId: payload.tenantId,
      subject,
      body,
      variables: payload.variables,
      taskId: payload.taskId,
      approvalId: payload.approvalId,
    };

    try {
      const res = await fetch(connector.target, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(connector.timeoutMs ?? 10_000),
      });
      const text = await res.text();
      if (res.status >= 400) {
        return {
          status: 'failed',
          channel: 'http',
          subject,
          body,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          httpStatus: res.status,
        };
      }
      this.logger.log(
        `通知已发送 tenant=${payload.tenantId} connector=${connector.id} HTTP ${res.status}`,
      );
      return {
        status: 'sent',
        channel: 'http',
        subject,
        body,
        httpStatus: res.status,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        channel: 'http',
        subject,
        body,
        error: msg,
      };
    }
  }

  private async getSystemConnectorId(): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { configKey: CONFIG_NOTIFICATION_CONNECTOR },
    });
    const val = row?.configValue?.trim();
    return val || null;
  }
}
