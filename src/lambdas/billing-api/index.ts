import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { usageTracker } from '../../services/usage-tracker';
import { StripeClientService } from '../../services/stripe-client';
import { tenantResolver } from '../../services/tenant-resolver';

const stripeService = new StripeClientService(
    process.env.STRIPE_SECRET_KEY || '',
    process.env.STRIPE_WEBHOOK_SECRET || ''
);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Billing API Event:', JSON.stringify(event, null, 2));

    const method = event.httpMethod;
    const path = event.path;
    const resource = event.resource; // e.g., /billing/usage

    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST'
    };

    if (method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Resolve Tenant (Assuming Tenant ID is passed in header or we are simulating for now)
        // In a real app, we extract this from the Cognito JWT Authorizer context
        // For this MVP/Dashboard, let's assume the frontend passes 'x-tenant-id' header or we use a hardcoded one for testing if missing
        // Verify Authentication mechanism: dashboard-server uses Cognito, so standard API Gateway Authorizer should populate requestContext.authorizer

        let tenantId = event.headers['x-tenant-id'];

        // Fallback for demo/testing if not using strict auth yet
        if (!tenantId && event.queryStringParameters?.tenantId) {
            tenantId = event.queryStringParameters.tenantId;
        }

        if (!tenantId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing x-tenant-id header' })
            };
        }

        // --- GET /billing/usage ---
        if (resource.endsWith('/usage') && method === 'GET') {
            const period = new Date().toISOString().substring(0, 7); // Current Month
            const usageData = await usageTracker.getUsage(tenantId, period);
            const tenantConfig = await tenantResolver.getTenantConfig(tenantId);

            const plan = tenantConfig?.plan || 'basic';
            const limits = {
                'basic': 1000,
                'pro': 5000,
                'enterprise': -1 // Unlimited
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    tenantId,
                    period,
                    plan,
                    status: tenantConfig?.status || 'active',
                    usage: {
                        messages: usageData?.messageCount || 0,
                        conversations: usageData?.conversationCount || 0
                    },
                    limits: {
                        messages: limits[plan as keyof typeof limits] || 1000
                    }
                })
            };
        }

        // --- POST /billing/portal ---
        if (resource.endsWith('/portal') && method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const returnUrl = body.returnUrl || 'https://d2q8qoxb8y8m8n.cloudfront.net/dashboard.html';

            // We need the Stripe Customer ID.
            // Typically stored in TenantConfig.integrations.stripe?.customerId
            // For MVP, if we don't have it, we might fail or create one.
            // Let's assume we fetch it from TenantConfig (need to ensure it's there)
            // Or we check if StripeService can find it by email.

            const tenantConfig = await tenantResolver.getTenantConfig(tenantId);
            const email = tenantConfig?.contactInfo.email;

            if (!email) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tenant email not found' }) };
            }

            // Simple lookup or create
            let customer = await stripeService.getCustomerByEmail(email);
            if (!customer) {
                customer = await stripeService.createCustomer(email, tenantConfig.businessName);
            }

            const session = await stripeService.createPortalSession(customer.id, returnUrl);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ url: session.url })
            };
        }

        // --- POST /billing/checkout --- (Optional: For upgrading)
        if (resource.endsWith('/checkout') && method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const priceId = body.priceId; // e.g., 'price_PRO_PLAN'
            const returnUrl = body.returnUrl || 'https://d2q8qoxb8y8m8n.cloudfront.net/dashboard.html';

            const tenantConfig = await tenantResolver.getTenantConfig(tenantId);
            const email = tenantConfig?.contactInfo.email;

            if (!email) throw new Error("Tenant email missing");

            let customer = await stripeService.getCustomerByEmail(email);
            if (!customer) customer = await stripeService.createCustomer(email, tenantConfig.businessName);

            const session = await stripeService.createCheckoutSession(
                customer.id,
                priceId,
                returnUrl + '?success=true',
                returnUrl + '?canceled=true',
                { tenantId } // Metadata
            );

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ url: session.url })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not Found' })
        };

    } catch (error: any) {
        console.error('Billing API Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
