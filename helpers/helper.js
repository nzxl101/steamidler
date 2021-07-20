const SteamUser = require("steam-user");
const cheerio = require("cheerio");
const request = require("request"), jar = request.jar();
const fs = require("fs");
const config = require("../config.json");

module.exports = class Helper {
    constructor(steamClient) {
        this.steamClient = steamClient;
    }

    /**
     * Add parsed steamID to friendlist of account.
     * @param {SteamID|String} - Either a SteamID object of the user to add, or a string which can parse into one.
     * @returns {Promise.<String>|Promise.<Object>}
     */
    addFriend(steamID) {
        return new Promise((resolve, reject) => {
            this.steamClient.getSteamLevels([steamID], async (err, level) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get steam level of steamID ${steamID}!`));
                }

                if(config.settings.autoFriends.checkVAC) {
                    await this.checkBan(steamID).then((res) => {
                        if(res) {
                            this.steamClient.removeFriend(steamID);
                            return resolve(this.promiseResp(false, `Removed ${steamID} from friendlist because it got 1 or more steam bans.`));
                        }
                    });
                }

                if(level[`${steamID}`] >= config.settings.autoFriends.minLevel) {
                    this.steamClient.addFriend(steamID);

                    if(config.settings.autoGroup.enabled) {
                        this.steamClient.inviteToGroup(steamID, config.settings.autoGroup.groupID);
                    }

                    if(config.settings.autoFriends.message && config.settings.autoFriends.message.length >= 1) {
                        this.steamClient.chat.sendFriendMessage(steamID, config.settings.autoFriends.message);
                    }

                    resolve(this.promiseResp(true, `Added steamID ${steamID} as a friend!`));
                } else {
                    this.steamClient.removeFriend(steamID);
                    resolve(this.promiseResp(false, `Removed steamID ${steamID} as a friend because level is too low!`));
                }
            });
        });
    }

    /**
     * Check parsed steamID for level/inactivity
     * @param {SteamID|String} - Either a SteamID object of the user to check, or a string which can parse into one.
     * @returns {Promise.<String>|Promise.<Object>}
     */
    checkFriend(steamID) {
        return new Promise(async (resolve, reject) => {
            if(config.settings.autoFriends.ignoreFriends.includes(steamID)) {
                return reject(this.promiseResp(false, `SteamID ${steamID} is included in ignore list - not checking.`));
            }

            await new Promise(w => setTimeout(w, 2000)); // wait 2 secs cause steam suxs and is gay
            this.steamClient.getPersonas([steamID], async (err, personas) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get persona of steamID ${steamID}!`));
                }

                if(config.settings.autoFriends.checkVAC) {
                    await this.checkBan(steamID).then((res) => {
                        if(res) {
                            this.steamClient.removeFriend(steamID);
                            return resolve(this.promiseResp(true, `Removed ${steamID} from friendlist because it got 1 or more steam bans.`));
                        }
                    });
                }

                if((Math.floor((Date.now() / 1000) - (new Date(personas[`${steamID}`].last_seen_online) / 1000))) >= (1000*60*60*24*14) && config.settings.autoFriends.removeInactive) { // 14 days
                    this.steamClient.removeFriend(steamID);
                    return resolve(this.promiseResp(true, `Removed ${steamID} from friendlist because of inactivity!`));
                }

                this.steamClient.getSteamLevels([steamID], (err, level) => {
                    if(err) {
                        return reject(this.promiseResp(false, `Failed to get steam level of steamID ${steamID}!`));
                    }

                    if(level[`${steamID}`] < config.settings.autoFriends.minLevel && config.settings.autoFriends.removeUnderMinLevel) {
                        this.steamClient.removeFriend(steamID);
                        return resolve(this.promiseResp(true, `Removed ${steamID} from friendlist because level is under minLevel!`));
                    }
                });
            });
        });
    }

    /**
     * Check if user is has any bans on account.
     * @returns {Promise.<Boolean>|Promise.<Object>}
     */
    checkBan(steamID) {
        return new Promise((resolve, reject) => {
            request(`https://steamcommunity.com/profiles/${steamID}?xml=1`, {
                method: "GET",
                headers: {
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Host": "steamcommunity.com",
                    "Origin": "https://steamcommunity.com",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36"
                },
                json: true
            }, (err, response, body) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get profile object of steamID ${groupID}!`));
                }

                const $ = cheerio.load(body, {
                    xmlMode: true
                });

                if(Number($("vacBanned").text()) >= 1 || $("tradeBanState").text() != "None" || Number($("isLimitedAccount").text()) >= 1) {
                    resolve(true);
                }

                resolve(false);
            });
        });
    }

    /**
     * Get personaState of config entry.
     * @returns {Promise.<Number>}
     */
    getState() {
        return new Promise((resolve, reject) => {
            if(config.settings.hourboost.enabled && Object.keys(SteamUser.EPersonaState).find(k => SteamUser.EPersonaState[k] === config.settings.hourboost.personaState) || Object.keys(SteamUser.EPersonaState).find(k => SteamUser.EPersonaState[k] === config.settings.personaState)) {
                resolve(config.settings.hourboost.enabled ? Number(Object.keys(SteamUser.EPersonaState).find(k => SteamUser.EPersonaState[k] === config.settings.hourboost.personaState)) : Number(Object.keys(SteamUser.EPersonaState).find(k => SteamUser.EPersonaState[k] === config.settings.personaState)));
            } else {
                resolve(1);
            }
        });
    }

    /**
     * Get current game that account is playing.
     * @returns {Promise.<Number>|Promise.<Object>}
     */
    getCurrentGame() {
        return new Promise(async (resolve, reject) => {
            this.steamClient.setPersona(SteamUser.EPersonaState.Online);
            await new Promise(w => setTimeout(w, 2000)); // wait 2 secs cause steam suxs and is gay
            this.steamClient.getPersonas([this.steamClient.steamID], async (err, personas) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get persona of steamID ${this.steamClient.steamID}!`));
                }
                
                // let state = await this.getState();
                this.steamClient.setPersona(await this.getState());
                resolve(personas[`${this.steamClient.steamID}`].gameid);
            });
        });
    }

    /**
     * Get Steam `displayName` of parsed steamID.
     * @param {SteamID|String} - Either a SteamID object of the user to get the displayName, or a string which can parse into one.
     * @returns {Promise.<String>|Promise.<Object>}
     */
    getSteamName(steamID) {
        return new Promise((resolve, reject) => {
            this.steamClient.getPersonas([steamID], (err, personas) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get display name of steamID ${steamID}!`));
                }

                resolve(personas[`${steamID}`].player_name);
            });
        });
    }

    /**
     * Get user comments of parsed steam group.
     * @param {SteamID|String} - Either a SteamID object of the group to get the user comments, or a string which can parse into one.
     * @returns {Promise.<Array>|Promise.<Object>}
     */
    getComments(groupID) {
        return new Promise((resolve, reject) => {
            request(`https://steamcommunity.com/gid/${groupID}`, {
                method: "GET",
                headers: {
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Host": "steamcommunity.com",
                    "Origin": "https://steamcommunity.com",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36"
                },
                json: true
            }, (err, response, body) => {
                if(err) {
                    return reject(this.promiseResp(false, `Failed to get user comments of steam group ${groupID}!`));
                }

                const $ = cheerio.load(body);
                let array = [];
                $("html").find("bdi").each((i, e) => {
                    array.push($(e).text());
                });

                resolve(array);
            });
        });
    }

    /**
     * Post comments in defined steam groups.
     * @param {Array} - Array with steam group IDs to post comments in.
     * @param {String} - Message to post in steam group.
     * @returns {Promise.<String>|Promise.<Object>}
     */
    postComments(groups, message) {
        return new Promise((resolve, reject) => {
            if((Math.floor(Date.now() / 1000) - config.settings.autoPost.lastPost) >= (config.settings.autoPost.postInterval*60)) {
                config.settings.autoPost.lastPost = Math.floor(Date.now() / 1000);
                fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
            } else {
                return reject(this.promiseResp(false, `Failed to post comments in steam groups! (Timestamp too new)`));
            }

            let errord = 0, commented = 0;

            this.steamClient.webLogOn();

            this.steamClient.on("webSession", async (sessionID, cookies) => {
                cookies.forEach((cookie) => {
                    jar.setCookie(cookie, "https://steamcommunity.com");
                });

                groups.forEach(async (groupID, i) => {
                    let users = await this.getComments(groupID); 
                    let profileName = await this.getSteamName(this.steamClient.steamID);

                    if(users.includes(profileName)) {
                        return errord++;
                    }

                    request(`https://steamcommunity.com/comment/Clan/post/${groupID}/-1/`, {
                        method: "POST",
                        headers: {
                            "Accept": "*/*",
                            "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
                            "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "Host": "steamcommunity.com",
                            "Origin": "https://steamcommunity.com",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36"
                        },
                        form: {
                            "comment": message,
                            "count": message.length,
                            "sessionid": sessionID,
                            "feature2": -1
                        },
                        jar: jar,
                        json: true
                    }, (err, response, body) => {
                        if(err || !body || body && body.success == false) {
                            return errord++;
                        }

                        commented++;
                    });
                });

                this.steamClient.removeAllListeners("webSession");

                while ((errord + commented) < groups.length) {
                    await new Promise(p => setTimeout(p, 50));
                }
                
                resolve(this.promiseResp(true, "Posted successfully in "+(groups.length - errord)+"/"+groups.length+" steam groups."));
            });
        });
    }

    /**
     * Hourboost games on steam account.
     * @returns {Promise.<Boolean>|Promise.<Object>}
     */
    hourBoost() {
        return new Promise(async (resolve, reject) => {
            if(await this.getCurrentGame() == 0) {
                this.steamClient.gamesPlayed(config.settings.hourboost.games);
                return resolve(this.promiseResp(true, "Hourboosting "+config.settings.hourboost.games.length+" games!"));
            }

            this.steamClient.on("playingState", (blocked) => {
                this.steamClient.removeAllListeners("playingState");
                if(blocked == false) {
                    setTimeout(async () => {
                        if(await this.getCurrentGame() == 0) {
                            this.steamClient.gamesPlayed(config.settings.hourboost.games);
                            resolve(this.promiseResp(true, "Hourboosting "+config.settings.hourboost.games.length+" games!"));
                        } else {
                            this.hourBoost();
                        }
                    }, 5*6*1000);
                }
            });
        });
    }

    /**
     * Restart Heroku Dyno.
     * @returns {Promise.<Boolean>|Promise.<Object>}
     */
    restartDyno() {
        return new Promise((resolve, reject) => {
            request.delete(`https://api.heroku.com/apps/${config.settings.heroku.app}/dynos/`, {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.heroku+json; version=3",
                    "Authorization": `Bearer ${config.settings.heroku.token}`
                }
            }, (err, response, body) => {
                if(err) {
                    reject(this.promiseResp(false, "Failed to restart heroku dyno!"))
                    return this.restartDyno();
                }
                
                resolve(true);
            });
        });
    }

    /**
     * Just a little function to create responses. makes a lot easier / don't need to copy paste shit
     * @param {Boolean} success
     * @param {String} message
     * @returns {Object}
     */
    promiseResp(success = true, message = undefined) {
        return { success: success, message: message };
    }
}
