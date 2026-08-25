import { useEffect, useRef, useState } from "react";
import { Bell, Check, Package, CircleCheck, AlertTriangle, Info } from "lucide-react";
import api from "@/lib/api";

const iconFor = { order: Package, success: CircleCheck, warning: AlertTriangle, info: Info };
const toneFor = { order: "#2C5545", success: "#0EA5A0", warning: "#EF4444", info: "#4A5E55" };

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const seen = useRef(new Set());
  const first = useRef(true);
  const ref = useRef();

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      if (!first.current) {
        const fresh = data.filter((n) => !n.read && !seen.current.has(n.id));
        if (fresh.length) window.dispatchEvent(new CustomEvent("kash-toast", { detail: fresh[0].message }));
      }
      data.forEach((n) => seen.current.add(n.id));
      first.current = false;
      setItems(data);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => { clearInterval(t); document.removeEventListener("mousedown", onDoc); };
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    await api.put("/notifications/read-all").catch(() => {});
    setItems((s) => s.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button data-testid="notif-bell" onClick={() => { setOpen((o) => !o); }}
        className="relative h-9 w-9 rounded-full bg-white/60 hover:bg-white grid place-items-center text-[#2C5545] transition-colors">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span data-testid="notif-count" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#E88D67] text-white text-[10px] grid place-items-center">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-[60] overflow-hidden" data-testid="notif-dropdown">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-display font-semibold text-[#0F1C17]">Notifications</span>
            {unread > 0 && <button data-testid="notif-mark-all" onClick={markAll} className="text-xs text-[#2C5545] font-medium hover:underline flex items-center gap-1"><Check className="h-3.5 w-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No notifications yet.</p>}
            {items.map((n) => {
              const Icon = iconFor[n.kind] || Info;
              return (
                <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-slate-50 ${n.read ? "opacity-60" : "bg-[#F4F7F5]/50"}`} data-testid={`notif-item-${n.id}`}>
                  <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${toneFor[n.kind] || "#4A5E55"}14` }}>
                    <Icon className="h-4 w-4" style={{ color: toneFor[n.kind] || "#4A5E55" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-[#0F1C17] leading-snug">{n.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
