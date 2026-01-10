
import { ResponseGenerationService } from '../src/services/response-generation';
import { IntentDetectionService } from '../src/services/intent-detection';
import { BedrockClientService } from '../src/services/bedrock-client';
import { TenantConfig } from '../src/types/tenant';

interface Product {
    productId: string;
    name: string;
    price: number;
    status: 'available' | 'sold' | 'reserved';
    category: string;
    description: string;
    tenantId: string;
    condition: 'new' | 'used' | 'refurbished';
    location: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
    discountRange: { min: number; max: number };
}

// Mock Bedrock to avoid cost/latency and control intent detection
// Mock Bedrock to avoid cost/latency and control intent detection
const mockBedrock = {
    detectIntent: async () => ({ intent: 'ver_catalogo', confidence: 0.9 }),
    generateResponse: async () => ({ response: 'AI fallback', confidence: 0.5 })
} as any as BedrockClientService;

// Mock IntentDetectionService to force 'ver_catalogo'
const mockIntentService = {
    detectIntent: async () => ({ intent: 'ver_catalogo', confidence: 0.9 })
} as any as IntentDetectionService;

// Setup Service
const responseService = new ResponseGenerationService(mockBedrock, mockIntentService);

// Mock Data
const mockBusinessConfig: TenantConfig['businessConfig'] = {
    communicationStyle: {
        tone: 'friendly',
        useEmojis: true,
        typicalPhrases: [],
        greetingStyle: 'Hola',
        closingStyle: 'Adios'
    },
    shippingInfo: { available: true, zones: [], costs: {}, estimatedDays: 1 },
    discountPolicy: { allowNegotiation: true, maxDiscountPercent: 10, bulkDiscounts: true },
    appointmentConfig: { enabled: true, businessHours: "9am-5pm" },
    paymentConfig: { methods: ["Cash"], instructions: "" }
};

const mockProducts: Product[] = [
    { productId: 'p1', name: 'iPhone 13', price: 900, status: 'available', category: 'Smartphones', description: 'Phone', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } },
    { productId: 'p2', name: 'MacBook Air', price: 1200, status: 'available', category: 'Laptops', description: 'Laptop', tenantId: 't1', condition: 'used', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } },
    { productId: 'p3', name: 'Samsung S21', price: 800, status: 'available', category: 'Smartphones', description: 'Phone', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } }
];


const baseContext = {
    message: 'test message',
    conversationContext: {
        tenantId: 't1', conversationId: 'c1', customerId: 'u1', status: 'active',
        lastIntent: 'general', productInquiries: [], messages: [], createdAt: '', lastUpdate: ''
    } as any,
    businessConfig: mockBusinessConfig,
    customerProfile: {} as any,
    escalationTriggers: []
};


async function testCatalogIntent() {
    console.log('🧪 Verifying Catalog/Show-All Intent...\n');

    // Test 1: Explicit Catalog Request
    console.log('Test 1: "catalogo" (Explicit Intent)');
    const context1 = {
        ...baseContext,
        intent: { intent: 'ver_catalogo', confidence: 0.9, entities: {} },
        availableProducts: mockProducts
    };

    const response1 = await responseService.generateResponse(context1);
    console.log('Response:', response1.response);

    if (response1.intent === 'ver_catalogo' && (response1.response.includes('iPhone 13') || response1.response.includes('Smartphones'))) {
        console.log('✅ Passed: Returned list/categories\n');
    } else {
        console.log('❌ Failed: Did not show products\n');
    }

    // Test 2: Availability Fallback (Empty Product Name)
    console.log('Test 2: "que tienen?" (Availability Intent but no product)');
    const context2 = {
        ...baseContext,
        intent: { intent: 'disponibilidad', confidence: 0.8, entities: {} },
        availableProducts: mockProducts
    };

    const response2 = await responseService.generateResponse(context2);
    console.log('Response:', response2.response);

    // Should hit the fallback logic we added: "If few products... show catalog"
    if (response2.response.includes('iPhone 13')) {
        console.log('✅ Passed: Fallback logic showed products\n');
    } else {
        console.log('❌ Failed: Fallback logic did not show products (Might be asking "what do you want?")\n');
    }

    // Test 3: Many Products (Categories)
    console.log('Test 3: Many Products (Show Categories)');
    const manyProducts = [...mockProducts, ...mockProducts, ...mockProducts]; // 9 products
    const context3 = {
        ...baseContext,
        intent: { intent: 'ver_catalogo', confidence: 0.9, entities: {} },
        availableProducts: manyProducts
    };

    const response3 = await responseService.generateResponse(context3);
    console.log('Response:', response3.response);

    if (response3.response.includes('Tenemos variedad en') && response3.response.includes('Smartphones')) {
        console.log('✅ Passed: Showed categories for many products\n');
    } else {
        console.log('❌ Failed: Did not show categories\n');
    }
}

testCatalogIntent().catch(console.error);
