// Kuchnia Vikinga = Dietly z własnym panelem (panel.kuchniavikinga.pl) i osobnym kontem
const { createDietly } = require('./dietly');

module.exports = (env) =>
  createDietly({
    name: 'vikinga',
    host: 'panel.kuchniavikinga.pl',
    company: 'kuchniavikinga',
    email: env.VIKINGA_EMAIL,
    password: env.VIKINGA_PASSWORD,
    orderId: env.VIKINGA_ORDER_ID,
  });
