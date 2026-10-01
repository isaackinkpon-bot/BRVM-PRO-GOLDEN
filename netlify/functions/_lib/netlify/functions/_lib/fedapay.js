const crypto = require("crypto");
const { getProduct } = require("./products");

class AppError extends Error {
  constructor(httpStatus, publicMessage, internalDetail) {
    super(publicMessage);
    this.httpStatus = httpStatus;
    this.publicMessage = publicMessage;
    this.internalDetail = internalDetail || null;
  }
}

const BASE_URLS = {
  sandbox: "https://sandbox-api.fedapay.com/v1",
  live: "https://api.fedapay.com/v1",
};

function getConfig() {
  const key = process.env.FEDAPAY_SECRET_KEY;
  const env = String(process.env.FEDAPAY_ENV || "sandbox").trim().toLowerCase();
  const siteUrl = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");

  if (!key) {
    throw new AppError(500, "Le paiement est momentanément indisponible.", "FEDAPAY_SECRET_KEY absente");
  }
  if (env !== "sandbox" && env !== "live") {
    throw new AppError(500, "Le paiement est momentanément indisponible.", 'FEDAPAY_ENV doit valoir "sandbox" ou "live"');
  }
  if (!/^https?:\/\//.test(siteUrl)) {
    throw new AppError(500, "Le paiement est momentanément indisponible.", "SITE_URL absente ou invalide");
  }

  const m = /^sk_(sandbox|live)_/.exec(key);
  if (m && m[1] !== env) {
    throw new AppError(
      500,
      "Le paiement est momentanément indisponible.",
      `Clé ${m[1]} utilisée avec FEDAPAY_ENV=${env} : incohérent`
    );
  }

  return { key, env, baseUrl: BASE_URLS[env], siteUrl };
}

async function fedaRequest(cfg, method, path, body) {
  let res;
  try {
    res = await fetch(cfg.baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AppError(502, "Service de paiement injoignable, réessayez dans un instant.", `fetch ${method} ${path}: ${err.message}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const detail = `FedaPay ${method} ${path} -> HTTP ${res.status} ${JSON.stringify(data)}`;
    if (res.status === 404) throw new AppError(404, "Transaction inconnue.", detail);
    if (res.status === 401) throw new AppError(500, "Le paiement est momentanément indisponible.", detail);
    throw new AppError(502, "Le service de paiement a refusé la demande.", detail);
  }
  return data;
}

function unwrap(data, name) {
  if (!data || typeof data !== "object") return null;
  if (data["v1/" + name] && typeof data["v1/" + name] === "object") return data["v1/" + name];
  if (data[name] && typeof data[name] === "object") return data[name];
  return data;
}

function normalizeStatus(raw) {
  switch (String(raw || "").toLowerCase()) {
    case "approved":
    case "transferred":
      return "paid";
    case "pending":
      return "pending";
    case "declined":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "refunded":
      return "refunded";
    default:
      return "unknown";
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const ID_RE = /^\d{1,12}$/;
const KEY_RE = /^[a-f0-9]{48}$/;

async function getVerifiedOrder(cfg, id, k) {
  if (!ID_RE.test(String(id || "")) || !KEY_RE.test(String(k || ""))) {
    throw new AppError(404, "Transaction inconnue.", "id/k au mauvais format");
  }

  const data = await fedaRequest(cfg, "GET", `/transactions/${id}`);
  const tx = unwrap(data, "transaction");
  if (!tx || tx.id === undefined) {
    throw new AppError(404, "Transaction inconnue.", "réponse sans transaction");
  }

  const meta = tx.custom_metadata || tx.metadata || {};
  if (!meta.order_key || !safeEqual(meta.order_key, k)) {
    throw new AppError(404, "Transaction inconnue.", `order_key invalide pour la transaction ${id}`);
  }

  const product = getProduct(meta.product);
  if (!product) {
    throw new AppError(404, "Transaction inconnue.", `produit inconnu dans les métadonnées : ${meta.product}`);
  }
  if (Number(tx.amount) !== product.price) {
    throw new AppError(404, "Transaction inconnue.", `montant incohérent (${tx.amount} au lieu de ${product.price})`);
  }

  return {
    transactionId: String(tx.id),
    productId: meta.product,
    product,
    rawStatus: tx.status,
    status: normalizeStatus(tx.status),
  };
}

function json(statusCode, obj, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, extraHeaders || {}),
    body: JSON.stringify(obj),
  };
}

function sendError(err) {
  if (err instanceof AppError) {
    console.error("[fedapay]", err.publicMessage, "|", err.internalDetail || "");
    return json(err.httpStatus, { success: false, error: err.publicMessage });
  }
  console.error("[fedapay] erreur inattendue :", err && err.message);
  return json(500, { success: false, error: "Une erreur est survenue. Réessayez plus tard." });
}

module.exports = {
  AppError,
  getConfig,
  fedaRequest,
  unwrap,
  normalizeStatus,
  getVerifiedOrder,
  json,
  sendError,
};
