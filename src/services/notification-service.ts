/**
 * Notification Service for Admin Alerts
 * Handles SNS notifications, WhatsApp alerts, and email notifications for escalations
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { TenantConfig } from '../types/tenant';
import { EscalationResult } from './escalation-service';

// Initialize AWS clients
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const ESCALATION_TOPIC_ARN = process.env.ESCALATION_TOPIC_ARN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export interface NotificationConfig {
  enableSNS: boolean;
  enableWhatsApp: boolean;
  enableEmail: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export interface EscalationNotification {
  tenantId: string;
  businessName: string;
  conversationId: string;
  customerPhone: string;
  escalationReason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  suggestedAgent?: string;
  estimatedResolutionTime?: number;
  triggers: Array<{
    type: string;
    reason: string;
    confidence: number;
  }>;
  timestamp: string;
  escalationContacts: {
    email?: string;
    whatsapp?: string;
  };
  conversationSummary?: string;
}

export interface NotificationResult {
  success: boolean;
  channels: {
    sns?: { success: boolean; messageId?: string; error?: string };
    whatsapp?: { success: boolean; messageId?: string; error?: string };
    email?: { success: boolean; messageId?: string; error?: string };
  };
  totalAttempts: number;
}

/**
 * Notification Service - handles multi-channel admin notifications
 */
export class NotificationService {
  private config: NotificationConfig;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = {
      enableSNS: config?.enableSNS ?? true,
      enableWhatsApp: config?.enableWhatsApp ?? true,
      enableEmail: config?.enableEmail ?? true,
      retryAttempts: config?.retryAttempts || 3,
      retryDelay: config?.retryDelay || 1000
    };
  }

  /**
   * Send escalation notification through all configured channels
   */
  async sendEscalationNotification(
    tenantId: string,
    conversationId: string,
    customerPhone: string,
    escalationResult: EscalationResult,
    tenantConfig: TenantConfig,
    conversationSummary?: string
  ): Promise<NotificationResult> {
    const notification: EscalationNotification = {
      tenantId,
      businessName: tenantConfig.businessName,
      conversationId,
      customerPhone,
      escalationReason: escalationResult.escalationReason,
      priority: escalationResult.priority,
      suggestedAgent: escalationResult.suggestedAgent,
      estimatedResolutionTime: escalationResult.estimatedResolutionTime,
      triggers: escalationResult.triggers.map(t => ({
        type: t.type,
        reason: t.reason,
        confidence: t.confidence
      })),
      timestamp: new Date().toISOString(),
      escalationContacts: {
        email: tenantConfig.integrations?.notifications?.escalationEmail,
        whatsapp: tenantConfig.integrations?.notifications?.escalationWhatsApp
      },
      conversationSummary
    };

    const result: NotificationResult = {
      success: false,
      channels: {},
      totalAttempts: 0
    };

    // Send SNS notification
    if (this.config.enableSNS && ESCALATION_TOPIC_ARN) {
      result.channels.sns = await this.sendSNSNotification(notification);
      result.totalAttempts++;
    }

    // Send WhatsApp notification to admin
    if (this.config.enableWhatsApp && notification.escalationContacts.whatsapp) {
      result.channels.whatsapp = await this.sendWhatsAppNotification(notification);
      result.totalAttempts++;
    }

    // Determine overall success
    result.success = Object.values(result.channels).some(channel => channel.success);

    return result;
  }

  /**
   * Send urgent escalation alert (for high/urgent priority)
   */
  async sendUrgentAlert(
    tenantId: string,
    conversationId: string,
    escalationReason: string,
    tenantConfig: TenantConfig
  ): Promise<NotificationResult> {
    const urgentNotification: EscalationNotification = {
      tenantId,
      businessName: tenantConfig.businessName,
      conversationId,
      customerPhone: 'unknown',
      escalationReason,
      priority: 'urgent',
      triggers: [],
      timestamp: new Date().toISOString(),
      escalationContacts: {
        email: tenantConfig.integrations?.notifications?.escalationEmail,
        whatsapp: tenantConfig.integrations?.notifications?.escalationWhatsApp
      }
    };

    const result: NotificationResult = {
      success: false,
      channels: {},
      totalAttempts: 0
    };

    // Send immediate notifications for urgent cases
    if (ESCALATION_TOPIC_ARN) {
      result.channels.sns = await this.sendSNSNotification(urgentNotification);
      result.totalAttempts++;
    }

    if (urgentNotification.escalationContacts.whatsapp) {
      result.channels.whatsapp = await this.sendUrgentWhatsAppAlert(urgentNotification);
      result.totalAttempts++;
    }

    result.success = Object.values(result.channels).some(channel => channel.success);

    return result;
  }

  /**
   * Send resolution notification when escalation is resolved
   */
  async sendResolutionNotification(
    tenantId: string,
    conversationId: string,
    resolvedBy: string,
    resolutionTime: number,
    tenantConfig: TenantConfig
  ): Promise<NotificationResult> {
    const resolutionNotification = {
      tenantId,
      businessName: tenantConfig.businessName,
      conversationId,
      resolvedBy,
      resolutionTime,
      timestamp: new Date().toISOString()
    };

    const result: NotificationResult = {
      success: false,
      channels: {},
      totalAttempts: 0
    };

    // Send resolution notification via SNS
    if (ESCALATION_TOPIC_ARN) {
      try {
        const publishCommand = new PublishCommand({
          TopicArn: ESCALATION_TOPIC_ARN,
          Subject: `✅ Escalación Resuelta - ${tenantConfig.businessName}`,
          Message: JSON.stringify({
            type: 'escalation_resolved',
            ...resolutionNotification
          }, null, 2)
        });

        const snsResult = await snsClient.send(publishCommand);
        result.channels.sns = {
          success: true,
          messageId: snsResult.MessageId
        };
        result.totalAttempts++;
      } catch (error) {
        result.channels.sns = {
          success: false,
          error: (error as Error).message
        };
        result.totalAttempts++;
      }
    }

    result.success = Object.values(result.channels).some(channel => channel.success);

    return result;
  }

  /**
   * Send daily escalation summary
   */
  async sendDailySummary(
    tenantId: string,
    summary: {
      totalEscalations: number;
      byPriority: Record<string, number>;
      avgResolutionTime: number;
      unresolved: number;
    },
    tenantConfig: TenantConfig
  ): Promise<NotificationResult> {
    const summaryNotification = {
      tenantId,
      businessName: tenantConfig.businessName,
      type: 'daily_summary',
      date: new Date().toISOString().split('T')[0],
      summary,
      timestamp: new Date().toISOString()
    };

    const result: NotificationResult = {
      success: false,
      channels: {},
      totalAttempts: 0
    };

    // Send summary via SNS
    if (ESCALATION_TOPIC_ARN) {
      try {
        const publishCommand = new PublishCommand({
          TopicArn: ESCALATION_TOPIC_ARN,
          Subject: `📊 Resumen Diario de Escalaciones - ${tenantConfig.businessName}`,
          Message: JSON.stringify(summaryNotification, null, 2)
        });

        const snsResult = await snsClient.send(publishCommand);
        result.channels.sns = {
          success: true,
          messageId: snsResult.MessageId
        };
        result.totalAttempts++;
      } catch (error) {
        result.channels.sns = {
          success: false,
          error: (error as Error).message
        };
        result.totalAttempts++;
      }
    }

    result.success = Object.values(result.channels).some(channel => channel.success);

    return result;
  }

  /**
   * Private helper methods
   */
  private async sendSNSNotification(notification: EscalationNotification): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const subject = this.generateSNSSubject(notification);
      const message = this.generateSNSMessage(notification);

      const publishCommand = new PublishCommand({
        TopicArn: ESCALATION_TOPIC_ARN,
        Subject: subject,
        Message: message
      });

      const result = await snsClient.send(publishCommand);
      
      console.log('SNS notification sent successfully', {
        tenantId: notification.tenantId,
        conversationId: notification.conversationId,
        messageId: result.MessageId
      });

      return {
        success: true,
        messageId: result.MessageId
      };
    } catch (error) {
      console.error('Error sending SNS notification:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async sendWhatsAppNotification(notification: EscalationNotification): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !notification.escalationContacts.whatsapp) {
      return {
        success: false,
        error: 'WhatsApp credentials or contact not configured'
      };
    }

    try {
      const message = this.generateWhatsAppMessage(notification);

      const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: notification.escalationContacts.whatsapp,
          type: 'text',
          text: {
            body: message
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WhatsApp API error: ${errorText}`);
      }

      const result: any = await response.json();
      
      console.log('WhatsApp notification sent successfully', {
        tenantId: notification.tenantId,
        conversationId: notification.conversationId,
        messageId: result?.messages?.[0]?.id
      });

      return {
        success: true,
        messageId: result?.messages?.[0]?.id
      };
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async sendUrgentWhatsAppAlert(notification: EscalationNotification): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !notification.escalationContacts.whatsapp) {
      return {
        success: false,
        error: 'WhatsApp credentials or contact not configured'
      };
    }

    try {
      const urgentMessage = `🚨 ESCALACIÓN URGENTE 🚨\n\n` +
        `Negocio: ${notification.businessName}\n` +
        `Razón: ${notification.escalationReason}\n` +
        `Conversación: ${notification.conversationId}\n` +
        `Hora: ${new Date(notification.timestamp).toLocaleString('es-CO')}\n\n` +
        `⚡ REQUIERE ATENCIÓN INMEDIATA`;

      const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: notification.escalationContacts.whatsapp,
          type: 'text',
          text: {
            body: urgentMessage
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WhatsApp API error: ${errorText}`);
      }

      const result: any = await response.json();
      
      return {
        success: true,
        messageId: result?.messages?.[0]?.id
      };
    } catch (error) {
      console.error('Error sending urgent WhatsApp alert:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private generateSNSSubject(notification: EscalationNotification): string {
    const priorityEmoji = {
      low: '🔵',
      medium: '🟡',
      high: '🟠',
      urgent: '🔴'
    };

    return `${priorityEmoji[notification.priority]} Escalación ${notification.priority.toUpperCase()} - ${notification.businessName}`;
  }

  private generateSNSMessage(notification: EscalationNotification): string {
    return JSON.stringify({
      type: 'escalation_notification',
      ...notification,
      formattedMessage: this.generateFormattedMessage(notification)
    }, null, 2);
  }

  private generateWhatsAppMessage(notification: EscalationNotification): string {
    const priorityEmoji = {
      low: '🔵',
      medium: '🟡',
      high: '🟠',
      urgent: '🚨'
    };

    let message = `${priorityEmoji[notification.priority]} *Escalación ${notification.priority.toUpperCase()}*\n\n`;
    message += `*Negocio:* ${notification.businessName}\n`;
    message += `*Cliente:* ${notification.customerPhone}\n`;
    message += `*Razón:* ${notification.escalationReason}\n`;
    message += `*Conversación:* ${notification.conversationId}\n`;
    
    if (notification.suggestedAgent) {
      message += `*Agente sugerido:* ${notification.suggestedAgent}\n`;
    }
    
    if (notification.estimatedResolutionTime) {
      message += `*Tiempo estimado:* ${notification.estimatedResolutionTime} min\n`;
    }
    
    message += `*Hora:* ${new Date(notification.timestamp).toLocaleString('es-CO')}\n\n`;
    
    if (notification.conversationSummary) {
      message += `*Resumen:*\n${notification.conversationSummary}\n\n`;
    }
    
    message += `Responde "TOMAR" para asumir esta conversación.`;

    return message;
  }

  private generateFormattedMessage(notification: EscalationNotification): string {
    let message = `Escalación detectada para ${notification.businessName}\n\n`;
    message += `Cliente: ${notification.customerPhone}\n`;
    message += `Conversación: ${notification.conversationId}\n`;
    message += `Prioridad: ${notification.priority.toUpperCase()}\n`;
    message += `Razón: ${notification.escalationReason}\n\n`;
    
    if (notification.triggers.length > 0) {
      message += `Triggers detectados:\n`;
      notification.triggers.forEach((trigger, index) => {
        message += `${index + 1}. ${trigger.type}: ${trigger.reason} (${(trigger.confidence * 100).toFixed(1)}%)\n`;
      });
      message += '\n';
    }
    
    if (notification.conversationSummary) {
      message += `Resumen de conversación:\n${notification.conversationSummary}\n\n`;
    }
    
    message += `Timestamp: ${notification.timestamp}`;
    
    return message;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();