#!/bin/bash

# Test Whapi.cloud Webhook Integration
# This script tests your webhook with sample Whapi.cloud payloads

echo "🧪 Testing Whapi.cloud Webhook Integration..."

WEBHOOK_URL="https://zq3oc7n5e8.execute-api.us-east-1.amazonaws.com/prod/webhook"

echo "📋 Test Configuration:"
echo "   - Webhook URL: $WEBHOOK_URL"
echo "   - Channel ID: HAWKEY-CZRHZ"
echo "   - Test Phone: +573147684545"
echo ""

# Test 1: Webhook verification (GET request)
echo "1️⃣ Testing webhook verification..."
curl -X GET "$WEBHOOK_URL?hub=test_verification" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n"

echo ""

# Test 2: Direct message payload
echo "2️⃣ Testing direct message payload..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "id": "test-message-001",
        "from_me": false,
        "type": "text",
        "chat_id": "573147684545@s.whatsapp.net",
        "timestamp": '$(date +%s)',
        "source": "mobile",
        "text": {
          "body": "Hola, tienen productos disponibles?"
        },
        "from": "573147684545",
        "from_name": "Test User"
      }
    ],
    "channel_id": "HAWKEY-CZRHZ"
  }' \
  -w "\nStatus: %{http_code}\n"

echo ""

# Test 3: Chat update payload (like your real messages)
echo "3️⃣ Testing chat update payload..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "chats_updates": [
      {
        "before_update": {
          "id": "573147684545@s.whatsapp.net",
          "type": "contact",
          "timestamp": '$(date +%s)',
          "unread": 1
        },
        "after_update": {
          "id": "573147684545@s.whatsapp.net",
          "type": "contact",
          "timestamp": '$(date +%s)',
          "unread": 2,
          "last_message": {
            "id": "test-chat-update-001",
            "from_me": false,
            "type": "text",
            "chat_id": "573147684545@s.whatsapp.net",
            "timestamp": '$(date +%s)',
            "source": "mobile",
            "text": {
              "body": "Tienen teléfonos disponibles?"
            },
            "from": "573147684545",
            "from_name": "Luis Test"
          }
        },
        "changes": ["timestamp", "unread", "last_message"]
      }
    ],
    "channel_id": "HAWKEY-CZRHZ"
  }' \
  -w "\nStatus: %{http_code}\n"

echo ""

# Test 4: Check CloudWatch logs
echo "4️⃣ Checking recent CloudWatch logs..."
aws logs filter-log-events \
  --log-group-name "/aws/lambda/ai-marketplace-platform-webhook-handler" \
  --start-time $(date -d '5 minutes ago' +%s)000 \
  --region us-east-1 \
  --query 'events[*].[timestamp,message]' \
  --output table

echo ""

# Test 5: Check SQS queue for messages
echo "5️⃣ Checking SQS queue for processed messages..."
aws sqs get-queue-attributes \
  --queue-url "https://sqs.us-east-1.amazonaws.com/747680064475/ai-marketplace-message-queue.fifo" \
  --attribute-names ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible \
  --region us-east-1 \
  --output table

echo ""
echo "✅ Webhook testing complete!"
echo ""
echo "📊 Results Analysis:"
echo "   - Status 200: Webhook is working correctly"
echo "   - Status 400/500: Check CloudWatch logs for errors"
echo "   - SQS messages > 0: Messages are being queued for processing"
echo ""
echo "🔍 To monitor real-time:"
echo "   aws logs tail /aws/lambda/ai-marketplace-platform-webhook-handler --follow --region us-east-1"