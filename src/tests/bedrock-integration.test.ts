/**
 * Test suite for AWS Bedrock AI integration
 */

import { BedrockClientService } from '../services/bedrock-client';
import { IntentDetectionService } from '../services/intent-detection';
import { ResponseGenerationService } from '../services/response-generation';
import { AIOrchestrator } from '../services/ai-orchestrator';

// Mock AWS SDK for testing
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{
          text: JSON.stringify({
            message: 'Hola! ¿En qué te puedo ayudar?',
            intent: 'saludo',
            confidence: 0.9,
            shouldEscalate: false,
            suggestedActions: ['show_product_categories']
          })
        }]
      }))
    })
  })),
  InvokeModelCommand: jest.fn()
}));

describe('Bedrock AI Integration', () => {
  let bedrockClient: BedrockClientService;
  let intentService: IntentDetectionService;
  let responseService: ResponseGenerationService;
  let aiOrchestrator: AIOrchestrator;

  beforeEach(() => {
    bedrockClient = new BedrockClientService();
    intentService = new IntentDetectionService(bedrockClient);
    responseService = new ResponseGenerationService(bedrockClient, intentService);
    aiOrchestrator = new AIOrchestrator();
  });

  describe('BedrockClientService', () => {
    it('should generate response for Spanish greeting', async () => {
      const request = {
        message: 'Hola',
        conversationContext: {
          customerId: 'test_customer',
          status: 'active' as const,
          lastIntent: 'new_conversation',
          productInquiries: [],
          messages: [],
          createdAt: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        },
        customerProfile: {
          phoneNumber: '+1234567890',
          preferredLanguage: 'es' as const,
          inquiryHistory: [],
          leadScore: 0,
          totalConversations: 0,
          lastInteraction: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      const response = await bedrockClient.generateResponse(request);

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.intent).toBeTruthy();
      expect(response.confidence).toBeGreaterThan(0);
      expect(typeof response.shouldEscalate).toBe('boolean');
    });

    it('should create conversation context', () => {
      const context = bedrockClient.createConversationContext('test_customer', 'Hola');

      expect(context.customerId).toBe('test_customer');
      expect(context.status).toBe('active');
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe('Hola');
      expect(context.messages[0].from).toBe('customer');
    });
  });

  describe('IntentDetectionService', () => {
    it('should classify Spanish availability question', async () => {
      const intent = await intentService.classifyIntent('¿Está disponible el iPhone?');

      expect(intent.intent).toBe('disponibilidad');
      expect(intent.confidence).toBeGreaterThan(0.5);
      expect(intent.entities).toBeDefined();
    });

    it('should classify Spanish price question', async () => {
      const intent = await intentService.classifyIntent('¿Cuánto cuesta?');

      expect(intent.intent).toBe('precio');
      expect(intent.confidence).toBeGreaterThan(0.5);
    });

    it('should classify Spanish shipping question', async () => {
      const intent = await intentService.classifyIntent('¿Hacen envíos?');

      expect(intent.intent).toBe('envio');
      expect(intent.confidence).toBeGreaterThan(0.5);
    });

    it('should detect escalation triggers for complaints', async () => {
      const intent = { intent: 'general', confidence: 0.8, entities: {} };
      const triggers = await intentService.detectEscalationTriggers(
        'Tengo un problema con el producto',
        intent
      );

      expect(triggers).toHaveLength(1);
      expect(triggers[0].type).toBe('complaint');
    });

    it('should detect escalation triggers for low confidence', async () => {
      const intent = { intent: 'general', confidence: 0.2, entities: {} };
      const triggers = await intentService.detectEscalationTriggers(
        'No entiendo',
        intent
      );

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers.some(t => t.type === 'low_confidence')).toBe(true);
    });
  });

  describe('ResponseGenerationService', () => {
    it('should generate greeting response', async () => {
      const context = {
        message: 'Hola',
        intent: { intent: 'saludo', confidence: 0.9, entities: {} },
        escalationTriggers: [],
        conversationContext: {
          customerId: 'test_customer',
          status: 'active' as const,
          lastIntent: 'new_conversation',
          productInquiries: [],
          messages: [],
          createdAt: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        },
        customerProfile: {
          phoneNumber: '+1234567890',
          preferredLanguage: 'es' as const,
          inquiryHistory: [],
          leadScore: 0,
          totalConversations: 0,
          lastInteraction: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        availableProducts: []
      };

      const response = await responseService.generateResponse(context);

      expect(response.response).toContain('Hola');
      expect(response.intent).toBe('saludo');
      expect(response.shouldEscalate).toBe(false);
    });

    it('should generate escalation response for purchase intent', async () => {
      const context = {
        message: 'Quiero comprar',
        intent: { intent: 'compra', confidence: 0.9, entities: {} },
        escalationTriggers: [],
        conversationContext: {
          customerId: 'test_customer',
          status: 'active' as const,
          lastIntent: 'new_conversation',
          productInquiries: [],
          messages: [],
          createdAt: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        },
        customerProfile: {
          phoneNumber: '+1234567890',
          preferredLanguage: 'es' as const,
          inquiryHistory: [],
          leadScore: 0,
          totalConversations: 0,
          lastInteraction: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        availableProducts: []
      };

      const response = await responseService.generateResponse(context);

      expect(response.shouldEscalate).toBe(true);
      expect(response.intent).toBe('compra');
    });
  });

  describe('AIOrchestrator', () => {
    it('should process complete message pipeline', async () => {
      const request = {
        message: 'Hola, ¿tienen iPhone disponible?',
        customerProfile: {
          phoneNumber: '+1234567890',
          preferredLanguage: 'es' as const,
          inquiryHistory: [],
          leadScore: 0,
          totalConversations: 0,
          lastInteraction: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        availableProducts: [
          {
            productId: 'iphone_1',
            name: 'iPhone 14',
            description: 'iPhone 14 128GB',
            price: 800,
            discountRange: { min: 0, max: 10 },
            category: 'electronics',
            condition: 'used' as const,
            location: 'Bogotá',
            images: [],
            status: 'available' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      };

      const result = await aiOrchestrator.processMessage(request);

      expect(result.response).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.processingMetadata).toBeDefined();
      expect(result.processingMetadata.processingTimeMs).toBeGreaterThan(0);
      expect(result.processingMetadata.servicesUsed).toContain('intent-detection');
    });

    it('should handle typing indicators', async () => {
      const request = {
        message: 'Necesito información detallada sobre el producto',
        customerProfile: {
          phoneNumber: '+1234567890',
          preferredLanguage: 'es' as const,
          inquiryHistory: [],
          leadScore: 0,
          totalConversations: 0,
          lastInteraction: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      const typingInfo = await aiOrchestrator.processTypingIndicators(request);

      expect(typingInfo.shouldShowTyping).toBe(true);
      expect(typingInfo.estimatedResponseTime).toBeGreaterThan(0);
    });

    it('should generate conversation summary', async () => {
      const context = {
        customerId: 'test_customer',
        status: 'active' as const,
        lastIntent: 'disponibilidad',
        productInquiries: ['iphone_1'],
        messages: [
          {
            id: 'msg_1',
            from: 'customer' as const,
            content: '¿Tienen iPhone?',
            timestamp: new Date().toISOString(),
            type: 'text' as const
          },
          {
            id: 'msg_2',
            from: 'bot' as const,
            content: 'Sí, tenemos iPhone 14 disponible',
            timestamp: new Date().toISOString(),
            type: 'text' as const
          }
        ],
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      };

      const summary = await aiOrchestrator.generateConversationSummary(context);

      expect(summary).toContain('test_customer');
      expect(summary).toContain('disponibilidad');
      expect(summary).toContain('iPhone');
    });
  });
});

describe('Error Handling', () => {
  it('should handle Bedrock API errors gracefully', async () => {
    // Mock Bedrock to throw an error
    const mockBedrockClient = new BedrockClientService();
    jest.spyOn(mockBedrockClient, 'generateResponse').mockRejectedValue(new Error('Bedrock API error'));

    const request = {
      message: 'Test message',
      conversationContext: {
        customerId: 'test_customer',
        status: 'active' as const,
        lastIntent: 'new_conversation',
        productInquiries: [],
        messages: [],
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      },
      customerProfile: {
        phoneNumber: '+1234567890',
        preferredLanguage: 'es' as const,
        inquiryHistory: [],
        leadScore: 0,
        totalConversations: 0,
        lastInteraction: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    const response = await mockBedrockClient.generateResponse(request);

    // Should return fallback response
    expect(response.shouldEscalate).toBe(true);
    expect(response.response).toContain('asesor');
  });
});