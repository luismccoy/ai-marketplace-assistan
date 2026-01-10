/**
 * Tenant Resolution Service
 * Handles tenant identification and configuration loading
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  TenantConfig,
  TenantResolutionResult,
  TenantContext,
  TenantUsage,
  TenantIsolationCheck,
  TenantLimitCheck
} from '../types/tenant';

export class TenantResolver {
  private docClient: DynamoDBDocumentClient;
  private tenantsTable: string;
  private usageTable: string;
  private tenantCache: Map<string, { config: TenantConfig; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    dynamoClient: DynamoDBClient,
    tenantsTable: string = 'ai-marketplace-tenants',
    usageTable: string = 'ai-marketplace-tenant-usage'
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.tenantsTable = tenantsTable;
    this.usageTable = usageTable;
  }

  /**
   * Resolve tenant from WhatsApp phone number
   */
  async resolveTenantFromWhatsApp(whatsappNumber: string): Promise<TenantResolutionResult> {
    try {
      console.log(`Resolving tenant for WhatsApp number: ${whatsappNumber}`);

      // First check cache
      const cachedResult = this.getCachedTenantByWhatsApp(whatsappNumber);
      if (cachedResult) {
        return {
          tenantId: cachedResult.tenantId,
          tenantConfig: cachedResult,
          isValid: true
        };
      }

      // Query tenants table to find tenant with this WhatsApp number
      const result = await this.docClient.send(new ScanCommand({
        TableName: this.tenantsTable,
        FilterExpression: 'contains(whatsappNumbers, :phoneNumber) AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':phoneNumber': whatsappNumber,
          ':status': 'active'
        }
      }));

      if (!result.Items || result.Items.length === 0) {
        console.log(`No active tenant found for WhatsApp number: ${whatsappNumber}`);
        return {
          tenantId: '',
          tenantConfig: {} as TenantConfig,
          isValid: false,
          errorMessage: 'No active tenant found for this WhatsApp number'
        };
      }

      if (result.Items.length > 1) {
        console.warn(`Multiple tenants found for WhatsApp number: ${whatsappNumber}`);
        // Use the first active tenant found
      }

      const tenantConfig = result.Items[0] as TenantConfig;

      // Cache the result
      this.cacheTenanConfig(tenantConfig);

      console.log(`Tenant resolved: ${tenantConfig.tenantId} for WhatsApp: ${whatsappNumber}`);

      return {
        tenantId: tenantConfig.tenantId,
        tenantConfig,
        isValid: true
      };

    } catch (error) {
      console.error('Error resolving tenant from WhatsApp number:', error);
      return {
        tenantId: '',
        tenantConfig: {} as TenantConfig,
        isValid: false,
        errorMessage: `Error resolving tenant: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get tenant configuration by tenant ID
   */
  async getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
    try {
      // Check cache first
      const cached = this.tenantCache.get(tenantId);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.config;
      }

      const result = await this.docClient.send(new GetCommand({
        TableName: this.tenantsTable,
        Key: { tenantId }
      }));

      if (!result.Item) {
        return null;
      }

      const config = result.Item as TenantConfig;
      this.cacheTenanConfig(config);

      return config;
    } catch (error) {
      console.error('Error getting tenant config:', error);
      return null;
    }
  }

  /**
   * Create tenant context for processing
   */
  async createTenantContext(tenantId: string): Promise<TenantContext | null> {
    try {
      const config = await this.getTenantConfig(tenantId);
      if (!config) {
        return null;
      }

      // Get current usage
      const currentUsage = await this.getCurrentUsage(tenantId);

      return {
        tenantId: config.tenantId,
        businessName: config.businessName,
        businessConfig: config.businessConfig,
        aiConfig: config.aiConfig,
        limits: config.limits,
        currentUsage: currentUsage || undefined
      };
    } catch (error) {
      console.error('Error creating tenant context:', error);
      return null;
    }
  }

  /**
   * Validate tenant isolation for data access
   */
  validateTenantIsolation(
    requestTenantId: string,
    resourceTenantId: string,
    operation: string,
    resourceType: string,
    resourceId: string
  ): TenantIsolationCheck {
    const isValid = requestTenantId === resourceTenantId;

    return {
      operation,
      tenantId: requestTenantId,
      resourceId,
      resourceType: resourceType as any,
      isValid,
      errorMessage: isValid ? undefined : `Tenant ${requestTenantId} cannot access ${resourceType} ${resourceId} belonging to tenant ${resourceTenantId}`
    };
  }

  /**
   * Check tenant limits
   */
  async checkTenantLimits(
    tenantId: string,
    limitType: 'conversations' | 'messages' | 'products' | 'storage'
  ): Promise<TenantLimitCheck> {
    try {
      const config = await this.getTenantConfig(tenantId);
      if (!config) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const usage = await this.getCurrentUsage(tenantId);
      let currentUsage = 0;
      let limit = 0;

      switch (limitType) {
        case 'conversations':
          currentUsage = usage?.conversationsCount || 0;
          limit = config.limits.maxConversationsPerMonth;
          break;
        case 'messages':
          currentUsage = usage?.messagesCount || 0;
          limit = config.limits.maxMessagesPerDay;
          break;
        case 'products':
          // This would need to be calculated from products table
          currentUsage = 0; // TODO: Implement product count
          limit = config.limits.maxProductsCount;
          break;
        case 'storage':
          currentUsage = usage?.storageUsedGB || 0;
          limit = config.limits.maxStorageGB;
          break;
      }

      const utilizationPercent = limit > 0 ? (currentUsage / limit) * 100 : 0;
      const isWithinLimit = currentUsage <= limit;

      return {
        tenantId,
        limitType,
        currentUsage,
        limit,
        isWithinLimit,
        utilizationPercent,
        warningThreshold: 80 // 80% utilization warning
      };
    } catch (error) {
      console.error('Error checking tenant limits:', error);
      throw error;
    }
  }

  /**
   * Get current month usage for tenant
   */
  private async getCurrentUsage(tenantId: string): Promise<TenantUsage | null> {
    try {
      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

      const result = await this.docClient.send(new GetCommand({
        TableName: this.usageTable,
        Key: {
          tenantId,
          month: currentMonth
        }
      }));

      return result.Item as TenantUsage || null;
    } catch (error) {
      console.error('Error getting current usage:', error);
      return null;
    }
  }

  /**
   * Cache tenant configuration
   */
  private cacheTenanConfig(config: TenantConfig): void {
    this.tenantCache.set(config.tenantId, {
      config,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached tenant by WhatsApp number
   */
  private getCachedTenantByWhatsApp(whatsappNumber: string): TenantConfig | null {
    for (const [tenantId, cached] of this.tenantCache.entries()) {
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        if (cached.config.whatsappNumbers.includes(whatsappNumber)) {
          return cached.config;
        }
      }
    }
    return null;
  }

  /**
   * Clear tenant cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.tenantCache.clear();
  }

  /**
   * Get all active tenants (admin function)
   */
  async getAllActiveTenants(): Promise<TenantConfig[]> {
    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: this.tenantsTable,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'active'
        }
      }));

      return (result.Items || []) as TenantConfig[];
    } catch (error) {
      console.error('Error getting all active tenants:', error);
      return [];
    }
  }

  /**
   * Create default tenant configuration
   */
  static createDefaultTenantConfig(
    tenantId: string,
    businessName: string,
    whatsappNumbers: string[],
    contactEmail: string
  ): TenantConfig {
    return {
      tenantId,
      businessName,
      ownerName: businessName,
      whatsappNumbers,
      status: 'trial',
      plan: 'basic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      businessConfig: {
        communicationStyle: {
          tone: 'friendly',
          useEmojis: true,
          typicalPhrases: ['¡Perfecto!', '¡Claro que sí!', '¡Excelente!'],
          greetingStyle: '¡Hola! ¿En qué te puedo ayudar?',
          closingStyle: '¡Que tengas buen día!'
        },
        shippingInfo: {
          available: true,
          zones: ['nacional'],
          costs: { 'nacional': 15000 },
          estimatedDays: 3
        },
        discountPolicy: {
          allowNegotiation: true,
          maxDiscountPercent: 10,
          bulkDiscounts: false
        },
        appointmentConfig: {
          enabled: true,
          businessHours: "9am-5pm"
        },
        paymentConfig: {
          methods: ["Nequi"],
          instructions: ""
        }
      },

      aiConfig: {
        model: 'claude-3-haiku',
        maxTokens: 1000,
        temperature: 0.7,
        enableRAG: false
      },

      limits: {
        maxConversationsPerMonth: 100,
        maxMessagesPerDay: 500,
        maxProductsCount: 50,
        maxStorageGB: 1
      },

      contactInfo: {
        email: contactEmail
      },

      integrations: {
        notifications: {
          enableSMSNotifications: false
        }
      }
    };
  }
}

// Export singleton instance
export const tenantResolver = new TenantResolver(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
  process.env.TENANTS_TABLE || 'ai-marketplace-tenants-platform',
  process.env.USAGE_TABLE || 'ai-marketplace-tenant-usage'
);