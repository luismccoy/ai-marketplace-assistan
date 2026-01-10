#!/bin/bash

# Run Docker tests with required environment variables
docker run --rm \
  -e AWS_REGION=us-east-1 \
  -e WHATSAPP_PHONE_NUMBER_ID=test-phone-id \
  -e WHATSAPP_ACCESS_TOKEN=test-access-token \
  -e WHATSAPP_WEBHOOK_VERIFY_TOKEN=test-verify-token \
  -e ADMIN_EMAIL=admin@test.com \
  -e NODE_ENV=test \
  ai-marketplace-test npm test -- --testPathPattern="property" --verbose --maxWorkers=1