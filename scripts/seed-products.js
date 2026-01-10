const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({ region: 'us-east-1' });

const PRODUCTS = [
    {
        productId: 'iphone-16-pro-max',
        name: 'iPhone 16 Pro Max',
        price: '1200',
        condition: 'New',
        description: 'Brand new condition, basically untouched. Flawless.',
        category: 'Electronics',
        status: 'available'
    },
    {
        productId: 'iphone-15-pro',
        name: 'iPhone 15 Pro',
        price: '850',
        condition: 'Damaged',
        description: 'Screen broken, needs repair. Otherwise functional.',
        category: 'Electronics',
        status: 'available'
    },
    {
        productId: 'iphone-14',
        name: 'iPhone 14',
        price: '500',
        condition: 'Used',
        description: 'Minor scratches, fully functional. Good condition.',
        category: 'Electronics',
        status: 'available'
    }
];

const TABLE_NAME = 'ai-marketplace-products-platform';
const TENANT_ID = 'demo-tenant-001';

async function seed() {
    console.log(`Seeding products for ${TENANT_ID}...`);

    for (const product of PRODUCTS) {
        const item = {
            tenantId: { S: TENANT_ID },
            productId: { S: product.productId },
            name: { S: product.name },
            price: { N: product.price },
            condition: { S: product.condition },
            description: { S: product.description },
            category: { S: product.category },
            status: { S: product.status },
            createdAt: { S: new Date().toISOString() }
        };

        try {
            await client.send(new PutItemCommand({
                TableName: TABLE_NAME,
                Item: item
            }));
            console.log(`Added ${product.name}`);
        } catch (err) {
            console.error(`Error adding ${product.name}:`, err);
        }
    }
}

seed();
