const { AppError, getConfig, getVerifiedOrder, json, sendError } = require("./_lib/fedapay");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      throw new AppError(405, "Méthode non autorisée.");
    }

    const { id, k } = event.queryStringParameters || {};
    const cfg = getConfig();
    const order = await getVerifiedOrder(cfg, id, k);

    const out = {
      success: true,
      status: order.status,
      productName: order.product.name,
    };
    if (order.status === "paid") {
      out.downloadUrl = `/api/download?id=${encodeURIComponent(order.transactionId)}&k=${encodeURIComponent(k)}`;
    }
    return json(200, out);
  } catch (err) {
    return sendError(err);
  }
};
