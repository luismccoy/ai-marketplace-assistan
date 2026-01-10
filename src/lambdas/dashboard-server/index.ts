import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userPoolId = process.env.USER_POOL_ID || '';
    const userPoolClientId = process.env.USER_POOL_CLIENT_ID || '';

    const dashboardHtml = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Marketplace Assistant - Admin Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.1/dist/amazon-cognito-identity.min.js"></script>
</head>

<body class="bg-gray-100">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect } = React;
        const API_BASE_URL = 'https://zq3oc7n5e8.execute-api.us-east-1.amazonaws.com/prod-v2';
        const COGNITO_CONFIG = {
            UserPoolId: '${userPoolId}',
            ClientId: '${userPoolClientId}'
        };

        const AuthManager = {
            getUserPool: () => new AmazonCognitoIdentity.CognitoUserPool(COGNITO_CONFIG),
            
            signup: (email, password, businessName) => {
                const userPool = AuthManager.getUserPool();
                const attributeList = [
                    new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: email }),
                    new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:tenantId', Value: 'pending-' + Math.random().toString(36).substr(2, 9) })
                ];
                return new Promise((resolve, reject) => {
                    userPool.signUp(email, password, attributeList, null, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            },

            login: (email, password) => {
                const userPool = AuthManager.getUserPool();
                const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: userPool });
                const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });
                
                return new Promise((resolve, reject) => {
                    cognitoUser.authenticateUser(authDetails, {
                        onSuccess: (result) => resolve(result),
                        onFailure: (err) => reject(err),
                    });
                });
            },

            logout: () => {
                const userPool = AuthManager.getUserPool();
                const cognitoUser = userPool.getCurrentUser();
                if (cognitoUser) cognitoUser.signOut();
                window.location.reload();
            },

            getSession: () => {
                const userPool = AuthManager.getUserPool();
                const cognitoUser = userPool.getCurrentUser();
                if (!cognitoUser) return Promise.reject('No user');
                
                return new Promise((resolve, reject) => {
                    cognitoUser.getSession((err, session) => {
                        if (err) reject(err);
                        else resolve(session);
                    });
                });
            }
        };

        const LandingPage = ({ onGetStarted, onLogin }) => (
            <div className="min-h-screen bg-gray-900 text-white font-sans">
                <div className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
                    <img src="/Users/luiscoy/.gemini/antigravity/brain/deec5b2c-3d5e-4763-8c36-6868fc7fb85c/marketplace_hero_bg_1768008856099.png" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                    <div className="relative z-10 text-center px-4 max-w-4xl">
                        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                            The AI Brain for Your Local Marketplace
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-300 mb-10 leading-relaxed">
                            Automate sales, engage customers, and grow your business on WhatsApp with zero effort.
                        </p>
                        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 justify-center">
                            <button onClick={onGetStarted} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-blue-500/20">
                                Get Started Free
                            </button>
                            <button onClick={onLogin} className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white rounded-full font-bold text-lg transition-all">
                                Client Login
                            </button>
                        </div>
                    </div>
                </div>
                <div className="py-24 px-4 bg-gray-800/50">
                    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                        <div className="p-8 rounded-2xl bg-gray-800 border border-gray-700">
                            <h3 className="text-2xl font-bold mb-4">🚀 AI Bot</h3>
                            <p className="text-gray-400">Instantly answer customer questions 24/7 on WhatsApp.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-gray-800 border border-gray-700">
                            <h3 className="text-2xl font-bold mb-4">📊 Analytics</h3>
                            <p className="text-gray-400">Track revenue and growth with visual data.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-gray-800 border border-gray-700">
                            <h3 className="text-2xl font-bold mb-4">📦 Management</h3>
                            <p className="text-gray-400">Manage products and images in one professional place.</p>
                        </div>
                    </div>
                </div>
            </div>
        );

        const WizardView = ({ tenant, onComplete, fetchWithAuth, showNotification, setLoading }) => {
            const [step, setStep] = useState(1);
            const [config, setConfig] = useState({
                businessName: tenant?.businessName || '',
                whatsappToken: '',
                whatsappNumber: ''
            });

            const handleSubmit = async () => {
                setLoading(true);
                try {
                    const updatedTenant = {
                        ...tenant,
                        businessName: config.businessName,
                        whatsappNumbers: [config.whatsappNumber],
                        integrations: {
                            ...tenant.integrations,
                            whatsappBusinessAPI: {
                                accessToken: config.whatsappToken,
                                verifyToken: 'ai-marketplace-verify-token'
                            }
                        },
                        status: 'active'
                    };

                    const response = await fetchWithAuth(API_BASE_URL + '/tenants/' + tenant.tenantId, {
                        method: 'PUT',
                        body: JSON.stringify(updatedTenant)
                    });

                    if (response.ok) {
                        onComplete();
                    } else {
                        showNotification('Failed to save settings', 'error');
                    }
                } catch (e) {
                    showNotification('Error connecting WhatsApp', 'error');
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="h-2 bg-gray-100">
                            <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: \`\${(step / 3) * 100}%\` }}></div>
                        </div>
                        <div className="p-8">
                            {step === 1 && (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <h2 className="text-2xl font-bold">Welcome!</h2>
                                        <p className="text-gray-500 mt-2">Let's set up your business profile.</p>
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="Business Name"
                                        value={config.businessName} 
                                        onChange={(e) => setConfig({...config, businessName: e.target.value})}
                                        className="w-full border rounded-lg px-4 py-3"
                                    />
                                    <button onClick={() => setStep(2)} disabled={!config.businessName} className="w-full py-4 bg-blue-600 text-white rounded-lg font-bold">Next Step</button>
                                </div>
                            )}
                            {step === 2 && (
                                <div className="space-y-6">
                                    <div className="text-center"><h2 className="text-2xl font-bold">Connect WhatsApp</h2></div>
                                    <input 
                                        type="password" 
                                        placeholder="Whapi.cloud Access Token"
                                        value={config.whatsappToken} 
                                        onChange={(e) => setConfig({...config, whatsappToken: e.target.value})}
                                        className="w-full border rounded-lg px-4 py-3"
                                    />
                                    <button onClick={() => setStep(3)} disabled={!config.whatsappToken} className="w-full py-4 bg-blue-600 text-white rounded-lg font-bold">Next Step</button>
                                </div>
                            )}
                            {step === 3 && (
                                <div className="space-y-6">
                                    <div className="text-center"><h2 className="text-2xl font-bold">Verify Number</h2></div>
                                    <input 
                                        type="text" 
                                        placeholder="Business WhatsApp Number (e.g. 57300...)"
                                        value={config.whatsappNumber} 
                                        onChange={(e) => setConfig({...config, whatsappNumber: e.target.value})}
                                        className="w-full border rounded-lg px-4 py-3"
                                    />
                                    <button onClick={handleSubmit} disabled={!config.whatsappNumber} className="w-full py-4 bg-green-600 text-white rounded-lg font-bold">Finish Setup</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        };

        function AdminDashboard() {
            const [user, setUser] = useState(null);
            const [view, setView] = useState('loading'); // landing, auth, onboarding, dashboard, loading
            const [authMode, setAuthMode] = useState('login');
            const [activeTab, setActiveTab] = useState('overview');
            const [tenants, setTenants] = useState([]);
            const [conversations, setConversations] = useState([]);
            const [products, setProducts] = useState([]);
            const [selectedTenant, setSelectedTenant] = useState(null);
            const [showProductModal, setShowProductModal] = useState(false);
            const [editingProduct, setEditingProduct] = useState(null);
            const [statusFilter, setStatusFilter] = useState('all');
            const [searchQuery, setSearchQuery] = useState('');
            const [loading, setLoading] = useState(false);
            const [notification, setNotification] = useState(null);

            useEffect(() => {
                checkAuth();
            }, []);

            const checkAuth = async () => {
                try {
                    const session = await AuthManager.getSession();
                    const payload = session.getIdToken().payload;
                    setUser(payload);
                    
                    // Fetch tenant to check onboarding status
                    const response = await fetchWithAuth(API_BASE_URL + '/tenants');
                    if (response.ok) {
                        const data = await response.json();
                        const tenant = data[0];
                        if (tenant.status === 'trial' && (!tenant.whatsappNumbers || tenant.whatsappNumbers.length === 0)) {
                            setView('onboarding');
                        } else {
                            setView('dashboard');
                        }
                        const formattedTenants = data.map(item => ({
                            id: item.tenantId,
                            name: item.businessName || 'Unnamed Business',
                            status: item.status || 'unknown',
                            raw: item // Keep raw data for profile/wizard
                        }));
                        setTenants(formattedTenants);
                        setSelectedTenant(formattedTenants[0]);
                    }
                } catch (e) {
                    setView('landing');
                }
            };

            const showNotification = (message, type = 'success') => {
                setNotification({ message, type });
                setTimeout(() => setNotification(null), 3000);
            };

            const fetchWithAuth = async (url, options = {}) => {
                try {
                    const session = await AuthManager.getSession();
                    const token = session.getIdToken().getJwtToken();
                    const headers = {
                        ...options.headers,
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json',
                    };
                    return fetch(url, { ...options, headers });
                } catch (e) {
                    AuthManager.logout();
                    throw e;
                }
            };

            const fetchTenants = async () => {
                try {
                    const response = await fetchWithAuth(API_BASE_URL + '/tenants');
                    if (response.ok) {
                        const data = await response.json();
                        const formattedTenants = data.map(item => ({
                            id: item.tenantId,
                            name: item.businessName || 'Unnamed Business',
                            status: item.status || 'unknown',
                            conversations: 0
                        }));
                        setTenants(formattedTenants);
                        if (formattedTenants.length > 0 && !selectedTenant) {
                            setSelectedTenant(formattedTenants[0]);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching tenants:', error);
                }
            };

            const fetchProducts = async (tenantId) => {
                setLoading(true);
                try {
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products?tenantId=' + tenantId);
                    if (response.ok) {
                        const data = await response.json();
                        setProducts(data);
                    } else {
                        setProducts([]);
                    }
                } catch (error) {
                    console.error('Error fetching products:', error);
                    setProducts([]);
                } finally {
                    setLoading(false);
                }
            };

            const createProduct = async (productData) => {
                setLoading(true);
                try {
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products', {
                        method: 'POST',
                        body: JSON.stringify({ ...productData, tenantId: selectedTenant.id })
                    });
                    if (response.ok) {
                        showNotification('Product created successfully', 'success');
                        fetchProducts(selectedTenant.id);
                        setShowProductModal(false);
                    } else {
                        showNotification('Failed to create product', 'error');
                    }
                } catch (error) {
                    showNotification('Error creating product', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const updateProduct = async (productId, productData) => {
                setLoading(true);
                try {
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products/' + productId, {
                        method: 'PUT',
                        body: JSON.stringify({ ...productData, tenantId: selectedTenant.id })
                    });
                    if (response.ok) {
                        showNotification('Product updated successfully', 'success');
                        fetchProducts(selectedTenant.id);
                        setShowProductModal(false);
                        setEditingProduct(null);
                    } else {
                        showNotification('Failed to update product', 'error');
                    }
                } catch (error) {
                    showNotification('Error updating product', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const deleteProduct = async (productId) => {
                if (!confirm('Are you sure you want to delete this product?')) return;
                setLoading(true);
                try {
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products/' + productId + '?tenantId=' + selectedTenant.id, {
                        method: 'DELETE'
                    });
                    if (response.ok || response.status === 204) {
                        showNotification('Product deleted successfully', 'success');
                        fetchProducts(selectedTenant.id);
                    } else {
                        showNotification('Failed to delete product', 'error');
                    }
                } catch (error) {
                    showNotification('Error deleting product', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const markAsSold = async (productId) => {
                if (!confirm('Mark this product as sold?')) return;
                setLoading(true);
                try {
                    const product = products.find(p => p.productId === productId);
                    const updates = {
                        ...product,
                        status: 'sold',
                        soldAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products/' + productId, {
                        method: 'PUT',
                        body: JSON.stringify(updates)
                    });
                    if (response.ok) {
                        showNotification('Product marked as sold', 'success');
                        fetchProducts(selectedTenant.id);
                    } else {
                        showNotification('Failed to mark as sold', 'error');
                    }
                } catch (error) {
                    showNotification('Error marking as sold', 'error');
                } finally {
                    setLoading(false);
                }
            };

            const reactivateProduct = async (productId) => {
                if (!confirm('Reactivate this product?')) return;
                setLoading(true);
                try {
                    const product = products.find(p => p.productId === productId);
                    const updates = {
                        ...product,
                        status: 'available',
                        soldAt: null,
                        updatedAt: new Date().toISOString()
                    };
                    const response = await fetchWithAuth(API_BASE_URL + '/api/products/' + productId, {
                        method: 'PUT',
                        body: JSON.stringify(updates)
                    });
                    if (response.ok) {
                        showNotification('Product reactivated', 'success');
                        fetchProducts(selectedTenant.id);
                    } else {
                        showNotification('Failed to reactivate product', 'error');
                    }
                } catch (error) {
                    showNotification('Error reactivating product', 'error');
                } finally {
                    setLoading(false);
                }
            };

            useEffect(() => {
                if (user) {
                    fetchTenants();
                    setConversations([
                        { id: '1', tenant: 'AI Tech Solutions', customer: '+1234567890', status: 'active', lastMessage: '2 minutes ago' },
                        { id: '2', tenant: 'Digital Marketing Pro', customer: '+1987654321', status: 'escalated', lastMessage: '5 minutes ago' },
                        { id: '3', tenant: 'E-commerce Solutions', customer: '+1122334455', status: 'resolved', lastMessage: '10 minutes ago' }
                    ]);
                }
            }, [user]);

            useEffect(() => {
                if (selectedTenant) {
                    fetchProducts(selectedTenant.id);
                }
            }, [selectedTenant]);

            const filteredProducts = products.filter(product => {
                const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
                const matchesSearch = !searchQuery ||
                    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()));
                return matchesStatus && matchesSearch;
            });

            const LoginView = () => (
                <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
                    <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
                        <div>
                            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
                            <p className="mt-2 text-center text-sm text-gray-600">
                                Or <button onClick={() => setAuthMode('signup')} className="font-medium text-blue-600 hover:text-blue-500">register your business</button>
                            </p>
                        </div>
                        <form className="mt-8 space-y-6" onSubmit={async (e) => {
                            e.preventDefault();
                            setLoading(true);
                            try {
                                await AuthManager.login(e.target.email.value, e.target.password.value);
                                showNotification('Logged in successfully', 'success');
                                checkAuth();
                            } catch (err) {
                                showNotification(err.message || 'Login failed', 'error');
                            } finally {
                                setLoading(false);
                            }
                        }}>
                            <div className="rounded-md shadow-sm -space-y-px">
                                <div><input name="email" type="email" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Email address" /></div>
                                <div><input name="password" type="password" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Password" /></div>
                            </div>
                            <div>
                                <button type="submit" disabled={loading} className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                                    {loading ? 'Signing in...' : 'Sign in'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );

            const SignupView = () => (
                <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
                    <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
                        <div>
                            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Register your business</h2>
                            <p className="mt-2 text-center text-sm text-gray-600">
                                Or <button onClick={() => setAuthMode('login')} className="font-medium text-blue-600 hover:text-blue-500">sign in to existing account</button>
                            </p>
                        </div>
                        <form className="mt-8 space-y-6" onSubmit={async (e) => {
                            e.preventDefault();
                            setLoading(true);
                            try {
                                await AuthManager.signup(e.target.email.value, e.target.password.value, e.target.business.value);
                                showNotification('Check your email for verification code', 'success');
                                setAuthMode('login');
                            } catch (err) {
                                showNotification(err.message || 'Signup failed', 'error');
                            } finally {
                                setLoading(false);
                            }
                        }}>
                            <div className="rounded-md shadow-sm -space-y-px">
                                <div><input name="business" type="text" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Business Name" /></div>
                                <div><input name="email" type="email" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Email address" /></div>
                                <div><input name="password" type="password" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Password" /></div>
                            </div>
                            <div>
                                <button type="submit" disabled={loading} className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                                    {loading ? 'Creating account...' : 'Create account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );

            const TabButton = ({ id, label, isActive, onClick }) => (
                <button
                    onClick={() => onClick(id)}
                    className={\`px-4 py-2 rounded-lg font-medium transition-colors \${isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}\`}
                >
                    {label}
                </button>
            );

            const ImageCarousel = ({ images, className = "w-full h-48" }) => {
                const [currentIndex, setCurrentIndex] = useState(0);
                if (!images || images.length === 0) return <div className={\`bg-gray-100 flex items-center justify-center \${className} rounded-lg\`}>&nbsp;</div>;
                
                return (
                    <div className={\`relative group \${className} overflow-hidden rounded-lg bg-gray-100\`}>
                        <img src={images[currentIndex]} className="w-full h-full object-cover transition-all duration-300" />
                        {images.length > 1 && (
                            <>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1); }} className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">←</button>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1); }} className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">→</button>
                                <div className="absolute bottom-2 left-0 right-0 flex justify-center space-x-1">
                                    {images.map((_, i) => <div key={i} className={\`w-1.5 h-1.5 rounded-full transition-all \${i === currentIndex ? 'bg-white scale-110' : 'bg-white/40'}\`} />)}
                                </div>
                            </>
                        )}
                    </div>
                );
            };

            const ProductModal = () => {
                const [formData, setFormData] = useState(editingProduct || {
                    name: '', price: '', condition: '', description: '', category: '', status: 'available', images: []
                });
                const [uploading, setUploading] = useState(false);

                useEffect(() => {
                    if (editingProduct) {
                        const images = editingProduct.images || (editingProduct.imageUrl ? [editingProduct.imageUrl] : []);
                        setFormData({ ...editingProduct, images });
                    }
                }, [editingProduct]);

                const handleFilesChange = async (e) => {
                    const files = Array.from(e.target.files);
                    if (files.length === 0) return;
                    
                    setUploading(true);
                    try {
                        const newImages = [...(formData.images || [])];
                        for (const file of files) {
                            const urlResponse = await fetch(API_BASE_URL + '/api/images/upload-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    tenantId: selectedTenant.id,
                                    productId: formData.productId || 'prod_' + Date.now(),
                                    fileName: file.name,
                                    fileType: file.type
                                })
                            });
                            const { uploadUrl, publicUrl } = await urlResponse.json();
                            await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                            newImages.push(publicUrl);
                        }
                        setFormData({ ...formData, images: newImages });
                    } catch (error) {
                        showNotification('Image upload failed', 'error');
                    } finally {
                        setUploading(false);
                    }
                };

                const removeImage = (index) => {
                    const newImages = [...formData.images];
                    newImages.splice(index, 1);
                    setFormData({ ...formData, images: newImages });
                };

                const handleSubmit = async (e) => {
                    e.preventDefault();
                    if (editingProduct) updateProduct(editingProduct.productId, formData);
                    else createProduct(formData);
                };

                if (!showProductModal) return null;

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center">
                                <h3 className="text-xl font-bold text-gray-900">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
                                <button onClick={() => { setShowProductModal(false); setEditingProduct(null); }} className="text-gray-400 hover:text-gray-600 font-bold text-2xl">&times;</button>
                            </div>
                            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name *</label>
                                            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. iPhone 15 Pro" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1">Price *</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                                <input type="number" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} className="w-full pl-8 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1">Condition *</label>
                                            <select required value={formData.condition} onChange={(e) => setFormData({ ...formData, condition: e.target.value })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                                <option value="">Select Condition</option>
                                                <option value="new">New</option>
                                                <option value="used">Used</option>
                                                <option value="refurbished">Refurbished</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Product Images</label>
                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                            {(formData.images || []).map((img, idx) => (
                                                <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border bg-gray-50">
                                                    <img src={img} className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs">&times;</button>
                                                </div>
                                            ))}
                                            {uploading && <div className="aspect-square border-2 border-dashed rounded-lg flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>}
                                            <label className="aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 border-gray-300">
                                                <span className="text-2xl text-gray-400">+</span>
                                                <span className="text-[10px] text-gray-400">Add Photo</span>
                                                <input type="file" multiple accept="image/*" onChange={handleFilesChange} className="hidden" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex space-x-4 pt-4 border-t">
                                    <button type="button" onClick={() => { setShowProductModal(false); setEditingProduct(null); }} className="flex-1 px-6 py-3 border rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button type="submit" disabled={loading || uploading} className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-50">
                                        {uploading ? 'Processing...' : 'Save Product'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            };

            const ProductsTab = () => {
                const [selectedIds, setSelectedIds] = useState(new Set());

                const toggleSelection = (id) => {
                    const newSelection = new Set(selectedIds);
                    if (newSelection.has(id)) newSelection.delete(id);
                    else newSelection.add(id);
                    setSelectedIds(newSelection);
                };

                const toggleAll = () => {
                    if (selectedIds.size === filteredProducts.length) setSelectedIds(new Set());
                    else setSelectedIds(new Set(filteredProducts.map(p => p.productId)));
                };

                const handleBulkAction = async (action) => {
                    if (!confirm(\`Are you sure you want to \${action} \${selectedIds.size} items?\`)) return;
                    setLoading(true);
                    try {
                        const updates = Array.from(selectedIds).map(id => {
                            if (action === 'delete') return fetchWithAuth(\`\${API_BASE_URL}/api/products/\${id}?tenantId=\${selectedTenant.id}\`, { method: 'DELETE' });
                            if (action === 'markSold') return fetchWithAuth(\`\${API_BASE_URL}/api/products/\${id}?tenantId=\${selectedTenant.id}\`, {
                                method: 'PUT',
                                body: JSON.stringify({ ...products.find(p => p.productId === id), status: 'sold' })
                            });
                        });
                        await Promise.all(updates);
                        showNotification(\`Bulk \${action} completed\`, 'success');
                        setSelectedIds(new Set());
                        fetchProducts();
                    } catch (e) {
                        showNotification('Bulk action failed', 'error');
                    } finally {
                        setLoading(false);
                    }
                };

                return (
                    <div className="space-y-4 relative">
                        <div className="bg-white rounded-lg shadow p-4 pb-20">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h2 className="text-lg font-medium">Products</h2>
                                    <p className="text-sm text-gray-500">Tenant: {selectedTenant?.name}</p>
                                </div>
                                <button onClick={() => { setEditingProduct(null); setShowProductModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-md">+ Add</button>
                            </div>
                            <div className="flex space-x-4 mb-4">
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-md">
                                    <option value="all">All</option>
                                    <option value="available">Available</option>
                                    <option value="sold">Sold</option>
                                </select>
                                <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="flex-1 px-3 py-2 border rounded-md" />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-6 py-3 text-left">
                                                <input type="checkbox" checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0} onChange={toggleAll} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y">
                                        {filteredProducts.map(product => (
                                            <tr key={product.productId} className={product.status === 'sold' ? 'bg-gray-50 opacity-60' : ''}>
                                                <td className="px-6 py-4">
                                                    <input type="checkbox" checked={selectedIds.has(product.productId)} onChange={() => toggleSelection(product.productId)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                                                </td>
                                                <td className="px-6 py-4 flex items-center space-x-3">
                                                    <div className="w-12 h-12 flex-shrink-0">
                                                        <ImageCarousel images={product.images || (product.imageUrl ? [product.imageUrl] : [])} className="w-12 h-12" />
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                                </td>
                                                <td className="px-6 py-4 text-sm">\${product.price?.toLocaleString()}</td>
                                                <td className="px-6 py-4">
                                                    <span className={\`px-2 py-1 text-xs font-semibold rounded-full \${product.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`}>
                                                        {product.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium space-x-2">
                                                    {product.status !== 'sold' && <button onClick={() => markAsSold(product.productId)} className="text-green-600">Sold</button>}
                                                    <button onClick={() => { setEditingProduct(product); setShowProductModal(true); }} className="text-blue-600">Edit</button>
                                                    <button onClick={() => deleteProduct(product.productId)} className="text-red-600">Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center space-x-6 z-50">
                                <span className="font-bold">{selectedIds.size} Selected</span>
                                <div className="h-4 w-px bg-gray-700"></div>
                                <button onClick={() => handleBulkAction('markSold')} className="hover:text-green-400 font-medium transition-colors">Mark Sold</button>
                                <button onClick={() => handleBulkAction('delete')} className="hover:text-red-400 font-medium transition-colors">Delete</button>
                                <div className="h-4 w-px bg-gray-700"></div>
                                <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                            </div>
                        )}
                    </div>
                );
            };

            const AnalyticsTab = () => {
                const totalRevenue = products.filter(p => p.status === 'sold').reduce((sum, p) => sum + (p.price || 0), 0);
                const conversionRate = products.length > 0 ? (products.filter(p => p.status === 'sold').length / products.length * 100).toFixed(1) : 0;
                const categories = [...new Set(products.map(p => p.category || 'Other'))];
                const revenueByCategory = categories.map(cat => ({
                    name: cat,
                    revenue: products.filter(p => p.category === cat && p.status === 'sold').reduce((sum, p) => sum + (p.price || 0), 0)
                })).sort((a,b) => b.revenue - a.revenue);
                const maxRevenue = Math.max(...revenueByCategory.map(r => r.revenue), 1);

                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                                <h3 className="text-sm font-medium text-gray-500">Total Revenue</h3>
                                <p className="text-2xl font-bold">\${totalRevenue.toLocaleString()}</p>
                            </div>
                            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                                <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
                                <p className="text-2xl font-bold">{conversionRate}%</p>
                            </div>
                            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                                <h3 className="text-sm font-medium text-gray-500">Active Chats</h3>
                                <p className="text-2xl font-bold">{conversations.filter(c => c.status === 'active').length}</p>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h2 className="text-lg font-medium mb-4">Revenue by Category</h2>
                            <div className="space-y-4">
                                {revenueByCategory.map(r => (
                                    <div key={r.name} className="space-y-1">
                                        <div className="flex justify-between text-sm"><span>{r.name}</span><span>\${r.revenue.toLocaleString()}</span></div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: \`\${(r.revenue / maxRevenue * 100)}%\` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            };

            const OverviewTab = () => (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-sm font-medium text-gray-500">Tenants</h3><p className="text-2xl font-bold">{tenants.length}</p></div>
                    <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-sm font-medium text-gray-500">Active Chats</h3><p className="text-2xl font-bold">{conversations.filter(c => c.status === 'active').length}</p></div>
                    <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-sm font-medium text-gray-500">Escalated</h3><p className="text-2xl font-bold text-orange-600">{conversations.filter(c => c.status === 'escalated').length}</p></div>
                    <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-sm font-medium text-gray-500">Resolved</h3><p className="text-2xl font-bold text-green-600">{conversations.filter(c => c.status === 'resolved').length}</p></div>
                </div>
            );

            const TenantsTab = () => (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y">
                            {tenants.map(tenant => (
                                <tr key={tenant.id}>
                                    <td className="px-6 py-4"><div className="text-sm font-medium">{tenant.name}</div><div className="text-xs text-gray-500">{tenant.id}</div></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">{tenant.status}</span></td>
                                    <td className="px-6 py-4 text-sm"><button onClick={() => { setSelectedTenant(tenant); setActiveTab('products'); }} className="text-blue-600">View Products</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

            const ConversationsTab = () => {
                const [filter, setFilter] = useState('all');
                
                const filteredChats = conversations.filter(c => filter === 'all' || c.status === filter);

                return (
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-medium">Conversations</h2>
                                <select 
                                    value={filter} 
                                    onChange={(e) => setFilter(e.target.value)} 
                                    className="px-3 py-2 border rounded-md text-sm"
                                >
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="escalated">Escalated</option>
                                    <option value="resolved">Resolved</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {filteredChats.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">No conversations found</div>
                                ) : (
                                    filteredChats.map(conv => (
                                        <div key={conv.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold">
                                                        {conv.customer.substring(1, 3)}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-medium text-gray-900">{conv.tenant}</h3>
                                                        <p className="text-xs text-gray-500">{conv.customer}</p>
                                                    </div>
                                                </div>
                                                <span className={\`px-2 py-1 text-xs font-semibold rounded-full \${conv.status === 'active' ? 'bg-green-100 text-green-800' : conv.status === 'escalated' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}\`}>
                                                    {conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-sm text-gray-600 pl-10">
                                                <p className="line-clamp-2">Latest interaction recorded...</p>
                                            </div>
                                            <div className="mt-3 pl-10 flex justify-between items-center text-xs text-gray-500">
                                                <span>Last seen: {conv.lastMessage}</span>
                                                {conv.status === 'escalated' && <button className="text-blue-600 font-medium hover:underline">Take Action</button>}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                );
            };

            if (view === 'loading') {
                return (
                    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                        <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">Initializing Marketplace</p>
                    </div>
                );
            }

            if (view === 'landing') {
                return (
                    <LandingPage 
                        onGetStarted={() => { setAuthMode('signup'); setView('auth'); }} 
                        onLogin={() => { setAuthMode('login'); setView('auth'); }} 
                    />
                );
            }

            if (view === 'auth') {
                return authMode === 'login' ? <LoginView /> : <SignupView />;
            }

            if (view === 'onboarding') {
                // Find the raw tenant object from state if possible
                const tenantEntry = tenants.find(t => t.id === (selectedTenant?.id || user?.['custom:tenantId']));
                return (
                    <WizardView 
                        tenant={tenantEntry?.raw || { tenantId: user?.['custom:tenantId'] }} 
                        onComplete={() => setView('dashboard')} 
                        fetchWithAuth={fetchWithAuth}
                        showNotification={showNotification}
                        setLoading={setLoading}
                    />
                );
            }

            return (
                <div className="min-h-screen bg-gray-100">
                    {notification && (
                        <div className={\`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 \${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white\`}>
                            {notification.message}
                        </div>
                    )}
                    {loading && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-3"></div>
                            <span className="font-medium text-gray-700">Processing...</span>
                        </div>
                    </div>}
                    <header className="bg-white shadow">
                        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                            <h1 className="text-2xl font-bold text-gray-900">AI Marketplace</h1>
                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <div className="text-sm font-medium">{user.email}</div>
                                    <div className="text-xs text-gray-500">Administrator</div>
                                </div>
                                <button onClick={() => AuthManager.logout()} className="px-3 py-1 bg-red-600 text-white text-xs rounded-full">Logout</button>
                            </div>
                        </div>
                    </header>
                    <main className="max-w-7xl mx-auto py-6 px-4">
                        <div className="flex space-x-4 mb-6">
                            <TabButton id="overview" label="Overview" isActive={activeTab === 'overview'} onClick={setActiveTab} />
                            <TabButton id="tenants" label="Profile" isActive={activeTab === 'tenants'} onClick={setActiveTab} />
                            <TabButton id="products" label="Products" isActive={activeTab === 'products'} onClick={setActiveTab} />
                            <TabButton id="conversations" label="Chats" isActive={activeTab === 'conversations'} onClick={setActiveTab} />
                            <TabButton id="analytics" label="Analytics" isActive={activeTab === 'analytics'} onClick={setActiveTab} />
                            <TabButton id="billing" label="Billing" isActive={activeTab === 'billing'} onClick={setActiveTab} />
                        </div>
                        <div>
                            {activeTab === 'overview' && <OverviewTab />}
                            {activeTab === 'tenants' && (
                                <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
                                    <h2 className="text-xl font-bold mb-4">Business Profile</h2>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Business Name</label>
                                            <input 
                                                type="text" 
                                                value={selectedTenant?.name || ''} 
                                                onChange={(e) => setSelectedTenant({...selectedTenant, name: e.target.value})}
                                                className="mt-1 block w-full border rounded-md px-3 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Tenant ID</label>
                                            <input type="text" readOnly value={selectedTenant?.id || ''} className="mt-1 block w-full bg-gray-50 border rounded-md px-3 py-2 text-gray-500" />
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                setLoading(true);
                                                try {
                                                    const updated = {
                                                        ...selectedTenant.raw,
                                                        businessName: selectedTenant.name,
                                                        status: 'active'
                                                    };
                                                    const response = await fetchWithAuth(API_BASE_URL + '/tenants/' + selectedTenant.id, {
                                                        method: 'PUT',
                                                        body: JSON.stringify(updated)
                                                    });
                                                    if (response.ok) {
                                                        showNotification('Profile updated successfully', 'success');
                                                    } else {
                                                        showNotification('Failed to update profile', 'error');
                                                    }
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'products' && <ProductsTab />}
                            {activeTab === 'conversations' && <ConversationsTab />}
                            {activeTab === 'analytics' && <AnalyticsTab />}
                            {activeTab === 'billing' && (
                                <div className="space-y-6">
                                    {/* Usage Card */}
                                    <div className="bg-white p-6 rounded-lg shadow">
                                        <h2 className="text-lg font-medium mb-4">Current Usage (This Month)</h2>
                                        {(() => {
                                            // Mock usage state logic (in real app, use `useEffect` to fetch from ` / api / billing / usage`)
                                            // Since we are inside a template string, we have to write the React logic inline or assume `useState` exists
                                            // For this MVP, let's assume we wire up the fetch on mount.
                                            
                                            // UI ONLY for now, data fetching would require adding `useEffect` inside a properly defined component.
                                            // To keep it simple in this "Single File Component" structure:
                                            return (
                                                <BillingStats 
                                                    tenantId={selectedTenant?.id} 
                                                    fetchWithAuth={fetchWithAuth} 
                                                />
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                    <ProductModal />
                </div>
            );
        }

        // --- New Billing Component ---
        const BillingStats = ({ tenantId, fetchWithAuth }) => {
            const [usage, setUsage] = useState(null);
            const [loading, setLoading] = useState(false);

            useEffect(() => {
                if (tenantId) loadUsage();
            }, [tenantId]);

            const loadUsage = async () => {
                try {
                    const res = await fetchWithAuth(API_BASE_URL + '/billing/usage?tenantId=' + tenantId);
                    if (res.ok) setUsage(await res.json());
                } catch (e) {
                    console.error("Failed to load usage", e);
                }
            };

            const handlePortal = async () => {
                setLoading(true);
                try {
                    const res = await fetchWithAuth(API_BASE_URL + '/billing/portal', {
                        method: 'POST',
                        body: JSON.stringify({ returnUrl: window.location.href }),
                        headers: { 'x-tenant-id': tenantId }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        window.location.href = data.url;
                    } else {
                        alert("Failed to redirect to billing portal");
                    }
                } finally {
                    setLoading(false);
                }
            };

            if (!usage) return <div className="animate-pulse h-20 bg-gray-100 rounded"></div>;

            const msgLimit = usage.limits?.messages || 1000;
            const msgUsed = usage.usage?.messages || 0;
            const percent = Math.min((msgUsed / msgLimit) * 100, 100);
            const color = percent > 90 ? 'bg-red-600' : percent > 75 ? 'bg-yellow-500' : 'bg-green-600';

            return (
                <div className="space-y-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-gray-500 uppercase tracking-wide">Current Plan</div>
                            <div className="text-3xl font-bold text-gray-900 capitalize">{usage.plan}</div>
                            <div className="text-sm text-green-600 flex items-center mt-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                                {usage.status}
                            </div>
                        </div>
                        <button 
                            onClick={handlePortal}
                            disabled={loading}
                            className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            {loading ? 'Redirecting...' : 'Manage Subscription'}
                        </button>
                    </div>

                    <div className="mt-6">
                        <div className="flex justify-between text-sm font-medium text-gray-900 mb-1">
                            <span>Messages Used</span>
                            <span>{msgUsed.toLocaleString()} / {msgLimit === -1 ? '∞' : msgLimit.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                            <div 
                                className={'h-4 rounded-full transition-all duration-500 ' + color} 
                                style={{ width: percent + '%' }}
                            ></div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Resets on {usage.period}-01
                        </p>
                    </div>

                    {/* Upgrade Call to Action */}
                    {usage.plan === 'basic' && (
                        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-blue-900">Upgrade to Pro</h3>
                                <p className="text-sm text-blue-700">Get 5,000 messages/mo + Priority Support.</p>
                            </div>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow font-medium">
                                Upgrade ($29/mo)
                            </button>
                        </div>
                    )}
                </div>
            );
        };

        ReactDOM.render(<AdminDashboard />, document.getElementById('root'));
    </script>
</body>
</html>`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache'
        },
        body: dashboardHtml
    };
};
