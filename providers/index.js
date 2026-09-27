const providers = {
  maczfit: require('./maczfit'),
  vikinga: require('./vikinga'),
  zdrowycatering: require('./zdrowycatering'),
  dietly: require('./dietly'),
};

function loadProvider(name, env, flags = {}) {
  const factory = providers[name];
  if (!factory) throw new Error(`Nieznany provider "${name}". Dostępne: ${Object.keys(providers).join(', ')}`);
  return factory(env, flags);
}

module.exports = { loadProvider, providerNames: Object.keys(providers) };
