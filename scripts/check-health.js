process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const https = require("https");

https
  .get("https://localhost:5000/api/health", (res) => {
    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log(res.statusCode);
      console.log(data);
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  })
  .on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
