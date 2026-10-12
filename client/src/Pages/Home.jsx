import { useEffect } from "react";
import { useDispatch } from "react-redux";
import Hero from "../Components/Landing/Hero";
import QuickRoutes from "../Components/Landing/QuickRoutes";
import { Stats, HowItWorks, PopularRoutes, Features, Faq, Developer, CtaBand } from "../Components/Landing/Sections";
import { removeall } from "../Redux/ticket/ticket.action";

export default function Home() {
  const dispatch = useDispatch();
  useEffect(() => {
    document.title = "RaahiGo — Intercity bus travel, made calm";
    dispatch(removeall());
  }, [dispatch]);

  return (
    <>
      <Hero />
      <Stats />
      <QuickRoutes />
      <HowItWorks />
      <PopularRoutes />
      <Features />
      <Faq />
      <Developer />
      <CtaBand />
    </>
  );
}
