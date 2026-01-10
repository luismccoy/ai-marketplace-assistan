
import { ResponseGenerationService } from '../src/services/response-generation';
import { IntentDetectionService } from '../src/services/intent-detection';
import { BedrockClientService } from '../src/services/bedrock-client';
import { ConversationContext, CustomerProfile, Product } from '../src/types/conversation';
import { TenantProduct } from '../src/types/tenant';

// Mock Product Data
const mockProducts: Product[] = [
    {
        productId: 'prod_1',
        name: 'iPhone 13',
        description: 'iPhone 13 128GB, perfecto estado',
        price: 600,
        discountRange: { min: 0, max: 0 },
        category: 'Electronics',
        condition: 'used',
        location: 'Centro',
        images: [],
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: 'tenant_1'
    },
    {
        productId: 'prod_2',
        name: 'iPhone 14',
        description: 'iPhone 14 256GB, nuevo en caja',
        price: 800,
        discountRange: { min: 0, max: 0 },
        category: 'Electronics',
        condition: 'new',
        location: 'Norte',
        images: [],
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: 'tenant_1'
    },
    {
        productId: 'prod_3',
        name: 'Samsung S21',
        description: 'Samsung Galaxy S21, buen estado',
        price: 400,
        discountRange: { min: 0, max: 0 },
        category: 'Electronics',
        condition: 'used',
        location: 'Centro',
        images: [],
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: 'tenant_1'
    }
];

const mockContext: ConversationContext = {
    customerId: 'cust_1',
    status: 'active',
    lastIntent: 'general',
    productInquiries: [],
    messages: [],
    createdAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    tenantId: 'tenant_1'
};

const mockProfile: CustomerProfile = {
    phoneNumber: '5551234567',
    preferredLanguage: 'es',
    inquiryHistory: [],
    leadScore: 10,
    totalConversations: 1,
    lastInteraction: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

async function verifyEnhancements() {
    console.log('🚀 Starting Verification of Phase 2.1 Enhancements...\n');

    // Mock services (real implementation but mocked Bedrock for speed if needed, 
    // here we depend on real class logic but local execution)
    // We assume BedrockClientService can be instantiated or mocked if it hits AWS.
    // For this test, we care about the logic flow in ResponseGenerationService.

    // We can mock BedrockClient mock to avoid AWS calls if we want pure logic test
    // But since we are integration testing in dev environment, real valid usage is ok if creds exist.
    // If no creds, we might fail. Let's assume we want to test the *logic* of comparison which is local.

    const bedrock = new BedrockClientService();
    const intentService = new IntentDetectionService(bedrock);
    const responseService = new ResponseGenerationService(bedrock, intentService);

    // Test 1: Comparison Intent
    console.log('🧪 Test 1: Testing Product Comparison Logic');

    // Simulate intent classification output for "compare iphone 13 and 14"
    const comparisonContext = {
        message: 'Diferencia entre iPhone 13 y iPhone 14',
        intent: {
            intent: 'comparacion',
            confidence: 0.95,
            entities: {
                products: ['iPhone 13', 'iPhone 14']
            }
        },
        escalationTriggers: [],
        conversationContext: mockContext,
        customerProfile: mockProfile,
        availableProducts: mockProducts
    };

    try {
        const response = await responseService.generateResponse(comparisonContext);
        console.log('Response:', response.response);

        if (response.intent === 'comparacion' && response.response.includes('Comparando') && response.response.includes('$600')) {
            console.log('✅ Comparison Test PASSED');
        } else {
            console.error('❌ Comparison Test FAILED');
        }

    } catch (e) {
        console.error('Error in Comparison Test:', e);
    }

    console.log('\n--------------------------------------------------\n');

    // Test 2: Recommendation Fallback
    // Although we didn't explicitly modify a "recommendation intent", we modified logic accessible via handlers.
    // The implementation plan mainly focused on Comparison. Recommendation improvements were inside ProductInquiryHandler logic.
    // Let's test calling handleRecommendationInquiry directly via a simulated flow if possible, 
    // or just assume standard flow uses it.

    // For now, verification of comparison is the critical new feature.
}

verifyEnhancements();
