'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_COST = 12;

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password), String(hash));
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function signAccess(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.includes('[A_REMPLIR')) throw new Error('JWT_ACCESS_SECRET manquant');
  return jwt.sign(payload, secret, { expiresIn: process.env.JWT_ACCESS_TTL || '15m' });
}

function signRefresh(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.includes('[A_REMPLIR')) throw new Error('JWT_REFRESH_SECRET manquant');
  return jwt.sign(payload, secret, { expiresIn: process.env.JWT_REFRESH_TTL || '7d' });
}

function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function refreshCookieOptions() {
  const secure = String(process.env.COOKIE_SECURE || 'true').toLowerCase() !== 'false';
  const sameSite = (process.env.COOKIE_SAMESITE || 'none').toLowerCase(); // 'none' requis cross-site (Vercel -> ngrok) avec Secure
  return {
    httpOnly: true,
    secure,
    sameSite: sameSite === 'lax' ? 'lax' : sameSite === 'strict' ? 'strict' : 'none',
    path: '/auth',
  };
}

module.exports = { hashPassword, verifyPassword, safeEqual, signAccess, signRefresh, verifyAccess, verifyRefresh, refreshCookieOptions };
