/**
 * Escalation Service Tests
 * Unit tests for human handoff escalation logic
 */

import { EscalationService } from '../services/escalation-service';
import { TenantConversationContext, TenantCustomerProfile, TenantConfig } from '../types/tenant';
import { IntentClassification } from '../types/conversation';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-sns');

const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  UpdateCommand: jest.fn(),
  GetCommand: jest.fn()
}));

const mockSNSSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({
    send: mockSNSSend
  })),
  PublishCommand: jest.fn()
}));

describe('EscalationService', () => {
  let escalationService: EscalationService;

  beforeEach(() => {
    escalationService = new EscalationService();
    mockSend.mockClear();
    mockSNSSend.mockClear();
  });

  const mockConversationContext: TenantConversationContext = {
    tenantId: 'tenant-123',
    conversationId: 'conv-123',
    customerId: 'customer-123',
    status: 'active',
    lastIntent: 'general',
    productInquiries: [],
    messages: [
      {
        tenantId: 'tenant-123',
        id: 'msg-1',
        conversationId: 'conv-123',
        from: 'customer',
        content: 'Hola, ¿tienen iPhone disponible?',
        timestamp: '2024-01-01T10:00:00Z',
        type: 'text'
      },
      {
        tenantId: 'tenant-123',
        id: 'msg-2',
        conversationId: 'conv-123',
        from: 'bot',
        content: 'Sí, tenemos iPhone disponible.',
        timestamp: '2024-01-01T10:01:00Z',
        type: 'text',
        metadata: { confidence: 0.8 }
      }
    ],
    createdAt: '2024-01-01T10:00:00Z',
    lastUpdate: '2024-01-01T10:01:00Z'
  };

  const mockCustomerProfile: TenantCustomerProfile = {
    tenantId: 'tenant-123',
    phoneNumber: '+573001234567',
    preferredLanguage: 'es',
    inquiryHistory: ['general', 'precio'],
    leadScore: 5,
    totalConversations: 2,
    lastInteraction: '2024-01-01T10:00:00Z',
    createdAt: '2024-01-01T09:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z'
  };

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

  describe('analyzeEscalationTriggers', () => {
    it('should detect low confidence trigger', async () => {
      const lowConfidenceIntent: IntentClassification = {
        intent: 'general',
        confidence: 0.2, // Below threshold
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'No entiendo qué me dices',
        lowConfidenceIntent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0].type).toBe('low_confidence');
      expect(result.triggers[0].reason).toContain('Baja confianza');
      expect(result.priority).toBe('medium');
    });

    it('should detect human request keywords', async () => {
      const intent: IntentClassification = {
        intent: 'general',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Quiero hablar con una persona real',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0].type).toBe('manual_request');
      expect(result.triggers[0].reason).toContain('solicita hablar con una persona');
      expect(result.priority).toBe('high');
    });

    it('should detect complaint keywords', async () => {
      const intent: IntentClassification = {
        intent: 'general',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Este servicio es terrible, estoy muy molesto',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers.length).toBeGreaterThan(0);
      expect(result.triggers.some(t => t.type === 'complaint')).toBe(true);
      expect(result.priority).toBe('high');
    });

    it('should detect manager request with urgent priority', async () => {
      const intent: IntentClassification = {
        intent: 'general',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Necesito hablar con el gerente inmediatamente',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers.length).toBeGreaterThan(0);
      expect(result.triggers.some(t => t.metadata?.category === 'manager_request')).toBe(true);
      expect(result.priority).toBe('urgent');
    });

    it('should detect price negotiation', async () => {
      const intent: IntentClassification = {
        intent: 'precio',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        '¿Puedes rebajar el precio? Necesito un mejor descuento',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers.some(t => t.type === 'price_negotiation')).toBe(true);
      expect(result.suggestedAgent).toBe('sales_agent');
    });

    it('should detect fake/bot accusations', async () => {
      const intent: IntentClassification = {
        intent: 'general',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Esto es falso, eres un bot mentiroso',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers.some(t => t.metadata?.category === 'fake_accusation')).toBe(true);
      expect(result.priority).toBe('high');
    });

    it('should detect technical complexity', async () => {
      const intent: IntentClassification = {
        intent: 'informacion',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Necesito ayuda con la garantía y la instalación técnica',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.triggers.some(t => t.type === 'complex_query')).toBe(true);
      expect(result.suggestedAgent).toBe('technical_support');
    });

    it('should not escalate for normal conversation', async () => {
      const intent: IntentClassification = {
        intent: 'disponibilidad',
        confidence: 0.9,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        '¿Tienes iPhone 14 disponible?',
        intent,
        mockConversationContext,
        mockCustomerProfile
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.triggers).toHaveLength(0);
      expect(result.priority).toBe('low');
    });
  });

  describe('escalateConversation', () => {
    it('should update conversation status and send notification', async () => {
      const escalationResult = {
        shouldEscalate: true,
        triggers: [{
          type: 'manual_request' as const,
          confidence: 0.9,
          reason: 'Cliente solicita hablar con una persona',
          metadata: { keyword: 'persona' }
        }],
        escalationReason: 'Cliente solicita hablar con una persona',
        priority: 'high' as const,
        suggestedAgent: 'general_agent',
        estimatedResolutionTime: 15
      };

      mockSend.mockResolvedValueOnce({}); // UpdateCommand
      mockSNSSend.mockResolvedValueOnce({}); // PublishCommand

      await escalationService.escalateConversation(
        'tenant-123',
        'conv-123',
        escalationResult,
        mockTenantConfig
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSNSSend).toHaveBeenCalledTimes(1);
    });

    it('should handle escalation errors gracefully', async () => {
      const escalationResult = {
        shouldEscalate: true,
        triggers: [],
        escalationReason: 'Test escalation',
        priority: 'medium' as const
      };

      mockSend.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        escalationService.escalateConversation(
          'tenant-123',
          'conv-123',
          escalationResult,
          mockTenantConfig
        )
      ).rejects.toThrow('Failed to escalate conversation');
    });
  });

  describe('isConversationEscalated', () => {
    it('should return true for escalated conversation', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          tenantId: 'tenant-123',
          conversationId: 'conv-123',
          status: 'PASSED_TO_HUMAN'
        }
      });

      const result = await escalationService.isConversationEscalated('tenant-123', 'conv-123');

      expect(result).toBe(true);
    });

    it('should return false for active conversation', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          tenantId: 'tenant-123',
          conversationId: 'conv-123',
          status: 'ACTIVE'
        }
      });

      const result = await escalationService.isConversationEscalated('tenant-123', 'conv-123');

      expect(result).toBe(false);
    });

    it('should return false for non-existent conversation', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await escalationService.isConversationEscalated('tenant-123', 'conv-123');

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Database error'));

      const result = await escalationService.isConversationEscalated('tenant-123', 'conv-123');

      expect(result).toBe(false);
    });
  });

  describe('resetConversationToActive', () => {
    it('should reset conversation status to active', async () => {
      mockSend.mockResolvedValueOnce({});

      await escalationService.resetConversationToActive(
        'tenant-123',
        'conv-123',
        'admin-123'
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle reset errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        escalationService.resetConversationToActive('tenant-123', 'conv-123', 'admin-123')
      ).rejects.toThrow('Failed to reset conversation');
    });
  });

  describe('getConversationStatus', () => {
    it('should return conversation status', async () => {
      const mockConversation = {
        tenantId: 'tenant-123',
        conversationId: 'conv-123',
        status: 'PASSED_TO_HUMAN',
        escalationTime: '2024-01-01T10:00:00Z',
        escalationReason: 'Cliente solicita hablar con una persona',
        priority: 'high',
        botAttempts: 2
      };

      mockSend.mockResolvedValueOnce({ Item: mockConversation });

      const result = await escalationService.getConversationStatus('tenant-123', 'conv-123');

      expect(result).toEqual({
        status: 'PASSED_TO_HUMAN',
        assignedAgent: undefined,
        escalationTime: '2024-01-01T10:00:00Z',
        escalationReason: 'Cliente solicita hablar con una persona',
        priority: 'high',
        botAttempts: 2,
        lastBotResponse: undefined,
        humanTakeoverTime: undefined,
        resolutionTime: undefined
      });
    });

    it('should return null for non-existent conversation', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await escalationService.getConversationStatus('tenant-123', 'conv-123');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Database error'));

      const result = await escalationService.getConversationStatus('tenant-123', 'conv-123');

      expect(result).toBeNull();
    });
  });

  describe('conversation history analysis', () => {
    it('should detect repeated bot failures', async () => {
      const contextWithFailures: TenantConversationContext = {
        ...mockConversationContext,
        messages: [
          ...mockConversationContext.messages,
          {
            tenantId: 'tenant-123',
            id: 'msg-3',
            conversationId: 'conv-123',
            from: 'bot',
            content: 'No estoy seguro de entender',
            timestamp: '2024-01-01T10:02:00Z',
            type: 'text',
            metadata: { confidence: 0.3 }
          },
          {
            tenantId: 'tenant-123',
            id: 'msg-4',
            conversationId: 'conv-123',
            from: 'bot',
            content: 'Disculpa, no pude procesar eso',
            timestamp: '2024-01-01T10:03:00Z',
            type: 'text',
            metadata: { confidence: 0.4 }
          },
          {
            tenantId: 'tenant-123',
            id: 'msg-5',
            conversationId: 'conv-123',
            from: 'bot',
            content: 'No estoy seguro',
            timestamp: '2024-01-01T10:04:00Z',
            type: 'text',
            metadata: { confidence: 0.2 }
          }
        ]
      };

      const intent: IntentClassification = {
        intent: 'general',
        confidence: 0.8,
        entities: {}
      };

      const result = await escalationService.analyzeEscalationTriggers(
        'Ayuda por favor',
        intent,
        contextWithFailures,
        mockCustomerProfile
      );

      expect(result.triggers.some(t => t.metadata?.category === 'repeated_failures')).toBe(true);
    });
  });
});