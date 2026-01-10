
import { IntentDetectionService } from '../src/services/intent-detection';
import { BedrockClientService } from '../src/services/bedrock-client';

// Mock Bedrock Client to avoid API calls and purely test rule-based logic first
const mockBedrockClient = {
    generateResponse: async () => ({
        response: JSON.stringify({ intent: 'general', confidence: 0.5, entities: {} }),
        confidence: 0.5,
        metadata: {}
    })
} as unknown as BedrockClientService;

const intentService = new IntentDetectionService(mockBedrockClient, {
    confidenceThreshold: 0.7,
    escalationThreshold: 0.3,
    supportedIntents: ['human_handoff', 'general']
});

async function runTest() {
    console.log('--- Testing Handoff Logic ---');

    // Test 1: Explicit Handoff
    const explicitMsg = "Quiero hablar con un humano por favor";
    console.log(`\nTesting message: "${explicitMsg}"`);
    const intent1 = await intentService.classifyIntent(explicitMsg);
    console.log(`Intent: ${intent1.intent} (Confidence: ${intent1.confidence})`);

    const triggers1 = await intentService.detectEscalationTriggers(explicitMsg, intent1);
    console.log('Triggers:', JSON.stringify(triggers1, null, 2));

    if (intent1.intent === 'human_handoff' && triggers1.some(t => t.type === 'manual_request')) {
        console.log('✅ TEST 1 PASSED: Explicit handoff detected');
    } else {
        console.error('❌ TEST 1 FAILED');
    }

    // Test 2: Frustration
    const frustrationMsg = "Esto es una mierda, no sirve para nada";
    console.log(`\nTesting message: "${frustrationMsg}"`);
    // Note: Intent might be 'general', but we care about the trigger
    const intent2 = await intentService.classifyIntent(frustrationMsg);
    console.log(`Intent: ${intent2.intent}`);

    const triggers2 = await intentService.detectEscalationTriggers(frustrationMsg, intent2);
    console.log('Triggers:', JSON.stringify(triggers2, null, 2));

    if (triggers2.some(t => t.type === 'sentiment')) {
        console.log('✅ TEST 2 PASSED: Frustration detected');
    } else {
        console.error('❌ TEST 2 FAILED');
    }
}

runTest().catch(console.error);
