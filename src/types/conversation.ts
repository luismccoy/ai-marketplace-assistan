/**
 * TypeScript types for conversation management
 */

export interface ConversationMessage {
  id: string;
  from: 'customer' | 'bot' | 'human';
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio';
  metadata?: {
    intent?: string;
    confidence?: number;
    escalated?: boolean;
    [key: string]: any;
  };
}

export interface ConversationContext {
  customerId: string;
  status: 'active' | 'escalated' | 'closed';
  lastIntent: string;
  lastResponse?: string;
  productInquiries: string[];
  messages: ConversationMessage[];
  createdAt: string;
  lastUpdate: string;
  escalationReason?: string;
  assignedAgent?: string;
  tenantId?: string; // Optional for compatibility with tenant-aware context
}

export interface CustomerProfile {
  phoneNumber: string;
  name?: string;
  preferredLanguage: 'es' | 'en';
  inquiryHistory: string[];
  leadScore: number;
  totalConversations: number;
  lastInteraction: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotResponse {
  response: string;
  intent: string;
  confidence: number;
  shouldEscalate: boolean;
  updatedContext: Partial<ConversationContext>;
  suggestedActions?: string[];
  metadata?: {
    processingTime?: number;
    modelUsed?: string;
    tokensUsed?: number;
    [key: string]: any;
  };
}

export interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  discountRange: { min: number; max: number };
  category: string;
  condition: 'new' | 'used' | 'refurbished';
  location: string;
  images: string[];
  status: 'available' | 'sold' | 'reserved';
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  entities: {
    productName?: string;
    priceRange?: { min: number; max: number };
    location?: string;
    [key: string]: any;
  };
}

export interface EscalationTrigger {
  type: 'low_confidence' | 'price_negotiation' | 'complaint' | 'complex_query' | 'manual_request' | 'sentiment';
  confidence: number;
  reason: string;
  metadata?: any;
}