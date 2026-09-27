const providers = {
  maczfit: require('./maczfit'),
  vikinga: require('./vikinga'),
  zdrowycatering: require('./zdrowycatering'),
};

function loadProvider(name, env) {
  const factory = providers[name];
  if (!factory) throw new Error(`Nieznany provider "${name}". Dostępne: ${Object.keys(providers).join(', ')}`);
  return factory(env);
}

module.exports = { loadProvider, providerNames: Object.keys(providers) };
