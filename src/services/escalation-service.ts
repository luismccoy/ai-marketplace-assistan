/**
 * Escalation Service for Human Handoff System
 * Detects escalation triggers and manages conversation handoff to human agents
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { TenantConversationContext, TenantCustomerProfile, TenantConfig } from '../types/tenant';
import { EscalationTrigger, IntentClassification } from '../types/conversation';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ai-marketplace-conversations';
const ESCALATION_TOPIC_ARN = process.env.ESCALATION_TOPIC_ARN;

// Priority ranking system
const priorityRank = { low: 1, medium: 2, high: 3, urgent: 4 } as const;
type Priority = keyof typeof priorityRank;

function pickHigherPriority(a: Priority, b: Priority): Priority {
  return priorityRank[b] > priorityRank[a] ? b : a;
}

export interface EscalationConfig {
  confidenceThreshold: number;
  sentimentThreshold: number;
  keywordSensitivity: 'low' | 'medium' | 'high';
  autoEscalationEnabled: boolean;
  maxBotAttempts: number;
}

export interface EscalationResult {
  shouldEscalate: boolean;
  triggers: EscalationTrigger[];
  escalationReason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  suggestedAgent?: string;
  estimatedResolutionTime?: number;
}

export interface ConversationStatus {
  status: 'ACTIVE' | 'PASSED_TO_HUMAN' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  assignedAgent?: string;
  escalationTime?: string;
  escalationReason?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  botAttempts: number;
  lastBotResponse?: string;
  humanTakeoverTime?: string;
  resolutionTime?: string;
}

/**
 * Escalation Service - manages human handoff logic and conversation state
 */
export class EscalationService {
  private config: EscalationConfig;

  // Spanish escalation keywords by category
  private readonly escalationKeywords = {
    // Human request keywords
    human: [
      'humano', 'persona', 'asesor', 'vendedor', 'agente', 'operador',
      'hablar con alguien', 'persona real', 'no bot', 'no robot',
      'quiero hablar', 'necesito hablar', 'contactar', 'comunicar'
    ],
    
    // Complaint/negative sentiment keywords
    complaint: [
      'malo', 'terrible', 'pésimo', 'horrible', 'disgusto', 'molesto',
      'enojado', 'furioso', 'indignado', 'decepcionado', 'frustrado',
      'queja', 'reclamo', 'problema', 'inconveniente', 'dificultad',
      'no funciona', 'no sirve', 'defectuoso', 'dañado', 'roto'
    ],
    
    // Fake/bot detection keywords
    fake: [
      'falso', 'fake', 'mentira', 'engaño', 'estafa', 'fraude',
      'bot', 'robot', 'máquina', 'artificial', 'automático',
      'no real', 'no verdadero', 'simulado', 'fingido'
    ],
    
    // Manager/supervisor request keywords
    manager: [
      'jefe', 'supervisor', 'gerente', 'manager', 'encargado',
      'responsable', 'director', 'coordinador', 'administrador',
      'superior', 'autoridad', 'quien manda', 'el que decide'
    ],
    
    // Urgency keywords
    urgent: [
      'urgente', 'rápido', 'ya', 'ahora', 'inmediato', 'pronto',
      'emergency', 'emergencia', 'crítico', 'importante',
      'necesito ya', 'es urgente', 'no puede esperar'
    ],
    
    // Negotiation keywords
    negotiation: [
      'negociar', 'rebajar', 'descuento', 'mejor precio', 'oferta',
      'rebaja', 'promoción', 'deal', 'trato', 'acuerdo',
      'última palabra', 'precio final', 'no puedo pagar'
    ],
    
    // Complex technical keywords
    technical: [
      'garantía', 'warranty', 'instalación', 'configuración',
      'soporte técnico', 'manual', 'instrucciones', 'tutorial',
      'cómo usar', 'no entiendo', 'no funciona', 'error'
    ]
  };

  // Negative sentiment patterns
  private readonly negativeSentimentPatterns = [
    /no me gusta/gi,
    /está mal/gi,
    /muy malo/gi,
    /pésimo servicio/gi,
    /no recomiendo/gi,
    /perdí (el )?tiempo/gi,
    /no vale la pena/gi,
    /muy caro/gi,
    /estafa/gi,
    /fraude/gi
  ];

  constructor(config?: Partial<EscalationConfig>) {
    this.config = {
      confidenceThreshold: config?.confidenceThreshold || 0.3,
      sentimentThreshold: config?.sentimentThreshold || -0.5,
      keywordSensitivity: config?.keywordSensitivity || 'medium',
      autoEscalationEnabled: config?.autoEscalationEnabled ?? true,
      maxBotAttempts: config?.maxBotAttempts || 3
    };
  }

  /**
   * Analyze message for escalation triggers
   */
  async analyzeEscalationTriggers(
    message: string,
    intent: IntentClassification,
    conversationContext: TenantConversationContext,
    customerProfile: TenantCustomerProfile
  ): Promise<EscalationResult> {
    const triggers: EscalationTrigger[] = [];
    let priority: Priority = 'low';
    
    // 1. Check confidence threshold
    if (intent.confidence < this.config.confidenceThreshold) {
      triggers.push({
        type: 'low_confidence',
        confidence: intent.confidence,
        reason: `Baja confianza en la respuesta del bot: ${(intent.confidence * 100).toFixed(1)}%`,
        metadata: { 
          originalIntent: intent.intent,
          threshold: this.config.confidenceThreshold
        }
      });
      priority = pickHigherPriority(priority, 'medium');
    }

    // 2. Check for explicit human requests
    const humanTrigger = this.detectHumanRequest(message);
    if (humanTrigger) {
      triggers.push(humanTrigger);
      priority = pickHigherPriority(priority, 'high');
    }

    // 3. Check for complaints and negative sentiment
    const complaintTrigger = this.detectComplaint(message);
    if (complaintTrigger) {
      triggers.push(complaintTrigger);
      priority = pickHigherPriority(priority, 'high');
    }

    // 4. Check for fake/bot detection
    const fakeTrigger = this.detectFakeAccusation(message);
    if (fakeTrigger) {
      triggers.push(fakeTrigger);
      priority = pickHigherPriority(priority, 'high');
    }

    // 5. Check for manager/supervisor requests
    const managerTrigger = this.detectManagerRequest(message);
    if (managerTrigger) {
      triggers.push(managerTrigger);
      priority = pickHigherPriority(priority, 'urgent');
    }

    // 6. Check for urgency indicators
    const urgencyTrigger = this.detectUrgency(message);
    if (urgencyTrigger) {
      triggers.push(urgencyTrigger);
      priority = pickHigherPriority(priority, 'urgent');
    }

    // 7. Check for price negotiation
    const negotiationTrigger = this.detectNegotiation(message);
    if (negotiationTrigger) {
      triggers.push(negotiationTrigger);
      priority = pickHigherPriority(priority, 'medium');
    }

    // 8. Check for technical complexity
    const technicalTrigger = this.detectTechnicalComplexity(message);
    if (technicalTrigger) {
      triggers.push(technicalTrigger);
      priority = pickHigherPriority(priority, 'medium');
    }

    // 9. Check conversation history for repeated issues
    const historyTrigger = this.analyzeConversationHistory(conversationContext, customerProfile);
    if (historyTrigger) {
      triggers.push(historyTrigger);
      priority = pickHigherPriority(priority, 'medium');
    }

    // Determine if escalation should occur
    const shouldEscalate = this.config.autoEscalationEnabled && triggers.length > 0;
    
    // Generate escalation reason
    const escalationReason = this.generateEscalationReason(triggers);
    
    // Suggest appropriate agent based on triggers
    const suggestedAgent = this.suggestAgent(triggers);
    
    // Estimate resolution time
    const estimatedResolutionTime = this.estimateResolutionTime(triggers, priority);

    return {
      shouldEscalate,
      triggers,
      escalationReason,
      priority,
      suggestedAgent,
      estimatedResolutionTime
    };
  }

  /**
   * Update conversation status to escalated
   */
  async escalateConversation(
    tenantId: string,
    conversationId: string,
    escalationResult: EscalationResult,
    tenantConfig: TenantConfig
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // Update conversation status in DynamoDB
      const updateCommand = new UpdateCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { 
          tenantId,
          conversationId 
        },
        UpdateExpression: `
          SET #status = :status,
              escalationTime = :escalationTime,
              escalationReason = :escalationReason,
              priority = :priority,
              updatedAt = :updatedAt
        `,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'PASSED_TO_HUMAN',
          ':escalationTime': now,
          ':escalationReason': escalationResult.escalationReason,
          ':priority': escalationResult.priority,
          ':updatedAt': now
        }
      });

      await docClient.send(updateCommand);

      // Send escalation notification
      await this.sendEscalationNotification(
        tenantId,
        conversationId,
        escalationResult,
        tenantConfig
      );

      console.log(`Conversation ${conversationId} escalated for tenant ${tenantId}`, {
        reason: escalationResult.escalationReason,
        priority: escalationResult.priority,
        triggers: escalationResult.triggers.length
      });
    } catch (error) {
      console.error('Error escalating conversation:', error);
      throw new Error(`Failed to escalate conversation: ${(error as Error).message}`);
    }
  }

  /**
   * Check if conversation is currently escalated
   */
  async isConversationEscalated(tenantId: string, conversationId: string): Promise<boolean> {
    try {
      const getCommand = new GetCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { tenantId, conversationId }
      });

      const result = await docClient.send(getCommand);
      const conversation = result.Item;

      return conversation?.status === 'PASSED_TO_HUMAN' || conversation?.status === 'ESCALATED';
    } catch (error) {
      console.error('Error checking conversation escalation status:', error);
      return false;
    }
  }

  /**
   * Reset conversation to active (admin function)
   */
  async resetConversationToActive(
    tenantId: string,
    conversationId: string,
    adminId: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      const updateCommand = new UpdateCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { tenantId, conversationId },
        UpdateExpression: `
          SET #status = :status,
              resolutionTime = :resolutionTime,
              resolvedBy = :resolvedBy,
              updatedAt = :updatedAt
        `,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'ACTIVE',
          ':resolutionTime': now,
          ':resolvedBy': adminId,
          ':updatedAt': now
        }
      });

      await docClient.send(updateCommand);
      
      console.log(`Conversation ${conversationId} reset to active by admin ${adminId}`);
    } catch (error) {
      console.error('Error resetting conversation:', error);
      throw new Error(`Failed to reset conversation: ${(error as Error).message}`);
    }
  }

  /**
   * Get conversation status
   */
  async getConversationStatus(tenantId: string, conversationId: string): Promise<ConversationStatus | null> {
    try {
      const getCommand = new GetCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { tenantId, conversationId }
      });

      const result = await docClient.send(getCommand);
      const conversation = result.Item;

      if (!conversation) {
        return null;
      }

      return {
        status: conversation.status || 'ACTIVE',
        assignedAgent: conversation.assignedAgent,
        escalationTime: conversation.escalationTime,
        escalationReason: conversation.escalationReason,
        priority: conversation.priority,
        botAttempts: conversation.botAttempts || 0,
        lastBotResponse: conversation.lastBotResponse,
        humanTakeoverTime: conversation.humanTakeoverTime,
        resolutionTime: conversation.resolutionTime
      };
    } catch (error) {
      console.error('Error getting conversation status:', error);
      return null;
    }
  }

  /**
   * Private helper methods
   */
  private detectHumanRequest(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.human) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'manual_request',
          confidence: 0.9,
          reason: `Cliente solicita hablar con una persona: "${keyword}"`,
          metadata: { keyword, category: 'human_request' }
        };
      }
    }
    
    return null;
  }

  private detectComplaint(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    // Check complaint keywords
    for (const keyword of this.escalationKeywords.complaint) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'complaint',
          confidence: 0.8,
          reason: `Posible queja detectada: "${keyword}"`,
          metadata: { keyword, category: 'complaint' }
        };
      }
    }
    
    // Check negative sentiment patterns
    for (const pattern of this.negativeSentimentPatterns) {
      if (pattern.test(message)) {
        return {
          type: 'complaint',
          confidence: 0.7,
          reason: `Sentimiento negativo detectado en el mensaje`,
          metadata: { pattern: pattern.source, category: 'negative_sentiment' }
        };
      }
    }
    
    return null;
  }

  private detectFakeAccusation(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.fake) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'complaint',
          confidence: 0.85,
          reason: `Cliente cuestiona la autenticidad del servicio: "${keyword}"`,
          metadata: { keyword, category: 'fake_accusation' }
        };
      }
    }
    
    return null;
  }

  private detectManagerRequest(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.manager) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'manual_request',
          confidence: 0.95,
          reason: `Cliente solicita hablar con supervisor/gerente: "${keyword}"`,
          metadata: { keyword, category: 'manager_request', priority: 'urgent' }
        };
      }
    }
    
    return null;
  }

  private detectUrgency(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.urgent) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'manual_request',
          confidence: 0.8,
          reason: `Solicitud urgente detectada: "${keyword}"`,
          metadata: { keyword, category: 'urgency', priority: 'urgent' }
        };
      }
    }
    
    return null;
  }

  private detectNegotiation(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.negotiation) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'price_negotiation',
          confidence: 0.75,
          reason: `Intento de negociación de precio detectado: "${keyword}"`,
          metadata: { keyword, category: 'price_negotiation' }
        };
      }
    }
    
    return null;
  }

  private detectTechnicalComplexity(message: string): EscalationTrigger | null {
    const normalizedMessage = message.toLowerCase();
    
    for (const keyword of this.escalationKeywords.technical) {
      if (normalizedMessage.includes(keyword)) {
        return {
          type: 'complex_query',
          confidence: 0.7,
          reason: `Consulta técnica compleja detectada: "${keyword}"`,
          metadata: { keyword, category: 'technical_support' }
        };
      }
    }
    
    return null;
  }

  private analyzeConversationHistory(
    conversationContext: TenantConversationContext,
    customerProfile: TenantCustomerProfile
  ): EscalationTrigger | null {
    // Check for repeated bot failures
    const botMessages = conversationContext.messages.filter(m => m.from === 'bot');
    const recentBotMessages = botMessages.slice(-3);
    
    if (recentBotMessages.length >= 3) {
      const lowConfidenceCount = recentBotMessages.filter(m => 
        m.metadata?.confidence && m.metadata.confidence < 0.5
      ).length;
      
      if (lowConfidenceCount >= 2) {
        return {
          type: 'low_confidence',
          confidence: 0.8,
          reason: 'Múltiples respuestas de baja confianza del bot en la conversación',
          metadata: { 
            lowConfidenceCount,
            totalBotMessages: recentBotMessages.length,
            category: 'repeated_failures'
          }
        };
      }
    }
    
    // Check customer frustration indicators
    const customerMessages = conversationContext.messages.filter(m => m.from === 'customer');
    const recentCustomerMessages = customerMessages.slice(-5);
    
    if (recentCustomerMessages.length >= 3) {
      const frustrationIndicators = recentCustomerMessages.filter(m =>
        m.content.toLowerCase().includes('no entiendo') ||
        m.content.toLowerCase().includes('no funciona') ||
        m.content.toLowerCase().includes('ayuda') ||
        m.content.toLowerCase().includes('problema')
      ).length;
      
      if (frustrationIndicators >= 2) {
        return {
          type: 'complex_query',
          confidence: 0.75,
          reason: 'Indicadores de frustración del cliente detectados',
          metadata: { 
            frustrationIndicators,
            category: 'customer_frustration'
          }
        };
      }
    }
    
    return null;
  }

  private generateEscalationReason(triggers: EscalationTrigger[]): string {
    if (triggers.length === 0) {
      return 'Escalación automática';
    }
    
    const reasons = triggers.map(t => t.reason);
    return reasons.join('; ');
  }

  private suggestAgent(triggers: EscalationTrigger[]): string | undefined {
    // Suggest agent type based on trigger types
    const triggerTypes = triggers.map(t => t.type);
    
    if (triggerTypes.includes('price_negotiation')) {
      return 'sales_agent';
    }
    
    if (triggerTypes.includes('complaint')) {
      return 'customer_service_supervisor';
    }
    
    if (triggers.some(t => t.metadata?.category === 'technical_support')) {
      return 'technical_support';
    }
    
    if (triggers.some(t => t.metadata?.priority === 'urgent')) {
      return 'senior_agent';
    }
    
    return 'general_agent';
  }

  private estimateResolutionTime(triggers: EscalationTrigger[], priority: string): number {
    // Estimate resolution time in minutes based on complexity and priority
    let baseTime = 15; // 15 minutes base
    
    // Adjust based on priority
    switch (priority) {
      case 'urgent':
        baseTime = 5;
        break;
      case 'high':
        baseTime = 10;
        break;
      case 'medium':
        baseTime = 15;
        break;
      case 'low':
        baseTime = 30;
        break;
    }
    
    // Adjust based on trigger complexity
    const complexTriggers = triggers.filter(t => 
      t.type === 'complex_query' || 
      t.type === 'price_negotiation' ||
      t.metadata?.category === 'technical_support'
    );
    
    baseTime += complexTriggers.length * 10;
    
    return Math.min(baseTime, 120); // Max 2 hours
  }

  private async sendEscalationNotification(
    tenantId: string,
    conversationId: string,
    escalationResult: EscalationResult,
    tenantConfig: TenantConfig
  ): Promise<void> {
    if (!ESCALATION_TOPIC_ARN) {
      console.warn('ESCALATION_TOPIC_ARN not configured, skipping notification');
      return;
    }

    try {
      const message = {
        tenantId,
        businessName: tenantConfig.businessName,
        conversationId,
        escalationReason: escalationResult.escalationReason,
        priority: escalationResult.priority,
        suggestedAgent: escalationResult.suggestedAgent,
        estimatedResolutionTime: escalationResult.estimatedResolutionTime,
        triggers: escalationResult.triggers.map(t => ({
          type: t.type,
          reason: t.reason,
          confidence: t.confidence
        })),
        timestamp: new Date().toISOString(),
        escalationContacts: {
          email: tenantConfig.integrations?.notifications?.escalationEmail,
          whatsapp: tenantConfig.integrations?.notifications?.escalationWhatsApp
        }
      };

      const publishCommand = new PublishCommand({
        TopicArn: ESCALATION_TOPIC_ARN,
        Subject: `🚨 Escalación ${escalationResult.priority.toUpperCase()} - ${tenantConfig.businessName}`,
        Message: JSON.stringify(message, null, 2)
      });

      await snsClient.send(publishCommand);
      
      console.log('Escalation notification sent successfully', {
        tenantId,
        conversationId,
        priority: escalationResult.priority
      });
    } catch (error) {
      console.error('Error sending escalation notification:', error);
      // Don't throw error - escalation should still work even if notification fails
    }
  }
}

// Export singleton instance
export const escalationService = new EscalationService();