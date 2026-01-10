/**
 * Product Service Tests
 * Comprehensive unit tests for product CRUD operations
 */

import { ProductService, CreateProductRequest, UpdateProductRequest, ProductSearchFilters } from '../services/product-service';
import { TenantProduct } from '../types/tenant';

// Mock DynamoDB
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

describe('ProductService', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
    mockSend.mockClear();
  });

  describe('createProduct', () => {
    it('should create a new product successfully', async () => {
      const createRequest: CreateProductRequest = {
        tenantId: 'tenant-123',
        name: 'Test Product',
        description: 'A test product description',
        price: 100,
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        images: ['image1.jpg', 'image2.jpg'],
        status: 'available'
      };

      mockSend.mockResolvedValueOnce({});

      const result = await productService.createProduct(createRequest);

      expect(result).toMatchObject({
        tenantId: 'tenant-123',
        name: 'Test Product',
        description: 'A test product description',
        price: 100,
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        status: 'available'
      });
      expect(result.productId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should throw error for invalid product data', async () => {
      const invalidRequest: CreateProductRequest = {
        tenantId: 'tenant-123',
        name: '', // Invalid empty name
        description: 'A test product description',
        price: 100,
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá'
      };

      await expect(productService.createProduct(invalidRequest)).rejects.toThrow('Product name is required');
    });

    it('should throw error for negative price', async () => {
      const invalidRequest: CreateProductRequest = {
        tenantId: 'tenant-123',
        name: 'Test Product',
        description: 'A test product description',
        price: -10, // Invalid negative price
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá'
      };

      await expect(productService.createProduct(invalidRequest)).rejects.toThrow('Product price must be a positive number');
    });
  });

  describe('getProduct', () => {
    it('should retrieve a product successfully', async () => {
      const mockProduct: TenantProduct = {
        tenantId: 'tenant-123',
        productId: 'prod-123',
        name: 'Test Product',
        description: 'A test product',
        price: 100,
        discountRange: { min: 0, max: 10 },
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        images: [],
        status: 'available',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        syncStatus: {
          facebook: { synced: false, lastSync: '' },
          whatsappStatus: { synced: false, lastSync: '' }
        }
      };

      mockSend.mockResolvedValueOnce({ Item: mockProduct });

      const result = await productService.getProduct('tenant-123', 'prod-123');

      expect(result).toEqual(mockProduct);
    });

    it('should return null for non-existent product', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await productService.getProduct('tenant-123', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateProduct', () => {
    it('should update a product successfully', async () => {
      const updateRequest: UpdateProductRequest = {
        tenantId: 'tenant-123',
        productId: 'prod-123',
        name: 'Updated Product Name',
        price: 150
      };

      const updatedProduct: TenantProduct = {
        tenantId: 'tenant-123',
        productId: 'prod-123',
        name: 'Updated Product Name',
        description: 'A test product',
        price: 150,
        discountRange: { min: 0, max: 10 },
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        images: [],
        status: 'available',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
        syncStatus: {
          facebook: { synced: false, lastSync: '' },
          whatsappStatus: { synced: false, lastSync: '' }
        }
      };

      mockSend.mockResolvedValueOnce({ Attributes: updatedProduct });

      const result = await productService.updateProduct(updateRequest);

      expect(result).toEqual(updatedProduct);
    });

    it('should throw error for empty update', async () => {
      const updateRequest: UpdateProductRequest = {
        tenantId: 'tenant-123',
        productId: 'prod-123'
      };

      await expect(productService.updateProduct(updateRequest)).rejects.toThrow('No update fields provided');
    });
  });

  describe('deleteProduct', () => {
    it('should delete a product successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(productService.deleteProduct('tenant-123', 'prod-123')).resolves.not.toThrow();
    });

    it('should throw error for non-existent product', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(productService.deleteProduct('tenant-123', 'non-existent')).rejects.toThrow('Product with ID non-existent not found');
    });
  });

  describe('searchProducts', () => {
    it('should search products with filters', async () => {
      const mockProducts: TenantProduct[] = [
        {
          tenantId: 'tenant-123',
          productId: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 100,
          discountRange: { min: 0, max: 10 },
          category: 'electronics',
          condition: 'new',
          location: 'Bogotá',
          images: [],
          status: 'available',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockProducts,
        Count: 1,
        LastEvaluatedKey: undefined
      });

      const filters: ProductSearchFilters = {
        category: 'electronics',
        status: 'available'
      };

      const result = await productService.searchProducts('tenant-123', filters);

      expect(result.products).toEqual(mockProducts);
      expect(result.totalCount).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination', async () => {
      const mockProducts: TenantProduct[] = [
        {
          tenantId: 'tenant-123',
          productId: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 100,
          discountRange: { min: 0, max: 10 },
          category: 'electronics',
          condition: 'new',
          location: 'Bogotá',
          images: [],
          status: 'available',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockProducts,
        Count: 1,
        LastEvaluatedKey: { tenantId: 'tenant-123', productId: 'prod-1' }
      });

      const result = await productService.searchProducts('tenant-123', {}, 20);

      expect(result.hasMore).toBe(true);
      expect(result.nextToken).toBeDefined();
    });
  });

  describe('getInventoryStats', () => {
    it('should calculate inventory statistics correctly', async () => {
      const mockProducts: TenantProduct[] = [
        {
          tenantId: 'tenant-123',
          productId: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 100,
          discountRange: { min: 0, max: 10 },
          category: 'electronics',
          condition: 'new',
          location: 'Bogotá',
          images: [],
          status: 'available',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          tenantId: 'tenant-123',
          productId: 'prod-2',
          name: 'Product 2',
          description: 'Description 2',
          price: 200,
          discountRange: { min: 0, max: 15 },
          category: 'clothing',
          condition: 'used',
          location: 'Medellín',
          images: [],
          status: 'sold',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: mockProducts });

      const stats = await productService.getInventoryStats('tenant-123');

      expect(stats).toEqual({
        tenantId: 'tenant-123',
        totalProducts: 2,
        availableProducts: 1,
        soldProducts: 1,
        reservedProducts: 0,
        totalValue: 300,
        averagePrice: 150,
        categoryCounts: {
          electronics: 1,
          clothing: 1
        }
      });
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update multiple products status', async () => {
      const updatedProduct: TenantProduct = {
        tenantId: 'tenant-123',
        productId: 'prod-1',
        name: 'Product 1',
        description: 'Description 1',
        price: 100,
        discountRange: { min: 0, max: 10 },
        category: 'electronics',
        condition: 'new',
        location: 'Bogotá',
        images: [],
        status: 'sold',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z'
      };

      mockSend.mockResolvedValue({ Attributes: updatedProduct });

      await expect(
        productService.bulkUpdateStatus('tenant-123', ['prod-1', 'prod-2'], 'sold')
      ).resolves.not.toThrow();
    });
  });
});