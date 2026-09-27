// Generyczny provider dla cateringów na platformie Dietly (backend ml-panel). Ten sam kod obsługuje:
//   - wspólny panel panel.dietly.pl z nagłówkiem company-id (konto zakładane na dietly.pl),
//   - panele "custom" pod własną domeną cateringu (np. panel.kuchniavikinga.pl), gdzie konto jest osobne.
// Listę company-id wspólnego panelu podaje https://panel.dietly.pl/config.js (VITE_ALLOWED_COMPANIES).
const { createClient, loginError } = require('../lib/http');
const { dish, num } = require('../lib/util');

const KNOWN_COMPANIES = [
  'kuchniavikinga', 'robinfood', 'uhrabiego', 'afterfit', 'wybormenu', 'pysznafabryka', 'tytkafit', 'chefbox', 'twojemenu',
  'pogotowiedietetycznefitcatering', 'mojcatering', 'dietetycznywarsztat', 'fabrykasmaku', '5posilkowdziennie', 'magicfitcatering',
  'dzikibox', 'takeawaydiet', 'dobregodniacatering', 'dietapoddrzwi', 'perfectchef', 'zdrowaszama', 'ataksmaku', 'dietabanana',
  'nowalijkacatering', 'fitdieta', 'wykwintnybox', 'betterlifecateringdietetyczny', 'slimway', 'wdobrejformie', 'warszawskiwikt',
  'gastromonkey', 'kapitanbox', 'suvibox', 'cateringbroccoli', 'boskibox',
];
const DEFAULT_HOST = 'panel.dietly.pl';

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

// createDietly({ name, host, company, email, password, orderId }) -> provider
function createDietly({ name, host, company, email, password, orderId }) {
  if (!company) throw new Error('Podaj company-id cateringu (DIETLY_COMPANY w .env albo --company=nazwa)');
  const panel = `${host} (${company})`;
  const http = createClient({ baseUrl: `https://${host}/api`, headers: { 'company-id': company } });
  const orderCache = new Map();

  async function getOrder(id) {
    if (!orderCache.has(id)) orderCache.set(id, (await http.request(`/company/customer/order/${id}`)).body);
    return orderCache.get(id);
  }

  return {
    name,
    defaultOrder: orderId || '',

    async login() {
      if (!email || !password) throw new Error(`Brak e-maila lub hasła do ${panel} w .env`);
      let res;
      try {
        ({ res } = await http.request('/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: email, password }).toString(),
        }));
      } catch (e) { throw loginError(e, panel); }
      const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
      if (!cookies.some((c) => c.startsWith('SESSION='))) throw new Error(`Logowanie do ${panel} bez sesji: sprawdź e-mail i hasło`);
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
        const slot = { id: String(meal.deliveryMealId), name: meal.mealName, currentId: String(meal.dietCaloriesMealId), current: toDish(meal), options: [], ref: {} };
        // Za blisko dostawy API zwraca 490 (zamówienie na tę datę niedozwolone), wtedy slot bez opcji
        const { body: sw, status } = await http.request(
          `/company/customer/order/${delivery.orderId}/deliveries/${delivery.id}/delivery-meals/${meal.deliveryMealId}/switch`,
          { allowError: true }
        );
        if (status === 200) {
          slot.options = (sw.mealChangeOptions || [])
            .filter((o) => o.menuMealDetails)
            .map((o) => ({ id: String(o.menuMealDetails.dietCaloriesMealId), dish: toDish(o.menuMealDetails), ref: { dietCaloriesMealId: o.menuMealDetails.dietCaloriesMealId } }));
        } else slot.note = `brak opcji (HTTP ${status})`;
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
}

// provider "dietly": catering z .env (DIETLY_*) albo z flag --company= / --host=
function create(env, flags = {}) {
  return createDietly({
    name: 'dietly',
    host: flags.host || env.DIETLY_HOST || DEFAULT_HOST,
    company: flags.company || env.DIETLY_COMPANY,
    email: env.DIETLY_EMAIL,
    password: env.DIETLY_PASSWORD,
    orderId: env.DIETLY_ORDER_ID,
  });
}

module.exports = create;
module.exports.createDietly = createDietly;
module.exports.KNOWN_COMPANIES = KNOWN_COMPANIES;
module.exports.DEFAULT_HOST = DEFAULT_HOST;
