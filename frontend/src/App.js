import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth, roleHome } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import DoctorDashboard from "@/pages/DoctorDashboard";
import PharmacyDashboard from "@/pages/PharmacyDashboard";
import DeliveryDashboard from "@/pages/DeliveryDashboard";
import UserDashboard from "@/pages/UserDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading || user === null)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#2C5545]">
        <div className="animate-pulse font-display text-lg">Loading Kash AI…</div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function App() {
  useEffect(() => {
    document.title = "Kash AI — Ayurvedic Care & e-Pharmacy";
  }, []);
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/doctor" element={<Protected role="doctor"><DoctorDashboard /></Protected>} />
            <Route path="/pharmacy" element={<Protected role="pharmacy"><PharmacyDashboard /></Protected>} />
            <Route path="/delivery" element={<Protected role="delivery"><DeliveryDashboard /></Protected>} />
            <Route path="/shop" element={<Protected role="user"><UserDashboard /></Protected>} />
            <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="/payment/success" element={<Protected><PaymentSuccess /></Protected>} />
            <Route path="/payment/cancel" element={<Protected><PaymentCancel /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
