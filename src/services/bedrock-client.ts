/**
 * AWS Bedrock Client Service for AI Marketplace Assistant
 * Handles Claude 3 integration for Spanish conversation processing
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ConversationContext, BotResponse, CustomerProfile } from '../types/conversation';

export interface BedrockConfig {
  region: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
}

export interface BedrockRequest {
  message: string;
  conversationContext: ConversationContext;
  customerProfile: CustomerProfile;
  availableProducts?: any[];
}

export class BedrockClientService {
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;

  constructor(config: Partial<BedrockConfig> = {}) {
    this.config = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      modelId: config.modelId || 'anthropic.claude-3-haiku-20240307-v1:0',
      maxTokens: config.maxTokens || 2000,
      temperature: config.temperature || 0.7,
    };

    this.client = new BedrockRuntimeClient({
      region: this.config.region,
    });
  }

  /**
   * Generate AI response using Claude 3 for Spanish conversations
   */
  async generateResponse(request: BedrockRequest): Promise<BotResponse> {
    try {
      const prompt = this.buildSpanishPrompt(request);
      
      const command = new InvokeModelCommand({
        modelId: this.config.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      const aiResponse = responseBody.content[0].text;
      
      // Parse the structured response
      const parsedResponse = this.parseAIResponse(aiResponse);
      
      return {
        response: parsedResponse.message,
        intent: parsedResponse.intent,
        confidence: parsedResponse.confidence,
        shouldEscalate: parsedResponse.shouldEscalate,
        updatedContext: {
          ...request.conversationContext,
          lastIntent: parsedResponse.intent,
          lastResponse: parsedResponse.message,
          lastUpdate: new Date().toISOString()
        },
        suggestedActions: parsedResponse.suggestedActions
      };
    } catch (error) {
      console.error('Bedrock API error:', error);
      
      // Return fallback response for common Spanish questions
      return this.getFallbackResponse(request.message);
    }
  }

  /**
   * Build Spanish-optimized prompt for Claude 3
   */
  private buildSpanishPrompt(request: BedrockRequest): string {
    const { message, conversationContext, customerProfile, availableProducts } = request;
    
    const systemPrompt = `Eres un asistente de ventas experto en español para un marketplace. Tu trabajo es ayudar a los clientes con sus consultas sobre productos de manera natural y auténtica.

CONTEXTO DEL CLIENTE:
- Nombre: ${customerProfile.name || 'Cliente'}
- Idioma preferido: ${customerProfile.preferredLanguage || 'español'}
- Historial de consultas: ${customerProfile.inquiryHistory?.join(', ') || 'Primera consulta'}
- Puntuación de lead: ${customerProfile.leadScore || 0}

CONTEXTO DE LA CONVERSACIÓN:
- Última intención: ${conversationContext.lastIntent || 'nueva_conversacion'}
- Consultas de productos: ${conversationContext.productInquiries?.join(', ') || 'ninguna'}
- Estado: ${conversationContext.status || 'activa'}

PRODUCTOS DISPONIBLES:
${availableProducts?.map(p => `- ${p.name}: $${p.price} (${p.status})`).join('\n') || 'No hay productos cargados'}

INSTRUCCIONES:
1. Responde SIEMPRE en español natural y conversacional
2. Usa un tono amigable y profesional
3. Si preguntan por disponibilidad, consulta los productos disponibles
4. Si preguntan por precios, proporciona información precisa
5. Si preguntan por envíos, menciona que se pueden coordinar
6. Si no puedes responder con confianza, sugiere escalación a humano
7. Mantén las respuestas concisas pero completas

FORMATO DE RESPUESTA:
Responde en formato JSON con esta estructura:
{
  "message": "tu respuesta en español",
  "intent": "disponibilidad|precio|envio|descuento|escalacion|general",
  "confidence": 0.0-1.0,
  "shouldEscalate": true/false,
  "suggestedActions": ["accion1", "accion2"]
}

MENSAJE DEL CLIENTE: "${message}"`;

    return systemPrompt;
  }

  /**
   * Parse AI response from Claude 3
   */
  private parseAIResponse(aiResponse: string): {
    message: string;
    intent: string;
    confidence: number;
    shouldEscalate: boolean;
    suggestedActions: string[];
  } {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(aiResponse);
      return {
        message: parsed.message || aiResponse,
        intent: parsed.intent || 'general',
        confidence: parsed.confidence || 0.8,
        shouldEscalate: parsed.shouldEscalate || false,
        suggestedActions: parsed.suggestedActions || []
      };
    } catch (error) {
      // If JSON parsing fails, treat as plain text response
      return {
        message: aiResponse,
        intent: 'general',
        confidence: 0.6,
        shouldEscalate: false,
        suggestedActions: []
      };
    }
  }

  /**
   * Fallback response for common Spanish questions when Bedrock is unavailable
   */
  private getFallbackResponse(message: string): BotResponse {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('disponible') || lowerMessage.includes('stock')) {
      return {
        response: 'Hola! Para consultar disponibilidad específica, necesito conectarte con un asesor. ¿Te parece bien?',
        intent: 'disponibilidad',
        confidence: 0.7,
        shouldEscalate: true,
        updatedContext: {
          lastIntent: 'disponibilidad',
          lastResponse: 'fallback_disponibilidad',
          lastUpdate: new Date().toISOString()
        },
        suggestedActions: ['escalate_to_human']
      };
    }
    
    if (lowerMessage.includes('precio') || lowerMessage.includes('cuesta') || lowerMessage.includes('vale')) {
      return {
        response: 'Hola! Para información de precios actualizada, te conectaré con un asesor que te puede ayudar mejor. Un momento por favor.',
        intent: 'precio',
        confidence: 0.7,
        shouldEscalate: true,
        updatedContext: {
          lastIntent: 'precio',
          lastResponse: 'fallback_precio',
          lastUpdate: new Date().toISOString()
        },
        suggestedActions: ['escalate_to_human']
      };
    }
    
    if (lowerMessage.includes('envío') || lowerMessage.includes('envio') || lowerMessage.includes('delivery')) {
      return {
        response: 'Hola! Sí manejamos envíos. Para coordinar el envío y conocer los costos, te conectaré con un asesor. ¿Te parece bien?',
        intent: 'envio',
        confidence: 0.7,
        shouldEscalate: true,
        updatedContext: {
          lastIntent: 'envio',
          lastResponse: 'fallback_envio',
          lastUpdate: new Date().toISOString()
        },
        suggestedActions: ['escalate_to_human']
      };
    }
    
    // Default fallback
    return {
      response: 'Hola! Gracias por tu mensaje. Te conectaré con un asesor para ayudarte mejor. Un momento por favor.',
      intent: 'general',
      confidence: 0.5,
      shouldEscalate: true,
      updatedContext: {
        lastIntent: 'general',
        lastResponse: 'fallback_general',
        lastUpdate: new Date().toISOString()
      },
      suggestedActions: ['escalate_to_human']
    };
  }

  /**
   * Create conversation context for multi-turn conversations
   */
  createConversationContext(customerId: string, initialMessage: string): ConversationContext {
    return {
      customerId,
      status: 'active',
      lastIntent: 'new_conversation',
      productInquiries: [],
      messages: [
        {
          id: `msg_${Date.now()}`,
          from: 'customer',
          content: initialMessage,
          timestamp: new Date().toISOString(),
          type: 'text'
        }
      ],
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Update conversation context with new message and response
   */
  updateConversationContext(
    context: ConversationContext, 
    customerMessage: string, 
    botResponse: BotResponse
  ): ConversationContext {
    const updatedMessages = [
      ...context.messages,
      {
        id: `msg_${Date.now()}_customer`,
        from: 'customer' as const,
        content: customerMessage,
        timestamp: new Date().toISOString(),
        type: 'text' as const
      },
      {
        id: `msg_${Date.now()}_bot`,
        from: 'bot' as const,
        content: botResponse.response,
        timestamp: new Date().toISOString(),
        type: 'text' as const,
        metadata: {
          intent: botResponse.intent,
          confidence: botResponse.confidence
        }
      }
    ];

    return {
      ...context,
      ...botResponse.updatedContext,
      messages: updatedMessages,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const bedrockClient = new BedrockClientService();