export const validateEmail = (email) => /^\S+@\S+\.\S+$/.test(String(email || "").trim());
export const validatePhone = (num) => /^[6-9]\d{9}$/.test(String(num || "").trim());
