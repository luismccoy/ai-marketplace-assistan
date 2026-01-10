import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { TenantUsage } from '../types/tenant';

export class UsageTrackerService {
    private docClient: DynamoDBDocumentClient;
    private tableName: string;

    constructor(tableName: string) {
        const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
        this.docClient = DynamoDBDocumentClient.from(client);
        this.tableName = tableName;
    }

    /**
     * Atomically increment usage stats for a tenant
     */
    async incrementUsage(tenantId: string, type: 'message' | 'conversation', count: number = 1): Promise<void> {
        const period = new Date().toISOString().substring(0, 7); // YYYY-MM
        const updateExpression = type === 'message'
            ? 'SET messageCount = if_not_exists(messageCount, :min) + :inc, lastUpdated = :now'
            : 'SET conversationCount = if_not_exists(conversationCount, :min) + :inc, lastUpdated = :now';

        try {
            await this.docClient.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { tenantId, period },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: {
                    ':inc': count,
                    ':min': 0,
                    ':now': new Date().toISOString()
                }
            }));
        } catch (error) {
            console.error('Error incrementing usage:', error);
            // Non-blocking error - we don't want to fail the actual message processing
        }
    }

    /**
     * Check if a tenant has exceeded their limits
     * Returns true if request is allowed, false if blocked
     */
    async checkLimit(tenantId: string, plan: string = 'starter'): Promise<{ allowed: boolean; reason?: string }> {
        const period = new Date().toISOString().substring(0, 7);
        const limitMap: Record<string, number> = {
            'starter': 1000,
            'pro': 5000,
            'enterprise': 1000000
        };

        const limit = limitMap[plan.toLowerCase()] || 1000;

        try {
            const result = await this.docClient.send(new GetCommand({
                TableName: this.tableName,
                Key: { tenantId, period }
            }));

            const usage = result.Item as any;
            const currentCount = usage?.messageCount || 0;

            if (currentCount >= limit) {
                return {
                    allowed: false,
                    reason: `Plan limit reached (${limit} messages/month). Please upgrade to continue.`
                };
            }

            return { allowed: true };

        } catch (error) {
            console.error('Error checking limits:', error);
            // Default to allow on error to prevent blocking users due to system issues
            return { allowed: true };
        }
    }

    async getUsage(tenantId: string, period: string): Promise<any> {
        try {
            const result = await this.docClient.send(new GetCommand({
                TableName: this.tableName,
                Key: { tenantId, period }
            }));
            return result.Item;
        } catch (error) {
            console.error('Error getting usage:', error);
            return null;
        }
    }
}

export const usageTracker = new UsageTrackerService(process.env.USAGE_METRICS_TABLE || 'ai-marketplace-usage-metrics');
