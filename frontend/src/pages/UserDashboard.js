import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Search, ShoppingCart, Plus, Minus, Trash2, Package, MapPin, Loader2, Pill, X, FileUp, CreditCard, CheckCircle2, Navigation, Star } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import LiveMap from "@/components/LiveMap";
import StarRating from "@/components/StarRating";
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
  const [rxImage, setRxImage] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [trackOrder, setTrackOrder] = useState(null);
  const [rateOrder, setRateOrder] = useState(null);

  const loadMeds = async () => {
    try { const { data } = await api.get("/user/medicines", { params: { search, category: cat } }); setMeds(data); }
    catch (e) { toast.error(formatApiError(e)); }
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
      return [...c, { medicine_id: m.id, name: m.name, price: m.price, qty: 1, rx: m.requires_prescription }];
    });
    toast.success(`${m.name} added to cart`);
  };
  const changeQty = (id, d) => setCart((c) => c.map((i) => i.medicine_id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i));
  const removeItem = (id) => setCart((c) => c.filter((i) => i.medicine_id !== id));
  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const needsRx = cart.some((i) => i.rx);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast.error("Image must be under 4MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setRxImage(reader.result);
    reader.readAsDataURL(f);
  };

  const checkout = async () => {
    if (!address.trim()) { toast.error("Enter delivery address"); return; }
    if (needsRx && !rxImage && !rxNote.trim()) { toast.error("Prescription required for Rx items"); return; }
    setPlacing(true);
    try {
      const { data: order } = await api.post("/user/orders", {
        items: cart.map(({ medicine_id, name, price, qty }) => ({ medicine_id, name, price, qty })),
        address: address.trim(), prescription_note: rxNote.trim() || null, prescription_image: rxImage || null,
      });
      const { data } = await api.post("/payments/checkout", { order_id: order.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(formatApiError(e)); setPlacing(false); }
  };

  const payNow = async (o) => {
    try { const { data } = await api.post("/payments/checkout", { order_id: o.id, origin_url: window.location.origin }); window.location.href = data.checkout_url; }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DashboardLayout title="Ayurvedic Pharmacy" subtitle="Browse authentic remedies, pay securely & track your delivery"
      actions={
        <button data-testid="open-cart-btn" onClick={() => setShowCart(true)} className="relative bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 text-sm font-medium transition-colors shadow-md flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" /> Cart
          {count > 0 && <span data-testid="cart-count" className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-[#E88D67] text-xs grid place-items-center">{count}</span>}
        </button>
      }>
      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "shop"} onClick={() => setTab("shop")} testid="tab-shop">Browse</TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => { setTab("orders"); loadOrders(); }} testid="tab-my-orders">My Orders ({orders.length})</TabBtn>
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
                <div className="flex items-center gap-2">
                  {o.payment_status === "paid"
                    ? <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-1" data-testid={`paid-badge-${o.id}`}><CheckCircle2 className="h-3.5 w-3.5" />Paid</span>
                    : <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700">Payment pending</span>}
                  <span className="text-xs px-3 py-1 rounded-full font-medium bg-[#2C5545]/10 text-[#2C5545]">{statusLabel[o.status]}</span>
                </div>
              </div>
              {o.status !== "rejected" && o.payment_status === "paid" && (
                <div className="flex items-center gap-1 mt-4">
                  {statusSteps.map((s, i) => (
                    <div key={s} className="flex-1"><div className={`h-2 rounded-full ${statusSteps.indexOf(o.status) >= i ? "bg-[#2C5545]" : "bg-slate-200"}`} /></div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <p className="text-[11px] text-[#4A5E55] flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.address}{o.delivery_boy_name ? ` • Rider: ${o.delivery_boy_name}` : ""}</p>
                <div className="flex gap-2">
                  {o.payment_status !== "paid" && o.status === "placed" && (
                    <button data-testid={`pay-now-${o.id}`} onClick={() => payNow(o)} className="bg-[#E88D67] text-white rounded-full px-4 py-1.5 text-xs font-medium hover:bg-[#d97a54] transition-colors flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Pay Now</button>
                  )}
                  {["picked_up", "in_transit"].includes(o.status) && (
                    <button data-testid={`track-map-${o.id}`} onClick={() => setTrackOrder(o)} className="bg-[#0EA5A0] text-white rounded-full px-4 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5" /> Track on Map</button>
                  )}
                  {o.status === "delivered" && !o.rated && (
                    <button data-testid={`rate-${o.id}`} onClick={() => setRateOrder(o)} className="bg-[#E88D67] text-white rounded-full px-4 py-1.5 text-xs font-medium hover:bg-[#d97a54] transition-colors flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Rate</button>
                  )}
                  {o.rated && (
                    <span className="text-xs text-[#E88D67] flex items-center gap-1 font-medium" data-testid={`rated-${o.id}`}><Star className="h-3.5 w-3.5 fill-[#E88D67]" />{o.rider_rating}★ rider · {o.store_rating}★ store</span>
                  )}
                </div>
              </div>
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
                        <p className="font-medium text-sm text-[#0F1C17]">{i.name}{i.rx && <span className="text-[10px] ml-1.5 bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">Rx</span>}</p>
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
                    <label className="text-sm font-medium text-[#0F1C17] flex items-center gap-1.5"><FileUp className="h-4 w-4" /> Prescription {needsRx ? <span className="text-red-500">*required</span> : "(optional)"}</label>
                    <input data-testid="cart-rx-file" type="file" accept="image/*" onChange={onFile} className="mt-1.5 w-full text-sm text-[#4A5E55] file:mr-3 file:rounded-full file:border-0 file:bg-[#2C5545]/10 file:text-[#2C5545] file:px-4 file:py-2 file:text-sm file:font-medium" />
                    {rxImage && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={rxImage} alt="prescription" className="h-16 w-16 object-cover rounded-lg border border-slate-200" data-testid="rx-preview" />
                        <button onClick={() => setRxImage(null)} className="text-xs text-red-500 hover:underline">Remove</button>
                      </div>
                    )}
                    <input data-testid="cart-rx" value={rxNote} onChange={(e) => setRxNote(e.target.value)} placeholder="Or add a prescription reference note" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545]" />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[#4A5E55]">Total</span>
                    <span className="font-display text-2xl font-bold text-[#2C5545]" data-testid="cart-total">₹{total.toFixed(2)}</span>
                  </div>
                  <button data-testid="checkout-btn" onClick={checkout} disabled={placing} className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full py-3.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                    {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pay & Place Order
                  </button>
                  <p className="text-[11px] text-center text-slate-400">Secure card payment via Stripe. Test card 4242 4242 4242 4242.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {trackOrder && <TrackModal order={trackOrder} onClose={() => setTrackOrder(null)} />}
      {rateOrder && <RatingModal order={rateOrder} onClose={() => setRateOrder(null)} onDone={() => { setRateOrder(null); loadOrders(); }} />}
    </DashboardLayout>
  );
}

function RatingModal({ order, onClose, onDone }) {
  const [rider, setRider] = useState(5);
  const [store, setStore] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/user/orders/${order.id}/rate`, { rider_rating: rider, store_rating: store, comment: comment.trim() || null });
      toast.success("Thanks for your feedback!");
      onDone();
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()} data-testid="rating-modal">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2"><Star className="h-5 w-5 text-[#E88D67]" /> Rate your order</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-[#0F1C17] mb-2">Delivery rider{order.delivery_boy_name ? ` — ${order.delivery_boy_name}` : ""}</p>
            <StarRating value={rider} onChange={setRider} testid="rate-rider" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#0F1C17] mb-2">Pharmacy — {order.store_name}</p>
            <StarRating value={store} onChange={setStore} testid="rate-store" />
          </div>
          <textarea data-testid="rate-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Optional feedback…"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#2C5545] resize-none" />
          <button data-testid="rate-submit" onClick={submit} disabled={loading} className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full py-3 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Submit rating
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackModal({ order, onClose }) {
  const [o, setO] = useState(order);
  const ref = useRef();
  useEffect(() => {
    const poll = async () => {
      try { const { data } = await api.get(`/user/orders/${order.id}/track`); setO(data); } catch {}
    };
    poll();
    ref.current = setInterval(poll, 5000);
    return () => clearInterval(ref.current);
  }, [order.id]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()} data-testid="track-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2"><Navigation className="h-5 w-5 text-[#0EA5A0]" /> Live Delivery Tracking</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <LiveMap store={o.store_location} dest={o.dest_location} rider={o.rider_location} />
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-[#4A5E55]">{statusLabel[o.status]}{o.delivery_boy_name ? ` • ${o.delivery_boy_name}` : ""}</span>
          <span className="text-[#0EA5A0] font-medium">{o.rider_location ? "Rider location live" : "Waiting for rider location…"}</span>
        </div>
      </div>
    </div>
  );
}

const TabBtn = ({ active, children, testid, ...p }) => (
  <button data-testid={testid} {...p} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? "bg-[#2C5545] text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{children}</button>
);
