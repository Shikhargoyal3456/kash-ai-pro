import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, ShoppingCart, Plus, Minus, Trash2, Package, MapPin, Loader2, Pill, X, FileUp } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";

const statusSteps = ["placed", "accepted", "ready", "picked_up", "in_transit", "delivered"];
const statusLabel = { placed: "Placed", accepted: "Confirmed", ready: "Packed", picked_up: "Picked Up", in_transit: "On the way", delivered: "Delivered", rejected: "Rejected" };
const MED_IMG = "https://images.unsplash.com/photo-1734607404574-df50e1839d6d?crop=entropy&cs=srgb&fm=jpg&w=400&q=70";

export default function UserDashboard() {
  const [meds, setMeds] = useState([]);
  const [cats, setCats] = useState(["All"]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("shop");
  const [showCart, setShowCart] = useState(false);
  const [address, setAddress] = useState("");
  const [rxNote, setRxNote] = useState("");
  const [placing, setPlacing] = useState(false);

  const loadMeds = async () => {
    try {
      const { data } = await api.get("/user/medicines", { params: { search, category: cat } });
      setMeds(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const loadOrders = async () => {
    try { const { data } = await api.get("/user/orders"); setOrders(data); } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { api.get("/user/categories").then((r) => setCats(r.data)).catch(() => {}); loadOrders(); }, []);
  useEffect(() => { const t = setTimeout(loadMeds, 250); return () => clearTimeout(t); }, [search, cat]);

  const add = (m) => {
    setCart((c) => {
      const ex = c.find((i) => i.medicine_id === m.id);
      if (ex) return c.map((i) => i.medicine_id === m.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { medicine_id: m.id, name: m.name, price: m.price, qty: 1 }];
    });
    toast.success(`${m.name} added to cart`);
  };
  const changeQty = (id, d) => setCart((c) => c.map((i) => i.medicine_id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i));
  const removeItem = (id) => setCart((c) => c.filter((i) => i.medicine_id !== id));
  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  const checkout = async () => {
    if (!address.trim()) { toast.error("Enter delivery address"); return; }
    setPlacing(true);
    try {
      await api.post("/user/orders", { items: cart, address: address.trim(), prescription_note: rxNote.trim() || null });
      toast.success("Order placed successfully!");
      setCart([]); setShowCart(false); setAddress(""); setRxNote(""); setTab("orders"); loadOrders(); loadMeds();
    } catch (e) { toast.error(formatApiError(e)); } finally { setPlacing(false); }
  };

  return (
    <DashboardLayout title="Ayurvedic Pharmacy" subtitle="Browse authentic remedies & track your orders"
      actions={
        <button data-testid="open-cart-btn" onClick={() => setShowCart(true)} className="relative bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 text-sm font-medium transition-colors shadow-md flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" /> Cart
          {count > 0 && <span data-testid="cart-count" className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-[#E88D67] text-xs grid place-items-center">{count}</span>}
        </button>
      }>
      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "shop"} onClick={() => setTab("shop")} testid="tab-shop">Browse</TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")} testid="tab-my-orders">My Orders ({orders.length})</TabBtn>
      </div>

      {tab === "shop" ? (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input data-testid="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines…"
                className="w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 py-2.5 outline-none focus:border-[#2C5545] transition" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {cats.map((c) => (
                <button key={c} data-testid={`cat-${c}`} onClick={() => setCat(c)} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${cat === c ? "bg-[#2C5545] text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" data-testid="medicine-grid">
            {meds.length === 0 && <p className="text-slate-400 col-span-full text-center py-10">No medicines found.</p>}
            {meds.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden group hover:shadow-[0_16px_48px_rgba(44,85,69,0.12)] transition-shadow" data-testid={`med-card-${m.id}`}>
                <div className="h-36 bg-[#F4F7F5] overflow-hidden">
                  <img src={m.image || MED_IMG} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-[#E88D67] font-semibold">{m.category}</span>
                    {m.requires_prescription && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Rx</span>}
                  </div>
                  <h3 className="font-display font-semibold text-[#0F1C17] mt-1 leading-snug">{m.name}</h3>
                  <p className="text-xs text-[#4A5E55] mt-1 line-clamp-2 h-8">{m.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-display font-bold text-lg text-[#2C5545]">₹{m.price}</span>
                    <button data-testid={`add-${m.id}`} onClick={() => add(m)} className="bg-[#2C5545] text-white hover:bg-[#234437] rounded-full h-9 w-9 grid place-items-center transition-colors"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4" data-testid="my-orders-list">
          {orders.length === 0 && <p className="text-slate-400 text-center py-10">No orders yet. Browse medicines to place your first order.</p>}
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid={`my-order-${o.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#0F1C17]">{o.store_name} • ₹{o.total}</p>
                  <p className="text-xs text-[#4A5E55]">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                </div>
                <span className="text-xs px-3 py-1 rounded-full font-medium bg-[#2C5545]/10 text-[#2C5545]">{statusLabel[o.status]}</span>
              </div>
              {o.status !== "rejected" && (
                <div className="flex items-center gap-1 mt-4">
                  {statusSteps.map((s, i) => {
                    const done = statusSteps.indexOf(o.status) >= i;
                    return (
                      <div key={s} className="flex-1 flex items-center gap-1">
                        <div className={`h-2 flex-1 rounded-full ${done ? "bg-[#2C5545]" : "bg-slate-200"}`} />
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-[#4A5E55] mt-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.address}{o.delivery_boy_name ? ` • Rider: ${o.delivery_boy_name}` : ""}</p>
            </div>
          ))}
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex justify-end" onClick={() => setShowCart(false)}>
          <div className="bg-white w-full max-w-md h-full p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="cart-drawer">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-[#2C5545]" /> Your Cart</h3>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><Pill className="h-10 w-10 mx-auto mb-3 opacity-40" />Cart is empty</div>
            ) : (
              <>
                <div className="space-y-3">
                  {cart.map((i) => (
                    <div key={i.medicine_id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3" data-testid={`cart-item-${i.medicine_id}`}>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-[#0F1C17]">{i.name}</p>
                        <p className="text-xs text-[#4A5E55]">₹{i.price} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button data-testid={`qty-dec-${i.medicine_id}`} onClick={() => changeQty(i.medicine_id, -1)} className="h-7 w-7 rounded-full bg-slate-100 grid place-items-center hover:bg-slate-200"><Minus className="h-3.5 w-3.5" /></button>
                        <span data-testid={`qty-${i.medicine_id}`} className="w-5 text-center text-sm font-medium">{i.qty}</span>
                        <button data-testid={`qty-inc-${i.medicine_id}`} onClick={() => changeQty(i.medicine_id, 1)} className="h-7 w-7 rounded-full bg-slate-100 grid place-items-center hover:bg-slate-200"><Plus className="h-3.5 w-3.5" /></button>
                        <button data-testid={`cart-remove-${i.medicine_id}`} onClick={() => removeItem(i.medicine_id)} className="h-7 w-7 rounded-full grid place-items-center text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#0F1C17]">Delivery address</label>
                    <input data-testid="cart-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, street, city" className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545]" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#0F1C17] flex items-center gap-1.5"><FileUp className="h-4 w-4" /> Prescription note (optional)</label>
                    <input data-testid="cart-rx" value={rxNote} onChange={(e) => setRxNote(e.target.value)} placeholder="Doctor / prescription reference" className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545]" />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[#4A5E55]">Total</span>
                    <span className="font-display text-2xl font-bold text-[#2C5545]" data-testid="cart-total">₹{total.toFixed(2)}</span>
                  </div>
                  <button data-testid="checkout-btn" onClick={checkout} disabled={placing} className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full py-3.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                    {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} Place Order
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

const TabBtn = ({ active, children, testid, ...p }) => (
  <button data-testid={testid} {...p} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? "bg-[#2C5545] text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{children}</button>
);
