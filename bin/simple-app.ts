#!/usr/bin/env node
/**
 * Simple AI Marketplace Assistant App
 * Minimal CDK app for cloud deployment
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleAIMarketplaceStack } from '../lib/simple-stack';

const app = new cdk.App();

new SimpleAIMarketplaceStack(app, 'AIMarketplaceAssistantStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'AI Marketplace Assistant - Simple WhatsApp Bot Stack',
});

app.synth();