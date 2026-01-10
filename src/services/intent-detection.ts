/**
 * Intent Detection Service for Spanish Language Processing
 * Handles classification of customer intents and escalation triggers
 */

import { IntentClassification, EscalationTrigger, ConversationContext, CustomerProfile } from '../types/conversation';
import { BedrockClientService } from './bedrock-client';

export interface IntentDetectionConfig {
  confidenceThreshold: number;
  escalationThreshold: number;
  supportedIntents: string[];
}

export class IntentDetectionService {
  private bedrockClient: BedrockClientService;
  private config: IntentDetectionConfig;

  // Spanish keywords for intent classification
  private readonly spanishIntentPatterns = {
    disponibilidad: [
      'disponible', 'stock', 'hay', 'tienes', 'queda', 'existe', 'conseguir',
      'está disponible', 'tienen disponible', 'hay stock', 'en stock'
    ],
    precio: [
      'precio', 'cuesta', 'vale', 'costo', 'valor', 'cuánto', 'cuanto',
      'qué precio', 'cuál es el precio', 'a cuánto', 'por cuánto'
    ],
    envio: [
      'envío', 'envio', 'delivery', 'entrega', 'despacho', 'shipping',
      'hacen envíos', 'mandan', 'llevan', 'entregan', 'despachan'
    ],
    descuento: [
      'descuento', 'rebaja', 'oferta', 'promoción', 'barato', 'más barato',
      'mejor precio', 'negociar', 'rebajar', 'última palabra'
    ],
    informacion: [
      'información', 'info', 'detalles', 'características', 'especificaciones',
      'más información', 'cuéntame', 'dime', 'explícame'
    ],
    compra: [
      'comprar', 'llevar', 'quiero', 'me interesa', 'apartado', 'reservar',
      'lo compro', 'me lo llevo', 'está vendido', 'cómo compro'
    ],
    saludo: [
      'hola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos',
      'qué tal', 'cómo está', 'buen día', 'hey', 'hi'
    ],
    despedida: [
      'gracias', 'chao', 'adiós', 'hasta luego', 'nos vemos', 'bye',
      'muchas gracias', 'perfecto', 'listo', 'ok gracias'
    ],
    human_handoff: [
      'hablar con humano', 'hablar con persona', 'soporte humano', 'agente', 'asesor',
      'atención al cliente', 'persona real', 'no eres real', 'con alguien', 'humano por favor',
      'hablar con un humano', 'hablar con una persona', 'un humano', 'una persona'
    ],
    comparacion: [
      'diferencia', 'comparar', 'cuál es mejor', 'cual es mejor', 'vs', 'versus',
      'comparación', 'comparacion', 'distinto', 'mejores', 'entre este y ese',
      'cuál me recomiendas', 'cuál elegir', 'diferencias'
    ],
    ubicacion: [
      'ubicación', 'ubicacion', 'donde están', 'dónde están', 'donde estan',
      'dirección', 'direccion', 'local', 'tienda física', 'tienda fisica',
      'mapa', 'como llegar', 'cómo llegar', 'dónde queda', 'donde queda',
      'visitar', 'showroom', 'ver en persona'
    ],
    negociacion: [
      'te doy', 'te ofrezco', 'mi oferta es', 'te pago', 'lo dejo en',
      'aceptas', 'trato', 'cerramos en', 'te parece', 'tómalo o déjalo'
    ],
    agendar_cita: [
      'cita', 'agendar', 'reservar', 'visitar', 'booking', 'horario',
      'ir a la tienda', 'ver el producto', 'sacar cita', 'cuándo puedo ir'
    ],
    metodos_pago: [
      'formas de pago', 'métodos de pago', 'reciben tarjeta', 'nequi', 'daviplata',
      'efectivo', 'transferencia', 'cómo pago', 'bancolombia', 'contra entrega', 'pagar'
    ],
    estado_envio: [
      'rastrear', 'dónde está mi pedido', 'status pedido', 'seguimiento',
      'código de rastreo', 'ya enviaron', 'cuándo llega mi pedido', 'estado del envío'
    ],
    complaint: [
      'problema', 'queja', 'reclamo', 'mal servicio', 'no funciona',
      'defectuoso', 'estafa', 'fraude', 'devolver', 'reembolso'
    ],
    negotiation: [
      'negociar', 'rebajar', 'último precio', 'mejor oferta', 'descuento',
      'más barato', 'rebaja', 'oferta especial', 'precio final'
    ],
    complex: [
      'garantía', 'warranty', 'instalación', 'configuración', 'técnico',
      'soporte', 'manual', 'instrucciones', 'cómo usar', 'no entiendo'
    ],
    urgent: [
      'urgente', 'rápido', 'ya', 'ahora', 'inmediato', 'emergency',
      'necesito ya', 'es urgente', 'pronto', 'cuanto antes'
    ],

    frustration: [
      'estúpido', 'inútil', 'mierda', 'basura', 'no sirves', 'idiota',
      'odio', 'harto', 'cansado', 'maldita', 'pesimo', 'horrible'
    ],
    ver_catalogo: [
      'catalogo', 'catálogo', 'lista de productos', 'que vendes', 'qué vendes',
      'ver productos', 'muestrame', 'muéstrame', 'fotos', 'tienes fotos',
      'ver todo', 'lista', 'portafolio', 'stock', 'inventario', 'que tienes',
      'dejame ver', 'déjame ver', 'cuales son', 'cuáles son', 'cuales', 'verlos',
      'enseñame', 'enséñame', 'quiero ver'
    ]
  };

  // Escalation patterns
  private readonly escalationPatterns = {
    complaint: [
      'problema', 'queja', 'reclamo', 'mal servicio', 'no funciona',
      'defectuoso', 'estafa', 'fraude', 'devolver', 'reembolso'
    ],
    negotiation: [
      'negociar', 'rebajar', 'último precio', 'mejor oferta', 'descuento',
      'más barato', 'rebaja', 'oferta especial', 'precio final'
    ],
    complex: [
      'garantía', 'warranty', 'instalación', 'configuración', 'técnico',
      'soporte', 'manual', 'instrucciones', 'cómo usar', 'no entiendo'
    ],
    urgent: [
      'urgente', 'rápido', 'ya', 'ahora', 'inmediato', 'emergency',
      'necesito ya', 'es urgente', 'pronto', 'cuanto antes'
    ],
    frustration: [
      'estúpido', 'inútil', 'mierda', 'basura', 'no sirves', 'idiota',
      'odio', 'harto', 'cansado', 'maldita', 'pesimo', 'horrible'
    ]
  };


  constructor(bedrockClient: BedrockClientService, config?: Partial<IntentDetectionConfig>) {
    this.bedrockClient = bedrockClient;
    this.config = {
      confidenceThreshold: config?.confidenceThreshold || 0.7,
      escalationThreshold: config?.escalationThreshold || 0.3,
      supportedIntents: config?.supportedIntents || [
        'disponibilidad', 'precio', 'envio', 'descuento', 'informacion',
        'compra', 'saludo', 'despedida', 'general', 'human_handoff', 'comparacion',
        'ubicacion', 'metodos_pago', 'estado_envio', 'ver_catalogo'
      ]
    };
  }

  /**
   * Classify customer intent from Spanish message
   */
  async classifyIntent(
    message: string,
    context?: ConversationContext,
    customerProfile?: CustomerProfile
  ): Promise<IntentClassification> {
    try {
      // First try rule-based classification for speed
      const ruleBasedResult = this.classifyWithRules(message);

      // If confidence is high enough, return rule-based result
      if (ruleBasedResult.confidence >= this.config.confidenceThreshold) {
        return ruleBasedResult;
      }

      // Otherwise, use AI for more sophisticated classification
      return await this.classifyWithAI(message, context, customerProfile);
    } catch (error) {
      console.error('Intent classification error:', error);

      // Fallback to rule-based classification
      return this.classifyWithRules(message);
    }
  }

  /**
   * Rule-based intent classification using Spanish patterns
   */
  private classifyWithRules(message: string): IntentClassification {
    const normalizedMessage = message.toLowerCase().trim();
    const words = normalizedMessage.split(/\s+/);

    let bestMatch = { intent: 'general', confidence: 0.3, matchCount: 0 };

    // Check each intent pattern
    for (const [intent, patterns] of Object.entries(this.spanishIntentPatterns)) {
      let matchCount = 0;

      for (const pattern of patterns) {
        if (normalizedMessage.includes(pattern.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(0.9, 0.5 + (matchCount * 0.2));

        if (matchCount > bestMatch.matchCount ||
          (matchCount === bestMatch.matchCount && confidence > bestMatch.confidence)) {
          bestMatch = { intent, confidence, matchCount };
        }
      }
    }

    // Extract entities based on intent
    const entities = this.extractEntities(normalizedMessage, bestMatch.intent);

    return {
      intent: bestMatch.intent,
      confidence: bestMatch.confidence,
      entities
    };
  }

  /**
   * AI-powered intent classification using Bedrock
   */
  private async classifyWithAI(
    message: string,
    context?: ConversationContext,
    customerProfile?: CustomerProfile
  ): Promise<IntentClassification> {
    const prompt = this.buildIntentClassificationPrompt(message, context, customerProfile);

    try {
      const response = await this.bedrockClient.generateResponse({
        message: prompt,
        conversationContext: context || this.createEmptyContext(),
        customerProfile: customerProfile || this.createEmptyProfile()
      });

      // Parse AI response for intent classification
      const classification = this.parseIntentFromAIResponse(response.response);

      return {
        intent: classification.intent,
        confidence: Math.max(classification.confidence, response.confidence),
        entities: classification.entities
      };
    } catch (error) {
      console.error('AI intent classification failed:', error);

      // Fallback to rule-based
      return this.classifyWithRules(message);
    }
  }

  /**
   * Build prompt for AI intent classification
   */
  private buildIntentClassificationPrompt(
    message: string,
    context?: ConversationContext,
    customerProfile?: CustomerProfile
  ): string {
    return `Clasifica la intención del siguiente mensaje en español. 

MENSAJE: "${message}"

CONTEXTO PREVIO: ${context?.lastIntent || 'ninguno'}
HISTORIAL DEL CLIENTE: ${customerProfile?.inquiryHistory?.join(', ') || 'nuevo cliente'}

INTENCIONES POSIBLES:
- disponibilidad: pregunta si un producto está disponible
- precio: pregunta por el costo o valor
- envio: pregunta por opciones de entrega
- descuento: busca rebajas o negociación
- informacion: solicita detalles del producto
- ver_catalogo: pide ver todos los productos, fotos, lista o catálogo ("muéstrame", "qué vendes")
- compra: expresa intención de comprar
- saludo: mensaje de saludo inicial
- despedida: mensaje de cierre
- human_handoff: solicita hablar con un agente humano o asesor
- general: otros temas

Responde en formato JSON:
{
  "intent": "nombre_de_la_intencion",
  "confidence": 0.0-1.0,
  "entities": {
    "productName": "nombre si se menciona",
    "priceRange": {"min": 0, "max": 0},
    "location": "ubicación si se menciona"
  }
}`;
  }

  /**
   * Parse intent classification from AI response
   */
  private parseIntentFromAIResponse(aiResponse: string): IntentClassification {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        intent: parsed.intent || 'general',
        confidence: parsed.confidence || 0.6,
        entities: parsed.entities || {}
      };
    } catch (error) {
      // If parsing fails, try to extract intent from text
      const intent = this.extractIntentFromText(aiResponse);
      return {
        intent,
        confidence: 0.6,
        entities: {}
      };
    }
  }

  /**
   * Extract intent from plain text AI response
   */
  private extractIntentFromText(text: string): string {
    const lowerText = text.toLowerCase();

    for (const intent of this.config.supportedIntents) {
      if (lowerText.includes(intent)) {
        return intent;
      }
    }

    return 'general';
  }

  /**
   * Extract entities from message based on intent
   */
  private extractEntities(message: string, intent: string): any {
    const entities: any = {};

    // Extract product names (simple heuristic)
    const productPatterns = [
      /(?:el|la|un|una)\s+([a-záéíóúñ\s]+?)(?:\s+(?:está|es|vale|cuesta))/gi,
      /(?:producto|artículo|item)\s+([a-záéíóúñ\s]+)/gi
    ];

    for (const pattern of productPatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        entities.productName = matches[0].replace(/(?:el|la|un|una|producto|artículo|item)\s+/gi, '').trim();
        break;
      }
    }

    // Extract price ranges
    const pricePattern = /(\d+(?:\.\d+)?)\s*(?:a|hasta|\-)\s*(\d+(?:\.\d+)?)/g;
    const priceMatch = message.match(pricePattern);
    if (priceMatch) {
      const numbers = priceMatch[0].match(/\d+(?:\.\d+)?/g);
      if (numbers && numbers.length >= 2) {
        entities.priceRange = {
          min: parseFloat(numbers[0]),
          max: parseFloat(numbers[1])
        };
      }
    }

    // Extract locations
    const locationPatterns = [
      /(?:en|de|desde|hasta)\s+([a-záéíóúñ\s]+?)(?:\s|$|[,.])/gi
    ];

    for (const pattern of locationPatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        entities.location = matches[0].replace(/(?:en|de|desde|hasta)\s+/gi, '').trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Detect escalation triggers
   */
  async detectEscalationTriggers(
    message: string,
    intent: IntentClassification,
    context?: ConversationContext
  ): Promise<EscalationTrigger[]> {
    const triggers: EscalationTrigger[] = [];
    const normalizedMessage = message.toLowerCase();

    // Check for low confidence
    if (intent.confidence < this.config.escalationThreshold) {
      triggers.push({
        type: 'low_confidence',
        confidence: intent.confidence,
        reason: `Baja confianza en clasificación de intención: ${intent.confidence}`,
        metadata: { originalIntent: intent.intent }
      });
    }

    // Check for explicit handoff intent
    if (intent.intent === 'human_handoff') {
      triggers.push({
        type: 'manual_request',
        confidence: 1.0,
        reason: 'Solicitud explícita de agente humano',
        metadata: { originalIntent: intent.intent }
      });
    }

    // Check for complaint patterns
    for (const pattern of this.escalationPatterns.complaint) {
      if (normalizedMessage.includes(pattern)) {
        triggers.push({
          type: 'complaint',
          confidence: 0.8,
          reason: `Posible queja detectada: "${pattern}"`,
          metadata: { keyword: pattern }
        });
        break;
      }
    }

    // Check for price negotiation
    for (const pattern of this.escalationPatterns.negotiation) {
      if (normalizedMessage.includes(pattern)) {
        triggers.push({
          type: 'price_negotiation',
          confidence: 0.7,
          reason: `Intento de negociación detectado: "${pattern}"`,
          metadata: { keyword: pattern }
        });
        break;
      }
    }

    // Check for complex queries
    for (const pattern of this.escalationPatterns.complex) {
      if (normalizedMessage.includes(pattern)) {
        triggers.push({
          type: 'complex_query',
          confidence: 0.6,
          reason: `Consulta compleja detectada: "${pattern}"`,
          metadata: { keyword: pattern }
        });
        break;
      }
    }

    // Check for urgent requests
    for (const pattern of this.escalationPatterns.urgent) {
      if (normalizedMessage.includes(pattern)) {
        triggers.push({
          type: 'manual_request',
          confidence: 0.9,
          reason: `Solicitud urgente detectada: "${pattern}"`,
          metadata: { keyword: pattern, priority: 'high' }
        });
        break;
      }
    }

    // Check for frustration
    for (const pattern of this.escalationPatterns.frustration) {
      if (normalizedMessage.includes(pattern)) {
        triggers.push({
          type: 'sentiment',
          confidence: 0.9,
          reason: `Frustración detectada: "${pattern}"`,
          metadata: { keyword: pattern, sentiment: 'negative' }
        });
        break;
      }
    }

    return triggers;
  }

  /**
   * Calculate confidence score for responses
   */
  calculateResponseConfidence(
    intent: IntentClassification,
    escalationTriggers: EscalationTrigger[],
    context?: ConversationContext
  ): number {
    let baseConfidence = intent.confidence;

    // Reduce confidence if escalation triggers are present
    if (escalationTriggers.length > 0) {
      const maxTriggerConfidence = Math.max(...escalationTriggers.map(t => t.confidence));
      baseConfidence = baseConfidence * (1 - maxTriggerConfidence * 0.5);
    }

    // Increase confidence for repeated intents in conversation
    if (context?.lastIntent === intent.intent) {
      baseConfidence = Math.min(0.95, baseConfidence * 1.1);
    }

    // Ensure confidence is within valid range
    return Math.max(0.1, Math.min(0.99, baseConfidence));
  }

  /**
   * Helper methods for creating empty objects
   */
  private createEmptyContext(): any {
    return {
      customerId: 'unknown',
      status: 'active',
      lastIntent: 'new_conversation',
      productInquiries: [],
      messages: [],
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }

  private createEmptyProfile(): any {
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
}

// Export singleton instance
export const intentDetectionService = new IntentDetectionService(
  new BedrockClientService()
);