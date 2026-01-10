/**
 * Product Service for AI Marketplace Assistant Bot
 * Provides comprehensive product CRUD operations with search capabilities
 * Implements multi-tenant product management with inventory tracking
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand 
} from '@aws-sdk/lib-dynamodb';
import { TenantProduct } from '../types/tenant';
import { v4 as uuidv4 } from 'uuid';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'ai-marketplace-products-platform';

export interface ProductSearchFilters {
  category?: string;
  status?: 'available' | 'sold' | 'reserved';
  priceMin?: number;
  priceMax?: number;
  condition?: 'new' | 'used' | 'refurbished';
  location?: string;
  searchTerm?: string;
}

export interface ProductSearchResult {
  products: TenantProduct[];
  totalCount: number;
  hasMore: boolean;
  nextToken?: string;
}

export interface CreateProductRequest {
  tenantId: string;
  name: string;
  description: string;
  price: number;
  discountRange?: { min: number; max: number };
  category: string;
  condition: 'new' | 'used' | 'refurbished';
  location: string;
  images?: string[];
  status?: 'available' | 'sold' | 'reserved';
}

export interface UpdateProductRequest {
  tenantId: string;
  productId: string;
  name?: string;
  description?: string;
  price?: number;
  discountRange?: { min: number; max: number };
  category?: string;
  condition?: 'new' | 'used' | 'refurbished';
  location?: string;
  images?: string[];
  status?: 'available' | 'sold' | 'reserved';
}

export interface InventoryStats {
  tenantId: string;
  totalProducts: number;
  availableProducts: number;
  soldProducts: number;
  reservedProducts: number;
  totalValue: number;
  averagePrice: number;
  categoryCounts: Record<string, number>;
}

/**
 * Product Service - handles all product-related operations
 */
export class ProductService {
  
  /**
   * Create a new product
   */
  async createProduct(request: CreateProductRequest): Promise<TenantProduct> {
    // Validate required fields
    this.validateProductData(request);
    
    const productId = uuidv4();
    const now = new Date().toISOString();
    
    const product: TenantProduct = {
      tenantId: request.tenantId,
      productId,
      name: request.name,
      description: request.description,
      price: request.price,
      discountRange: request.discountRange || { min: 0, max: 0 },
      category: request.category,
      condition: request.condition,
      location: request.location,
      images: request.images || [],
      status: request.status || 'available',
      createdAt: now,
      updatedAt: now,
      syncStatus: {
        facebook: { synced: false, lastSync: '' },
        whatsappStatus: { synced: false, lastSync: '' }
      }
    };
    
    const command = new PutCommand({
      TableName: PRODUCTS_TABLE,
      Item: product,
      ConditionExpression: 'attribute_not_exists(productId)'
    });
    
    try {
      await docClient.send(command);
      return product;
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        throw new Error(`Product with ID ${productId} already exists`);
      }
      throw new Error(`Failed to create product: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get a product by ID
   */
  async getProduct(tenantId: string, productId: string): Promise<TenantProduct | null> {
    const command = new GetCommand({
      TableName: PRODUCTS_TABLE,
      Key: {
        tenantId,
        productId
      }
    });
    
    try {
      const result = await docClient.send(command);
      return result.Item as TenantProduct || null;
    } catch (error) {
      throw new Error(`Failed to get product: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update a product
   */
  async updateProduct(request: UpdateProductRequest): Promise<TenantProduct> {
    const { tenantId, productId, ...updates } = request;
    
    // Validate update data
    if (Object.keys(updates).length === 0) {
      throw new Error('No update fields provided');
    }
    
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });
    
    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    const command = new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(productId)',
      ReturnValues: 'ALL_NEW'
    });
    
    try {
      const result = await docClient.send(command);
      return result.Attributes as TenantProduct;
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        throw new Error(`Product with ID ${productId} not found`);
      }
      throw new Error(`Failed to update product: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete a product
   */
  async deleteProduct(tenantId: string, productId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
      ConditionExpression: 'attribute_exists(productId)'
    });
    
    try {
      await docClient.send(command);
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        throw new Error(`Product with ID ${productId} not found`);
      }
      throw new Error(`Failed to delete product: ${(error as Error).message}`);
    }
  }
  
  /**
   * Search products with filters and pagination
   */
  async searchProducts(
    tenantId: string, 
    filters: ProductSearchFilters = {}, 
    limit: number = 20,
    nextToken?: string
  ): Promise<ProductSearchResult> {
    
    // Build filter expressions
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    // Add tenant filter
    expressionAttributeNames['#tenantId'] = 'tenantId';
    expressionAttributeValues[':tenantId'] = tenantId;
    
    // Add other filters
    if (filters.category) {
      filterExpressions.push('#category = :category');
      expressionAttributeNames['#category'] = 'category';
      expressionAttributeValues[':category'] = filters.category;
    }
    
    if (filters.status) {
      filterExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = filters.status;
    }
    
    if (filters.condition) {
      filterExpressions.push('#condition = :condition');
      expressionAttributeNames['#condition'] = 'condition';
      expressionAttributeValues[':condition'] = filters.condition;
    }
    
    if (filters.priceMin !== undefined) {
      filterExpressions.push('#price >= :priceMin');
      expressionAttributeNames['#price'] = 'price';
      expressionAttributeValues[':priceMin'] = filters.priceMin;
    }
    
    if (filters.priceMax !== undefined) {
      filterExpressions.push('#price <= :priceMax');
      expressionAttributeNames['#price'] = 'price';
      expressionAttributeValues[':priceMax'] = filters.priceMax;
    }
    
    if (filters.location) {
      filterExpressions.push('contains(#location, :location)');
      expressionAttributeNames['#location'] = 'location';
      expressionAttributeValues[':location'] = filters.location;
    }
    
    // For search term, we'll search in name and description
    if (filters.searchTerm) {
      filterExpressions.push('(contains(#name, :searchTerm) OR contains(#description, :searchTerm))');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':searchTerm'] = filters.searchTerm;
    }
    
    const command = new QueryCommand({
      TableName: PRODUCTS_TABLE,
      KeyConditionExpression: '#tenantId = :tenantId',
      FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
    });
    
    try {
      const result = await docClient.send(command);
      
      return {
        products: result.Items as TenantProduct[] || [],
        totalCount: result.Count || 0,
        hasMore: !!result.LastEvaluatedKey,
        nextToken: result.LastEvaluatedKey ? 
          Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined
      };
    } catch (error) {
      throw new Error(`Failed to search products: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get products by category
   */
  async getProductsByCategory(tenantId: string, category: string): Promise<TenantProduct[]> {
    const result = await this.searchProducts(tenantId, { category }, 100);
    return result.products;
  }
  
  /**
   * Get available products only
   */
  async getAvailableProducts(tenantId: string, limit: number = 20): Promise<TenantProduct[]> {
    const result = await this.searchProducts(tenantId, { status: 'available' }, limit);
    return result.products;
  }
  
  /**
   * Get inventory statistics for a tenant
   */
  async getInventoryStats(tenantId: string): Promise<InventoryStats> {
    const command = new QueryCommand({
      TableName: PRODUCTS_TABLE,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': tenantId
      }
    });
    
    try {
      const result = await docClient.send(command);
      const products = result.Items as TenantProduct[] || [];
      
      const stats: InventoryStats = {
        tenantId,
        totalProducts: products.length,
        availableProducts: products.filter(p => p.status === 'available').length,
        soldProducts: products.filter(p => p.status === 'sold').length,
        reservedProducts: products.filter(p => p.status === 'reserved').length,
        totalValue: products.reduce((sum, p) => sum + p.price, 0),
        averagePrice: products.length > 0 ? products.reduce((sum, p) => sum + p.price, 0) / products.length : 0,
        categoryCounts: {}
      };
      
      // Calculate category counts
      products.forEach(product => {
        stats.categoryCounts[product.category] = (stats.categoryCounts[product.category] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get inventory stats: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update product sync status
   */
  async updateSyncStatus(
    tenantId: string, 
    productId: string, 
    platform: 'facebook' | 'whatsappStatus', 
    synced: boolean, 
    lastSync?: string
  ): Promise<void> {
    const command = new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
      UpdateExpression: `SET syncStatus.#platform = :syncData, updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        '#platform': platform
      },
      ExpressionAttributeValues: {
        ':syncData': {
          synced,
          lastSync: lastSync || new Date().toISOString()
        },
        ':updatedAt': new Date().toISOString()
      },
      ConditionExpression: 'attribute_exists(productId)'
    });
    
    try {
      await docClient.send(command);
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        throw new Error(`Product with ID ${productId} not found`);
      }
      throw new Error(`Failed to update sync status: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get products that need syncing to a platform
   */
  async getProductsNeedingSync(tenantId: string, platform: 'facebook' | 'whatsappStatus'): Promise<TenantProduct[]> {
    const command = new QueryCommand({
      TableName: PRODUCTS_TABLE,
      KeyConditionExpression: 'tenantId = :tenantId',
      FilterExpression: `syncStatus.#platform.synced = :false OR attribute_not_exists(syncStatus.#platform)`,
      ExpressionAttributeNames: {
        '#platform': platform
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':false': false
      }
    });
    
    try {
      const result = await docClient.send(command);
      return result.Items as TenantProduct[] || [];
    } catch (error) {
      throw new Error(`Failed to get products needing sync: ${(error as Error).message}`);
    }
  }
  
  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(tenantId: string, productIds: string[], status: 'available' | 'sold' | 'reserved'): Promise<void> {
    const updatePromises = productIds.map(productId => 
      this.updateProduct({ tenantId, productId, status })
    );
    
    try {
      await Promise.all(updatePromises);
    } catch (error) {
      throw new Error(`Failed to bulk update product status: ${(error as Error).message}`);
    }
  }
  
  /**
   * Validate product data
   */
  private validateProductData(data: CreateProductRequest | UpdateProductRequest): void {
    if ('name' in data && (!data.name || data.name.trim().length === 0)) {
      throw new Error('Product name is required');
    }
    
    if ('description' in data && (!data.description || data.description.trim().length === 0)) {
      throw new Error('Product description is required');
    }
    
    if ('price' in data && (data.price === undefined || data.price < 0)) {
      throw new Error('Product price must be a positive number');
    }
    
    if ('category' in data && (!data.category || data.category.trim().length === 0)) {
      throw new Error('Product category is required');
    }
    
    if ('condition' in data && data.condition && !['new', 'used', 'refurbished'].includes(data.condition)) {
      throw new Error('Product condition must be new, used, or refurbished');
    }
    
    if ('status' in data && data.status && !['available', 'sold', 'reserved'].includes(data.status)) {
      throw new Error('Product status must be available, sold, or reserved');
    }
    
    if ('location' in data && (!data.location || data.location.trim().length === 0)) {
      throw new Error('Product location is required');
    }
  }
}