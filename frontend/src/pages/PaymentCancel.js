import { useNavigate } from "react-router-dom";
import { XCircle, Leaf } from "lucide-react";

export default function PaymentCancel() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen grid place-items-center bg-[#F4F7F5] p-6">
      <div className="glass rounded-2xl p-10 max-w-md w-full text-center" data-testid="payment-cancel-card">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-lg bg-[#2C5545] grid place-items-center"><Leaf className="h-4 w-4 text-white" /></div>
          <span className="font-display font-bold">Kash AI Pro</span>
        </div>
        <div className="flex justify-center mb-4"><XCircle className="h-12 w-12 text-amber-500" /></div>
        <h1 className="font-display text-2xl font-bold text-[#0F1C17]">Payment cancelled</h1>
        <p className="text-[#4A5E55] mt-2">No charge was made. Your order is waiting — you can pay anytime from My Orders.</p>
        <button data-testid="cancel-back-btn" onClick={() => navigate("/shop")}
          className="mt-8 w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full py-3.5 font-medium transition-colors">
          Back to Shop
        </button>
      </div>
    </div>
  );
}
