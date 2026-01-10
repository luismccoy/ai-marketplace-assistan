/**
 * Tenant Initialization Script
 * Creates sample tenants for testing multi-tenant architecture
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TenantConfig } from '../types/tenant';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TENANTS_TABLE = process.env.TENANTS_TABLE || 'ai-marketplace-tenants';

/**
 * Sample tenant configurations
 */
const sampleTenants: TenantConfig[] = [
  {
    tenantId: 'tenant_electronics_store',
    businessName: 'ElectroMax',
    ownerName: 'Carlos Rodriguez',
    whatsappNumbers: ['+573001234567', '+573007654321'],
    status: 'active',
    plan: 'pro',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    businessConfig: {
      communicationStyle: {
        tone: 'friendly',
        useEmojis: true,
        typicalPhrases: ['¡Perfecto!', '¡Excelente elección!', '¡Te va a encantar!'],
        greetingStyle: '¡Hola! Soy el asistente de ElectroMax 📱 ¿En qué te puedo ayudar?',
        closingStyle: '¡Gracias por contactarnos! ¡Que tengas un excelente día! 😊'
      },
      shippingInfo: {
        available: true,
        zones: ['bogotá', 'medellín', 'cali', 'barranquilla'],
        costs: {
          'bogotá': 15000,
          'medellín': 20000,
          'cali': 25000,
          'barranquilla': 30000
        },
        estimatedDays: 2
      },
      discountPolicy: {
        allowNegotiation: true,
        maxDiscountPercent: 15,
        bulkDiscounts: true
      },
      appointmentConfig: {
        enabled: true,
        businessHours: "9am - 6pm"
      },
      paymentConfig: {
        methods: ["Efectivo", "Tarjeta de Crédito"],
        instructions: "Paga en caja o con datáfono."
      }
    },

    aiConfig: {
      model: 'claude-3-sonnet',
      maxTokens: 1500,
      temperature: 0.7,
      enableRAG: true,
      customPrompts: {
        systemPrompt: 'Eres un asistente especializado en productos electrónicos. Siempre mantén un tono amigable y profesional.',
        greetingPrompt: 'Saluda al cliente y pregunta cómo puedes ayudarle con productos electrónicos.',
        escalationPrompt: 'Cuando no puedas resolver algo, conecta amablemente con un asesor humano.'
      }
    },

    limits: {
      maxConversationsPerMonth: 1000,
      maxMessagesPerDay: 2000,
      maxProductsCount: 200,
      maxStorageGB: 5
    },

    contactInfo: {
      email: 'admin@electromax.com',
      phone: '+573001234567',
      address: 'Calle 123 #45-67, Bogotá, Colombia'
    },

    integrations: {
      whatsappBusinessAPI: {
        accessToken: 'EAAG...', // Would be real token
        phoneNumberId: '123456789',
        verifyToken: 'electromax_verify_token'
      },
      facebookMarketplace: {
        accessToken: 'EAAG...',
        pageId: '987654321'
      },
      notifications: {
        escalationEmail: 'support@electromax.com',
        escalationWhatsApp: '+573001234567',
        enableSMSNotifications: true
      }
    }
  },

  {
    tenantId: 'tenant_fashion_boutique',
    businessName: 'Moda Bella',
    ownerName: 'Ana María González',
    whatsappNumbers: ['+573009876543'],
    status: 'active',
    plan: 'basic',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    businessConfig: {
      communicationStyle: {
        tone: 'friendly',
        useEmojis: true,
        typicalPhrases: ['¡Hermoso!', '¡Te queda perfecto!', '¡Está de moda!'],
        greetingStyle: '¡Hola bella! 👗 Soy la asistente de Moda Bella ¿Qué buscas hoy?',
        closingStyle: '¡Gracias por elegirnos! ¡Que luzcas hermosa! ✨'
      },
      shippingInfo: {
        available: true,
        zones: ['bogotá', 'medellín'],
        costs: { 'bogotá': 12000, 'medellín': 18000 },
        estimatedDays: 3
      },
      discountPolicy: {
        allowNegotiation: true,
        maxDiscountPercent: 10,
        bulkDiscounts: false
      },
      appointmentConfig: {
        enabled: true,
        businessHours: "10am - 7pm"
      },
      paymentConfig: {
        methods: ["Nequi", "Daviplata"],
        instructions: "Envía comprobante."
      }
    },

    aiConfig: {
      model: 'claude-3-haiku',
      maxTokens: 1000,
      temperature: 0.8,
      enableRAG: false
    },

    limits: {
      maxConversationsPerMonth: 300,
      maxMessagesPerDay: 500,
      maxProductsCount: 100,
      maxStorageGB: 2
    },

    contactInfo: {
      email: 'ana@modabella.com',
      phone: '+573009876543'
    },

    integrations: {
      notifications: {
        escalationEmail: 'ana@modabella.com',
        escalationWhatsApp: '+573009876543',
        enableSMSNotifications: false
      }
    }
  },

  {
    tenantId: 'tenant_auto_parts',
    businessName: 'AutoRepuestos Pro',
    ownerName: 'Miguel Herrera',
    whatsappNumbers: ['+573005555555'],
    status: 'trial',
    plan: 'basic',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    businessConfig: {
      communicationStyle: {
        tone: 'formal',
        useEmojis: false,
        typicalPhrases: ['Perfecto', 'Excelente', 'Sin problema'],
        greetingStyle: 'Buenos días. Soy el asistente de AutoRepuestos Pro. ¿En qué le puedo ayudar?',
        closingStyle: 'Gracias por contactarnos. Que tenga buen día.'
      },
      shippingInfo: {
        available: true,
        zones: ['nacional'],
        costs: { 'nacional': 25000 },
        estimatedDays: 5
      },
      discountPolicy: {
        allowNegotiation: false,
        maxDiscountPercent: 5,
        bulkDiscounts: true
      },
      appointmentConfig: {
        enabled: false,
        businessHours: "8am - 5pm"
      },
      paymentConfig: {
        methods: ["Efectivo"],
        instructions: ""
      }
    },

    aiConfig: {
      model: 'claude-3-haiku',
      maxTokens: 800,
      temperature: 0.5,
      enableRAG: false
    },

    limits: {
      maxConversationsPerMonth: 100,
      maxMessagesPerDay: 200,
      maxProductsCount: 50,
      maxStorageGB: 1
    },

    contactInfo: {
      email: 'miguel@autorepuestospro.com'
    },

    integrations: {
      notifications: {
        escalationEmail: 'miguel@autorepuestospro.com',
        enableSMSNotifications: false
      }
    }
  }
];

/**
 * Initialize tenants in DynamoDB
 */
async function initializeTenants(): Promise<void> {
  console.log('Initializing sample tenants...');

  try {
    for (const tenant of sampleTenants) {
      console.log(`Creating tenant: ${tenant.tenantId} (${tenant.businessName})`);

      await docClient.send(new PutCommand({
        TableName: TENANTS_TABLE,
        Item: tenant,
        ConditionExpression: 'attribute_not_exists(tenantId)' // Don't overwrite existing
      }));

      console.log(`✅ Tenant ${tenant.tenantId} created successfully`);
    }

    console.log('\n🎉 All sample tenants initialized successfully!');
    console.log('\nTenant Summary:');
    sampleTenants.forEach(tenant => {
      console.log(`- ${tenant.businessName} (${tenant.tenantId})`);
      console.log(`  WhatsApp: ${tenant.whatsappNumbers.join(', ')}`);
      console.log(`  Plan: ${tenant.plan} | Status: ${tenant.status}`);
      console.log('');
    });

  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      console.log('⚠️  Some tenants already exist, skipping...');
    } else {
      console.error('❌ Error initializing tenants:', error);
      throw error;
    }
  }
}

/**
 * Create sample products for tenants
 */
async function createSampleProducts(): Promise<void> {
  console.log('Creating sample products for tenants...');

  const productsTable = process.env.PRODUCTS_TABLE || 'ai-marketplace-products';

  const sampleProducts = [
    // ElectroMax products
    {
      productId: 'tenant_electronics_store#iphone_14_pro',
      tenantId: 'tenant_electronics_store',
      name: 'iPhone 14 Pro 128GB',
      description: 'iPhone 14 Pro en excelente estado, color morado, con cargador original',
      price: 3500000,
      discountRange: { min: 0, max: 10 },
      category: 'smartphones',
      condition: 'used',
      location: 'Bogotá',
      images: [],
      status: 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      productId: 'tenant_electronics_store#macbook_air_m2',
      tenantId: 'tenant_electronics_store',
      name: 'MacBook Air M2 256GB',
      description: 'MacBook Air M2 como nuevo, color plata, con caja y accesorios',
      price: 4800000,
      discountRange: { min: 0, max: 5 },
      category: 'laptops',
      condition: 'used',
      location: 'Medellín',
      images: [],
      status: 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },

    // Moda Bella products
    {
      productId: 'tenant_fashion_boutique#vestido_elegante',
      tenantId: 'tenant_fashion_boutique',
      name: 'Vestido Elegante Negro',
      description: 'Hermoso vestido negro talla M, perfecto para ocasiones especiales',
      price: 180000,
      discountRange: { min: 0, max: 15 },
      category: 'vestidos',
      condition: 'new',
      location: 'Bogotá',
      images: [],
      status: 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },

    // AutoRepuestos Pro products
    {
      productId: 'tenant_auto_parts#filtro_aceite_toyota',
      tenantId: 'tenant_auto_parts',
      name: 'Filtro de Aceite Toyota Corolla',
      description: 'Filtro de aceite original para Toyota Corolla 2015-2020',
      price: 45000,
      discountRange: { min: 0, max: 5 },
      category: 'filtros',
      condition: 'new',
      location: 'Nacional',
      images: [],
      status: 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  try {
    for (const product of sampleProducts) {
      await docClient.send(new PutCommand({
        TableName: productsTable,
        Item: product,
        ConditionExpression: 'attribute_not_exists(productId)'
      }));

      console.log(`✅ Product created: ${product.name}`);
    }

    console.log('🎉 Sample products created successfully!');
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      console.log('⚠️  Some products already exist, skipping...');
    } else {
      console.error('❌ Error creating sample products:', error);
      throw error;
    }
  }
}

/**
 * Main initialization function
 */
async function main(): Promise<void> {
  try {
    await initializeTenants();
    await createSampleProducts();

    console.log('\n🚀 Multi-tenant initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Update your WhatsApp webhook to point to the API Gateway URL');
    console.log('2. Configure WhatsApp Business API tokens for each tenant');
    console.log('3. Test message processing with the sample phone numbers');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { initializeTenants, createSampleProducts };