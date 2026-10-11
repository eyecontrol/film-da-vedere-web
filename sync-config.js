/* Lista condivisa: Firebase Realtime Database + Firebase Authentication (piano gratuito).
   L'accesso è con email e password dei due account di coppia; le regole del database escludono chiunque altro.
   Il database può stare in una regione diversa: si elencano i possibili indirizzi e l'app usa il primo che risponde.
   La chiave API web di Firebase non è un segreto (è pensata per stare nelle app): la protezione sono le regole. */
window.FDV_SYNC_URL = [
  'https://realtime-cinema-default-rtdb.firebaseio.com',
  'https://realtime-cinema-default-rtdb.europe-west1.firebasedatabase.app',
  'https://realtime-cinema-default-rtdb.asia-southeast1.firebasedatabase.app',
];
window.FDV_SYNC_KEY = '';
