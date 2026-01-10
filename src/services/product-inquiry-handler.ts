/**
 * Product Inquiry Handler Service
 * Handles customer product inquiries with availability checking, pricing, and recommendations
 */

import { ProductService } from './product-service';
import { TenantProduct } from '../types/tenant';

export interface ProductInquiry {
  tenantId: string;
  customerId: string;
  inquiryType: 'availability' | 'price' | 'description' | 'shipping' | 'recommendation';
  productId?: string;
  searchTerm?: string;
  category?: string;
  priceRange?: { min: number; max: number };
  location?: string;
}

export interface ProductInquiryResponse {
  success: boolean;
  message: string;
  products?: TenantProduct[];
  recommendations?: TenantProduct[];
  metadata?: {
    totalFound: number;
    searchTerm?: string;
    category?: string;
    priceRange?: { min: number; max: number };
  };
}

export interface StockLevel {
  productId: string;
  status: 'available' | 'sold' | 'reserved' | 'low_stock' | 'out_of_stock';
  quantity?: number;
  lastUpdated: string;
}

export interface ProductRecommendation {
  product: TenantProduct;
  score: number;
  reason: string;
}

/**
 * Product Inquiry Handler - processes customer product inquiries
 */
export class ProductInquiryHandler {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  /**
   * Handle product availability inquiry
   */
  async handleAvailabilityInquiry(inquiry: ProductInquiry): Promise<ProductInquiryResponse> {
    try {
      if (inquiry.productId) {
        // Check specific product availability
        const product = await this.productService.getProduct(inquiry.tenantId, inquiry.productId);

        if (!product) {
          return {
            success: false,
            message: 'Lo siento, no encontré ese producto en nuestro catálogo.'
          };
        }

        const availabilityMessage = this.generateAvailabilityMessage(product);

        return {
          success: true,
          message: availabilityMessage,
          products: [product]
        };
      } else if (inquiry.searchTerm) {
        // Search for products by term
        const searchResult = await this.productService.searchProducts(
          inquiry.tenantId,
          {
            searchTerm: inquiry.searchTerm,
            status: 'available'
          },
          10
        );

        if (searchResult.products.length === 0) {
          return {
            success: false,
            message: `No encontré productos disponibles que coincidan con "${inquiry.searchTerm}". ¿Te puedo ayudar con algo más específico?`
          };
        }

        const message = this.generateSearchResultsMessage(searchResult.products, inquiry.searchTerm);

        return {
          success: true,
          message,
          products: searchResult.products,
          metadata: {
            totalFound: searchResult.totalCount,
            searchTerm: inquiry.searchTerm
          }
        };
      } else {
        // Show available products in general
        const availableProducts = await this.productService.getAvailableProducts(inquiry.tenantId, 5);

        if (availableProducts.length === 0) {
          return {
            success: false,
            message: 'En este momento no tenemos productos disponibles. Te avisaré cuando tengamos nuevos productos.'
          };
        }

        const message = this.generateGeneralAvailabilityMessage(availableProducts);

        return {
          success: true,
          message,
          products: availableProducts
        };
      }
    } catch (error) {
      console.error('Error handling availability inquiry:', error);
      return {
        success: false,
        message: 'Disculpa, tuve un problema consultando la disponibilidad. ¿Puedes intentar de nuevo?'
      };
    }
  }

  /**
   * Handle product price inquiry
   */
  async handlePriceInquiry(inquiry: ProductInquiry): Promise<ProductInquiryResponse> {
    try {
      if (inquiry.productId) {
        const product = await this.productService.getProduct(inquiry.tenantId, inquiry.productId);

        if (!product) {
          return {
            success: false,
            message: 'No encontré ese producto para consultar el precio.'
          };
        }

        const priceMessage = this.generatePriceMessage(product);

        return {
          success: true,
          message: priceMessage,
          products: [product]
        };
      } else if (inquiry.priceRange) {
        // Search products within price range
        const searchResult = await this.productService.searchProducts(
          inquiry.tenantId,
          {
            priceMin: inquiry.priceRange.min,
            priceMax: inquiry.priceRange.max,
            status: 'available'
          },
          10
        );

        if (searchResult.products.length === 0) {
          return {
            success: false,
            message: `No encontré productos disponibles en el rango de $${inquiry.priceRange.min.toLocaleString()} - $${inquiry.priceRange.max.toLocaleString()}.`
          };
        }

        const message = this.generatePriceRangeMessage(searchResult.products, inquiry.priceRange);

        return {
          success: true,
          message,
          products: searchResult.products,
          metadata: {
            totalFound: searchResult.totalCount,
            priceRange: inquiry.priceRange
          }
        };
      } else {
        return {
          success: false,
          message: '¿De qué producto te gustaría saber el precio? Puedes decirme el nombre o enviame una foto.'
        };
      }
    } catch (error) {
      console.error('Error handling price inquiry:', error);
      return {
        success: false,
        message: 'Disculpa, tuve un problema consultando los precios. ¿Puedes intentar de nuevo?'
      };
    }
  }

  /**
   * Handle product description inquiry
   */
  async handleDescriptionInquiry(inquiry: ProductInquiry): Promise<ProductInquiryResponse> {
    try {
      if (!inquiry.productId) {
        return {
          success: false,
          message: '¿De qué producto te gustaría saber más detalles? Puedes decirme el nombre.'
        };
      }

      const product = await this.productService.getProduct(inquiry.tenantId, inquiry.productId);

      if (!product) {
        return {
          success: false,
          message: 'No encontré ese producto para darte más información.'
        };
      }

      const descriptionMessage = this.generateDescriptionMessage(product);

      return {
        success: true,
        message: descriptionMessage,
        products: [product]
      };
    } catch (error) {
      console.error('Error handling description inquiry:', error);
      return {
        success: false,
        message: 'Disculpa, tuve un problema obteniendo la información del producto. ¿Puedes intentar de nuevo?'
      };
    }
  }

  /**
   * Handle product recommendation inquiry
   */
  async handleRecommendationInquiry(inquiry: ProductInquiry): Promise<ProductInquiryResponse> {
    try {
      const recommendations = await this.generateProductRecommendations(inquiry);

      if (recommendations.length === 0) {
        return {
          success: false,
          message: 'En este momento no tengo recomendaciones específicas, pero puedo mostrarte nuestros productos disponibles.'
        };
      }

      const message = this.generateRecommendationMessage(recommendations);

      return {
        success: true,
        message,
        products: recommendations.map(r => r.product),
        recommendations: recommendations.map(r => r.product)
      };
    } catch (error) {
      console.error('Error handling recommendation inquiry:', error);
      return {
        success: false,
        message: 'Disculpa, tuve un problema generando recomendaciones. ¿Te puedo ayudar con algo específico?'
      };
    }
  }

  /**
   * Handle product comparison inquiry
   */
  async handleComparisonInquiry(tenantId: string, products: TenantProduct[]): Promise<ProductInquiryResponse> {
    try {
      if (products.length < 2) {
        return {
          success: false,
          message: 'Necesito al menos dos productos para hacer una comparación.'
        };
      }

      const comparisonMessage = this.generateComparisonMessage(products);

      return {
        success: true,
        message: comparisonMessage,
        products: products
      };
    } catch (error) {
      console.error('Error handling comparison inquiry:', error);
      return {
        success: false,
        message: 'Disculpa, no pude generar la comparación en este momento.'
      };
    }
  }

  /**
   * Check stock levels for products
   */
  async checkStockLevels(tenantId: string, productIds: string[]): Promise<StockLevel[]> {
    try {
      const stockLevels: StockLevel[] = [];

      for (const productId of productIds) {
        const product = await this.productService.getProduct(tenantId, productId);

        if (product) {
          stockLevels.push({
            productId,
            status: product.status,
            lastUpdated: product.updatedAt
          });
        } else {
          stockLevels.push({
            productId,
            status: 'out_of_stock',
            lastUpdated: new Date().toISOString()
          });
        }
      }

      return stockLevels;
    } catch (error) {
      console.error('Error checking stock levels:', error);
      return [];
    }
  }

  /**
   * Update stock level for a product
   */
  async updateStockLevel(tenantId: string, productId: string, status: 'available' | 'sold' | 'reserved'): Promise<void> {
    try {
      await this.productService.updateProduct({
        tenantId,
        productId,
        status
      });
    } catch (error) {
      console.error('Error updating stock level:', error);
      throw new Error(`Failed to update stock level for product ${productId}`);
    }
  }

  /**
   * Generate product recommendations based on inquiry
   */
  private async generateProductRecommendations(inquiry: ProductInquiry): Promise<ProductRecommendation[]> {
    const recommendations: ProductRecommendation[] = [];

    try {
      // Get available products
      let products: TenantProduct[] = [];

      if (inquiry.category) {
        products = await this.productService.getProductsByCategory(inquiry.tenantId, inquiry.category);
      } else {
        const searchResult = await this.productService.searchProducts(
          inquiry.tenantId,
          { status: 'available' },
          20
        );
        products = searchResult.products;
      }

      // Score and rank products
      for (const product of products) {
        let score = 0;
        let reasons: string[] = [];

        // Base score for availability
        if (product.status === 'available') {
          score += 10;
        }

        // 1. Category match (High weight)
        if (inquiry.category && product.category.toLowerCase() === inquiry.category.toLowerCase()) {
          score += 20;
          reasons.push(`Categoría: ${product.category}`);
        }

        // 2. Keyword Similarity (Semantic approximation)
        if (inquiry.searchTerm) {
          const keywordScore = this.calculateKeywordScore(inquiry.searchTerm, product.name + ' ' + product.description);
          if (keywordScore > 0) {
            score += keywordScore * 30; // High weight for name match
            reasons.push('Coincidencia por palabras clave');
          }
        }

        // 3. Price range match
        if (inquiry.priceRange) {
          if (product.price >= inquiry.priceRange.min && product.price <= inquiry.priceRange.max) {
            score += 15;
            reasons.push('Dentro de tu presupuesto');
          } else if (product.price <= inquiry.priceRange.max * 1.2) {
            // Slightly over budget but close
            score += 5;
            reasons.push('Cerca de tu presupuesto');
          }
        }

        // 4. Location preference
        if (inquiry.location && product.location.toLowerCase().includes(inquiry.location.toLowerCase())) {
          score += 5;
          reasons.push(`Ubicación: ${product.location}`);
        }

        // 5. Condition preference
        if (product.condition === 'new') {
          score += 5;
        }

        if (score > 15) { // Threshold to avoid irrelevant junk
          recommendations.push({
            product,
            score,
            reason: reasons.join(' • ') || 'Recomendado para ti'
          });
        }
      }

      // Sort by score and return top 5
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  /**
   * Calculate Jaccard similarity between two text strings
   */
  private calculateKeywordScore(text1: string, text2: string): number {
    const tokenize = (text: string) => new Set(text.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 3));
    const set1 = tokenize(text1);
    const set2 = tokenize(text2);

    if (set1.size === 0 || set2.size === 0) return 0;

    let intersection = 0;
    set1.forEach(word => {
      if (set2.has(word)) intersection++;
    });

    return intersection / (set1.size + set2.size - intersection); // Jaccard Index
  }

  /**
   * Generate availability message for a product
   */
  private generateAvailabilityMessage(product: TenantProduct): string {
    const statusMessages = {
      available: '✅ ¡Sí está disponible!',
      sold: '❌ Lo siento, ya se vendió.',
      reserved: '⏳ Está reservado, pero te aviso si se libera.'
    };

    const baseMessage = statusMessages[product.status];

    if (product.status === 'available') {
      return `${baseMessage} ${product.name} - $${product.price.toLocaleString()} (${product.condition}) en ${product.location}. ¿Te interesa?`;
    } else {
      return `${baseMessage} ¿Te puedo recomendar algo similar?`;
    }
  }

  /**
   * Generate search results message
   */
  private generateSearchResultsMessage(products: TenantProduct[], searchTerm?: string): string {
    if (products.length === 1) {
      const product = products[0];
      return `Encontré esto que coincide con "${searchTerm}":\n\n📱 ${product.name}\n💰 $${product.price.toLocaleString()}\n📍 ${product.location}\n✨ ${product.condition}\n\n¿Te interesa saber más?`;
    } else {
      let message = `Encontré ${products.length} productos que coinciden con "${searchTerm}":\n\n`;

      products.slice(0, 3).forEach((product, index) => {
        message += `${index + 1}. ${product.name} - $${product.price.toLocaleString()} (${product.location})\n`;
      });

      if (products.length > 3) {
        message += `\n... y ${products.length - 3} más. ¿Cuál te interesa?`;
      } else {
        message += '\n¿Cuál te interesa?';
      }

      return message;
    }
  }

  /**
   * Generate general availability message
   */
  private generateGeneralAvailabilityMessage(products: TenantProduct[]): string {
    let message = '¡Tengo estos productos disponibles:\n\n';

    products.forEach((product, index) => {
      message += `${index + 1}. ${product.name} - $${product.price.toLocaleString()}\n`;
    });

    message += '\n¿Cuál te interesa? Puedo darte más detalles de cualquiera.';

    return message;
  }

  /**
   * Generate price message for a product
   */
  private generatePriceMessage(product: TenantProduct): string {
    let message = `💰 ${product.name}: $${product.price.toLocaleString()}`;

    if (product.discountRange && product.discountRange.max > 0) {
      message += `\n🎯 Descuento disponible hasta ${product.discountRange.max}%`;
    }

    message += `\n📍 Ubicación: ${product.location}`;
    message += `\n✨ Condición: ${product.condition}`;

    if (product.status === 'available') {
      message += '\n\n¿Te interesa? ¡Puedo apartártelo!';
    }

    return message;
  }

  /**
   * Generate price range message
   */
  private generatePriceRangeMessage(products: TenantProduct[], priceRange: { min: number; max: number }): string {
    let message = `Encontré ${products.length} productos en el rango de $${priceRange.min.toLocaleString()} - $${priceRange.max.toLocaleString()}:\n\n`;

    products.slice(0, 5).forEach((product, index) => {
      message += `${index + 1}. ${product.name} - $${product.price.toLocaleString()}\n`;
    });

    if (products.length > 5) {
      message += `\n... y ${products.length - 5} más. ¿Cuál te interesa?`;
    } else {
      message += '\n¿Cuál te llama la atención?';
    }

    return message;
  }

  /**
   * Generate description message for a product
   */
  private generateDescriptionMessage(product: TenantProduct): string {
    let message = `📱 ${product.name}\n\n`;
    message += `📝 ${product.description}\n\n`;
    message += `💰 Precio: $${product.price.toLocaleString()}\n`;
    message += `✨ Condición: ${product.condition}\n`;
    message += `📍 Ubicación: ${product.location}\n`;
    message += `📂 Categoría: ${product.category}\n`;

    if (product.discountRange && product.discountRange.max > 0) {
      message += `🎯 Descuento disponible: hasta ${product.discountRange.max}%\n`;
    }

    if (product.status === 'available') {
      message += '\n¿Te interesa? ¡Puedo apartártelo o responder cualquier pregunta!';
    } else {
      message += '\n¿Te puedo recomendar algo similar que esté disponible?';
    }

    return message;
  }

  /**
   * Generate comparison message
   */
  private generateComparisonMessage(products: TenantProduct[]): string {
    const p1 = products[0];
    const p2 = products[1];

    let message = `Comparando ${p1.name} vs ${p2.name}:\n\n`;

    // Price comparison
    message += `💰 *Precio*\n`;
    message += `   • ${p1.name}: $${p1.price.toLocaleString()}\n`;
    message += `   • ${p2.name}: $${p2.price.toLocaleString()}\n\n`;

    // Condition comparison
    message += `✨ *Condición*\n`;
    message += `   • ${p1.name}: ${p1.condition}\n`;
    message += `   • ${p2.name}: ${p2.condition}\n\n`;

    // Calculate suggestion based on price
    if (p1.price < p2.price) {
      const diff = p2.price - p1.price;
      message += `💡 *Dato*: El ${p1.name} es $${diff.toLocaleString()} más económico.\n`;
    } else if (p2.price < p1.price) {
      const diff = p1.price - p2.price;
      message += `💡 *Dato*: El ${p2.name} es $${diff.toLocaleString()} más económico.\n`;
    }

    message += `\n¿Cuál prefieres?`;
    return message;
  }

  /**
   * Generate recommendation message
   */
  private generateRecommendationMessage(recommendations: ProductRecommendation[]): string {
    let message = '¡Te recomiendo estos productos:\n\n';

    recommendations.forEach((rec, index) => {
      message += `${index + 1}. ${rec.product.name} - $${rec.product.price.toLocaleString()}\n`;
      message += `   ${rec.reason}\n\n`;
    });

    message += '¿Cuál te interesa más? Puedo darte todos los detalles.';

    return message;
  }

  /**
   * Handle price negotiation
   */
  async handleNegotiation(
    tenantConfig: any,
    product: any,
    offeredPrice: number
  ): Promise<{ success: boolean; message: string; accepted: boolean; counterOffer?: number }> {
    try {
      const discountPolicy = tenantConfig.businessConfig?.discountPolicy || {
        allowNegotiation: false,
        maxDiscountPercent: 0
      };

      if (!discountPolicy.allowNegotiation) {
        return {
          success: true,
          message: `Lo siento, el precio de $${product.price.toLocaleString()} es fijo y no es negociable.`,
          accepted: false
        };
      }

      const minPrice = product.price * (1 - (discountPolicy.maxDiscountPercent / 100));

      // 1. Accept Offer
      if (offeredPrice >= minPrice) {
        return {
          success: true,
          message: `¡Trato hecho! ✅ Acepto tu oferta de $${offeredPrice.toLocaleString()} por el ${product.name}.`,
          accepted: true
        };
      }

      // 2. Counter Offer (if close, e.g., within 5% of minPrice)
      const counterOfferThreshold = minPrice * 0.95;
      if (offeredPrice >= counterOfferThreshold) {
        const counter = Math.ceil(minPrice / 100) * 100;
        return {
          success: true,
          message: `Hmmm, $${offeredPrice.toLocaleString()} es un poco bajo. ¿Qué te parece si lo dejamos en $${counter.toLocaleString()}?`,
          accepted: false,
          counterOffer: counter
        };
      }

      // 3. Reject Offer
      return {
        success: true,
        message: `No puedo aceptarlo. Lo mínimo que podría considerar es $${Math.ceil(minPrice).toLocaleString()}.`,
        accepted: false
      };

    } catch (error) {
      console.error('Error handling negotiation:', error);
      return {
        success: false,
        message: 'Tuve un problema revisando la oferta. ¿Hablamos luego?',
        accepted: false
      };
    }
  }
}