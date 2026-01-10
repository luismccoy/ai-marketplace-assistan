
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface SimpleAIMarketplaceStackProps extends cdk.StackProps {
    // Add custom props if needed
}

export class SimpleAIMarketplaceStack extends cdk.Stack {
    public readonly apiGatewayUrl: string;
    public readonly webhookUrl: string;

    constructor(scope: Construct, id: string, props?: SimpleAIMarketplaceStackProps) {
        super(scope, id, props);

        // Apply global tags
        cdk.Tags.of(this).add('App', 'ai-marketplace-assistant');
        cdk.Tags.of(this).add('AutoDelete', 'No');

        // 1. DynamoDB Tables
        const tenantsTable = new dynamodb.Table(this, 'TenantsTable', {
            tableName: 'ai-marketplace-tenants-platform',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        (tenantsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('TenantsTable');

        // GSI: WhatsAppNumberIndex (PK: whatsappNumber, SK: NONE)
        tenantsTable.addGlobalSecondaryIndex({
            indexName: 'WhatsAppNumberIndex',
            partitionKey: { name: 'whatsappNumber', type: dynamodb.AttributeType.STRING },
            // SK removed to match production schema
        });

        const conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
            tableName: 'ai-marketplace-conversations-platform',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        (conversationsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('ConversationsTable');

        // GSI: CustomerIndex (PK: tenantId, SK: customerId)
        conversationsTable.addGlobalSecondaryIndex({
            indexName: 'CustomerIndex',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
        });

        // GSI: TimestampIndex (PK: tenantId, SK: timestamp (Number))
        conversationsTable.addGlobalSecondaryIndex({
            indexName: 'TimestampIndex',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
        });

        const productsTable = new dynamodb.Table(this, 'ProductsTable', {
            tableName: 'ai-marketplace-products-platform',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        (productsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('ProductsTable');

        // GSI: StatusIndex (PK: tenantId, SK: status)
        productsTable.addGlobalSecondaryIndex({
            indexName: 'StatusIndex',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
        });

        // GSI: CategoryIndex (PK: tenantId, SK: category)
        productsTable.addGlobalSecondaryIndex({
            indexName: 'CategoryIndex',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'category', type: dynamodb.AttributeType.STRING },
        });

        const embeddingsTable = new dynamodb.Table(this, 'EmbeddingsTable', {
            tableName: 'ai-marketplace-embeddings-platform',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'chunkId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        (embeddingsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('EmbeddingsTable');

        // New Usage Metrics Table (Phase 6.2)
        const usageMetricsTable = new dynamodb.Table(this, 'UsageMetricsTable', {
            tableName: 'ai-marketplace-usage-metrics',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'period', type: dynamodb.AttributeType.STRING }, // YYYY-MM
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        (usageMetricsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('UsageMetricsTable');

        // GSI: DocumentIndex (PK: tenantId, SK: documentId)
        embeddingsTable.addGlobalSecondaryIndex({
            indexName: 'DocumentIndex',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
        });

        // 2. SNS Topic
        const escalationTopic = new sns.Topic(this, 'EscalationTopic', {
            topicName: 'ai-marketplace-handoff-notifications',
            displayName: 'AI Marketplace Assistant Escalations',
        });
        (escalationTopic.node.defaultChild as cdk.CfnResource).overrideLogicalId('HandoffNotificationsTopic');

        // 2. S3 Buckets
        const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
            bucketName: `ai-marketplace-documents-${this.account}-${this.region}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });
        (documentsBucket.node.defaultChild as cdk.CfnResource).overrideLogicalId('DocumentsS3Bucket');

        // Product Images S3 Bucket
        const productImagesBucket = new s3.Bucket(this, 'ProductImagesBucket', {
            bucketName: `ai-marketplace-product-images-${this.account}-${this.region}`,
            cors: [{
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                allowedOrigins: ['*'],
                allowedHeaders: ['*'],
                maxAge: 3000,
            }],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // 3. Cognito User Pool
        const userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: 'ai-marketplace-tenants',
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: true },
            },
            customAttributes: {
                'tenantId': new cognito.StringAttribute({ mutable: true }),
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
        });

        const userPoolClient = userPool.addClient('UserPoolClient', {
            userPoolClientName: 'ai-marketplace-dashboard-client',
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userPassword: true,
                userSrp: true,
            },
        });

        // 4. Cognito Authorizer for API Gateway
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [userPool],
        });

        // 5. Lambda Functions
        const commonEnv = {
            TENANTS_TABLE: tenantsTable.tableName,
            CONVERSATIONS_TABLE: conversationsTable.tableName,
            PRODUCTS_TABLE: productsTable.tableName,
            EMBEDDINGS_TABLE: embeddingsTable.tableName,
            ESCALATION_TOPIC_ARN: escalationTopic.topicArn,
            DOCUMENTS_BUCKET: documentsBucket.bucketName,
            USER_POOL_ID: userPool.userPoolId,
            USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
            NODE_ENV: 'production',
            WHAPI_API_URL: 'https://gate.whapi.cloud/',
            WHAPI_TOKEN: 'zxie3qHCVGns5Bp8EthOCziMoIz6TAYP',
        };

        const webhookHandler = new lambdaNodejs.NodejsFunction(this, 'WebhookHandler', {
            functionName: 'ai-marketplace-platform-webhook-handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/webhook-handler/index.ts'),
            environment: commonEnv,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });
        (webhookHandler.node.defaultChild as cdk.CfnResource).overrideLogicalId('WebhookHandler');

        const messageHandler = new lambdaNodejs.NodejsFunction(this, 'MessageHandler', {
            functionName: 'ai-marketplace-platform-message-handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/message-handler/index.ts'),
            environment: commonEnv,
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });
        (messageHandler.node.defaultChild as cdk.CfnResource).overrideLogicalId('MessageHandler');

        // Permissions
        tenantsTable.grantReadWriteData(webhookHandler);
        conversationsTable.grantReadWriteData(webhookHandler);
        tenantsTable.grantReadWriteData(messageHandler);
        conversationsTable.grantReadWriteData(messageHandler);
        productsTable.grantReadWriteData(messageHandler);
        embeddingsTable.grantReadWriteData(messageHandler);
        escalationTopic.grantPublish(messageHandler);
        documentsBucket.grantReadWrite(messageHandler);

        messageHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            resources: ['*'],
        }));

        // Allow Webhook to invoke Message Handler
        messageHandler.grantInvoke(webhookHandler);
        webhookHandler.addEnvironment('MESSAGE_HANDLER_NAME', messageHandler.functionName);

        // Stripe Webhook Handler
        const stripeWebhookHandler = new lambdaNodejs.NodejsFunction(this, 'StripeWebhookHandler', {
            functionName: 'ai-marketplace-platform-stripe-webhook',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/stripe-webhook/index.ts'),
            environment: {
                ...commonEnv,
                STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
                STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });

        // Grant Stripe webhook access to tenants table
        tenantsTable.grantReadWriteData(stripeWebhookHandler);


        // Products API Handler
        const productsApiHandler = new lambdaNodejs.NodejsFunction(this, 'ProductsApiHandler', {
            functionName: 'ai-marketplace-platform-products-api',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/products-api/index.ts'),
            environment: commonEnv,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });
        (productsApiHandler.node.defaultChild as cdk.CfnResource).overrideLogicalId('ProductsApiHandler');

        // Grant permissions to Products API
        tenantsTable.grantReadWriteData(productsApiHandler);
        productsTable.grantReadWriteData(productsApiHandler);

        // Image Upload API Handler
        const imageUploadHandler = new lambdaNodejs.NodejsFunction(this, 'ImageUploadHandler', {
            functionName: 'ai-marketplace-platform-image-upload',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/image-upload-api/index.ts'),
            environment: {
                ...commonEnv,
                IMAGES_BUCKET_NAME: productImagesBucket.bucketName,
            },
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });
        (imageUploadHandler.node.defaultChild as cdk.CfnResource).overrideLogicalId('ImageUploadHandler');

        // Grant S3 permissions to Image Upload API
        productImagesBucket.grantPut(imageUploadHandler);


        // 5. API Gateway
        const api = new apigateway.RestApi(this, 'PlatformApi', {
            restApiName: 'AI-Marketplace-Assistant-Platform-API',
            description: 'API for AI Marketplace Assistant WhatsApp Bot',
            deploy: true,
            deployOptions: {
                stageName: 'prod-v2',
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
        });
        (api.node.defaultChild as cdk.CfnResource).overrideLogicalId('AIMarketplacePlatformAPI');

        const webhookResource = api.root.addResource('webhook');
        (webhookResource.node.defaultChild as cdk.CfnResource).overrideLogicalId('WebhookResource');

        const getMethod = webhookResource.addMethod('GET', new apigateway.LambdaIntegration(webhookHandler));
        (getMethod.node.defaultChild as cdk.CfnResource).overrideLogicalId('WebhookGetMethod');

        const postMethod = webhookResource.addMethod('POST', new apigateway.LambdaIntegration(webhookHandler));
        (postMethod.node.defaultChild as cdk.CfnResource).overrideLogicalId('WebhookPostMethod');

        // Tenants API for Dashboard (GET /tenants)
        const tenantsResource = api.root.addResource('tenants');
        tenantsResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });

        const getTenantsMethod = tenantsResource.addMethod('GET', new apigateway.LambdaIntegration(webhookHandler), { authorizer });

        const tenantIdResource = tenantsResource.addResource('{tenantId}');
        tenantIdResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });
        tenantIdResource.addMethod('PUT', new apigateway.LambdaIntegration(webhookHandler), { authorizer });

        // Stripe Webhook (POST /stripe/webhook) - No auth required for Stripe calls
        const stripeResource = api.root.addResource('stripe');
        const stripeWebhookResource = stripeResource.addResource('webhook');
        stripeWebhookResource.addMethod('POST', new apigateway.LambdaIntegration(stripeWebhookHandler), {
            authorizationType: apigateway.AuthorizationType.NONE, // Stripe webhook uses signature verification
        });


        // Products API for Dashboard (GET/POST/PUT/DELETE /api/products)
        const apiResource = api.root.addResource('api');
        const productsResource = apiResource.addResource('products');
        productsResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });

        const productsIntegration = new apigateway.LambdaIntegration(productsApiHandler);
        productsResource.addMethod('GET', productsIntegration, { authorizer });
        productsResource.addMethod('POST', productsIntegration, { authorizer });

        // Billing API Handler (Phase 6.3)
        const billingApiHandler = new lambdaNodejs.NodejsFunction(this, 'BillingApiHandler', {
            functionName: 'ai-marketplace-platform-billing-api',
            entry: path.join(__dirname, '../src/lambdas/billing-api/index.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                ...commonEnv, // Include common environment variables
                STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
                STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: true,
            },
        });
        (billingApiHandler.node.defaultChild as cdk.CfnResource).overrideLogicalId('BillingApiHandler');

        // Billing Permissions
        tenantsTable.grantReadWriteData(billingApiHandler); // Billing API needs to read/write tenant data
        // If usageMetricsTable is needed, it must be defined elsewhere and granted here.
        // For now, assuming it's not directly used or will be added later.

        // Billing Routes
        const billingResource = api.root.addResource('billing');
        billingResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });

        const usageResource = billingResource.addResource('usage');
        usageResource.addMethod('GET', new apigateway.LambdaIntegration(billingApiHandler), {
            authorizer: authorizer,
        });

        const portalResource = billingResource.addResource('portal');
        portalResource.addMethod('POST', new apigateway.LambdaIntegration(billingApiHandler), {
            authorizer: authorizer,
        });

        const checkoutResource = billingResource.addResource('checkout');
        checkoutResource.addMethod('POST', new apigateway.LambdaIntegration(billingApiHandler), {
            authorizer: authorizer,
        });

        // Add {productId} resource for PUT/DELETE
        const productIdResource = productsResource.addResource('{productId}');
        productIdResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });
        productIdResource.addMethod('PUT', productsIntegration, { authorizer });
        productIdResource.addMethod('DELETE', productsIntegration, { authorizer });

        // Image Upload API (POST /api/images/upload-url)
        const imagesResource = apiResource.addResource('images');
        const uploadUrlResource = imagesResource.addResource('upload-url');
        uploadUrlResource.addCorsPreflight({
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: apigateway.Cors.ALL_METHODS,
        });
        uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(imageUploadHandler), { authorizer });

        // Dashboard Server Lambda
        const dashboardServerHandler = new lambdaNodejs.NodejsFunction(this, 'DashboardServerHandler', {
            functionName: 'ai-marketplace-platform-dashboard-server',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/dashboard-server/index.ts'),
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            bundling: {
                minify: false,
                sourceMap: false,
            },
        });

        // Dashboard route (GET /dashboard)
        const dashboardResource = api.root.addResource('dashboard');
        dashboardResource.addMethod('GET', new apigateway.LambdaIntegration(dashboardServerHandler));

        // Landing Page route (GET /)
        api.root.addMethod('GET', new apigateway.LambdaIntegration(dashboardServerHandler));

        // Outputs
        new cdk.CfnOutput(this, 'PlatformAPIGatewayURL', {
            value: `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod-v2/`,
            exportName: `${this.stackName}-APIGatewayURL`,
        }).overrideLogicalId('APIGatewayURL');

        new cdk.CfnOutput(this, 'TenantsAPIURL', {
            value: `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod-v2/tenants`,
            description: 'URL to fetch tenants list'
        });

        new cdk.CfnOutput(this, 'PlatformWebhookURL', {
            value: `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod-v2/webhook`,
            exportName: `${this.stackName}-WebhookURL`,
        }).overrideLogicalId('WebhookURL');

        new cdk.CfnOutput(this, 'TenantsTableNameOutput', {
            value: tenantsTable.tableName,
            exportName: `${this.stackName}-TenantsTable`,
        }).overrideLogicalId('TenantsTableName');

        this.apiGatewayUrl = `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod-v2/`;
        this.webhookUrl = `${this.apiGatewayUrl}webhook`;
    }
}
