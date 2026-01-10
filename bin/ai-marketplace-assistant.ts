#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleAIMarketplaceStack } from '../lib/simple-stack';

const app = new cdk.App();

// Get environment from context or default to production
const environment = app.node.tryGetContext('environment') || 'production';

// Stack name must match what is expected by scripts/deploy-multi-tenant.sh ("AIMarketplaceAssistant-Simple")
new SimpleAIMarketplaceStack(app, 'AIMarketplaceAssistant-Simple', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: `AI Marketplace Assistant - Simple Stack (${environment})`,
});
