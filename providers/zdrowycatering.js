// Zdrowy Catering (zamowienie.zdrowycatering.pl, backend api.powerfoods.pl, brand_id 3). JWT Bearer.
const { createClient, loginError } = require('../lib/http');
const { dish, num, todayPlus } = require('../lib/util');

const BASE = 'https://api.powerfoods.pl/api/v1';
const BRAND_ID = 3;
// API odrzuca zmiany na D+1 i D+2 (400, nie można złożyć zamówienia na wybraną datę), D+3 przechodzi
const MIN_LEAD_DAYS = 3;

function toDish(d) {
  return dish({
    name: d.dish_name,
    ingredients: d.dish_ing_names,
    allergens: (d.dish_allergens || '').split(',').map((a) => a.trim()).filter(Boolean),
    // API nie zwraca cukru ani nasyconych osobno
    nutrition: { calories: num(d.m_kcal || d.m_cal || d.kcal), protein: num(d.m_protein), fat: num(d.m_fat), carbs: num(d.m_carbo) },
  });
}

module.exports = function create(env) {
  const http = createClient({ baseUrl: BASE });
  const itemCache = new Map();

  return {
    name: 'zdrowycatering',
    defaultOrder: env.ZDROWY_ORDER_ID || '',

    async login() {
      if (!env.ZDROWY_EMAIL || !env.ZDROWY_PASSWORD) throw new Error('Brak ZDROWY_EMAIL / ZDROWY_PASSWORD w .env');
      let body;
      try {
        ({ body } = await http.request('/clients/login', {
          method: 'POST',
          body: JSON.stringify({ email: env.ZDROWY_EMAIL, password: env.ZDROWY_PASSWORD, brand_id: BRAND_ID }),
        }));
      } catch (e) { throw loginError(e, 'zamowienie.zdrowycatering.pl'); }
      if (!body || !body.token) throw new Error('Login bez tokena');
      http.setHeader('authorization', `Bearer ${body.token}`);
    },

    async listOrders() {
      const { body } = await http.request(`/clientDiets?brand_id=${BRAND_ID}&type=active`);
      return (body.data.diets || []).map((d) => ({
        id: String(d.id),
        label: [d.diet_name, d.var_name, d.date_from && `${d.date_from}..${d.date_to}`].filter(Boolean).join(' '),
      }));
    },

    async listDeliveries(order) {
      const { body } = await http.request(`/clientDiets/${order.id}`);
      const minDate = todayPlus(MIN_LEAD_DAYS);
      return body.data.items
        .filter((i) => i.has_menu_choice === 1 && i.date_dlv >= minDate)
        .map((i) => {
          itemCache.set(String(i.id), i);
          return { id: String(i.id), date: i.date_dlv, orderId: order.id, note: '' };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getSlots(delivery) {
      const item = itemCache.get(delivery.id);
      const params = `diet_id=${item.diet_id}&var_id=${item.var_id}&var_cal_id=${item.var_cal_id}&dmenu=${item.date_dlv}&brand_id=${BRAND_ID}&client_diet_id=${item.client_diet_id}`;
      const [{ body: all }, { body: client }] = await Promise.all([
        http.request(`/diets/menu?${params}&type=all`),
        http.request(`/diets/menu?${params}&type=client`),
      ]);
      // type=all czasem pomija danie z bieżącej diety klienta, dopisujemy je z type=client
      const groups = new Map();
      for (const d of [...all.data, ...client.data]) {
        const g = groups.get(d.var_cal_meal_id) || [];
        if (!g.some((x) => x.dish_id === d.dish_id)) g.push(d);
        groups.set(d.var_cal_meal_id, g);
      }
      const currentByMeal = new Map(client.data.map((d) => [d.var_cal_meal_id, d]));
      // Sloty już kiedyś zmienione mają rekord w item.dishes, wtedy zapis to PATCH, nie POST
      const existing = new Map((item.dishes || []).map((d) => [Number(d.var_cal_meal_id), d.id]));

      const slots = [];
      for (const [varCalMealId, candidates] of groups) {
        const current = currentByMeal.get(varCalMealId);
        if (!current) continue;
        slots.push({
          id: String(varCalMealId),
          name: current.meal_name,
          currentId: String(current.dish_id),
          current: toDish(current),
          options: candidates.map((c) => ({ id: String(c.dish_id), dish: toDish(c), ref: { dish_id: c.dish_id, diet_id: c.diet_id } })),
          ref: { itemId: item.id, existingRecordId: existing.get(Number(varCalMealId)) || null },
        });
      }
      return slots;
    },

    async applySwap(delivery, slot, option) {
      const body = JSON.stringify({
        brand_id: BRAND_ID,
        client_diet_item_id: slot.ref.itemId,
        dish_id: option.ref.dish_id,
        diet_id: option.ref.diet_id,
        var_cal_meal_id: Number(slot.id),
      });
      if (slot.ref.existingRecordId) {
        await http.request(`/clientDiets/dish/${slot.ref.existingRecordId}`, { method: 'PATCH', body });
      } else {
        await http.request('/clientDiets/dish', { method: 'POST', body });
      }
    },
  };
};
