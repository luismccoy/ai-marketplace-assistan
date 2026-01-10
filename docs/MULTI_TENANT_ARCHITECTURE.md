# Multi-Tenant Architecture Guide

## Overview

The AI Marketplace Assistant implements a comprehensive multi-tenant SaaS architecture that allows multiple businesses to use the platform with complete data isolation, tenant-specific configurations, and usage tracking.

## Architecture Components

### 1. Tenant Resolution

**Service**: `src/services/tenant-resolver.ts`

The tenant resolver identifies which tenant a WhatsApp message belongs to and loads their configuration.

```typescript
// Resolve tenant from WhatsApp number
const resolution = await tenantResolver.resolveTenantFromWhatsApp('+573001234567');
if (resolution.isValid) {
  const { tenantId, tenantConfig } = resolution;
  // Process with tenant context
}
```

**Key Features:**
- WhatsApp number to tenant mapping
- Tenant configuration caching (5-minute TTL)
- Tenant isolation validation
- Usage limits checking

### 2. Data Isolation

**Service**: `src/services/tenant-data-access.ts`

All data operations are tenant-aware using composite keys for complete isolation.

**Key Patterns:**
- **Conversations**: `tenantId#conversationId`
- **Customers**: `tenantId#phoneNumber`
- **Products**: `tenantId#productId`
- **Tenants**: `tenantId` (primary table)

```typescript
// Tenant-aware data access
const conversation = await tenantDataAccess.getConversation(tenantId, conversationId);
const customer = await tenantDataAccess.getCustomerProfile(tenantId, phoneNumber);
const products = await tenantDataAccess.getTenantProducts(tenantId, 'available');
```

### 3. Usage Tracking

**Service**: `src/services/tenant-usage-tracker.ts`

Real-time usage tracking with automatic limits enforcement.

```typescript
// Track usage and enforce limits
const canProcess = await tenantUsageTracker.trackMessage(tenantId);
if (!canProcess) {
  // Handle limit exceeded
}

await tenantUsageTracker.trackTokens(tenantId, tokensUsed);
```

**Tracked Metrics:**
- Messages per day
- Conversations per month
- AI tokens consumed
- Storage usage (GB)
- Daily statistics breakdown

## Database Schema

### Tenants Table (`ai-marketplace-tenants-platform`)

```json
{
  "tenantId": "tenant_electronics_store",
  "businessName": "ElectroMax",
  "whatsappNumbers": ["+573001234567", "+573007654321"],
  "status": "active",
  "plan": "pro",
  "businessConfig": {
    "communicationStyle": {
      "tone": "friendly",
      "useEmojis": true,
      "greetingStyle": "¡Hola! ¿En qué te puedo ayudar?"
    },
    "shippingInfo": {
      "available": true,
      "zones": ["bogotá", "medellín"],
      "costs": {"bogotá": 15000}
    }
  },
  "aiConfig": {
    "model": "claude-3-sonnet",
    "maxTokens": 1500,
    "temperature": 0.7,
    "enableRAG": true
  },
  "limits": {
    "maxConversationsPerMonth": 1000,
    "maxMessagesPerDay": 2000,
    "maxProductsCount": 200,
    "maxStorageGB": 5
  }
}
```

**GSI**: `WhatsAppNumberIndex` - Enables lookup by phone number

### Conversations Table (`ai-marketplace-conversations-platform`)

```json
{
  "conversationId": "tenant_electronics_store#conv_+573001234567",
  "timestamp": 0,
  "tenantId": "tenant_electronics_store",
  "customerId": "+573001234567",
  "status": "active",
  "messages": [...],
  "lastIntent": "product_inquiry"
}
```

**GSI**: `TenantIndex` - Enables tenant-specific queries

### Products Table (`ai-marketplace-products-platform`)

```json
{
  "productId": "tenant_electronics_store#iphone_14_pro",
  "tenantId": "tenant_electronics_store",
  "name": "iPhone 14 Pro 128GB",
  "price": 3500000,
  "status": "available",
  "category": "smartphones"
}
```

**GSI**: `TenantProductsIndex` - Enables tenant + status queries

## Tenant Onboarding

### 1. Create Tenant Configuration

```typescript
const newTenant = TenantResolver.createDefaultTenantConfig(
  'tenant_new_business',
  'New Business Name',
  ['+573009999999'],
  'admin@newbusiness.com'
);

// Customize configuration
newTenant.businessConfig.communicationStyle.tone = 'formal';
newTenant.aiConfig.model = 'claude-3-haiku';
newTenant.limits.maxMessagesPerDay = 500;

// Save to database
await docClient.send(new PutCommand({
  TableName: 'ai-marketplace-tenants-platform',
  Item: newTenant
}));
```

### 2. Configure WhatsApp Integration

Each tenant needs their own WhatsApp Business API credentials:

```json
{
  "integrations": {
    "whatsappBusinessAPI": {
      "accessToken": "EAAG...",
      "phoneNumberId": "123456789",
      "verifyToken": "tenant_verify_token"
    }
  }
}
```

### 3. Add Sample Products

```typescript
const sampleProduct = {
  productId: `${tenantId}#sample_product_1`,
  tenantId: tenantId,
  name: 'Sample Product',
  description: 'A sample product for testing',
  price: 100000,
  status: 'available',
  category: 'electronics',
  condition: 'new',
  location: 'Bogotá',
  images: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};
```

## Configuration Management

### Business Configuration

Each tenant can customize their bot's behavior:

```typescript
interface BusinessConfig {
  communicationStyle: {
    tone: 'formal' | 'friendly' | 'casual';
    useEmojis: boolean;
    typicalPhrases: string[];
    greetingStyle: string;
    closingStyle: string;
  };
  shippingInfo: {
    available: boolean;
    zones: string[];
    costs: Record<string, number>;
    estimatedDays: number;
  };
  discountPolicy: {
    allowNegotiation: boolean;
    maxDiscountPercent: number;
    bulkDiscounts: boolean;
  };
}
```

### AI Configuration

Per-tenant AI model settings:

```typescript
interface AIConfig {
  model: 'claude-3-haiku' | 'claude-3-sonnet';
  maxTokens: number;
  temperature: number;
  enableRAG: boolean;
  customPrompts?: {
    systemPrompt?: string;
    greetingPrompt?: string;
    escalationPrompt?: string;
  };
}
```

## Usage Limits & Monitoring

### Limit Types

1. **Messages per Day**: Prevents spam and controls costs
2. **Conversations per Month**: Limits active customer interactions
3. **Products Count**: Maximum inventory items
4. **Storage (GB)**: File storage for images, documents

### Monitoring

```typescript
// Check current usage
const usage = await tenantUsageTracker.getCurrentUsage(tenantId);
console.log(`Messages: ${usage.messagesCount}/${limits.maxMessagesPerDay}`);

// Check warning thresholds (80%)
const warnings = await tenantUsageTracker.checkWarningThresholds(tenantId);
if (warnings.messages) {
  // Send warning notification
}
```

## Security & Isolation

### Data Isolation

1. **Composite Keys**: All resources use `tenantId#resourceId` pattern
2. **Validation**: Every operation validates tenant ownership
3. **GSI Queries**: Tenant-specific indexes prevent cross-tenant access

### Access Control

```typescript
// Validate tenant access before any operation
const isolation = tenantDataAccess.validateTenantAccess(
  requestTenantId,
  resourceTenantId,
  'read',
  'product',
  productId
);

if (!isolation.isValid) {
  throw new Error(isolation.errorMessage);
}
```

## Performance Optimization

### Caching Strategy

1. **Tenant Config**: 5-minute cache for frequently accessed configurations
2. **Product Queries**: Cache available products per tenant
3. **Usage Counters**: Batch updates to reduce DynamoDB writes

### Scaling Considerations

1. **Lambda Concurrency**: Auto-scaling based on tenant load
2. **DynamoDB**: On-demand billing with burst capacity
3. **API Gateway**: Rate limiting per tenant (future enhancement)

## Troubleshooting

### Common Issues

1. **Tenant Not Found**
   ```
   Error: No active tenant found for WhatsApp number
   Solution: Check tenant configuration and WhatsApp number mapping
   ```

2. **Usage Limits Exceeded**
   ```
   Error: Tenant has exceeded message limits
   Solution: Check usage tracking and increase limits if needed
   ```

3. **Data Isolation Violation**
   ```
   Error: Tenant cannot access resource belonging to another tenant
   Solution: Verify tenant ID in request and resource ownership
   ```

### Debugging Tools

```bash
# Check tenant configuration
aws dynamodb get-item --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"tenant_id_here"}}'

# Check usage statistics
aws dynamodb get-item --table-name ai-marketplace-tenant-usage \
  --key '{"tenantId":{"S":"tenant_id_here"},"month":{"S":"2026-01"}}'

# List tenant resources
aws dynamodb scan --table-name ai-marketplace-products-platform \
  --filter-expression "tenantId = :tid" \
  --expression-attribute-values '{":tid":{"S":"tenant_id_here"}}'
```

## Migration Guide

### From Single-Tenant to Multi-Tenant

1. **Backup existing data**
2. **Create tenant configuration for existing business**
3. **Migrate data with tenant prefixes**
4. **Update application code to use tenant-aware services**
5. **Test thoroughly with multiple tenants**

### Adding New Tenants

1. Use the tenant initialization script: `src/scripts/initialize-tenants.ts`
2. Configure WhatsApp Business API credentials
3. Add sample products and test conversations
4. Monitor usage and adjust limits as needed

## Best Practices

1. **Always validate tenant isolation** before data operations
2. **Use tenant-aware services** instead of direct DynamoDB access
3. **Monitor usage patterns** and adjust limits proactively
4. **Cache tenant configurations** to reduce database load
5. **Implement proper error handling** for tenant-related failures
6. **Test with multiple tenants** during development
7. **Use composite keys consistently** for all tenant resources

## API Reference

See the TypeScript interfaces in:
- `src/types/tenant.ts` - All tenant-related types
- `src/services/tenant-resolver.ts` - Tenant resolution methods
- `src/services/tenant-data-access.ts` - Data access patterns
- `src/services/tenant-usage-tracker.ts` - Usage tracking methods