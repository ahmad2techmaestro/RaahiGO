const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const UserModel = require("../models/user.model");

const app = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

// Slows down credential-stuffing / brute-force attempts against auth routes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

app.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, gender, referralCode } = req.body;

    if (!email || !password) {
      return res.status(400).send({
        status: "Failed",
        message: "Email and password are required",
      });
    }
    if (password.length < 6) {
      return res.status(400).send({
        status: "Failed",
        message: "Password must be at least 6 characters",
      });
    }

    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res.status(409).send({
        status: "Failed",
        message: "Please try with a different email",
      });
    }

    // A referral code is optional and, if given, must belong to a real
    // user — an invalid code is silently ignored rather than blocking
    // signup, since a typo in a referral code shouldn't lock someone out
    // of creating an account.
    let referredBy = null;
    if (referralCode && typeof referralCode === "string") {
      const referrer = await UserModel.findOne({
        referralCode: referralCode.trim().toUpperCase(),
      });
      if (referrer) referredBy = referrer._id;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await UserModel.create({ email, password: hashedPassword, gender, referredBy });

    return res.send({
      status: "Success",
      message: "Signup successful",
    });
  } catch (error) {
    return res.status(500).send({ message: error.message, status: "Failed" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({
        status: "Failed",
        message: "Email and password are required",
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).send({ status: "Failed", message: "Please check your email" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).send({
        status: "Failed",
        message: "Please check your password",
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).send({
        status: "Failed",
        message: "Server misconfigured: JWT_SECRET not set",
      });
    }

    const safeUser = { _id: user._id, email: user.email, gender: user.gender, role: user.role };
    const token = jwt.sign({ user: safeUser }, JWT_SECRET, { expiresIn: "7d" });

    return res.send({ status: "Success", message: { user: safeUser, token } });
  } catch (error) {
    return res.status(500).send({ message: error.message, status: "Failed" });
  }
});

module.exports = app;
