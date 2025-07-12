import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import AdminLogin from "@/components/AdminLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Eye, Mail, Phone, Building, MessageSquare, Calendar, LogOut, Users } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { CollaborationSubmission, SubscriptionSignup } from "@shared/schema";

interface CollaborationsResponse {
  submissions: CollaborationSubmission[];
}

interface SubscriptionsResponse {
  signups: SubscriptionSignup[];
}

export default function Admin() {
  const { isAuthenticated, isLoading: authLoading, login, logout } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<CollaborationSubmission | null>(null);

  const { data: collaborationsData, isLoading: collaborationsLoading, error: collaborationsError } = useQuery<CollaborationsResponse>({
    queryKey: ['/api/admin/collaborations'],
    enabled: isAuthenticated, // Only run query when authenticated
  });

  const { data: subscriptionsData, isLoading: subscriptionsLoading, error: subscriptionsError } = useQuery<SubscriptionsResponse>({
    queryKey: ['/api/admin/subscriptions'],
    enabled: isAuthenticated, // Only run query when authenticated
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/admin/collaborations/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collaborations'] });
    },
  });

  const handleLogin = (password: string) => {
    return login(password);
  };

  const handleMarkAsRead = (id: number) => {
    markAsReadMutation.mutate(id);
    // Also update selected submission state
    if (selectedSubmission?.id === id) {
      setSelectedSubmission({ ...selectedSubmission, isRead: true });
    }
  };

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

  const businessTypeLabels: { [key: string]: string } = {
    retailShop: 'Retail Shop',
    restaurant: 'Restaurant/Cafe',
    service: 'Service Provider',
    other: 'Other',
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cuci-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Loading...</p>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
            <AdminLogin onLogin={handleLogin} />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (collaborationsLoading || subscriptionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cuci-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (collaborationsError || subscriptionsError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-12">
              <p className="text-red-600">Error loading dashboard. Please try again.</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const submissions = collaborationsData?.submissions || [];
  const signups = subscriptionsData?.signups || [];
  const unreadCount = submissions.filter(s => !s.isRead).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="space-y-4">
            <Link href="/" className="inline-block">
              <button className="flex items-center text-gray-600 hover:text-cuci-primary transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </button>
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-600 mt-2">
                  Manage collaboration requests and subscription signups
                </p>
              </div>
              <Button
                variant="outline"
                onClick={logout}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>

          <Tabs defaultValue="collaborations" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="collaborations" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Collaborations
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Subscriptions ({signups.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="collaborations" className="mt-6">
              {submissions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No submissions yet</h3>
                    <p className="text-gray-600">Collaboration form submissions will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Submissions List */}
                  <div className="lg:col-span-2 space-y-4">
                    {submissions.map((submission, index) => (
                      <motion.div
                        key={submission.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Card 
                          className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                            selectedSubmission?.id === submission.id 
                              ? 'ring-2 ring-cuci-primary border-cuci-primary' 
                              : 'hover:border-gray-300'
                          } ${
                            !submission.isRead ? 'bg-blue-50 border-blue-200' : ''
                          }`}
                          onClick={() => setSelectedSubmission(submission)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="font-semibold text-gray-900">{submission.name}</h3>
                                  {!submission.isRead && (
                                    <Badge variant="destructive" className="text-xs">New</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mb-2">{submission.email}</p>
                                {submission.businessType && (
                                  <p className="text-sm text-gray-500 mb-2">
                                    {businessTypeLabels[submission.businessType] || submission.businessType}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 flex items-center">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {formatDate(submission.createdAt)}
                                </p>
                              </div>
                              {!submission.isRead && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkAsRead(submission.id);
                                  }}
                                  disabled={markAsReadMutation.isPending}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Mark Read
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>

                  {/* Submission Details */}
                  <div className="lg:col-span-1">
                    {selectedSubmission ? (
                      <Card className="sticky top-6">
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            Submission Details
                            {!selectedSubmission.isRead && (
                              <Badge variant="destructive">Unread</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">{selectedSubmission.name}</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center text-gray-600">
                                <Mail className="w-4 h-4 mr-2" />
                                <a 
                                  href={`mailto:${selectedSubmission.email}`}
                                  className="text-cuci-primary hover:underline"
                                >
                                  {selectedSubmission.email}
                                </a>
                              </div>
                              {selectedSubmission.phone && (
                                <div className="flex items-center text-gray-600">
                                  <Phone className="w-4 h-4 mr-2" />
                                  <a 
                                    href={`tel:${selectedSubmission.phone}`}
                                    className="text-cuci-primary hover:underline"
                                  >
                                    {selectedSubmission.phone}
                                  </a>
                                </div>
                              )}
                              {selectedSubmission.businessType && (
                                <div className="flex items-center text-gray-600">
                                  <Building className="w-4 h-4 mr-2" />
                                  {businessTypeLabels[selectedSubmission.businessType] || selectedSubmission.businessType}
                                </div>
                              )}
                              <div className="flex items-center text-gray-500">
                                <Calendar className="w-4 h-4 mr-2" />
                                {formatDate(selectedSubmission.createdAt)}
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div>
                            <h5 className="font-semibold text-gray-900 mb-2">Collaboration Ideas:</h5>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {selectedSubmission.message || 'No message provided.'}
                            </p>
                          </div>

                          {!selectedSubmission.isRead && (
                            <Button
                              onClick={() => handleMarkAsRead(selectedSubmission.id)}
                              disabled={markAsReadMutation.isPending}
                              className="w-full"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Mark as Read
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="sticky top-6">
                        <CardContent className="py-12 text-center">
                          <MessageSquare className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Select a submission to view details</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="subscriptions" className="mt-6">
              {signups.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No subscription signups yet</h3>
                    <p className="text-gray-600">Email signups for subscription notifications will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {signups.map((signup, index) => (
                    <motion.div
                      key={signup.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="hover:shadow-md transition-all duration-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-cuci-primary/10 rounded-full flex items-center justify-center">
                                <Mail className="w-5 h-5 text-cuci-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  <a 
                                    href={`mailto:${signup.email}`}
                                    className="text-cuci-primary hover:text-cuci-primary-dark"
                                  >
                                    {signup.email}
                                  </a>
                                </p>
                                <p className="text-sm text-gray-500 flex items-center">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {formatDate(signup.createdAt)}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-cuci-primary border-cuci-primary">
                              Awaiting Launch
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}