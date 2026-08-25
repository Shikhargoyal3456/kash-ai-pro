import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, ShoppingBag, IndianRupee, Package, Ban, CheckCircle2, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import DashboardLayout, { StatCard } from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";

const roleColor = { doctor: "#2C5545", pharmacy: "#E88D67", delivery: "#0EA5A0", user: "#B45309", admin: "#7C3AED" };
const statusColor = {
  placed: "bg-amber-100 text-amber-700", accepted: "bg-blue-100 text-blue-700", ready: "bg-indigo-100 text-indigo-700",
  picked_up: "bg-purple-100 text-purple-700", in_transit: "bg-cyan-100 text-cyan-700", delivered: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
};

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [topMeds, setTopMeds] = useState([]);
  const [tab, setTab] = useState("overview");

  const load = async () => {
    try {
      const [dash, u, o, rev, top] = await Promise.all([api.get("/admin/dashboard"), api.get("/admin/users"), api.get("/admin/orders"), api.get("/admin/revenue"), api.get("/admin/top-medicines")]);
      setD(dash.data); setUsers(u.data); setOrders(o.data); setRevenue(rev.data); setTopMeds(top.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const toggleBlock = async (u) => {
    try { await api.put(`/admin/users/${u.id}/status`, { is_blocked: !u.is_blocked }); toast.success(u.is_blocked ? "User unblocked" : "User blocked"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const verify = async (u) => {
    try { await api.put(`/admin/users/${u.id}/status`, { is_verified: true }); toast.success("User verified"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (!d) return <DashboardLayout title="Admin Dashboard"><p className="text-slate-400">Loading…</p></DashboardLayout>;

  const roleData = Object.entries(d.by_role).map(([k, v]) => ({ name: k, value: v }));
  const statusData = Object.entries(d.order_status).map(([k, v]) => ({ name: k.replace("_", " "), value: v }));

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Platform-wide control, users, orders & analytics">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard icon={Users} label="Total Users" value={d.users} testid="stat-users" />
        <StatCard icon={ShoppingBag} label="Orders" value={d.orders} tone="#E88D67" testid="stat-orders" />
        <StatCard icon={IndianRupee} label="Revenue" value={`₹${d.revenue}`} tone="#0EA5A0" testid="stat-revenue" />
        <StatCard icon={Package} label="Medicines" value={d.medicines} tone="#B45309" testid="stat-medicines" />
      </div>

      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} testid="tab-overview">Analytics</TabBtn>
        <TabBtn active={tab === "users"} onClick={() => setTab("users")} testid="tab-users">Users ({users.length})</TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")} testid="tab-orders">Orders ({orders.length})</TabBtn>
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" data-testid="revenue-trend-chart">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-[#0F1C17]">Revenue Trend — last 14 days</h3>
              <span className="text-sm text-[#4A5E55]">Total paid: ₹{revenue.reduce((s, r) => s + r.revenue, 0).toFixed(2)}</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenue} margin={{ left: -10, right: 10 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2C5545" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2C5545" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#4A5E55" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#4A5E55" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, n) => n === "revenue" ? [`₹${v}`, "Revenue"] : [v, "Orders"]} />
                <Area type="monotone" dataKey="revenue" stroke="#2C5545" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" data-testid="top-medicines-chart">
            <h3 className="font-display font-semibold text-[#0F1C17] mb-4">Top-Selling Medicines</h3>
            {topMeds.length === 0 ? <p className="text-slate-400 text-center py-20">No paid sales yet.</p> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topMeds} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#4A5E55" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: "#4A5E55" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#F4F7F5" }} formatter={(v, n) => n === "qty" ? [v, "Units sold"] : [`₹${v}`, "Revenue"]} />
                  <Bar dataKey="qty" radius={[0, 8, 8, 0]} fill="#E88D67" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-display font-semibold text-[#0F1C17] mb-4">Users by Role</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={roleData}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#4A5E55" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4A5E55" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#F4F7F5" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {roleData.map((e) => <Cell key={e.name} fill={roleColor[e.name] || "#2C5545"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-display font-semibold text-[#0F1C17] mb-4">Orders by Status</h3>
            {statusData.length === 0 ? <p className="text-slate-400 text-center py-20">No orders yet.</p> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name} (${e.value})`}>
                    {statusData.map((e, i) => <Cell key={i} fill={["#2C5545", "#E88D67", "#0EA5A0", "#B45309", "#7C3AED", "#34D399", "#EF4444"][i % 7]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === "users" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto" data-testid="users-table">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F5] text-[#4A5E55]"><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100" data-testid={`user-row-${u.id}`}>
                  <td className="px-5 py-3 font-medium text-[#0F1C17]">{u.name}</td>
                  <td className="px-5 py-3 text-[#4A5E55]">{u.email}</td>
                  <td className="px-5 py-3"><span className="text-xs px-2.5 py-1 rounded-full font-medium capitalize" style={{ background: `${roleColor[u.role]}18`, color: roleColor[u.role] }}>{u.role}</span></td>
                  <td className="px-5 py-3">{u.is_blocked ? <span className="text-red-500 text-xs font-medium">Blocked</span> : <span className="text-green-600 text-xs font-medium flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{u.is_verified ? "Verified" : "Active"}</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {!u.is_verified && u.role !== "admin" && <button data-testid={`verify-${u.id}`} onClick={() => verify(u)} className="text-xs px-3 py-1.5 rounded-full bg-[#2C5545]/10 text-[#2C5545] hover:bg-[#2C5545]/20 mr-2 transition-colors inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Verify</button>}
                    {u.role !== "admin" && <button data-testid={`block-${u.id}`} onClick={() => toggleBlock(u)} className={`text-xs px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1 ${u.is_blocked ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"}`}><Ban className="h-3.5 w-3.5" />{u.is_blocked ? "Unblock" : "Block"}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "orders" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto" data-testid="admin-orders-table">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F5] text-[#4A5E55]"><tr><Th>Customer</Th><Th>Store</Th><Th>Total</Th><Th>Status</Th><Th>Date</Th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">No orders yet.</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-[#0F1C17]">{o.user_name}</td>
                  <td className="px-5 py-3 text-[#4A5E55]">{o.store_name}</td>
                  <td className="px-5 py-3">₹{o.total}</td>
                  <td className="px-5 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[o.status] || "bg-slate-100 text-slate-600"}`}>{o.status.replace("_", " ")}</span></td>
                  <td className="px-5 py-3 text-[#4A5E55]">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}

const Th = ({ children }) => <th className="px-5 py-3 text-left font-medium">{children}</th>;
const TabBtn = ({ active, children, testid, ...p }) => (
  <button data-testid={testid} {...p} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? "bg-[#2C5545] text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{children}</button>
);
