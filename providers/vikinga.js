// Kuchnia Vikinga (panel.kuchniavikinga.pl, platforma Dietly, starsze API /api/company/...).
// Logowanie form-urlencoded, sesja w cookie SESSION. Bez Playwrighta.
const { createClient } = require('../lib/http');
const { dish, num } = require('../lib/util');

const BASE = 'https://panel.kuchniavikinga.pl/api';

function toDish(m) {
  const n = m.nutrition || {};
  const ingredients = Array.isArray(m.ingredients) ? m.ingredients.map((i) => i.name).filter(Boolean).join(', ') : m.ingredients;
  return dish({
    name: m.menuMealName,
    ingredients,
    allergens: m.allergens,
    nutrition: {
      calories: num(n.calories), weight: num(n.weight), protein: num(n.protein), fat: num(n.fat),
      saturatedFat: num(n.saturatedFattyAcids), carbs: num(n.carbohydrate), sugar: num(n.sugar),
      fiber: num(n.dietaryFiber), salt: num(n.salt),
    },
  });
}

module.exports = function create(env) {
  const http = createClient({ baseUrl: BASE, headers: { 'company-id': 'kuchniavikinga' } });
  const orderCache = new Map();

  async function getOrder(orderId) {
    if (!orderCache.has(orderId)) {
      const { body } = await http.request(`/company/customer/order/${orderId}`);
      orderCache.set(orderId, body);
    }
    return orderCache.get(orderId);
  }

  return {
    name: 'vikinga',
    defaultOrder: env.VIKINGA_ORDER_ID || '',

    async login() {
      if (!env.VIKINGA_EMAIL || !env.VIKINGA_PASSWORD) throw new Error('Brak VIKINGA_EMAIL / VIKINGA_PASSWORD w .env');
      const { res } = await http.request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: env.VIKINGA_EMAIL, password: env.VIKINGA_PASSWORD }).toString(),
      });
      const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
      if (!cookies.some((c) => c.startsWith('SESSION='))) throw new Error('Login OK, ale brak cookie SESSION (złe hasło?)');
      http.setHeader('cookie', cookies.join('; '));
    },

    async listOrders() {
      const { body: ids } = await http.request('/company/customer/order/active-ids');
      const orders = [];
      for (const id of ids || []) {
        const o = await getOrder(id);
        orders.push({ id: String(id), label: `${o.diet && o.diet.name ? o.diet.name : 'dieta'} ${o.dateFrom}..${o.dateTo}` });
      }
      return orders;
    },

    async listDeliveries(order) {
      const o = await getOrder(order.id);
      const today = new Date().toISOString().slice(0, 10);
      return (o.deliveries || [])
        .filter((d) => !d.deleted && d.date >= today)
        .map((d) => ({ id: String(d.deliveryId), date: d.date, orderId: order.id, note: '' }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getSlots(delivery) {
      const { body: menu } = await http.request(`/company/general/menus/delivery/${delivery.id}/new`);
      const slots = [];
      for (const meal of menu.deliveryMenuMeal || []) {
        if (meal.deleted) continue;
        const slot = {
          id: String(meal.deliveryMealId),
          name: meal.mealName,
          currentId: String(meal.dietCaloriesMealId),
          current: toDish(meal),
          options: [],
          ref: {},
        };
        // Za blisko dostawy API zwraca 490 (zamówienie na tę datę niedozwolone), wtedy slot bez opcji
        const { body: sw, status } = await http.request(
          `/company/customer/order/${delivery.orderId}/deliveries/${delivery.id}/delivery-meals/${meal.deliveryMealId}/switch`,
          { allowError: true }
        );
        if (status === 200) {
          slot.options = (sw.mealChangeOptions || [])
            .filter((o) => o.menuMealDetails)
            .map((o) => ({
              id: String(o.menuMealDetails.dietCaloriesMealId),
              dish: toDish(o.menuMealDetails),
              ref: { dietCaloriesMealId: o.menuMealDetails.dietCaloriesMealId },
            }));
        } else {
          slot.note = `brak opcji (HTTP ${status})`;
        }
        slots.push(slot);
      }
      return slots;
    },

    async applySwap(delivery, slot, option) {
      await http.request(
        `/company/customer/order/${delivery.orderId}/deliveries/${delivery.id}/delivery-meals/${slot.id}/switch?dietCaloriesMealId=${option.ref.dietCaloriesMealId}`,
        { method: 'PUT' }
      );
    },
  };
};
