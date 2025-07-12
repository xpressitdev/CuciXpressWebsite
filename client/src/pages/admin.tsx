import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Eye, Mail, Phone, Building, MessageSquare, Calendar } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import type { CollaborationSubmission } from "@shared/schema";

interface CollaborationsResponse {
  submissions: CollaborationSubmission[];
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<CollaborationSubmission | null>(null);

  const { data, isLoading, error } = useQuery<CollaborationsResponse>({
    queryKey: ['/api/admin/collaborations'],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/admin/collaborations/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collaborations'] });
    },
  });

  const handleMarkAsRead = async (id: number) => {
    try {
      await markAsReadMutation.mutateAsync(id);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const businessTypeLabels: { [key: string]: string } = {
    retail: 'Retail Business',
    food: 'Food & Beverage',
    automotive: 'Automotive Services',
    tech: 'Technology',
    service: 'Service Provider',
    other: 'Other',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cuci-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Loading submissions...</p>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-20 pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-12">
              <p className="text-red-600">Error loading submissions. Please try again.</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const submissions = data?.submissions || [];
  const unreadCount = submissions.filter(s => !s.isRead).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Link href="/">
              <button className="inline-flex items-center text-cuci-primary hover:text-cuci-primary-dark transition-colors mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </button>
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Collaboration Submissions</h1>
                <p className="text-gray-600 mt-2">
                  {submissions.length} total submissions
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {unreadCount} unread
                    </Badge>
                  )}
                </p>
              </div>
            </div>
          </div>

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
                          <div className="flex items-center text-gray-600">
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
        </div>
      </main>
      <Footer />
    </div>
  );
}