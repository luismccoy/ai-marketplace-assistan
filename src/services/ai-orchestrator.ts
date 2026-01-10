/**
 * AI Orchestrator Service
 * Main service that coordinates Bedrock, intent detection, and response generation
 */

import {
  BotResponse,
  ConversationContext,
  CustomerProfile,
  Product,
  IntentClassification,
  EscalationTrigger
} from '../types/conversation';
import { BedrockClientService } from './bedrock-client';
import { IntentDetectionService } from './intent-detection';
import { TenantConfig } from '../types/tenant';
import { ResponseGenerationService } from './response-generation';
import { snsService } from './sns-service';

export interface AIProcessingRequest {
  message: string;
  conversationContext?: ConversationContext;
  customerProfile?: CustomerProfile;
  availableProducts?: Product[];
  businessConfig?: TenantConfig['businessConfig'] & { businessName: string; ownerName: string };
}

export interface AIProcessingResult {
  response: BotResponse;
  intent: IntentClassification;
  escalationTriggers: EscalationTrigger[];
  processingMetadata: {
    processingTimeMs: number;
    servicesUsed: string[];
    confidenceScore: number;
    recommendedActions: string[];
    tokensUsed?: number;
  };
}

export class AIOrchestrator {
  private bedrockClient: BedrockClientService;
  private intentService: IntentDetectionService;
  private responseService: ResponseGenerationService;

  constructor() {
    this.bedrockClient = new BedrockClientService();
    this.intentService = new IntentDetectionService(this.bedrockClient);
    this.responseService = new ResponseGenerationService(
      this.bedrockClient,
      this.intentService
    );
  }

  /**
   * Process customer message through complete AI pipeline
   */
  async processMessage(request: AIProcessingRequest): Promise<AIProcessingResult> {
    const startTime = Date.now();
    const servicesUsed: string[] = [];

    try {
      // Step 1: Classify intent
      servicesUsed.push('intent-detection');
      const intent = await this.intentService.classifyIntent(
        request.message,
        request.conversationContext,
        request.customerProfile
      );

      // Step 2: Detect escalation triggers
      const escalationTriggers = await this.intentService.detectEscalationTriggers(
        request.message,
        intent,
        request.conversationContext
      );

      // Step 3: Calculate response confidence
      const responseConfidence = this.intentService.calculateResponseConfidence(
        intent,
        escalationTriggers,
        request.conversationContext
      );

      // Step 4: Generate response
      servicesUsed.push('response-generation');
      const response = await this.responseService.generateResponse({
        message: request.message,
        intent,
        escalationTriggers,
        conversationContext: request.conversationContext || this.createDefaultContext(request.customerProfile?.phoneNumber || 'unknown'),
        customerProfile: request.customerProfile || this.createDefaultProfile(),
        availableProducts: request.availableProducts || [],
        businessConfig: request.businessConfig
      });

      // Step 5: Add Bedrock processing if needed for complex responses
      if (intent.confidence < 0.7 && !response.shouldEscalate) {
        servicesUsed.push('bedrock-ai');
        const aiEnhancedResponse = await this.bedrockClient.generateResponse({
          message: request.message,
          conversationContext: request.conversationContext || this.createDefaultContext(request.customerProfile?.phoneNumber || 'unknown'),
          customerProfile: request.customerProfile || this.createDefaultProfile(),
          availableProducts: request.availableProducts || []
        });

        // Merge AI response with template-based response
        response.response = aiEnhancedResponse.response;
        response.confidence = Math.max(response.confidence, aiEnhancedResponse.confidence);
      }

      // Step 6: Handle Escalation Notification
      if (response.shouldEscalate || escalationTriggers.length > 0) {
        const reason = escalationTriggers.map(t => t.reason).join(', ') || 'Unknown Escalation';
        const messageContent = `Human interaction requested.
          
Customer: ${request.customerProfile?.phoneNumber || 'Unknown'}
Tenant: ${request.businessConfig?.businessName || 'Unknown'}
Reason: ${reason}
Last Intent: ${intent.intent}

Message: "${request.message}"`;

        console.log('Orchestrating escalation for:', reason);
        // Fire and forget notification
        snsService.publishNotification(messageContent, `Escalation Alert: ${request.businessConfig?.businessName || 'Marketplace Bot'}`)
          .catch(err => console.error('Failed to send escalation notification', err));
      }

      const processingTime = Date.now() - startTime;

      return {
        response,
        intent,
        escalationTriggers,
        processingMetadata: {
          processingTimeMs: processingTime,
          servicesUsed,
          confidenceScore: responseConfidence,
          recommendedActions: this.generateRecommendedActions(response, intent, escalationTriggers)
        }
      };
    } catch (error) {
      console.error('AI processing error:', error);

      // Return fallback response
      const processingTime = Date.now() - startTime;

      return {
        response: {
          response: 'Disculpa, tuve un problema técnico. Te conectaré con un asesor para ayudarte mejor.',
          intent: 'error',
          confidence: 0.1,
          shouldEscalate: true,
          updatedContext: {
            lastIntent: 'error',
            status: 'escalated'
          },
          suggestedActions: ['escalate_to_human']
        },
        intent: {
          intent: 'error',
          confidence: 0.1,
          entities: {}
        },
        escalationTriggers: [{
          type: 'manual_request',
          confidence: 1.0,
          reason: 'AI processing error',
          metadata: { error: (error as Error).message }
        }],
        processingMetadata: {
          processingTimeMs: processingTime,
          servicesUsed: ['error-handler'],
          confidenceScore: 0.1,
          recommendedActions: ['escalate_to_human', 'log_error']
        }
      };
    }
  }

  /**
   * Process typing indicators for better UX
   */
  async processTypingIndicators(request: AIProcessingRequest): Promise<{
    shouldShowTyping: boolean;
    estimatedResponseTime: number;
    typingMessage?: string;
  }> {
    // Quick intent classification to estimate response complexity
    const quickIntent = await this.intentService.classifyIntent(request.message);

    const isComplexQuery = quickIntent.confidence < 0.7 ||
      ['informacion', 'descuento', 'compra'].includes(quickIntent.intent);

    const estimatedTime = isComplexQuery ? 3000 : 1500; // 3s for complex, 1.5s for simple

    return {
      shouldShowTyping: true,
      estimatedResponseTime: estimatedTime,
      typingMessage: isComplexQuery ? 'Consultando información...' : undefined
    };
  }

  /**
   * Validate conversation context and update if needed
   */
  validateAndUpdateContext(
    context: ConversationContext,
    newMessage: string,
    response: BotResponse
  ): ConversationContext {
    return this.bedrockClient.updateConversationContext(context, newMessage, response);
  }

  /**
   * Get conversation summary for handoff
   */
  async generateConversationSummary(context: ConversationContext): Promise<string> {
    const messages = context.messages.slice(-10); // Last 10 messages
    const customerMessages = messages.filter(m => m.from === 'customer');
    const intents = [...new Set(messages.map(m => m.metadata?.intent).filter(Boolean))];

    const summary = `
Resumen de conversación:
- Cliente: ${context.customerId}
- Mensajes del cliente: ${customerMessages.length}
- Intenciones detectadas: ${intents.join(', ')}
- Productos consultados: ${context.productInquiries.join(', ') || 'ninguno'}
- Última intención: ${context.lastIntent}
- Estado: ${context.status}

Últimos mensajes:
${messages.slice(-5).map(m => `${m.from}: ${m.content}`).join('\n')}
    `.trim();

    return summary;
  }

  /**
   * Helper methods
   */
  private createDefaultContext(customerId: string): ConversationContext {
    return {
      customerId,
      status: 'active',
      lastIntent: 'new_conversation',
      productInquiries: [],
      messages: [],
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }

  private createDefaultProfile(): CustomerProfile {
    return {
      phoneNumber: 'unknown',
      preferredLanguage: 'es',
      inquiryHistory: [],
      leadScore: 0,
      totalConversations: 0,
      lastInteraction: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private generateRecommendedActions(
    response: BotResponse,
    intent: IntentClassification,
    escalationTriggers: EscalationTrigger[]
  ): string[] {
    const actions: string[] = [];

    // Add response-specific actions
    if (response.suggestedActions) {
      actions.push(...response.suggestedActions);
    }

    // Add intent-specific actions
    switch (intent.intent) {
      case 'compra':
        actions.push('collect_contact_info', 'prepare_purchase_flow');
        break;
      case 'precio':
        if (intent.confidence > 0.8) {
          actions.push('show_payment_options');
        }
        break;
      case 'disponibilidad':
        actions.push('update_inventory_check');
        break;
    }

    // Add escalation-specific actions
    if (escalationTriggers.length > 0) {
      actions.push('prepare_handoff_context', 'notify_human_agent');

      if (escalationTriggers.some(t => t.type === 'complaint')) {
        actions.push('escalate_to_supervisor', 'log_complaint');
      }
    }

    // Add confidence-based actions
    if (response.confidence < 0.5) {
      actions.push('request_clarification', 'offer_human_assistance');
    }

    return [...new Set(actions)]; // Remove duplicates
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();