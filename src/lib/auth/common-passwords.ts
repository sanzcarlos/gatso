/**
 * Lista de contrasenas demasiado comunes/previsibles (Backlog: "anadir
 * verificacion de contrasenas comunes/comprometidas"). Se comprueba de
 * forma totalmente local (sin llamada de red a ningun servicio externo
 * tipo HaveIBeenPwned): evita depender de conectividad en tiempo de
 * registro/recuperacion, evita enviar ninguna derivada de la contrasena
 * fuera del proceso, y hace que la comprobacion sea deterministica y
 * testeable sin red (`common-passwords.test.ts`).
 *
 * La lista cubre los patrones mas filtrados historicamente en volcados de
 * credenciales (analisis anuales de NCSC/Have I Been Pwned/SplashData):
 * secuencias numericas y de teclado, palabras de diccionario habituales,
 * variantes con mayusculas/numeros/sufijos triviales, y nombres de la
 * propia aplicacion. No pretende ser exhaustiva como un volcado real de
 * miles de millones de contrasenas filtradas, sino bloquear los casos mas
 * evidentes que cualquier atacante probaria primero.
 */
const COMMON_PASSWORDS: readonly string[] = [
  "123456", "123456789", "12345678", "1234567890", "1234567", "12345",
  "111111", "1111111", "11111111", "000000", "00000000",
  "123123", "123123123", "123321", "121212", "112233",
  "qwerty", "qwerty123", "qwertyuiop", "qwerty12345",
  "asdfghjkl", "asdasd", "asdf1234", "zxcvbnm", "zxcvbn",
  "password", "password1", "password123", "passw0rd", "passwort",
  "letmein", "letmein123", "welcome", "welcome1", "welcome123",
  "monkey", "dragon", "master", "master123", "superman", "batman",
  "football", "baseball", "basketball", "soccer", "hockey",
  "iloveyou", "iloveyou1", "loveyou", "trustno1", "whatever",
  "abc123", "abc12345", "a1b2c3", "aa123456", "1qaz2wsx",
  "sunshine", "shadow", "princess", "flower", "starwars", "hunter2",
  "admin", "administrator", "admin123", "admin1234", "root", "toor",
  "changeme", "temp1234", "temppass", "letmein1", "access", "access123",
  "1q2w3e4r", "1q2w3e4r5t", "qazwsx", "qazwsxedc", "zaq12wsx",
  "michael", "jennifer", "jordan23", "jessica", "ashley", "amanda",
  "121212121", "696969", "654321", "987654321", "159159",
  "qwerty1", "qwerty12", "qwe123", "asd123", "test1234", "test123",
  "login", "login123", "guest", "guest123", "default", "default123",
  "aaaaaa", "aaaaaaaa", "bbbbbb", "121121", "232323",
  "gatso", "gatso123", "gatsoapp", "gatso1234",
];

const COMMON_PASSWORD_SET: ReadonlySet<string> = new Set(COMMON_PASSWORDS.map((entry) => entry.toLowerCase()));

/**
 * Detecta secuencias/repeticiones triviales que ningun listado fijo puede
 * cubrir por completo: la misma letra repetida (`aaaaaaaaaa`), digitos
 * consecutivos ascendentes o descendentes (`23456789`, `987654321`) y
 * letras consecutivas de teclado (`abcdefgh`). Umbral de 6 caracteres
 * consecutivos: mas corto daria falsos positivos con contrasenas legitimas
 * que solo contienen un fragmento secuencial incidental.
 */
function hasTrivialSequence(password: string): boolean {
  const normalized = password.toLowerCase();
  if (/^(.)\1{5,}$/.test(normalized)) return true;

  const RUN_LENGTH = 6;
  for (let i = 0; i + RUN_LENGTH <= normalized.length; i++) {
    const window = normalized.slice(i, i + RUN_LENGTH);
    const codes = Array.from(window, (char) => char.codePointAt(0) ?? 0);
    let ascending = true;
    let descending = true;
    for (let j = 1; j < codes.length; j++) {
      const diff = (codes[j] ?? 0) - (codes[j - 1] ?? 0);
      if (diff !== 1) ascending = false;
      if (diff !== -1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

/**
 * Comprueba si una contrasena es demasiado comun/previsible para
 * permitirla (NIST SP 800-63B recomienda rechazar contrasenas presentes
 * en listas de valores comunmente usados, esperados o comprometidos).
 * Se normaliza a minusculas y se recorta espacios para detectar variantes
 * triviales ("Password123 " == "password123").
 */
export function isCommonPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORD_SET.has(normalized)) return true;
  return hasTrivialSequence(normalized);
}
