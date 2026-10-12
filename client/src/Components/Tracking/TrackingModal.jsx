import Modal from "../../ui/Modal";
import LiveTrackingMap from "./LiveTrackingMap";

export default function TrackingModal({ orderId, onClose }) {
  return (
    <Modal open={Boolean(orderId)} onClose={onClose} title="Live tracking" width={720}>
      {orderId && <LiveTrackingMap orderId={orderId} />}
    </Modal>
  );
}
