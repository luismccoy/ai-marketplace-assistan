
import { IntentDetectionService } from '../src/services/intent-detection';
import { ResponseGenerationService } from '../src/services/response-generation';
import { ProductInquiryHandler } from '../src/services/product-inquiry-handler';
import { BedrockClientService } from '../src/services/bedrock-client';

// Mock Dependencies
const mockBedrockClient = {
    generateResponse: async () => ({
        response: '{"intent": "negociacion", "confidence": 0.9, "entities": {"amount": 85}}',
        confidence: 0.9
    })
} as any;

const mockIntentService = new IntentDetectionService(mockBedrockClient);
const productHandler = new ProductInquiryHandler();
const responseService = new ResponseGenerationService(mockBedrockClient, mockIntentService);

// Mock Data
const mockProduct = {
    tenantId: 'test-tenant',
    productId: 'prod-123',
    name: 'iPhone 15',
    description: 'Nuevo 128GB',
    price: 1000,
    condition: 'new',
    status: 'available',
    category: 'Electronics',
    location: 'Bogotá',
    images: [],
    discountRange: { min: 0, max: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
} as any;

const mockBusinessConfig = {
    businessName: 'TechStore',
    ownerName: 'Admin',
    communicationStyle: { tone: 'friendly' },
    discountPolicy: {
        allowNegotiation: true,
        maxDiscountPercent: 10 // Min price = 900
    },
    shippingInfo: { available: true }
} as any;

const mockContext = {
    message: '',
    intent: { intent: 'negociacion', confidence: 1.0, entities: { amount: 0 } },
    escalationTriggers: [],
    conversationContext: {
        tenantId: 'test-tenant',
        conversationId: 'conv-1',
        productInquiries: ['prod-123'],
        messages: [],
        lastIntent: 'negociacion',
        status: 'active',
        customerId: '123',
        createdAt: '',
        lastUpdate: ''
    },
    customerProfile: {} as any,
    availableProducts: [mockProduct],
    businessConfig: mockBusinessConfig
} as any;

async function runVerification() {
    console.log('🧪 Verifying Negotiation Logic...\n');

    // Test 1: Offer above MinPrice (900) -> Accept
    // Offer 950
    console.log('Test 1: Offer $950 (Expected: Accept)');
    const result1 = await (productHandler as any).handleNegotiation({ businessConfig: mockBusinessConfig }, mockProduct, 950);
    console.log('Result:', result1.message);
    if (result1.accepted) console.log('✅ Passed\n');
    else console.error('❌ Failed: Should accept\n');

    // Test 2: Offer too low (500) -> Reject
    console.log('Test 2: Offer $500 (Expected: Reject)');
    const result2 = await (productHandler as any).handleNegotiation({ businessConfig: mockBusinessConfig }, mockProduct, 500);
    console.log('Result:', result2.message);
    if (!result2.accepted && !result2.counterOffer) console.log('✅ Passed\n');
    else console.error('❌ Failed: Should reject without counter\n');

    // Test 3: Offer close to MinPrice (880 vs 900) -> Counter
    // Threshold is 900 * 0.95 = 855
    console.log('Test 3: Offer $880 (Expected: Counter-offer)');
    const result3 = await (productHandler as any).handleNegotiation({ businessConfig: mockBusinessConfig }, mockProduct, 880);
    console.log('Result:', result3.message);
    if (!result3.accepted && result3.counterOffer) console.log(`✅ Passed (Counter: $${result3.counterOffer})\n`);
    else console.error('❌ Failed: Should counter-offer\n');

    // Test 4: Response Generation with Metadata
    console.log('Test 4: Response Generation Metadata');
    mockContext.intent.entities.amount = 880;
    // We need to inject the mock handler or trust the one instantiated inside ResponseGenerationService?
    // ResponseGenerationService instantiates its own ProductInquiryHandler.
    // We cannot easily mock internal properties in TS without public accessors or 'any' cast.
    // Let's rely on the real one inside since we are testing integration logic.

    // Note: ResponseGenerationService creates NEW ProductInquiryHandler() internally.
    // So it should work matching the logic we just tested.

    const botResponse = await (responseService as any).generateNegotiationResponse(mockContext);
    console.log('Bot Response:', botResponse.response);
    console.log('Metadata:', botResponse.metadata);

    if (botResponse.metadata?.negotiation?.counterOffer) {
        console.log('✅ Metadata contains counter-offer');
    } else {
        console.error('❌ Metadata missing counter-offer');
    }

}

runVerification().catch(console.error);
