import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import { Leaf, LogOut } from "lucide-react";

const roleLabel = {
  doctor: "Doctor", pharmacy: "Pharmacy", delivery: "Delivery Partner",
  user: "Customer", admin: "Administrator",
};

export default function DashboardLayout({ title, subtitle, children, actions }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onToast = (e) => toast.info(e.detail);
    window.addEventListener("kash-toast", onToast);
    return () => window.removeEventListener("kash-toast", onToast);
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7F5]">
      <header className="glass sticky top-0 z-50 border-b border-white/50">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#2C5545] grid place-items-center">
              <Leaf className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <div className="leading-none">
              <span className="font-display font-bold text-lg text-[#0F1C17]">Kash AI</span>
              <p className="text-[11px] text-[#4A5E55] mt-0.5">{roleLabel[user?.role]}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-[#0F1C17]" data-testid="nav-user-name">{user?.name}</p>
              <p className="text-[11px] text-[#4A5E55]">{user?.email}</p>
            </div>
            <NotificationBell />
            <div className="h-9 w-9 rounded-full bg-[#E88D67] text-white grid place-items-center font-semibold">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <button
              data-testid="logout-btn"
              onClick={() => { logout(); navigate("/"); }}
              className="h-9 w-9 rounded-full bg-white/60 hover:bg-white grid place-items-center text-[#2C5545] transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0F1C17]">{title}</h1>
            {subtitle && <p className="text-[#4A5E55] mt-1.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, tone = "#2C5545", testid }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-6" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#4A5E55]">{label}</p>
          <p className="font-display text-3xl font-bold text-[#0F1C17] mt-1">{value}</p>
        </div>
        <div className="h-12 w-12 rounded-xl grid place-items-center" style={{ background: `${tone}14` }}>
          <Icon className="h-6 w-6" style={{ color: tone }} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}
