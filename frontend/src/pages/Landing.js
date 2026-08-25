import { Link, useNavigate } from "react-router-dom";
import { Leaf, Mic, Store, Bike, ShoppingBag, ShieldCheck, ArrowRight, Sparkles, Stethoscope, HeartPulse } from "lucide-react";
import { useAuth, roleHome } from "@/context/AuthContext";

const roles = [
  { key: "doctor", icon: Stethoscope, title: "Ayurvedic Doctor", desc: "Voice-first consultations, Samhita analysis & digital prescriptions.", tone: "#2C5545" },
  { key: "pharmacy", icon: Store, title: "Pharmacy Store", desc: "List medicines, manage inventory & fulfil orders in real time.", tone: "#E88D67" },
  { key: "delivery", icon: Bike, title: "Delivery Partner", desc: "Pick up nearby orders, update status & track your earnings.", tone: "#0EA5A0" },
  { key: "user", icon: ShoppingBag, title: "Customer", desc: "Browse authentic Ayurvedic medicines & track every delivery.", tone: "#B45309" },
];

const HERO = "https://images.pexels.com/photos/7615621/pexels-photo-7615621.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const go = (role) => navigate(user ? roleHome(user.role) : `/register?role=${role}`);

  return (
    <div className="min-h-screen bg-[#F4F7F5] overflow-x-hidden">
      {/* Nav */}
      <header className="glass fixed top-0 w-full z-50 border-b border-white/50">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#2C5545] grid place-items-center">
              <Leaf className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <span className="font-display font-bold text-lg">Kash AI Pro</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to={roleHome(user.role)} data-testid="nav-dashboard-btn" className="bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 text-sm font-medium transition-colors">
                My Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" data-testid="nav-login-btn" className="text-[#2C5545] hover:bg-white/70 rounded-full px-5 py-2.5 text-sm font-medium transition-colors">Log in</Link>
                <Link to="/register" data-testid="nav-signup-btn" className="bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-5 py-2.5 text-sm font-medium transition-colors shadow-md">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 sm:pt-36 pb-16 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 bg-white/70 border border-white/60 rounded-full px-4 py-1.5 text-sm text-[#2C5545] mb-6">
              <Sparkles className="h-4 w-4" /> Voice-first AI for Ayurveda
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-[#0F1C17] leading-[1.05]">
              Ancient healing,<br /><span className="text-[#2C5545]">powered by AI.</span>
            </h1>
            <p className="text-lg text-[#4A5E55] mt-6 max-w-md leading-relaxed">
              Kash AI Pro unites Ayurvedic doctors, pharmacies and delivery partners on one platform — speak your diagnosis, order authentic remedies, track every delivery.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <button onClick={() => go("user")} data-testid="hero-shop-btn" className="bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-7 py-3.5 font-medium transition-colors shadow-md flex items-center gap-2">
                Browse Medicines <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => go("doctor")} data-testid="hero-doctor-btn" className="bg-white/60 border border-white/60 text-[#2C5545] hover:bg-white rounded-full px-7 py-3.5 font-medium transition-colors flex items-center gap-2">
                <Mic className="h-4 w-4" /> For Doctors
              </button>
            </div>
            <div className="flex items-center gap-6 mt-10 text-sm text-[#4A5E55]">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#2C5545]" /> Secure & role-based</span>
              <span className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-[#E88D67]" /> Trusted remedies</span>
            </div>
          </div>
          <div className="lg:col-span-6 relative">
            <div className="glass rounded-[2rem] p-3 rotate-1">
              <img src={HERO} alt="Ayurvedic herbs and wellness" className="rounded-[1.6rem] w-full h-[420px] object-cover" />
            </div>
            <div className="glass absolute -bottom-5 -left-3 rounded-2xl px-5 py-4 -rotate-2 hidden sm:block">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#E88D67] grid place-items-center mic-pulse"><Mic className="h-5 w-5 text-white" /></div>
                <div>
                  <p className="text-xs text-[#4A5E55]">Voice consultation</p>
                  <p className="font-display font-semibold text-[#0F1C17] text-sm">Speak in Hindi →</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="px-5 sm:px-8 pb-24">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-[#4A5E55] uppercase tracking-[0.2em] mb-2">Choose your role</p>
          <h2 className="font-display text-2xl sm:text-4xl font-semibold tracking-tight text-[#0F1C17] mb-10 max-w-lg">One platform, built for everyone in the chain.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => go(r.key)}
                data-testid={`role-card-${r.key}`}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-[0_16px_48px_rgba(44,85,69,0.12)] hover:-translate-y-1 transition-all duration-300 p-6 group"
              >
                <div className="h-12 w-12 rounded-xl grid place-items-center mb-5" style={{ background: `${r.tone}14` }}>
                  <r.icon className="h-6 w-6" style={{ color: r.tone }} strokeWidth={1.8} />
                </div>
                <h3 className="font-display text-xl font-semibold text-[#0F1C17]">{r.title}</h3>
                <p className="text-sm text-[#4A5E55] mt-2 leading-relaxed">{r.desc}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2C5545] mt-4 group-hover:gap-3 transition-all">
                  Continue <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/60 py-8 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-sm text-[#4A5E55]">
          <span className="flex items-center gap-2"><Leaf className="h-4 w-4 text-[#2C5545]" /> Kash AI Pro</span>
          <span>© 2026 Kash AI Pro — Healthcare & e-Pharmacy</span>
        </div>
      </footer>
    </div>
  );
}
