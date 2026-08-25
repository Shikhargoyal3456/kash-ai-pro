import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function pin(color, label) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);display:grid;place-items:center">
      <span style="transform:rotate(45deg);color:#fff;font-size:13px;font-weight:700">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

export default function LiveMap({ store, dest, rider }) {
  const el = useRef(null);
  const map = useRef(null);
  const markers = useRef({});

  useEffect(() => {
    if (!el.current || map.current) return;
    const c = rider || dest || store || { lat: 18.5204, lng: 73.8567 };
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; markers.current = {}; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const upsert = (key, loc, icon, popup) => {
      if (!loc || loc.lat == null) return;
      if (markers.current[key]) markers.current[key].setLatLng([loc.lat, loc.lng]);
      else markers.current[key] = L.marker([loc.lat, loc.lng], { icon }).addTo(m).bindPopup(popup);
    };
    upsert("store", store, pin("#E88D67", "S"), "Pharmacy");
    upsert("dest", dest, pin("#2C5545", "H"), "Your address");
    upsert("rider", rider, pin("#0EA5A0", "R"), "Rider");
    const pts = [store, dest, rider].filter((p) => p && p.lat != null).map((p) => [p.lat, p.lng]);
    if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) m.setView(pts[0], 14);
  }, [store, dest, rider]);

  return <div ref={el} data-testid="live-map" style={{ height: 320, width: "100%", borderRadius: 16, overflow: "hidden", zIndex: 0 }} />;
}
