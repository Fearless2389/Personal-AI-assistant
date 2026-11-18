// Shared data + cart helpers for the fixture shop. State lives in localStorage so the eval
// runner can check outcomes (cart contents, orders placed, form submitted, slot booked).
window.PRODUCTS = [
  { id: 1, name: 'Lenovo IdeaPad Slim 3 Laptop', price: 54990, rating: 4.2, category: 'laptop' },
  { id: 2, name: 'HP 15s Laptop', price: 47990, rating: 4.0, category: 'laptop' },
  { id: 3, name: 'ASUS Vivobook 15 Laptop', price: 42990, rating: 4.1, category: 'laptop' },
  { id: 4, name: 'Acer Aspire Lite Laptop', price: 38990, rating: 3.9, category: 'laptop' },
  { id: 5, name: 'Dell Inspiron 3520 Laptop', price: 51490, rating: 4.3, category: 'laptop' },
  { id: 6, name: 'boAt Rockerz 450 Headphones', price: 1499, rating: 4.1, category: 'audio' },
  { id: 7, name: 'Portronics 65W USB-C Charger', price: 1799, rating: 4.0, category: 'charger' },
  { id: 8, name: 'Logitech M331 Silent Mouse', price: 899, rating: 4.4, category: 'mouse' }
];

window.rupees = (n) => '₹' + n.toLocaleString('en-IN');

window.readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
window.writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));

window.getCart = () => window.readStore('cart', []);
window.cartCount = () => window.getCart().reduce((n, line) => n + line.qty, 0);

window.addToCart = (id, qty) => {
  const cart = window.getCart();
  const line = cart.find((l) => l.id === id);
  if (line) line.qty += qty;
  else cart.push({ id, qty });
  window.writeStore('cart', cart);
  window.renderCartLink();
};

window.removeFromCart = (id) => {
  window.writeStore(
    'cart',
    window.getCart().filter((l) => l.id !== id)
  );
  window.renderCartLink();
};

window.renderCartLink = () => {
  const link = document.getElementById('cart-link');
  if (link) link.textContent = 'Cart (' + window.cartCount() + ')';
};

document.addEventListener('DOMContentLoaded', window.renderCartLink);
