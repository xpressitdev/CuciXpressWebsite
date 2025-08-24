import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// import { ScrollArea } from '@/components/ui/scroll-area'; // Commented out - not in shadcn/ui by default
import { Car, MapPin, Calendar, Clock, Receipt, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

interface ServiceRecord {
  id: string;
  service_name: string;
  car_plate: string;
  branch: string;
  amount: number;
  service_date: string;
  payment_status: 'paid' | 'pending' | 'cancelled';
  transaction_id: string;
  duration_minutes?: number;
}

interface CustomerHistoryProps {
  className?: string;
}

export default function CustomerHistory({ className = '' }: CustomerHistoryProps) {
  const { user, isAuthenticated } = useAuth();
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  const { data: serviceHistory, isLoading, error } = useQuery({
    queryKey: ['/api/customer/history', user?.id],
    enabled: isAuthenticated && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  interface ServiceHistoryResponse {
    records: ServiceRecord[];
  }

  if (!isAuthenticated || !user) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center">
          <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Service History</h3>
          <p className="text-gray-600 mb-4">
            Create an account to track your car wash history and manage your bookings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Your Service History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !serviceHistory) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center">
          <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Service History</h3>
          <p className="text-gray-600">
            Your service history will appear here after your first car wash booking.
          </p>
        </CardContent>
      </Card>
    );
  }

  const records: ServiceRecord[] = (serviceHistory as ServiceHistoryResponse)?.records || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Brunei'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getBranchName = (branchId: string) => {
    const branches: { [key: string]: string } = {
      'tungku': 'Tungku Link',
      'salar': 'Salar',
      'bengkurong': 'Bengkurong',
      'tutong': 'Tutong'
    };
    return branches[branchId] || branchId;
  };

  const totalSpent = records.reduce((sum, record) => 
    record.payment_status === 'paid' ? sum + record.amount : sum, 0
  );
  const totalServices = records.filter(r => r.payment_status === 'paid').length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Your Service History
        </CardTitle>
        
        {/* Customer Stats */}
        <div className="flex gap-4 mt-4">
          <div className="bg-cuci-primary/10 rounded-lg p-3 flex-1">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-cuci-primary" />
              <span className="text-sm text-gray-600">Total Services</span>
            </div>
            <p className="text-xl font-bold text-cuci-primary mt-1">{totalServices}</p>
          </div>
          <div className="bg-green-100 rounded-lg p-3 flex-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-600">Total Spent</span>
            </div>
            <p className="text-xl font-bold text-green-600 mt-1">BND {totalSpent}</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {records.length === 0 ? (
          <div className="text-center py-8">
            <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No services yet. Book your first car wash to get started!</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto pr-4">
            <div className="space-y-3">
              {records.map((record, index) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="border border-gray-200 hover:border-cuci-primary/30 transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-gray-900">{record.service_name}</h4>
                            <Badge className={getStatusColor(record.payment_status)}>
                              {record.payment_status.charAt(0).toUpperCase() + record.payment_status.slice(1)}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Car className="w-4 h-4" />
                              <span>{record.car_plate}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{getBranchName(record.branch)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(record.service_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span className="font-semibold text-cuci-primary">BND {record.amount}</span>
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedRecord(
                            expandedRecord === record.id ? null : record.id
                          )}
                        >
                          {expandedRecord === record.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      
                      <AnimatePresence>
                        {expandedRecord === record.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 pt-4 border-t border-gray-200"
                          >
                            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                              <div>
                                <span className="font-medium">Transaction ID:</span>
                                <p className="font-mono text-xs">{record.transaction_id}</p>
                              </div>
                              {record.duration_minutes && (
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  <span>{record.duration_minutes} minutes</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="mt-3 flex gap-2">
                              <Button variant="outline" size="sm" className="text-xs">
                                Download Receipt
                              </Button>
                              <Button variant="outline" size="sm" className="text-xs">
                                Book Again
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}