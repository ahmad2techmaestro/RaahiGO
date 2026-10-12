const jwt = require("jsonwebtoken");

/**
 * Verifies the Bearer JWT on the request and attaches the decoded user
 * to req.user. Any route using this can trust req.user._id as the
 * authenticated caller's identity — never trust a user id from req.body
 * or req.params for authorization decisions.
 */
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfigured: JWT_SECRET not set" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Invalid token" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };

/**
 * Restricts a route to specific roles. Must run after requireAuth (needs
 * req.user already populated). The role comes from the JWT payload set at
 * login — see the trade-off note on User.role in user.model.js.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
      });
    }
    next();
  };
}

module.exports.requireRole = requireRole;
