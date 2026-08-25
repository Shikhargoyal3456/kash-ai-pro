import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, Loader2 } from "lucide-react";
import { useAuth, roleHome } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

const demo = [
  { label: "Doctor", email: "doctor@kash.ai" },
  { label: "Pharmacy", email: "pharmacy@kash.ai" },
  { label: "Delivery", email: "delivery@kash.ai" },
  { label: "Customer", email: "user@kash.ai" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back, ${u.name}!`);
      navigate(roleHome(u.role));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (mail) => { setEmail(mail); setPassword("password123"); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative bg-[#2C5545]">
        <img src="https://images.pexels.com/photos/39192386/pexels-photo-39192386.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-2.5 w-fit">
            <div className="h-9 w-9 rounded-xl bg-white/20 grid place-items-center"><Leaf className="h-5 w-5" /></div>
            <span className="font-display font-bold text-lg">Kash AI Pro</span>
          </Link>
          <div>
            <h2 className="font-display text-4xl font-bold leading-tight">Ancient healing,<br />powered by AI.</h2>
            <p className="text-white/70 mt-4 max-w-sm">Sign in to consult, prescribe, sell or order authentic Ayurvedic remedies.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-xl bg-[#2C5545] grid place-items-center"><Leaf className="h-5 w-5 text-white" /></div>
            <span className="font-display font-bold text-lg">Kash AI Pro</span>
          </Link>
          <h1 className="font-display text-3xl font-bold text-[#0F1C17]">Welcome back</h1>
          <p className="text-[#4A5E55] mt-2">Log in to your Kash AI Pro account.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-[#0F1C17]">Email</label>
              <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#2C5545] focus:ring-2 focus:ring-[#2C5545]/15 transition" placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F1C17]">Password</label>
              <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#2C5545] focus:ring-2 focus:ring-[#2C5545]/15 transition" placeholder="••••••••" />
            </div>
            <button data-testid="login-submit" disabled={loading} className="w-full bg-[#2C5545] text-white hover:bg-[#234437] rounded-full px-6 py-3.5 font-medium transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Log in
            </button>
          </form>

          <div className="mt-6">
            <p className="text-xs text-[#4A5E55] mb-2">Quick demo login (password: password123)</p>
            <div className="flex flex-wrap gap-2">
              {demo.map((d) => (
                <button key={d.email} type="button" onClick={() => fillDemo(d.email)} data-testid={`demo-${d.label.toLowerCase()}`}
                  className="text-xs bg-white border border-slate-200 hover:border-[#2C5545] rounded-full px-3 py-1.5 text-[#2C5545] transition-colors">{d.label}</button>
              ))}
            </div>
          </div>

          <p className="text-sm text-[#4A5E55] mt-8">
            New here? <Link to="/register" className="text-[#2C5545] font-medium hover:underline" data-testid="to-register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
