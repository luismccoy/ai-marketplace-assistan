/**
 * Notification Service Tests
 * Unit tests for admin notification functionality
 */

import { NotificationService } from '../services/notification-service';
import { TenantConfig } from '../types/tenant';
import { EscalationResult } from '../services/escalation-service';

// Mock AWS SDK
jest.mock('@aws-sdk/client-sns');

const mockSNSSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({
    send: mockSNSSend
  })),
  PublishCommand: jest.fn()
}));

// Mock fetch for WhatsApp API
global.fetch = jest.fn();

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService();
    mockSNSSend.mockClear();
    (global.fetch as jest.Mock).mockClear();
  });

  const mockTenantConfig: TenantConfig = {
    tenantId: 'tenant-123',
    businessName: 'Test Business',
    ownerName: 'Test Owner',
    whatsappNumbers: ['+573001234567'],
    status: 'active',
    plan: 'pro',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    businessConfig: {
      communicationStyle: {
        tone: 'friendly',
        useEmojis: true,
        typicalPhrases: ['¡Perfecto!'],
        greetingStyle: '¡Hola!',
        closingStyle: '¡Saludos!'
      },
      shippingInfo: {
        available: true,
        zones: ['bogotá'],
        costs: { 'bogotá': 15000 },
        estimatedDays: 3
      },
      discountPolicy: {
        allowNegotiation: true,
        maxDiscountPercent: 15,
        bulkDiscounts: true
      },
      appointmentConfig: { enabled: true, businessHours: "9-5" },
      paymentConfig: { methods: ["Cash"], instructions: "" }
    },
    aiConfig: {
      model: 'claude-3-haiku',
      maxTokens: 1000,
      temperature: 0.7,
      enableRAG: true
    },
    limits: {
      maxConversationsPerMonth: 1000,
      maxMessagesPerDay: 500,
      maxProductsCount: 100,
      maxStorageGB: 5
    },
    contactInfo: {
      email: 'test@example.com'
    },
    integrations: {
      notifications: {
        escalationEmail: 'escalation@example.com',
        escalationWhatsApp: '+573009876543',
        enableSMSNotifications: true
      }
    }
  };

  const mockEscalationResult: EscalationResult = {
    shouldEscalate: true,
    triggers: [
      {
        type: 'manual_request',
        confidence: 0.9,
        reason: 'Cliente solicita hablar con una persona',
        metadata: { keyword: 'persona' }
      }
    ],
    escalationReason: 'Cliente solicita hablar con una persona',
    priority: 'high',
    suggestedAgent: 'general_agent',
    estimatedResolutionTime: 15
  };

  describe('sendEscalationNotification', () => {
    beforeEach(() => {
      // Set environment variables for testing
      process.env.ESCALATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:escalations';
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.ESCALATION_TOPIC_ARN;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    });

    it('should send SNS notification successfully', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'sns-message-123' });

      const result = await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        mockEscalationResult,
        mockTenantConfig,
        'Test conversation summary'
      );

      expect(result.success).toBe(true);
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.sns?.messageId).toBe('sns-message-123');
      expect(result.totalAttempts).toBe(2); // SNS + WhatsApp
      expect(mockSNSSend).toHaveBeenCalledTimes(1);
    });

    it('should send WhatsApp notification successfully', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'sns-message-123' });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          messages: [{ id: 'whatsapp-message-123' }]
        })
      });

      const result = await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        mockEscalationResult,
        mockTenantConfig
      );

      expect(result.success).toBe(true);
      expect(result.channels.whatsapp?.success).toBe(true);
      expect(result.channels.whatsapp?.messageId).toBe('whatsapp-message-123');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle SNS notification failure gracefully', async () => {
      mockSNSSend.mockRejectedValueOnce(new Error('SNS error'));
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          messages: [{ id: 'whatsapp-message-123' }]
        })
      });

      const result = await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        mockEscalationResult,
        mockTenantConfig
      );

      expect(result.success).toBe(true); // WhatsApp succeeded
      expect(result.channels.sns?.success).toBe(false);
      expect(result.channels.sns?.error).toBe('SNS error');
      expect(result.channels.whatsapp?.success).toBe(true);
    });

    it('should handle WhatsApp API failure gracefully', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'sns-message-123' });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('WhatsApp API error')
      });

      const result = await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        mockEscalationResult,
        mockTenantConfig
      );

      expect(result.success).toBe(true); // SNS succeeded
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.whatsapp?.success).toBe(false);
      expect(result.channels.whatsapp?.error).toContain('WhatsApp API error');
    });

    it('should skip WhatsApp when credentials not configured', async () => {
      delete process.env.WHATSAPP_ACCESS_TOKEN;

      mockSNSSend.mockResolvedValueOnce({ MessageId: 'sns-message-123' });

      const result = await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        mockEscalationResult,
        mockTenantConfig
      );

      expect(result.success).toBe(true);
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.whatsapp?.success).toBe(false);
      expect(result.channels.whatsapp?.error).toContain('credentials');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('sendUrgentAlert', () => {
    beforeEach(() => {
      process.env.ESCALATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:escalations';
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
    });

    afterEach(() => {
      delete process.env.ESCALATION_TOPIC_ARN;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    });

    it('should send urgent alert through all channels', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'urgent-sns-123' });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          messages: [{ id: 'urgent-whatsapp-123' }]
        })
      });

      const result = await notificationService.sendUrgentAlert(
        'tenant-123',
        'conv-123',
        'Sistema caído - requiere atención inmediata',
        mockTenantConfig
      );

      expect(result.success).toBe(true);
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.whatsapp?.success).toBe(true);
      expect(mockSNSSend).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendResolutionNotification', () => {
    beforeEach(() => {
      process.env.ESCALATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:escalations';
    });

    afterEach(() => {
      delete process.env.ESCALATION_TOPIC_ARN;
    });

    it('should send resolution notification', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'resolution-123' });

      const result = await notificationService.sendResolutionNotification(
        'tenant-123',
        'conv-123',
        'admin-456',
        15, // 15 minutes resolution time
        mockTenantConfig
      );

      expect(result.success).toBe(true);
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.sns?.messageId).toBe('resolution-123');
      expect(mockSNSSend).toHaveBeenCalledTimes(1);
    });

    it('should handle resolution notification failure', async () => {
      mockSNSSend.mockRejectedValueOnce(new Error('SNS resolution error'));

      const result = await notificationService.sendResolutionNotification(
        'tenant-123',
        'conv-123',
        'admin-456',
        15,
        mockTenantConfig
      );

      expect(result.success).toBe(false);
      expect(result.channels.sns?.success).toBe(false);
      expect(result.channels.sns?.error).toBe('SNS resolution error');
    });
  });

  describe('sendDailySummary', () => {
    beforeEach(() => {
      process.env.ESCALATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:escalations';
    });

    afterEach(() => {
      delete process.env.ESCALATION_TOPIC_ARN;
    });

    it('should send daily summary notification', async () => {
      mockSNSSend.mockResolvedValueOnce({ MessageId: 'summary-123' });

      const summary = {
        totalEscalations: 5,
        byPriority: { high: 2, medium: 2, low: 1 },
        avgResolutionTime: 25,
        unresolved: 1
      };

      const result = await notificationService.sendDailySummary(
        'tenant-123',
        summary,
        mockTenantConfig
      );

      expect(result.success).toBe(true);
      expect(result.channels.sns?.success).toBe(true);
      expect(result.channels.sns?.messageId).toBe('summary-123');
      expect(mockSNSSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('notification message generation', () => {
    it('should generate appropriate priority emojis', async () => {
      const urgentEscalation: EscalationResult = {
        ...mockEscalationResult,
        priority: 'urgent'
      };

      mockSNSSend.mockResolvedValueOnce({ MessageId: 'test-123' });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'test-123' }] })
      });

      process.env.ESCALATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:escalations';
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';

      await notificationService.sendEscalationNotification(
        'tenant-123',
        'conv-123',
        '+573001234567',
        urgentEscalation,
        mockTenantConfig
      );

      // Check that SNS was called with urgent priority
      expect(mockSNSSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Subject: expect.stringContaining('🔴')
        })
      );

      // Check that WhatsApp was called with urgent emoji
      const whatsappCall = (global.fetch as jest.Mock).mock.calls[0];
      const whatsappBody = JSON.parse(whatsappCall[1].body);
      expect(whatsappBody.text.body).toContain('🚨');
    });
  });
});