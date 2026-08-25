import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle, Leaf } from "lucide-react";
import api from "@/lib/api";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState("checking");
  const tries = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionId) { setState("failed"); return; }
    let active = true;
    const poll = async () => {
      if (!active) return;
      if (tries.current >= 10) { setState("timeout"); return; }
      tries.current += 1;
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") { setState("paid"); return; }
        if (["expired", "failed"].includes(data.status) || data.payment_status === "failed") { setState("failed"); return; }
      } catch {}
      setTimeout(poll, 2000);
    };
    poll();
    return () => { active = false; };
  }, [sessionId]);

  const cfg = {
    checking: { icon: <Loader2 className="h-10 w-10 text-[#2C5545] animate-spin" />, title: "Confirming your payment…", sub: "Please wait a moment." },
    paid: { icon: <CheckCircle2 className="h-12 w-12 text-[#2C5545]" />, title: "Payment successful!", sub: "Your order is confirmed and the pharmacy is preparing it." },
    failed: { icon: <XCircle className="h-12 w-12 text-red-500" />, title: "Payment not completed", sub: "We couldn't confirm your payment. You can retry from My Orders." },
    timeout: { icon: <Loader2 className="h-10 w-10 text-amber-500" />, title: "Still processing", sub: "This is taking longer than usual. Check My Orders shortly." },
  }[state];

  return (
    <div className="min-h-screen grid place-items-center bg-[#F4F7F5] p-6">
      <div className="glass rounded-2xl p-10 max-w-md w-full text-center" data-testid="payment-success-card">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-lg bg-[#2C5545] grid place-items-center"><Leaf className="h-4 w-4 text-white" /></div>
          <span className="font-display font-bold">Kash AI</span>
        </div>
        <div className="flex justify-center mb-4">{cfg.icon}</div>
        <h1 className="font-display text-2xl font-bold text-[#0F1C17]" data-testid="payment-status-title">{cfg.title}</h1>
        <p className="text-[#4A5E55] mt-2">{cfg.sub}</p>
        <button data-testid="back-to-orders-btn" onClick={() => navigate("/shop")}
          className="mt-8 w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full py-3.5 font-medium transition-colors">
          Go to My Orders
        </button>
      </div>
    </div>
  );
}
