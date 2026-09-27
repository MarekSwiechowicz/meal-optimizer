// Maczfit (maczfit.pl, platforma Dietly, API web/v1). Sesja w cookie SESSION.
const { createClient, loginError } = require('../lib/http');
const { dish, stripHtml, num } = require('../lib/util');

const BASE = 'https://maczfit.pl/api/web/v1';

function toDish(m) {
  const n = m.nutrition || {};
  return dish({
    name: m.menuMealName,
    // W opcjach zamiany ingredients bywa null, wtedy skład jest w etykiecie HTML (label)
    ingredients: stripHtml(m.ingredients || m.label),
    allergens: m.allergens,
    nutrition: {
      calories: num(n.calories), weight: num(n.weight), protein: num(n.protein), fat: num(n.fat),
      saturatedFat: num(n.saturatedFattyAcids), carbs: num(n.carbohydrate), sugar: num(n.sugar),
      fiber: num(n.dietaryFiber), salt: num(n.salt),
    },
  });
}

// "DD:HH:MM", 00:00:00 albo wartości ujemne = po deadlinie zmian
function isModifiable(d) {
  const parts = (d.modificationTimeRemaining || '').split(':').map(Number);
  return parts.some((p) => p > 0) && !parts.some((p) => p < 0);
}

module.exports = function create(env) {
  const http = createClient({
    baseUrl: BASE,
    headers: { 'company-id': 'maczfit', 'custom-panel-host': 'maczfit.pl', 'X-Launcher-Type': 'BROWSER_CUSTOM_PANEL' },
  });

  return {
    name: 'maczfit',
    defaultOrder: env.MACZFIT_ORDER_ID || '',

    async login() {
      if (!env.MACZFIT_EMAIL || !env.MACZFIT_PASSWORD) throw new Error('Brak MACZFIT_EMAIL / MACZFIT_PASSWORD w .env');
      let res;
      try {
        ({ res } = await http.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: env.MACZFIT_EMAIL, password: env.MACZFIT_PASSWORD }),
        }));
      } catch (e) { throw loginError(e, 'maczfit.pl'); }
      const session = res.headers.getSetCookie().find((c) => c.startsWith('SESSION='));
      if (!session) throw new Error('Login OK, ale brak cookie SESSION w odpowiedzi');
      http.setHeader('cookie', session.split(';')[0]);
    },

    async listOrders() {
      const { body } = await http.request('/orders');
      return body
        .filter((o) => o.status === 'ACTIVE' && o.dietTagId === 'MENU_CONFIGURATION')
        .map((o) => ({ id: String(o.orderId), label: (o.dietNames || []).join(', ') }));
    },

    async listDeliveries(order) {
      const { body } = await http.request(`/orders/${order.id}/upcoming-deliveries?numberOfDeliveries=60`);
      return body
        .filter(isModifiable)
        .map((d) => ({ id: String(d.deliveryId), date: d.deliveryDate, orderId: order.id, note: `zostało ${d.modificationTimeRemaining} na zmiany` }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getSlots(delivery) {
      const { body: menu } = await http.request(`/orders/deliveries/${delivery.id}/menus`);
      const slots = [];
      for (const meal of menu.deliveryMenuMeal) {
        const slot = {
          id: String(meal.deliveryMealId),
          name: meal.mealName,
          currentId: String(meal.menuMealId),
          current: toDish(meal),
          options: [],
          ref: { amount: meal.amount || 1 },
        };
        if (meal.switchable) {
          const { body: sw } = await http.request(
            `/orders/${delivery.orderId}/deliveries/${delivery.id}/delivery-meals/${meal.deliveryMealId}/switch/new`
          );
          slot.options = (sw.mealChangeOptions || [])
            .filter((o) => o.canBeChanged !== false && o.menuMealDetails)
            .map((o) => ({
              id: String(o.menuMealDetails.menuMealId),
              dish: toDish(o.menuMealDetails),
              ref: { dietCaloriesMealId: o.menuMealDetails.dietCaloriesMealId },
            }));
        }
        slots.push(slot);
      }
      return slots;
    },

    async applySwap(delivery, slot, option) {
      await http.request(
        `/orders/${delivery.orderId}/deliveries/${delivery.id}/delivery-meals/${slot.id}/switch/${option.ref.dietCaloriesMealId}?amount=${slot.ref.amount}`,
        { method: 'PUT' }
      );
    },
  };
};
