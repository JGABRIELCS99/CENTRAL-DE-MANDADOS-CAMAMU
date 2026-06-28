const address = "Fórum da Comarca de São Paulo";
fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
  headers: {
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'User-Agent': 'AIS-Applet'
  }
}).then(res => res.json()).then(console.log).catch(console.error);
