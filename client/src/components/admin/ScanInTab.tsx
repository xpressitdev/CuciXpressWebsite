import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  QrCode,
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Search,
  RotateCcw,
  AlertCircle,
  Ticket,
  Car,
  Package as PackageIcon,
  User,
  Phone as PhoneIcon,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type VerifyOrder = {
  id: string;
  ticket_code: string;
  plate: string;
  package_name: string;
  total_cents: number;
  branch_id: number;
  branch_name: string | null;
  status: string;
  customer: { name: string; phone: string } | null;
  is_prepaid: boolean;
};

type VerifyResult =
  | { ok: true; newly_allocated: boolean; message: string; order: VerifyOrder }
  | { ok: false; httpStatus: number; code: string; message: string };

const SCANNER_ID = "scan-in-camera-region";

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function ScanInTab({
  branchId,
  branchName,
}: {
  // The active POS branch. When supplied, free-wash vouchers get
  // rerouted server-side to *this* branch on first scan. Omit on
  // the admin scan-in page where there is no per-branch context —
  // the server then falls back to the voucher's original branch.
  branchId?: number | null;
  branchName?: string | null;
} = {}) {
  const { toast } = useToast();
  const scannerRef = useRef<any>(null);
  const inFlightRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const stopCamera = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        if (typeof s.isScanning !== "undefined" ? s.isScanning : true) {
          await s.stop();
        }
        await s.clear();
      } catch {
        /* ignore — already stopped */
      }
    }
    setCameraOn(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (qrData: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setVerifying(true);
    try {
      const res = await fetch("/api/verify-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          qr_data: qrData,
          // Lets the server reroute a free-wash voucher to the
          // scanning branch instead of the customer's chosen one.
          ...(branchId != null ? { branch_id: branchId } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success) {
        setResult({
          ok: true,
          newly_allocated: !!body.newly_allocated,
          message: body.message ?? "Verified",
          order: body.order,
        });
        // Auto-stop the camera once we land a successful scan so the
        // staff can read the ticket without it firing again.
        await stopCamera();
        toast({
          title: body.newly_allocated ? "Ticket allocated" : "Already in queue",
          description: `${body.order?.ticket_code ?? ""} · ${body.order?.plate ?? ""}`,
        });
      } else {
        setResult({
          ok: false,
          httpStatus: res.status,
          code: body?.code ?? "error",
          message: body?.message ?? "Verification failed",
        });
        // Keep camera on so staff can re-aim — but rate-limit by holding
        // inFlight until they explicitly reset or another good scan lands.
      }
    } catch (e: any) {
      setResult({
        ok: false,
        httpStatus: 0,
        code: "network_error",
        message: e?.message ?? "Network error",
      });
    } finally {
      setVerifying(false);
      // Allow another scan after a short cool-down so the camera doesn't
      // hammer the API on every frame match.
      setTimeout(() => {
        inFlightRef.current = false;
      }, 1500);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setResult(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ID, /* verbose */ false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => {
          verify(decodedText);
        },
        () => {
          /* per-frame decode failures are normal — ignore */
        },
      );
      setCameraOn(true);
    } catch (e: any) {
      const msg =
        e?.message ??
        "Could not start camera. Use the manual paste box below instead.";
      setCameraError(msg);
      setCameraOn(false);
      scannerRef.current = null;
    }
  };

  const handleManualVerify = () => {
    const text = manualText.trim();
    if (!text) {
      toast({
        title: "Paste a QR payload",
        description: "Copy the QR contents from the customer receipt first.",
        variant: "destructive",
      });
      return;
    }
    setResult(null);
    verify(text);
  };

  const reset = () => {
    setResult(null);
    setManualText("");
  };

  // ─── Result rendering helpers ─────────────────────────────────────────

  const errorVisuals: Record<
    string,
    { color: string; icon: React.ReactNode; title: string }
  > = {
    payment_pending: {
      color: "amber",
      icon: <Clock className="w-12 h-12 text-amber-600" />,
      title: "Payment not yet confirmed",
    },
    voided: {
      color: "rose",
      icon: <Ban className="w-12 h-12 text-rose-600" />,
      title: "Order is voided",
    },
    refunded: {
      color: "rose",
      icon: <Ban className="w-12 h-12 text-rose-600" />,
      title: "Order was refunded",
    },
    order_not_found: {
      color: "slate",
      icon: <Search className="w-12 h-12 text-slate-500" />,
      title: "Order not in our system",
    },
    network_error: {
      color: "slate",
      icon: <AlertCircle className="w-12 h-12 text-slate-500" />,
      title: "Network error",
    },
    error: {
      color: "slate",
      icon: <XCircle className="w-12 h-12 text-slate-500" />,
      title: "Verification failed",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-2 border-black" style={{ boxShadow: "3px 3px 0px 0px rgba(0,0,0,0.9)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <QrCode className="w-6 h-6 text-cuci-primary" />
            Scan-In · Prepaid or Free-wash QR
          </CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Scan any Cuci Xpress QR at the lane — works for web Pocket Pay
            receipts and for free-wash vouchers from the loyalty card.
            We'll allocate the ticket and add the car to today's queue
            {branchName ? ` at ${branchName}` : ""}.
          </p>
          {branchId != null && (
            <p className="text-xs text-gray-500 mt-1">
              Free-wash vouchers will be served at this branch even if the
              customer originally picked a different one when redeeming.
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Camera + manual paste — side by side on lg, stacked on mobile */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Camera */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Camera scan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/*
              The scanner div MUST stay empty in JSX — html5-qrcode mutates
              its inner DOM directly. If React also rendered children inside
              it, unmounting later would crash with `removeChild ... not a
              child of this node`. Placeholders/errors live in a sibling
              overlay positioned over the scanner div instead.
            */}
            <div className="relative w-full aspect-square bg-slate-100 rounded-md overflow-hidden">
              <div id={SCANNER_ID} className="w-full h-full" />
              {(!cameraOn || cameraError) && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
                  {cameraError ? (
                    <span className="px-4 text-center text-rose-600">{cameraError}</span>
                  ) : (
                    "Camera off"
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {!cameraOn ? (
                <Button onClick={startCamera} className="flex-1" data-testid="button-scan-start">
                  <Camera className="w-4 h-4 mr-2" />
                  Start camera
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="outline" className="flex-1" data-testid="button-scan-stop">
                  <CameraOff className="w-4 h-4 mr-2" />
                  Stop camera
                </Button>
              )}
            </div>
            {cameraOn && (
              <p className="text-xs text-gray-500 text-center">
                Aim at the QR on the customer's screen. Hold steady ~10cm away.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Manual paste */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Manual paste
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder='Paste the QR payload here, e.g. {"type":"CUCI_XPRESS_PAYMENT","order_id":"..."}'
              className="font-mono text-xs h-40 resize-none"
              data-testid="input-manual-qr"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleManualVerify}
                disabled={verifying || !manualText.trim()}
                className="flex-1"
                data-testid="button-manual-verify"
              >
                {verifying ? "Verifying…" : "Verify"}
              </Button>
              {manualText && (
                <Button variant="outline" onClick={() => setManualText("")}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Use this if the camera won't open or the screen is too dim to
              scan.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      {result && result.ok && (
        <Card
          className={`border-2 ${
            result.newly_allocated
              ? "border-emerald-400 bg-emerald-50"
              : "border-blue-300 bg-blue-50"
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-7 h-7 ${
                    result.newly_allocated ? "text-emerald-600" : "text-blue-600"
                  }`}
                />
                <span
                  className={
                    result.newly_allocated ? "text-emerald-900" : "text-blue-900"
                  }
                >
                  {result.newly_allocated ? "Ticket allocated" : "Already in queue"}
                </span>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Scan another
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Big ticket */}
              <div className="bg-white rounded-lg p-6 border-2 border-black flex flex-col items-center justify-center"
                   style={{ boxShadow: "3px 3px 0px 0px rgba(0,0,0,0.9)" }}>
                <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide mb-2">
                  <Ticket className="w-4 h-4" />
                  Ticket
                </div>
                <div className="text-5xl font-bold font-mono text-cuci-primary tabular-nums">
                  {result.order.ticket_code}
                </div>
                <Badge
                  variant="outline"
                  className="mt-3 bg-emerald-100 text-emerald-800 border-emerald-300"
                >
                  Prepaid · {result.order.status}
                </Badge>
              </div>

              {/* Details */}
              <div className="bg-white rounded-lg p-4 space-y-3">
                <Row icon={<Car className="w-4 h-4" />} label="Plate" value={result.order.plate} mono />
                <Row icon={<PackageIcon className="w-4 h-4" />} label="Package" value={result.order.package_name} />
                <Row
                  icon={<MapPin className="w-4 h-4" />}
                  label="Branch"
                  value={result.order.branch_name ?? `#${result.order.branch_id}`}
                />
                <Row
                  icon={<span className="text-xs font-bold text-gray-500">B$</span>}
                  label="Amount"
                  value={formatBND(result.order.total_cents)}
                />
                {result.order.customer ? (
                  <>
                    <Row icon={<User className="w-4 h-4" />} label="Customer" value={result.order.customer.name} />
                    <Row
                      icon={<PhoneIcon className="w-4 h-4" />}
                      label="Phone"
                      value={result.order.customer.phone}
                      mono
                    />
                  </>
                ) : (
                  <p className="text-xs text-gray-500 pt-1">No customer profile linked yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !result.ok && (
        (() => {
          const v = errorVisuals[result.code] ?? errorVisuals.error;
          const colorMap: Record<string, string> = {
            amber: "border-amber-400 bg-amber-50 text-amber-900",
            rose: "border-rose-400 bg-rose-50 text-rose-900",
            slate: "border-slate-300 bg-slate-50 text-slate-900",
          };
          return (
            <Card className={`border-2 ${colorMap[v.color]}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">{v.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{v.title}</h3>
                      <Button variant="outline" size="sm" onClick={reset}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Try again
                      </Button>
                    </div>
                    <p className="text-sm">{result.message}</p>
                    <p className="text-xs opacity-60 mt-2">
                      Code: <span className="font-mono">{result.code}</span>
                      {result.httpStatus ? ` · HTTP ${result.httpStatus}` : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
