import { Star } from "lucide-react";

export default function StarRating({ value, onChange, testid }) {
  return (
    <div className="flex gap-1" data-testid={testid}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" data-testid={`${testid}-${n}`} onClick={() => onChange(n)} className="transition-transform hover:scale-110">
          <Star className={`h-7 w-7 ${n <= value ? "fill-[#E88D67] text-[#E88D67]" : "text-slate-300"}`} />
        </button>
      ))}
    </div>
  );
}
