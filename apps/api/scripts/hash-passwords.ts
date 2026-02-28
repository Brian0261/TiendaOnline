const bcrypt = require("bcryptjs");

function getBcryptSaltRounds() {
  const raw = process.env.BCRYPT_SALT_ROUNDS;
  const n = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(n) && n >= 8 && n <= 15 ? n : 10;
}

function printUsage() {
  console.log("Uso:");
  console.log("  npm run build && node dist/scripts/hash-passwords.js <password1> <password2> ...");
  console.log("");
  console.log("Ejemplo:");
  console.log("  npm run build && node dist/scripts/hash-passwords.js 123 pass012");
  console.log("");
  console.log("Config:");
  console.log("  BCRYPT_SALT_ROUNDS=10 (default)");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const rounds = getBcryptSaltRounds();
  for (const plain of args) {
    const hash = await bcrypt.hash(String(plain), rounds);
    console.log(`${plain} => ${hash}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

export {};
