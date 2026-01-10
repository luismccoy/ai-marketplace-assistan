
import { ProductInquiryHandler } from '../src/services/product-inquiry-handler';
import { ProductService } from '../src/services/product-service';


// Manual Mock of ProductService
const mockSearchProducts = async () => ({
    products: [
        {
            productId: '1', name: 'iPhone 13 Pro', description: 'Apple Phone 128GB', category: 'Electronics', price: 800, status: 'available', location: 'Centro',
            tenantId: 'tenant_1', condition: 'used', createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 }, images: []
        },
        {
            productId: '2', name: 'Samsung S21', description: 'Samsung Galaxy Android', category: 'Electronics', price: 600, status: 'available', location: 'Norte',
            tenantId: 'tenant_1', condition: 'used', createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 }, images: []
        },
        {
            productId: '3', name: 'Sofa Cama', description: 'Mueble para sala', category: 'Furniture', price: 200, status: 'available', location: 'Centro',
            tenantId: 'tenant_1', condition: 'used', createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 }, images: []
        },
        {
            productId: '4', name: 'iPhone 12', description: 'Apple Phone nice condition', category: 'Electronics', price: 500, status: 'available', location: 'Sur',
            tenantId: 'tenant_1', condition: 'used', createdAt: '', updatedAt: '', discountRange: { min: 0, max: 0 }, images: []
        }
    ],
    totalCount: 4
});

ProductService.prototype.searchProducts = mockSearchProducts as any;
ProductService.prototype.getProductsByCategory = async () => (await mockSearchProducts()).products as any; // Fallback

async function verifyRecommendations() {
    console.log('🚀 Verifying Recommendation Algorithm...\n');

    const handler = new ProductInquiryHandler();

    // Simulate searching for "iphone"
    // The handler calls generateProductRecommendations internally when handleRecommendationInquiry is called
    // But calculateKeywordScore is private, so we test the public method result.

    const inquiry = {
        tenantId: 'test_tenant',
        customerId: 'cust_1',
        inquiryType: 'recommendation' as const,
        searchTerm: 'iphone apple', // Keywords to match
        category: 'Electronics'
    };

    const response = await handler.handleRecommendationInquiry(inquiry);

    console.log('Inquiry: "iphone apple" in Electronics');

    if (response.success && response.recommendations) {
        console.log(`Found ${response.recommendations.length} recommendations:`);
        response.recommendations.forEach((p: any) => {
            console.log(`- ${p.name} ($${p.price})`);
        });

        const top1 = response.recommendations[0];
        if (top1.name.includes('iPhone')) {
            console.log('✅ Top recommendation matches keywords!');
        } else {
            console.error('❌ Recommendation logic failed (Ranked irrelevant product first)');
        }
    } else {
        console.error('❌ No recommendations returned');
    }
}

verifyRecommendations();
