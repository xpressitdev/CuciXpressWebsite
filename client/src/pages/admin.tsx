import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import AdminLogin from "@/components/AdminLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Eye,
  Mail,
  Phone,
  Building,
  MessageSquare,
  Calendar,
  LogOut,
  Users,
  ShieldCheck,
  BarChart3,
  ClipboardList,
  RefreshCw,
  Search,
  Download,
  CreditCard,
  TrendingUp,
  Package as PackageIcon,
  Plus,
  Pencil,
  Trash2,
  X,
  Clock,
  AlertTriangle,
  LineChart as LineChartIcon,
  Printer,
  Building2,
  UserCircle2,
  MapPinned,
  Percent,
  Tag,
  Wallet,
  Stamp,
  Car,
  FlaskConical,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { normalizeWaPhone } from "@/lib/receipt";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import type { CollaborationSubmission, SubscriptionSignup } from "@shared/schema";
import CustomersTab, { LiabilitiesPanel } from "@/components/admin/CustomersTab";
import { PendingPaymentsPanel } from "@/components/admin/PendingPaymentsPanel";
import BranchesTab from "@/components/admin/BranchesTab";
import DiscountsTab from "@/components/admin/DiscountsTab";
import PromoCodesTab from "@/components/admin/PromoCodesTab";
import PaymentSetupTab from "@/components/admin/PaymentSetupTab";
import StaffTab from "@/components/admin/StaffTab";
import LoyaltyStampTab from "@/components/admin/LoyaltyStampTab";
import SubscriptionTestTab from "@/components/admin/SubscriptionTestTab";
import CategoriesSection from "@/components/admin/CategoriesSection";
import { SendReceiptButton } from "@/components/admin/SendReceiptButton";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CollaborationsResponse {
  submissions: CollaborationSubmission[];
}

interface SubscriptionsResponse {
  signups: SubscriptionSignup[];
}

interface SubscriptionRevenueRow {
  id: string;
  customer_name: string | null;
  plate: string | null;
  car_brand: string | null;
  car_model: string | null;
  plan_label: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  price_cents: number;
  mdr_fee_cents: number;
  net_cents: number;
  daily_cents: number;
  day_index: number;
  days_remaining: number;
  recognized_cents: number;
  deferred_cents: number;
  earned_today_cents: number;
}

interface SubscriptionRevenueResponse {
  as_of: string;
  mdr_bps: number;
  recognition_days: number;
  totals: {
    total_count: number;
    active_count: number;
    gross_cents: number;
    mdr_fee_cents: number;
    net_cents: number;
    recognized_cents: number;
    deferred_cents: number;
    earned_today_cents: number;
  };
  by_plan: Array<{
    label: string;
    count: number;
    gross_cents: number;
    net_cents: number;
    recognized_cents: number;
    deferred_cents: number;
    earned_today_cents: number;
  }>;
  subscriptions: SubscriptionRevenueRow[];
}

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const todayBNT = () => {
  // Asia/Brunei is UTC+8 with no DST. Compute the date in that
  // zone without dragging in date-fns-tz.
  const ms = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
};

export default function Admin() {
  const { staff, isAuthenticated, isLoading: authLoading, login, logout } = useStaffAuth();
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<CollaborationSubmission | null>(null);

  // Collaborations + subscriptions are owner/manager-only endpoints. Gating
  // the queries (not just the tabs) avoids background 403s for cashier/lane/
  // investor sessions, who never see these tabs.
  const canSeeManagerData = isAuthenticated && (staff?.role === 'owner' || staff?.role === 'manager');

  const { data: collaborationsData, error: collaborationsError } = useQuery<CollaborationsResponse>({
    queryKey: ['/api/admin/collaborations'],
    enabled: canSeeManagerData,
  });

  const { data: subscriptionsData, error: subscriptionsError } = useQuery<SubscriptionsResponse>({
    queryKey: ['/api/admin/subscriptions'],
    enabled: canSeeManagerData,
  });

  const { data: subRevenue, isLoading: subRevenueLoading } = useQuery<SubscriptionRevenueResponse>({
    queryKey: ['/api/admin/subscriptions/revenue'],
    enabled: canSeeManagerData,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/admin/collaborations/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collaborations'] });
    },
  });

  const handleLogin = (email: string, password: string) => {
    return login(email, password);
  };

  const handleMarkAsRead = (id: number) => {
    markAsReadMutation.mutate(id);
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
      <div className="cuci-page-bg">
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
      <div className="cuci-page-bg">
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

  if (collaborationsError || subscriptionsError) {
    // Tabs that don't depend on these queries should still work; we
    // show a non-blocking inline error inside their own panels below.
  }

  const submissions = collaborationsData?.submissions || [];
  const signups = subscriptionsData?.signups || [];
  const unreadCount = submissions.filter(s => !s.isRead).length;

  return (
    <div className="cuci-page-bg">
      <Navigation />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="space-y-4">
            {/* Phase 12c-ui follow-up: cashiers reach /admin from /pos
                via the Reports button. The back link should return them
                to POS, not the public landing page (use the navbar's
                Home link for that). */}
            <Link href="/pos" className="inline-block">
              <button
                className="flex items-center text-gray-600 hover:text-cuci-primary transition-colors"
                data-testid="button-back-to-pos"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to POS
              </button>
            </Link>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="cuci-eyebrow mb-2">Cuci Xpress · Staff console</div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
                  Admin <span className="text-cuci-primary">dashboard</span>
                </h1>
                <p className="text-gray-600 mt-2 text-base">
                  Sales overview, order reports, and signup management.
                </p>
                {staff && (
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-800 bg-white border-2 border-black rounded-full px-3 py-1.5">
                    <ShieldCheck className="w-4 h-4 text-cuci-primary" />
                    <span data-testid="text-staff-name">{staff.name}</span>
                    <span className="text-gray-400">·</span>
                    <span className="capitalize" data-testid="text-staff-role">{staff.role}</span>
                  </div>
                )}
              </div>
              <button
                onClick={logout}
                className="cuci-cta bg-white text-gray-900 px-5 py-2.5 rounded-full inline-flex items-center gap-2 text-sm"
                data-testid="button-staff-logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Tab visibility by role:
              - cashier:  Dashboard, Order Report, Payment Methods, Best Selling
              - manager:  cashier set + Collaborations + Subscriptions
              - owner:    everything (adds Catalog)
              Endpoints are also gated server-side, this is just UX. */}
          {(() => {
            const role = staff?.role;
            const isOwner = role === "owner";
            const isManagerOrOwner = role === "owner" || role === "manager";
            // Investor: read-only insights (Dashboard, Order Report, Payment
            // Methods, Best Selling, Trends) across all branches. No edit tabs.
            const isInvestor = role === "investor";
            const canSeeTrends = isManagerOrOwner || isInvestor;
            return (
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList
              className="flex flex-wrap w-full justify-start gap-1 bg-white border-2 border-black rounded-xl p-1 h-auto"
              style={{
                boxShadow: "3px 3px 0px 0px rgba(0,0,0,0.9)",
              }}
            >
              <TabsTrigger value="dashboard" className="flex items-center gap-2" data-testid="tab-dashboard">
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              {canSeeTrends && (
                <TabsTrigger value="trends" className="flex items-center gap-2" data-testid="tab-trends">
                  <LineChartIcon className="w-4 h-4" />
                  Trends
                </TabsTrigger>
              )}
              <TabsTrigger value="orders" className="flex items-center gap-2" data-testid="tab-orders-report">
                <ClipboardList className="w-4 h-4" />
                Order Report
              </TabsTrigger>
              <TabsTrigger value="payments" className="flex items-center gap-2" data-testid="tab-payments-report">
                <CreditCard className="w-4 h-4" />
                Payment Methods
              </TabsTrigger>
              <TabsTrigger value="best-selling" className="flex items-center gap-2" data-testid="tab-best-selling-report">
                <TrendingUp className="w-4 h-4" />
                Best Selling
              </TabsTrigger>
              {isManagerOrOwner && (
                <TabsTrigger value="customers" className="flex items-center gap-2" data-testid="tab-customers">
                  <UserCircle2 className="w-4 h-4" />
                  Customers
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="branches" className="flex items-center gap-2" data-testid="tab-branches">
                  <MapPinned className="w-4 h-4" />
                  Branches
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="catalog" className="flex items-center gap-2" data-testid="tab-catalog">
                  <PackageIcon className="w-4 h-4" />
                  Catalog
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="discounts" className="flex items-center gap-2" data-testid="tab-discounts">
                  <Percent className="w-4 h-4" />
                  Discounts
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="promo-codes" className="flex items-center gap-2" data-testid="tab-promo-codes">
                  <Tag className="w-4 h-4" />
                  Promo Codes
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="payment-setup" className="flex items-center gap-2" data-testid="tab-payment-setup">
                  <Wallet className="w-4 h-4" />
                  Payment Setup
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="staff" className="flex items-center gap-2" data-testid="tab-staff">
                  <ShieldCheck className="w-4 h-4" />
                  Staff
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="loyalty" className="flex items-center gap-2" data-testid="tab-loyalty">
                  <Stamp className="w-4 h-4" />
                  Loyalty
                </TabsTrigger>
              )}
              {isOwner && (
                <TabsTrigger value="subscription-test" className="flex items-center gap-2" data-testid="tab-subscription-test">
                  <FlaskConical className="w-4 h-4" />
                  Subscription Test
                </TabsTrigger>
              )}
              {isManagerOrOwner && (
                <TabsTrigger value="shifts" className="flex items-center gap-2" data-testid="tab-shifts">
                  <Clock className="w-4 h-4" />
                  Shifts
                </TabsTrigger>
              )}
              {isManagerOrOwner && (
                <TabsTrigger value="collaborations" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Collaborations
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-1 text-xs">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {isManagerOrOwner && (
                <TabsTrigger value="subscriptions" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Subscriptions ({signups.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="dashboard" className="mt-6 space-y-6">
              {isManagerOrOwner && <PendingPaymentsPanel />}
              <DashboardTab />
            </TabsContent>

            {canSeeTrends && (
              <TabsContent value="trends" className="mt-6">
                <TrendsTab />
              </TabsContent>
            )}

            <TabsContent value="orders" className="mt-6">
              <OrdersReportTab />
            </TabsContent>

            <TabsContent value="payments" className="mt-6">
              <PaymentMethodsTab />
            </TabsContent>

            <TabsContent value="best-selling" className="mt-6">
              <BestSellingTab />
            </TabsContent>

            {isManagerOrOwner && (
              <TabsContent value="customers" className="mt-6">
                <CustomersTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="branches" className="mt-6">
                <BranchesTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="catalog" className="mt-6">
                <CatalogTab isOwner={true} />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="discounts" className="mt-6">
                <DiscountsTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="promo-codes" className="mt-6">
                <PromoCodesTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="payment-setup" className="mt-6">
                <PaymentSetupTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="staff" className="mt-6">
                <StaffTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="loyalty" className="mt-6">
                <LoyaltyStampTab />
              </TabsContent>
            )}

            {isOwner && (
              <TabsContent value="subscription-test" className="mt-6">
                <SubscriptionTestTab />
              </TabsContent>
            )}

            {isManagerOrOwner && (
            <TabsContent value="shifts" className="mt-6">
              <ShiftsTab />
            </TabsContent>
            )}

            {isManagerOrOwner && (
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
                                  {formatDate(submission.createdAt.toString())}
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
                                {formatDate(selectedSubmission.createdAt.toString())}
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
            )}

            {isManagerOrOwner && (
            <TabsContent value="subscriptions" className="mt-6">
              <div className="space-y-10">
              <LiabilitiesPanel />
              {/* ---- Subscription revenue (recognized daily over 30 days) ---- */}
              <div>
                <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
                  <h2 className="text-xl font-bold text-gray-900">Subscription revenue</h2>
                  {subRevenue && (
                    <span className="text-sm text-gray-500">
                      Counted daily over {subRevenue.recognition_days} days · after{" "}
                      {(subRevenue.mdr_bps / 100).toFixed(2)}% online fee
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4 max-w-3xl">
                  When a subscription is bought, the one-time online card fee is taken first,
                  then the rest is counted as income a little each day across its 30-day plan.
                  This view is separate — it does not affect your daily sales reports or the
                  SharePoint sheet.
                </p>

                {subRevenueLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Card key={i}><CardContent className="p-4">
                        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
                        <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
                      </CardContent></Card>
                    ))}
                  </div>
                ) : !subRevenue || subRevenue.totals.total_count === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No subscriptions sold yet</h3>
                      <p className="text-gray-600">
                        Once an Unlimited or Multi-Car Family plan is sold, its daily earned
                        revenue will appear here.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card><CardContent className="p-4">
                        <p className="text-sm text-gray-500">Earned today</p>
                        <p className="text-2xl font-bold text-cuci-primary">{formatBND(subRevenue.totals.earned_today_cents)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-4">
                        <p className="text-sm text-gray-500">Recognized to date</p>
                        <p className="text-2xl font-bold text-gray-900">{formatBND(subRevenue.totals.recognized_cents)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-4">
                        <p className="text-sm text-gray-500">Not yet earned</p>
                        <p className="text-2xl font-bold text-gray-900">{formatBND(subRevenue.totals.deferred_cents)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-4">
                        <p className="text-sm text-gray-500">Active subscriptions</p>
                        <p className="text-2xl font-bold text-gray-900">{subRevenue.totals.active_count}</p>
                      </CardContent></Card>
                    </div>

                    <Card><CardContent className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Total sales (gross)</p>
                          <p className="font-semibold text-gray-900">{formatBND(subRevenue.totals.gross_cents)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Online fees taken</p>
                          <p className="font-semibold text-gray-900">−{formatBND(subRevenue.totals.mdr_fee_cents)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Net to recognize</p>
                          <p className="font-semibold text-gray-900">{formatBND(subRevenue.totals.net_cents)}</p>
                        </div>
                      </div>
                    </CardContent></Card>

                    {subRevenue.by_plan.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">By plan</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {subRevenue.by_plan.map((p) => (
                            <Card key={p.label}><CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold text-gray-900">{p.label}</p>
                                <Badge variant="outline">{p.count} sold</Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <p className="text-gray-500">Earned today</p>
                                  <p className="font-medium text-cuci-primary">{formatBND(p.earned_today_cents)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Recognized</p>
                                  <p className="font-medium text-gray-900">{formatBND(p.recognized_cents)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Not yet earned</p>
                                  <p className="font-medium text-gray-900">{formatBND(p.deferred_cents)}</p>
                                </div>
                              </div>
                            </CardContent></Card>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Individual subscriptions</h3>
                      <Card><CardContent className="p-0 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 border-b">
                              <th className="p-3 font-medium">Customer</th>
                              <th className="p-3 font-medium">Plate</th>
                              <th className="p-3 font-medium">Plan</th>
                              <th className="p-3 font-medium">Sold</th>
                              <th className="p-3 font-medium text-center">Day</th>
                              <th className="p-3 font-medium text-right">Per day</th>
                              <th className="p-3 font-medium text-right">Earned today</th>
                              <th className="p-3 font-medium text-right">Recognized</th>
                              <th className="p-3 font-medium text-right">Not yet earned</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subRevenue.subscriptions.map((s) => (
                              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-3 text-gray-900">
                                  {s.customer_name || "Walk-in"}
                                  {(s.car_brand || s.car_model) && (
                                    <div className="text-xs text-gray-500">
                                      {[s.car_brand, s.car_model].filter(Boolean).join(" ")}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 font-mono text-gray-700">{s.plate || "—"}</td>
                                <td className="p-3 text-gray-700">
                                  {s.plan_label}
                                  {s.status !== "active" && (
                                    <Badge variant="outline" className="ml-2 text-gray-500">{s.status}</Badge>
                                  )}
                                </td>
                                <td className="p-3 text-gray-500">{formatDate(s.created_at)}</td>
                                <td className="p-3 text-center text-gray-700">{s.day_index}/{subRevenue.recognition_days}</td>
                                <td className="p-3 text-right text-gray-700">{formatBND(s.daily_cents)}</td>
                                <td className="p-3 text-right text-cuci-primary font-medium">{formatBND(s.earned_today_cents)}</td>
                                <td className="p-3 text-right text-gray-900">{formatBND(s.recognized_cents)}</td>
                                <td className="p-3 text-right text-gray-700">{formatBND(s.deferred_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent></Card>
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Interest signups ---- */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Interest signups</h2>
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
                  {signups.map((signup, index) => {
                    const waPhone = normalizeWaPhone(signup.phone);
                    return (
                    <motion.div
                      key={signup.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="hover:shadow-md transition-all duration-200">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 min-w-0">
                              <div className="w-10 h-10 bg-cuci-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <Mail className="w-5 h-5 text-cuci-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">
                                  <a
                                    href={`mailto:${signup.email}`}
                                    className="text-cuci-primary hover:text-cuci-primary-dark"
                                    data-testid={`link-signup-email-${signup.id}`}
                                  >
                                    {signup.email}
                                  </a>
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                                  {signup.carPlate &&
                                    signup.carPlate
                                      .split(",")
                                      .map((p) => p.trim())
                                      .filter(Boolean)
                                      .map((p, idx) => (
                                        <span
                                          key={`${signup.id}-plate-${idx}`}
                                          className="flex items-center font-semibold text-gray-700"
                                          data-testid={`text-signup-plate-${signup.id}-${idx}`}
                                        >
                                          <Car className="w-3.5 h-3.5 mr-1 text-cuci-primary" />
                                          {signup.plan === "family" && (
                                            <span className="text-gray-400 mr-1">
                                              Car {idx + 1}:
                                            </span>
                                          )}
                                          {p}
                                        </span>
                                      ))}
                                  {signup.phone && (
                                    <a
                                      href={`tel:${signup.phone}`}
                                      className="flex items-center hover:text-cuci-primary"
                                      data-testid={`link-signup-phone-${signup.id}`}
                                    >
                                      <Phone className="w-3.5 h-3.5 mr-1" />
                                      {signup.phone}
                                    </a>
                                  )}
                                  <span className="flex items-center">
                                    <Calendar className="w-3.5 h-3.5 mr-1" />
                                    {formatDate(signup.createdAt.toString())}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <Badge
                                variant="outline"
                                className="text-cuci-primary border-cuci-primary capitalize"
                                data-testid={`badge-signup-plan-${signup.id}`}
                              >
                                {signup.plan
                                  ? PLAN_LABELS[signup.plan] ?? signup.plan
                                  : "Awaiting Launch"}
                              </Badge>
                              {waPhone && (
                                <Button
                                  asChild
                                  size="sm"
                                  className="bg-[#25D366] hover:bg-[#1da851] text-white"
                                  data-testid={`button-signup-whatsapp-${signup.id}`}
                                >
                                  <a
                                    href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                      goLiveMessage(signup.plan),
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Notify via WhatsApp"
                                  >
                                    <SiWhatsapp className="w-4 h-4 mr-1.5" />
                                    Notify
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                    );
                  })}
                </div>
              )}
              </div>
              </div>
            </TabsContent>
            )}
          </Tabs>
            );
          })()}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// =====================================================================
// Phase 5a — Dashboard tab
// Mirrors the KedaiPOS "Today's Overall By Vendor" screen: 12 KPI tiles
// + an hourly sales/refund area chart. Branch + date are picker-driven;
// "All branches" is the default for owners.
// =====================================================================

interface DashboardResponse {
  filter: { branch_id: number | null; date: string };
  branches: Array<{ id: number; name: string; location: string }>;
  tiles: {
    today_transactions: number;
    today_sales_cents: number;
    today_avg_sales_cents: number;
    today_items_sold: number;
    today_refund_count: number;
    today_refund_total_cents: number;
    today_avg_refund_cents: number;
    today_net_sales_cents: number;
    today_mdr_fee_cents: number;
    today_net_after_fees_cents: number;
    today_active_staff: number;
    today_active_customers: number;
    total_staff: number;
    total_customers: number;
  };
  hourly: Array<{ hour: number; sales_cents: number; refund_cents: number }>;
}

function DashboardTab() {
  const { staff } = useStaffAuth();
  const canSeeAccounts = staff?.role === "owner" || staff?.role === "manager";
  const [branchId, setBranchId] = useState<string>("all");
  const [date, setDate] = useState<string>(todayBNT());

  const { data, isLoading, isFetching, error, refetch } = useQuery<DashboardResponse>({
    queryKey: ["/api/admin/dashboard", branchId, date],
    queryFn: async () => {
      const url = `/api/admin/dashboard?branch_id=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("dashboard_failed");
      return res.json();
    },
  });

  const tiles = data?.tiles;
  const branches = data?.branches ?? [];

  const tileDefs: Array<{
    label: string;
    value: string;
    tone: "green" | "blue" | "purple" | "pink" | "amber";
    testId: string;
  }> = useMemo(() => {
    if (!tiles) return [];
    return [
      { label: "Today's Transactions",     value: String(tiles.today_transactions),                  tone: "green",  testId: "tile-tx" },
      { label: "Today's Sales",            value: formatBND(tiles.today_sales_cents),                tone: "blue",   testId: "tile-sales" },
      { label: "Today's Average Sales",    value: formatBND(tiles.today_avg_sales_cents),            tone: "purple", testId: "tile-avg" },
      { label: "Today's Items Sold",       value: String(tiles.today_items_sold),                    tone: "green",  testId: "tile-items" },
      { label: "Refund Transactions",      value: String(tiles.today_refund_count),                  tone: "amber",  testId: "tile-refund-count" },
      { label: "Total Refunds",            value: formatBND(tiles.today_refund_total_cents),         tone: "blue",   testId: "tile-refund-total" },
      { label: "Average Refund",           value: formatBND(tiles.today_avg_refund_cents),           tone: "pink",   testId: "tile-refund-avg" },
      { label: "Net Sales",                value: formatBND(tiles.today_net_sales_cents),            tone: "blue",   testId: "tile-net" },
      { label: "Transaction Fees (MDR)",   value: formatBND(tiles.today_mdr_fee_cents),              tone: "amber",  testId: "tile-mdr-fee" },
      { label: "Net After Fees",           value: formatBND(tiles.today_net_after_fees_cents),       tone: "green",  testId: "tile-net-after-fees" },
      { label: "Active Staff Today",       value: String(tiles.today_active_staff),                  tone: "purple", testId: "tile-staff-today" },
      { label: "Active Customers Today",   value: String(tiles.today_active_customers),              tone: "pink",   testId: "tile-cust-today" },
      { label: "Total Staff",              value: String(tiles.total_staff),                         tone: "green",  testId: "tile-staff-total" },
      { label: "Total Customers",          value: String(tiles.total_customers),                     tone: "pink",   testId: "tile-cust-total" },
    ];
  }, [tiles]);

  const toneClass: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
    pink: "bg-pink-50 text-pink-700 ring-pink-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
  };

  const chartData = (data?.hourly ?? []).map((h) => ({
    hour: `${String(h.hour).padStart(2, "0")}:00`,
    sales: h.sales_cents / 100,
    refunds: h.refund_cents / 100,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-3">
            <span>Today's Overall By Branch</span>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-44">
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger data-testid="select-dashboard-branch">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40"
                data-testid="input-dashboard-date"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-dashboard-refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600 py-4">Failed to load dashboard.</p>
          ) : isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {tileDefs.map((t) => (
                <div
                  key={t.label}
                  className="cuci-kpi flex flex-col gap-2"
                  data-testid={t.testId}
                >
                  <span className="cuci-eyebrow">{t.label}</span>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-extrabold border-2 border-black ${toneClass[t.tone]}`}
                  >
                    {t.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hourly Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No data.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="refundGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `B$${v.toFixed(0)}`} />
                  <RTooltip
                    formatter={(v: number, name) => [`B$${Number(v).toFixed(2)}`, name === "sales" ? "Sales" : "Refunds"]}
                    labelFormatter={(l) => `Hour ${l}`}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#0ea5e9" fill="url(#salesGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="refunds" stroke="#ef4444" fill="url(#refundGrad)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {canSeeAccounts && <AccountsLoginsCard />}
    </div>
  );
}

// =====================================================================
// Accounts & Logins panel (Dashboard tab)
// App account sign-ups (users table) + customer login activity
// (auth_sessions). "Today" / "this month" are Brunei-local.
// =====================================================================

interface AccountsStats {
  total_accounts: number;
  registered_today: number;
  registered_this_month: number;
  logins_today: number;
  currently_logged_in: number;
  ever_logged_in: number;
  last_login: { at: string; name: string } | null;
  recent_logins: Array<{ at: string; name: string }>;
  signups_by_month: Array<{ month: string; count: number }>;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtLoginTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Brunei",
  });
}

type AccountMetric =
  | "total_accounts" | "registered_today" | "registered_this_month"
  | "logins_today" | "currently_logged_in" | "ever_logged_in";

function AccountsLoginsCard() {
  const [detailMetric, setDetailMetric] = useState<AccountMetric | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useQuery<AccountsStats>({
    queryKey: ["/api/admin/accounts/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/accounts/stats", { credentials: "include" });
      if (!res.ok) throw new Error("accounts_stats_failed");
      return res.json();
    },
  });

  const toneClass: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
    pink: "bg-pink-50 text-pink-700 ring-pink-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
  };

  const tileDefs: Array<{ label: string; value: string; tone: keyof typeof toneClass; testId: string; metric: AccountMetric }> =
    data
      ? [
          { label: "Total Accounts",       value: data.total_accounts.toLocaleString(), tone: "blue",   testId: "tile-acct-total",       metric: "total_accounts" },
          { label: "Registered Today",     value: String(data.registered_today),        tone: "green",  testId: "tile-acct-reg-today",   metric: "registered_today" },
          { label: "New Sign-ups (Month)", value: String(data.registered_this_month),   tone: "purple", testId: "tile-acct-reg-month",   metric: "registered_this_month" },
          { label: "Logged In Today",      value: String(data.logins_today),            tone: "pink",   testId: "tile-acct-login-today", metric: "logins_today" },
          { label: "Currently Signed In",  value: String(data.currently_logged_in),     tone: "amber",  testId: "tile-acct-active",      metric: "currently_logged_in" },
          { label: "Ever Logged In",       value: String(data.ever_logged_in),          tone: "blue",   testId: "tile-acct-ever",        metric: "ever_logged_in" },
        ]
      : [];

  const chartData = (data?.signups_by_month ?? []).map((m) => {
    const [y, mo] = m.month.split("-");
    return { label: `${MONTH_ABBR[Number(mo) - 1]} ${y.slice(2)}`, count: m.count };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Accounts &amp; Logins</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-accounts-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600 py-4">Failed to load account stats.</p>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {tileDefs.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setDetailMetric(t.metric)}
                  className="cuci-kpi flex flex-col gap-2 text-left cursor-pointer transition hover:ring-2 hover:ring-cuci-primary/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cuci-primary/60 rounded-lg"
                  data-testid={t.testId}
                  title="Click to see the list"
                >
                  <span className="cuci-eyebrow">{t.label}</span>
                  <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-extrabold border-2 border-black ${toneClass[t.tone]}`}>
                    {t.value}
                  </span>
                </button>
              ))}
            </div>

            {data?.last_login && (
              <p className="text-sm text-gray-600" data-testid="text-last-login">
                <span className="font-semibold text-gray-800">Last login:</span>{" "}
                {data.last_login.name} · {fmtLoginTime(data.last_login.at)}
              </p>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="cuci-eyebrow mb-2">Recent logins</p>
                {!data || data.recent_logins.length === 0 ? (
                  <p className="text-sm text-gray-500">No logins yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">When (Brunei)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent_logins.map((r, i) => (
                        <TableRow key={i} data-testid={`row-recent-login-${i}`}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right text-gray-600">{fmtLoginTime(r.at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div>
                <p className="cuci-eyebrow mb-2">Sign-ups per month</p>
                {chartData.length === 0 ? (
                  <p className="text-sm text-gray-500">No data.</p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RTooltip formatter={(v: number) => [String(v), "Sign-ups"]} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={detailMetric !== null} onOpenChange={(o) => { if (!o) setDetailMetric(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {detailMetric && <AccountsDetailDialog metric={detailMetric} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface AccountsDetailResponse {
  metric: AccountMetric;
  title: string;
  rows: Array<{ id: number; name: string; email: string | null; phone: string | null; at: string | null }>;
}

function AccountsDetailDialog({ metric }: { metric: AccountMetric }) {
  const isLogin = metric === "logins_today" || metric === "currently_logged_in" || metric === "ever_logged_in";
  const { data, isLoading, error } = useQuery<AccountsDetailResponse>({
    queryKey: ["/api/admin/accounts/detail", metric],
    queryFn: async () => {
      const res = await fetch(`/api/admin/accounts/detail?metric=${metric}`, { credentials: "include" });
      if (!res.ok) throw new Error("detail_failed");
      return res.json();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          {data?.title ?? "Details"}
          {data && <span className="text-sm font-normal text-gray-500">({data.rows.length.toLocaleString()})</span>}
        </DialogTitle>
      </DialogHeader>
      <div className="overflow-y-auto -mx-6 px-6">
        {error ? (
          <p className="text-sm text-red-600 py-4">Failed to load details.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500 py-4">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No records.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">{isLogin ? "Last login" : "Registered"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.id} data-testid={`row-account-detail-${r.id}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {r.email || r.phone || <span className="italic text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-600 whitespace-nowrap">
                    {fmtLoginTime(r.at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}

// =====================================================================
// Phase 5a — Order Report tab
// Date range, branch, payment method, staff, and free-text search.
// Top tiles summarise the filtered window; bottom table is paginated.
// =====================================================================

interface OrdersReportResponse {
  filter: {
    branch_id: number | null; from: string; to: string;
    payment_method: string; staff_id: string; search: string;
  };
  branches: Array<{ id: number; name: string }>;
  staff: Array<{ id: string; name: string; role: string; branch_id: number | null }>;
  totals: {
    transactions: number; sales_cents: number; refund_count: number;
    refund_total_cents: number; net_sales_cents: number; items_sold: number;
    avg_sales_cents: number; avg_refund_cents: number;
    mdr_fee_cents: number; net_after_fees_cents: number;
  };
  page: number; per_page: number; total_count: number;
  rows: Array<{
    id: string; ticket_code: string; plate: string;
    ticket_day: string; created_at: string;
    payment_method: string; qr_provider: string | null;
    payment_label: string; package_name: string;
    total_cents: number; paid_amount_cents: number | null;
    change_cents: number | null; status: string;
    refunded_at: string | null; refund_reason: string | null;
    customer_name_walkin: string | null;
    branch_id: number; branch_name: string | null;
    staff_id: string | null; staff_name: string | null;
    kedaipos_pos_name: string | null;
  }>;
}

const PLAN_LABELS: Record<string, string> = {
  unlimited: "Unlimited Xpress",
  family: "Multi-Car Family",
  corporate: "Corporate Fleet",
};

// Prefilled WhatsApp text used to tell an interested sign-up that the
// subscription they registered interest in is now live. Kept friendly and
// low-pressure to match the brand's soft business approach.
function goLiveMessage(plan: string | null | undefined): string {
  const planName = plan ? PLAN_LABELS[plan] ?? plan : null;
  const offering = planName
    ? `our ${planName} subscription`
    : "our car wash subscriptions";
  return (
    `Hi! Good news from Cuci Xpress — ${offering} is now live. ` +
    `You signed up earlier to be notified, so we wanted to let you know ` +
    `you can now subscribe and start enjoying unlimited washes. ` +
    `Visit cucixpress.com to get started, or just reply here if you have ` +
    `any questions. Thank you for your interest!`
  );
}

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR",
  baiduri_pay: "Baiduri Pay",
  voucher: "Voucher",
  subscription: "Subscription",
};

function OrdersReportTab() {
  const today = todayBNT();
  const [branchId, setBranchId] = useState<string>("all");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [staffId, setStaffId] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  // Active query string is recomputed only when "Search" is clicked or
  // a non-text filter changes. Reset page to 1 on any filter change.
  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("branch_id", branchId);
    sp.set("from", from);
    sp.set("to", to);
    sp.set("payment_method", paymentMethod);
    sp.set("staff_id", staffId);
    if (search.trim().length >= 2) sp.set("search", search.trim());
    sp.set("page", String(page));
    sp.set("per_page", "50");
    return sp.toString();
  }, [branchId, from, to, paymentMethod, staffId, search, page]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<OrdersReportResponse>({
    queryKey: ["/api/admin/reports/orders", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/orders?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("report_failed");
      return res.json();
    },
  });

  const branches = data?.branches ?? [];
  const staffList = data?.staff ?? [];
  const totals = data?.totals;
  const rows = data?.rows ?? [];

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / data.per_page)) : 1;

  const onApplyFilters = () => {
    setPage(1);
    refetch();
  };

  const onReset = () => {
    setBranchId("all");
    setFrom(today);
    setTo(today);
    setPaymentMethod("all");
    setStaffId("all");
    setSearch("");
    setPage(1);
  };

  // Bulk export to .xlsx — reuses the same filters as the table.
  // We hit the export endpoint via fetch (so we can surface
  // server-side errors like "too many rows") and trigger a
  // download from the response Blob.
  const [isExporting, setIsExporting] = useState(false);
  const onExport = async () => {
    const sp = new URLSearchParams();
    sp.set("branch_id", branchId);
    sp.set("from", from);
    sp.set("to", to);
    sp.set("payment_method", paymentMethod);
    sp.set("staff_id", staffId);
    if (search.trim().length >= 2) sp.set("search", search.trim());
    setIsExporting(true);
    try {
      const res = await fetch(`/api/admin/reports/orders/export?${sp.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Export failed.";
        try {
          const body = await res.json();
          if (body?.error === "too_many_rows") {
            msg = `Too many rows (${body.row_count?.toLocaleString?.() ?? "?"}). Narrow the date range or branch and try again.`;
          } else if (body?.error) {
            msg = body.error;
          }
        } catch { /* non-JSON response, keep generic message */ }
        alert(msg);
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(dispo);
      const filename = m?.[1] ?? `cucixpress_master_sales_${from}_to_${to}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const summary: Array<{ label: string; value: string; testId: string }> = totals
    ? [
        { label: "Transactions",       value: String(totals.transactions),              testId: "report-tile-tx" },
        { label: "Net Sales",          value: formatBND(totals.net_sales_cents),        testId: "report-tile-net" },
        { label: "Average Sales",      value: formatBND(totals.avg_sales_cents),        testId: "report-tile-avg" },
        { label: "Refund Transactions", value: String(totals.refund_count),             testId: "report-tile-refund-count" },
        { label: "Total Refunds",      value: formatBND(totals.refund_total_cents),     testId: "report-tile-refund-total" },
        { label: "Average Refund",     value: formatBND(totals.avg_refund_cents),       testId: "report-tile-refund-avg" },
        { label: "Items Sold",         value: String(totals.items_sold),                testId: "report-tile-items" },
        { label: "Net Revenue",        value: formatBND(totals.sales_cents - totals.refund_total_cents), testId: "report-tile-revenue" },
        { label: "Transaction Fees (MDR)", value: formatBND(totals.mdr_fee_cents),       testId: "report-tile-mdr-fee" },
        { label: "Net After Fees",     value: formatBND(totals.net_after_fees_cents),   testId: "report-tile-net-after-fees" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date From</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} data-testid="input-report-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date To</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} data-testid="input-report-to" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Branch</label>
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setPage(1); }}>
                <SelectTrigger data-testid="select-report-branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Payment Method</label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setPage(1); }}>
                <SelectTrigger data-testid="select-report-payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Object.entries(paymentMethodLabels).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Staff</label>
              <Select value={staffId} onValueChange={(v) => { setStaffId(v); setPage(1); }}>
                <SelectTrigger data-testid="select-report-staff"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Search (ticket / plate / name)</label>
              <Input
                placeholder="e.g. 76-12345 or BAK9007"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onApplyFilters(); }}
                data-testid="input-report-search"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button onClick={onApplyFilters} disabled={isFetching} data-testid="button-report-search">
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            <Button variant="outline" onClick={onReset} data-testid="button-report-reset">Reset</Button>
            <Button
              variant="outline"
              onClick={onExport}
              disabled={isExporting || isFetching}
              className="ml-auto"
              data-testid="button-report-export"
              title="Download an .xlsx file with the same fields as the KedaiPOS Master Sales export, ready for Power BI."
            >
              <Download className={`w-4 h-4 mr-1 ${isExporting ? "animate-pulse" : ""}`} />
              {isExporting ? "Preparing…" : "Export to Excel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading || !totals
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
            ))
          : summary.map((s) => (
              <div key={s.label} className="rounded-lg border p-3" data-testid={s.testId}>
                <div className="text-xs text-gray-600">{s.label}</div>
                <div className="font-semibold text-gray-900 mt-1">{s.value}</div>
              </div>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>List of Orders {data && <span className="text-sm font-normal text-gray-500">({data.total_count.toLocaleString()})</span>}</span>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600 py-4">Failed to load report.</p>
          ) : rows.length === 0 && !isLoading ? (
            <p className="text-sm text-gray-500 py-4 text-center">No orders match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isRefunded = r.status === "refunded";
                    const dt = new Date(r.created_at);
                    const dateStr = dt.toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                      timeZone: "Asia/Brunei",
                    });
                    return (
                      <TableRow key={r.id} data-testid={`row-report-${r.id}`} className={isRefunded ? "opacity-70" : ""}>
                        <TableCell className="text-xs whitespace-nowrap">{dateStr}</TableCell>
                        <TableCell className="text-xs">{r.branch_name ?? r.branch_id}</TableCell>
                        <TableCell className={`font-mono text-xs ${isRefunded ? "line-through" : ""}`}>{r.ticket_code}</TableCell>
                        <TableCell className="font-mono text-xs">{r.plate}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{r.customer_name_walkin ?? "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{r.package_name}</TableCell>
                        <TableCell className="text-xs">{r.payment_label ?? paymentMethodLabels[r.payment_method] ?? r.payment_method}</TableCell>
                        <TableCell className="text-xs">{r.staff_name ?? "—"}</TableCell>
                        <TableCell className={`text-right text-xs font-medium ${isRefunded ? "text-red-600" : ""}`}>
                          {isRefunded ? "−" : ""}{formatBND(r.total_cents)}
                        </TableCell>
                        <TableCell>
                          {isRefunded ? (
                            <Badge variant="destructive" className="text-xs">Refunded</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status !== "pending_payment" && (
                            <SendReceiptButton orderId={r.id} size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.total_count > data.per_page && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-600">
                Page {data.page} of {totalPages} · {data.total_count.toLocaleString()} orders
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  data-testid="button-report-prev"
                >
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="button-report-next"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Phase 5b — Payment Methods tab
// Date-range + branch filter, then a single sortable table with the
// share each payment method has of total sales. Keeps the same
// "filter card on top, summary tiles, then table" rhythm as the
// Order Report tab so the owner sees a familiar layout.
// =====================================================================
interface PaymentMethodsResponse {
  filter: { branch_id: number | null; from: string; to: string };
  branches: Array<{ id: number; name: string }>;
  totals: {
    transactions: number; sales_cents: number;
    refund_cents: number; mdr_fee_cents: number; net_cents: number;
  };
  rows: Array<{
    payment_method: string;
    qr_provider: string | null;
    transactions: number;
    paid_count: number;
    refund_count: number;
    sales_cents: number;
    refund_cents: number;
    mdr_bps: number;
    mdr_fee_cents: number;
    net_cents: number;
    share_pct: number;
  }>;
}

const qrProviderLabels: Record<string, string> = {
  pocket_pay: "Website cucixpress.com (Web Pocket QR)",
  pocket_pay_invoice: "Pocket Pay (Invoice)",
  baiduri_ms: "Baiduri MS",
  dst_easy: "DST Easy / Quickpay",
  quickpay: "Quickpay",
  bibd: "BIBD",
  baiduri: "Baiduri",
};

function PaymentMethodsTab() {
  const today = todayBNT();
  const [branchId, setBranchId] = useState<string>("all");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("branch_id", branchId);
    sp.set("from", from);
    sp.set("to", to);
    return sp.toString();
  }, [branchId, from, to]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<PaymentMethodsResponse>({
    queryKey: ["/api/admin/reports/payment-methods", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/payment-methods?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("report_failed");
      return res.json();
    },
  });

  const branches = data?.branches ?? [];
  const totals = data?.totals;
  const rows = data?.rows ?? [];

  const onReset = () => {
    setBranchId("all");
    setFrom(today);
    setTo(today);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-pm-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-pm-to" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Branch</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger data-testid="select-pm-branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => refetch()} disabled={isFetching} data-testid="button-pm-search">
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            <Button variant="outline" onClick={onReset} data-testid="button-pm-reset">Reset</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading || !totals ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))
        ) : (
          <>
            <div className="rounded-lg border p-3 bg-blue-50/40">
              <div className="text-xs text-gray-600">Total Transactions</div>
              <div className="font-semibold text-gray-900 mt-1">{totals.transactions.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3 bg-emerald-50/40">
              <div className="text-xs text-gray-600">Total Sales</div>
              <div className="font-semibold text-gray-900 mt-1">{formatBND(totals.sales_cents)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-amber-50/40">
              <div className="text-xs text-gray-600">Transaction Fees (MDR)</div>
              <div className="font-semibold text-amber-700 mt-1" data-testid="tile-pm-mdr-fee">{formatBND(totals.mdr_fee_cents)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-emerald-50/60">
              <div className="text-xs text-gray-600">Net After Fees</div>
              <div className="font-semibold text-emerald-800 mt-1" data-testid="tile-pm-net-after-fees">{formatBND(totals.net_cents)}</div>
            </div>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Payment Methods Breakdown</span>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600 py-4">Failed to load report.</p>
          ) : rows.length === 0 && !isLoading ? (
            <p className="text-sm text-gray-500 py-4 text-center">No payments in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Fee (MDR)</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const label = paymentMethodLabels[r.payment_method] ?? r.payment_method;
                    const subLabel = r.qr_provider ? (qrProviderLabels[r.qr_provider] ?? r.qr_provider) : null;
                    return (
                      <TableRow key={`${r.payment_method}-${r.qr_provider ?? "_"}-${i}`} data-testid={`row-pm-${r.payment_method}`}>
                        <TableCell className="text-sm">
                          <div className="font-medium">{label}</div>
                          {subLabel && <div className="text-xs text-gray-500">{subLabel}</div>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.transactions.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {r.refund_count > 0 ? `${r.refund_count} (−${formatBND(r.refund_cents)})` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatBND(r.sales_cents)}</TableCell>
                        <TableCell className="text-right text-sm text-amber-700">
                          {r.mdr_fee_cents > 0 ? (
                            <>−{formatBND(r.mdr_fee_cents)}<span className="text-xs text-gray-400 ml-1">{(r.mdr_bps / 100).toFixed(2)}%</span></>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold text-emerald-800">{formatBND(r.net_cents)}</TableCell>
                        <TableCell className="text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cuci-primary"
                                style={{ width: `${Math.min(100, r.share_pct)}%` }}
                              />
                            </div>
                            <span className="tabular-nums">{r.share_pct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Phase 5b — Best Selling tab
// Top items sold (packages + addons unwrapped from the order snapshot)
// over the date range, with quantity, revenue, and share of revenue.
// =====================================================================
interface BestSellingResponse {
  filter: { branch_id: number | null; from: string; to: string; limit: number };
  branches: Array<{ id: number; name: string }>;
  totals: { items_sold: number; revenue_cents: number };
  rows: Array<{
    kind: "package" | "addon";
    item_id: string;
    item_name: string;
    quantity: number;
    revenue_cents: number;
    qty_share_pct: number;
    revenue_share_pct: number;
  }>;
}

function BestSellingTab() {
  const today = todayBNT();
  const [branchId, setBranchId] = useState<string>("all");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [limit, setLimit] = useState<string>("25");

  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("branch_id", branchId);
    sp.set("from", from);
    sp.set("to", to);
    sp.set("limit", limit);
    return sp.toString();
  }, [branchId, from, to, limit]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<BestSellingResponse>({
    queryKey: ["/api/admin/reports/best-selling", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/best-selling?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("report_failed");
      return res.json();
    },
  });

  const branches = data?.branches ?? [];
  const totals = data?.totals;
  const rows = data?.rows ?? [];

  const onReset = () => {
    setBranchId("all");
    setFrom(today);
    setTo(today);
    setLimit("25");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-bs-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Date To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-bs-to" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Branch</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger data-testid="select-bs-branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Show top</label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger data-testid="select-bs-limit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => refetch()} disabled={isFetching} data-testid="button-bs-search">
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            <Button variant="outline" onClick={onReset} data-testid="button-bs-reset">Reset</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading || !totals ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))
        ) : (
          <>
            <div className="rounded-lg border p-3 bg-violet-50/40">
              <div className="text-xs text-gray-600">Items Sold</div>
              <div className="font-semibold text-gray-900 mt-1">{totals.items_sold.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3 bg-emerald-50/40">
              <div className="text-xs text-gray-600">Total Revenue</div>
              <div className="font-semibold text-gray-900 mt-1">{formatBND(totals.revenue_cents)}</div>
            </div>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Best Selling Items</span>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600 py-4">Failed to load report.</p>
          ) : rows.length === 0 && !isLoading ? (
            <p className="text-sm text-gray-500 py-4 text-center">No items sold in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Revenue Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.kind}-${r.item_id}`} data-testid={`row-bs-${r.kind}-${r.item_id}`}>
                      <TableCell className="text-xs text-gray-500 tabular-nums">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{r.item_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${
                            r.kind === "package"
                              ? "border-violet-200 text-violet-700 bg-violet-50"
                              : "border-amber-200 text-amber-700 bg-amber-50"
                          }`}
                        >
                          {r.kind === "package" ? "Package" : "Add-on"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{r.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatBND(r.revenue_cents)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${r.kind === "package" ? "bg-violet-500" : "bg-amber-500"}`}
                              style={{ width: `${Math.min(100, r.revenue_share_pct)}%` }}
                            />
                          </div>
                          <span className="tabular-nums">{r.revenue_share_pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Phase 5c — Catalog management (Packages + Add-ons)
// Two stacked sections in one tab; both use the same compact "row +
// edit dialog" pattern so the owner doesn't have to learn two UIs.
// All mutations are owner-only on the server. We still surface the
// owner check on the client so non-owners see a read-only view rather
// than buttons that explode on click.
// =====================================================================
interface CatalogPackage {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  order_count: number;
  // null = "Uncategorised" (groups under the catch-all in POS).
  category_id: string | null;
  // Empty array = available at all branches (server convention).
  branch_ids: number[];
}
interface CategoryRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  package_count: number;
}
interface BranchRow {
  id: number;
  name: string;
  location: string;
}
interface CatalogAddon {
  id: string;
  name: string;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  order_count: number;
  // NULL = Uncategorised. Mirrors CatalogPackage.category_id.
  category_id: string | null;
  // Empty array = available at every branch (matches the package
  // semantics in 2026-05-08_02_addon_branches.sql).
  branch_ids: number[];
}

const formatBndInput = (cents: number) => (cents / 100).toFixed(2);
const parseBndInput = (s: string): number | null => {
  const n = Number(String(s).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

function CatalogTab({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="space-y-8">
      {!isOwner && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You're signed in as a manager. Catalog changes are owner-only — view only here.
        </div>
      )}
      {isOwner && <CategoriesSection />}
      <PackagesSection canEdit={isOwner} />
      <AddonsSection canEdit={isOwner} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Packages section
// ---------------------------------------------------------------------
function PackagesSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ rows: CatalogPackage[] }>({
    queryKey: ["/api/admin/catalog/packages"],
  });
  const rows = data?.rows ?? [];
  const { data: categoriesData } = useCategories();
  const categoryName = new Map((categoriesData?.rows ?? []).map((c) => [c.id, c.name]));
  const [editing, setEditing] = useState<CatalogPackage | null>(null);
  const [creating, setCreating] = useState(false);

  const save = useMutation({
    mutationFn: async (vars: { id?: string; body: any }) => {
      const res = vars.id
        ? await apiRequest("PATCH", `/api/admin/catalog/packages/${vars.id}`, vars.body)
        : await apiRequest("POST", `/api/admin/catalog/packages`, vars.body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/catalog/packages"] });
      setEditing(null);
      setCreating(false);
    },
  });

  const remove = useMutation({
    mutationFn: async (vars: { id: string; force: boolean }) => {
      const res = await fetch(
        `/api/admin/catalog/packages/${vars.id}${vars.force ? "?force=1" : ""}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error("delete_failed"), { body, status: res.status });
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/catalog/packages"] }),
  });

  const onDelete = (row: CatalogPackage) => {
    if (row.order_count > 0) {
      const ok = window.confirm(
        `"${row.name}" was used by ${row.order_count} order(s). It can't be hard-deleted, but I can deactivate it so it stops showing in the POS. Proceed?`,
      );
      if (!ok) return;
      remove.mutate({ id: row.id, force: false });
    } else {
      const ok = window.confirm(`Delete "${row.name}"? This is permanent.`);
      if (!ok) return;
      remove.mutate({ id: row.id, force: true });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Packages</span>
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)} data-testid="button-pkg-new">
              <Plus className="w-4 h-4 mr-1" /> New package
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No packages yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Branches</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={!r.is_active ? "opacity-60" : ""} data-testid={`row-pkg-${r.id}`}>
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell className="text-xs">
                      {r.category_id && categoryName.get(r.category_id) ? (
                        <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                          {categoryName.get(r.category_id)}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">Uncategorised</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-[240px] truncate">{r.description ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.branch_ids.length === 0 ? (
                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">All branches</Badge>
                      ) : (
                        <BranchBadges ids={r.branch_ids} />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatBND(r.price_cents)}</TableCell>
                    <TableCell className="text-right text-xs">{r.order_count.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.is_active ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-600"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)} data-testid={`button-pkg-edit-${r.id}`}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onDelete(r)} data-testid={`button-pkg-delete-${r.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {(editing || creating) && (
        <PackageEditDialog
          initial={editing}
          isPending={save.isPending}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </Card>
  );
}

// Tiny shared hook so both the row badges and the edit dialog see the
// same branches list with one HTTP call.
function useBranches() {
  return useQuery<{ rows: BranchRow[] }>({ queryKey: ["/api/admin/branches"] });
}

// Categories for the package editor's "Category" selector. Owner-only
// endpoint, same one CategoriesSection manages.
function useCategories() {
  return useQuery<{ rows: CategoryRow[] }>({ queryKey: ["/api/admin/catalog/categories"] });
}

function BranchBadges({ ids }: { ids: number[] }) {
  const { data } = useBranches();
  const map = new Map((data?.rows ?? []).map((b) => [b.id, b.name]));
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Badge key={id} variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
          {map.get(id) ?? `#${id}`}
        </Badge>
      ))}
    </div>
  );
}

function PackageEditDialog({
  initial,
  isPending,
  onClose,
  onSave,
}: {
  initial: CatalogPackage | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ? String(initial.duration_minutes) : "");
  const [price, setPrice] = useState(initial ? formatBndInput(initial.price_cents) : "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order != null ? String(initial.sort_order) : "0");
  // "none" is the sentinel for Uncategorised (Select can't hold an empty value).
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "none");
  const { data: categoriesData } = useCategories();
  const categories = (categoriesData?.rows ?? []).filter((c) => c.is_active || c.id === initial?.category_id);
  // "All branches" mode is the default and what an empty branch_ids
  // means on the server. The owner ticks specific branches only when
  // a package is branch-restricted (e.g. Tungku-only Interior Cleaning).
  const [allBranches, setAllBranches] = useState<boolean>(!initial || initial.branch_ids.length === 0);
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(
    new Set(initial?.branch_ids ?? []),
  );
  const { data: branchesData } = useBranches();
  const branches = branchesData?.rows ?? [];
  const [err, setErr] = useState<string | null>(null);

  const toggleBranch = (id: number) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = () => {
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    const cents = parseBndInput(price);
    if (cents === null) return setErr("Price must be a non-negative number (e.g. 8.00).");
    const dur = duration.trim() === "" ? null : Number(duration);
    if (dur !== null && (!Number.isInteger(dur) || dur < 1 || dur > 600)) {
      return setErr("Duration must be a whole number of minutes (1–600), or leave blank.");
    }
    const so = Number(sortOrder);
    if (!Number.isInteger(so) || so < 0 || so > 999) return setErr("Sort order must be 0–999.");
    if (!allBranches && selectedBranches.size === 0) {
      return setErr("Pick at least one branch, or switch to 'All branches'.");
    }
    onSave({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      duration_minutes: dur,
      price_cents: cents,
      is_active: isActive,
      sort_order: so,
      category_id: categoryId === "none" ? null : categoryId,
      branch_ids: allBranches ? [] : Array.from(selectedBranches).sort((a, b) => a - b),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{initial ? "Edit package" : "New package"}</span>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Basic Wash" data-testid="input-pkg-name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Exterior wash + interior wipe-down" data-testid="input-pkg-description" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Category (groups this package in the POS)</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-pkg-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{!c.is_active ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Price (BND)</label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="8.00" inputMode="decimal" data-testid="input-pkg-price" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Duration (min)</label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="10" inputMode="numeric" data-testid="input-pkg-duration" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Sort order</label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" data-testid="input-pkg-sort" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} data-testid="input-pkg-active" />
            Active (shown in POS)
          </label>

          {/* Branch availability. "All branches" is the safe default;
              tick specific branches only for restricted services like
              the Tungku-only Interior Cleaning package. */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">Available at</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={allBranches}
                onChange={() => setAllBranches(true)}
                data-testid="input-pkg-allbranches"
              />
              <span>All branches (default)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!allBranches}
                onChange={() => setAllBranches(false)}
                data-testid="input-pkg-specificbranches"
              />
              <span>Only specific branches</span>
            </label>
            {!allBranches && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedBranches.has(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      data-testid={`input-pkg-branch-${b.id}`}
                    />
                    <span>{b.name}</span>
                  </label>
                ))}
                {branches.length === 0 && <p className="text-xs text-gray-500">Loading branches…</p>}
              </div>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </CardContent>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={submit} disabled={isPending} data-testid="button-pkg-save">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Add-ons section
// ---------------------------------------------------------------------
function AddonsSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ rows: CatalogAddon[] }>({
    queryKey: ["/api/admin/catalog/addons"],
  });
  const rows = data?.rows ?? [];
  const { data: categoriesData } = useCategories();
  const categoryName = new Map((categoriesData?.rows ?? []).map((c) => [c.id, c.name]));
  const [editing, setEditing] = useState<CatalogAddon | null>(null);
  const [creating, setCreating] = useState(false);

  const save = useMutation({
    mutationFn: async (vars: { id?: string; body: any }) => {
      const res = vars.id
        ? await apiRequest("PATCH", `/api/admin/catalog/addons/${vars.id}`, vars.body)
        : await apiRequest("POST", `/api/admin/catalog/addons`, vars.body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/catalog/addons"] });
      setEditing(null);
      setCreating(false);
    },
  });

  const remove = useMutation({
    mutationFn: async (vars: { id: string; force: boolean }) => {
      const res = await fetch(
        `/api/admin/catalog/addons/${vars.id}${vars.force ? "?force=1" : ""}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error("delete_failed"), { body, status: res.status });
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/catalog/addons"] }),
  });

  const onDelete = (row: CatalogAddon) => {
    if (row.order_count > 0) {
      const ok = window.confirm(
        `"${row.name}" was used on ${row.order_count} order(s). It can't be hard-deleted, but I can deactivate it so it stops showing in the POS. Proceed?`,
      );
      if (!ok) return;
      remove.mutate({ id: row.id, force: false });
    } else {
      const ok = window.confirm(`Delete "${row.name}"? This is permanent.`);
      if (!ok) return;
      remove.mutate({ id: row.id, force: true });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Add-ons</span>
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)} data-testid="button-addon-new">
              <Plus className="w-4 h-4 mr-1" /> New add-on
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No add-ons yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Branches</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Sort</TableHead>
                  <TableHead className="text-right">Used in</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={!r.is_active ? "opacity-60" : ""} data-testid={`row-addon-${r.id}`}>
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell className="text-xs">
                      {r.category_id && categoryName.get(r.category_id) ? (
                        <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                          {categoryName.get(r.category_id)}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">Uncategorised</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.branch_ids.length === 0 ? (
                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                          All branches
                        </Badge>
                      ) : (
                        <BranchBadges ids={r.branch_ids} />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatBND(r.price_cents)}</TableCell>
                    <TableCell className="text-right text-xs">{r.sort_order}</TableCell>
                    <TableCell className="text-right text-xs">{r.order_count.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.is_active ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-600"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)} data-testid={`button-addon-edit-${r.id}`}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onDelete(r)} data-testid={`button-addon-delete-${r.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {(editing || creating) && (
        <AddonEditDialog
          initial={editing}
          isPending={save.isPending}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </Card>
  );
}

function AddonEditDialog({
  initial,
  isPending,
  onClose,
  onSave,
}: {
  initial: CatalogAddon | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? formatBndInput(initial.price_cents) : "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order != null ? String(initial.sort_order) : "0");
  // "none" is the sentinel for Uncategorised (Select can't hold an empty value).
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "none");
  const { data: categoriesData } = useCategories();
  const categories = (categoriesData?.rows ?? []).filter((c) => c.is_active || c.id === initial?.category_id);
  // Branch availability — mirrors the PackageEditDialog pattern. Empty
  // assignment ⇒ available at every branch (the safe default).
  const [allBranches, setAllBranches] = useState<boolean>(
    !initial || initial.branch_ids.length === 0,
  );
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(
    new Set(initial?.branch_ids ?? []),
  );
  const { data: branchesData } = useBranches();
  const branches = branchesData?.rows ?? [];
  const [err, setErr] = useState<string | null>(null);

  const toggleBranch = (id: number) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = () => {
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    const cents = parseBndInput(price);
    if (cents === null) return setErr("Price must be a non-negative number (e.g. 1.00).");
    const so = Number(sortOrder);
    if (!Number.isInteger(so) || so < 0 || so > 999) return setErr("Sort order must be 0–999.");
    if (!allBranches && selectedBranches.size === 0) {
      return setErr("Pick at least one branch, or switch to 'All branches'.");
    }
    onSave({
      name: name.trim(),
      price_cents: cents,
      is_active: isActive,
      sort_order: so,
      category_id: categoryId === "none" ? null : categoryId,
      branch_ids: allBranches ? [] : Array.from(selectedBranches).sort((a, b) => a - b),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{initial ? "Edit add-on" : "New add-on"}</span>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tire Shine" data-testid="input-addon-name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Category (groups this add-on in the POS)</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-addon-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{!c.is_active ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Price (BND)</label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.00" inputMode="decimal" data-testid="input-addon-price" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Sort order</label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" data-testid="input-addon-sort" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} data-testid="input-addon-active" />
            Active (shown in POS)
          </label>

          {/* Branch availability. "All branches" is the safe default;
              tick specific branches only for restricted upsells like
              an Engine Bay Wash that's not available at every till. */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">Available at</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={allBranches}
                onChange={() => setAllBranches(true)}
                data-testid="input-addon-allbranches"
              />
              <span>All branches (default)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!allBranches}
                onChange={() => setAllBranches(false)}
                data-testid="input-addon-specificbranches"
              />
              <span>Only specific branches</span>
            </label>
            {!allBranches && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedBranches.has(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      data-testid={`input-addon-branch-${b.id}`}
                    />
                    <span>{b.name}</span>
                  </label>
                ))}
                {branches.length === 0 && <p className="text-xs text-gray-500">Loading branches…</p>}
              </div>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </CardContent>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={submit} disabled={isPending} data-testid="button-addon-save">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Trends tab — Phase 9 (manager + owner only).
//
// Date range (default: last 30 days) + branch filter, then:
//   • KPI strip (net sales, transactions, avg ticket, refunds)
//   • Daily revenue area chart (sales + refunds)
//   • By-branch revenue bar chart
//   • Day-of-week × hour heatmap (busy-hour staffing planner)
// Backed by GET /api/admin/reports/trends.
// ============================================================

interface TrendsResp {
  filter: { branch_id: number | null; from: string; to: string };
  branches: Array<{ id: number; name: string }>;
  daily: Array<{ date: string; sales_cents: number; refund_cents: number; transactions: number }>;
  by_branch: Array<{ branch_id: number; branch_name: string; sales_cents: number; refund_cents: number; transactions: number }>;
  heatmap: Array<{ dow: number; hour: number; transactions: number; sales_cents: number }>;
  totals: {
    sales_cents: number;
    refund_cents: number;
    transactions: number;
    refund_count: number;
    avg_ticket_cents: number;
  };
}

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultTrendsRange() {
  const today = todayBNT();
  const ms = Date.parse(today + "T00:00:00Z") - 29 * 24 * 60 * 60 * 1000;
  const from = new Date(ms).toISOString().slice(0, 10);
  return { from, to: today };
}

function TrendsTab() {
  const initial = defaultTrendsRange();
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [branch, setBranch] = useState<string>("all");

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (branch !== "all") qs.set("branch_id", branch);
  const url = `/api/admin/reports/trends?${qs.toString()}`;

  const { data, isLoading, error } = useQuery<TrendsResp>({
    queryKey: ["/api/admin/reports/trends", from, to, branch],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("trends_failed");
      return res.json();
    },
  });

  const dailyChartData = useMemo(
    () =>
      (data?.daily ?? []).map((r) => ({
        date: r.date.slice(5), // MM-DD
        sales: r.sales_cents / 100,
        refunds: r.refund_cents / 100,
        transactions: r.transactions,
      })),
    [data],
  );

  const branchChartData = useMemo(
    () =>
      (data?.by_branch ?? []).map((r) => ({
        branch: r.branch_name,
        sales: r.sales_cents / 100,
        transactions: r.transactions,
      })),
    [data],
  );

  // Build a 7×24 matrix from heatmap rows for fast lookup.
  const { heatmap, heatmapMax } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const r of data?.heatmap ?? []) {
      if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) {
        grid[r.dow][r.hour] = r.transactions;
        if (r.transactions > max) max = r.transactions;
      }
    }
    return { heatmap: grid, heatmapMax: max };
  }, [data]);

  const setQuickRange = (days: number) => {
    const today = todayBNT();
    const ms = Date.parse(today + "T00:00:00Z") - (days - 1) * 24 * 60 * 60 * 1000;
    setFrom(new Date(ms).toISOString().slice(0, 10));
    setTo(today);
  };

  return (
    <div className="space-y-6">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="cuci-eyebrow">Strategic view</div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">
            Sales <span className="text-cuci-primary">trends</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            Multi-day revenue, branch comparison, and day-of-week × hour busy
            patterns to plan staffing.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-trends-from" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-trends-to" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Branch</label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger data-testid="select-trends-branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(data?.branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-2 items-end">
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => setQuickRange(7)}>7d</Button>
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => setQuickRange(30)}>30d</Button>
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => setQuickRange(90)}>90d</Button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">Failed to load trends.</p>}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="cuci-kpi">
          <div className="cuci-eyebrow">Net sales</div>
          <div className="text-2xl font-extrabold tabular-nums" data-testid="kpi-net-sales">
            {isLoading ? "…" : formatBND(data?.totals.sales_cents ?? 0)}
          </div>
        </div>
        <div className="cuci-kpi">
          <div className="cuci-eyebrow">Transactions</div>
          <div className="text-2xl font-extrabold tabular-nums" data-testid="kpi-transactions">
            {isLoading ? "…" : (data?.totals.transactions ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="cuci-kpi">
          <div className="cuci-eyebrow">Avg ticket</div>
          <div className="text-2xl font-extrabold tabular-nums" data-testid="kpi-avg-ticket">
            {isLoading ? "…" : formatBND(data?.totals.avg_ticket_cents ?? 0)}
          </div>
        </div>
        <div className="cuci-kpi">
          <div className="cuci-eyebrow">Refunds</div>
          <div className="text-2xl font-extrabold tabular-nums" data-testid="kpi-refunds">
            {isLoading ? "…" : `${data?.totals.refund_count ?? 0} · ${formatBND(data?.totals.refund_cents ?? 0)}`}
          </div>
        </div>
      </div>

      {/* Daily revenue area chart */}
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Daily revenue</CardTitle>
          <p className="text-xs text-gray-500">Sales (purple) vs refunds (orange) per day in B$.</p>
        </CardHeader>
        <CardContent>
          <div className="w-full h-72">
            <ResponsiveContainer>
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id="trendsSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(257,74%,66%)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(257,74%,66%)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="trendsRefunds" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(36,100%,50%)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(36,100%,50%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `B$${v}`} />
                <RTooltip
                  formatter={(v: number) => `B$${v.toFixed(2)}`}
                  contentStyle={{ border: "2px solid #000", borderRadius: 8 }}
                />
                <Legend />
                <Area type="monotone" dataKey="sales" stroke="hsl(257,74%,66%)" strokeWidth={2} fill="url(#trendsSales)" name="Sales" />
                <Area type="monotone" dataKey="refunds" stroke="hsl(36,100%,50%)" strokeWidth={2} fill="url(#trendsRefunds)" name="Refunds" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* By-branch + Heatmap side-by-side on lg */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="cuci-card border-2 border-black">
          <CardHeader>
            <CardTitle className="text-lg font-extrabold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cuci-primary" />
              Revenue by branch
            </CardTitle>
            <p className="text-xs text-gray-500">Net sales per branch over the selected range.</p>
          </CardHeader>
          <CardContent>
            <div className="w-full h-72">
              <ResponsiveContainer>
                <BarChart data={branchChartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `B$${v}`} />
                  <YAxis type="category" dataKey="branch" fontSize={11} width={80} />
                  <RTooltip
                    formatter={(v: number) => `B$${v.toFixed(2)}`}
                    contentStyle={{ border: "2px solid #000", borderRadius: 8 }}
                  />
                  <Bar dataKey="sales" fill="hsl(257,74%,66%)" name="Sales" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="cuci-card border-2 border-black">
          <CardHeader>
            <CardTitle className="text-lg font-extrabold">Busy-hour heatmap</CardTitle>
            <p className="text-xs text-gray-500">
              Transactions by day-of-week × hour. Darker = busier. Use this to plan staffing.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-[10px] border-collapse" data-testid="heatmap-grid">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="font-normal text-gray-500 px-[2px] text-center" style={{ minWidth: 18 }}>
                        {h % 3 === 0 ? h : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOW_LABEL.map((label, dow) => (
                    <tr key={dow}>
                      <td className="font-semibold text-gray-700 pr-2 text-right">{label}</td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const v = heatmap[dow]?.[h] ?? 0;
                        const intensity = heatmapMax > 0 ? v / heatmapMax : 0;
                        const bg =
                          v === 0
                            ? "transparent"
                            : `hsl(257, 74%, ${Math.round(96 - intensity * 50)}%)`;
                        const color = intensity > 0.55 ? "#fff" : "#111";
                        return (
                          <td
                            key={h}
                            title={`${label} ${h}:00 — ${v} txn${v === 1 ? "" : "s"}`}
                            className="text-center align-middle"
                            style={{
                              background: bg,
                              color,
                              border: "1px solid #f3f4f6",
                              padding: 0,
                              width: 18,
                              height: 22,
                            }}
                          >
                            {v > 0 ? v : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Shifts tab — Phase 8 (manager + owner only).
//
// Lists cashier shifts with filters (status / branch / date range)
// and a click-through detail panel showing the full per-payment
// breakdown and any over/short variance. Server endpoints:
//
//   GET /api/admin/shifts
//   GET /api/admin/shifts/:id
// ============================================================

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR Code",
  baiduri_pay: "Baiduri Pay",
  quick_pay: "Quick Pay",
  subscription: "Subscription",
  voucher: "Voucher",
};

interface ShiftListRow {
  id: number;
  branch_id: number;
  branch_name: string;
  opened_by_staff_id: string;
  opened_by_name: string;
  closed_by_staff_id: string | null;
  closed_by_name: string | null;
  opening_float_cents: number;
  opening_note: string | null;
  closing_counted_cents: number | null;
  closing_expected_cents: number | null;
  closing_variance_cents: number | null;
  closing_note: string | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
}

interface ShiftDetailResp {
  shift: ShiftListRow;
  totals: {
    breakdown: Array<{
      payment_method: string;
      qr_provider?: string | null;
      sales_cents: number; sales_count: number;
      refund_cents: number; refund_count: number;
      mdr_bps?: number;
      mdr_fee_cents?: number;
    }>;
    sales_cents: number;
    sales_count: number;
    refund_cents: number;
    refund_count: number;
    net_sales_cents: number;
    mdr_fee_cents?: number;
    net_after_fees_cents?: number;
    cash_sales_cents: number;
    cash_refund_cents: number;
    expected_cash_cents: number;
  };
}

const SHIFT_PROVIDER_LABELS: Record<string, string> = {
  progresif_ding: "Progresif Ding",
  pocket_pay_qr: "Pocket QR",
  pocket_pay: "Website cucixpress.com (Web Pocket QR)",
};
const shiftRowLabel = (r: { payment_method: string; qr_provider?: string | null }): string =>
  r.qr_provider
    ? SHIFT_PROVIDER_LABELS[r.qr_provider] ?? r.qr_provider.replace(/_/g, " ")
    : paymentMethodLabels[r.payment_method] ?? r.payment_method;
const shiftRowKey = (r: { payment_method: string; qr_provider?: string | null }): string =>
  `${r.payment_method}|${r.qr_provider ?? ""}`;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Brunei",
  });
}

function ShiftsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (branchFilter !== "all") queryParams.set("branch_id", branchFilter);
  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);
  const qs = queryParams.toString();
  const listUrl = qs ? `/api/admin/shifts?${qs}` : "/api/admin/shifts";

  const { data, isLoading, error } = useQuery<{ shifts: ShiftListRow[] }>({
    queryKey: ["/api/admin/shifts", statusFilter, branchFilter, from, to],
    queryFn: async () => {
      const res = await fetch(listUrl, { credentials: "include" });
      if (!res.ok) throw new Error("list_failed");
      return res.json();
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery<ShiftDetailResp>({
    queryKey: ["/api/admin/shifts", selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/admin/shifts/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("detail_failed");
      return res.json();
    },
  });

  const shifts = data?.shifts ?? [];

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* ---- Left: list + filters ----------------------------------- */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="cuci-card border-2 border-black">
          <CardHeader>
            <div className="cuci-eyebrow">Drawer reconciliation</div>
            <CardTitle className="text-2xl font-extrabold tracking-tight">
              Cashier <span className="text-cuci-primary">shifts</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              Review opening floats, sales by payment method, and any over/short
              variance at close.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-shift-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Branch</label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger data-testid="select-shift-branch"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    <SelectItem value="1">Bandar</SelectItem>
                    <SelectItem value="2">Gadong</SelectItem>
                    <SelectItem value="3">Kiulap</SelectItem>
                    <SelectItem value="4">Tutong</SelectItem>
                    <SelectItem value="5">KB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">From</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-shift-from" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">To</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-shift-to" />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">Failed to load shifts.</p>
            )}
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : shifts.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-6 text-center">
                No shifts match these filters.
              </p>
            ) : (
              <div className="border-2 border-black rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cashier</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Float</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((s) => {
                      const v = s.closing_variance_cents;
                      return (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer ${selectedId === s.id ? "bg-cuci-primary/5" : ""}`}
                          onClick={() => setSelectedId(s.id)}
                          data-testid={`row-shift-${s.id}`}
                        >
                          <TableCell className="font-semibold">{s.opened_by_name}</TableCell>
                          <TableCell>{s.branch_name}</TableCell>
                          <TableCell className="text-xs text-gray-600">{formatDateTime(s.opened_at)}</TableCell>
                          <TableCell>
                            {s.status === "open" ? (
                              <Badge className="bg-green-600 text-white">Open</Badge>
                            ) : (
                              <Badge variant="outline">Closed</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBND(s.opening_float_cents)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {v === null ? (
                              <span className="text-gray-400">—</span>
                            ) : v === 0 ? (
                              <span className="text-green-700 font-semibold">B$0.00</span>
                            ) : (
                              <span className="text-red-700 font-semibold inline-flex items-center gap-1 justify-end">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {v > 0 ? `+${formatBND(v)}` : `−${formatBND(-v)}`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Eye className="w-4 h-4 text-gray-400" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Right: detail panel ------------------------------------ */}
      <div className="lg:col-span-1">
        <Card className="cuci-card border-2 border-black sticky top-6">
          <CardHeader>
            <CardTitle className="text-lg">Shift detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedId === null ? (
              <p className="text-gray-500 italic py-4 text-center">Click a shift to view its breakdown.</p>
            ) : detailLoading || !detail ? (
              <p className="text-gray-500">Loading…</p>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-gray-600">Cashier</span><span className="font-semibold">{detail.shift.opened_by_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Branch</span><span className="font-semibold">{detail.shift.branch_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Opened</span><span>{formatDateTime(detail.shift.opened_at)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Closed</span><span>{formatDateTime(detail.shift.closed_at)}</span></div>
                  {detail.shift.closed_by_name && (
                    <div className="flex justify-between"><span className="text-gray-600">Closed by</span><span>{detail.shift.closed_by_name}</span></div>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-2 border-black"
                  onClick={() => window.open(`/admin/shifts/${detail.shift.id}/print`, "_blank")}
                  data-testid="button-print-shift"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print end-of-day report
                </Button>

                <Separator />

                <div className="space-y-1">
                  <div className="cuci-eyebrow">Sales by method</div>
                  {detail.totals.breakdown.length === 0 ? (
                    <p className="text-gray-500 italic">No orders.</p>
                  ) : (
                    detail.totals.breakdown.map((r) => (
                      <div key={shiftRowKey(r)} className="flex justify-between">
                        <span>
                          {shiftRowLabel(r)}
                          {(r.mdr_fee_cents ?? 0) > 0 && (
                            <span className="text-xs text-amber-700 ml-1">(−{formatBND(r.mdr_fee_cents ?? 0)} fee)</span>
                          )}
                        </span>
                        <span className="tabular-nums">
                          {formatBND(r.sales_cents - r.refund_cents)}
                          {r.refund_count > 0 && (
                            <span className="text-xs text-red-600 ml-1">(−{formatBND(r.refund_cents)})</span>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                    <span>Net sales</span>
                    <span className="tabular-nums">{formatBND(detail.totals.net_sales_cents)}</span>
                  </div>
                  {(detail.totals.mdr_fee_cents ?? 0) > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>− Transaction fees (MDR)</span>
                      <span className="tabular-nums">−{formatBND(detail.totals.mdr_fee_cents ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-emerald-800 border-t-2 border-black pt-1 mt-1">
                    <span>Net after fees</span>
                    <span className="tabular-nums">{formatBND(detail.totals.net_after_fees_cents ?? detail.totals.net_sales_cents)}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1 bg-gradient-to-br from-purple-50 to-orange-50 border-2 border-black rounded-md p-2">
                  <div className="flex justify-between"><span>Opening float</span><span className="tabular-nums">{formatBND(detail.shift.opening_float_cents)}</span></div>
                  <div className="flex justify-between"><span>+ Cash sales</span><span className="tabular-nums">{formatBND(detail.totals.cash_sales_cents)}</span></div>
                  <div className="flex justify-between"><span>− Cash refunds</span><span className="tabular-nums">{formatBND(detail.totals.cash_refund_cents)}</span></div>
                  <div className="flex justify-between border-t-2 border-black pt-1 mt-1 font-bold"><span>Expected cash</span><span className="tabular-nums">{formatBND(detail.totals.expected_cash_cents)}</span></div>
                  {detail.shift.closing_counted_cents !== null && (
                    <>
                      <div className="flex justify-between"><span>Counted cash</span><span className="tabular-nums font-semibold">{formatBND(detail.shift.closing_counted_cents)}</span></div>
                      <div className={`flex justify-between font-bold pt-1 border-t-2 border-black ${
                        detail.shift.closing_variance_cents === 0 ? "text-green-700" : "text-red-700"
                      }`}>
                        <span>Variance</span>
                        <span className="tabular-nums">
                          {detail.shift.closing_variance_cents === 0
                            ? "B$0.00"
                            : detail.shift.closing_variance_cents! > 0
                              ? `+${formatBND(detail.shift.closing_variance_cents!)}`
                              : `−${formatBND(-detail.shift.closing_variance_cents!)}`}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {(detail.shift.opening_note || detail.shift.closing_note) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      {detail.shift.opening_note && (
                        <div>
                          <div className="cuci-eyebrow">Opening note</div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.shift.opening_note}</p>
                        </div>
                      )}
                      {detail.shift.closing_note && (
                        <div>
                          <div className="cuci-eyebrow">Closing note</div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.shift.closing_note}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
