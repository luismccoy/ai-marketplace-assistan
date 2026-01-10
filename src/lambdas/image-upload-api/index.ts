import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.IMAGES_BUCKET_NAME!;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Image Upload API event:', {
        hasClaims: !!event.requestContext.authorizer?.claims
    });

    try {
        // Handle CORS preflight
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        // Extract tenantId from Cognito claims
        const claims = event.requestContext.authorizer?.claims;
        const tenantIdFromClaims = claims?.['custom:tenantId'];

        if (!tenantIdFromClaims) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Unauthorized: No tenantId found' })
            };
        }

        const { productId, fileName, fileType } = JSON.parse(event.body || '{}');

        if (!productId || !fileName) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing required fields: productId, fileName' })
            };
        }

        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        // Consistently use tenantId from claims for the path
        const key = `${tenantIdFromClaims}/${productId}/original_${timestamp}_${sanitizedFileName}`;

        console.log(`Generating pre-signed URL for tenant ${tenantIdFromClaims}: ${key}`);

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: fileType || 'image/jpeg',
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                uploadUrl,
                publicUrl,
                key,
                expiresIn: 300
            })
        };
    } catch (error: any) {
        console.error('Image upload API error:', error);
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
