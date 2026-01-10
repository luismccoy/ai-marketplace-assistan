# Security Audit Report

## 🛡️ Identity & Access Management (IAM)
*   **Lambda Execution Roles**:
    *   `MessageHandler`: Has `GRANT_READ_WRITE` on `TenantsTable`, `ConversationsTable`, `ProductsTable`.
        *   *Risk*: Broad write permissions.
        *   *Recommendation*: Scope down to `PutItem`, `GetItem`, `Query` where possible.
    *   `BillingApiHandler`: Has `GRANT_READ_WRITE` on `UsageMetricsTable`.
        *   *Status*: Appropriate for billing logic.

## 🔐 API Gateway Authentication
*   **`GET /billing/usage`**: Secured by `CognitoAuthorizer`. ✅
*   **`POST /billing/portal`**: Secured by `CognitoAuthorizer`. ✅
*   **`POST /webhook`**: Public (Required for Meta/WhatsApp).
    *   *Mitigation*: Must verify `X-Hub-Signature-256` (Meta) or `X-Whapi-Signature` (Whapi).
    *   *Action*: Verify signature validation logic in `webhook-handler`.

## 🔑 Secrets Management
*   **Stripe Keys**: Injected via `process.env`.
    *   *Best Practice*: Move to AWS Secrets Manager for rotation and encryption at rest in production.
    *   *Current*: Acceptable for MVP/Beta.

## 📝 Recommendations
1.  **Strict IAM Scoping**: Update CDK to use specific `grant` methods (e.g., `grantReadData` instead of `grantReadWriteData` for Reporting lambdas).
2.  **Webhook Validation**: Ensure the `webhook-handler` strictly validates the incoming signature before processing to preventing spoofing.
