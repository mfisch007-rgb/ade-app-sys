import fs from "fs";
import http from "http";

const BASE = "http://127.0.0.1:" + (process.env.PORT || "3000");

const routes = [
    ["GET", "/"],
    ["GET", "/api/v1/health"],
    ["GET", "/api/v1/capabilities"],
    ["GET", "/api/v1/search"],
    ["GET", "/api/v1/events/stream"]
];

function request(method, path) {

    return new Promise(resolve => {

        const req = http.request(
            BASE + path,
            {
                method,
                timeout: 3000
            },
            res => {

                let data = "";

                res.on("data", chunk => {

                    data += chunk.toString();

                    if (data.length > 5000) {
                        req.destroy();
                    }
                });

                res.on("end", () => {

                    resolve({
                        method,
                        path,
                        status: res.statusCode,
                        contentType: res.headers["content-type"] || "",
                        bytes: data.length
                    });

                });
            }
        );

        req.on("error", err => {

            resolve({
                method,
                path,
                error: err.message
            });

        });

        req.on("timeout", () => {

            req.destroy();

            resolve({
                method,
                path,
                error: "timeout"
            });

        });

        req.end();
    });
}

const results = [];

for (const route of routes) {

    results.push(
        await request(route[0], route[1])
    );
}

console.log(
    JSON.stringify(
        {
            timestamp: new Date().toISOString(),
            base: BASE,
            results
        },
        null,
        2
    )
);
