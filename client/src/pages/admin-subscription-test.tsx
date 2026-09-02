import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { SubscriptionCheckout } from "@/components/SubscriptionCheckout";

type CustomerMe = { profile?: { id: number; name?: string; phone?: string } };

// Internal-only test harness for the CyberSource Unified Checkout (card-on-file)
// flow. The public Subscribe button now uses a one-time Pocket Pay payment; this
// page keeps the card-on-file path available for testing without exposing it to
// customers. Access is gated behind a STAFF session (admin-only). The actual
// charge still runs through the customer-scoped CyberSource routes, so the staff
// tester must also be signed in to a customer account in the same browser.
export default function AdminSubscriptionTest() {
  const { toast } = useToast();
  const { isAuthenticated: isStaff, isLoading: staffLoading } = useStaffAuth();
  const [planId, setPlanId] = useState("unlimited");
  const [phone, setPhone] = useState("");
  const [carPlate, setCarPlate] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const { data: me, isLoading: meLoading } = useQuery<CustomerMe>({
    queryKey: ["/api/customer/me"],
    enabled: isStaff,
  });
  const signedInCustomer = !!me?.profile;

  if (staffLoading || (isStaff && meLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Admin-only: must hold a staff session to reach this internal tool.
  if (!isStaff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-0">
          <CardHeader>
            <CardTitle>Staff sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              This is an internal card-on-file test page for staff only. Please
              sign in with your staff account to use it.
            </p>
            <Link href="/admin">
              <Button className="w-full bg-cuci-primary text-white">
                Go to staff sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto pt-8 space-y-6">
        <div className="flex items-center gap-2 text-gray-700">
          <ShieldCheck className="w-5 h-5 text-cuci-primary" />
          <h1 className="text-xl font-bold">CyberSource card-on-file test</h1>
        </div>
        <p className="text-sm text-gray-500">
          Internal use only. Tests the Unified Checkout (auto-renew card-on-file)
          flow. Customers use the one-time Pocket Pay flow on the Subscribe page.
        </p>

        {!signedInCustomer && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              You're signed in as staff but not as a customer in this browser. The
              card charge runs through the customer account, so{" "}
              <Link href="/login" className="underline font-medium">
                sign in to a customer account
              </Link>{" "}
              before testing.
            </span>
          </div>
        )}

        {!showCheckout ? (
          <Card className="shadow-sm border">
            <CardHeader>
              <CardTitle className="text-base">Start a test charge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan">Plan</Label>
                <select
                  id="plan"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-full border rounded-md h-10 px-3 text-sm"
                  data-testid="select-test-plan"
                >
                  <option value="unlimited">Unlimited — B$39/mo</option>
                  <option value="family">Multi-Car Family — B$99/mo</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+673 ..."
                  data-testid="input-test-phone"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="covered-plates">
                  Covered {planId === "family" ? "plates (comma-separated, up to 3)" : "plate"}
                </Label>
                <Input
                  id="covered-plates"
                  value={carPlate}
                  onChange={(e) => setCarPlate(e.target.value)}
                  placeholder={planId === "family" ? "BAA1234, BBB5678" : "BAA1234"}
                  data-testid="input-test-covered-plates"
                />
              </div>
              <Button
                className="w-full bg-cuci-primary text-white"
                onClick={() => {
                  if (!phone.trim()) {
                    toast({
                      title: "Phone required",
                      description: "Enter a phone number for the test charge.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!carPlate.trim()) {
                    toast({
                      title: "Vehicle plate required",
                      description: "Enter the vehicle covered by this subscription.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowCheckout(true);
                }}
                data-testid="button-start-test-checkout"
              >
                Continue to card form
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border">
            <CardHeader>
              <CardTitle className="text-base">Enter test card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SubscriptionCheckout
                planId={planId}
                phone={phone.trim()}
                carPlate={carPlate.trim()}
                onSuccess={() => {
                  toast({
                    title: "Test subscription active 🎉",
                    description:
                      "Card-on-file charge succeeded and the subscription was created.",
                  });
                  setShowCheckout(false);
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCheckout(false)}
              >
                Back
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
