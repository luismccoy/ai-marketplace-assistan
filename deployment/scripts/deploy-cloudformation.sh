#!/bin/bash

# AI Marketplace Assistant - Direct CloudFormation Deployment
# Simple deployment using AWS CLI and CloudFormation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header "AI Marketplace Assistant - CloudFormation Deployment"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please configure AWS credentials."
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}
STACK_NAME="AIMarketplaceAssistant-Simple"

print_status "AWS Account: $AWS_ACCOUNT"
print_status "AWS Region: $AWS_REGION"
print_status "Stack Name: $STACK_NAME"

# Check if stack already exists
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
    print_status "Stack $STACK_NAME already exists. Updating..."
    OPERATION="update-stack"
    OPERATION_NAME="Update"
else
    print_status "Creating new stack: $STACK_NAME"
    OPERATION="create-stack"
    OPERATION_NAME="Create"
fi

# Deploy the stack
print_status "Starting CloudFormation $OPERATION_NAME operation..."

if [[ "$OPERATION" == "create-stack" ]]; then
    aws cloudformation create-stack \
        --stack-name "$STACK_NAME" \
        --template-body file://cloudformation-template.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        --parameters ParameterKey=Environment,ParameterValue=production \
        --tags Key=Application,Value=AI-Marketplace-Assistant \
               Key=AutoDelete,Value=NO \
               Key=Environment,Value=production \
               Key=ManagedBy,Value=CloudFormation \
        --region "$AWS_REGION"
else
    aws cloudformation update-stack \
        --stack-name "$STACK_NAME" \
        --template-body file://cloudformation-template.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        --parameters ParameterKey=Environment,ParameterValue=production \
        --region "$AWS_REGION"
fi

print_status "Waiting for stack $OPERATION_NAME to complete..."

# Wait for stack operation to complete
aws cloudformation wait stack-${OPERATION%-stack}-complete \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION"

# Check the final status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text)

if [[ "$STACK_STATUS" == *"COMPLETE"* ]]; then
    print_success "Stack $OPERATION_NAME completed successfully!"
    
    # Get stack outputs
    print_header "Deployment Outputs"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue,Description]' \
        --output table
    
    # Save outputs to file
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json > deployment-outputs.json
    
    print_success "Deployment outputs saved to deployment-outputs.json"
    
else
    print_error "Stack $OPERATION_NAME failed with status: $STACK_STATUS"
    
    # Get stack events for debugging
    print_status "Recent stack events:"
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'StackEvents[0:10].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId,ResourceStatusReason]' \
        --output table
    
    exit 1
fi

# Display deployment summary
print_header "Deployment Summary"
print_success "AI Marketplace Assistant deployed successfully! 🚀"
echo ""
print_status "📋 Deployment Information:"
echo "  Stack Name: $STACK_NAME"
echo "  AWS Account: $AWS_ACCOUNT"
echo "  AWS Region: $AWS_REGION"
echo "  Environment: production"
echo ""

# Check deployed resources
print_status "📊 Deployed Resources:"
echo ""
print_status "Lambda Functions:"
aws lambda list-functions \
    --query 'Functions[?contains(FunctionName, `ai-marketplace`)].FunctionName' \
    --output table || echo "  No Lambda functions found"

print_status "DynamoDB Tables:"
aws dynamodb list-tables \
    --query 'TableNames[?contains(@, `ai-marketplace`)]' \
    --output table || echo "  No DynamoDB tables found"

print_status "API Gateway APIs:"
aws apigateway get-rest-apis \
    --query 'items[?contains(name, `AI Marketplace`)].{Name:name,Id:id}' \
    --output table || echo "  No API Gateway APIs found"

echo ""
print_status "🔧 Next Steps:"
echo "  1. Configure WhatsApp Business API webhook URL"
echo "  2. Set up WhatsApp Business API credentials"
echo "  3. Test the webhook endpoints"
echo "  4. Configure monitoring and alerts"
echo ""

# Get the webhook URL for easy access
WEBHOOK_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`WebhookURL`].OutputValue' \
    --output text)

if [[ -n "$WEBHOOK_URL" ]]; then
    print_status "🌐 Webhook URL: $WEBHOOK_URL"
    echo ""
    print_status "Test the webhook with:"
    echo "  curl -X POST $WEBHOOK_URL -H 'Content-Type: application/json' -d '{\"test\": \"message\"}'"
fi

print_success "Deployment completed successfully! 🎉"