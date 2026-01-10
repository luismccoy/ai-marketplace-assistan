/**
 * Response Generation Service
 * Handles contextual response generation with product integration and style consistency
 */

import {
  BotResponse,
  ConversationContext,
  CustomerProfile,
  Product,
  IntentClassification,
  EscalationTrigger
} from '../types/conversation';
import { TenantConfig } from '../types/tenant'; // Import full config
import { BedrockClientService } from './bedrock-client';
import { IntentDetectionService } from './intent-detection';
import { ProductInquiryHandler, ProductInquiry } from './product-inquiry-handler';

export interface ResponseGenerationConfig {
  maxResponseLength: number;
  includeTypingIndicators: boolean;
  styleConsistency: boolean;
  productIntegration: boolean;
}

export interface ResponseContext {
  message: string;
  intent: IntentClassification;
  escalationTriggers: EscalationTrigger[];
  conversationContext: ConversationContext;
  customerProfile: CustomerProfile;
  availableProducts: Product[];
  businessConfig?: TenantConfig['businessConfig']; // Use shared type
}

export class ResponseGenerationService {
  private bedrockClient: BedrockClientService;
  private intentService: IntentDetectionService;
  private productInquiryHandler: ProductInquiryHandler;
  private config: ResponseGenerationConfig;

  // Spanish response templates by intent
  private readonly responseTemplates = {
    disponibilidad: {
      available: [
        "¡Sí! {productName} está disponible. {details}",
        "Perfecto, tenemos {productName} en stock. {details}",
        "¡Claro que sí! {productName} disponible. {details}"
      ],
      unavailable: [
        "Lo siento, {productName} no está disponible en este momento. {alternatives}",
        "Ese producto se agotó, pero tengo {alternatives}",
        "No tengo {productName} disponible, ¿te interesa {alternatives}?"
      ],
      checking: [
        "Déjame verificar la disponibilidad de {productName}...",
        "Un momento, consulto el stock de {productName}",
        "Verificando disponibilidad... 🔍"
      ]
    },
    precio: {
      withPrice: [
        "{productName} tiene un precio de ${price}. {additionalInfo}",
        "El precio de {productName} es ${price}. {additionalInfo}",
        "{productName} vale ${price}. {additionalInfo}"
      ],
      withDiscount: [
        "{productName} está en ${price} (precio especial). {additionalInfo}",
        "Te doy {productName} en ${price} (oferta). {additionalInfo}",
        "Precio especial para {productName}: ${price}. {additionalInfo}"
      ],
      negotiable: [
        "El precio de {productName} es ${price}, pero podemos conversar. {contact}",
        "{productName} vale ${price}, ¿qué te parece? {contact}",
        "Para {productName} manejo ${price}, pero hablemos. {contact}"
      ]
    },
    envio: {
      available: [
        "¡Sí! Hacemos envíos a {location}. Costo: ${cost}, llega en {days} días.",
        "Claro, enviamos a {location}. ${cost} el envío, {days} días aprox.",
        "Perfecto, sí llegamos a {location}. Envío ${cost}, {days} días."
      ],
      checkLocation: [
        "¿A qué zona necesitas el envío? Te confirmo costo y tiempo.",
        "Dime la ubicación y te cotizo el envío.",
        "¿A dónde sería el envío? Te doy el precio."
      ],
      unavailable: [
        "No llegamos a esa zona, pero puedes recoger en {pickupLocation}.",
        "A esa zona no enviamos, ¿puedes pasar a recoger?",
        "Esa zona no la cubrimos, pero hay punto de recogida."
      ]
    },
    agendar_cita: {
      withLink: [
        "¡Claro! Puedes agendar tu visita aquí: {link}",
        "Te esperamos. Reserva tu horario en este enlace: {link}",
        "Para visitarnos, por favor agenda aquí: {link}"
      ],
      manual: [
        "Nuestros horarios son {hours}. ¿Cuándo te gustaría venir?",
        "Atendemos en {hours}. Dime qué día te queda bien.",
        "Estamos abiertos {hours}. ¿Qué horario prefieres?"
      ]
    },
    metodos_pago: [
      "Aceptamos: {methods}. {instructions}",
      "Puedes pagar con: {methods}. {instructions}",
      "Recibimos {methods}. {instructions}"
    ],
    estado_envio: [
      "Para revisar tu pedido, por favor dame el número de orden o tu nombre completo.",
      "¿Me podrías dar tu número de pedido para rastrearlo?",
      "Claro, ayúdame con el ID de tu orden para ver dónde está."
    ],
    ver_catalogo: [
      "Aquí tienes nuestros productos disponibles:",
      "Estos son los productos que tenemos para ti:",
      "Mira lo que tenemos disponible en tienda:"
    ],
    saludo: [
      "¡Hola! ¿En qué te puedo ayudar hoy? 😊",
      "¡Buenas! ¿Qué necesitas?",
      "¡Hola! Cuéntame, ¿qué buscas?",
      "¡Hey! ¿En qué te ayudo?"
    ],
    despedida: [
      "¡Perfecto! Cualquier cosa me escribes. ¡Que tengas buen día! 😊",
      "¡Listo! Aquí estoy para lo que necesites. ¡Saludos!",
      "¡Genial! Nos hablamos. ¡Cuídate! 👋",
      "¡Excelente! Hasta pronto. ¡Que esté bien!"
    ]
  };

  constructor(
    bedrockClient: BedrockClientService,
    intentService: IntentDetectionService,
    config?: Partial<ResponseGenerationConfig>
  ) {
    this.bedrockClient = bedrockClient;
    this.intentService = intentService;
    this.productInquiryHandler = new ProductInquiryHandler();
    this.config = {
      maxResponseLength: config?.maxResponseLength || 300,
      includeTypingIndicators: config?.includeTypingIndicators ?? true,
      styleConsistency: config?.styleConsistency ?? true,
      productIntegration: config?.productIntegration ?? true
    };
  }

  /**
   * Generate contextual response with product integration
   */
  async generateResponse(context: ResponseContext): Promise<BotResponse> {
    try {
      // Check if escalation is needed
      if (this.shouldEscalate(context)) {
        return this.generateEscalationResponse(context);
      }

      // Generate response based on intent
      let response: BotResponse;

      switch (context.intent.intent) {
        case 'disponibilidad':
          response = await this.generateAvailabilityResponse(context);
          break;
        case 'precio':
          response = await this.generatePriceResponse(context);
          break;
        case 'envio':
          response = await this.generateShippingResponse(context);
          break;
        case 'descuento':
          response = await this.generateDiscountResponse(context);
          break;
        case 'informacion':
          response = await this.generateInfoResponse(context);
          break;
        case 'compra':
          response = await this.generatePurchaseResponse(context);
          break;
        case 'saludo':
          response = this.generateGreetingResponse(context);
          break;
        case 'despedida':
          response = this.generateFarewellResponse(context);
          break;
        case 'comparacion':
          response = await this.generateComparisonResponse(context);
          break;
        case 'ubicacion':
          response = this.generateLocationResponse(context);
          break;
        case 'agendar_cita':
          response = this.generateAppointmentResponse(context);
          break;
        case 'metodos_pago':
          response = this.generatePaymentResponse(context);
          break;
        case 'estado_envio':
          response = this.generateShippingStatusResponse(context);
          break;
        case 'ver_catalogo':
          response = this.generateCatalogResponse(context);
          break;
        default:
          response = await this.generateGeneralResponse(context);
      }

      // Apply style consistency
      if (this.config.styleConsistency) {
        response = this.applyStyleConsistency(response, context.businessConfig);
      }

      // Add typing indicators if enabled
      if (this.config.includeTypingIndicators) {
        response.metadata = {
          ...response.metadata,
          typingIndicator: true,
          estimatedTypingTime: this.calculateTypingTime(response.response)
        };
      }

      return response;
    } catch (error) {
      console.error('Response generation error:', error);
      return this.generateFallbackResponse(context);
    }
  }

  /**
   * Generate availability response with product integration
   */
  private async generateAvailabilityResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, availableProducts } = context;
    const productName = intent.entities.productName;

    if (productName) {
      // Search for specific product
      const product = this.findProduct(productName, availableProducts);

      if (product) {
        if (product.status === 'available') {
          const template = this.getRandomTemplate(this.responseTemplates.disponibilidad.available);
          const response = template
            .replace('{productName}', product.name)
            .replace('{details}', `Precio: $${product.price}. ${product.description}`);

          return {
            response,
            intent: 'disponibilidad',
            confidence: 0.9,
            shouldEscalate: false,
            updatedContext: {
              lastIntent: 'disponibilidad',
              productInquiries: [...context.conversationContext.productInquiries, product.productId]
            },
            suggestedActions: ['show_product_details', 'ask_for_purchase_intent'],
            metadata: {
              products: [product.productId]
            }
          };
        } else {
          const alternatives = this.findAlternativeProducts(product, availableProducts);
          const template = this.getRandomTemplate(this.responseTemplates.disponibilidad.unavailable);
          const response = template
            .replace('{productName}', product.name)
            .replace('{alternatives}', alternatives.map(p => p.name).join(', '));

          return {
            response,
            intent: 'disponibilidad',
            confidence: 0.8,
            shouldEscalate: false,
            updatedContext: {
              lastIntent: 'disponibilidad_unavailable'
            },
            suggestedActions: ['show_alternatives']
          };
        }
      }
    }

    // General availability inquiry
    const availableCount = availableProducts.filter(p => p.status === 'available').length;

    // If few products, just show the catalog instead of asking generic question
    if (availableCount > 0 && availableCount <= 12) {
      return this.generateCatalogResponse(context);
    }

    const response = `Tengo ${availableCount} productos disponibles. ¿Qué tipo de producto buscas? 🛍️`;

    return {
      response,
      intent: 'disponibilidad',
      confidence: 0.7,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'disponibilidad_general'
      },
      suggestedActions: ['show_product_categories']
    };
  }

  /**
   * Generate price response with discount integration
   */
  private async generatePriceResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, availableProducts, businessConfig } = context;
    const productName = intent.entities.productName;

    if (productName) {
      const product = this.findProduct(productName, availableProducts);

      if (product) {
        const canNegotiate = businessConfig?.discountPolicy?.allowNegotiation ?? false;
        const hasDiscount = product.discountRange && product.discountRange.max > 0;

        let template: string;
        let response: string;

        if (canNegotiate) {
          template = this.getRandomTemplate(this.responseTemplates.precio.negotiable);
          response = template
            .replace('{productName}', product.name)
            .replace('{price}', product.price.toString())
            .replace('{contact}', 'Escríbeme y vemos 😊');
        } else if (hasDiscount) {
          const discountPrice = product.price * (1 - product.discountRange.max / 100);
          template = this.getRandomTemplate(this.responseTemplates.precio.withDiscount);
          response = template
            .replace('{productName}', product.name)
            .replace('{price}', discountPrice.toFixed(0))
            .replace('{additionalInfo}', `Precio regular: $${product.price}`);
        } else {
          template = this.getRandomTemplate(this.responseTemplates.precio.withPrice);
          response = template
            .replace('{productName}', product.name)
            .replace('{price}', product.price.toString())
            .replace('{additionalInfo}', '¿Te interesa?');
        }

        return {
          response,
          intent: 'precio',
          confidence: 0.9,
          shouldEscalate: canNegotiate && intent.entities.priceRange ? true : false,
          updatedContext: {
            lastIntent: 'precio',
            productInquiries: [...context.conversationContext.productInquiries, product.productId]
          },
          suggestedActions: canNegotiate ? ['escalate_for_negotiation'] : ['ask_for_purchase_intent'],
          metadata: {
            products: [product.productId]
          }
        };
      }
    }

    // General price inquiry
    const priceRange = this.calculatePriceRange(availableProducts);
    const response = `Los precios van desde $${priceRange.min} hasta $${priceRange.max}. ¿Qué producto te interesa específicamente?`;

    return {
      response,
      intent: 'precio',
      confidence: 0.7,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'precio_general'
      },
      suggestedActions: ['show_product_list']
    };
  }

  /**
   * Generate shipping response with location integration
   */
  private async generateShippingResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, businessConfig } = context;
    const location = intent.entities.location;

    if (!businessConfig?.shippingInfo?.available) {
      return {
        response: 'Por el momento solo manejamos recogida en tienda. ¿Te queda cómodo pasar a recoger?',
        intent: 'envio',
        confidence: 0.8,
        shouldEscalate: false,
        updatedContext: {
          lastIntent: 'envio_unavailable'
        },
        suggestedActions: ['provide_pickup_location']
      };
    }

    if (location) {
      const shippingCost = this.calculateShippingCost(location, businessConfig.shippingInfo);

      if (shippingCost > 0) {
        const template = this.getRandomTemplate(this.responseTemplates.envio.available);
        const response = template
          .replace('{location}', location)
          .replace('{cost}', shippingCost.toString())
          .replace('{days}', businessConfig.shippingInfo.estimatedDays.toString());

        return {
          response,
          intent: 'envio',
          confidence: 0.9,
          shouldEscalate: false,
          updatedContext: {
            lastIntent: 'envio_available'
          },
          suggestedActions: ['confirm_shipping_details']
        };
      } else {
        const template = this.getRandomTemplate(this.responseTemplates.envio.unavailable);
        const response = template.replace('{pickupLocation}', 'nuestra tienda');

        return {
          response,
          intent: 'envio',
          confidence: 0.8,
          shouldEscalate: false,
          updatedContext: {
            lastIntent: 'envio_zone_unavailable'
          },
          suggestedActions: ['provide_pickup_location']
        };
      }
    }

    // Ask for location
    const template = this.getRandomTemplate(this.responseTemplates.envio.checkLocation);

    return {
      response: template,
      intent: 'envio',
      confidence: 0.8,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'envio_location_request'
      },
      suggestedActions: ['request_location']
    };
  }

  /**
   * Generate discount/negotiation response
   */
  private async generateDiscountResponse(context: ResponseContext): Promise<BotResponse> {
    const { businessConfig } = context;

    if (businessConfig?.discountPolicy?.allowNegotiation) {
      return {
        response: 'Claro, podemos conversar sobre el precio. ¿Qué producto te interesa y qué presupuesto manejas?',
        intent: 'descuento',
        confidence: 0.8,
        shouldEscalate: true,
        updatedContext: {
          lastIntent: 'descuento_negotiation'
        },
        suggestedActions: ['escalate_for_negotiation']
      };
    } else {
      return {
        response: 'Los precios que manejo son fijos, pero siempre hay buenas ofertas. ¿Qué producto buscas?',
        intent: 'descuento',
        confidence: 0.8,
        shouldEscalate: false,
        updatedContext: {
          lastIntent: 'descuento_fixed'
        },
        suggestedActions: ['show_current_offers']
      };
    }
  }

  /**
   * Generate product information response
   */
  private async generateInfoResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, availableProducts } = context;
    const productName = intent.entities.productName;

    if (productName) {
      const product = this.findProduct(productName, availableProducts);

      if (product) {
        const response = `${product.name}:\n\n📝 ${product.description}\n💰 Precio: $${product.price}\n📍 Ubicación: ${product.location}\n🏷️ Condición: ${product.condition}\n\n¿Te interesa?`;

        return {
          response,
          intent: 'informacion',
          confidence: 0.9,
          shouldEscalate: false,
          updatedContext: {
            lastIntent: 'informacion',
            productInquiries: [...context.conversationContext.productInquiries, product.productId]
          },
          suggestedActions: ['ask_for_purchase_intent', 'show_similar_products'],
          metadata: {
            products: [product.productId]
          }
        };
      }
    }

    return {
      response: '¿Sobre qué producto necesitas más información? Te puedo dar todos los detalles.',
      intent: 'informacion',
      confidence: 0.7,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'informacion_general'
      },
      suggestedActions: ['show_product_list']
    };
  }

  /**
   * Generate purchase intent response
   */
  private async generatePurchaseResponse(context: ResponseContext): Promise<BotResponse> {
    return {
      response: '¡Perfecto! Me alegra que te interese. Te conectaré con un asesor para coordinar la compra. Un momento por favor... 😊',
      intent: 'compra',
      confidence: 0.9,
      shouldEscalate: true,
      updatedContext: {
        lastIntent: 'compra',
        status: 'escalated'
      },
      suggestedActions: ['escalate_for_purchase', 'collect_contact_info'],
      metadata: {
        escalationReason: 'purchase_intent',
        priority: 'high'
      }
    };
  }

  /**
   * Generate location response
   */
  private generateLocationResponse(context: ResponseContext): BotResponse {
    // Mock location data (In real app, fetch from TenantConfig)
    const businessLocation = {
      name: 'Tienda Principal',
      address: 'Av. Principal 123, Ciudad Tecnológica',
      latitude: 4.6097, // Example: Bogota
      longitude: -74.0817
    };

    return {
      response: `📍 Estamos ubicados en ${businessLocation.address}.\n\nTe envío nuestra ubicación exacta para que puedas visitarnos.`,
      intent: 'ubicacion',
      confidence: 1.0,
      shouldEscalate: false,
      updatedContext: { lastIntent: 'ubicacion' },
      metadata: {
        location: businessLocation
      }
    };
  }

  /**
   * Generate appointment response
   */
  private generateAppointmentResponse(context: ResponseContext): BotResponse {
    const { businessConfig } = context;
    const appointmentConfig = businessConfig?.appointmentConfig;

    if (!appointmentConfig?.enabled) {
      return {
        response: 'Por el momento no manejamos sistema de citas, puedes visitarnos en nuestro horario habitual.',
        intent: 'agendar_cita',
        confidence: 0.8,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'agendar_cita_disabled' }
      };
    }

    let response: string;
    let suggestedActions: string[] = [];

    if (appointmentConfig.calendarUrl) {
      const template = this.getRandomTemplate(this.responseTemplates.agendar_cita.withLink);
      response = template.replace('{link}', appointmentConfig.calendarUrl);
      suggestedActions = ['open_calendar'];
    } else {
      const template = this.getRandomTemplate(this.responseTemplates.agendar_cita.manual);
      response = template.replace('{hours}', appointmentConfig.businessHours || '9am a 6pm');
      suggestedActions = ['propose_time'];
    }

    return {
      response,
      intent: 'agendar_cita',
      confidence: 0.9,
      shouldEscalate: !appointmentConfig.calendarUrl, // Escalate if no auto-booking link
      updatedContext: { lastIntent: 'agendar_cita' },
      suggestedActions
    };
  }

  /**
   * Generate payment methods response
   */
  private generatePaymentResponse(context: ResponseContext): BotResponse {
    const { businessConfig } = context;
    const paymentConfig = businessConfig?.paymentConfig;

    if (!paymentConfig || !paymentConfig.methods || paymentConfig.methods.length === 0) {
      return {
        response: 'Manejamos todos los medios de pago principales. ¿Cuál prefieres usar?',
        intent: 'metodos_pago',
        confidence: 0.8,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'metodos_pago_general' }
      };
    }

    const template = this.getRandomTemplate(this.responseTemplates.metodos_pago);
    const response = template
      .replace('{methods}', paymentConfig.methods.join(', '))
      .replace('{instructions}', paymentConfig.instructions || '');

    return {
      response,
      intent: 'metodos_pago',
      confidence: 0.9,
      shouldEscalate: false,
      updatedContext: { lastIntent: 'metodos_pago' },
      suggestedActions: ['confirm_payment_method']
    };
  }

  /**
   * Generate shipping status response
   */
  private generateShippingStatusResponse(context: ResponseContext): BotResponse {
    const template = this.getRandomTemplate(this.responseTemplates.estado_envio);

    return {
      response: template,
      intent: 'estado_envio',
      confidence: 0.9,
      shouldEscalate: true, // Usually needs human or backend lookup
      updatedContext: { lastIntent: 'estado_envio' },
    };
  }

  /**
   * Generate catalog response (list available products)
   */
  private generateCatalogResponse(context: ResponseContext): BotResponse {
    const { availableProducts } = context;
    const activeProducts = availableProducts.filter(p => p.status === 'available');

    if (activeProducts.length === 0) {
      return {
        response: "Lo siento, por el momento no tenemos productos en inventario.",
        intent: 'ver_catalogo',
        confidence: 0.9,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'ver_catalogo_empty' }
      };
    }

    // If few products (e.g. <= 12), list them all with details
    if (activeProducts.length <= 12) {
      const template = this.getRandomTemplate(this.responseTemplates.ver_catalogo);
      const productList = activeProducts
        .map(p => `• *${p.name}*: $${p.price}`)
        .join('\n');

      return {
        response: `${template}\n\n(Enviando catálogo interactivo...)`,
        intent: 'ver_catalogo',
        confidence: 0.9,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'ver_catalogo_list' },
        suggestedActions: activeProducts.map(p => `view_product_${p.productId}`),
        metadata: {
          products: activeProducts.map(p => p.productId), // Keeps triggering images if needed, or remove if redundant
          listMessage: {
            body: `${template}\n\nAquí tienes nuestros productos:\n\n🔗 Ver catálogo completo:\nhttps://market.ai/shop/${context.conversationContext.tenantId}`,
            buttonText: "Ver Productos",
            sections: [
              {
                title: "Disponible ahora",
                rows: activeProducts.map(p => ({
                  id: `view_product_${p.productId}`,
                  title: p.name.substring(0, 23), // Truncate to 23 chars to be safe
                  description: `$${p.price} - ${p.category}`.substring(0, 72) // Limit description ensuring safe margin
                }))
              }
            ]
          }
        }
      };
    } else {
      // If many products, group by category or show top 5
      const categories = [...new Set(activeProducts.map(p => p.category))];
      const template = this.getRandomTemplate(this.responseTemplates.ver_catalogo);
      const categoryList = categories.map(c => `• ${activeProducts.filter(p => p.category === c).length} ${c}`).join('\n');

      return {
        response: `${template}\n\nTenemos variedad en:\n${categoryList}\n\n¿Qué categoría te gustaría ver?`,
        intent: 'ver_catalogo',
        confidence: 0.9,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'ver_catalogo_categories' },
        suggestedActions: categories
      };
    }
  }

  /**
   * Generate negotiation response
   */
  private async generateNegotiationResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, conversationContext, businessConfig } = context;
    const { products, amount } = intent.entities || {};

    // 1. Identify Product
    let productToNegotiate: Product | undefined | null;
    if (products && products.length > 0) {
      productToNegotiate = this.findProduct(products[0], context.availableProducts);
    } else if (conversationContext.productInquiries.length > 0) {
      // Use last discussed product
      const lastProductId = conversationContext.productInquiries[conversationContext.productInquiries.length - 1];
      productToNegotiate = context.availableProducts.find(p => p.productId === lastProductId);
    }

    if (!productToNegotiate) {
      return {
        response: '¿De qué producto quieres negociar el precio?',
        intent: 'negociacion',
        confidence: 0.8,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'negociacion' }
      };
    }

    // 2. Extract Offer Amount
    // Assuming the intent detection extracted an amount entity (e.g. "te doy 50")
    // If not, we ask for it.
    if (!amount) {
      return {
        response: `Entiendo, te interesa negociar el ${productToNegotiate.name}. ¿Cuál es tu oferta?`,
        intent: 'negociacion',
        confidence: 0.9,
        shouldEscalate: false,
        updatedContext: { lastIntent: 'negociacion' }
      };
    }

    // 3. Process Negotiation
    const tenantConfigSimulated = { businessConfig }; // Wrapper to match handler signature
    const negotiationResult = await (this.productInquiryHandler as any).handleNegotiation(
      tenantConfigSimulated,
      productToNegotiate as any,
      amount
    );

    return {
      response: negotiationResult.message,
      intent: 'negociacion',
      confidence: 1.0,
      shouldEscalate: false,
      updatedContext: { lastIntent: 'negociacion', escalationReason: negotiationResult.accepted ? 'offer_accepted' : undefined },
      metadata: {
        negotiation: {
          productId: productToNegotiate.productId,
          offeredAmount: amount,
          accepted: negotiationResult.accepted,
          counterOffer: negotiationResult.counterOffer
        }
      }
    };
  }


  /**
   * Generate comparison response
   */
  private async generateComparisonResponse(context: ResponseContext): Promise<BotResponse> {
    const { intent, conversationContext, availableProducts } = context;
    const { products } = intent.entities;

    // Attempt to identify products mentioned
    let productsToCompare: Product[] = [];

    // If entities has a 'products' array, use it (assumed from intent classification)
    if (Array.isArray(products) && products.length >= 2) {
      productsToCompare = products.map(name => this.findProduct(name, availableProducts)).filter(Boolean) as Product[];
    } else {
      // Heuristic: check if context has recently discussed products
      const recentIds = conversationContext.productInquiries.slice(-2);
      if (recentIds.length === 2) {
        productsToCompare = availableProducts.filter(p => recentIds.includes(p.productId));
      } else if (availableProducts.length >= 2) {
        // Fallback: compare top 2 available if general comparison asked
        productsToCompare = availableProducts.slice(0, 2);
      }
    }

    const { message, success } = await this.productInquiryHandler.handleComparisonInquiry(
      conversationContext.tenantId || 'default-tenant',
      productsToCompare as any[]
    );

    return {
      response: message,
      intent: 'comparacion',
      confidence: 0.9,
      shouldEscalate: !success,
      updatedContext: {
        lastIntent: 'comparacion'
      },
      suggestedActions: ['ask_preference', 'show_recommendations']
    };
  }

  /**
   * Generate greeting response
   */
  private generateGreetingResponse(context: ResponseContext): BotResponse {
    const template = this.getRandomTemplate(this.responseTemplates.saludo);

    return {
      response: template,
      intent: 'saludo',
      confidence: 0.9,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'saludo'
      },
      suggestedActions: ['show_product_categories', 'ask_what_looking_for']
    };
  }

  /**
   * Generate farewell response
   */
  private generateFarewellResponse(context: ResponseContext): BotResponse {
    const template = this.getRandomTemplate(this.responseTemplates.despedida);

    return {
      response: template,
      intent: 'despedida',
      confidence: 0.9,
      shouldEscalate: false,
      updatedContext: {
        lastIntent: 'despedida',
        status: 'closed'
      },
      suggestedActions: ['close_conversation']
    };
  }

  /**
   * Generate general response using AI
   */
  private async generateGeneralResponse(context: ResponseContext): Promise<BotResponse> {
    return await this.bedrockClient.generateResponse({
      message: context.message,
      conversationContext: context.conversationContext,
      customerProfile: context.customerProfile,
      availableProducts: context.availableProducts
    });
  }

  /**
   * Generate escalation response
   */
  private generateEscalationResponse(context: ResponseContext): BotResponse {
    const trigger = context.escalationTriggers[0];

    let response: string;
    switch (trigger.type) {
      case 'complaint':
        response = 'Entiendo tu preocupación. Te conectaré con un supervisor para resolver esto de la mejor manera. Un momento por favor.';
        break;
      case 'price_negotiation':
        response = 'Perfecto, hablemos del precio. Te conectaré con un asesor para que puedan llegar a un acuerdo. Un momento...';
        break;
      case 'complex_query':
        response = 'Es una consulta técnica importante. Te conectaré con un especialista que te puede ayudar mejor. Un momento por favor.';
        break;
      default:
        response = 'Te conectaré con un asesor para ayudarte mejor. Un momento por favor... 😊';
    }

    return {
      response,
      intent: 'escalation',
      confidence: 0.9,
      shouldEscalate: true,
      updatedContext: {
        lastIntent: 'escalation',
        status: 'escalated',
        escalationReason: trigger.reason
      },
      suggestedActions: ['escalate_to_human'],
      metadata: {
        escalationTrigger: trigger,
        priority: trigger.type === 'complaint' ? 'high' : 'normal'
      }
    };
  }

  /**
   * Generate fallback response
   */
  private generateFallbackResponse(context: ResponseContext): BotResponse {
    return {
      response: 'Disculpa, no pude procesar tu mensaje correctamente. Te conectaré con un asesor para ayudarte mejor. Un momento por favor.',
      intent: 'fallback',
      confidence: 0.3,
      shouldEscalate: true,
      updatedContext: {
        lastIntent: 'fallback'
      },
      suggestedActions: ['escalate_to_human']
    };
  }

  /**
   * Helper methods
   */
  private shouldEscalate(context: ResponseContext): boolean {
    return context.escalationTriggers.length > 0 ||
      context.intent.confidence < 0.3 ||
      context.intent.intent === 'compra';
  }

  private findProduct(productName: string, products: Product[]): Product | null {
    const normalizedName = productName.toLowerCase();
    return products.find(p =>
      p.name.toLowerCase().includes(normalizedName) ||
      p.description.toLowerCase().includes(normalizedName)
    ) || null;
  }

  private findAlternativeProducts(product: Product, products: Product[]): Product[] {
    return products
      .filter(p =>
        p.productId !== product.productId &&
        p.status === 'available' &&
        (p.category === product.category ||
          Math.abs(p.price - product.price) < product.price * 0.3)
      )
      .slice(0, 3);
  }

  private calculatePriceRange(products: Product[]): { min: number; max: number } {
    const availableProducts = products.filter(p => p.status === 'available');
    if (availableProducts.length === 0) return { min: 0, max: 0 };

    const prices = availableProducts.map(p => p.price);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices)
    };
  }

  private calculateShippingCost(location: string, shippingInfo: any): number {
    const normalizedLocation = location.toLowerCase();

    for (const [zone, cost] of Object.entries(shippingInfo.costs)) {
      if (normalizedLocation.includes(zone.toLowerCase())) {
        return cost as number;
      }
    }

    return 0; // Location not covered
  }

  private getRandomTemplate(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private applyStyleConsistency(response: BotResponse, businessConfig?: TenantConfig['businessConfig']): BotResponse {
    if (!businessConfig?.communicationStyle) return response;

    let styledResponse = response.response;

    // Apply typical phrases
    if (businessConfig.communicationStyle.typicalPhrases && businessConfig.communicationStyle.typicalPhrases.length > 0) {
      const randomPhrase = businessConfig.communicationStyle.typicalPhrases[
        Math.floor(Math.random() * businessConfig.communicationStyle.typicalPhrases.length)
      ];

      // Occasionally add typical phrases
      if (Math.random() < 0.3) {
        styledResponse += ` ${randomPhrase}`;
      }
    }

    // Apply emoji usage
    if (businessConfig.communicationStyle.useEmojis && !styledResponse.includes('😊') && !styledResponse.includes('🛍️')) {
      if (Math.random() < 0.4) {
        styledResponse += ' 😊';
      }
    }

    return {
      ...response,
      response: styledResponse
    };
  }

  private calculateTypingTime(text: string): number {
    // Simulate human typing speed (average 40 WPM)
    const words = text.split(' ').length;
    const typingSpeedWPM = 40;
    const typingTimeSeconds = (words / typingSpeedWPM) * 60;

    // Add some randomness and ensure minimum/maximum times
    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
    const finalTime = typingTimeSeconds * randomFactor;

    return Math.max(1, Math.min(8, finalTime)); // Between 1 and 8 seconds
  }
}

// Export singleton instance
export const responseGenerationService = new ResponseGenerationService(
  new BedrockClientService(),
  new IntentDetectionService(new BedrockClientService())
);