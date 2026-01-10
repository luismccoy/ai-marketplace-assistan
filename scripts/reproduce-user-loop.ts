
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
const mockBedrock = {
    detectIntent: async () => ({ intent: 'ver_catalogo', confidence: 0.9 }),
    generateResponse: async () => ({ response: 'AI fallback response', confidence: 0.5 })
} as any as BedrockClientService;

// Mock IntentDetectionService allows us to test the *actual* rule-based logic if we want, 
// OR we can mock it to simulate what the bot IS seeing vs what it SHOULD see.
// For this reproduction, we want to use the REAL intent detection logic to see WHY it fails.
// So we will instantiate the REAL service but with the mock bedrock.
const realIntentService = new IntentDetectionService(mockBedrock, {
    confidenceThreshold: 0.6,
    escalationThreshold: 0.9,
    supportedIntents: ['ver_catalogo', 'disponibilidad', 'general', 'informacion', 'saludo']
});

// Setup Service
const responseService = new ResponseGenerationService(mockBedrock, realIntentService);

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
    { productId: 'p3', name: 'Samsung S21', price: 800, status: 'available', category: 'Smartphones', description: 'Phone', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } },
    { productId: 'p4', name: 'Product 4', price: 100, status: 'available', category: 'Misc', description: '', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } },
    { productId: 'p5', name: 'Product 5', price: 100, status: 'available', category: 'Misc', description: '', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } },
    { productId: 'p6', name: 'Product 6', price: 100, status: 'available', category: 'Misc', description: '', tenantId: 't1', condition: 'new', location: 'ny', images: [], createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 } }
];

const baseContext = {
    conversationContext: {
        tenantId: 't1', conversationId: 'c1', customerId: 'u1', status: 'active',
        lastIntent: 'general', productInquiries: [], messages: [], createdAt: '', lastUpdate: ''
    } as any,
    businessConfig: mockBusinessConfig,
    customerProfile: {} as any,
    escalationTriggers: [],
    availableProducts: mockProducts
};

async function reproduceLoop() {
    console.log('🧪 reproducing User Loop...\n');

    // 1. "que vendes?"
    console.log('User: "que vendes?"');
    let ctx = { ...baseContext, message: "que vendes?" };
    // Detect intent actually
    let classification = await realIntentService.classifyIntent("que vendes?", ctx.conversationContext);
    console.log(`Detected Intent: ${classification.intent} (${classification.confidence})`);

    let response = await responseService.generateResponse({
        ...ctx,
        intent: classification
    });
    console.log(`Bot: ${response.response}\n`);


    // Test Metadata
    if (response.metadata?.listMessage) {
        console.log('✅ Found List Message Metadata:');
        console.log(JSON.stringify(response.metadata.listMessage, null, 2));
    } else {
        console.log('❌ No List Message Metadata found (expected since we updated logic)');
    }
}

reproduceLoop().catch(console.error);
