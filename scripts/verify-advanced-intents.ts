
import { ResponseGenerationService } from '../src/services/response-generation';
import { IntentDetectionService } from '../src/services/intent-detection';
import { ProductInquiryHandler } from '../src/services/product-inquiry-handler';

// Mock Dependencies
const mockBedrockClient = {
    generateResponse: async () => ({
        response: 'AI fallback response',
        confidence: 0.5
    })
} as any;

const mockIntentService = new IntentDetectionService(mockBedrockClient);
const responseService = new ResponseGenerationService(mockBedrockClient, mockIntentService);

// Mock Business Config
const mockBusinessConfig = {
    businessName: 'TechStore',
    ownerName: 'Admin',
    communicationStyle: { tone: 'friendly' },
    appointmentConfig: {
        enabled: true,
        businessHours: 'Lunes a Viernes 9am-6pm',
        calendarUrl: 'https://cal.com/techstore'
    },
    paymentConfig: {
        methods: ['Nequi', 'Bancolombia', 'Efectivo'],
        instructions: 'Envía comprobante al WhatsApp.'
    },
    shippingInfo: { available: true }
} as any;

const baseContext = {
    message: '',
    conversationContext: {
        tenantId: 'test-tenant',
        productInquiries: [],
        messages: []
    },
    customerProfile: {} as any,
    availableProducts: [],
    businessConfig: mockBusinessConfig,
    escalationTriggers: []
} as any;

async function runVerification() {
    console.log('🧪 Verifying Advanced Intents...\n');

    // Test 1: Appointment with Link
    console.log('Test 1: Appointment (With Link)');
    const ctx1 = {
        ...baseContext,
        intent: { intent: 'agendar_cita', confidence: 1.0, entities: {} }
    };
    const res1 = await responseService.generateResponse(ctx1);
    console.log(`Response: ${res1.response}`);
    if (res1.response.includes('https://cal.com/techstore')) console.log('✅ Passed: Link included\n');
    else console.error('❌ Failed: Link missing\n');

    // Test 2: Appointment Manual (No Link)
    console.log('Test 2: Appointment (Manual Hours)');
    const configManual = { ...mockBusinessConfig, appointmentConfig: { enabled: true, businessHours: '9am-5pm' } }; // override
    const ctx2 = {
        ...baseContext,
        businessConfig: configManual,
        intent: { intent: 'agendar_cita', confidence: 1.0, entities: {} }
    };
    const res2 = await responseService.generateResponse(ctx2);
    console.log(`Response: ${res2.response}`);
    if (res2.response.includes('9am-5pm')) console.log('✅ Passed: Hours included\n');
    else console.error('❌ Failed: Hours missing\n');

    // Test 3: Payment Methods
    console.log('Test 3: Payment Methods');
    const ctx3 = {
        ...baseContext,
        intent: { intent: 'metodos_pago', confidence: 1.0, entities: {} }
    };
    const res3 = await responseService.generateResponse(ctx3);
    console.log(`Response: ${res3.response}`);
    if (res3.response.includes('Nequi') && res3.response.includes('Envía comprobante')) console.log('✅ Passed: Methods and instructions included\n');
    else console.error('❌ Failed\n');

    // Test 4: Shipping Status
    console.log('Test 4: Shipping Status');
    const ctx4 = {
        ...baseContext,
        intent: { intent: 'estado_envio', confidence: 1.0, entities: {} }
    };
    const res4 = await responseService.generateResponse(ctx4);
    console.log(`Response: ${res4.response}`);
    if (res4.shouldEscalate) console.log('✅ Passed: Marked for escalation/human check\n');
    else console.error('❌ Failed: Should escalate\n');

}

runVerification().catch(console.error);
