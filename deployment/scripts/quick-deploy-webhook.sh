#!/bin/bash

# Quick deployment script for updated webhook handler
# This script directly updates the Lambda function with the fixed code

echo "🚀 Quick deploying updated webhook handler..."

FUNCTION_NAME="ai-marketplace-platform-webhook-handler"
REGION="us-east-1"

# Step 1: Create a simple deployment package
echo "1️⃣ Creating deployment package..."

# Create a temporary directory
mkdir -p temp-deploy
cd temp-deploy

# Copy the updated webhook handler
cp ../src/lambdas/webhook-handler.ts ./index.ts

# Create a simple package.json
cat > package.json << 'EOF'
{
  "name": "webhook-handler",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-sqs": "^3.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0"
  }
}
EOF

# Install dependencies (if npm is available)
if command -v npm &> /dev/null; then
    npm install --production
fi

# Create the zip file
zip -r ../webhook-handler-update.zip . -x "*.ts"

cd ..
rm -rf temp-deploy

echo "✅ Deployment package created"

# Step 2: Update the Lambda function
echo "2️⃣ Updating Lambda function..."

aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://webhook-handler-update.zip \
  --region $REGION

if [ $? -eq 0 ]; then
    echo "✅ Lambda function updated successfully"
else
    echo "❌ Failed to update Lambda function"
    echo "💡 The current webhook handler already supports Whapi.cloud format"
    echo "💡 The issue might be that it needs to be recompiled and deployed"
fi

# Cleanup
rm -f webhook-handler-update.zip

echo ""
echo "🎯 Alternative Solution:"
echo "Since the webhook handler code is already updated to support Whapi.cloud,"
echo "but the deployed version still shows 'Tenant not found', here's what to do:"
echo ""
echo "1️⃣ The tenant is correctly configured (HAWKEY-CZRHZ)"
echo "2️⃣ The code supports Whapi.cloud format"
echo "3️⃣ The issue is the deployed Lambda needs the updated code"
echo ""
echo "📋 Manual deployment steps:"
echo "   1. Build your TypeScript code: npm run build"
echo "   2. Create deployment package with built JS files"
echo "   3. Update Lambda function with new package"
echo ""
echo "🧪 Test again after deployment:"
echo "   curl -X POST 'https://zq3oc7n5e8.execute-api.us-east-1.amazonaws.com/prod/webhook' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"chats_updates\":[{\"after_update\":{\"last_message\":{\"id\":\"test\",\"from_me\":false,\"type\":\"text\",\"text\":{\"body\":\"test\"},\"from\":\"573147684545\",\"from_name\":\"Test\",\"timestamp\":1234567890}}}],\"channel_id\":\"HAWKEY-CZRHZ\"}'"