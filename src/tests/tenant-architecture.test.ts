/**
 * Tenant Architecture Tests
 * Tests for multi-tenant functionality and data isolation
 */

import { TenantResolver } from '../services/tenant-resolver';
import { TenantDataAccess } from '../services/tenant-data-access';
import { TenantUsageTracker } from '../services/tenant-usage-tracker';
import { 
  TenantConfig, 
  TenantConversationContext, 
  TenantCustomerProfile,
  TenantProduct 
} from '../types/tenant';

// Mock DynamoDB client for testing
const mockDynamoClient = {
  send: jest.fn()
} as any;

describe('Tenant Architecture', () => {
  let tenantResolver: TenantResolver;
  let tenantDataAccess: TenantDataAccess;
  let tenantUsageTracker: TenantUsageTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantResolver = new TenantResolver(mockDynamoClient);
    tenantDataAccess = new TenantDataAccess(mockDynamoClient);
    tenantUsageTracker = new TenantUsageTracker(mockDynamoClient);
  });

  describe('TenantResolver', () => {
    it('should create default tenant configuration', () => {
      const config = TenantResolver.createDefaultTenantConfig(
        'test_tenant',
        'Test Business',
        ['+573001234567'],
        'test@example.com'
      );

      expect(config.tenantId).toBe('test_tenant');
      expect(config.businessName).toBe('Test Business');
      expect(config.whatsappNumbers).toContain('+573001234567');
      expect(config.contactInfo.email).toBe('test@example.com');
      expect(config.status).toBe('trial');
      expect(config.plan).toBe('basic');
    });

    it('should validate tenant isolation correctly', () => {
      const validIsolation = tenantResolver.validateTenantIsolation(
        'tenant1',
        'tenant1',
        'read',
        'conversation',
        'conv123'
      );

      expect(validIsolation.isValid).toBe(true);
      expect(validIsolation.errorMessage).toBeUndefined();

      const invalidIsolation = tenantResolver.validateTenantIsolation(
        'tenant1',
        'tenant2',
        'read',
        'conversation',
        'conv123'
      );

      expect(invalidIsolation.isValid).toBe(false);
      expect(invalidIsolation.errorMessage).toContain('cannot access');
    });
  });

  describe('TenantDataAccess', () => {
    it('should create tenant-aware conversation ID', () => {
      const conversationId = tenantDataAccess.createTenantConversationId(
        'tenant1',
        '+573001234567'
      );

      expect(conversationId).toBe('conv_tenant1_+573001234567');
    });

    it('should create tenant-aware keys', () => {
      const tenantKey = tenantDataAccess.createTenantKey('tenant1', 'resource123');
      expect(tenantKey).toBe('tenant1#resource123');
    });

    it('should extract original ID from tenant-aware key', () => {
      const originalId = tenantDataAccess.extractOriginalId('tenant1#resource123');
      expect(originalId).toBe('resource123');

      // Should handle non-tenant keys gracefully
      const simpleId = tenantDataAccess.extractOriginalId('simpleId');
      expect(simpleId).toBe('simpleId');
    });

    it('should validate tenant access correctly', () => {
      const validAccess = tenantDataAccess.validateTenantAccess(
        'tenant1',
        'tenant1',
        'read',
        'product',
        'prod123'
      );

      expect(validAccess.isValid).toBe(true);

      const invalidAccess = tenantDataAccess.validateTenantAccess(
        'tenant1',
        'tenant2',
        'read',
        'product',
        'prod123'
      );

      expect(invalidAccess.isValid).toBe(false);
    });
  });

  describe('Data Isolation', () => {
    it('should ensure tenant conversation context has tenantId', () => {
      const conversation: TenantConversationContext = {
        tenantId: 'tenant1',
        conversationId: 'conv_tenant1_+573001234567',
        customerId: '+573001234567',
        status: 'active',
        lastIntent: 'greeting',
        productInquiries: [],
        messages: [],
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      };

      expect(conversation.tenantId).toBe('tenant1');
      expect(conversation.conversationId).toContain('tenant1');
    });

    it('should ensure tenant customer profile has tenantId', () => {
      const customer: TenantCustomerProfile = {
        tenantId: 'tenant1',
        phoneNumber: '+573001234567',
        preferredLanguage: 'es',
        inquiryHistory: [],
        leadScore: 0,
        totalConversations: 0,
        lastInteraction: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect(customer.tenantId).toBe('tenant1');
    });

    it('should ensure tenant product has tenantId', () => {
      const product: TenantProduct = {
        tenantId: 'tenant1',
        productId: 'prod123',
        name: 'Test Product',
        description: 'A test product',
        price: 100000,
        discountRange: { min: 0, max: 10 },
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        images: [],
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect(product.tenantId).toBe('tenant1');
    });
  });

  describe('Tenant Limits', () => {
    it('should create proper limit check structure', async () => {
      // Mock the tenant config
      const mockConfig: TenantConfig = {
        tenantId: 'tenant1',
        businessName: 'Test Business',
        ownerName: 'Test Owner',
        whatsappNumbers: ['+573001234567'],
        status: 'active',
        plan: 'basic',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        businessConfig: {} as any,
        aiConfig: {} as any,
        limits: {
          maxConversationsPerMonth: 100,
          maxMessagesPerDay: 500,
          maxProductsCount: 50,
          maxStorageGB: 1
        },
        contactInfo: { email: 'test@example.com' },
        integrations: { notifications: { enableSMSNotifications: false } }
      };

      // Mock DynamoDB responses
      mockDynamoClient.send.mockResolvedValueOnce({ Item: mockConfig });
      mockDynamoClient.send.mockResolvedValueOnce({ 
        Item: { 
          tenantId: 'tenant1',
          month: '2024-01',
          messagesCount: 250,
          conversationsCount: 50
        } 
      });

      const limitCheck = await tenantUsageTracker.checkMessageLimits('tenant1');

      expect(limitCheck.tenantId).toBe('tenant1');
      expect(limitCheck.limitType).toBe('messages');
      expect(limitCheck.currentUsage).toBe(250);
      expect(limitCheck.limit).toBe(500);
      expect(limitCheck.isWithinLimit).toBe(true);
      expect(limitCheck.utilizationPercent).toBe(50);
    });
  });

  describe('Tenant Configuration Validation', () => {
    it('should validate required tenant configuration fields', () => {
      const config = TenantResolver.createDefaultTenantConfig(
        'test_tenant',
        'Test Business',
        ['+573001234567'],
        'test@example.com'
      );

      // Required fields
      expect(config.tenantId).toBeDefined();
      expect(config.businessName).toBeDefined();
      expect(config.whatsappNumbers).toBeDefined();
      expect(config.status).toBeDefined();
      expect(config.plan).toBeDefined();
      expect(config.createdAt).toBeDefined();
      expect(config.updatedAt).toBeDefined();

      // Configuration objects
      expect(config.businessConfig).toBeDefined();
      expect(config.aiConfig).toBeDefined();
      expect(config.limits).toBeDefined();
      expect(config.contactInfo).toBeDefined();
      expect(config.integrations).toBeDefined();

      // Limits validation
      expect(config.limits.maxConversationsPerMonth).toBeGreaterThan(0);
      expect(config.limits.maxMessagesPerDay).toBeGreaterThan(0);
      expect(config.limits.maxProductsCount).toBeGreaterThan(0);
      expect(config.limits.maxStorageGB).toBeGreaterThan(0);
    });

    it('should validate business configuration structure', () => {
      const config = TenantResolver.createDefaultTenantConfig(
        'test_tenant',
        'Test Business',
        ['+573001234567'],
        'test@example.com'
      );

      expect(config.businessConfig.communicationStyle).toBeDefined();
      expect(config.businessConfig.shippingInfo).toBeDefined();
      expect(config.businessConfig.discountPolicy).toBeDefined();

      // Communication style
      expect(config.businessConfig.communicationStyle.tone).toBeDefined();
      expect(config.businessConfig.communicationStyle.useEmojis).toBeDefined();
      expect(config.businessConfig.communicationStyle.typicalPhrases).toBeDefined();
      expect(config.businessConfig.communicationStyle.greetingStyle).toBeDefined();
      expect(config.businessConfig.communicationStyle.closingStyle).toBeDefined();

      // Shipping info
      expect(config.businessConfig.shippingInfo.available).toBeDefined();
      expect(config.businessConfig.shippingInfo.zones).toBeDefined();
      expect(config.businessConfig.shippingInfo.costs).toBeDefined();
      expect(config.businessConfig.shippingInfo.estimatedDays).toBeDefined();

      // Discount policy
      expect(config.businessConfig.discountPolicy.allowNegotiation).toBeDefined();
      expect(config.businessConfig.discountPolicy.maxDiscountPercent).toBeDefined();
      expect(config.businessConfig.discountPolicy.bulkDiscounts).toBeDefined();
    });
  });
});

// Integration test for tenant resolution flow
describe('Tenant Resolution Integration', () => {
  it('should handle complete tenant resolution flow', async () => {
    const tenantResolver = new TenantResolver(mockDynamoClient);
    
    // Mock successful tenant resolution
    const mockTenant: TenantConfig = {
      tenantId: 'tenant_electronics',
      businessName: 'ElectroMax',
      ownerName: 'Carlos Rodriguez',
      whatsappNumbers: ['+573001234567'],
      status: 'active',
      plan: 'pro',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      businessConfig: {} as any,
      aiConfig: {
        model: 'claude-3-haiku',
        maxTokens: 1000,
        temperature: 0.7,
        enableRAG: false
      },
      limits: {
        maxConversationsPerMonth: 1000,
        maxMessagesPerDay: 2000,
        maxProductsCount: 200,
        maxStorageGB: 5
      },
      contactInfo: { email: 'admin@electromax.com' },
      integrations: { notifications: { enableSMSNotifications: true } }
    };

    mockDynamoClient.send.mockResolvedValueOnce({
      Items: [mockTenant]
    });

    const resolution = await tenantResolver.resolveTenantFromWhatsApp('+573001234567');

    expect(resolution.isValid).toBe(true);
    expect(resolution.tenantId).toBe('tenant_electronics');
    expect(resolution.tenantConfig.businessName).toBe('ElectroMax');
  });
});