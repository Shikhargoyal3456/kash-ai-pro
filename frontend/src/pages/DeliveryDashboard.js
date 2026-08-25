import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bike, Package, IndianRupee, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import DashboardLayout, { StatCard } from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";

export default function DeliveryDashboard() {
  const [stats, setStats] = useState({});
  const [available, setAvailable] = useState([]);
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);

  const load = async () => {
    try {
      const [s, o, h] = await Promise.all([
        api.get("/delivery/stats"), api.get("/delivery/orders"), api.get("/delivery/history"),
      ]);
      setStats(s.data); setAvailable(o.data.available); setActive(o.data.active); setHistory(h.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const update = async (id, status) => {
    try { await api.put(`/delivery/orders/${id}/status`, { status }); toast.success(`Marked ${status.replace("_", " ")}`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DashboardLayout title="Delivery Console" subtitle="Pick up nearby orders & track your earnings">
      <div className="grid sm:grid-cols-3 gap-6 mb-8">
        <StatCard icon={Package} label="Active Deliveries" value={stats.active || 0} testid="stat-active" />
        <StatCard icon={CheckCircle2} label="Delivered" value={stats.delivered || 0} tone="#0EA5A0" testid="stat-delivered" />
        <StatCard icon={IndianRupee} label="Earnings" value={`₹${stats.earnings || 0}`} tone="#E88D67" testid="stat-earnings" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title={`Available Orders (${available.length})`}>
          {available.length === 0 && <Empty text="No orders ready for pickup right now." />}
          {available.map((o) => (
            <OrderCard key={o.id} o={o}>
              <button data-testid={`pickup-${o.id}`} onClick={() => update(o.id, "picked_up")} className="bg-[#2C5545] text-white rounded-full px-4 py-2 text-sm hover:bg-[#234437] transition-colors flex items-center gap-1.5"><Bike className="h-4 w-4" /> Accept & Pick Up</button>
            </OrderCard>
          ))}
        </Section>

        <Section title={`Active (${active.length})`}>
          {active.length === 0 && <Empty text="No active deliveries." />}
          {active.map((o) => (
            <OrderCard key={o.id} o={o}>
              {o.status === "picked_up" && <button data-testid={`transit-${o.id}`} onClick={() => update(o.id, "in_transit")} className="bg-[#E88D67] text-white rounded-full px-4 py-2 text-sm hover:bg-[#d97a54] transition-colors">Start Transit</button>}
              {o.status === "in_transit" && <button data-testid={`deliver-${o.id}`} onClick={() => update(o.id, "delivered")} className="bg-[#0EA5A0] text-white rounded-full px-4 py-2 text-sm hover:opacity-90 transition-opacity flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Mark Delivered</button>}
            </OrderCard>
          ))}
        </Section>
      </div>

      <div className="mt-6">
        <Section title={`Delivery History (${history.length})`}>
          {history.length === 0 && <Empty text="No completed deliveries yet." />}
          {history.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0" data-testid={`history-${o.id}`}>
              <div><p className="font-medium text-[#0F1C17]">{o.user_name}</p><p className="text-xs text-[#4A5E55] flex items-center gap-1"><MapPin className="h-3 w-3" />{o.address}</p></div>
              <span className="text-sm font-semibold text-[#2C5545]">₹{o.total}</span>
            </div>
          ))}
        </Section>
      </div>
    </DashboardLayout>
  );
}

function OrderCard({ o, children }) {
  return (
    <div className="rounded-xl border border-slate-100 p-4 bg-[#F4F7F5]/50" data-testid={`del-order-${o.id}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#0F1C17]">{o.store_name}</p>
        <span className="text-sm font-semibold text-[#2C5545]">₹{o.total}</span>
      </div>
      <p className="text-xs text-[#4A5E55] mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.address}</p>
      <p className="text-xs text-[#4A5E55] mt-1">To: {o.user_name} • {o.items.length} item(s)</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
    <h3 className="font-display text-lg font-semibold text-[#0F1C17] mb-4">{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);
const Empty = ({ text }) => <p className="text-sm text-slate-400 py-8 text-center">{text}</p>;
