import React, { useState, useEffect } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

interface Product {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  status: 'available' | 'sold' | 'reserved';
  condition: 'new' | 'used' | 'refurbished';
  stock: number;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

const ProductManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockProducts: Product[] = [
        {
          id: '1',
          tenantId: 'tenant-1',
          name: 'iPhone 15 Pro',
          description: 'Latest iPhone with advanced camera system and A17 Pro chip',
          price: 1200000,
          currency: 'COP',
          category: 'Electronics',
          status: 'available',
          condition: 'new',
          stock: 5,
          images: ['https://via.placeholder.com/300x300?text=iPhone+15+Pro'],
          createdAt: '2026-01-08T10:00:00Z',
          updatedAt: '2026-01-08T10:00:00Z',
        },
        {
          id: '2',
          tenantId: 'tenant-1',
          name: 'MacBook Air M2',
          description: 'Lightweight laptop with M2 chip, perfect for productivity',
          price: 2500000,
          currency: 'COP',
          category: 'Electronics',
          status: 'available',
          condition: 'new',
          stock: 3,
          images: ['https://via.placeholder.com/300x300?text=MacBook+Air'],
          createdAt: '2026-01-08T09:30:00Z',
          updatedAt: '2026-01-08T09:30:00Z',
        },
        {
          id: '3',
          tenantId: 'tenant-1',
          name: 'Samsung Galaxy S24',
          description: 'Android smartphone with excellent camera and display',
          price: 900000,
          currency: 'COP',
          category: 'Electronics',
          status: 'sold',
          condition: 'new',
          stock: 0,
          images: ['https://via.placeholder.com/300x300?text=Galaxy+S24'],
          createdAt: '2026-01-08T08:00:00Z',
          updatedAt: '2026-01-08T20:00:00Z',
        },
        {
          id: '4',
          tenantId: 'tenant-1',
          name: 'Nike Air Max 270',
          description: 'Comfortable running shoes with Air Max technology',
          price: 350000,
          currency: 'COP',
          category: 'Fashion',
          status: 'available',
          condition: 'new',
          stock: 12,
          images: ['https://via.placeholder.com/300x300?text=Nike+Air+Max'],
          createdAt: '2026-01-08T07:00:00Z',
          updatedAt: '2026-01-08T07:00:00Z',
        },
      ];
      
      setProducts(mockProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = Array.from(new Set(products.map(p => p.category)));

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || product.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-gray-100 text-gray-800';
      case 'reserved': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'used': return 'bg-orange-100 text-orange-800';
      case 'refurbished': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const handleCreateProduct = () => {
    setSelectedProduct(null);
    setModalMode('create');
    setShowModal(true);
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setModalMode('view');
    setShowModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        // TODO: Replace with actual API call
        setProducts(prev => prev.filter(p => p.id !== productId));
      } catch (error) {
        console.error('Failed to delete product:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Product Management</h1>
            <p className="mt-2 text-sm text-gray-700">
              Manage your product catalog and inventory.
            </p>
          </div>
          <button
            onClick={handleCreateProduct}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Product
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <FunnelIcon className="h-5 w-5 text-gray-400" />
              <select
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            
            <div>
              <select
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="available">Available</option>
                <option value="sold">Sold</option>
                <option value="reserved">Reserved</option>
              </select>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="aspect-w-1 aspect-h-1 w-full">
                <img
                  src={product.images[0] || 'https://via.placeholder.com/300x300?text=No+Image'}
                  alt={product.name}
                  className="w-full h-48 object-cover"
                />
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-gray-900 truncate">{product.name}</h3>
                  <div className="flex space-x-1">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(product.status)}`}>
                      {product.status}
                    </span>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">{product.description}</p>
                
                <div className="flex justify-between items-center mb-3">
                  <span className="text-lg font-bold text-gray-900">
                    {formatPrice(product.price, product.currency)}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConditionColor(product.condition)}`}>
                    {product.condition}
                  </span>
                </div>
                
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-500">Stock: {product.stock}</span>
                  <span className="text-sm text-gray-500">{product.category}</span>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewProduct(product)}
                    className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-200 flex items-center justify-center"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View
                  </button>
                  <button
                    onClick={() => handleEditProduct(product)}
                    className="flex-1 bg-blue-100 text-blue-700 px-3 py-2 rounded text-sm hover:bg-blue-200 flex items-center justify-center"
                  >
                    <PencilIcon className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm hover:bg-red-200"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || filterCategory !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Get started by adding your first product.'}
            </p>
          </div>
        )}

        {/* Product Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {modalMode === 'create' ? 'Add New Product' : 
                     modalMode === 'edit' ? 'Edit Product' : 'Product Details'}
                  </h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                
                {selectedProduct && modalMode === 'view' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <img
                          src={selectedProduct.images[0] || 'https://via.placeholder.com/300x300?text=No+Image'}
                          alt={selectedProduct.name}
                          className="w-full h-64 object-cover rounded-md"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Name</h4>
                          <p className="text-sm text-gray-600">{selectedProduct.name}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Price</h4>
                          <p className="text-sm text-gray-600">
                            {formatPrice(selectedProduct.price, selectedProduct.currency)}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Category</h4>
                          <p className="text-sm text-gray-600">{selectedProduct.category}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Status</h4>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedProduct.status)}`}>
                            {selectedProduct.status}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Condition</h4>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConditionColor(selectedProduct.condition)}`}>
                            {selectedProduct.condition}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Stock</h4>
                          <p className="text-sm text-gray-600">{selectedProduct.stock} units</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Description</h4>
                      <p className="text-sm text-gray-600 mt-1">{selectedProduct.description}</p>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Close
                  </button>
                  {modalMode === 'view' && (
                    <button
                      onClick={() => setModalMode('edit')}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Edit Product
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductManagement;