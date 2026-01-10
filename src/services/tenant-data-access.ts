/**
 * Tenant-Aware Data Access Service
 * Provides tenant-isolated data operations for DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import {
  TenantConversationContext,
  TenantConversationMessage,
  TenantCustomerProfile,
  TenantProduct,
  TenantUsage,
  TenantIsolationCheck
} from '../types/tenant';
import { tenantResolver } from './tenant-resolver';

export class TenantDataAccess {
  private docClient: DynamoDBDocumentClient;
  private conversationsTable: string;
  private customersTable: string;
  private productsTable: string;
  private usageTable: string;

  constructor(
    dynamoClient: DynamoDBClient,
    conversationsTable: string = 'ai-marketplace-conversations',
    customersTable: string = 'ai-marketplace-customers',
    productsTable: string = 'ai-marketplace-products',
    usageTable: string = 'ai-marketplace-tenant-usage'
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.conversationsTable = conversationsTable;
    this.customersTable = customersTable;
    this.productsTable = productsTable;
    this.usageTable = usageTable;
  }

  // ==================== CONVERSATION OPERATIONS ====================

  /**
   * Get conversation with tenant isolation
   */
  async getConversation(
    tenantId: string,
    conversationId: string
  ): Promise<TenantConversationContext | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: this.conversationsTable,
        Key: {
          conversationId: `${tenantId}#${conversationId}`,
          timestamp: 0 // Metadata record
        }
      }));

      if (!result.Item) {
        return null;
      }

      const conversation = result.Item as TenantConversationContext;

      // Validate tenant isolation
      const isolation = tenantResolver.validateTenantIsolation(
        tenantId,
        conversation.tenantId,
        'read',
        'conversation',
        conversationId
      );

      if (!isolation.isValid) {
        console.error('Tenant isolation violation:', isolation.errorMessage);
        return null;
      }

      return conversation;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  /**
   * Save conversation with tenant isolation
   */
  async saveConversation(conversation: TenantConversationContext): Promise<boolean> {
    try {
      // Ensure tenantId is set
      if (!conversation.tenantId) {
        throw new Error('Conversation must have tenantId');
      }

      const conversationKey = `${conversation.tenantId}#${conversation.conversationId}`;

      // Save metadata record
      await this.docClient.send(new PutCommand({
        TableName: this.conversationsTable,
        Item: {
          conversationId: conversationKey,
          timestamp: 0, // Metadata record
          tenantId: conversation.tenantId,
          customerId: conversation.customerId,
          status: conversation.status,
          lastIntent: conversation.lastIntent,
          productInquiries: conversation.productInquiries,
          createdAt: conversation.createdAt,
          lastUpdate: conversation.lastUpdate,
          escalationReason: conversation.escalationReason,
          assignedAgent: conversation.assignedAgent
        }
      }));

      // Save individual messages with tenant isolation
      for (const message of conversation.messages.slice(-10)) { // Keep last 10 messages
        await this.saveMessage({
          ...message,
          tenantId: conversation.tenantId,
          conversationId: conversation.conversationId
        });
      }

      return true;
    } catch (error) {
      console.error('Error saving conversation:', error);
      return false;
    }
  }

  /**
   * Save message with tenant isolation
   */
  async saveMessage(message: TenantConversationMessage): Promise<boolean> {
    try {
      if (!message.tenantId) {
        throw new Error('Message must have tenantId');
      }

      const conversationKey = `${message.tenantId}#${message.conversationId}`;

      await this.docClient.send(new PutCommand({
        TableName: this.conversationsTable,
        Item: {
          conversationId: conversationKey,
          timestamp: new Date(message.timestamp).getTime(),
          messageId: message.id,
          tenantId: message.tenantId,
          from: message.from,
          content: message.content,
          type: message.type,
          metadata: message.metadata
        }
      }));

      return true;
    } catch (error) {
      console.error('Error saving message:', error);
      return false;
    }
  }

  /**
   * Get conversation messages with tenant isolation
   */
  async getConversationMessages(
    tenantId: string,
    conversationId: string,
    limit: number = 50
  ): Promise<TenantConversationMessage[]> {
    try {
      const conversationKey = `${tenantId}#${conversationId}`;

      const result = await this.docClient.send(new QueryCommand({
        TableName: this.conversationsTable,
        KeyConditionExpression: 'conversationId = :convId AND #timestamp > :zero',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':convId': conversationKey,
          ':zero': 0
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      }));

      return (result.Items || [])
        .map(item => ({
          id: item.messageId,
          conversationId,
          tenantId,
          from: item.from,
          content: item.content,
          timestamp: new Date(item.timestamp).toISOString(),
          type: item.type,
          metadata: item.metadata
        }))
        .reverse(); // Chronological order
    } catch (error) {
      console.error('Error getting conversation messages:', error);
      return [];
    }
  }

  // ==================== CUSTOMER OPERATIONS ====================

  /**
   * Get customer profile with tenant isolation
   */
  async getCustomerProfile(
    tenantId: string,
    phoneNumber: string
  ): Promise<TenantCustomerProfile | null> {
    try {
      const customerKey = `${tenantId}#${phoneNumber}`;

      const result = await this.docClient.send(new GetCommand({
        TableName: this.customersTable,
        Key: { phoneNumber: customerKey }
      }));

      if (!result.Item) {
        return null;
      }

      const customer = result.Item as TenantCustomerProfile;

      // Validate tenant isolation
      const isolation = tenantResolver.validateTenantIsolation(
        tenantId,
        customer.tenantId,
        'read',
        'customer',
        phoneNumber
      );

      if (!isolation.isValid) {
        console.error('Tenant isolation violation:', isolation.errorMessage);
        return null;
      }

      return customer;
    } catch (error) {
      console.error('Error getting customer profile:', error);
      return null;
    }
  }

  /**
   * Save customer profile with tenant isolation
   */
  async saveCustomerProfile(customer: TenantCustomerProfile): Promise<boolean> {
    try {
      if (!customer.tenantId) {
        throw new Error('Customer must have tenantId');
      }

      const customerKey = `${customer.tenantId}#${customer.phoneNumber}`;

      await this.docClient.send(new PutCommand({
        TableName: this.customersTable,
        Item: {
          ...customer,
          phoneNumber: customerKey
        }
      }));

      return true;
    } catch (error) {
      console.error('Error saving customer profile:', error);
      return false;
    }
  }

  /**
   * Get all customers for tenant
   */
  async getTenantCustomers(tenantId: string, limit: number = 100): Promise<TenantCustomerProfile[]> {
    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: this.customersTable,
        FilterExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: {
          ':tenantId': tenantId
        },
        Limit: limit
      }));

      return (result.Items || []) as TenantCustomerProfile[];
    } catch (error) {
      console.error('Error getting tenant customers:', error);
      return [];
    }
  }

  // ==================== PRODUCT OPERATIONS ====================

  /**
   * Get product with tenant isolation
   */
  async getProduct(tenantId: string, productId: string): Promise<TenantProduct | null> {
    try {
      const productKey = `${tenantId}#${productId}`;

      const result = await this.docClient.send(new GetCommand({
        TableName: this.productsTable,
        Key: { productId: productKey }
      }));

      if (!result.Item) {
        return null;
      }

      const product = result.Item as TenantProduct;

      // Validate tenant isolation
      const isolation = tenantResolver.validateTenantIsolation(
        tenantId,
        product.tenantId,
        'read',
        'product',
        productId
      );

      if (!isolation.isValid) {
        console.error('Tenant isolation violation:', isolation.errorMessage);
        return null;
      }

      return product;
    } catch (error) {
      console.error('Error getting product:', error);
      return null;
    }
  }

  /**
   * Save product with tenant isolation
   */
  async saveProduct(product: TenantProduct): Promise<boolean> {
    try {
      if (!product.tenantId) {
        throw new Error('Product must have tenantId');
      }

      const productKey = `${product.tenantId}#${product.productId}`;

      await this.docClient.send(new PutCommand({
        TableName: this.productsTable,
        Item: {
          ...product,
          productId: productKey
        }
      }));

      return true;
    } catch (error) {
      console.error('Error saving product:', error);
      return false;
    }
  }

  /**
   * Get available products for tenant
   */
  async getTenantProducts(
    tenantId: string,
    status?: 'available' | 'sold' | 'reserved',
    limit: number = 100
  ): Promise<TenantProduct[]> {
    try {
      let filterExpression = 'tenantId = :tenantId';
      const expressionValues: any = { ':tenantId': tenantId };

      if (status) {
        filterExpression += ' AND #status = :status';
        expressionValues[':status'] = status;
      }

      const result = await this.docClient.send(new ScanCommand({
        TableName: this.productsTable,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
        ExpressionAttributeValues: expressionValues,
        Limit: limit
      }));

      return (result.Items || []) as TenantProduct[];
    } catch (error) {
      console.error('Error getting tenant products:', error);
      return [];
    }
  }

  /**
   * Delete product with tenant isolation
   */
  async deleteProduct(tenantId: string, productId: string): Promise<boolean> {
    try {
      // First verify the product belongs to the tenant
      const product = await this.getProduct(tenantId, productId);
      if (!product) {
        return false;
      }

      const productKey = `${tenantId}#${productId}`;

      await this.docClient.send(new DeleteCommand({
        TableName: this.productsTable,
        Key: { productId: productKey }
      }));

      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      return false;
    }
  }

  // ==================== USAGE TRACKING ====================

  /**
   * Update tenant usage
   */
  async updateTenantUsage(
    tenantId: string,
    usageType: 'conversation' | 'message' | 'tokens' | 'storage',
    increment: number = 1
  ): Promise<boolean> {
    try {
      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
      const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

      let updateExpression = 'SET lastUpdated = :now';
      let expressionValues: any = { ':now': new Date().toISOString() };

      switch (usageType) {
        case 'conversation':
          updateExpression += ', conversationsCount = if_not_exists(conversationsCount, :zero) + :inc';
          expressionValues[':inc'] = increment;
          expressionValues[':zero'] = 0;
          break;
        case 'message':
          updateExpression += ', messagesCount = if_not_exists(messagesCount, :zero) + :inc';
          expressionValues[':inc'] = increment;
          expressionValues[':zero'] = 0;
          break;
        case 'tokens':
          updateExpression += ', aiTokensUsed = if_not_exists(aiTokensUsed, :zero) + :inc';
          expressionValues[':inc'] = increment;
          expressionValues[':zero'] = 0;
          break;
        case 'storage':
          updateExpression += ', storageUsedGB = :storage';
          expressionValues[':storage'] = increment;
          break;
      }

      await this.docClient.send(new UpdateCommand({
        TableName: this.usageTable,
        Key: {
          tenantId,
          month: currentMonth
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues
      }));

      return true;
    } catch (error) {
      console.error('Error updating tenant usage:', error);
      return false;
    }
  }

  /**
   * Get tenant usage for month
   */
  async getTenantUsage(tenantId: string, month?: string): Promise<TenantUsage | null> {
    try {
      const targetMonth = month || new Date().toISOString().substring(0, 7);

      const result = await this.docClient.send(new GetCommand({
        TableName: this.usageTable,
        Key: {
          tenantId,
          month: targetMonth
        }
      }));

      return result.Item as TenantUsage || null;
    } catch (error) {
      console.error('Error getting tenant usage:', error);
      return null;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Validate tenant access to resource
   */
  validateTenantAccess(
    requestTenantId: string,
    resourceTenantId: string,
    operation: string,
    resourceType: string,
    resourceId: string
  ): TenantIsolationCheck {
    return tenantResolver.validateTenantIsolation(
      requestTenantId,
      resourceTenantId,
      operation,
      resourceType,
      resourceId
    );
  }

  /**
   * Create tenant-aware conversation ID
   */
  createTenantConversationId(tenantId: string, phoneNumber: string): string {
    return `conv_${tenantId}_${phoneNumber}`;
  }

  /**
   * Extract original IDs from tenant-aware keys
   */
  extractOriginalId(tenantAwareId: string): string {
    const parts = tenantAwareId.split('#');
    return parts.length > 1 ? parts[1] : tenantAwareId;
  }

  /**
   * Create tenant-aware key
   */
  createTenantKey(tenantId: string, originalId: string): string {
    return `${tenantId}#${originalId}`;
  }
}

// Export singleton instance
export const tenantDataAccess = new TenantDataAccess(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
  process.env.CONVERSATIONS_TABLE || 'ai-marketplace-conversations-platform',
  process.env.CUSTOMERS_TABLE || 'ai-marketplace-customers',
  process.env.PRODUCTS_TABLE || 'ai-marketplace-products-platform',
  process.env.USAGE_TABLE || 'ai-marketplace-tenant-usage'
);