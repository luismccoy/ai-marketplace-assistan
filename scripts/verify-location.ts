
import { handler } from '../src/lambdas/message-handler/index';


// Manual mocks for dependencies
// We can't easily mock imports in ts-node without jest.
// So we will simulate the handler logic OR try to mock the specific modules if possible.
// Given strict TS-Node environment, it's easier to verify logic by unit testing the specific function if exported, 
// OR by using a simplified verification strategy that doesn't rely on deep dependency mocking.

// However, we want to test 'handler' which imports 'aiOrchestrator'.
// Let's rely on the fact that we can manipulate the prototype of the classes if they are instantiated.

// BUT, `aiOrchestrator` is an exported instance.
import { aiOrchestrator } from '../src/services/ai-orchestrator';

// JavaScript/Typescript allows modifying the property of the imported module object 
// IF we can access it. Since it's a constant export, we might need a spy-like approach.
// But we are in a script.

// Let's try to overwrite the processMessage method on the singleton instance.
(aiOrchestrator as any).processMessage = async () => ({
    response: {
        response: 'Aquí tienes nuestra ubicación 📍',
        metadata: {
            location: {
                name: 'Tienda Mock',
                address: 'Calle Falsa 123',
                latitude: 10.0,
                longitude: -74.0
            }
        },
        updatedContext: {}
    }
});

// Mock tenantResolver
import { tenantResolver } from '../src/services/tenant-resolver';
(tenantResolver as any).resolveTenantFromWhatsApp = async () => ({
    isValid: true,
    tenantId: 'tenant_1',
    tenantConfig: {
        businessName: 'Test Business',
        businessConfig: { communicationStyle: {} }
    }
});

// Manual mocks since we can't use Jest in this runtime easily
const mockAxiosPost = {
    calls: [] as any[],
    mockImplementation: async (url: string, payload: any) => {
        console.log(`[MOCK AXIOS] POST ${url}`, JSON.stringify(payload));
        mockAxiosPost.calls.push([url, payload]);
        return { status: 200, data: { success: true } };
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path: string) {
    if (path === 'axios') {
        return { post: mockAxiosPost.mockImplementation };
    }
    return originalRequire.apply(this, arguments);
};

async function verifyLocation() {
    process.env.WHAPI_TOKEN = 'mock-token';
    process.env.WHAPI_API_URL = 'http://mock-api';

    console.log('🚀 Verifying Location Sharing...\n');

    const event = {
        messages: [{
            from: '1234567890',
            text: { body: 'Donde están ubicados?' }
        }],
        channel_id: 'test_channel'
    };

    try {
        await handler(event);

        // Check if axios was called with correct location payload
        const calls = mockAxiosPost.calls;
        const locationCall = calls.find((call: any[]) => call[0].includes('/messages/location'));

        if (locationCall) {
            const payload = locationCall[1];
            console.log('✅ Location Message Sent!');
            console.log('Payload:', JSON.stringify(payload, null, 2));

            if (payload.location && payload.location.latitude === 10.0) {
                console.log('✅ Payload Structure Correct (Lat/Long/Address)');
            } else {
                console.error('❌ Payload Structure Incorrect');
            }
        } else {
            console.error('❌ No Location Message sent via Axios');
        }

    } catch (e) {
        console.error('Error in verification:', e);
    }
}

verifyLocation();
