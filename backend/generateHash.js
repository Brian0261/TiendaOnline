const bcrypt = require("bcryptjs");

const run = async () => {
  const plainPassword = "Juan1234";
  const hash = await bcrypt.hash(plainPassword, 10);
  console.log(`Hash para 'Juan1234': ${hash}`);
};

run();
