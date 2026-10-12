import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "../Components/Layout/Navbar";
import Footer from "../Components/Layout/Footer";
import { Private } from "./Private";
import { load } from "../lib/routes";
import ErrorBoundary from "../Components/Layout/ErrorBoundary";
import Home from "../Pages/Home";
import SelectBus from "../Pages/SelectBus";
import Bookseat from "../Pages/Bookseat";
import Details from "../Pages/Details";
import Signin from "../Pages/Signin";
import Signup from "../Pages/Signup";
import Myticket from "../Pages/Myticket";
import BookingSuccess from "../Pages/BookingSuccess";
import Profile from "../Pages/Profile";


const BoardingPass = lazy(() => load("pass"));
const VerifyTicket = lazy(() => load("verify"));
const OperatorDashboard = lazy(() => load("operator"));
const AdminDashboard = lazy(() => load("admin"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Braces matter: scrollTo() returns a Promise in newer Chromium/Edge, and an effect that returns
    // anything is treated by React as its cleanup function — "destroy is not a function" crashed the whole app.
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function Fallback() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", color: "var(--brand)" }}>
      <div className="spinner" style={{ width: 30, height: 30, borderWidth: 3 }} />
    </div>
  );
}

function NotFound() {
  return (
    <div className="container" style={{ padding: "96px 0", textAlign: "center" }}>
      <p className="mono" style={{ color: "var(--accent)", fontSize: 14, fontWeight: 700 }}>ERROR 404</p>
      <h1 style={{ fontSize: "var(--fs-hero)", margin: "12px 0" }}>This stop isn't on the map.</h1>
      <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
        The page you're looking for has moved or never existed. Let's get you back on the route.
      </p>
      <Link to="/" className="btn btn-primary btn-lg">Back to search</Link>
    </div>
  );
}

const guard = (el) => <Private>{el}</Private>;

export default function AllRoutes() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <main id="main">
        <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/signin" element={<Signin />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/selectbus" element={<SelectBus />} />
            <Route path="/verify/:orderId" element={<VerifyTicket />} />
            <Route path="/bookticket/:id" element={guard(<Bookseat />)} />
            <Route path="/details/:id" element={guard(<Details />)} />
            <Route path="/booked/:orderId" element={guard(<BookingSuccess />)} />
            <Route path="/pass/:orderId" element={guard(<BoardingPass />)} />
            <Route path="/myticket" element={guard(<Myticket />)} />
            <Route path="/profile" element={guard(<Profile />)} />
            <Route path="/operator" element={guard(<OperatorDashboard />)} />
            <Route path="/admin" element={guard(<AdminDashboard />)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
