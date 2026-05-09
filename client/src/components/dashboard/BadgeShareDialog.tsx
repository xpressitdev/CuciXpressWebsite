import { useEffect, useState } from "react";
import { Loader2, Download, Share2, X } from "lucide-react";
import { SiWhatsapp, SiFacebook, SiX } from "react-icons/si";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Achievement } from "./achievementsData";
import { renderBadgePng, badgeCaption } from "@/lib/shareBadge";

interface Props {
  achievement: Achievement | null;
  customerName: string;
  onClose: () => void;
}

// Modal that previews the generated badge PNG and offers share targets.
// On mobile we try the native Web Share API with a file attachment so
// the user can hand the image straight to Instagram / WhatsApp / etc.
// On desktop we fall back to download + intent URLs (which carry text
// only — the user pastes the downloaded image in the destination app).
export function BadgeShareDialog({ achievement, customerName, onClose }: Props) {
  const { toast } = useToast();
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-render the PNG every time a new achievement is opened. Cleanup
  // revokes the object URL so we don't leak per-open.
  useEffect(() => {
    if (!achievement) {
      setPngUrl(null);
      setPngBlob(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setBusy(true);
    renderBadgePng(achievement, customerName)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPngBlob(blob);
        setPngUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        toast({
          title: "Couldn't build your badge image",
          description: "Try again in a moment.",
          variant: "destructive",
        });
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [achievement, customerName, toast]);

  if (!achievement) return null;

  const fileName = `cucixpress-${achievement.id}-badge.png`;
  const caption = badgeCaption(achievement);
  const siteUrl = "https://cucixpress.com";

  const tryNativeShare = async () => {
    if (!pngBlob) return;
    const file = new File([pngBlob], fileName, { type: "image/png" });
    // canShare with files is the cleanest signal that the platform will
    // actually accept the image attachment (mainly modern mobile).
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: `${achievement.label} · CuciXpress`,
          text: caption,
        });
      } catch (err) {
        // User dismissed the sheet — no toast needed.
      }
    } else {
      downloadImage();
    }
  };

  const downloadImage = () => {
    if (!pngUrl) return;
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = fileName;
    a.click();
    toast({
      title: "Image saved",
      description: "Share it on any social app from your gallery.",
    });
  };

  const shareToWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(caption)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${encodeURIComponent(caption)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const shareToX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(siteUrl)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Dialog open={!!achievement} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-xl font-black">
            Share your {achievement.label} badge
          </DialogTitle>
          <DialogDescription>
            Show off on social — the image saves in Instagram-story size.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="px-5 pt-3 pb-2">
          <div className="aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 grid place-items-center relative">
            {busy || !pngUrl ? (
              <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
            ) : (
              <img
                src={pngUrl}
                alt={`${achievement.label} badge`}
                className="w-full h-full object-cover"
                data-testid="img-badge-preview"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-3">
          <Button
            onClick={tryNativeShare}
            disabled={!pngBlob}
            className="w-full bg-gradient-to-r from-purple-600 to-orange-500 text-white font-black h-11"
            data-testid="button-badge-native-share"
          >
            <Share2 className="w-4 h-4 mr-2" /> Share badge
          </Button>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={shareToWhatsApp}
              className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              data-testid="button-badge-whatsapp"
            >
              <SiWhatsapp className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={shareToFacebook}
              className="border-blue-600 text-blue-700 hover:bg-blue-50"
              data-testid="button-badge-facebook"
            >
              <SiFacebook className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={shareToX}
              className="border-gray-800 text-gray-900 hover:bg-gray-100"
              data-testid="button-badge-x"
            >
              <SiX className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={downloadImage}
            disabled={!pngUrl}
            className="w-full"
            data-testid="button-badge-download"
          >
            <Download className="w-4 h-4 mr-2" /> Download image
          </Button>

          <p className="text-[11px] text-gray-400 text-center inline-flex items-center gap-1 justify-center w-full">
            <X className="w-3 h-3" /> Tip: Instagram/TikTok don't accept
            web uploads — download then post from your gallery.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
