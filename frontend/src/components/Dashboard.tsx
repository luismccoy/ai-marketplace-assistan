import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ChatBubbleLeftRightIcon,
  HandRaisedIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalConversations: number;
  activeEscalations: number;
  totalProducts: number;
  responseTime: string;
  escalationRate: number;
  customerSatisfaction: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalConversations: 0,
    activeEscalations: 0,
    totalProducts: 0,
    responseTime: '0s',
    escalationRate: 0,
    customerSatisfaction: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call to fetch dashboard stats
    const fetchStats = async () => {
      try {
        // TODO: Replace with actual API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setStats({
          totalConversations: 1247,
          activeEscalations: 8,
          totalProducts: 156,
          responseTime: '2.3s',
          escalationRate: 6.4,
          customerSatisfaction: 94.2,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      name: 'Total Conversations',
      value: stats.totalConversations.toLocaleString(),
      icon: ChatBubbleLeftRightIcon,
      color: 'bg-blue-500',
      change: '+12%',
      changeType: 'positive',
    },
    {
      name: 'Active Escalations',
      value: stats.activeEscalations.toString(),
      icon: HandRaisedIcon,
      color: 'bg-red-500',
      change: '-3%',
      changeType: 'positive',
    },
    {
      name: 'Total Products',
      value: stats.totalProducts.toString(),
      icon: CubeIcon,
      color: 'bg-green-500',
      change: '+8%',
      changeType: 'positive',
    },
    {
      name: 'Avg Response Time',
      value: stats.responseTime,
      icon: ClockIcon,
      color: 'bg-purple-500',
      change: '-15%',
      changeType: 'positive',
    },
  ];

  const recentEscalations = [
    {
      id: '1',
      customer: '+57 300 123 4567',
      reason: 'Price negotiation request',
      priority: 'high',
      time: '5 min ago',
      status: 'pending',
    },
    {
      id: '2',
      customer: '+57 301 987 6543',
      reason: 'Technical support needed',
      priority: 'medium',
      time: '12 min ago',
      status: 'assigned',
    },
    {
      id: '3',
      customer: '+57 302 456 7890',
      reason: 'Complaint about service',
      priority: 'urgent',
      time: '18 min ago',
      status: 'resolved',
    },
  ];

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
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome back, {user?.name}!
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Here's what's happening with your AI Marketplace Assistant today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {statCards.map((stat) => (
            <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`${stat.color} p-3 rounded-md`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {stat.name}
                      </dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {stat.value}
                        </div>
                        <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                          stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stat.change}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Escalation Rate</span>
                  <span className="font-medium">{stats.escalationRate}%</span>
                </div>
                <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${stats.escalationRate}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Customer Satisfaction</span>
                  <span className="font-medium">{stats.customerSatisfaction}%</span>
                </div>
                <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${stats.customerSatisfaction}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">WhatsApp Integration</span>
                <span className="ml-auto text-sm text-green-600 font-medium">Online</span>
              </div>
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">AI Processing</span>
                <span className="ml-auto text-sm text-green-600 font-medium">Active</span>
              </div>
              <div className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-3" />
                <span className="text-sm text-gray-700">Escalation Service</span>
                <span className="ml-auto text-sm text-yellow-600 font-medium">Monitoring</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Escalations */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Escalations</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {recentEscalations.map((escalation) => (
              <div key={escalation.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-3 ${
                      escalation.priority === 'urgent' ? 'bg-red-500' :
                      escalation.priority === 'high' ? 'bg-orange-500' :
                      'bg-yellow-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {escalation.customer}
                      </p>
                      <p className="text-sm text-gray-500">{escalation.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      escalation.status === 'resolved' ? 'bg-green-100 text-green-800' :
                      escalation.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {escalation.status}
                    </span>
                    <span className="text-sm text-gray-500">{escalation.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;