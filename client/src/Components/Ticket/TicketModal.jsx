import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FiPrinter } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import Modal from "../../ui/Modal";
import Ticket from "./Ticket";

export default function TicketModal({ orderId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    setErrorMsg("");
    setData(null);
    axios
      .get(`${API_BASE_URL}/order/${orderId}/ticket`, authHeader())
      .then(({ data }) => setData(data))
      .catch((err) => setErrorMsg(err?.response?.data?.message || "Couldn't load this ticket"))
      .finally(() => setLoading(false));
  }, [orderId]);

  return (
    <Modal open={Boolean(orderId)} onClose={onClose} title="Your ticket" width={760}>
      {loading && <div className="skel" style={{ height: 240, borderRadius: 20 }} />}
      {errorMsg && <p className="field-error" role="alert">{errorMsg}</p>}
      {data && (
        <>
          <Ticket order={data.order} verificationUrl={data.verificationUrl} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Link to={`/pass/${orderId}`} className="btn btn-primary" onClick={onClose}>
              <FiPrinter size={16} /> Open printable boarding pass
            </Link>
          </div>
        </>
      )}
    </Modal>
  );
}
