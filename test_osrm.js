const coord1 = {lat: '-22.7440720', lon: '-50.3913751'};
const coord2 = {lat: '-23.5505', lon: '-46.6333'};
fetch(`https://router.project-osrm.org/route/v1/driving/${coord1.lon},${coord1.lat};${coord2.lon},${coord2.lat}?overview=false`)
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
