/**
 * Tenant Usage Tracking Service
 * Handles usage tracking and limits enforcement for multi-tenant architecture
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { TenantUsage, TenantLimitCheck, TenantConfig } from '../types/tenant';
import { tenantResolver } from './tenant-resolver';

export class TenantUsageTracker {
  private docClient: DynamoDBDocumentClient;
  private usageTable: string;

  constructor(
    dynamoClient: DynamoDBClient,
    usageTable: string = 'ai-marketplace-tenant-usage'
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.usageTable = usageTable;
  }

  /**
   * Track message usage for tenant
   */
  async trackMessage(tenantId: string): Promise<boolean> {
    try {
      // Check limits first
      const limitCheck = await this.checkMessageLimits(tenantId);
      if (!limitCheck.isWithinLimit) {
        console.warn(`Tenant ${tenantId} has exceeded message limits`);
        return false;
      }

      await this.incrementUsage(tenantId, 'messagesCount', 1);
      await this.updateDailyStats(tenantId, 'messages', 1);
      
      return true;
    } catch (error) {
      console.error('Error tracking message usage:', error);
      return false;
    }
  }

  /**
   * Track conversation usage for tenant
   */
  async trackConversation(tenantId: string): Promise<boolean> {
    try {
      // Check limits first
      const limitCheck = await this.checkConversationLimits(tenantId);
      if (!limitCheck.isWithinLimit) {
        console.warn(`Tenant ${tenantId} has exceeded conversation limits`);
        return false;
      }

      await this.incrementUsage(tenantId, 'conversationsCount', 1);
      await this.updateDailyStats(tenantId, 'conversations', 1);
      
      return true;
    } catch (error) {
      console.error('Error tracking conversation usage:', error);
      return false;
    }
  }

  /**
   * Track AI token usage for tenant
   */
  async trackTokens(tenantId: string, tokensUsed: number): Promise<boolean> {
    try {
      await this.incrementUsage(tenantId, 'aiTokensUsed', tokensUsed);
      await this.updateDailyStats(tenantId, 'tokens', tokensUsed);
      
      return true;
    } catch (error) {
      console.error('Error tracking token usage:', error);
      return false;
    }
  }

  /**
   * Update storage usage for tenant
   */
  async updateStorageUsage(tenantId: string, storageGB: number): Promise<boolean> {
    try {
      const currentMonth = new Date().toISOString().substring(0, 7);

      await this.docClient.send(new UpdateCommand({
        TableName: this.usageTable,
        Key: { tenantId, month: currentMonth },
        UpdateExpression: 'SET storageUsedGB = :storage, lastUpdated = :now',
        ExpressionAttributeValues: {
          ':storage': storageGB,
          ':now': new Date().toISOString()
        }
      }));

      return true;
    } catch (error) {
      console.error('Error updating storage usage:', error);
      return false;
    }
  }

  /**
   * Check message limits for tenant
   */
  async checkMessageLimits(tenantId: string): Promise<TenantLimitCheck> {
    return await this.checkLimits(tenantId, 'messages');
  }

  /**
   * Check conversation limits for tenant
   */
  async checkConversationLimits(tenantId: string): Promise<TenantLimitCheck> {
    return await this.checkLimits(tenantId, 'conversations');
  }

  /**
   * Check storage limits for tenant
   */
  async checkStorageLimits(tenantId: string): Promise<TenantLimitCheck> {
    return await this.checkLimits(tenantId, 'storage');
  }

  /**
   * Get current usage for tenant
   */
  async getCurrentUsage(tenantId: string, month?: string): Promise<TenantUsage | null> {
    try {
      const targetMonth = month || new Date().toISOString().substring(0, 7);

      const result = await this.docClient.send(new GetCommand({
        TableName: this.usageTable,
        Key: { tenantId, month: targetMonth }
      }));

      return result.Item as TenantUsage || null;
    } catch (error) {
      console.error('Error getting current usage:', error);
      return null;
    }
  }

  /**
   * Get usage summary for tenant (last 6 months)
   */
  async getUsageSummary(tenantId: string): Promise<TenantUsage[]> {
    try {
      const usageData: TenantUsage[] = [];
      const now = new Date();

      // Get last 6 months of data
      for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = date.toISOString().substring(0, 7);
        
        const usage = await this.getCurrentUsage(tenantId, month);
        if (usage) {
          usageData.push(usage);
        }
      }

      return usageData.reverse(); // Chronological order
    } catch (error) {
      console.error('Error getting usage summary:', error);
      return [];
    }
  }

  /**
   * Reset monthly usage (called at month start)
   */
  async resetMonthlyUsage(tenantId: string): Promise<boolean> {
    try {
      const currentMonth = new Date().toISOString().substring(0, 7);

      // Create new month record with zero usage
      const newUsage: TenantUsage = {
        tenantId,
        month: currentMonth,
        conversationsCount: 0,
        messagesCount: 0,
        aiTokensUsed: 0,
        storageUsedGB: 0,
        lastUpdated: new Date().toISOString(),
        dailyStats: []
      };

      await this.docClient.send(new UpdateCommand({
        TableName: this.usageTable,
        Key: { tenantId, month: currentMonth },
        UpdateExpression: 'SET conversationsCount = :zero, messagesCount = :zero, aiTokensUsed = :zero, lastUpdated = :now, dailyStats = :empty',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':now': new Date().toISOString(),
          ':empty': []
        }
      }));

      return true;
    } catch (error) {
      console.error('Error resetting monthly usage:', error);
      return false;
    }
  }

  /**
   * Check if tenant is approaching limits (80% threshold)
   */
  async checkWarningThresholds(tenantId: string): Promise<{
    messages: boolean;
    conversations: boolean;
    storage: boolean;
  }> {
    try {
      const [messageCheck, conversationCheck, storageCheck] = await Promise.all([
        this.checkMessageLimits(tenantId),
        this.checkConversationLimits(tenantId),
        this.checkStorageLimits(tenantId)
      ]);

      return {
        messages: messageCheck.utilizationPercent >= 80,
        conversations: conversationCheck.utilizationPercent >= 80,
        storage: storageCheck.utilizationPercent >= 80
      };
    } catch (error) {
      console.error('Error checking warning thresholds:', error);
      return { messages: false, conversations: false, storage: false };
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generic limit checking
   */
  private async checkLimits(
    tenantId: string,
    limitType: 'messages' | 'conversations' | 'storage'
  ): Promise<TenantLimitCheck> {
    try {
      const config = await tenantResolver.getTenantConfig(tenantId);
      if (!config) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const usage = await this.getCurrentUsage(tenantId);
      let currentUsage = 0;
      let limit = 0;

      switch (limitType) {
        case 'messages':
          currentUsage = usage?.messagesCount || 0;
          limit = config.limits.maxMessagesPerDay;
          break;
        case 'conversations':
          currentUsage = usage?.conversationsCount || 0;
          limit = config.limits.maxConversationsPerMonth;
          break;
        case 'storage':
          currentUsage = usage?.storageUsedGB || 0;
          limit = config.limits.maxStorageGB;
          break;
      }

      const utilizationPercent = limit > 0 ? (currentUsage / limit) * 100 : 0;
      const isWithinLimit = currentUsage < limit;

      return {
        tenantId,
        limitType,
        currentUsage,
        limit,
        isWithinLimit,
        utilizationPercent,
        warningThreshold: 80
      };
    } catch (error) {
      console.error('Error checking limits:', error);
      throw error;
    }
  }

  /**
   * Increment usage counter
   */
  private async incrementUsage(
    tenantId: string,
    field: 'conversationsCount' | 'messagesCount' | 'aiTokensUsed',
    increment: number
  ): Promise<void> {
    const currentMonth = new Date().toISOString().substring(0, 7);

    await this.docClient.send(new UpdateCommand({
      TableName: this.usageTable,
      Key: { tenantId, month: currentMonth },
      UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :inc, lastUpdated = :now`,
      ExpressionAttributeValues: {
        ':inc': increment,
        ':zero': 0,
        ':now': new Date().toISOString()
      }
    }));
  }

  /**
   * Update daily statistics
   */
  private async updateDailyStats(
    tenantId: string,
    statType: 'messages' | 'conversations' | 'tokens',
    increment: number
  ): Promise<void> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const today = new Date().toISOString().substring(0, 10);

    // Get current usage to update daily stats
    const usage = await this.getCurrentUsage(tenantId);
    const dailyStats = usage?.dailyStats || [];

    // Find or create today's stats
    let todayStats = dailyStats.find(stat => stat.date === today);
    if (!todayStats) {
      todayStats = { date: today, conversations: 0, messages: 0, tokens: 0 };
      dailyStats.push(todayStats);
    }

    // Update the specific stat
    todayStats[statType] += increment;

    // Keep only last 30 days
    const recentStats = dailyStats
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    await this.docClient.send(new UpdateCommand({
      TableName: this.usageTable,
      Key: { tenantId, month: currentMonth },
      UpdateExpression: 'SET dailyStats = :stats, lastUpdated = :now',
      ExpressionAttributeValues: {
        ':stats': recentStats,
        ':now': new Date().toISOString()
      }
    }));
  }
}

// Export singleton instance
export const tenantUsageTracker = new TenantUsageTracker(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);