import React, { useState, useEffect } from 'react';
import {
  HandRaisedIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

interface EscalatedConversation {
  id: string;
  conversationId: string;
  tenantId: string;
  customerPhone: string;
  customerName?: string;
  escalationReason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  escalationTime: string;
  assignedAgent?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved';
  triggers: Array<{
    type: string;
    reason: string;
    confidence: number;
  }>;
  estimatedResolutionTime?: number;
  conversationSummary?: string;
}

const HandoffControl: React.FC = () => {
  const [escalations, setEscalations] = useState<EscalatedConversation[]>([]);
  const [selectedEscalation, setSelectedEscalation] = useState<EscalatedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchEscalations();
  }, []);

  const fetchEscalations = async () => {
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockEscalations: EscalatedConversation[] = [
        {
          id: '1',
          conversationId: 'conv-123',
          tenantId: 'tenant-1',
          customerPhone: '+57 300 123 4567',
          customerName: 'María García',
          escalationReason: 'Cliente solicita hablar con una persona: "humano"',
          priority: 'high',
          escalationTime: '2026-01-08T21:30:00Z',
          status: 'pending',
          triggers: [
            {
              type: 'manual_request',
              reason: 'Cliente solicita hablar con una persona: "humano"',
              confidence: 0.9,
            },
          ],
          estimatedResolutionTime: 15,
          conversationSummary: 'Cliente pregunta sobre productos de tecnología y solicita descuentos especiales.',
        },
        {
          id: '2',
          conversationId: 'conv-456',
          tenantId: 'tenant-1',
          customerPhone: '+57 303 111 2222',
          customerName: 'Ana López',
          escalationReason: 'Cliente solicita hablar con supervisor/gerente: "gerente"',
          priority: 'urgent',
          escalationTime: '2026-01-08T21:10:00Z',
          assignedAgent: 'Agent Smith',
          status: 'assigned',
          triggers: [
            {
              type: 'manual_request',
              reason: 'Cliente solicita hablar con supervisor/gerente: "gerente"',
              confidence: 0.95,
            },
            {
              type: 'complaint',
              reason: 'Posible queja detectada: "problema"',
              confidence: 0.8,
            },
          ],
          estimatedResolutionTime: 5,
          conversationSummary: 'Cliente reporta problema urgente con envío y solicita hablar con gerente.',
        },
        {
          id: '3',
          conversationId: 'conv-789',
          tenantId: 'tenant-1',
          customerPhone: '+57 301 987 6543',
          customerName: 'Carlos Rodríguez',
          escalationReason: 'Intento de negociación de precio detectado: "descuento"',
          priority: 'medium',
          escalationTime: '2026-01-08T20:45:00Z',
          assignedAgent: 'Agent Johnson',
          status: 'in_progress',
          triggers: [
            {
              type: 'price_negotiation',
              reason: 'Intento de negociación de precio detectado: "descuento"',
              confidence: 0.75,
            },
          ],
          estimatedResolutionTime: 20,
          conversationSummary: 'Cliente interesado en productos pero busca mejores precios y descuentos.',
        },
      ];
      
      setEscalations(mockEscalations);
    } catch (error) {
      console.error('Failed to fetch escalations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeConversation = async (escalationId: string) => {
    setActionLoading(escalationId);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setEscalations(prev => prev.map(esc => 
        esc.id === escalationId 
          ? { ...esc, status: 'assigned', assignedAgent: 'Current User' }
          : esc
      ));
    } catch (error) {
      console.error('Failed to take conversation:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveEscalation = async (escalationId: string) => {
    setActionLoading(escalationId);
    try {
      // TODO: Replace with actual API call to reset conversation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setEscalations(prev => prev.filter(esc => esc.id !== escalationId));
      if (selectedEscalation?.id === escalationId) {
        setSelectedEscalation(null);
      }
    } catch (error) {
      console.error('Failed to resolve escalation:', error);
    } finally {
      setActionLoading(null);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
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
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Human Handoff Control</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage escalated conversations and assign them to human agents.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <HandRaisedIcon className="h-8 w-8 text-red-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Escalations</dt>
                    <dd className="text-2xl font-semibold text-gray-900">{escalations.length}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-8 w-8 text-orange-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {escalations.filter(e => e.status === 'pending').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserIcon className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Assigned</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {escalations.filter(e => e.status === 'assigned' || e.status === 'in_progress').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-8 w-8 text-purple-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Avg Resolution</dt>
                    <dd className="text-2xl font-semibold text-gray-900">12m</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Escalations List */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Active Escalations
            </h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {escalations.map((escalation) => (
              <li key={escalation.id}>
                <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-4 h-4 rounded-full ${getPriorityColor(escalation.priority)}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900">
                            {escalation.customerName || escalation.customerPhone}
                          </p>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(escalation.status)}`}>
                            {escalation.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{escalation.customerPhone}</p>
                        <p className="text-sm text-gray-700 mt-1">{escalation.escalationReason}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center">
                            <ClockIcon className="h-3 w-3 mr-1" />
                            {formatTime(escalation.escalationTime)}
                          </span>
                          {escalation.estimatedResolutionTime && (
                            <span>Est. {escalation.estimatedResolutionTime}m</span>
                          )}
                          {escalation.assignedAgent && (
                            <span className="flex items-center">
                              <UserIcon className="h-3 w-3 mr-1" />
                              {escalation.assignedAgent}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedEscalation(escalation)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        View Details
                      </button>
                      {escalation.status === 'pending' && (
                        <button
                          onClick={() => handleTakeConversation(escalation.id)}
                          disabled={actionLoading === escalation.id}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionLoading === escalation.id ? 'Taking...' : 'Take'}
                        </button>
                      )}
                      {(escalation.status === 'assigned' || escalation.status === 'in_progress') && (
                        <button
                          onClick={() => handleResolveEscalation(escalation.id)}
                          disabled={actionLoading === escalation.id}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === escalation.id ? 'Resolving...' : 'Resolve'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          
          {escalations.length === 0 && (
            <div className="text-center py-12">
              <HandRaisedIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No escalations</h3>
              <p className="mt-1 text-sm text-gray-500">
                All conversations are being handled by the AI assistant.
              </p>
            </div>
          )}
        </div>

        {/* Escalation Detail Modal */}
        {selectedEscalation && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Escalation Details</h3>
                  <button
                    onClick={() => setSelectedEscalation(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Customer Information</h4>
                    <p className="text-sm text-gray-600">
                      {selectedEscalation.customerName || selectedEscalation.customerPhone}
                    </p>
                    <p className="text-sm text-gray-500">{selectedEscalation.customerPhone}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Escalation Triggers</h4>
                    <div className="mt-2 space-y-2">
                      {selectedEscalation.triggers.map((trigger, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-md">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{trigger.type}</p>
                              <p className="text-sm text-gray-600">{trigger.reason}</p>
                            </div>
                            <span className="text-xs text-gray-500">
                              {(trigger.confidence * 100).toFixed(1)}% confidence
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {selectedEscalation.conversationSummary && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Conversation Summary</h4>
                      <p className="text-sm text-gray-600 mt-1">{selectedEscalation.conversationSummary}</p>
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setSelectedEscalation(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Open conversation in new tab/window
                        window.open(`/conversations?id=${selectedEscalation.conversationId}`, '_blank');
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      <ChatBubbleLeftRightIcon className="h-4 w-4 inline mr-1" />
                      Open Conversation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HandoffControl;