/**
 * TypeScript types for multi-tenant architecture
 */

export interface TenantConfig {
  tenantId: string;
  businessName: string;
  ownerName: string;
  whatsappNumbers: string[]; // WhatsApp Business numbers associated with this tenant
  status: 'active' | 'suspended' | 'trial';
  plan: 'basic' | 'pro' | 'enterprise';
  createdAt: string;
  updatedAt: string;

  // Business configuration
  businessConfig: {
    communicationStyle: {
      tone: 'formal' | 'friendly' | 'casual';
      useEmojis: boolean;
      typicalPhrases: string[];
      greetingStyle: string;
      closingStyle: string;
    };
    shippingInfo: {
      available: boolean;
      zones: string[];
      costs: Record<string, number>;
      estimatedDays: number;
    };
    discountPolicy: {
      allowNegotiation: boolean;
      maxDiscountPercent: number;
      bulkDiscounts: boolean;
    };
    appointmentConfig: {
      enabled: boolean;
      businessHours: string;
      calendarUrl?: string;
    };
    paymentConfig: {
      methods: string[];
      instructions?: string;
    };
  };

  // AI configuration
  aiConfig: {
    model: 'claude-3-haiku' | 'claude-3-sonnet';
    maxTokens: number;
    temperature: number;
    enableRAG: boolean;
    customPrompts?: {
      systemPrompt?: string;
      greetingPrompt?: string;
      escalationPrompt?: string;
    };
  };

  // Limits and usage
  limits: {
    maxConversationsPerMonth: number;
    maxMessagesPerDay: number;
    maxProductsCount: number;
    maxStorageGB: number;
  };

  // Contact and billing
  contactInfo: {
    email: string;
    phone?: string;
    address?: string;
  };

  // Integration settings
  integrations: {
    whatsappBusinessAPI?: {
      accessToken: string;
      phoneNumberId: string;
      verifyToken: string;
    };
    facebookMarketplace?: {
      accessToken: string;
      pageId: string;
    };
    notifications: {
      escalationEmail?: string;
      escalationWhatsApp?: string;
      enableSMSNotifications: boolean;
    };
  };
}

export interface TenantUsage {
  tenantId: string;
  month: string; // YYYY-MM format
  conversationsCount: number;
  messagesCount: number;
  aiTokensUsed: number;
  storageUsedGB: number;
  lastUpdated: string;

  // Daily breakdown
  dailyStats: {
    date: string; // YYYY-MM-DD
    conversations: number;
    messages: number;
    tokens: number;
  }[];
}

export interface TenantResolutionResult {
  tenantId: string;
  tenantConfig: TenantConfig;
  isValid: boolean;
  errorMessage?: string;
}

export interface TenantContext {
  tenantId: string;
  businessName: string;
  businessConfig: TenantConfig['businessConfig'];
  aiConfig: TenantConfig['aiConfig'];
  limits: TenantConfig['limits'];
  currentUsage?: TenantUsage;
}

// Update existing types to include tenantId
export interface TenantAwareRecord {
  tenantId: string;
}

// Tenant-aware conversation context
export interface TenantConversationContext extends TenantAwareRecord {
  conversationId: string;
  customerId: string;
  status: 'active' | 'escalated' | 'closed';
  lastIntent: string;
  productInquiries: string[];
  messages: TenantConversationMessage[];
  createdAt: string;
  lastUpdate: string;
  escalationReason?: string;
  assignedAgent?: string;
}

export interface TenantConversationMessage extends TenantAwareRecord {
  id: string;
  conversationId: string;
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

// Tenant-aware customer profile
export interface TenantCustomerProfile extends TenantAwareRecord {
  phoneNumber: string;
  name?: string;
  preferredLanguage: 'es' | 'en';
  inquiryHistory: string[];
  leadScore: number;
  totalConversations: number;
  lastInteraction: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

// Tenant-aware product
export interface TenantProduct extends TenantAwareRecord {
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
  syncStatus?: {
    facebook: { synced: boolean; lastSync: string };
    whatsappStatus: { synced: boolean; lastSync: string };
  };
}

// Tenant isolation validation
export interface TenantIsolationCheck {
  operation: string;
  tenantId: string;
  resourceId: string;
  resourceType: 'conversation' | 'customer' | 'product' | 'usage';
  isValid: boolean;
  errorMessage?: string;
}

// Tenant limits enforcement
export interface TenantLimitCheck {
  tenantId: string;
  limitType: 'conversations' | 'messages' | 'products' | 'storage';
  currentUsage: number;
  limit: number;
  isWithinLimit: boolean;
  utilizationPercent: number;
  warningThreshold?: number;
}