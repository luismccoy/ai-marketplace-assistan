import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface Conversation {
  id: string;
  customerPhone: string;
  customerName?: string;
  lastMessage: string;
  timestamp: string;
  status: 'active' | 'escalated' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  unreadCount: number;
  tenantId: string;
  assignedAgent?: string;
}

const ConversationInbox: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call to fetch conversations
    const fetchConversations = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockConversations: Conversation[] = [
          {
            id: '1',
            customerPhone: '+57 300 123 4567',
            customerName: 'María García',
            lastMessage: 'Necesito ayuda con mi pedido, por favor contacten a un asesor',
            timestamp: '2026-01-08T21:30:00Z',
            status: 'escalated',
            priority: 'high',
            unreadCount: 2,
            tenantId: 'tenant-1',
            assignedAgent: 'Agent Smith',
          },
          {
            id: '2',
            customerPhone: '+57 301 987 6543',
            customerName: 'Carlos Rodríguez',
            lastMessage: '¿Tienen descuentos en productos de tecnología?',
            timestamp: '2026-01-08T21:25:00Z',
            status: 'active',
            priority: 'medium',
            unreadCount: 1,
            tenantId: 'tenant-1',
          },
          {
            id: '3',
            customerPhone: '+57 302 456 7890',
            lastMessage: 'Gracias por la ayuda, todo resuelto',
            timestamp: '2026-01-08T21:15:00Z',
            status: 'resolved',
            priority: 'low',
            unreadCount: 0,
            tenantId: 'tenant-1',
          },
          {
            id: '4',
            customerPhone: '+57 303 111 2222',
            customerName: 'Ana López',
            lastMessage: 'URGENTE: Problema con el envío, necesito hablar con el gerente',
            timestamp: '2026-01-08T21:10:00Z',
            status: 'escalated',
            priority: 'urgent',
            unreadCount: 5,
            tenantId: 'tenant-1',
          },
        ];
        
        setConversations(mockConversations);
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.customerPhone.includes(searchTerm) || 
                         conv.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || conv.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'escalated': return 'bg-red-100 text-red-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
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
    <div className="h-full flex">
      {/* Conversation List */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
          
          {/* Search */}
          <div className="mt-4 relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Filter */}
          <div className="mt-3 flex items-center space-x-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => setSelectedConversation(conversation)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${getPriorityColor(conversation.priority)}`}></div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {conversation.customerName || conversation.customerPhone}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-1">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{conversation.customerPhone}</p>
                  <p className="text-sm text-gray-600 mt-1 truncate">{conversation.lastMessage}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(conversation.status)}`}>
                      {conversation.status}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center">
                      <ClockIcon className="h-3 w-3 mr-1" />
                      {formatTime(conversation.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversation Detail */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <UserIcon className="h-8 w-8 text-gray-400" />
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {selectedConversation.customerName || selectedConversation.customerPhone}
                    </h3>
                    <p className="text-sm text-gray-500">{selectedConversation.customerPhone}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedConversation.status)}`}>
                    {selectedConversation.status}
                  </span>
                  <div className={`w-3 h-3 rounded-full ${getPriorityColor(selectedConversation.priority)}`}></div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
              <div className="space-y-4">
                {/* Sample messages */}
                <div className="flex justify-end">
                  <div className="bg-blue-500 text-white rounded-lg px-4 py-2 max-w-xs">
                    <p className="text-sm">¡Hola! ¿En qué te puedo ayudar hoy?</p>
                    <p className="text-xs opacity-75 mt-1">Bot • 10:30 AM</p>
                  </div>
                </div>
                
                <div className="flex justify-start">
                  <div className="bg-white rounded-lg px-4 py-2 max-w-xs shadow">
                    <p className="text-sm">{selectedConversation.lastMessage}</p>
                    <p className="text-xs text-gray-500 mt-1">Customer • {formatTime(selectedConversation.timestamp)}</p>
                  </div>
                </div>

                {selectedConversation.status === 'escalated' && (
                  <div className="flex justify-center">
                    <div className="bg-yellow-100 border border-yellow-300 rounded-lg px-4 py-2">
                      <p className="text-sm text-yellow-800">
                        🚨 Conversation escalated to human agent
                        {selectedConversation.assignedAgent && ` (${selectedConversation.assignedAgent})`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:ring-2 focus:ring-blue-500">
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">Select a conversation</p>
              <p className="text-gray-500">Choose a conversation from the list to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationInbox;