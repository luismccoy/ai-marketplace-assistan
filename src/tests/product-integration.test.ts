/**
 * Product Integration Tests
 * Tests the integration between product service and inquiry handler
 */

import { ProductService } from '../services/product-service';
import { ProductInquiryHandler } from '../services/product-inquiry-handler';
import { TenantProduct } from '../types/tenant';

// Mock DynamoDB for integration testing
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  PutCommand: jest.fn(),
  GetCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

describe('Product Integration Tests', () => {
  let productService: ProductService;
  let inquiryHandler: ProductInquiryHandler;

  beforeEach(() => {
    productService = new ProductService();
    inquiryHandler = new ProductInquiryHandler();
    mockSend.mockClear();
  });

  const mockProduct: TenantProduct = {
    tenantId: 'tenant-123',
    productId: 'prod-123',
    name: 'iPhone 14 Pro',
    description: 'Excelente estado, incluye cargador y caja original',
    price: 2800000,
    discountRange: { min: 0, max: 10 },
    category: 'electronics',
    condition: 'used',
    location: 'Bogotá',
    images: ['image1.jpg', 'image2.jpg'],
    status: 'available',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncStatus: {
      facebook: { synced: false, lastSync: '' },
      whatsappStatus: { synced: false, lastSync: '' }
    }
  };

  describe('Product CRUD Operations', () => {
    it('should create, retrieve, and update a product', async () => {
      // Mock successful creation
      mockSend.mockResolvedValueOnce({});
      
      // Mock successful retrieval
      mockSend.mockResolvedValueOnce({ Item: mockProduct });
      
      // Mock successful update
      const updatedProduct = { ...mockProduct, price: 2700000 };
      mockSend.mockResolvedValueOnce({ Attributes: updatedProduct });

      // Create product
      const createRequest = {
        tenantId: 'tenant-123',
        name: 'iPhone 14 Pro',
        description: 'Excelente estado, incluye cargador y caja original',
        price: 2800000,
        category: 'electronics',
        condition: 'used' as const,
        location: 'Bogotá',
        images: ['image1.jpg', 'image2.jpg']
      };

      const createdProduct = await productService.createProduct(createRequest);
      expect(createdProduct.name).toBe('iPhone 14 Pro');
      expect(createdProduct.price).toBe(2800000);

      // Retrieve product
      const retrievedProduct = await productService.getProduct('tenant-123', 'prod-123');
      expect(retrievedProduct).toEqual(mockProduct);

      // Update product
      const updateResult = await productService.updateProduct({
        tenantId: 'tenant-123',
        productId: 'prod-123',
        price: 2700000
      });
      expect(updateResult.price).toBe(2700000);
    });

    it('should search products with filters', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [mockProduct],
        Count: 1,
        LastEvaluatedKey: undefined
      });

      const searchResult = await productService.searchProducts(
        'tenant-123',
        { category: 'electronics', status: 'available' }
      );

      expect(searchResult.products).toHaveLength(1);
      expect(searchResult.products[0]).toEqual(mockProduct);
      expect(searchResult.totalCount).toBe(1);
      expect(searchResult.hasMore).toBe(false);
    });
  });

  describe('Product Inquiry Handling', () => {
    it('should handle availability inquiry for existing product', async () => {
      // Mock ProductService.getProduct to return the mock product
      jest.spyOn(productService, 'getProduct').mockResolvedValueOnce(mockProduct);

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability' as const,
        productId: 'prod-123'
      };

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('✅ ¡Sí está disponible!');
      expect(result.message).toContain('iPhone 14 Pro');
      expect(result.products).toHaveLength(1);
    });

    it('should handle price inquiry for existing product', async () => {
      // Mock ProductService.getProduct to return the mock product
      jest.spyOn(productService, 'getProduct').mockResolvedValueOnce(mockProduct);

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'price' as const,
        productId: 'prod-123'
      };

      const result = await inquiryHandler.handlePriceInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('iPhone 14 Pro');
      expect(result.message).toContain('$2.800.000');
      expect(result.message).toContain('Descuento disponible hasta 10%');
    });

    it('should handle description inquiry for existing product', async () => {
      // Mock ProductService.getProduct to return the mock product
      jest.spyOn(productService, 'getProduct').mockResolvedValueOnce(mockProduct);

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'description' as const,
        productId: 'prod-123'
      };

      const result = await inquiryHandler.handleDescriptionInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('iPhone 14 Pro');
      expect(result.message).toContain('Excelente estado, incluye cargador y caja original');
      expect(result.message).toContain('$2.800.000');
      expect(result.message).toContain('Bogotá');
    });

    it('should handle product recommendations', async () => {
      // Mock ProductService.searchProducts to return products
      jest.spyOn(productService, 'searchProducts').mockResolvedValueOnce({
        products: [mockProduct],
        totalCount: 1,
        hasMore: false
      });

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'recommendation' as const,
        category: 'electronics'
      };

      const result = await inquiryHandler.handleRecommendationInquiry(inquiry);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Te recomiendo estos productos');
      expect(result.products).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
    });
  });

  describe('Stock Level Management', () => {
    it('should check and update stock levels', async () => {
      // Mock ProductService.getProduct for stock check
      jest.spyOn(productService, 'getProduct').mockResolvedValueOnce(mockProduct);
      
      // Mock ProductService.updateProduct for stock update
      jest.spyOn(productService, 'updateProduct').mockResolvedValueOnce({
        ...mockProduct,
        status: 'sold'
      });

      // Check stock levels
      const stockLevels = await inquiryHandler.checkStockLevels('tenant-123', ['prod-123']);
      
      expect(stockLevels).toHaveLength(1);
      expect(stockLevels[0]).toEqual({
        productId: 'prod-123',
        status: 'available',
        lastUpdated: mockProduct.updatedAt
      });

      // Update stock level
      await inquiryHandler.updateStockLevel('tenant-123', 'prod-123', 'sold');
      
      expect(productService.updateProduct).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        productId: 'prod-123',
        status: 'sold'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle product not found gracefully', async () => {
      // Mock ProductService.getProduct to return null
      jest.spyOn(productService, 'getProduct').mockResolvedValueOnce(null);

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability' as const,
        productId: 'non-existent'
      };

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('no encontré ese producto');
    });

    it('should handle service errors gracefully', async () => {
      // Mock ProductService.getProduct to throw error
      jest.spyOn(productService, 'getProduct').mockRejectedValueOnce(new Error('Database error'));

      const inquiry = {
        tenantId: 'tenant-123',
        customerId: 'customer-123',
        inquiryType: 'availability' as const,
        productId: 'prod-123'
      };

      const result = await inquiryHandler.handleAvailabilityInquiry(inquiry);

      expect(result.success).toBe(false);
      expect(result.message).toContain('tuve un problema consultando la disponibilidad');
    });
  });
});