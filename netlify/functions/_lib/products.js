const PRODUCTS = {
  manuel: {
    name: "Manuel de présentation BRVM PRO GOLDEN",
    price: 100,
    file: "manuel.pdf",
  },
  niveau1: {
    name: "BRVM PRO GOLDEN - Niveau 1",
    price: 1000,
    file: "niveau1.pdf",
  },
  niveau2: {
    name: "BRVM PRO GOLDEN - Niveau 2",
    price: 2500,
    file: "niveau2.pdf",
  },
  niveau3: {
    name: "BRVM PRO GOLDEN - Niveau 3",
    price: 5000,
    file: "niveau3.pdf",
  },
};

function getProduct(id) {
  if (typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null;
}

module.exports = { PRODUCTS, getProduct };
