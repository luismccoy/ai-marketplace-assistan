import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TenantResolver } from '../../services/tenant-resolver';

const lambdaClient = new LambdaClient({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const MESSAGE_HANDLER_NAME = process.env.MESSAGE_HANDLER_NAME;
const TENANTS_TABLE = process.env.TENANTS_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Webhook event:', {
        httpMethod: event.httpMethod,
        resource: event.resource,
        path: event.path,
        authorizer: event.requestContext.authorizer?.claims ? 'Present' : 'Absent'
    });

    try {
        // 0. Dashboard API: GET /tenants
        if (event.resource === '/tenants' && event.httpMethod === 'GET') {
            const claims = event.requestContext.authorizer?.claims;
            const tenantId = claims?.['custom:tenantId'];
            const email = claims?.['email'];

            if (!tenantId) {
                return {
                    statusCode: 401,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Unauthorized: No tenantId in claims' }),
                };
            }

            console.log(`Fetching tenant record for: ${tenantId}`);

            // Try to get specific tenant
            const result = await docClient.send(new GetCommand({
                TableName: TENANTS_TABLE,
                Key: { tenantId }
            }));

            if (result.Item) {
                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': true,
                    },
                    body: JSON.stringify([result.Item]),
                };
            }

            // If not found, it might be a new signup. Create a default record.
            console.log(`Tenant record not found for ${tenantId}. Creating default.`);
            const defaultTenant = TenantResolver.createDefaultTenantConfig(
                tenantId,
                'My New Business',
                [],
                email || ''
            );

            await docClient.send(new PutCommand({
                TableName: TENANTS_TABLE,
                Item: defaultTenant
            }));

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify([defaultTenant]),
            };
        }

        // Dashboard API: PUT /tenants/{tenantId}
        if (event.resource === '/tenants/{tenantId}' && event.httpMethod === 'PUT') {
            const claims = event.requestContext.authorizer?.claims;
            const tenantIdFromClaims = claims?.['custom:tenantId'];
            const pathTenantId = event.pathParameters?.tenantId;

            if (!tenantIdFromClaims || tenantIdFromClaims !== pathTenantId) {
                return {
                    statusCode: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Forbidden: You can only update your own tenant record' }),
                };
            }

            const updates = JSON.parse(event.body || '{}');
            // Ensure tenantId stays consistent and update timestamp
            updates.tenantId = tenantIdFromClaims;
            updates.updatedAt = new Date().toISOString();

            console.log(`Updating tenant record for: ${tenantIdFromClaims}`);

            await docClient.send(new PutCommand({
                TableName: TENANTS_TABLE,
                Item: updates
            }));

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify(updates),
            };
        }

        // 1. WhatsApp Webhook Verification (GET)
        if (event.httpMethod === 'GET') {
            const queryParams = event.queryStringParameters || {};
            const mode = queryParams['hub.mode'];
            const token = queryParams['hub.verify_token'];
            const challenge = queryParams['hub.challenge'];

            // In production, validate this token against a secret in Secrets Manager or env var
            // For MVP/Trial, we accept any token or a specific hardcoded one if needed.
            // Using a generic check for now as we haven't set a specific verify token in the stack env yet.
            // But tenants might have their own. For platform level, let's accept "ai-marketplace-verify-token".

            if (mode === 'subscribe' && token) {
                console.log('Webhook verification request:', { mode, token, challenge });
                return {
                    statusCode: 200,
                    body: challenge || '',
                };
            }

            return {
                statusCode: 403,
                body: 'Forbidden',
            };
        }

        // 2. Message Processing (POST)
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');

            // Basic validation - Support both Meta (object) and Whapi (messages) formats
            if (!body.object && !body.messages) {
                console.log('Invalid payload structure', body);
                return {
                    statusCode: 404,
                    body: 'Not Found',
                };
            }

            // Asynchronously invoke the Message Handler to process the message logic
            // This decouples the webhook response (required < 3s) from AI processing time.
            if (MESSAGE_HANDLER_NAME) {
                const invokeParams = {
                    FunctionName: MESSAGE_HANDLER_NAME,
                    InvocationType: 'Event' as const, // Asynchronous invocation
                    Payload: JSON.stringify(body),
                };

                await lambdaClient.send(new InvokeCommand(invokeParams));
                console.log('Invoked Message Handler async');
            } else {
                console.error('MESSAGE_HANDLER_NAME env var not set');
            }

            return {
                statusCode: 200,
                body: 'EVENT_RECEIVED',
            };
        }

        return {
            statusCode: 405,
            body: 'Method Not Allowed',
        };

    } catch (error) {
        console.error('Error in webhook handler:', error);
        return {
            statusCode: 500,
            body: 'Internal Server Error',
        };
    }
};
