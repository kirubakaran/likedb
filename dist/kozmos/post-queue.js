"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scheduler_1 = require("./scheduler");
const sync_db_1 = require("./sync-db");
class PostQueue {
    constructor(servers, options) {
        this.servers = servers;
        this.retryInterval = options.postRetryIntervalSecs || 10;
        this.scheduler = new scheduler_1.default({
            interval: options.postIntervalSecs || 1.5,
            fn: () => this.post()
        });
        this.store = sync_db_1.default.store("updates", {
            indexes: ["queuedAt"]
        });
        this.scheduler.schedule();
    }
    add(updates, callback) {
        Promise.all(updates.map(update => this.store.add(update)))
            .catch(err => callback(err))
            .then(() => {
            this.scheduler.schedule();
            callback();
        });
    }
    all(callback) {
        const updates = [];
        this.store.all((error, row) => {
            if (error)
                return callback(error);
            if (!row)
                return callback(undefined, updates);
            updates.push(row.value);
            row.continue();
        });
    }
    post() {
        this.all((err, rows) => {
            if (err)
                return this.onError(err);
            if (rows.length === 0)
                return;
            console.log("Sending server %d updates, hold on...", rows.length);
            this.servers.post("/api/updates", { content: rows }, (err, result) => {
                if (err)
                    return this.onHTTPError(err);
                // Delete all rows from the store
                Promise.all(rows.map(row => this.store.delete(row.id))).catch(err => this.onError(err));
                if (this.servers.onPostUpdates) {
                    this.servers.onPostUpdates(result);
                }
            });
        });
    }
    onError(err) {
        this.servers.onError(err, "sync-queue");
    }
    onHTTPError(err) {
        this.servers.onError(err, "sync-request");
        this.scheduler.reschedule(this.retryInterval);
    }
}
exports.default = PostQueue;
