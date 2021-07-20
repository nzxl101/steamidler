const config = require("../config.json");
const fs = require("fs");
const SteamUser = require("steam-user");

module.exports = class Proxy {
    constructor() {}
    
    /**
     * Return a proxy from the config.
     * @returns {Promise.<String>}
     */
    getProxy() {
        return new Promise((resolve, reject) => {
            if(config.proxy.proxies.length >= 1 && config.proxy.enabled) {
                for(let proxy in config.proxy.proxies) {
                    if((Math.floor(Date.now() / 1000) - config.proxy.proxies[proxy].lastUsed) >= (5*60) && !config.proxy.proxies[proxy].rateLimited) {
                        config.proxy.proxies[proxy].lastUsed = Math.floor(Date.now() / 1000);
                        resolve((`http://`+(config.proxy.proxies[proxy].username ? `${config.proxy.proxies[proxy].username}:${config.proxy.proxies[proxy].password}@` : "")+`${config.proxy.proxies[proxy].ip}:${config.proxy.proxies[proxy].port}`));
                        break;
                    }
                }
                
                fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
                resolve(null);
            } else {
                resolve(null);
            }
        });
    }

    /**
     * Check if proxies are rate limited or dead.
     * @returns {Promise.<String>}
     */
    checkProxies() {
        return new Promise((resolve, reject) => {
            let interval = 10 * 1000;
            config.proxy.proxies.forEach((proxy, i) => {
                setTimeout(() => {
                    const steamClient = new SteamUser({ httpProxy: `http://`+(proxy.username ? `${proxy.username}:${proxy.password}@` : "")+`${proxy.ip}:${proxy.port}` });
                    steamClient.logOn({ accountName: config.credentials.accountName, password: config.credentials.password });

                    steamClient.on("loggedOn", () => {
                        steamClient.logOff();

                        config.proxy.proxies[i].rateLimited = false;
                        fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));

                        console.log(steamClient.options.httpProxy+(" not rate limited, continuing.."));
                    });

                    steamClient.on("steamGuard", () => {
                        steamClient.logOff();

                        config.proxy.proxies[i].rateLimited = false;
                        fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));

                        console.log(steamClient.options.httpProxy+(" not rate limited, continuing.."));
                    });

                    steamClient.on("error", (err) => {
                        steamClient.logOff();

                        if(err.toString().includes("Error: HTTP CONNECT 407 Proxy Authentication Required") || err.eresult == 84) {
                            config.proxy.proxies[i].rateLimited = true;
                            fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
                        }

                        console.log(steamClient.options.httpProxy+(" rate limited, continuing.."));
                    });
                }, interval * i, i);
            });
        });
    }

    /**
     * Insert proxies from file on app start.
     */
    insertProxies() {
        if(fs.existsSync("../proxies.txt")) {
            fs.readFile("../proxies.txt", "utf-8", (err, data) => {
                if(err) {
                    return process.exit();
                }
    
                let proxies = config.proxy.proxies;
                data.trim().split("\n").forEach((line) => {
                    let proxy = line.trim().split(":");
                    let error = false;
    
                    proxies.forEach((v) => {
                        if(v.ip == proxy[0]) {
                            error = true;
                        }
                    });
    
                    if(!error) {
                        proxies.push({
                            "ip": proxy[0],
                            "port": proxy[1] ? proxy[1] : "80",
                            "username": proxy[2] ? proxy[2] : null,
                            "password": proxy[3] ? proxy[3] : null,
                            "lastUsed": -1,
                            "rateLimited": false
                        });
                    }
                });
    
                fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
                console.log(`Added proxies!`);
                process.exit();
            });
        } else {
            process.exit();
        }
    }
}
