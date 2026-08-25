import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, IndianRupee, Clock, AlertTriangle, Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import DashboardLayout, { StatCard } from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";

const statusFlow = { placed: "accepted", accepted: "ready" };
const statusColor = {
  placed: "bg-amber-100 text-amber-700", accepted: "bg-blue-100 text-blue-700",
  ready: "bg-indigo-100 text-indigo-700", picked_up: "bg-purple-100 text-purple-700",
  in_transit: "bg-cyan-100 text-cyan-700", delivered: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function PharmacyDashboard() {
  const [stats, setStats] = useState({});
  const [meds, setMeds] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("inventory");
  const [modal, setModal] = useState(null); // medicine being edited or 'new'

  const load = async () => {
    try {
      const [s, m, o] = await Promise.all([
        api.get("/pharmacy/stats"), api.get("/pharmacy/medicines"), api.get("/pharmacy/orders"),
      ]);
      setStats(s.data); setMeds(m.data); setOrders(o.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    try { await api.delete(`/pharmacy/medicines/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const advance = async (id, status) => {
    try { await api.put(`/pharmacy/orders/${id}/status`, { status }); toast.success(`Order ${status}`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DashboardLayout title="Pharmacy Console" subtitle="Manage inventory & fulfil customer orders"
      actions={<button data-testid="add-medicine-btn" onClick={() => setModal("new")} className="bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 text-sm font-medium transition-colors shadow-md flex items-center gap-2"><Plus className="h-4 w-4" /> Add Medicine</button>}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard icon={Package} label="Medicines" value={stats.medicines || 0} testid="stat-meds" />
        <StatCard icon={Clock} label="Pending Orders" value={stats.pending || 0} tone="#E88D67" testid="stat-pending" />
        <StatCard icon={IndianRupee} label="Revenue" value={`₹${stats.revenue || 0}`} tone="#0EA5A0" testid="stat-revenue" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats.low_stock || 0} tone="#EF4444" testid="stat-lowstock" />
      </div>

      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "inventory"} onClick={() => setTab("inventory")} testid="tab-inventory">Inventory ({meds.length})</TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")} testid="tab-orders">Orders ({orders.length})</TabBtn>
      </div>

      {tab === "inventory" ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-testid="inventory-table">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F5] text-[#4A5E55]">
              <tr><Th>Medicine</Th><Th>Category</Th><Th>Price</Th><Th>Stock</Th><Th>Rx</Th><Th></Th></tr>
            </thead>
            <tbody>
              {meds.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-10">No medicines yet. Add your first product.</td></tr>}
              {meds.map((m) => (
                <tr key={m.id} className="border-t border-slate-100" data-testid={`med-row-${m.id}`}>
                  <td className="px-5 py-3 font-medium text-[#0F1C17]">{m.name}</td>
                  <td className="px-5 py-3 text-[#4A5E55]">{m.category}</td>
                  <td className="px-5 py-3">₹{m.price}</td>
                  <td className="px-5 py-3"><span className={m.stock < 10 ? "text-red-500 font-semibold" : ""}>{m.stock}</span></td>
                  <td className="px-5 py-3">{m.requires_prescription ? "Yes" : "No"}</td>
                  <td className="px-5 py-3 text-right">
                    <button data-testid={`edit-${m.id}`} onClick={() => setModal(m)} className="p-2 rounded-lg hover:bg-slate-100 text-[#2C5545]"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`del-${m.id}`} onClick={() => del(m.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4" data-testid="orders-list">
          {orders.length === 0 && <p className="text-slate-400 text-center py-10">No orders yet.</p>}
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid={`order-${o.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#0F1C17]">{o.user_name} • ₹{o.total}</p>
                  <p className="text-xs text-[#4A5E55]">{o.address} • {new Date(o.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColor[o.status] || "bg-slate-100 text-slate-600"}`}>{o.status.replace("_", " ")}</span>
              </div>
              <p className="text-sm text-[#4A5E55] mt-2">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
              {o.status === "placed" && (
                <div className="flex gap-2 mt-3">
                  <button data-testid={`accept-${o.id}`} onClick={() => advance(o.id, "accepted")} className="bg-[#2C5545] text-white rounded-full px-4 py-2 text-sm flex items-center gap-1.5 hover:bg-[#234437] transition-colors"><Check className="h-4 w-4" /> Accept</button>
                  <button data-testid={`reject-${o.id}`} onClick={() => advance(o.id, "rejected")} className="bg-white border border-red-200 text-red-500 rounded-full px-4 py-2 text-sm flex items-center gap-1.5 hover:bg-red-50 transition-colors"><X className="h-4 w-4" /> Reject</button>
                </div>
              )}
              {o.status === "accepted" && (
                <button data-testid={`ready-${o.id}`} onClick={() => advance(o.id, "ready")} className="mt-3 bg-[#E88D67] text-white rounded-full px-4 py-2 text-sm hover:bg-[#d97a54] transition-colors">Mark Ready for Pickup</button>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && <MedicineModal med={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </DashboardLayout>
  );
}

function MedicineModal({ med, onClose, onSaved }) {
  const [f, setF] = useState(med || { name: "", category: "General", description: "", price: "", stock: "", requires_prescription: false });
  const [loading, setLoading] = useState(false);
  const save = async () => {
    if (!f.name || f.price === "") { toast.error("Name & price required"); return; }
    setLoading(true);
    const payload = { ...f, price: parseFloat(f.price), stock: parseInt(f.stock || 0, 10) };
    try {
      if (med) await api.put(`/pharmacy/medicines/${med.id}`, payload);
      else await api.post("/pharmacy/medicines", payload);
      toast.success(med ? "Updated" : "Medicine added");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="medicine-modal">
        <h3 className="font-display text-xl font-semibold text-[#0F1C17] mb-4">{med ? "Edit" : "Add"} Medicine</h3>
        <div className="space-y-3">
          <Inp label="Name" testid="med-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Inp label="Category" testid="med-category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Inp label="Description" testid="med-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Price (₹)" type="number" testid="med-price" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            <Inp label="Stock" type="number" testid="med-stock" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#4A5E55]">
            <input type="checkbox" data-testid="med-rx" checked={f.requires_prescription} onChange={(e) => setF({ ...f, requires_prescription: e.target.checked })} className="h-4 w-4 accent-[#2C5545]" />
            Requires prescription
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm text-[#4A5E55] hover:bg-slate-50 transition-colors">Cancel</button>
          <button data-testid="med-save-btn" onClick={save} disabled={loading} className="flex-1 bg-[#2C5545] text-white rounded-full py-2.5 text-sm font-medium hover:bg-[#234437] transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children }) => <th className="px-5 py-3 text-left font-medium">{children}</th>;
const TabBtn = ({ active, children, testid, ...p }) => (
  <button data-testid={testid} {...p} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? "bg-[#2C5545] text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{children}</button>
);
function Inp({ label, testid, type = "text", ...props }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#4A5E55]">{label}</label>
      <input data-testid={testid} type={type} {...props} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#2C5545] transition" />
    </div>
  );
}
