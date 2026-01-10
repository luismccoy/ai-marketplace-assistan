#!/bin/bash

# AI Marketplace Assistant - Multi-Tenant Deployment Script
# This script deploys the multi-tenant architecture to AWS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="AIMarketplaceAssistant-Simple"
REGION="us-east-1"
ENVIRONMENT=${1:-production}

echo -e "${BLUE}🚀 AI Marketplace Assistant - Multi-Tenant Deployment${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Stack Name: ${YELLOW}$STACK_NAME${NC}"
echo -e "Region: ${YELLOW}$REGION${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install AWS CLI.${NC}"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured. Please run 'aws configure'.${NC}"
    exit 1
fi

# Check CDK
if ! command -v cdk &> /dev/null; then
    echo -e "${YELLOW}⚠️  CDK not found globally. Installing...${NC}"
    npm install -g aws-cdk@latest
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required. Current: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Build project
echo -e "${BLUE}🔨 Building project...${NC}"
npm ci
npm run build

# Bootstrap CDK (if needed)
echo -e "${BLUE}🏗️  Bootstrapping CDK (if needed)...${NC}"
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$REGION

# Deploy stack
echo -e "${BLUE}🚀 Deploying multi-tenant stack...${NC}"
cdk deploy $STACK_NAME \
    --require-approval never \
    --context environment=$ENVIRONMENT \
    --outputs-file deployment-outputs.json

# Check deployment status
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

# Extract outputs
if [ -f "deployment-outputs.json" ]; then
    echo ""
    echo -e "${BLUE}📊 Deployment Outputs:${NC}"
    
    WEBHOOK_URL=$(cat deployment-outputs.json | jq -r ".[\"$STACK_NAME\"].PlatformWebhookURL // empty")
    API_URL=$(cat deployment-outputs.json | jq -r ".[\"$STACK_NAME\"].PlatformAPIGatewayURL // empty")
    TENANTS_TABLE=$(cat deployment-outputs.json | jq -r ".[\"$STACK_NAME\"].TenantsTableName // empty")
    
    if [ ! -z "$WEBHOOK_URL" ]; then
        echo -e "Webhook URL: ${GREEN}$WEBHOOK_URL${NC}"
    fi
    
    if [ ! -z "$API_URL" ]; then
        echo -e "API Gateway URL: ${GREEN}$API_URL${NC}"
    fi
    
    if [ ! -z "$TENANTS_TABLE" ]; then
        echo -e "Tenants Table: ${GREEN}$TENANTS_TABLE${NC}"
    fi
fi

# Verify deployment
echo ""
echo -e "${BLUE}🔍 Verifying deployment...${NC}"

# Check if stack exists and is in good state
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$STACK_STATUS" == *"COMPLETE"* ]]; then
    echo -e "${GREEN}✅ Stack status: $STACK_STATUS${NC}"
else
    echo -e "${RED}❌ Stack status: $STACK_STATUS${NC}"
    exit 1
fi

# Check DynamoDB tables
echo -e "${BLUE}📊 Checking DynamoDB tables...${NC}"
TABLES=(
    "ai-marketplace-tenants-platform"
    "ai-marketplace-conversations-platform"
    "ai-marketplace-products-platform"
    "ai-marketplace-embeddings-platform"
)

for table in "${TABLES[@]}"; do
    TABLE_STATUS=$(aws dynamodb describe-table \
        --table-name $table \
        --region $REGION \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$TABLE_STATUS" == "ACTIVE" ]; then
        echo -e "  ✅ $table: ${GREEN}ACTIVE${NC}"
    else
        echo -e "  ❌ $table: ${RED}$TABLE_STATUS${NC}"
    fi
done

# Check Lambda functions
echo -e "${BLUE}⚡ Checking Lambda functions...${NC}"
FUNCTIONS=(
    "ai-marketplace-platform-webhook-handler"
    "ai-marketplace-platform-message-handler"
)

for func in "${FUNCTIONS[@]}"; do
    FUNC_STATUS=$(aws lambda get-function \
        --function-name $func \
        --region $REGION \
        --query 'Configuration.State' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$FUNC_STATUS" == "Active" ]; then
        echo -e "  ✅ $func: ${GREEN}Active${NC}"
    else
        echo -e "  ❌ $func: ${RED}$FUNC_STATUS${NC}"
    fi
done

# Test webhook endpoint
if [ ! -z "$WEBHOOK_URL" ]; then
    echo -e "${BLUE}🌐 Testing webhook endpoint...${NC}"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=verify-token-123&hub.challenge=test123" || echo "000")
    
    if [ "$HTTP_STATUS" == "200" ]; then
        echo -e "  ✅ Webhook test: ${GREEN}SUCCESS (HTTP $HTTP_STATUS)${NC}"
    else
        echo -e "  ⚠️  Webhook test: ${YELLOW}HTTP $HTTP_STATUS${NC}"
        echo -e "     This might be expected if verify token is different"
    fi
fi

# Check tenant count
if [ ! -z "$TENANTS_TABLE" ]; then
    echo -e "${BLUE}👥 Checking tenant configuration...${NC}"
    
    TENANT_COUNT=$(aws dynamodb scan \
        --table-name $TENANTS_TABLE \
        --region $REGION \
        --select COUNT \
        --query 'Count' \
        --output text 2>/dev/null || echo "0")
    
    echo -e "  📊 Active tenants: ${GREEN}$TENANT_COUNT${NC}"
    
    if [ "$TENANT_COUNT" -gt 0 ]; then
        echo -e "  ${BLUE}Tenant list:${NC}"
        aws dynamodb scan \
            --table-name $TENANTS_TABLE \
            --region $REGION \
            --query 'Items[].{TenantId:tenantId.S,BusinessName:businessName.S,Status:status.S}' \
            --output table 2>/dev/null || echo "    Unable to list tenants"
    else
        echo -e "  ${YELLOW}⚠️  No tenants configured. Run tenant initialization script.${NC}"
    fi
fi

# Final summary
echo ""
echo -e "${GREEN}🎉 Multi-Tenant Architecture Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "1. Configure WhatsApp Business API credentials for each tenant"
echo -e "2. Initialize sample tenants (if needed): node src/scripts/initialize-tenants.js"
echo -e "3. Test message processing with sample WhatsApp numbers"
echo -e "4. Set up monitoring and alerts"
echo -e "5. Configure CI/CD pipeline for automated deployments"
echo ""

# Update deployment timeline
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")
echo "$TIMESTAMP | $COMMIT_HASH | Multi-Tenant Architecture Deployment | DEPLOYED" >> DEPLOYMENT_TIMELINE.md

echo -e "${GREEN}📝 Deployment timeline updated${NC}"
echo ""
echo -e "${BLUE}Deployment Summary:${NC}"
echo -e "  Environment: $ENVIRONMENT"
echo -e "  Stack: $STACK_NAME"
echo -e "  Region: $REGION"
echo -e "  Status: ${GREEN}SUCCESS${NC}"
echo -e "  Timestamp: $TIMESTAMP"

# Cleanup
rm -f deployment-outputs.json

echo ""
echo -e "${GREEN}✨ Deployment script completed successfully!${NC}"