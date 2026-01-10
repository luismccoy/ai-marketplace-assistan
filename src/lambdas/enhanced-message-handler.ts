/**
 * Enhanced Message Handler Lambda
 * Processes WhatsApp messages using AWS Bedrock AI integration
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { aiOrchestrator } from '../services/ai-orchestrator';
import { escalationService } from '../services/escalation-service';
import { notificationService } from '../services/notification-service';
import { ConversationContext, CustomerProfile, Product } from '../types/conversation';
import { 
  TenantConversationContext, 
  TenantCustomerProfile, 
  TenantProduct,
  TenantContext 
} from '../types/tenant';
import { tenantResolver } from '../services/tenant-resolver';
import { tenantDataAccess } from '../services/tenant-data-access';
import { tenantUsageTracker } from '../services/tenant-usage-tracker';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ai-marketplace-conversations';
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'ai-marketplace-products';
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE || 'ai-marketplace-customers';
const ESCALATION_TOPIC_ARN = process.env.ESCALATION_TOPIC_ARN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'document';
  text?: { body: string };
  context?: { id: string };
}

interface WhatsAppWebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        messages?: WhatsAppMessage[];
        statuses?: any[];
      };
    }>;
  }>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Enhanced message handler received event:', JSON.stringify(event, null, 2));

  try {
    // Handle webhook verification
    if (event.httpMethod === 'GET') {
      return handleWebhookVerification(event);
    }

    // Handle incoming messages
    if (event.httpMethod === 'POST') {
      return await handleIncomingMessage(event);
    }

    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Message handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};

/**
 * Handle WhatsApp webhook verification
 */
function handleWebhookVerification(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  const mode = event.queryStringParameters?.['hub.mode'];
  const token = event.queryStringParameters?.['hub.verify_token'];
  const challenge = event.queryStringParameters?.['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'ai-marketplace-verify-token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: challenge || '',
    };
  }

  console.log('Webhook verification failed');
  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ error: 'Forbidden' }),
  };
}

/**
 * Handle incoming WhatsApp messages
 */
async function handleIncomingMessage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No body provided' }),
    };
  }

  const webhookData: WhatsAppWebhookEvent = JSON.parse(event.body);
  
  // Process each entry and change
  for (const entry of webhookData.entry) {
    for (const change of entry.changes) {
      if (change.value.messages) {
        for (const message of change.value.messages) {
          await processMessage(message);
        }
      }
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'Messages processed successfully' }),
  };
}

/**
 * Process individual WhatsApp message with tenant resolution and escalation checking
 */
async function processMessage(message: WhatsAppMessage): Promise<void> {
  try {
    console.log('Processing message:', JSON.stringify(message, null, 2));

    // Only process text messages for now
    if (message.type !== 'text' || !message.text?.body) {
      console.log('Skipping non-text message');
      return;
    }

    const customerPhone = message.from;
    const messageText = message.text.body;
    const messageId = message.id;

    // STEP 1: Resolve tenant from WhatsApp number
    const tenantResolution = await tenantResolver.resolveTenantFromWhatsApp(customerPhone);
    if (!tenantResolution.isValid) {
      console.error('Failed to resolve tenant:', tenantResolution.errorMessage);
      await sendWhatsAppMessage(
        customerPhone,
        'Lo siento, no puedo procesar tu mensaje en este momento. Por favor contacta a soporte.'
      );
      return;
    }

    const { tenantId, tenantConfig } = tenantResolution;
    console.log(`Processing message for tenant: ${tenantId}`);

    // STEP 2: Check if conversation is already escalated (CRITICAL FOR WHATSAPP COMPATIBILITY)
    const conversationId = tenantDataAccess.createTenantConversationId(tenantId, customerPhone);
    const isEscalated = await escalationService.isConversationEscalated(tenantId, conversationId);
    
    if (isEscalated) {
      console.log(`Conversation ${conversationId} is escalated, ignoring bot processing`);
      
      // Send a brief acknowledgment but don't process with AI
      await sendWhatsAppMessage(
        customerPhone,
        'Tu conversación está siendo atendida por un asesor. Te responderá pronto.'
      );
      
      // Log the message for the human agent but don't process it
      const conversationContext = await getOrCreateTenantConversationContext(tenantId, customerPhone, messageId);
      conversationContext.messages.push({
        tenantId,
        id: messageId,
        conversationId,
        from: 'customer',
        content: messageText,
        timestamp: new Date().toISOString(),
        type: 'text',
        metadata: { escalated: true, ignoredByBot: true }
      });
      
      await tenantDataAccess.saveConversation(conversationContext);
      return;
    }

    // STEP 3: Check tenant limits before processing
    const canProcessMessage = await tenantUsageTracker.trackMessage(tenantId);
    if (!canProcessMessage) {
      console.warn(`Tenant ${tenantId} has exceeded message limits`);
      await sendWhatsAppMessage(
        customerPhone,
        'Has alcanzado el límite de mensajes para este período. Por favor contacta a tu administrador.'
      );
      return;
    }

    // STEP 4: Create tenant context
    const tenantContext = await tenantResolver.createTenantContext(tenantId);
    if (!tenantContext) {
      console.error('Failed to create tenant context');
      return;
    }

    // Show typing indicator
    await sendTypingIndicator(customerPhone);

    // STEP 5: Get or create customer profile with tenant isolation
    const customerProfile = await getOrCreateTenantCustomerProfile(tenantId, customerPhone);
    
    // STEP 6: Get or create conversation context with tenant isolation
    const conversationContext = await getOrCreateTenantConversationContext(tenantId, customerPhone, messageId);
    
    // STEP 7: Get available products for this tenant
    const availableProducts = await getTenantAvailableProducts(tenantId);
    
    // STEP 8: Process message through AI pipeline with tenant context
    const aiResult = await aiOrchestrator.processMessage({
      message: messageText,
      conversationContext: conversationContext as any, // Type compatibility
      customerProfile: customerProfile as any, // Type compatibility
      availableProducts: availableProducts as any, // Type compatibility
      businessConfig: {
        businessName: tenantContext.businessName || 'AI Marketplace',
        ownerName: tenantContext.businessConfig?.communicationStyle?.greetingStyle || 'Asesor Virtual',
        ...tenantContext.businessConfig
      }
    });

    console.log('AI processing result:', JSON.stringify(aiResult, null, 2));

    // STEP 9: Check for escalation triggers BEFORE responding
    const escalationResult = await escalationService.analyzeEscalationTriggers(
      messageText,
      aiResult.intent,
      conversationContext,
      customerProfile
    );

    console.log('Escalation analysis result:', JSON.stringify(escalationResult, null, 2));

    // STEP 10: Update conversation context with tenant isolation
    const updatedContext = aiOrchestrator.validateAndUpdateContext(
      conversationContext as any,
      messageText,
      aiResult.response
    );

    // Add tenant information to updated context
    const tenantUpdatedContext: TenantConversationContext = {
      ...updatedContext,
      tenantId,
      conversationId: tenantDataAccess.createTenantConversationId(tenantId, customerPhone),
      messages: updatedContext.messages.map(msg => ({
        ...msg,
        tenantId,
        conversationId: tenantDataAccess.createTenantConversationId(tenantId, customerPhone)
      }))
    };

    // STEP 11: Handle escalation if needed
    if (escalationResult.shouldEscalate || aiResult.response.shouldEscalate) {
      console.log('Escalation triggered, handling handoff...');
      
      // Escalate the conversation
      await escalationService.escalateConversation(
        tenantId,
        conversationId,
        escalationResult,
        tenantConfig
      );

      // Generate conversation summary for handoff
      const conversationSummary = await aiOrchestrator.generateConversationSummary(conversationContext as any);

      // Send escalation notifications
      await notificationService.sendEscalationNotification(
        tenantId,
        conversationId,
        customerPhone,
        escalationResult,
        tenantConfig,
        conversationSummary
      );

      // Send escalation message to customer
      const escalationMessage = aiResult.response.response || 
        'Te voy a conectar con uno de nuestros asesores para ayudarte mejor. Un momento por favor... 😊';

      await sendWhatsAppMessage(customerPhone, escalationMessage);

      // Update conversation status to escalated
      tenantUpdatedContext.status = 'escalated';
      tenantUpdatedContext.escalationReason = escalationResult.escalationReason;
    } else {
      // Send AI response to customer (normal flow)
      await sendWhatsAppMessage(customerPhone, aiResult.response.response);
    }

    // STEP 12: Save updated conversation with tenant isolation
    await tenantDataAccess.saveConversation(tenantUpdatedContext);

    // STEP 13: Update customer profile with tenant isolation
    await updateTenantCustomerProfile(tenantId, customerProfile, aiResult.intent.intent);

    // STEP 14: Update tenant usage tracking
    if (aiResult.processingMetadata?.tokensUsed) {
      await tenantUsageTracker.trackTokens(tenantId, aiResult.processingMetadata.tokensUsed);
    }

    // Log processing metrics with tenant information
    const usageWarnings = await tenantUsageTracker.checkWarningThresholds(tenantId);
    console.log(`Message processed for tenant ${tenantId} in ${aiResult.processingMetadata?.processingTimeMs || 0}ms`, {
      tenantId,
      intent: aiResult.intent.intent,
      confidence: aiResult.intent.confidence,
      escalated: escalationResult.shouldEscalate || aiResult.response.shouldEscalate,
      escalationTriggers: escalationResult.triggers.length,
      servicesUsed: aiResult.processingMetadata.servicesUsed,
      usageWarnings
    });

  } catch (error) {
    console.error('Error processing message:', error);
    
    // Send fallback message
    try {
      await sendWhatsAppMessage(
        message.from,
        'Disculpa, tuve un problema técnico. Te conectaré con un asesor para ayudarte mejor.'
      );
      
      // Try to escalate due to error if we have tenant info
      try {
        const tenantResolution = await tenantResolver.resolveTenantFromWhatsApp(message.from);
        if (tenantResolution.isValid) {
          const conversationId = tenantDataAccess.createTenantConversationId(tenantResolution.tenantId, message.from);
          
          // Create emergency escalation
          const emergencyEscalation = {
            shouldEscalate: true,
            triggers: [{
              type: 'manual_request' as const,
              confidence: 1.0,
              reason: 'Error técnico en procesamiento de mensaje',
              metadata: { error: (error as Error).message, emergency: true }
            }],
            escalationReason: 'Error técnico en procesamiento de mensaje',
            priority: 'high' as const
          };

          await escalationService.escalateConversation(
            tenantResolution.tenantId,
            conversationId,
            emergencyEscalation,
            tenantResolution.tenantConfig
          );

          await notificationService.sendUrgentAlert(
            tenantResolution.tenantId,
            conversationId,
            `Error técnico: ${(error as Error).message}`,
            tenantResolution.tenantConfig
          );
        }
      } catch (escalationError) {
        console.error('Error during error escalation:', escalationError);
      }
    } catch (fallbackError) {
      console.error('Error sending fallback message:', fallbackError);
    }
  }
}

/**
 * Get or create tenant customer profile
 */
async function getOrCreateTenantCustomerProfile(tenantId: string, phoneNumber: string): Promise<TenantCustomerProfile> {
  try {
    let profile = await tenantDataAccess.getCustomerProfile(tenantId, phoneNumber);

    if (!profile) {
      // Create new tenant customer profile
      profile = {
        tenantId,
        phoneNumber,
        preferredLanguage: 'es',
        inquiryHistory: [],
        leadScore: 0,
        totalConversations: 0,
        lastInteraction: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await tenantDataAccess.saveCustomerProfile(profile);
    }

    return profile;
  } catch (error) {
    console.error('Error getting tenant customer profile:', error);
    
    // Return default profile with tenant ID
    return {
      tenantId,
      phoneNumber,
      preferredLanguage: 'es',
      inquiryHistory: [],
      leadScore: 0,
      totalConversations: 0,
      lastInteraction: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

/**
 * Get or create tenant conversation context
 */
async function getOrCreateTenantConversationContext(
  tenantId: string, 
  phoneNumber: string, 
  messageId: string
): Promise<TenantConversationContext> {
  const conversationId = tenantDataAccess.createTenantConversationId(tenantId, phoneNumber);
  
  try {
    let context = await tenantDataAccess.getConversation(tenantId, conversationId);

    if (!context) {
      // Create new tenant conversation
      context = {
        tenantId,
        conversationId,
        customerId: phoneNumber,
        status: 'active',
        lastIntent: 'new_conversation',
        productInquiries: [],
        messages: [],
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      };

      // Track new conversation
      await tenantUsageTracker.trackConversation(tenantId);
    }

    return context;
  } catch (error) {
    console.error('Error getting tenant conversation context:', error);
    
    // Return default context with tenant ID
    return {
      tenantId,
      conversationId,
      customerId: phoneNumber,
      status: 'active',
      lastIntent: 'new_conversation',
      productInquiries: [],
      messages: [],
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }
}

/**
 * Get available products for tenant
 */
async function getTenantAvailableProducts(tenantId: string): Promise<TenantProduct[]> {
  try {
    return await tenantDataAccess.getTenantProducts(tenantId, 'available', 50);
  } catch (error) {
    console.error('Error getting tenant products:', error);
    return [];
  }
}

/**
 * Update tenant customer profile
 */
async function updateTenantCustomerProfile(
  tenantId: string,
  profile: TenantCustomerProfile, 
  newIntent: string
): Promise<void> {
  try {
    const updatedHistory = [...profile.inquiryHistory, newIntent].slice(-10); // Keep last 10 intents
    
    const updatedProfile: TenantCustomerProfile = {
      ...profile,
      inquiryHistory: updatedHistory,
      totalConversations: profile.totalConversations + 1,
      lastInteraction: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await tenantDataAccess.saveCustomerProfile(updatedProfile);
  } catch (error) {
    console.error('Error updating tenant customer profile:', error);
  }
}

/**
 * Handle tenant escalation
 */
async function handleTenantEscalation(
  tenantId: string,
  phoneNumber: string, 
  context: TenantConversationContext, 
  aiResult: any,
  tenantConfig: any
): Promise<void> {
  try {
    // Generate conversation summary
    const summary = await aiOrchestrator.generateConversationSummary(context as any);
    
    // Send escalation notification with tenant context
    if (ESCALATION_TOPIC_ARN) {
      await snsClient.send(new PublishCommand({
        TopicArn: ESCALATION_TOPIC_ARN,
        Subject: `Nueva escalación - ${tenantConfig.businessName}`,
        Message: JSON.stringify({
          tenantId,
          businessName: tenantConfig.businessName,
          phoneNumber,
          escalationReason: aiResult.response.metadata?.escalationReason || 'Escalación automática',
          priority: aiResult.response.metadata?.priority || 'normal',
          conversationSummary: summary,
          timestamp: new Date().toISOString(),
          // Include tenant-specific escalation contacts
          escalationContacts: {
            email: tenantConfig.integrations?.notifications?.escalationEmail,
            whatsapp: tenantConfig.integrations?.notifications?.escalationWhatsApp
          }
        }, null, 2)
      }));
    }

    // Send escalation message to customer using tenant's communication style
    const escalationMessage = aiResult.response.response || 
      tenantConfig.businessConfig?.communicationStyle?.escalationMessage ||
      'Te voy a conectar con uno de nuestros asesores para ayudarte mejor. Un momento por favor.';

    await sendWhatsAppMessage(phoneNumber, escalationMessage);

    console.log('Tenant escalation handled successfully:', { tenantId, phoneNumber });
  } catch (error) {
    console.error('Error handling tenant escalation:', error);
  }
}

/**
 * Get business configuration from tenant context (legacy compatibility)
 */
function getBusinessConfig(): any {
  // This is now handled by tenant resolution, but keeping for backward compatibility
  return {
    businessName: 'AI Marketplace',
    ownerName: 'Asesor Virtual',
    communicationStyle: {
      tone: 'friendly',
      useEmojis: true,
      typicalPhrases: ['¡Perfecto!', '¡Claro que sí!', '¡Excelente!'],
      greetingStyle: '¡Hola! ¿En qué te puedo ayudar?',
      closingStyle: '¡Que tengas buen día!'
    },
    shippingInfo: {
      available: true,
      zones: ['bogotá', 'medellín', 'cali'],
      costs: { 'bogotá': 15000, 'medellín': 20000, 'cali': 25000 },
      estimatedDays: 3
    },
    discountPolicy: {
      allowNegotiation: true,
      maxDiscountPercent: 15,
      bulkDiscounts: true
    }
  };
}

/**
 * Escalate to human due to error
 */
async function escalateToHuman(phoneNumber: string, reason: string): Promise<void> {
  try {
    if (ESCALATION_TOPIC_ARN) {
      await snsClient.send(new PublishCommand({
        TopicArn: ESCALATION_TOPIC_ARN,
        Subject: 'Escalación por error - AI Marketplace Assistant',
        Message: JSON.stringify({
          phoneNumber,
          escalationReason: reason,
          priority: 'high',
          timestamp: new Date().toISOString()
        }, null, 2)
      }));
    }
  } catch (error) {
    console.error('Error escalating to human:', error);
  }
}

/**
 * Send typing indicator
 */
async function sendTypingIndicator(phoneNumber: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log('WhatsApp credentials not configured, skipping typing indicator');
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'reaction',
        reaction: {
          message_id: 'typing_on'
        }
      }),
    });

    if (!response.ok) {
      console.error('Failed to send typing indicator:', await response.text());
    }
  } catch (error) {
    console.error('Error sending typing indicator:', error);
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log('WhatsApp credentials not configured, message would be:', message);
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send WhatsApp message:', errorText);
      throw new Error(`WhatsApp API error: ${errorText}`);
    }

    const result = await response.json();
    console.log('WhatsApp message sent successfully:', result);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}