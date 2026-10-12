import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { FiPrinter, FiCalendar, FiShare2, FiArrowLeft, FiAlertTriangle, FiCheck } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { authHeader } from "../lib/session";
import { downloadICS } from "../lib/calendar";
import { formatDate } from "../lib/format";
import { error, success } from "../Utils/notification";
import PassSheet from "../Components/Ticket/PassSheet";
import EmptyState from "../ui/EmptyState";
import styles from "../Styles/passpage.module.css";

export default function BoardingPass() {
  const { orderId } = useParams();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Boarding pass · RaahiGo";
    axios.get(`${API_BASE_URL}/order/${orderId}/ticket`, authHeader())
      .then(({ data: d }) => setData(d))
      .catch((err) => setFailed(err?.response?.data?.message || "We couldn't load this ticket."));
  }, [orderId]);

  async function share() {
    const { order } = data;
    const text = `My RaahiGo bus: ${order.busDetails.from} → ${order.busDetails.to}, ${formatDate(order.ticketSummary.date)}, seat ${order.ticketSummary.ticket}.`;
    try {
      if (navigator.share) await navigator.share({ title: "My RaahiGo ticket", text, url: data.verificationUrl });
      else {
        await navigator.clipboard.writeText(`${text} ${data.verificationUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
        success("Trip details copied");
      }
    } catch (e) {
      if (e?.name !== "AbortError") error("Couldn't share right now");
    }
  }

  if (failed) {
    return (
      <div className="container" style={{ padding: "64px 0" }}>
        <EmptyState icon={<FiAlertTriangle size={24} />} title="Ticket unavailable" action={<Link to="/myticket" className="btn btn-primary">Back to my trips</Link>}>{failed}</EmptyState>
      </div>
    );
  }
  if (!data) return <div className="container" style={{ padding: "40px 0" }}><div className="skel" style={{ height: 560, borderRadius: 24 }} /></div>;

  const active = data.order.status === "CONFIRMED";
  return (
    <div className={styles.page}>
      <div className={`container ${styles.toolbar}`}>
        <Link to="/myticket" className="btn btn-outline btn-sm"><FiArrowLeft /> My trips</Link>
        <div>
          {active && <button className="btn btn-outline btn-sm" onClick={() => downloadICS(data.order)}><FiCalendar /> Add to calendar</button>}
          <button className="btn btn-outline btn-sm" onClick={share}>{copied ? <><FiCheck /> Copied</> : <><FiShare2 /> Share</>}</button>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}><FiPrinter /> Print / save PDF</button>
        </div>
      </div>
      <div className="container"><PassSheet order={data.order} verificationUrl={data.verificationUrl} /></div>
      <p className={`container ${styles.tip}`}>Tip: in the print dialog choose “Save as PDF” to keep a copy on your phone.</p>
    </div>
  );
}
