"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const indexeddb_1 = require("indexeddb");
const scheduler_1 = require("./scheduler");
const sync_db_1 = require("./sync-db");
// This class is for fetching new updates from Kozmos servers,
// and publishing them to user's offline database.
class PushForServers extends indexeddb_1.Push {
    constructor(servers, options) {
        super();
        this.servers = servers;
        this.scheduler = new scheduler_1.default({
            interval: options.pushIntervalSecs || 15,
            fn: () => this.checkForUpdates()
        });
        this.store = sync_db_1.default.store("pushlogs", {
            key: { autoIncrement: true, keyPath: "id" },
            indexes: ["id"]
        });
        this.scheduler.schedule();
    }
    checkForUpdates() {
        this.getPushLog((err, log) => {
            if (err) {
                this.scheduler.schedule();
                return this.onError(err);
            }
            const endpoint = "/api/updates/" + (log ? log.until : 0);
            this.servers.get(endpoint, (err, updates) => {
                if (err) {
                    this.scheduler.schedule();
                    return this.onError(err);
                }
                if (!updates || !updates.content || updates.content.length === 0)
                    return this.scheduler.schedule();
                this.sendUpdates(updates, err => {
                    if (err)
                        return this.onError(err);
                    setTimeout(() => this.scheduler.schedule(updates.has_more ? 1 : undefined), 0);
                });
            });
        });
    }
    sendUpdates(updates, callback) {
        this.publish(updates.content, (errors) => {
            if (errors)
                return callback(errors[0]);
            if (this.servers.onReceiveUpdates) {
                setTimeout(() => {
                    if (this.servers.onReceiveUpdates) {
                        this.servers.onReceiveUpdates(updates.content);
                    }
                }, 0);
            }
            this.updatePushLog(updates.until, callback);
        });
    }
    updatePushLog(until, callback) {
        this.getPushLog((err, log) => {
            if (!err && log) {
                log.until = until;
                return this.store.update(log, callback);
            }
            this.store.add({ until }, callback);
        });
    }
    getPushLog(callback) {
        this.store.all((err, result) => {
            if (err)
                return callback(err);
            if (!result)
                return callback();
            callback(undefined, result.value);
        });
    }
    onError(err) {
        this.servers.onError(err, "checking-updates");
    }
}
exports.default = PushForServers;
