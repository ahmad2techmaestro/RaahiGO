export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="state" role="status">
      {icon && <div className="state-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
