import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

interface ReviewItem {
  name: string;
  initials: string;
}

const AVATAR_COLORS = [
  "bg-purple-500",
  "bg-orange-500",
  "bg-green-500",
];

interface ReviewsResponse {
  reviews: ReviewItem[];
  averageRating: number;
  totalReviews: number;
}

interface RatingResponse {
  averageRating: number;
  totalReviews: number;
}

const formatExtra = (n: number) =>
  n >= 1000 ? `+${Math.floor(n / 1000)}k` : `+${n}`;

export default function GoogleReviewBadge() {
  const { data: rating } = useQuery<RatingResponse>({
    queryKey: ["/api/average-rating"],
  });
  const { data: reviewsData } = useQuery<ReviewsResponse>({
    queryKey: ["/api/reviews"],
  });

  const avg = rating?.averageRating ?? 0;
  const total = rating?.totalReviews ?? 0;
  const avatars = (reviewsData?.reviews ?? []).slice(0, 3);

  if (!total) return null;

  const filledStars = Math.round(avg);
  const remaining = Math.max(0, total - avatars.length);

  return (
    <div
      className="mt-8 flex items-center gap-3 justify-center lg:justify-start"
      data-testid="badge-google-reviews"
    >
      {avatars.length > 0 && (
        <div className="flex -space-x-3">
          {avatars.map((a, i) => (
            <span
              key={i}
              className={`w-10 h-10 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} ring-2 ring-white flex items-center justify-center text-white text-xs font-bold`}
            >
              {a.initials}
            </span>
          ))}
          {remaining > 0 && (
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-white flex items-center justify-center text-white text-xs font-bold">
              {formatExtra(remaining)}
            </span>
          )}
        </div>
      )}
      <div className="text-left">
        <div className="flex items-center gap-2">
          <div className="flex">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star
                key={i}
                className={`w-4 h-4 ${
                  i < filledStars
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300 fill-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="font-bold text-gray-900">{avg.toFixed(1)}</span>
        </div>
        <p className="text-sm text-gray-600">
          {total.toLocaleString()} Google Reviews
        </p>
      </div>
    </div>
  );
}
