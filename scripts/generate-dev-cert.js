const fs = require("fs");
const path = require("path");
const selfsigned = require("selfsigned");

const certsDir = path.join(__dirname, "..", "certs");

fs.mkdirSync(certsDir, { recursive: true });

(async () => {
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);

  const pems = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
    notAfterDate,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });

  fs.writeFileSync(path.join(certsDir, "server.key"), pems.private);
  fs.writeFileSync(path.join(certsDir, "server.crt"), pems.cert);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
