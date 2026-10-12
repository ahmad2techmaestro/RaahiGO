/**
 * Browser extensions (password managers, translators, autofill helpers) edit the page's DOM behind
 * React's back — wrapping inputs, injecting <font> tags, moving nodes. When React later tries to
 * remove or insert a node that is no longer where it left it, the browser throws NotFoundError and
 * the WHOLE app goes blank until a manual refresh. This makes those two DOM calls tolerant, the
 * widely used workaround for React issue #11538.
 */
if (typeof Node === "function" && Node.prototype && !Node.prototype.__rgGuarded) {
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function guardedRemoveChild(child) {
    if (child && child.parentNode !== this) {
      if (child.parentNode) child.parentNode.removeChild(child); // it was moved — remove it from where it actually is
      return child;
    }
    return removeChild.call(this, child);
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function guardedInsertBefore(newNode, ref) {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, newNode, null);
    return insertBefore.call(this, newNode, ref);
  };
  Node.prototype.__rgGuarded = true;
}
