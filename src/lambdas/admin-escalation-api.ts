/**
 * Admin Escalation API Lambda
 * Provides admin endpoints for managing escalated conversations
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { escalationService } from '../services/escalation-service';
import { notificationService } from '../services/notification-service';
import { tenantResolver } from '../services/tenant-resolver';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Admin escalation API received event:', JSON.stringify(event, null, 2));

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight' })
      };
    }

    const path = event.path;
    const method = event.httpMethod;

    // Route requests
    if (path.includes('/escalations/reset') && method === 'POST') {
      return await handleResetConversation(event, corsHeaders);
    }

    if (path.includes('/escalations/status') && method === 'GET') {
      return await handleGetConversationStatus(event, corsHeaders);
    }

    if (path.includes('/escalations/list') && method === 'GET') {
      return await handleListEscalations(event, corsHeaders);
    }

    if (path.includes('/escalations/notify') && method === 'POST') {
      return await handleSendNotification(event, corsHeaders);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };

  } catch (error) {
    console.error('Admin escalation API error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Reset conversation to active status
 * POST /admin/escalations/reset
 */
async function handleResetConversation(
  event: APIGatewayProxyEvent, 
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Request body required' })
      };
    }

    const { tenantId, conversationId, adminId } = JSON.parse(event.body);

    if (!tenantId || !conversationId || !adminId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: tenantId, conversationId, adminId' 
        })
      };
    }

    // Verify tenant exists
    const tenantContext = await tenantResolver.createTenantContext(tenantId);
    if (!tenantContext) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Tenant not found' })
      };
    }

    // Reset conversation
    await escalationService.resetConversationToActive(tenantId, conversationId, adminId);

    // Send resolution notification
    const tenantConfig = await tenantResolver.getTenantConfig(tenantId);
    if (tenantConfig) {
      await notificationService.sendResolutionNotification(
        tenantId,
        conversationId,
        adminId,
        0, // Resolution time not tracked in this simple implementation
        tenantConfig
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        message: 'Conversation reset to active',
        conversationId,
        resetBy: adminId,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error resetting conversation:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to reset conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Get conversation escalation status
 * GET /admin/escalations/status?tenantId=xxx&conversationId=xxx
 */
async function handleGetConversationStatus(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = event.queryStringParameters?.tenantId;
    const conversationId = event.queryStringParameters?.conversationId;

    if (!tenantId || !conversationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required query parameters: tenantId, conversationId' 
        })
      };
    }

    const status = await escalationService.getConversationStatus(tenantId, conversationId);

    if (!status) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation not found' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        conversationId,
        tenantId,
        status,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error getting conversation status:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to get conversation status',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * List escalated conversations for a tenant
 * GET /admin/escalations/list?tenantId=xxx&limit=10
 */
async function handleListEscalations(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = event.queryStringParameters?.tenantId;
    const limit = parseInt(event.queryStringParameters?.limit || '10');

    if (!tenantId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required query parameter: tenantId' 
        })
      };
    }

    // This is a simplified implementation
    // In a real system, you'd query DynamoDB for escalated conversations
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        tenantId,
        escalations: [],
        limit,
        message: 'List escalations endpoint - implementation pending',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error listing escalations:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to list escalations',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Send manual notification
 * POST /admin/escalations/notify
 */
async function handleSendNotification(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Request body required' })
      };
    }

    const { tenantId, conversationId, message, priority } = JSON.parse(event.body);

    if (!tenantId || !conversationId || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: tenantId, conversationId, message' 
        })
      };
    }

    // Get tenant config
    const tenantConfig = await tenantResolver.getTenantConfig(tenantId);
    if (!tenantConfig) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Tenant not found' })
      };
    }

    // Send urgent alert
    const result = await notificationService.sendUrgentAlert(
      tenantId,
      conversationId,
      message,
      tenantConfig
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Notification sent',
        result,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error sending notification:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to send notification',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}