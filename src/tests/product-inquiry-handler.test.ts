/**
 * Product Inquiry Handler Tests
 * Unit tests for product inquiry handling functionality
 */

import { ProductInquiryHandler, ProductInquiry } from '../services/product-inquiry-handler';
import { ProductService } from '../services/product-service';
import { TenantProduct } from '../types/tenant';

// Mock ProductService
jest.mock('../services/product-service');

const mockProductService = {
  getProduct: jest.fn(),
  searchProducts: jest.fn(),
  getAvailableProducts: jest.fn(),
  getProductsByCategory: jest.fn(),
  updateProduct: jest.fn()
};

// Replace the ProductService constructor
(ProductService as jest.Mock).mockImplementation(() => mockProductService);

describe('ProductInquiryHandler', () => {
  let inquiryHandler: ProductInquiryHandler;

  beforeEach(() => {
    inquiryHandler = new ProductInquiryHandler();
    jest.clearAllMocks();
  });

  const mockProduct: TenantProduct = {
    tenantId: 'tenant-123',
    productId: 'prod-123',
    name: 'iPhone 14',
    description: 'Excelente estado, incluye cargador',
    price: 2500000,
    discountRange: { min: 0, max: 10 },
    category: 'electronics',
    condition: 'used',
    location: 'Bogotá',
    images: ['image1.jpg'],
    status: 'available',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncStatus: {
      facebook: { synced: false, lastSync: '' },
      whatsappStatus: { synced: false, lastSync: '' }
    }
  };

  describe('handleAvailabilityInquiry', () => {
    it('should handle specific product availability inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability',
        productId: 'prod-123'
      };

      mockProductService.getProduct.mockResolvedValueOnce(mockProduct);

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('✅ ¡Sí está disponible!');
      expect(result.message).toContain('iPhone 14');
      expect(result.products).toHaveLength(1);
      expect(result.products![0]).toEqual(mockProduct);
    });

    it('should handle non-existent product inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability',
        productId: 'non-existent'
      };

      mockProductService.getProduct.mockResolvedValueOnce(null);

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('no encontré ese producto');
    });

    it('should handle search term availability inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability',
        searchTerm: 'iPhone'
      };

      mockProductService.searchProducts.mockResolvedValueOnce({
        products: [mockProduct],
        totalCount: 1,
        hasMore: false
      });

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('iPhone');
      expect(result.products).toHaveLength(1);
      expect(result.metadata?.totalFound).toBe(1);
      expect(result.metadata?.searchTerm).toBe('iPhone');
    });

    it('should handle no search results', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability',
        searchTerm: 'nonexistent'
      };

      mockProductService.searchProducts.mockResolvedValueOnce({
        products: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No encontré productos disponibles');
    });

    it('should handle general availability inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability'
      };

      mockProductService.getAvailableProducts.mockResolvedValueOnce([mockProduct]);

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Tengo estos productos disponibles');
      expect(result.products).toHaveLength(1);
    });
  });

  describe('handlePriceInquiry', () => {
    it('should handle specific product price inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'price',
        productId: 'prod-123'
      };

      mockProductService.getProduct.mockResolvedValueOnce(mockProduct);

      const result = await inquiryHandler.handlePriceInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('iPhone 14');
      expect(result.message).toContain('$2.500.000');
      expect(result.message).toContain('Descuento disponible hasta 10%');
    });

    it('should handle price range inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'price',
        priceRange: { min: 2000000, max: 3000000 }
      };

      mockProductService.searchProducts.mockResolvedValueOnce({
        products: [mockProduct],
        totalCount: 1,
        hasMore: false
      });

      const result = await inquiryHandler.handlePriceInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('$2.000.000 - $3.000.000');
      expect(result.metadata?.priceRange).toEqual({ min: 2000000, max: 3000000 });
    });

    it('should handle no products in price range', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'price',
        priceRange: { min: 5000000, max: 6000000 }
      };

      mockProductService.searchProducts.mockResolvedValueOnce({
        products: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await inquiryHandler.handlePriceInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No encontré productos disponibles en el rango');
    });
  });

  describe('handleDescriptionInquiry', () => {
    it('should handle product description inquiry', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'description',
        productId: 'prod-123'
      };

      mockProductService.getProduct.mockResolvedValueOnce(mockProduct);

      const result = await inquiryHandler.handleDescriptionInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('iPhone 14');
      expect(result.message).toContain('Excelente estado, incluye cargador');
      expect(result.message).toContain('$2.500.000');
      expect(result.message).toContain('Bogotá');
      expect(result.message).toContain('electronics');
    });

    it('should handle missing product ID', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'description'
      };

      const result = await inquiryHandler.handleDescriptionInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('¿De qué producto te gustaría saber más detalles?');
    });
  });

  describe('handleRecommendationInquiry', () => {
    it('should handle recommendation inquiry with category', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'recommendation',
        category: 'electronics'
      };

      mockProductService.getProductsByCategory.mockResolvedValueOnce([mockProduct]);

      const result = await inquiryHandler.handleRecommendationInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Te recomiendo estos productos');
      expect(result.products).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
    });

    it('should handle no recommendations available', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'recommendation'
      };

      mockProductService.searchProducts.mockResolvedValueOnce({
        products: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await inquiryHandler.handleRecommendationInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('no tengo recomendaciones específicas');
    });
  });

  describe('checkStockLevels', () => {
    it('should check stock levels for multiple products', async () => {
      mockProductService.getProduct
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce(null);

      const stockLevels = await inquiryHandler.checkStockLevels('tenant-123', ['prod-123', 'prod-456']);

      expect(stockLevels).toHaveLength(2);
      expect(stockLevels[0]).toEqual({
        productId: 'prod-123',
        status: 'available',
        lastUpdated: mockProduct.updatedAt
      });
      expect(stockLevels[1]).toEqual({
        productId: 'prod-456',
        status: 'out_of_stock',
        lastUpdated: expect.any(String)
      });
    });
  });

  describe('updateStockLevel', () => {
    it('should update product stock level', async () => {
      mockProductService.updateProduct.mockResolvedValueOnce({});

      await expect(
        inquiryHandler.updateStockLevel('tenant-123', 'prod-123', 'sold')
      ).resolves.not.toThrow();

      expect(mockProductService.updateProduct).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        productId: 'prod-123',
        status: 'sold'
      });
    });

    it('should handle update errors', async () => {
      mockProductService.updateProduct.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        inquiryHandler.updateStockLevel('tenant-123', 'prod-123', 'sold')
      ).rejects.toThrow('Failed to update stock level for product prod-123');
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      const inquiry: ProductInquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability',
        productId: 'prod-123'
      };

      mockProductService.getProduct.mockRejectedValueOnce(new Error('Database error'));

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('tuve un problema consultando la disponibilidad');
    });
  });
});