import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { tenantDataAccess } from '../../services/tenant-data-access';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Products API event:', {
        method: event.httpMethod,
        path: event.path,
        hasClaims: !!event.requestContext.authorizer?.claims
    });

    try {
        const method = event.httpMethod;
        const path = event.path;

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        // Extract tenantId from Cognito claims
        const claims = event.requestContext.authorizer?.claims;
        const tenantId = claims?.['custom:tenantId'];

        if (!tenantId) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Unauthorized: No tenantId found' })
            };
        }

        // GET /api/products
        if (method === 'GET' && path === '/api/products') {
            const status = event.queryStringParameters?.status as any;

            console.log(`Fetching products for tenant: ${tenantId}, status: ${status || 'all'}`);
            const products = await tenantDataAccess.getTenantProducts(tenantId, status);

            // Strip the tenantId# prefix from product IDs for the frontend
            const formattedProducts = products.map(p => ({
                ...p,
                productId: p.productId.includes('#') ? p.productId.split('#')[1] : p.productId
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(formattedProducts)
            };
        }

        // POST /api/products
        if (method === 'POST' && path === '/api/products') {
            const product = JSON.parse(event.body || '{}');

            if (!product.name || !product.price || !product.condition) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Missing required fields: name, price, condition' })
                };
            }

            // Force the tenantId from claims and set IDs/timestamps
            product.tenantId = tenantId;
            product.productId = product.productId || `prod_${Date.now()}`;
            product.createdAt = new Date().toISOString();
            product.updatedAt = new Date().toISOString();
            product.status = product.status || 'available';

            console.log('Creating product for tenant:', tenantId, product.productId);
            await tenantDataAccess.saveProduct(product);

            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(product)
            };
        }

        // PUT /api/products/{productId}
        if (method === 'PUT' && path.startsWith('/api/products/')) {
            const productId = path.split('/').pop();
            const updates = JSON.parse(event.body || '{}');

            if (!productId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'productId required' })
                };
            }

            // Force tenantId and preserve productId
            updates.tenantId = tenantId;
            updates.productId = productId;
            updates.updatedAt = new Date().toISOString();

            console.log('Updating product:', productId, 'for tenant:', tenantId);
            await tenantDataAccess.saveProduct(updates);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(updates)
            };
        }

        // DELETE /api/products/{productId}
        if (method === 'DELETE' && path.startsWith('/api/products/')) {
            const productId = path.split('/').pop();

            if (!productId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'productId required' })
                };
            }

            console.log('Deleting product:', productId, 'for tenant:', tenantId);
            const success = await tenantDataAccess.deleteProduct(tenantId, productId);

            if (!success) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Product not found or access denied' })
                };
            }

            return {
                statusCode: 204,
                headers,
                body: ''
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not found' })
        };

    } catch (error: any) {
        console.error('Products API error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
