#!/bin/bash

# Deploy Whapi.cloud Webhook Handler
# This script updates your existing Lambda function with the new Whapi.cloud handler

echo "🚀 Deploying Whapi.cloud Webhook Handler..."

# Configuration
FUNCTION_NAME="ai-marketplace-platform-webhook-handler"
REGION="us-east-1"

# Environment variables for the Lambda
WHAPI_API_URL="https://gate.whapi.cloud"
WHAPI_TOKEN="zxie3qHCVGns5Bp8EthOCziMoIz6TAYP"
WHAPI_CHANNEL_ID="HAWKEY-CZRHZ"

echo "📋 Deployment Configuration:"
echo "   - Function: $FUNCTION_NAME"
echo "   - Region: $REGION"
echo "   - Whapi URL: $WHAPI_API_URL"
echo "   - Channel: $WHAPI_CHANNEL_ID"
echo ""

# Step 1: Build the new handler
echo "1️⃣ Building TypeScript code..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Step 2: Create deployment package
echo "2️⃣ Creating deployment package..."
cd dist
zip -r ../whapi-webhook-handler.zip . -x "*.map"
cd ..

if [ ! -f "whapi-webhook-handler.zip" ]; then
    echo "❌ Failed to create deployment package"
    exit 1
fi

echo "✅ Deployment package created"

# Step 3: Update Lambda function code
echo "3️⃣ Updating Lambda function code..."
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://whapi-webhook-handler.zip \
  --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Failed to update function code"
    exit 1
fi

echo "✅ Function code updated"

# Step 4: Update environment variables
echo "4️⃣ Updating environment variables..."
aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --environment Variables="{
    WHAPI_API_URL=$WHAPI_API_URL,
    WHAPI_TOKEN=$WHAPI_TOKEN,
    WHAPI_CHANNEL_ID=$WHAPI_CHANNEL_ID,
    MESSAGE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/747680064475/ai-marketplace-message-queue.fifo,
    TENANTS_TABLE=ai-marketplace-tenants-platform,
    CONVERSATIONS_TABLE=ai-marketplace-conversations-platform
  }" \
  --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Failed to update environment variables"
    exit 1
fi

echo "✅ Environment variables updated"

# Step 5: Update handler entry point
echo "5️⃣ Updating handler entry point..."
aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --handler "whapi-webhook-handler.handler" \
  --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Failed to update handler"
    exit 1
fi

echo "✅ Handler entry point updated"

# Step 6: Test the function
echo "6️⃣ Testing function deployment..."
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{"httpMethod":"GET","queryStringParameters":{"hub":"test"}}' \
  --region $REGION \
  test-response.json

if [ $? -eq 0 ]; then
    echo "✅ Function test successful"
    cat test-response.json
    rm test-response.json
else
    echo "❌ Function test failed"
fi

# Cleanup
rm -f whapi-webhook-handler.zip

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Configure Whapi.cloud webhook URL:"
echo "      https://zq3oc7n5e8.execute-api.us-east-1.amazonaws.com/prod/webhook"
echo ""
echo "   2. Test by sending a message to +573147684545"
echo ""
echo "   3. Monitor CloudWatch logs:"
echo "      aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
echo ""
echo "✅ Your AI Marketplace Assistant is ready for Whapi.cloud!"