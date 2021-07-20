const SteamUser = require("steam-user"), SteamTotp = require("steam-totp");
const readline = require("readline"), rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const config = require("./config.json");
const Helper = require("./helpers/helper.js");
const Proxy = require("./helpers/proxy.js");
const fs = require("fs");

let intervals = [];

process.on('unhandledRejection', (error) => {   // cuz cba to add .catch to every func lMaoO
    console.log(error.message);
});

(async () => {
    const proxyManager = new Proxy();

    if(process.argv[2] && process.argv[2].toUpperCase() == "--PROXY") {
        if(process.argv[3] == undefined) {
            console.log("node index.js --proxy check\nnode index.js --proxy insert")
            return process.exit();
        }

        switch (process.argv[3].toUpperCase()) {
            case "CHECK":
                await proxyManager.checkProxies();
                break;
            case "INSERT":
                await proxyManager.insertProxies();
                break;
        }

        return process.exit();
    }

    const steamClient = new SteamUser({ httpProxy: await proxyManager.getProxy() });
    const helper = new Helper(steamClient);

    if(config.settings.heroku.app && config.settings.heroku.token) {
        console.log(`Heroku dyno will automatically restart in ${config.settings.heroku.restartInterval} hours.`);
        setTimeout(() => helper.restartDyno(), (config.settings.heroku.restartInterval*60*60*1000));
    }

    steamClient.logOn({
        accountName: config.credentials.accountName,
        password: config.credentials.password,
        sharedSecret: config.credentials.sharedSecret
    });

    steamClient.on("steamGuard", (domain, callback) => {
        if(config.credentials.sharedSecret) {
            return callback(SteamTotp.generateAuthCode(config.credentials.sharedSecret));
        }

        rl.question(`Steam Guard code needed for account ${config.credentials.accountName} (`+(domain == null ? "2FA" : domain)+`)\n>>`, (code) => {
            callback(code);
        });
    });

    steamClient.on("loggedOn", async () => {
        console.log(`Logged in with account ${config.credentials.accountName}`);

        steamClient.setPersona(await helper.getState());
        
        while (Object.keys(steamClient.myFriends).length <= 0) await new Promise(wait => setTimeout(wait, 25)); // not needed but good if u still have open requests it will auto accept

        if(config.settings.autoFriends.enabled) {
            steamClient.on("friendRelationship", (steamID, relationship) => {
                if(relationship == SteamUser.EFriendRelationship.RequestRecipient) {
                    helper.addFriend(steamID).then(r => console.log(r.message));
                }
            });

            for(var steamID in steamClient.myFriends) {
                if(steamClient.myFriends[`${steamID}`] == 2) {
                    helper.addFriend(steamID).then(r => console.log(r.message));
                } else if(steamClient.myFriends[`${steamID}`] == 3) {
                    helper.checkFriend(steamID).then(r => console.log(r.message));
                }
            }
        }

        if(config.settings.hourboost.enabled) {
            helper.hourBoost().then(r => console.log(r.message));;
        }

        if(config.settings.autoPost.enabled) {
            helper.postComments(config.settings.autoPost.groups, config.settings.autoPost.message).then(r => console.log(r.message));;

            let interval = setInterval(() => {
                helper.postComments(config.settings.autoPost.groups, config.settings.autoPost.message).then(r => console.log(r.message));;
            }, (config.settings.autoPost.postInterval*6)*10000);

            intervals.push(interval);
        }
    });

    steamClient.on("error", async (err) => {
        if(err.eresult == 6) {
            console.log("Account logged in elsewhere!");
        } else if(err.eresult == 84) {
            console.log("IP rate limited by Steam!");
            if(steamClient.options.httpProxy && config.proxy.enabled) {
                config.proxy.proxies.forEach((proxy, i) => {
                    if(steamClient.options.httpProxy.includes(proxy.ip)) {
                        config.proxy.proxies[i].rateLimited = true;
                        fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
                    }
                });
            }
        } else if(err.toString().includes("Error: HTTP CONNECT 407 Proxy Authentication Required")) {
            console.log("Proxy failed!");
        }

        intervals.forEach(i => clearInterval(i));
        steamClient.removeAllListeners("friendRelationship"); // need 2 remove or eventemitter leak and ur shit is fucked up

        if(steamClient.steamID && err.eresult !== 84) { // if not rate limited just log back in
            steamClient.logOn({
                accountName: config.credentials.accountName,
                password: config.credentials.password,
                sharedSecret: config.credentials.sharedSecret
            });
        } else { // restart app so it takes a new proxy - use pm2 or forever if u dont have heroku
            await helper.restartDyno();
            process.exit();
        }
    });

    steamClient.on("disconnected", async () => {
        await helper.restartDyno();
        process.exit();
    });
})();